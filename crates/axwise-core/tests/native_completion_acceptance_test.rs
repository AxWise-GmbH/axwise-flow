use axwise_core::analysis::{
    AnalysisInput, SelectedTranscript, SelectedTurn, TranscriptOrigin, TurnRole,
};
use axwise_core::personas::{ChatWithPersonaInput, GeneratePersonasInput, PersonaRole};
use axwise_core::storage::{OperationRecord, StorageManager};
use tempfile::tempdir;

#[test]
fn test_storage_find_operation_record() {
    let temp = tempdir().unwrap();
    let mut storage = StorageManager::new(temp.path().to_path_buf()).unwrap();

    let record = OperationRecord {
        operation_id: "op-test-123".to_string(),
        session_id: "sess-abc".to_string(),
        tool: "create_prd".to_string(),
        title: Some("Test PRD".to_string()),
        created_at: "1728210000".to_string(),
        sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
        json_path: temp
            .path()
            .join("sess-abc/op-test-123.json")
            .to_string_lossy()
            .into(),
        md_path: temp
            .path()
            .join("sess-abc/op-test-123.md")
            .to_string_lossy()
            .into(),
        markdown: Some("# PRD".to_string()),
        artifact_json: Some(r#"{"title": "Test PRD"}"#.to_string()),
        candidate_json: Some(r#"{"title": "Test PRD"}"#.to_string()),
        input_json: Some("{}".to_string()),
        provenance_json: None,
        quality_review_json: None,
        status: "completed".to_string(),
    };

    storage
        .save_operation(&record, r#"{"title": "Test PRD"}"#, "# PRD")
        .unwrap();

    let found = storage.find_operation("op-test-123").unwrap();
    assert!(found.is_some());
    let op = found.unwrap();
    assert_eq!(op.operation_id, "op-test-123");
    assert_eq!(op.session_id, "sess-abc");
    assert_eq!(op.title.as_deref(), Some("Test PRD"));

    let not_found = storage.find_operation("nonexistent").unwrap();
    assert!(not_found.is_none());
}

#[test]
fn test_substantive_transcript_and_persona_inputs() {
    // Verify substantive data structures
    let analysis_input = AnalysisInput {
        decision_question: "Should we adopt Rust execution gate?".to_string(),
        depth: Default::default(),
        references: vec![],
        revision_of: None,
        questions: vec!["What are the latency constraints?".to_string()],
        transcripts: vec![SelectedTranscript {
            id: "doc-1".to_string(),
            title: "Interview with Architect".to_string(),
            origin: TranscriptOrigin::SuppliedTranscript,
            turns: vec![
                SelectedTurn {
                    speaker: "Architect".to_string(),
                    role: TurnRole::Participant,
                    text: "Gate latency must be under 1ms per dispatch.".to_string(),
                    question_id: Some("q-latency".to_string()),
                },
                SelectedTurn {
                    speaker: "Interviewer".to_string(),
                    role: TurnRole::Interviewer,
                    text: "What about memory limits?".to_string(),
                    question_id: None,
                },
            ],
        }],
        outputs: vec![],
        views: vec![],
    };

    assert_eq!(analysis_input.transcripts.len(), 1);
    assert_eq!(analysis_input.transcripts[0].turns.len(), 2);
    assert!(analysis_input.transcripts[0].turns[0].text.contains("1ms"));

    let personas_input = GeneratePersonasInput {
        brief: Some("Discovery for enterprise billing".to_string()),
        depth: Default::default(),
        references: vec![],
        revision_of: None,
        sources: vec![],
        stakeholders: vec![PersonaRole {
            id: "finance_lead".to_string(),
            label: "Finance Director".to_string(),
            description: "Responsible for recurring invoice reconciliation".to_string(),
            participants: 2,
            locality: Some("EU".to_string()),
            country_code: Some("LV".to_string()),
        }],
    };

    assert_eq!(personas_input.stakeholders[0].id, "finance_lead");
    assert_eq!(personas_input.stakeholders[0].participants, 2);

    let chat_input = ChatWithPersonaInput {
        persona_id: "op-persona-finance".to_string(),
        message: "How does the reconciliation workflow fit your daily routine?".to_string(),
        depth: Default::default(),
        references: vec![],
        revision_of: None,
        document_reference: None,
    };

    assert_eq!(chat_input.persona_id, "op-persona-finance");
}
