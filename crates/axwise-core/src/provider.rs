use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderType {
    OpenAi,
    Anthropic,
    Gemini,
    DesktopGateway,
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("API error ({status}): {body}")]
    Api { status: u16, body: String },
    #[error("Missing API key")]
    MissingApiKey,
    #[error("Incomplete response: {0}")]
    Incomplete(String),
}

/// Strips markdown code fences (e.g. ```json ... ```) from model completions.
pub fn clean_json_completion(raw: &str) -> &str {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim();
        }
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim();
        }
    }
    trimmed
}

/// Discovers local credentials from environment, macOS Keychain (Goose secrets), and Codex auth.
pub fn discover_credentials() -> HashMap<String, String> {
    let mut keys = HashMap::new();

    // 1. Environment variables
    for key in &[
        "OPENAI_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "ANTHROPIC_API_KEY",
        "AXWISE_API_KEY",
        "AXWISE_ACCOUNT_TOKEN",
        "ORQALY_ACCOUNT_TOKEN",
        "AXWISE_ACCOUNT_HASH",
        "ORQALY_ACCOUNT_HASH",
        "AXWISE_GATEWAY_URL",
        "ORQALY_GATEWAY_URL",
    ] {
        if let Ok(val) = env::var(key) {
            if !val.trim().is_empty() {
                keys.insert(key.to_string(), val.trim().to_string());
            }
        }
    }

    // 2. macOS Keychain (Goose secrets)
    if !keys.contains_key("OPENAI_API_KEY") || !keys.contains_key("GEMINI_API_KEY") {
        if let Ok(output) = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "goose",
                "-a",
                "secrets",
                "-w",
            ])
            .output()
        {
            if output.status.success() {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(stdout.trim()) {
                        if let Some(obj) = parsed.as_object() {
                            for (k, v) in obj {
                                if let Some(s) = v.as_str() {
                                    if !s.trim().is_empty() && !keys.contains_key(k) {
                                        keys.insert(k.clone(), s.trim().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Local Codex configuration
    if !keys.contains_key("OPENAI_API_KEY") {
        if let Some(home) = dirs_home() {
            let codex_path = home.join(".codex").join("auth.json");
            if codex_path.is_file() {
                if let Ok(content) = fs::read_to_string(&codex_path) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                        if let Some(key) = parsed.get("OPENAI_API_KEY").and_then(|v| v.as_str()) {
                            if !key.trim().is_empty() {
                                keys.insert("OPENAI_API_KEY".to_string(), key.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    keys
}

fn dirs_home() -> Option<PathBuf> {
    env::var("HOME").ok().map(PathBuf::from)
}

pub struct ModelProvider {
    client: reqwest::Client,
    pub provider_type: ProviderType,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub account_hash: Option<String>,
}

impl ModelProvider {
    pub fn new(
        provider_type: ProviderType,
        api_key: String,
        base_url: Option<String>,
        model: String,
    ) -> Self {
        Self::with_account_hash(provider_type, api_key, base_url, model, None)
    }

    pub fn with_account_hash(
        provider_type: ProviderType,
        api_key: String,
        base_url: Option<String>,
        model: String,
        account_hash: Option<String>,
    ) -> Self {
        let default_base = match provider_type {
            ProviderType::OpenAi => "https://api.openai.com/v1",
            ProviderType::Anthropic => "https://api.anthropic.com/v1",
            ProviderType::Gemini => "https://generativelanguage.googleapis.com/v1beta",
            ProviderType::DesktopGateway => "http://127.0.0.1:4545",
        };

        let base_url = base_url.unwrap_or_else(|| default_base.to_string());
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            provider_type,
            api_key,
            base_url,
            model,
            account_hash,
        }
    }

    /// Strict structured completion used by the production specialist. Schema
    /// compilation hints never replace the deterministic publication validator.
    pub async fn complete_prepared(
        &self,
        system: &str,
        user: &str,
        budget: u32,
        schema: &Value,
    ) -> Result<String, ProviderError> {
        if self.provider_type != ProviderType::DesktopGateway {
            return Err(ProviderError::Incomplete(
                "Signed-in gateway required".into(),
            ));
        }
        let mut response = self.client.post(format!("{}/desktop/v1/chat/completions", self.base_url.trim_end_matches('/')))
            .bearer_auth(&self.api_key)
            .header("X-Orqaly-Account-Hash", self.account_hash.as_deref().unwrap_or(""))
            .json(&json!({"model":self.model,"stream":false,"store":false,"reasoning_effort":"low","max_completion_tokens":budget,
                "messages":[{"role":"system","content":system},{"role":"user","content":user}],
                "response_format":{"type":"json_schema","json_schema":{"name":"axwise_specialist_artifact","strict":true,"schema":schema}}}))
            .send().await?;
        if !response.status().is_success() {
            return Err(ProviderError::Api {
                status: response.status().as_u16(),
                body: "Managed inference unavailable".into(),
            });
        }
        if response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| !v.starts_with("application/json"))
        {
            return Err(ProviderError::Incomplete("Invalid response type".into()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 1_048_576 {
                return Err(ProviderError::Incomplete(
                    "Response exceeded byte budget".into(),
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&bytes)?;
        let choices = data["choices"]
            .as_array()
            .filter(|v| v.len() == 1)
            .ok_or_else(|| ProviderError::Incomplete("Expected one choice".into()))?;
        let choice = &choices[0];
        if choice["finish_reason"] != "stop"
            || choice["message"]["tool_calls"]
                .as_array()
                .is_some_and(|v| !v.is_empty())
        {
            return Err(ProviderError::Incomplete(
                "Incomplete structured completion".into(),
            ));
        }
        choice["message"]["content"]
            .as_str()
            .filter(|v| !v.trim().is_empty())
            .map(str::to_owned)
            .ok_or_else(|| ProviderError::Incomplete("Missing structured completion".into()))
    }

    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        match self.provider_type {
            ProviderType::OpenAi => {
                self.complete_openai(system_prompt, user_prompt, max_tokens)
                    .await
            }
            ProviderType::Anthropic => {
                self.complete_anthropic(system_prompt, user_prompt, max_tokens)
                    .await
            }
            ProviderType::Gemini => {
                self.complete_gemini(system_prompt, user_prompt, max_tokens)
                    .await
            }
            ProviderType::DesktopGateway => {
                self.complete_desktop_gateway(system_prompt, user_prompt, max_tokens)
                    .await
            }
        }
    }

    async fn complete_openai(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        let endpoint = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let body = json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": 0.2
        });

        let response = self
            .client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Api {
                status: status.as_u16(),
                body: error_text,
            });
        }

        let data: Value = response.json().await?;
        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| {
                ProviderError::Incomplete("Missing choices.message.content".to_string())
            })?;

        Ok(clean_json_completion(content).to_string())
    }

    async fn complete_anthropic(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        let endpoint = format!("{}/messages", self.base_url.trim_end_matches('/'));

        let body = json!({
            "model": self.model,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": 0.2
        });

        let response = self
            .client
            .post(&endpoint)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Api {
                status: status.as_u16(),
                body: error_text,
            });
        }

        let data: Value = response.json().await?;
        let content = data["content"][0]["text"]
            .as_str()
            .ok_or_else(|| ProviderError::Incomplete("Missing content[0].text".to_string()))?;

        Ok(clean_json_completion(content).to_string())
    }

    async fn complete_gemini(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        if !matches!(
            self.model.trim_start_matches("models/"),
            "gemini-3.5-flash-lite" | "gemini-3.8-flash"
        ) {
            return Err(ProviderError::Incomplete(
                "Unsupported Gemini model; use gemini-3.5-flash-lite or gemini-3.8-flash".into(),
            ));
        }
        let endpoint = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url.trim_end_matches('/'),
            self.model.trim_start_matches("models/"),
            self.api_key
        );

        let body = json!({
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": user_prompt}]}
            ],
            "generationConfig": {
                "maxOutputTokens": max_tokens
            }
        });

        let response = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Api {
                status: status.as_u16(),
                body: error_text,
            });
        }

        let data: Value = response.json().await?;
        let content = data["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or_else(|| {
                ProviderError::Incomplete("Missing candidates[0].content.parts[0].text".to_string())
            })?;

        Ok(clean_json_completion(content).to_string())
    }

    async fn complete_desktop_gateway(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        let endpoint = format!(
            "{}/desktop/v1/chat/completions",
            self.base_url.trim_end_matches('/')
        );

        let body = json!({
            "model": self.model,
            "stream": false,
            "store": false,
            "max_tokens": max_tokens,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        });

        let mut req = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.api_key));

        if let Some(ref hash) = self.account_hash {
            req = req.header("X-Orqaly-Account-Hash", hash);
        }

        let response = req.json(&body).send().await?;
        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Api {
                status: status.as_u16(),
                body: error_text,
            });
        }

        let data: Value = response.json().await?;
        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| {
                ProviderError::Incomplete("Missing choices[0].message.content".to_string())
            })?;

        Ok(clean_json_completion(content).to_string())
    }
}
