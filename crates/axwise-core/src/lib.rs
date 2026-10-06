pub mod analysis;
pub mod common;
pub mod delivery;
pub mod discovery;
pub mod goose_extension;
pub mod jev;
pub mod personas;
pub mod prd;
pub mod prompts;
pub mod provider;
pub mod review_engine;
pub mod simulation;
pub mod simulation_plan;
pub mod storage;
pub mod validation;
pub mod wire;

pub use analysis::{AnalysisCandidateV1, AnalysisInput};
pub use common::{
    AnalysisArtifactReference, ArtifactReference, EvidenceSource, RevisionEdit, StepDepth,
};
pub use delivery::{DeliveryCandidate, DeliveryInput};
pub use discovery::{DiscoveryCandidate, DiscoveryInput, MarketCandidate, MarketInput};
pub use goose_extension::{AxwisePlatformExtension, PlatformToolInfo};
pub use jev::{audit_gate_b, GateBAuditDecision, GateBAuditOutcome, JevError};
pub use personas::{
    ChatWithPersonaInput, GeneratePersonasInput, PersonaCandidate, PersonaChatCandidate,
};
pub use prd::{PrdCandidate, PrdInput};
pub use provider::{
    clean_json_completion, discover_credentials, ModelProvider, ProviderError, ProviderType,
};
pub use review_engine::{
    prepare_review, validate_review, PipelineState, ReviewCandidate, ReviewCheck, ReviewOutcome,
    TwoStageReviewEngine,
};
pub use simulation::{SimulationCandidateV1, SimulationInput};
pub use simulation_plan::{generate_simulation_plan, SimulationSlot};
pub use storage::{OperationRecord, StorageError, StorageManager};
pub use validation::{
    exact_utf8_span, validate_analysis_gap_contract, validate_prd_candidate, verify_quote_span,
    ValidationError,
};
pub use wire::{artifact_id, canonical_hash, canonical_json, WireError};

pub mod scope;

pub mod native;
pub mod native_provider;
pub mod native_transport;
pub mod native_validation;
pub mod pipeline;
pub mod specialist;
