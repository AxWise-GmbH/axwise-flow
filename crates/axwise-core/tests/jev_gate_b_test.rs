use axwise_core::jev::*;
use serde_json::json;

#[tokio::test]
#[ignore = "requires authenticated managed audit gateway; run explicitly for release acceptance"]
async fn test_native_gate_b_audit_execution() {
    let clean_draft = r#"
# Commercial Launch PRD: Freeze-Dried Pet Nutrition
## Statutory Framework
- Feedingstuffs Act § 19 activity licence (tegevusluba) requires 30-day prior filing with PTA.
- Pathogen zero-tolerance verified by LABRIS accredited lab testing (n=5, c=0).
## Financial Projections
- **Pending verification:** Retail slotting fees and distributor margin assumed at 38%.
- **Pending verification:** Initial batch run of 2,500 units at €4.20 unit cost.
"#;

    let acceptance_criteria = vec![
        json!({ "id": "AC-001", "text": "Feedingstuffs Act § 19 licensure" }),
        json!({ "id": "AC-002", "text": "Zero-tolerance pathogen lab testing" }),
    ];

    let evidence = json!({
        "statute": "Feedingstuffs Act § 19",
        "testing": "LABRIS certified pathogen testing"
    });

    let outcome = audit_gate_b(clean_draft, &acceptance_criteria, Some(&evidence))
        .await
        .expect("managed audit must execute successfully");
    assert!(
        outcome.passed,
        "managed audit must accept the supplied evidence"
    );
}
