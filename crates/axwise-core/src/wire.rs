use serde_json::Value;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use uuid::Uuid;

pub const KERNEL_VERSION: &str = "axwise.local.v1";
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
pub const MIN_SAFE_INTEGER: i64 = -9_007_199_254_740_991;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum WireError {
    #[error("canonical JSON rejects floating-point numbers")]
    FloatsForbidden,
    #[error("canonical JSON integers must be JavaScript-safe")]
    UnsafeInteger,
    #[error("canonical JSON serialization error: {0}")]
    Serialization(String),
}

/// Compare two strings using UTF-16 code-unit ordinal ordering.
pub fn utf16_ordinal_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// Serialize a JSON Value to the canonical-v1 representation.
pub fn canonical_json(value: &Value) -> Result<String, WireError> {
    match value {
        Value::Null => Ok("null".to_string()),
        Value::Bool(b) => Ok(if *b {
            "true".to_string()
        } else {
            "false".to_string()
        }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                if !(MIN_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&i) {
                    return Err(WireError::UnsafeInteger);
                }
                Ok(i.to_string())
            } else if let Some(u) = n.as_u64() {
                if u > MAX_SAFE_INTEGER as u64 {
                    return Err(WireError::UnsafeInteger);
                }
                Ok(u.to_string())
            } else {
                Err(WireError::FloatsForbidden)
            }
        }
        Value::String(s) => {
            serde_json::to_string(s).map_err(|e| WireError::Serialization(e.to_string()))
        }
        Value::Array(arr) => {
            let mut result = String::with_capacity(arr.len() * 16 + 2);
            result.push('[');
            for (idx, item) in arr.iter().enumerate() {
                if idx > 0 {
                    result.push(',');
                }
                result.push_str(&canonical_json(item)?);
            }
            result.push(']');
            Ok(result)
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| utf16_ordinal_cmp(a, b));

            let mut result = String::with_capacity(map.len() * 32 + 2);
            result.push('{');
            for (idx, key) in keys.iter().enumerate() {
                if idx > 0 {
                    result.push(',');
                }
                let escaped_key = serde_json::to_string(key)
                    .map_err(|e| WireError::Serialization(e.to_string()))?;
                result.push_str(&escaped_key);
                result.push(':');
                result.push_str(&canonical_json(&map[*key])?);
            }
            result.push('}');
            Ok(result)
        }
    }
}

/// Compute canonical SHA-256 hash of a JSON Value.
pub fn canonical_hash(value: &Value) -> Result<String, WireError> {
    let serialized = canonical_json(value)?;
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

/// Compute stable deterministic UUIDv5 artifact ID.
pub fn artifact_id(kind: &str, digest: &str) -> String {
    let seed = format!("{}:{}:{}", KERNEL_VERSION, kind, digest);
    Uuid::new_v5(&Uuid::NAMESPACE_URL, seed.as_bytes()).to_string()
}
