use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::common::{ArtifactReference, StepDepth};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationAnswerV1 {
    pub question_id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationInterviewV1 {
    pub participant_id: String,
    pub answers: Vec<SimulationAnswerV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationOceanV1 {
    pub openness: u32,
    pub conscientiousness: u32,
    pub extraversion: u32,
    pub agreeableness: u32,
    pub neuroticism: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationParticipantV1 {
    pub participant_id: String,
    pub stakeholder_id: String,
    pub slot_index: u32,
    pub country_code: Option<String>,
    pub locality: Option<String>,
    pub ocean_micros: SimulationOceanV1,
    pub display_name: String,
    pub biography: String,
    pub motivations: Vec<String>,
    pub pain_points: Vec<String>,
    pub communication_style: String,
    pub origin: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationCandidateV1 {
    pub participants: Vec<SimulationParticipantV1>,
    pub interviews: Vec<SimulationInterviewV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SelectedStakeholder {
    pub id: String,
    pub label: String,
    pub description: String,
    pub questions: Vec<String>,
    #[serde(default = "default_stakeholder_participants")]
    pub participants: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locality: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub question_ids: Vec<String>,
}

fn default_stakeholder_participants() -> u32 {
    1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SimulationResponseStyle {
    Realistic,
    Optimistic,
    Critical,
    #[default]
    Mixed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimulationInput {
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scenario: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_audience: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub problem: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stakeholders: Vec<SelectedStakeholder>,
    #[serde(default)]
    pub seed: u64,
    #[serde(default)]
    pub response_style: SimulationResponseStyle,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
}
