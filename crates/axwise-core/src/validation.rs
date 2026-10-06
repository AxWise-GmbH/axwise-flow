use crate::analysis::{AnalysisCandidateV1, GapCode, SupportStatus};
use crate::common::EvidenceSource;
use crate::prd::{ItemBasis, PrdCandidate, PrdInput};
use std::collections::{HashMap, HashSet};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("INVALID_SOURCE_QUOTE: quote does not match source span")]
    InvalidSourceQuote,
    #[error("SYNTHETIC_PROVENANCE_MISMATCH: synthetic input must use simulation_hypothesis")]
    SyntheticProvenanceMismatch,
    #[error("INVALID_OWNER_DECISION: owner_decision must match brief and have empty sourceIds")]
    InvalidOwnerDecision,
    #[error("UNKNOWN_SOURCE_REFERENCE: unknown source ID referenced")]
    UnknownSourceReference,
    #[error("UNKNOWN_FINDING_REFERENCE: unknown finding ID referenced")]
    UnknownFindingReference,
    #[error("MISSING_REQUIREMENT_FINDING_LINK: requirement must link to analysis finding")]
    MissingRequirementFindingLink,
    #[error("MISSING_CONFLICT_GAP: conflicting finding missing corresponding gap")]
    MissingConflictGap,
    #[error("MISSING_INSUFFICIENT_GAP: insufficient finding missing corresponding gap")]
    MissingInsufficientGap,
    #[error("UNREQUESTED_ANALYSIS_OUTPUT: gap contains unrequested output")]
    UnrequestedAnalysisOutput,
    #[error("INVALID_PRD_SECTIONS: PRD sections do not match expected baseline")]
    InvalidPrdSections,
    #[error("OUT_OF_RANGE: byte offsets out of range")]
    OutOfRange,
    #[error("SPLITS_CODE_POINT: byte offset splits a UTF-8 code point")]
    SplitsCodePoint,
}

/// Slices an exact UTF-8 span from text by byte offsets, asserting valid code point boundaries.
pub fn exact_utf8_span(text: &str, start: usize, end: usize) -> Result<&str, ValidationError> {
    let bytes = text.as_bytes();
    if start >= end || end > bytes.len() {
        return Err(ValidationError::OutOfRange);
    }
    if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return Err(ValidationError::SplitsCodePoint);
    }
    Ok(&text[start..end])
}

/// Verifies that candidate quote text equals the exact source byte span.
pub fn verify_quote_span(
    document_text: &str,
    start: usize,
    end: usize,
    candidate_text: &str,
) -> Result<(), ValidationError> {
    let span = exact_utf8_span(document_text, start, end)?;
    if span != candidate_text {
        return Err(ValidationError::InvalidSourceQuote);
    }
    Ok(())
}

/// Validates qualitative analysis gap contract.
pub fn validate_analysis_gap_contract(
    candidate: &AnalysisCandidateV1,
    requested_outputs: &[crate::analysis::AnalysisOutputKind],
) -> Result<(), ValidationError> {
    for gap in &candidate.gaps {
        if let Some(out) = &gap.output {
            if !requested_outputs.contains(out) {
                return Err(ValidationError::UnrequestedAnalysisOutput);
            }
        }
    }

    for finding in &candidate.findings {
        if finding.support_status == SupportStatus::Supported {
            continue;
        }

        let is_conflict = finding.support_status == SupportStatus::Conflicting;
        let has_matching_gap = candidate.gaps.iter().any(|gap| {
            let code_matches = if is_conflict {
                gap.code == GapCode::ConflictingEvidence
            } else {
                matches!(
                    gap.code,
                    GapCode::InsufficientEvidence
                        | GapCode::MissingParticipantTurns
                        | GapCode::UnansweredQuestion
                )
            };

            if !code_matches {
                return false;
            }

            // Must match question ID or participant ref
            if let Some(qid) = &gap.question_id {
                if finding.question_ids.contains(qid) {
                    return true;
                }
            }
            if let Some(pref) = &gap.participant_ref {
                if finding.participant_refs.contains(pref) {
                    return true;
                }
            }
            false
        });

        if !has_matching_gap {
            return Err(if is_conflict {
                ValidationError::MissingConflictGap
            } else {
                ValidationError::MissingInsufficientGap
            });
        }
    }

    Ok(())
}

