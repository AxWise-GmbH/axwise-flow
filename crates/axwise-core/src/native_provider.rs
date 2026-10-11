//! Explicit BYOK access. Host mode does not inspect auth stores or make HTTP
//! requests; it uses the harness's own model/subscription instead.
use reqwest::Client;
use serde_json::{json, Value};
use std::{collections::HashMap, time::Duration};

pub struct NativeProvider {
    client: Client,
    kind: String,
    key: String,
    model: String,
    base: String,
}
impl NativeProvider {
    pub fn from_env() -> Result<Self, String> {
        let keys = [
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GEMINI_API_KEY",
            "GOOGLE_API_KEY",
        ]
        .into_iter()
        .filter_map(|k| {
            std::env::var(k)
                .ok()
                .filter(|v| !v.trim().is_empty())
                .map(|v| (k, v))
        })
        .collect::<HashMap<_, _>>();
        let kind = std::env::var("AXWISE_PROVIDER").unwrap_or_else(|_| {
            if keys.contains_key("OPENAI_API_KEY") {
                "openai"
            } else if keys.contains_key("ANTHROPIC_API_KEY") {
                "anthropic"
            } else {
                "gemini"
            }
            .into()
        });
        let (key, default_base) = match kind.as_str() {
            "openai" => (keys.get("OPENAI_API_KEY"), "https://api.openai.com/v1"),
            "anthropic" => (
                keys.get("ANTHROPIC_API_KEY"),
                "https://api.anthropic.com/v1",
            ),
            "gemini" => (
                keys.get("GEMINI_API_KEY")
                    .or_else(|| keys.get("GOOGLE_API_KEY")),
                "https://generativelanguage.googleapis.com/v1beta",
            ),
            _ => return Err("unsupported_api_provider".into()),
        };
        let key = key.ok_or("inherited_api_key_missing")?.clone();
        let model = std::env::var("AXWISE_MODEL")
            .ok()
            .filter(|m| !m.trim().is_empty())
            .ok_or("AXWISE_MODEL_required_for_api_key_mode")?;
        if !model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:/".contains(c))
            || model.contains("..")
        {
            return Err("invalid_model_name".into());
        }
        if kind == "gemini"
            && !matches!(
                model.trim_start_matches("models/"),
                "gemini-3.5-flash-lite" | "gemini-3.8-flash"
            )
        {
            return Err("unsupported_gemini_model".into());
        }
        let base = std::env::var("AXWISE_BASE_URL").unwrap_or_else(|_| default_base.into());
        let url = reqwest::Url::parse(&base).map_err(|_| "invalid_provider_origin")?;
        if !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || (url.scheme() != "https"
                && !(url.scheme() == "http"
                    && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))))
        {
            return Err("provider_requires_https_or_loopback".into());
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|_| "http_client_failed")?;
        Ok(Self {
            client,
            kind,
            key,
            model,
            base: base.trim_end_matches('/').into(),
        })
    }
    pub async fn complete(&self, request: &Value) -> Result<Value, String> {
        let system = request["systemPrompt"]
            .as_str()
            .ok_or("system_prompt_missing")?;
        let user = format!(
            "{}\n\nRequired JSON response schema:\n{}",
            request["userPrompt"]
                .as_str()
                .ok_or("user_prompt_missing")?,
            request["responseSchema"]
        );
        let budget = request["maxTokens"].as_u64().unwrap_or(16384).min(16384);
        let (endpoint, body) = match self.kind.as_str() {
            "openai" => (
                format!("{}/chat/completions", self.base),
                json!({"model":self.model,"messages":[{"role":"system","content":system},{"role":"user","content":user}],"max_completion_tokens":budget,"response_format":{"type":"json_object"}}),
            ),
            "anthropic" => (
                format!("{}/messages", self.base),
                json!({"model":self.model,"system":system,"messages":[{"role":"user","content":user}],"max_tokens":budget}),
            ),
            _ => (
                format!(
                    "{}/models/{}:generateContent",
                    self.base,
                    self.model.trim_start_matches("models/")
                ),
                json!({"systemInstruction":{"parts":[{"text":system}]},"contents":[{"role":"user","parts":[{"text":user}]}],"generationConfig":{"maxOutputTokens":budget,"responseMimeType":"application/json"}}),
            ),
        };
        let mut call = self.client.post(endpoint).json(&body);
        call = match self.kind.as_str() {
            "openai" => call.bearer_auth(&self.key),
            "anthropic" => call
                .header("x-api-key", &self.key)
                .header("anthropic-version", "2023-06-01"),
            _ => call.header("x-goog-api-key", &self.key),
        };
        // Errors deliberately omit URLs, headers, provider bodies and credentials.
        let mut response = call.send().await.map_err(|_| "model_network_failed")?;
        if !response.status().is_success() {
            return Err(format!("model_http_status_{}", response.status().as_u16()));
        }
        if !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json"))
        {
            return Err("model_invalid_content_type".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "model_response_failed")?
        {
            if bytes.len() + chunk.len() > crate::native::MAX_BYTES {
                return Err("model_response_too_large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&bytes).map_err(|_| "model_invalid_json")?;
        let text = match self.kind.as_str() {
            "openai" => {
                if data["choices"].as_array().is_none_or(|v| v.len() != 1)
                    || data["choices"][0]["finish_reason"] != "stop"
                {
                    return Err("model_incomplete_response".into());
                }
                data["choices"][0]["message"]["content"]
                    .as_str()
                    .ok_or("model_text_missing")?
                    .to_owned()
            }
            "anthropic" => {
                if data["stop_reason"] != "end_turn" {
                    return Err("model_incomplete_response".into());
                }
                data["content"]
                    .as_array()
                    .ok_or("model_text_missing")?
                    .iter()
                    .filter(|v| v["type"] == "text")
                    .filter_map(|v| v["text"].as_str())
                    .collect::<String>()
            }
            _ => {
                if data["candidates"].as_array().is_none_or(|v| v.len() != 1)
                    || data["candidates"][0]["finishReason"] != "STOP"
                {
                    return Err("model_incomplete_response".into());
                }
                data["candidates"][0]["content"]["parts"]
                    .as_array()
                    .ok_or("model_text_missing")?
                    .iter()
                    .filter(|v| v["thought"] != true)
                    .filter_map(|v| v["text"].as_str())
                    .collect::<String>()
            }
        };
        serde_json::from_str(crate::clean_json_completion(&text))
            .map_err(|_| "model_candidate_invalid_json".into())
    }
}
