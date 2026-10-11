use axwise_core::{
    native::NativeEngine, native_validation, review_engine::get_tool_criteria, scope::HostScope,
    validation::PRD_BASELINE_SECTIONS,
};
use serde_json::{json, Value};

fn engine(root: &std::path::Path) -> NativeEngine {
    NativeEngine::new(
        root.into(),
        HostScope {
            account: "regression".into(),
            session: "local-rebuild".into(),
        },
        "host_chat".into(),
    )
    .unwrap()
}

fn source() -> Value {
    json!({"id":"s1","title":"Selected synthetic fixture","text":"Operators lose time copying handoff updates.","origin":"web_source","url":"https://example.com/selected-fixture","retrievedAt":"2026-10-11T12:00:00Z"})
}

#[test]
fn web_identity_is_required_for_every_tool_and_inherited_source() {
    let mut incomplete = source();
    for missing in ["url", "retrievedAt"] {
        incomplete.as_object_mut().unwrap().remove(missing);
        for tool in [
            "prepare_discovery",
            "research_market",
            "generate_personas",
            "simulate_interviews",
            "chat_with_persona",
            "analyze_interviews",
            "create_prd",
            "create_delivery_brief",
        ] {
            assert!(
                native_validation::prepare_context(
                    tool,
                    &json!({"sources":[incomplete]}),
                    &[],
                    "op-test"
                )
                .unwrap_err()
                .contains("web_source_identity_required"),
                "{tool}: {missing}"
            );
            assert!(
                native_validation::prepare_context(
                    tool,
                    &json!({}),
                    &[json!({"sources":[incomplete]})],
                    "op-test"
                )
                .unwrap_err()
                .contains("web_source_identity_required"),
                "inherited {tool}: {missing}"
            );
        }
        incomplete = source();
    }
}

#[test]
fn valid_web_identity_is_preserved_and_unsafe_urls_are_rejected() {
    let original = source();
    let context = native_validation::prepare_context(
        "prepare_discovery",
        &json!({"brief":"Selected test evidence","sources":[original]}),
        &[],
        "op-test",
    )
    .unwrap();
    assert_eq!(context["sources"][0], original);
    for url in [
        "file:///private/test",
        "https://user:secret@example.com/",
        "https://example.com/a b",
        "missing-host",
    ] {
        let mut invalid = source();
        invalid["url"] = json!(url);
        assert!(native_validation::prepare_context(
            "prepare_discovery",
            &json!({"sources":[invalid]}),
            &[],
            "op-test"
        )
        .unwrap_err()
        .contains("invalid_source_url"));
    }
    let mut supplied = original;
    supplied["origin"] = json!("supplied_document");
    supplied.as_object_mut().unwrap().remove("url");
    supplied.as_object_mut().unwrap().remove("retrievedAt");
    native_validation::prepare_context(
        "prepare_discovery",
        &json!({"brief":"Selected supplied evidence","sources":[supplied]}),
        &[],
        "op-test",
    )
    .unwrap();
}

#[test]
fn persona_paraphrase_repair_explains_basis_and_requires_fresh_review() {
    let dir = tempfile::tempdir().unwrap();
    let mut engine = engine(dir.path());
    let input = json!({"brief":"Investigate handoff delays","sources":[source()],"stakeholders":[{"id":"operators","label":"Operators","description":"People coordinating handoffs","participants":1}]});
    let request = engine.prepare("generate_personas", &input).unwrap();
    let id = &request["structuredContent"]["requestId"];
    let mut candidate = json!({"personas":[{"id":"p1","stakeholderId":"operators","label":"A hypothetical operator","description":"A hypothetical operator coordinates daily handoffs and copies updates between team tools.","origin":"synthetic","basis":"evidence_informed_hypothesis","motivations":[{"text":"Reduce duplicate copying of updates","basis":"source_statement","evidence":[{"passageId":"s1"}]}],"painPoints":[{"text":"Operators lose time copying handoff updates.","basis":"source_statement","evidence":[{"passageId":"s1"}]}],"traits":[],"communicationStyle":"Direct and practical","assumptions":["This profile is a hypothesis, not a real interviewee."]}],"limitations":["A single synthetic source fixture"]});
    let repair = engine
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    let prompt: Value =
        serde_json::from_str(repair["structuredContent"]["userPrompt"].as_str().unwrap()).unwrap();
    assert_eq!(prompt["repairDefects"][0], "persona_claim_not_exact");
    assert!(prompt["repairDefects"][1]
        .as_str()
        .unwrap()
        .contains("interpretation"));
    assert_eq!(prompt["previousCandidate"], candidate);
    assert_eq!(prompt["resolvedContext"]["sources"][0], source());
    candidate["personas"][0]["motivations"][0]["basis"] = json!("interpretation");
    let reviewed = engine
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    assert_eq!(reviewed["structuredContent"]["stage"], "review");
    assert_eq!(
        reviewed["structuredContent"]["storageAccepted"],
        Value::Null
    );
}

#[test]
fn failed_quality_review_reasons_reach_repair_without_automatic_acceptance() {
    let dir = tempfile::tempdir().unwrap();
    let mut engine = engine(dir.path());
    let request = engine.prepare("create_prd", &json!({"brief":"Compare three distribution channels with an explicit experiment per channel."})).unwrap();
    let id = &request["structuredContent"]["requestId"];
    let candidate = json!({"title":"Channel experiments","sections":PRD_BASELINE_SECTIONS.iter().map(|h|json!({"heading":h,"items":[{"text":format!("Proposed {h}: run a channel experiment."),"basis":"proposal","sourceIds":[]}]})).collect::<Vec<_>>()});
    engine
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    let failed = json!({"checks":get_tool_criteria("create_prd").iter().map(|criterion|json!({"criterion":criterion,"passed":*criterion!="answers_requested_questions","reason":if *criterion=="answers_requested_questions" {"The candidate omits the requested three-channel comparison and individual experiments."} else {"Checked the exact fixture and its selected constraints."}})).collect::<Vec<_>>()});
    let repair = engine
        .advance(&json!({"requestId":id,"stage":"review","payload":failed}))
        .unwrap();
    let prompt: Value =
        serde_json::from_str(repair["structuredContent"]["userPrompt"].as_str().unwrap()).unwrap();
    assert_eq!(prompt["previousReview"], failed);
    assert_eq!(prompt["previousCandidate"], candidate);
    assert!(prompt["input"]["brief"]
        .as_str()
        .unwrap()
        .contains("three distribution channels"));
    let fresh = engine
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    assert_eq!(fresh["structuredContent"]["stage"], "review");
    assert!(engine
        .advance(&json!({"requestId":id,"stage":"review","payload":failed}))
        .unwrap_err()
        .contains("artifact_rejected"));
    assert!(!dir.path().join("regression/local-rebuild").exists());
}
