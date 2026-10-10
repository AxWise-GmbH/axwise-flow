use serde::Serialize;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpecialistPhase {
    Preparing,
    Generating,
    Validating,
    Reviewing,
    Repairing,
    Auditing,
    Saving,
}

impl SpecialistPhase {
    pub fn message(self) -> &'static str {
        match self {
            Self::Preparing => "Preparing the selected inputs",
            Self::Generating => "Generating the draft",
            Self::Validating => "Checking the document requirements",
            Self::Reviewing => "Reviewing the draft",
            Self::Repairing => "Correcting the draft",
            Self::Auditing => "Auditing the reviewed document",
            Self::Saving => "Saving and verifying the result",
        }
    }
}

// Phase events contain no inputs, model output, credentials or completion claim.
pub type ProgressObserver = Arc<dyn Fn(SpecialistPhase) + Send + Sync>;

pub(crate) fn report(observer: &Option<ProgressObserver>, phase: SpecialistPhase) {
    if let Some(observer) = observer {
        observer(phase);
    }
}
