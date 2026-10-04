use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::common::{ArtifactReference, StepDepth};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcceptanceTest {
    pub given: String,
    pub when: String,
    pub then: String,
    pub evidence_expected: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RequirementCoverage {
    pub requirement_id: String,
    pub acceptance_tests: Vec<AcceptanceTest>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConditionStatus {
    Covered,
    Deferred,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConditionCoverage {
    pub condition_id: String,
    pub status: ConditionStatus,
    pub requirement_id: Option<String>,
    pub acceptance_test_index: Option<u32>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub title: String,
    pub requirement_ids: Vec<String>,
    pub deliverable: String,
    pub exit_condition: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub description: String,
    pub requirement_ids: Vec<String>,
    pub resolution: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryCandidate {
    pub title: String,
    pub requirements: Vec<RequirementCoverage>,
    pub condition_coverage: Vec<ConditionCoverage>,
    pub milestones: Vec<Milestone>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<Dependency>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proposed_exclusions: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub open_questions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryInput {
    #[serde(default = "default_delivery_brief")]
    pub brief: String,
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub requirement_ids: Vec<String>,
}

fn default_delivery_brief() -> String {
    "Prepare a proposed development handoff from the selected PRD.".to_string()
}
