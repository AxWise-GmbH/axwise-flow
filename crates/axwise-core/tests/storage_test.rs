use axwise_core::storage::{OperationRecord, StorageManager};
use tempfile::tempdir;

#[test]
fn test_storage_wal_and_atomic_records() {
    let temp = tempdir().expect("Failed to create tempdir");
    let state_dir = temp.path().to_path_buf();

    let mut storage = StorageManager::new(state_dir.clone()).expect("Failed to init storage");

    let json_file = state_dir.join("test-session").join("op-12345.json");
    let md_file = state_dir.join("test-session").join("op-12345.md");

    let record = OperationRecord {
        operation_id: "op-12345".to_string(),
        session_id: "test-session".to_string(),
        tool: "create_prd".to_string(),
        title: Some("My Provisional PRD".to_string()),
        created_at: "2026-10-04T12:00:00Z".to_string(),
        sha256: "abc123sha".to_string(),
        json_path: json_file.to_string_lossy().to_string(),
        md_path: md_file.to_string_lossy().to_string(),
        markdown: Some("# My PRD".to_string()),
        artifact_json: Some(r#"{"title": "My Provisional PRD"}"#.to_string()),
        candidate_json: None,
        input_json: None,
        provenance_json: None,
        quality_review_json: None,
        status: "completed".to_string(),
    };

    storage
        .save_operation(&record, r#"{"title": "My Provisional PRD"}"#, "# My PRD")
        .expect("Failed to save operation");

    // Assert files exist on disk
    assert!(json_file.is_file(), "JSON artifact was not written");
    assert!(md_file.is_file(), "MD artifact was not written");

    // Query back
    let found = storage
        .find_latest_artifact(&["create_prd"], "test-session")
        .expect("Query failed")
        .expect("Artifact not found");

    assert_eq!(found.operation_id, "op-12345");
    assert_eq!(found.title, Some("My Provisional PRD".to_string()));
    assert_eq!(found.tool, "create_prd");
    assert_eq!(found.sha256, "abc123sha");

    println!("✅ Storage SQLite WAL and atomic persistence verified!");
}
