use axwise_core::{jev::decode_audit_reply, scope::HostScope};
use serde_json::json;

#[test]
fn audit_requires_scope_digest_and_every_valid_score() {
    let scope = HostScope {
        account: "account-a".into(),
        session: "session-a".into(),
    };
    let mut reply = json!({
        "account": "account-a", "session": "session-a", "reviewed_sha256": "digest",
        "model": "jev-latest", "answers": {
            "has_unverified_commercial_or_financial_estimates_without_pending_prefix": { "noul": 0.0 },
            "is_acceptance_criteria_traceability_intact": { "noul": 1.0 }
        }
    });
    assert!(
        decode_audit_reply(&reply, &scope, "digest", 1)
            .unwrap()
            .passed
    );
    assert!(decode_audit_reply(&reply, &scope, "altered", 1).is_err());
    let wrong_account = HostScope {
        account: "other".into(),
        ..scope.clone()
    };
    assert!(decode_audit_reply(&reply, &wrong_account, "digest", 1).is_err());
    let wrong_session = HostScope {
        session: "default".into(),
        ..scope.clone()
    };
    assert!(decode_audit_reply(&reply, &wrong_session, "digest", 1).is_err());
    let score = "is_acceptance_criteria_traceability_intact";
    reply["answers"][score]["noul"] = json!(0.0);
    assert!(
        !decode_audit_reply(&reply, &scope, "digest", 1)
            .unwrap()
            .passed
    );
    for bad in [json!(null), json!("1"), json!(-0.1), json!(1.1)] {
        reply["answers"][score]["noul"] = bad;
        assert!(decode_audit_reply(&reply, &scope, "digest", 1).is_err());
    }
    reply.as_object_mut().unwrap().remove("answers");
    assert!(decode_audit_reply(&reply, &scope, "digest", 1).is_err());
}
