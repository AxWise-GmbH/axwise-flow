use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::time::Instant;

#[derive(Debug, thiserror::Error)]
pub enum JevError {
    #[error("Missing authenticated managed audit gateway credentials")]
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

pub async fn audit_gate_b(
    deliverable_text: &str,
    acceptance_criteria: &[Value],
    evidence: Option<&Value>,
) -> Result<GateBAuditOutcome, JevError> {
    let scope = crate::scope::HostScope::resolve(
        None,
        env::var("AXWISE_ACCOUNT_HASH")
            .or_else(|_| env::var("ORQALY_ACCOUNT_HASH"))
            .ok(),
        env::var("AXWISE_SESSION_ID").ok(),
        &json!({}),
    )
    .map_err(JevError::InvalidAnswer)?;
    audit_gate_b_in_scope(&scope, deliverable_text, acceptance_criteria, evidence).await
}

pub async fn audit_gate_b_in_scope(
    scope: &crate::scope::HostScope,
    deliverable_text: &str,
    acceptance_criteria: &[Value],
    evidence: Option<&Value>,
) -> Result<GateBAuditOutcome, JevError> {
    let token = env::var("AXWISE_ACCOUNT_TOKEN")
        .or_else(|_| env::var("ORQALY_ACCOUNT_TOKEN"))
        .map_err(|_| JevError::MissingApiKey)?;
    let base = env::var("AXWISE_GATEWAY_URL")
        .or_else(|_| env::var("ORQALY_GATEWAY_URL"))
        .map_err(|_| JevError::MissingApiKey)?;
    audit_gate_b_with_credentials(
        scope,
        deliverable_text,
        acceptance_criteria,
        evidence,
        &token,
        &base,
    )
    .await
}

/// Credentials are supplied by the host connector, never by model arguments.
pub async fn audit_gate_b_with_credentials(
    scope: &crate::scope::HostScope,
    deliverable_text: &str,
    acceptance_criteria: &[Value],
    evidence: Option<&Value>,
    token: &str,
    base: &str,
) -> Result<GateBAuditOutcome, JevError> {
    let url = reqwest::Url::parse(base).map_err(|e| JevError::InvalidAnswer(e.to_string()))?;
    if url.scheme() != "https" && !(url.scheme() == "http" && url.host_str() == Some("127.0.0.1")) {
        return Err(JevError::InvalidAnswer(
            "audit requires HTTPS or the trusted loopback relay".into(),
        ));
    }
    let sha256_hash = format!("{:x}", Sha256::digest(deliverable_text.as_bytes()));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()?;
    let start = Instant::now();
    let mut response = client
        .post(format!(
            "{}/desktop/v1/axwise/audit",
            base.trim_end_matches('/')
        ))
        .bearer_auth(token)
        .header("X-Orqaly-Account-Hash", &scope.account)
        .json(&json!({
            "account": scope.account, "session": scope.session,
            "deliverable": deliverable_text, "acceptance_criteria": acceptance_criteria,
            "evidence": evidence.unwrap_or(&json!({})),
        }))
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        return Err(JevError::Api {
            status: status.as_u16(),
            body: "managed audit unavailable".into(),
        });
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > 16 * 1024 {
            return Err(JevError::InvalidAnswer("audit response too large".into()));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: Value = serde_json::from_slice(&bytes)?;
    decode_audit_reply(
        &body,
        scope,
        &sha256_hash,
        start.elapsed().as_millis() as u64,
    )
}

pub fn decode_audit_reply(
    body: &Value,
    scope: &crate::scope::HostScope,
    sha256_hash: &str,
    elapsed: u64,
) -> Result<GateBAuditOutcome, JevError> {
    if body.get("account").and_then(Value::as_str) != Some(scope.account.as_str())
        || body.get("session").and_then(Value::as_str) != Some(scope.session.as_str())
        || body.get("reviewed_sha256").and_then(Value::as_str) != Some(sha256_hash)
    {
        return Err(JevError::InvalidAnswer(
            "audit scope or digest mismatch".into(),
        ));
    }
    let model = body["model"]
        .as_str()
        .ok_or_else(|| JevError::InvalidAnswer("missing audit model".into()))?
        .to_string();
    let mut scores = HashMap::new();
    let read_score = |name: &str| -> Result<f64, JevError> {
        body["answers"][name]["noul"]
            .as_f64()
            .filter(|score| score.is_finite() && (0.0..=1.0).contains(score))
            .ok_or_else(|| {
                JevError::InvalidAnswer(format!("missing or invalid audit score: {name}"))
            })
    };
    let unverified_noul =
        read_score("has_unverified_commercial_or_financial_estimates_without_pending_prefix")?;
    let traceability_noul = read_score("is_acceptance_criteria_traceability_intact")?;

    scores.insert(
        "has_unverified_commercial_or_financial_estimates_without_pending_prefix".to_string(),
        unverified_noul,
    );
    scores.insert(
        "is_acceptance_criteria_traceability_intact".to_string(),
        traceability_noul,
    );

    // Classification boundaries:
    // unverified >= 0.5 is considered unhedged factual claim violation
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
        reviewed_sha256: sha256_hash.to_owned(),
    })
}
