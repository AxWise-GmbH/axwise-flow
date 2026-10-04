use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::common::{ArtifactReference, EvidenceSource, StepDepth};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSelection {
    pub passage_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PersonaClaimBasis {
    SourceStatement,
    Interpretation,
    SimulationHypothesis,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaClaimDraft {
    pub text: String,
    pub basis: PersonaClaimBasis,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<EvidenceSelection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaProfileClaimDraft {
    pub text: String,
    pub basis: PersonaClaimBasis,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<EvidenceSelection>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PersonaDraftBasis {
    EvidenceInformedHypothesis,
    ScenarioHypothesis,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaDraft {
    pub id: String,
    pub stakeholder_id: String,
    pub label: String,
    pub description: String,
    pub origin: String,
    pub basis: PersonaDraftBasis,
    pub motivations: Vec<PersonaProfileClaimDraft>,
    pub pain_points: Vec<PersonaProfileClaimDraft>,
    pub traits: Vec<PersonaClaimDraft>,
    pub communication_style: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locality: Option<String>,
    pub assumptions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaCandidate {
    pub personas: Vec<PersonaDraft>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaRole {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(default = "default_participants")]
    pub participants: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locality: Option<String>,
}

fn default_participants() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePersonasInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brief: Option<String>,
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<EvidenceSource>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stakeholders: Vec<PersonaRole>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonaChatCandidate {
    pub persona_id: String,
    pub origin: String,
    pub basis: String,
    pub response: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<EvidenceSelection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChatWithPersonaInput {
    pub persona_id: String,
    pub message: String,
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_reference: Option<ArtifactReference>,
}
