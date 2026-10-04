use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use axwise_core::*;
use schemars::schema_for;
use serde_json::Value;

fn load_pydantic_schema(name: &str) -> Value {
    let path = Path::new("schemas/pydantic").join(format!("{}.json", name));
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", path.display(), e));
    serde_json::from_str(&content).expect("Invalid JSON in Pydantic schema")
}

fn extract_properties_and_required(schema: &Value) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut props = BTreeSet::new();
    let mut reqs = BTreeSet::new();

    if let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) {
        for key in properties.keys() {
            props.insert(key.clone());
        }
    }

    if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
        for item in required {
            if let Some(s) = item.as_str() {
                reqs.insert(s.to_string());
            }
        }
    }

    (props, reqs)
}

fn compare_schema(model_name: &str, rust_schema: Value) -> (bool, String) {
    let pydantic_schema = load_pydantic_schema(model_name);

    let (py_props, py_reqs) = extract_properties_and_required(&pydantic_schema);
    let (rs_props, rs_reqs) = extract_properties_and_required(&rust_schema);

    let missing_props: Vec<_> = py_props.difference(&rs_props).cloned().collect();
    let extra_props: Vec<_> = rs_props.difference(&py_props).cloned().collect();

    let missing_reqs: Vec<_> = py_reqs.difference(&rs_reqs).cloned().collect();
    let extra_reqs: Vec<_> = rs_reqs.difference(&py_reqs).cloned().collect();

    let passed = missing_props.is_empty()
        && extra_props.is_empty()
        && missing_reqs.is_empty()
        && extra_reqs.is_empty();

    let mut report = format!("Model: {}\n", model_name);
    report.push_str(&format!(
        "  Properties: {} py vs {} rust\n",
        py_props.len(),
        rs_props.len()
    ));
    if !missing_props.is_empty() {
        report.push_str(&format!("  ❌ Missing in Rust props: {:?}\n", missing_props));
    }
    if !extra_props.is_empty() {
        report.push_str(&format!("  ❌ Extra in Rust props: {:?}\n", extra_props));
    }
    if !missing_reqs.is_empty() {
        report.push_str(&format!("  ❌ Missing in Rust required: {:?}\n", missing_reqs));
    }
    if !extra_reqs.is_empty() {
        report.push_str(&format!("  ❌ Extra in Rust required: {:?}\n", extra_reqs));
    }
    if passed {
        report.push_str("  ✅ Exact 1-to-1 match for properties & required fields!\n");
    }

    (passed, report)
}

#[test]
fn test_all_16_schemas_parity() {
    let mut test_cases: BTreeMap<&str, Value> = BTreeMap::new();

    // 8 Inputs
    test_cases.insert("input_create_prd", serde_json::to_value(schema_for!(PrdInput)).unwrap());
    test_cases.insert("input_analyze_interviews", serde_json::to_value(schema_for!(AnalysisInput)).unwrap());
    test_cases.insert("input_simulate_interviews", serde_json::to_value(schema_for!(SimulationInput)).unwrap());
    test_cases.insert("input_prepare_discovery", serde_json::to_value(schema_for!(DiscoveryInput)).unwrap());
    test_cases.insert("input_research_market", serde_json::to_value(schema_for!(MarketInput)).unwrap());
    test_cases.insert("input_generate_personas", serde_json::to_value(schema_for!(GeneratePersonasInput)).unwrap());
    test_cases.insert("input_chat_with_persona", serde_json::to_value(schema_for!(ChatWithPersonaInput)).unwrap());
    test_cases.insert("input_create_delivery_brief", serde_json::to_value(schema_for!(DeliveryInput)).unwrap());

    // 8 Candidates
    test_cases.insert("candidate_create_prd", serde_json::to_value(schema_for!(PrdCandidate)).unwrap());
    test_cases.insert("candidate_analyze_interviews", serde_json::to_value(schema_for!(AnalysisCandidateV1)).unwrap());
    test_cases.insert("candidate_simulate_interviews", serde_json::to_value(schema_for!(SimulationCandidateV1)).unwrap());
    test_cases.insert("candidate_prepare_discovery", serde_json::to_value(schema_for!(DiscoveryCandidate)).unwrap());
    test_cases.insert("candidate_research_market", serde_json::to_value(schema_for!(MarketCandidate)).unwrap());
    test_cases.insert("candidate_generate_personas", serde_json::to_value(schema_for!(PersonaCandidate)).unwrap());
    test_cases.insert("candidate_chat_with_persona", serde_json::to_value(schema_for!(PersonaChatCandidate)).unwrap());
    test_cases.insert("candidate_create_delivery_brief", serde_json::to_value(schema_for!(DeliveryCandidate)).unwrap());

    let mut all_passed = true;
    let mut full_report = String::new();

    for (name, rust_schema) in test_cases {
        let (passed, rep) = compare_schema(name, rust_schema);
        full_report.push_str(&rep);
        if !passed {
            all_passed = false;
        }
    }

    println!("\n=== SCHEMA PARITY REPORT ===\n{}", full_report);
    assert!(all_passed, "Some schemas differed between Pydantic and Rust schemars!");
}
