use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::common::{ArtifactReference, StepDepth};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisParticipantRefV1 {
    pub document_id: String,
    pub participant_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FindingCategory {
    Job,
    Pain,
    Goal,
    Need,
    Trait,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FindingBasis {
    SourceStatement,
    Interpretation,
    SimulationHypothesis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SupportStatus {
    Supported,
    Insufficient,
    Conflicting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisFindingCandidateV1 {
    pub key: String,
    pub category: FindingCategory,
    pub statement: String,
    pub basis: FindingBasis,
    pub support_status: SupportStatus,
    pub quote_keys: Vec<String>,
    pub question_ids: Vec<String>,
    pub participant_refs: Vec<AnalysisParticipantRefV1>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GapCode {
    InsufficientEvidence,
    ConflictingEvidence,
    MissingParticipantTurns,
    UnansweredQuestion,
    NoSupportedOutput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisOutputKind {
    Personas,
    JobsPains,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisGapV1 {
    pub code: GapCode,
    pub question_id: Option<String>,
    pub participant_ref: Option<AnalysisParticipantRefV1>,
    pub output: Option<AnalysisOutputKind>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisPersonaCandidateV1 {
    pub participant_ref: AnalysisParticipantRefV1,
    pub display_label: String,
    pub trait_finding_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisQuoteCandidateV1 {
    pub key: String,
    pub document_id: String,
    pub turn_id: String,
    pub participant_id: String,
    pub start: u32,
    pub end: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisCandidateV1 {
    pub quotes: Vec<AnalysisQuoteCandidateV1>,
    pub findings: Vec<AnalysisFindingCandidateV1>,
    pub personas: Vec<AnalysisPersonaCandidateV1>,
    pub gaps: Vec<AnalysisGapV1>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptOrigin {
    SuppliedTranscript,
    SyntheticTranscript,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TurnRole {
    Participant,
    Interviewer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SelectedTurn {
    pub speaker: String,
    pub role: TurnRole,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub question_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SelectedTranscript {
    pub id: String,
    pub title: String,
    pub origin: TranscriptOrigin,
    pub turns: Vec<SelectedTurn>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisViewKind {
    Themes,
    Patterns,
    Stakeholders,
    Sentiment,
    Insights,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisInput {
    pub decision_question: String,
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub questions: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transcripts: Vec<SelectedTranscript>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub outputs: Vec<AnalysisOutputKind>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub views: Vec<AnalysisViewKind>,
}
