use axwise_core::desktop_kernel::dispatch;
use serde_json::Value;

fn normalized(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(normalized).collect()),
        Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| {
                    let value = if key == "userPrompt" {
                        value
                            .as_str()
                            .and_then(|s| serde_json::from_str(s).ok())
                            .unwrap_or_else(|| value.clone())
                    } else {
                        value.clone()
                    };
                    (key.clone(), normalized(&value))
                })
                .collect(),
        ),
        value => value.clone(),
    }
}

// Retain the captured Python oracle. These rejection cases deliberately gain
// precise repair diagnostics; their accept/reject decisions and codes stay equal.
fn refined_expected(expected: &Value, diagnostic: Option<&str>) -> Value {
    let mut expected = expected.clone();
    if let Some(diagnostic) = diagnostic {
        assert_eq!(expected["ok"], false);
        let old = &expected["error"]["diagnostics"];
        assert!(
            *old == serde_json::json!([])
                || *old == serde_json::json!(["INVALID_CANDIDATE_SCHEMA"])
        );
        expected["error"]["diagnostics"] = serde_json::json!([diagnostic]);
    }
    expected
}

#[test]
fn python_behavior_conformance() {
    let fixture: Value =
        serde_json::from_str(include_str!("desktop_kernel/conformance.json")).unwrap();
    let mut failures = Vec::new();
    for (i, case) in fixture["cases"].as_array().unwrap().iter().enumerate() {
        let actual = dispatch(&case["request"]);
        let diagnostic = match i {
            117 | 118 => Some("WEB_SOURCE_IDENTITY_REQUIRED"),
            164..=167 => Some("PERSONA_SLOT_MISMATCH"),
            217 | 227 => Some("UNKNOWN_EVIDENCE_PASSAGE"),
            _ => None,
        };
        let expected = &refined_expected(&case["expected"], diagnostic);
        let matches = actual["ok"] == expected["ok"]
            && if expected["ok"] == true {
                normalized(&actual["result"]) == normalized(&expected["result"])
            } else {
                expected.get("error").is_none_or(|v| *v == actual["error"])
                    && expected
                        .get("code")
                        .is_none_or(|v| *v == actual["error"]["code"])
                    && expected
                        .get("diagnostics")
                        .is_none_or(|v| *v == actual["error"]["diagnostics"])
            };
        if !matches {
            failures.push(format!(
                "{i}: {} {}",
                case["request"]["operation"], case["request"]["tool"]
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{} mismatches:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[test]
fn original_comparison_probes() {
    let cases: Value = serde_json::from_str(include_str!("desktop_kernel/probes.json")).unwrap();
    assert_eq!(cases.as_array().unwrap().len(), 26);
    for case in cases.as_array().unwrap() {
        let diagnostic = (case["name"] == "web_source_without_url_or_retrieval_date")
            .then_some("WEB_SOURCE_IDENTITY_REQUIRED");
        assert_eq!(
            normalized(&dispatch(&case["request"])),
            normalized(&refined_expected(&case["expected"], diagnostic)),
            "{}",
            case["name"]
        );
    }
}

#[test]
fn python_boundary_case_conformance() {
    let cases: Value =
        serde_json::from_str(include_str!("desktop_kernel/edge_cases.json")).unwrap();
    for case in cases.as_array().unwrap() {
        assert_eq!(
            normalized(&dispatch(&case["request"])),
            normalized(&case["expected"]),
            "{}",
            case["name"]
        );
    }
}
#[test]
fn malformed_requests_are_rejected_without_exposing_values() {
    for operation in ["prepare", "finalize", "prepare_review", "prepare_repair"] {
        for tool in [
            "create_prd",
            "analyze_interviews",
            "simulate_interviews",
            "prepare_discovery",
            "research_market",
            "generate_personas",
            "chat_with_persona",
            "create_delivery_brief",
        ] {
            for input in [
                Value::Null,
                serde_json::json!([]),
                serde_json::json!("PRIVATE"),
            ] {
                let reply =
                    dispatch(&serde_json::json!({"operation":operation,"tool":tool,"input":input}));
                assert_eq!(reply["ok"], false);
                assert!(!reply.to_string().contains("PRIVATE"));
            }
        }
    }
}
