use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostScope {
    pub account: String,
    pub session: String,
}

pub fn valid_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
}

impl HostScope {
    pub fn resolve(
        metadata: Option<&Value>,
        account: Option<String>,
        session: Option<String>,
        arguments: &Value,
    ) -> Result<Self, String> {
        let scope = if let Some(metadata) = metadata {
            serde_json::from_value::<Self>(metadata.clone()).map_err(|_| "invalid_host_scope")?
        } else {
            Self {
                account: account.clone().ok_or("missing_host_account")?,
                session: session.clone().ok_or("missing_host_session")?,
            }
        };
        if !valid_component(&scope.account) || !valid_component(&scope.session) {
            return Err("invalid_host_scope".into());
        }
        if account.is_some_and(|value| value != scope.account)
            || session.is_some_and(|value| value != scope.session)
        {
            return Err("host_scope_mismatch".into());
        }
        for key in ["sessionId", "session_id"] {
            if let Some(value) = arguments.get(key) {
                if value.as_str() != Some(scope.session.as_str()) {
                    return Err("caller_session_override_rejected".into());
                }
            }
        }
        Ok(scope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn host_scope_has_no_default_or_caller_override() {
        assert!(HostScope::resolve(None, None, None, &json!({})).is_err());
        let host = json!({"account":"a", "session":"s"});
        assert!(
            HostScope::resolve(Some(&host), None, None, &json!({"sessionId":"other"})).is_err()
        );
        assert!(HostScope::resolve(Some(&host), Some("other".into()), None, &json!({})).is_err());
        assert!(HostScope::resolve(Some(&host), None, None, &json!({"session_id":"s"})).is_ok());
        for value in ["", ".", "..", "../s", "/tmp", "a/b", "a\\b"] {
            assert!(!valid_component(value));
        }
    }
}
