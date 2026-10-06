use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::prompts::{BOUNDARY_PROMPT, REVIEW_PROMPT};
use crate::wire::{canonical_hash, canonical_json, WireError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCheck {
    pub criterion: String,
    pub passed: bool,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCandidate {
    pub checks: Vec<ReviewCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewOutcome {
    pub passed: bool,
    pub issues: Vec<String>,
    pub review: ReviewCandidate,
    pub review_hash: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ReviewError {
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Wire error: {0}")]
    Wire(#[from] WireError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub fn get_tool_criteria(tool: &str) -> &'static [&'static str] {
    match tool {
        "analyze_interviews" => &[
            "answers_requested_questions",
            "cross_source_synthesis",
            "genuine_tensions",
            "evidence_gaps",
            "actionability",
            "source_fidelity",
            "synthetic_identity",
        ],
        "create_prd" => &[
            "answers_requested_questions",
            "genuine_tensions",
            "evidence_gaps",
            "actionability",
            "source_fidelity",
            "synthetic_identity",
            "requirements_and_acceptance",
            "metrics_and_validation",
        ],
        _ => &[
            "answers_requested_questions",
            "evidence_gaps",
            "actionability",
            "source_fidelity",
            "synthetic_identity",
        ],
    }
}

pub struct PreparedReviewPrompt {
    pub system_prompt: String,
    pub user_prompt: String,
    pub response_schema: Value,
    pub required_criteria: Vec<String>,
}

pub fn prepare_review(
    tool: &str,
    selected_evidence: &Value,
    candidate_artifact: &Value,
) -> Result<PreparedReviewPrompt, ReviewError> {
    let required_criteria: Vec<String> = get_tool_criteria(tool)
        .iter()
        .map(|s| s.to_string())
        .collect();

    let payload = json!({
        "selectedEvidence": selected_evidence,
        "candidateArtifact": candidate_artifact,
        "requiredCriteria": required_criteria,
    });

    let system_prompt = format!(
        "{}\n{}\n{}",
        BOUNDARY_PROMPT,
        REVIEW_PROMPT,
        "\nUnder actionability/source_fidelity, check every original acceptance condition: a covered mapping must really test its exact constraint; a deferred condition must retain the exact text and explicit reason, never disappear."
    );

    let schema = serde_json::to_value(schemars::schema_for!(ReviewCandidate))?;

    Ok(PreparedReviewPrompt {
        system_prompt,
        user_prompt: canonical_json(&payload)?,
        response_schema: schema,
        required_criteria,
    })
}

pub fn validate_review(tool: &str, review_response: &str) -> Result<ReviewOutcome, ReviewError> {
    let review: ReviewCandidate = serde_json::from_str(review_response)?;
    let expected_criteria: HashSet<&str> = get_tool_criteria(tool).iter().copied().collect();

    let actual_criteria: HashSet<&str> =
        review.checks.iter().map(|c| c.criterion.as_str()).collect();

    if actual_criteria != expected_criteria || review.checks.len() != expected_criteria.len() {
        return Err(ReviewError::Validation(
            "review must cover every criterion exactly once".to_string(),
        ));
    }

    let mut issues = Vec::new();
    for check in &review.checks {
        if !check.passed {
            issues.push(check.criterion.clone());
        }
    }

    let passed = issues.is_empty();
    let review_value = serde_json::to_value(&review)?;
    let review_hash = canonical_hash(&json!({
        "tool": tool,
        "review": review_value
    }))?;

    Ok(ReviewOutcome {
        passed,
        issues,
        review,
        review_hash,
    })
}

/// 2-Stage Critique/Repair State Machine
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PipelineState {
    Initial,
    Generated,
    ValidatedPass,
    ValidatedDefect(Vec<String>),
    ReviewPass,
    ReviewDefect(Vec<String>),
    Repaired,
    FinalReviewPass,
    TerminalFailure(String),
}

pub struct TwoStageReviewEngine {
    pub state: PipelineState,
    pub repair_attempts: u32,
    pub max_repairs: u32,
}

impl Default for TwoStageReviewEngine {
    fn default() -> Self {
        Self {
            state: PipelineState::Initial,
            repair_attempts: 0,
            max_repairs: 1,
        }
    }
}

impl TwoStageReviewEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on_generation(&mut self) {
        self.state = PipelineState::Generated;
    }

    pub fn on_local_validation(&mut self, defects: Vec<String>) -> Result<(), &'static str> {
        if defects.is_empty() {
            self.state = PipelineState::ValidatedPass;
            Ok(())
        } else if self.repair_attempts >= self.max_repairs {
            self.state = PipelineState::TerminalFailure(
                "Validation defects exceed maximum repair attempts".to_string(),
            );
            Err("Terminal failure: validation defect on repaired candidate")
        } else {
            self.repair_attempts += 1;
            self.state = PipelineState::ValidatedDefect(defects);
            Ok(())
        }
    }

    pub fn on_review_outcome(&mut self, outcome: &ReviewOutcome) -> Result<(), &'static str> {
        if outcome.passed {
            if self.repair_attempts == 0 {
                self.state = PipelineState::ReviewPass;
            } else {
                self.state = PipelineState::FinalReviewPass;
            }
            Ok(())
        } else if self.repair_attempts >= self.max_repairs {
            self.state = PipelineState::TerminalFailure(
                "Quality review failed on final repair attempt".to_string(),
            );
            Err("Terminal failure: final review failed")
        } else {
            self.repair_attempts += 1;
            self.state = PipelineState::ReviewDefect(outcome.issues.clone());
            Ok(())
        }
    }
}
