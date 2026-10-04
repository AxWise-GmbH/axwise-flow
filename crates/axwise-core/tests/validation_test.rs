use axwise_core::validation::*;
use axwise_core::analysis::*;

#[test]
fn test_exact_utf8_span_slicing() {
    let text = "Rīga, Latvija — interview transcript.";
    // "R" (byte 0), "ī" (bytes 1..3), "g" (byte 3), "a" (byte 4) -> 5 bytes total
    let riga = exact_utf8_span(text, 0, 5).expect("Valid span");
    assert_eq!(riga, "Rīga");

    // Slicing in the middle of 'ī' (byte 2) should fail with SplitsCodePoint
    assert_eq!(exact_utf8_span(text, 0, 2), Err(ValidationError::SplitsCodePoint));

    // Out of bounds should fail with OutOfRange
    assert_eq!(exact_utf8_span(text, 0, 1000), Err(ValidationError::OutOfRange));

    // Verify quote span match
    assert!(verify_quote_span(text, 0, 5, "Rīga").is_ok());
    assert_eq!(verify_quote_span(text, 0, 5, "Wrong"), Err(ValidationError::InvalidSourceQuote));
}

#[test]
fn test_gap_contract_validation() {
    let participant_ref = AnalysisParticipantRefV1 {
        document_id: "doc-1".to_string(),
        participant_id: "p1".to_string(),
    };

    // Conflicting finding WITHOUT gap should fail
    let candidate = AnalysisCandidateV1 {
        quotes: vec![],
        findings: vec![
            AnalysisFindingCandidateV1 {
                key: "f1".to_string(),
                category: FindingCategory::Need,
                statement: "Contradictory workflow requirement".to_string(),
                basis: FindingBasis::Interpretation,
                support_status: SupportStatus::Conflicting,
                quote_keys: vec!["q1".to_string()],
                question_ids: vec!["q_need".to_string()],
                participant_refs: vec![participant_ref.clone()],
            }
        ],
        personas: vec![],
        gaps: vec![],
        limitations: vec![],
    };

    assert_eq!(
        validate_analysis_gap_contract(&candidate, &[AnalysisOutputKind::JobsPains]),
        Err(ValidationError::MissingConflictGap)
    );

    // Conflicting finding WITH matching gap should pass
    let mut candidate_with_gap = candidate.clone();
    candidate_with_gap.gaps.push(AnalysisGapV1 {
        code: GapCode::ConflictingEvidence,
        question_id: Some("q_need".to_string()),
        participant_ref: None,
        output: Some(AnalysisOutputKind::JobsPains),
        message: "Need further investigation on conflict".to_string(),
    });

    assert!(validate_analysis_gap_contract(&candidate_with_gap, &[AnalysisOutputKind::JobsPains]).is_ok());
}
