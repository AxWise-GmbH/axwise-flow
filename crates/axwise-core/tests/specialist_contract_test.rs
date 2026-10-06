use axwise_core::{
    scope::HostScope,
    specialist::{provider_schema, resolve_reference},
};
use serde_json::json;

#[test]
fn generation_schema_keeps_literal_property_names_and_resolves_local_refs() {
    let schema = json!({"type":"object","properties":{"title":{"$ref":"#/$defs/Text"},"items":{"type":"array","items":{"type":"string"},"maxItems":2}},"required":["title","items"],"additionalProperties":false,"$defs":{"Text":{"type":"string","minLength":1}}});
    let prepared = provider_schema(&schema).unwrap();
    assert_eq!(prepared["properties"]["title"]["type"], "string");
    assert_eq!(prepared["properties"]["items"]["items"]["type"], "string");
    assert_eq!(prepared["required"], json!(["title", "items"]));
    assert!(prepared["properties"]["items"]["description"]
        .as_str()
        .unwrap()
        .contains("maxItems=2"));
    assert!(provider_schema(&json!({"$ref":"https://untrusted.example/schema"})).is_err());
    assert!(provider_schema(
        &json!({"$ref":"#/$defs/Cycle","$defs":{"Cycle":{"$ref":"#/$defs/Cycle"}}})
    )
    .is_err());
}

#[test]
fn references_cannot_choose_paths_or_accept_wrong_file_digests() {
    let root = tempfile::tempdir().unwrap();
    let scope = HostScope {
        account: "account".into(),
        session: "chat".into(),
    };
    assert!(resolve_reference(
        root.path(),
        &scope,
        &json!({"operationId":"../secret","sha256":"a".repeat(64)})
    )
    .is_err());
    let directory = root.path().join("account/chat");
    std::fs::create_dir_all(&directory).unwrap();
    let id = "00000000-0000-4000-8000-000000000001";
    std::fs::write(directory.join(format!("{id}.json")), "{}").unwrap();
    assert_eq!(
        resolve_reference(
            root.path(),
            &scope,
            &json!({"operationId":id,"sha256":"a".repeat(64)})
        )
        .unwrap_err(),
        "artifact_digest_mismatch"
    );
    #[cfg(unix)]
    {
        let other = root.path().join("account/other");
        std::os::unix::fs::symlink(&directory, &other).unwrap();
        let alien = HostScope {
            account: "account".into(),
            session: "other".into(),
        };
        assert_eq!(
            resolve_reference(
                root.path(),
                &alien,
                &json!({"operationId":id,"sha256":"a".repeat(64)})
            )
            .unwrap_err(),
            "artifact_not_found_or_wrong_owner"
        );
    }
}
