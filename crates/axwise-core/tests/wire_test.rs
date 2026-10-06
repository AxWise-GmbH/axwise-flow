use axwise_core::wire::{artifact_id, canonical_hash, canonical_json};
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(serde::Deserialize)]
struct WireFixture {
    name: String,
    input: Value,
    expected_json: String,
    expected_hash: String,
    expected_uuid: Option<String>,
}

#[test]
fn test_wire_canonical_parity() {
    let path = Path::new("schemas/wire_fixtures.json");
    let content = fs::read_to_string(path).expect("Failed to read wire_fixtures.json");
    let fixtures: Vec<WireFixture> =
        serde_json::from_str(&content).expect("Invalid JSON in fixtures");

    for fixture in fixtures {
        let rust_json = canonical_json(&fixture.input)
            .unwrap_or_else(|e| panic!("canonical_json failed on {}: {}", fixture.name, e));
        assert_eq!(
            rust_json, fixture.expected_json,
            "JSON mismatch on case '{}'",
            fixture.name
        );

        let rust_hash = canonical_hash(&fixture.input)
            .unwrap_or_else(|e| panic!("canonical_hash failed on {}: {}", fixture.name, e));
        assert_eq!(
            rust_hash, fixture.expected_hash,
            "Hash mismatch on case '{}'",
            fixture.name
        );

        if let Some(expected_uuid) = fixture.expected_uuid {
            let rust_uuid = artifact_id("test_kind", &rust_hash);
            assert_eq!(
                rust_uuid, expected_uuid,
                "UUIDv5 mismatch on case '{}'",
                fixture.name
            );
        }

        println!("✅ Wire fixture passed: {}", fixture.name);
    }
}
