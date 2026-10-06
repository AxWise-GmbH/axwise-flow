use axwise_core::review_engine::*;

#[test]
fn test_review_engine_happy_path() {
    let mut engine = TwoStageReviewEngine::new();
    assert_eq!(engine.state, PipelineState::Initial);

    engine.on_generation();
    assert_eq!(engine.state, PipelineState::Generated);

    engine.on_local_validation(vec![]).expect("Validation pass");
    assert_eq!(engine.state, PipelineState::ValidatedPass);

    let passing_outcome = ReviewOutcome {
        passed: true,
        issues: vec![],
        review: ReviewCandidate { checks: vec![] },
        review_hash: "hash123".to_string(),
    };

    engine
        .on_review_outcome(&passing_outcome)
        .expect("Review pass");
    assert_eq!(engine.state, PipelineState::ReviewPass);
}

#[test]
fn test_review_engine_repair_and_terminal_failure() {
    let mut engine = TwoStageReviewEngine::new();
    engine.on_generation();
    engine.on_local_validation(vec![]).unwrap();

    let failing_outcome = ReviewOutcome {
        passed: false,
        issues: vec!["evidence_gaps".to_string()],
        review: ReviewCandidate { checks: vec![] },
        review_hash: "hash456".to_string(),
    };

    // First review failure triggers repair state
    engine
        .on_review_outcome(&failing_outcome)
        .expect("Repair allowed");
    assert_eq!(
        engine.state,
        PipelineState::ReviewDefect(vec!["evidence_gaps".to_string()])
    );
    assert_eq!(engine.repair_attempts, 1);

    // Second failure on repaired candidate triggers terminal failure
    let terminal = engine.on_review_outcome(&failing_outcome);
    assert!(terminal.is_err());
    assert!(matches!(engine.state, PipelineState::TerminalFailure(_)));
}
