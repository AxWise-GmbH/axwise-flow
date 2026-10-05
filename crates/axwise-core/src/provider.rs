use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderType {
    OpenAi,
    Anthropic,
    Gemini,
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
    for key in &["OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "AXWISE_API_KEY"] {
        if let Ok(val) = env::var(key) {
            if !val.trim().is_empty() {
                keys.insert(key.to_string(), val.trim().to_string());
            }
        }
    }

    // 2. macOS Keychain (Goose secrets)
    if !keys.contains_key("OPENAI_API_KEY") || !keys.contains_key("GEMINI_API_KEY") {
        if let Ok(output) = Command::new("security")
            .args(["find-generic-password", "-s", "goose", "-a", "secrets", "-w"])
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
}

impl ModelProvider {
    pub fn new(
        provider_type: ProviderType,
        api_key: String,
        base_url: Option<String>,
        model: String,
    ) -> Self {
        let default_base = match provider_type {
            ProviderType::OpenAi => "https://api.openai.com/v1",
            ProviderType::Anthropic => "https://api.anthropic.com/v1",
            ProviderType::Gemini => "https://generativelanguage.googleapis.com/v1beta",
        };

        let base_url = base_url.unwrap_or_else(|| default_base.to_string());
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            provider_type,
            api_key,
            base_url,
            model,
        }
    }

    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, ProviderError> {
        match self.provider_type {
            ProviderType::OpenAi => self.complete_openai(system_prompt, user_prompt, max_tokens).await,
            ProviderType::Anthropic => self.complete_anthropic(system_prompt, user_prompt, max_tokens).await,
            ProviderType::Gemini => self.complete_gemini(system_prompt, user_prompt, max_tokens).await,
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

        let response = self.client
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
            .ok_or_else(|| ProviderError::Incomplete("Missing choices.message.content".to_string()))?;

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

        let response = self.client
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
        let endpoint = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url.trim_end_matches('/'),
            self.model,
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
                "maxOutputTokens": max_tokens,
                "temperature": 0.2
            }
        });

        let response = self.client
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
            .ok_or_else(|| ProviderError::Incomplete("Missing candidates[0].content.parts[0].text".to_string()))?;

        Ok(clean_json_completion(content).to_string())
    }
}
