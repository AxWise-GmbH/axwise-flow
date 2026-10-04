use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::common::{AnalysisArtifactReference, ArtifactReference, EvidenceSource, RevisionEdit, StepDepth};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactType {
    ProductPrd,
    SoftwarePrd,
}

impl Default for ArtifactType {
    fn default() -> Self {
        Self::ProductPrd
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemBasis {
    SourceStatement,
    OwnerDecision,
    Proposal,
    Gap,
    SimulationHypothesis,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrdItem {
    pub text: String,
    pub basis: ItemBasis,
    pub source_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub finding_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrdSection {
    pub heading: String,
    pub items: Vec<PrdItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrdCandidate {
    pub title: String,
    pub sections: Vec<PrdSection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrdInput {
    pub brief: String,
    #[serde(default)]
    pub depth: StepDepth,
    #[serde(default)]
    pub artifact_type: ArtifactType,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision_of: Option<ArtifactReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<EvidenceSource>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_artifact: Option<AnalysisArtifactReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub revision_edits: Vec<RevisionEdit>,
}
