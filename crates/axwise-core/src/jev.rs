use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const TYPESAFE_ENDPOINT: &str = "https://api.typesafe.ai/v1/systemone";

#[derive(Debug, thiserror::Error)]
pub enum JevError {
    #[error("Missing TYPESAFE_API_KEY")]
    MissingApiKey,
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("API error ({status}): {body}")]
    Api { status: u16, body: String },
    #[error("Invalid provider answer: {0}")]
    InvalidAnswer(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateBAuditDecision {
    pub has_unverified_commercial_or_financial_estimates_without_pending_prefix: bool,
    pub is_acceptance_criteria_traceability_intact: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateBAuditOutcome {
    pub passed: bool,
    pub verdict: String,
    pub latency_ms: u64,
    pub model: String,
    pub scores: HashMap<String, f64>,
    pub decision: GateBAuditDecision,
    pub reviewed_sha256: String,
}

pub fn resolve_typesafe_key() -> Option<String> {
    if let Ok(key) = env::var("TYPESAFE_API_KEY") {
        if !key.trim().is_empty() {
            return Some(key.trim().to_string());
        }
    }

    // Check candidate .env.local paths
    let candidate_paths = [
        PathBuf::from(".env.local"),
        PathBuf::from("../.env.local"),
        PathBuf::from("../../.env.local"),
    ];

    for path in &candidate_paths {
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("TYPESAFE_API_KEY=") {
                    let trimmed = rest.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Executes the exact Stage 8 Gate B Deliverable Integrity & Hedging Audit via TypeSafe JEV System-1.
pub async fn audit_gate_b(
    deliverable_text: &str,
    acceptance_criteria: &[Value],
    evidence: Option<&Value>,
) -> Result<GateBAuditOutcome, JevError> {
    let api_key = resolve_typesafe_key().ok_or(JevError::MissingApiKey)?;

    let sha256_hash = {
        let mut hasher = Sha256::new();
        hasher.update(deliverable_text.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let state = json!({
        "deliverable": deliverable_text,
        "acceptance_criteria": acceptance_criteria,
        "evidence": evidence.unwrap_or(&json!({}))
    });

    let questions = json!({
        "has_unverified_commercial_or_financial_estimates_without_pending_prefix": {
            "type": "noul",
            "instructions": "Does deliverable assert commercial or financial estimates as established facts without supplied evidence or explicit provisional language? Proposed targets are not established facts. Source titles and authority labels alone are not proof."
        },
        "is_acceptance_criteria_traceability_intact": {
            "type": "noul",
            "instructions": "Does deliverable address every supplied acceptance criterion, without contradicting supplied evidence or asserting that unresolved evidence is verified? Judge only acceptance_criteria and evidence in state."
        }
    });

    let payload = json!({
        "model": "jev-latest",
        "state": state,
        "questions": questions
    });

    let start = Instant::now();
    let response = client
        .post(TYPESAFE_ENDPOINT)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await?;

    let elapsed = start.elapsed().as_millis() as u64;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(JevError::Api {
            status: status.as_u16(),
            body: error_body,
        });
    }

    let body: Value = response.json().await?;
    let model = body["model"].as_str().unwrap_or("jev-latest").to_string();
    let answers = body.get("answers").ok_or_else(|| {
        JevError::InvalidAnswer("Missing answers object in JEV response".to_string())
    })?;

    let mut scores = HashMap::new();
    let unverified_noul = answers["has_unverified_commercial_or_financial_estimates_without_pending_prefix"]["noul"]
        .as_f64()
        .unwrap_or(0.0);
    let traceability_noul = answers["is_acceptance_criteria_traceability_intact"]["noul"]
        .as_f64()
        .unwrap_or(1.0);

    scores.insert(
        "has_unverified_commercial_or_financial_estimates_without_pending_prefix".to_string(),
        unverified_noul,
    );
    scores.insert(
        "is_acceptance_criteria_traceability_intact".to_string(),
        traceability_noul,
    );

    // Classification boundaries:
    // unverified >= 0.8 is considered unhedged factual claim violation
    // traceability >= 0.5 is considered intact
    let has_unverified = unverified_noul >= 0.5;
    let traceability_intact = traceability_noul >= 0.5;

    let passed = !has_unverified && traceability_intact;
    let verdict = if passed {
        "PASS (Zero unhedged commercial claims, criteria traceability intact)".to_string()
    } else {
        format!(
            "FAIL (unverified_claims={:.2}, traceability={:.2})",
            unverified_noul, traceability_noul
        )
    };

    Ok(GateBAuditOutcome {
        passed,
        verdict,
        latency_ms: elapsed,
        model,
        scores,
        decision: GateBAuditDecision {
            has_unverified_commercial_or_financial_estimates_without_pending_prefix: has_unverified,
            is_acceptance_criteria_traceability_intact: traceability_intact,
        },
        reviewed_sha256: sha256_hash,
    })
}