pub const PRD_BASELINE_SECTIONS: [&str; 10] = [
    "Users, jobs, and pains",
    "Problem and desired outcome",
    "Product thesis, scope, and non-goals",
    "Acceptance criteria",
    "Risks",
    "Next steps",
    "Metrics and validation",
    "User journeys",
    "Evidence, assumptions, and gaps",
    "Prioritized requirements",
];

pub const SOFTWARE_PRD_BASELINE_SECTIONS: [&str; 11] = [
    "Users, jobs, and pains",
    "Problem and desired outcome",
    "Product thesis, scope, and non-goals",
    "Acceptance criteria",
    "Risks",
    "Technical boundaries",
    "Next steps",
    "Metrics and validation",
    "User journeys",
    "Evidence, assumptions, and gaps",
    "Prioritized requirements",
];

/// Validates PRD candidate integrity against brief, sources, and baseline sections.
pub fn validate_prd_candidate(
    input: &PrdInput,
    candidate: &PrdCandidate,
    finding_map: &HashMap<String, (ItemBasis, Vec<String>)>,
) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    let expected_sections: HashSet<&str> =
        if input.artifact_type == crate::prd::ArtifactType::SoftwarePrd {
            SOFTWARE_PRD_BASELINE_SECTIONS.iter().copied().collect()
        } else {
            PRD_BASELINE_SECTIONS.iter().copied().collect()
        };

    let actual_sections: HashSet<&str> = candidate
        .sections
        .iter()
        .map(|s| s.heading.as_str())
        .collect();
    if actual_sections != expected_sections || candidate.sections.len() != expected_sections.len() {
        errors.push(ValidationError::InvalidPrdSections);
    }

    let source_map: HashMap<&str, &EvidenceSource> =
        input.sources.iter().map(|s| (s.id.as_str(), s)).collect();

    for section in &candidate.sections {
        for item in &section.items {
            // Check sources
            for sid in &item.source_ids {
                if !source_map.contains_key(sid.as_str()) {
                    errors.push(ValidationError::UnknownSourceReference);
                }
            }

            // Check findings
            for fid in &item.finding_ids {
                if !finding_map.contains_key(fid) {
                    errors.push(ValidationError::UnknownFindingReference);
                }
            }

            // Prioritized requirements link check
            if input.analysis_artifact.is_some()
                && section.heading == "Prioritized requirements"
                && item.finding_ids.is_empty()
                && item.basis != ItemBasis::OwnerDecision
            {
                errors.push(ValidationError::MissingRequirementFindingLink);
            }

            // Owner decision must match brief substring and have empty sources
            if item.basis == ItemBasis::OwnerDecision
                && (!item.source_ids.is_empty() || !input.brief.contains(&item.text))
            {
                errors.push(ValidationError::InvalidOwnerDecision);
            }

            // Source statement must be exact substring of all cited sources
            if item.basis == ItemBasis::SourceStatement {
                if item.source_ids.is_empty() {
                    errors.push(ValidationError::InvalidSourceQuote);
                } else {
                    for sid in &item.source_ids {
                        if let Some(source) = source_map.get(sid.as_str()) {
                            if !source.text.contains(&item.text) {
                                errors.push(ValidationError::InvalidSourceQuote);
                            }
                        }
                    }
                }
            }

            // Synthetic provenance check
            let cites_synthetic = item.source_ids.iter().any(|sid| {
                source_map
                    .get(sid.as_str())
                    .is_some_and(|s| s.origin == crate::common::SourceOrigin::SyntheticTranscript)
            });
            let links_synthetic = item.finding_ids.iter().any(|fid| {
                finding_map
                    .get(fid)
                    .is_some_and(|(basis, _)| *basis == ItemBasis::SimulationHypothesis)
            });

            if (cites_synthetic || links_synthetic) && item.basis != ItemBasis::SimulationHypothesis
            {
                errors.push(ValidationError::SyntheticProvenanceMismatch);
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}
