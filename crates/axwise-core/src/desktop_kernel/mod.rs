//! Pure desktop domain kernel. The specialist host owns effects and persistence.

mod analysis;
mod delivery;
mod discovery;
mod personas;
mod prd;
mod quality;
mod simulation;

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

pub(crate) type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Clone)]
pub(crate) struct Error {
    pub code: String,
    pub diagnostics: Vec<String>,
}
impl From<&str> for Error {
    fn from(code: &str) -> Self {
        Self {
            code: code.into(),
            diagnostics: if arr(&contract()["diagnostics"]).contains(&json!(code)) {
                vec![code.into()]
            } else {
                vec![]
            },
        }
    }
}
pub(crate) fn ensure(ok: bool, code: &str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(code.into())
    }
}
pub(crate) fn contract() -> &'static Value {
    static DATA: OnceLock<Value> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!("contract.json")).expect("checked-in desktop contract")
    })
}
pub(crate) fn schema(name: &str) -> Value {
    contract()["schemas"][name].clone()
}
pub(crate) fn text(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
pub(crate) fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
pub(crate) fn n(v: &Value) -> usize {
    v.as_u64().unwrap_or(0) as usize
}
pub(crate) fn percent(s: &str, safe: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"_.-~".contains(&b) || safe.as_bytes().contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
pub(crate) fn hash(v: &Value) -> String {
    crate::wire::canonical_hash(v).expect("validated canonical value")
}
pub(crate) fn bytes_hash(v: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(v))
}
pub(crate) fn canonical(v: &Value) -> String {
    crate::wire::canonical_json(v).expect("validated canonical value")
}
pub(crate) fn stable(prefix: &str, v: &Value) -> String {
    format!("{prefix}-{}", &hash(v)[..24])
}
pub(crate) fn unique(values: impl IntoIterator<Item = Value>) -> bool {
    let mut seen = HashSet::new();
    values.into_iter().all(|v| seen.insert(canonical(&v)))
}
pub(crate) fn distinct(values: impl IntoIterator<Item = Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|v| seen.insert(canonical(v)))
        .collect()
}
pub(crate) fn bounded(v: &Value, bytes: usize) -> Result<()> {
    ensure(
        crate::wire::canonical_json(v).is_ok_and(|s| s.len() <= bytes),
        "invalid_bounded_json",
    )
}
fn normalize(s: &Value, root: &Value, value: &mut Value) -> Result<()> {
    if let Some(reference) = s["$ref"].as_str() {
        let resolved = root
            .pointer(reference.strip_prefix('#').ok_or("invalid_schema")?)
            .ok_or("invalid_schema")?;
        return normalize(resolved, root, value);
    }
    if let Some(parts) = s["anyOf"].as_array() {
        if let Some(part) = parts.iter().find(|p| match text(&p["type"]) {
            "null" => value.is_null(),
            "string" => value.is_string(),
            "integer" => value.is_number(),
            "object" => value.is_object(),
            "array" => value.is_array(),
            "boolean" => value.is_boolean(),
            _ => !value.is_null(),
        }) {
            normalize(part, root, value)?;
        }
    }
    if s["format"] == "uuid" && !value.is_null() {
        let id = uuid::Uuid::parse_str(text(value)).map_err(|_| "invalid_uuid")?;
        *value = json!(id.to_string());
    }
    if s["x-nonblank-value"] == true && !value.is_null() {
        ensure(!text(value).trim().is_empty(), "blank_text")?;
    }
    if s["x-identifier"] == true && !value.is_null() {
        let v = text(value);
        ensure(
            !v.is_empty() && v == v.trim() && !v.chars().any(|c| c < ' ' || c == '\u{7f}'),
            "invalid_identifier",
        )?;
    }
    if s["x-trim"] == true {
        if let Some(v) = value.as_str() {
            *value = json!(v.trim());
        }
    }
    if let Some(map) = value.as_object_mut() {
        if let Some(props) = s["properties"].as_object() {
            for (key, prop) in props {
                if !map.contains_key(key) {
                    if let Some(default) = prop.get("default") {
                        map.insert(key.clone(), default.clone());
                    }
                }
                if let Some(v) = map.get_mut(key) {
                    if s["x-nonblank"] == true {
                        ensure(
                            !v.is_string() || !text(v).trim().is_empty(),
                            "invalid_blank",
                        )?;
                    }
                    normalize(prop, root, v)?;
                }
            }
        }
    } else if let Some(values) = value.as_array_mut() {
        if let Some(item) = s.get("items") {
            for v in values {
                normalize(item, root, v)?;
            }
        }
    }
    Ok(())
}
pub(crate) fn checked(name: &str, v: &Value) -> Result<Value> {
    let s = &contract()["normalizers"][name];
    ensure(s.is_object(), "unknown_schema")?;
    let mut v = v.clone();
    normalize(s, s, &mut v)?;
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<jsonschema::Validator>>>> = OnceLock::new();
    let validator = {
        let mut cache = CACHE
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "schema_cache_failed")?;
        if let Some(validator) = cache.get(name) {
            validator.clone()
        } else {
            let validator = Arc::new(jsonschema::validator_for(s).map_err(|_| "invalid_schema")?);
            cache.insert(name.into(), validator.clone());
            validator
        }
    };
    ensure(validator.is_valid(&v), "invalid_schema_value")?;
    Ok(v)
}
pub(crate) fn parse_response(response: &Value) -> Result<Value> {
    let v = if let Some(s) = response.as_str() {
        ensure(s.len() <= 512_000, "response_too_large")?;
        serde_json::from_str(s).map_err(|_| Error::from("INVALID_MODEL_JSON"))?
    } else {
        response.clone()
    };
    ensure(v.is_object(), "INVALID_CANDIDATE_SCHEMA")?;
    bounded(&v, 512_000)?;
    Ok(v)
}
pub(crate) fn source(raw: &Value) -> Result<Value> {
    let v = checked("common.EvidenceSource", raw)?;
    if let Some(url) = v["url"].as_str() {
        let parsed = reqwest::Url::parse(url).map_err(|_| "invalid_source_url")?;
        ensure(
            ["http", "https"].contains(&parsed.scheme())
                && parsed.host_str().is_some()
                && parsed.username().is_empty()
                && parsed.password().is_none()
                && !url.chars().any(char::is_whitespace),
            "invalid_source_url",
        )?;
    }
    if v["origin"] == "web_source" {
        ensure(
            !text(&v["url"]).is_empty() && !text(&v["retrievedAt"]).is_empty(),
            "web_identity_required",
        )?;
    }
    Ok(v)
}
pub(crate) fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
        .replace("![", "!\\[")
}
pub(crate) fn render(s: &str) -> String {
    escape(s).replace(['\r', '\n'], " ")
}
pub(crate) fn resolve(input: &Value, hosts: &[Value], kinds: &[&str]) -> Result<Vec<Value>> {
    let mut refs = arr(&input["references"]).to_vec();
    if !input["revisionOf"].is_null() {
        refs.push(input["revisionOf"].clone());
    }
    let expected = distinct(refs);
    let mut found = Vec::new();
    for host in hosts {
        ensure(
            host.is_object()
                && host["artifact"].is_object()
                && expected.contains(&host["reference"])
                && !found
                    .iter()
                    .any(|h: &Value| h["reference"] == host["reference"])
                && kinds.contains(&text(&host["tool"])),
            "invalid_host_reference",
        )?;
        found.push(host.clone());
    }
    ensure(found.len() == expected.len(), "missing_host_reference")?;
    Ok(found)
}
pub(crate) fn sources(input: &Value, hosts: &[Value], maximum: usize) -> Result<Vec<Value>> {
    let mut values = Vec::new();
    for raw in hosts
        .iter()
        .flat_map(|h| arr(&h["artifact"]["sources"]))
        .chain(arr(&input["sources"]))
    {
        let v = source(raw)?;
        if let Some(previous) = values.iter().find(|p: &&Value| p["id"] == v["id"]) {
            ensure(*previous == v, "conflicting_source")?;
        } else {
            values.push(v);
        }
    }
    ensure(values.len() <= maximum, "source_budget")?;
    Ok(values)
}
pub(crate) fn input(tool: &str, value: &Value) -> Result<Value> {
    bounded(value, 160_000)?;
    ensure(value.is_object(), "invalid_input")?;
    let selected_key = match tool {
        "create_prd" => Some("sources"),
        "analyze_interviews" => Some("transcripts"),
        _ => None,
    };
    if let Some(key) = selected_key {
        for row in arr(&value[key]) {
            if row.is_object() && row.get("origin").is_none() {
                return Err("AXWISE_LOCAL_MISSING_SOURCE_ORIGIN".into());
            }
        }
    }
    let mut public = value.clone();
    let context = public.as_object_mut().unwrap().remove("hostContext");
    let mut v = checked(&format!("input.{tool}"), &public)?;
    if let Some(context) = context {
        ensure(
            tool == "analyze_interviews" && context.is_array() && arr(&context).len() <= 16,
            "invalid_host_context",
        )?;
        v["hostContext"] = json!(arr(&context)
            .iter()
            .map(|c| checked("kernel.AnalysisSourceContext", c))
            .collect::<Result<Vec<_>>>()?);
    }
    if tool == "analyze_interviews" && v.get("hostContext").is_none() {
        v["hostContext"] = json!([]);
    }
    for key in if ["create_prd", "analyze_interviews", "simulate_interviews"].contains(&tool) {
        vec!["sources", "transcripts", "stakeholders"]
    } else {
        vec![]
    } {
        ensure(
            unique(arr(&v[key]).iter().map(|r| r["id"].clone())),
            "duplicate_selected_identity",
        )?;
    }
    ensure(
        unique(
            arr(&v["references"])
                .iter()
                .map(|r| r["operationId"].clone()),
        ),
        "duplicate_references",
    )?;
    for s in arr(&v["sources"]) {
        source(s)?;
    }
    Ok(v)
}

pub(crate) fn prepare(tool: &str, value: &Value, hosts: &[Value]) -> Result<Value> {
    ensure(value.is_object(), "invalid_input")?;
    let checked = if ["create_prd", "analyze_interviews", "simulate_interviews"].contains(&tool) {
        value.clone()
    } else {
        input(tool, value)?
    };
    let mut out = match tool {
        "prepare_discovery" | "research_market" => discovery::prepare(tool, &checked, hosts)?,
        "generate_personas" | "chat_with_persona" => personas::prepare(tool, &checked, hosts)?,
        "create_delivery_brief" => delivery::prepare(&checked, hosts)?,
        "create_prd" => prd::prepare(value, hosts)?,
        "analyze_interviews" => analysis::prepare(value, hosts)?,
        "simulate_interviews" => simulation::prepare(value, hosts)?,
        _ => return Err("unknown_tool".into()),
    };
    out["systemPrompt"] = json!(format!(
        "{}\n{}",
        text(&contract()["constants"]["kernel.BOUNDARY_PROMPT"]),
        text(&out["systemPrompt"])
    ));
    Ok(out)
}
pub(crate) fn core_result(
    artifact: Value,
    markdown: String,
    prepared: &Value,
    sources: Value,
    reused: &[&str],
    usage: &Value,
) -> Result<Value> {
    let empty = json!({});
    let mut usage = checked("kernel.Usage", if usage.is_null() { &empty } else { usage })?;
    for key in ["cacheReadTokens", "cacheWriteTokens"] {
        if usage[key].is_null() {
            usage.as_object_mut().unwrap().remove(key);
        }
    }
    let mut provenance = prepared["context"].clone();
    for (key, value) in [
        ("artifactHash", json!(hash(&artifact))),
        ("sourceCatalogue", sources),
        ("reusedAxwiseModules", json!(reused)),
        ("orchestration", json!("local")),
        ("modelCalls", json!(1)),
    ] {
        provenance[key] = value;
    }
    Ok(
        json!({"artifact":artifact,"markdown":markdown,"validation":{"valid":true,"method":"deterministic_structure_source_identity_and_lineage","externalFactsVerified":false,"semanticEntailmentVerified":false},"provenance":provenance,"usage":usage}),
    )
}
pub(crate) fn finalize(
    tool: &str,
    value: &Value,
    response: &Value,
    hosts: &[Value],
    context: &Value,
    usage: &Value,
) -> Result<Value> {
    let prepared = prepare(tool, value, hosts)?;
    ensure(
        context.is_null() || *context == prepared["context"],
        "context_mismatch",
    )?;
    let response = parse_response(response)?;
    match tool {
        "prepare_discovery" | "research_market" => {
            discovery::finalize(tool, &input(tool, value)?, &response, hosts)
        }
        "generate_personas" | "chat_with_persona" => {
            personas::finalize(tool, &input(tool, value)?, &response, hosts)
        }
        "create_delivery_brief" => delivery::finalize(&input(tool, value)?, &response, hosts),
        "create_prd" => prd::finalize(value, &response, hosts, usage),
        "analyze_interviews" => analysis::finalize(value, &response, hosts, usage),
        "simulate_interviews" => simulation::finalize(value, &response, hosts, usage),
        _ => Err("unknown_tool".into()),
    }
}
pub fn dispatch(message: &Value) -> Value {
    let identity = message
        .get("id")
        .filter(|id| {
            id.is_null()
                || id.is_i64()
                || id.is_u64()
                || id.as_str().is_some_and(|s| s.chars().count() <= 128)
        })
        .cloned()
        .unwrap_or(Value::Null);
    let operation = text(&message["operation"]);
    let tool = text(&message["tool"]);
    let result = (|| {
        bounded(message, 1_048_576)?;
        let keys = [
            "id",
            "operation",
            "tool",
            "input",
            "response",
            "usage",
            "context",
            "hostEvidence",
            "artifact",
            "candidate",
            "review",
            "diagnostics",
        ];
        ensure(
            message
                .as_object()
                .is_some_and(|m| m.keys().all(|k| keys.contains(&k.as_str()))),
            "invalid_request",
        )?;
        let legacy;
        let hosts = if message["hostEvidence"].is_object() && tool == "create_prd" {
            ensure(
                message["hostEvidence"].as_object().unwrap().len() == 4
                    && ["input", "candidate", "artifact", "reference"]
                        .iter()
                        .all(|k| message["hostEvidence"].get(k).is_some()),
                "invalid_host_evidence",
            )?;
            ensure(
                message["hostEvidence"]["reference"] == message["input"]["analysisArtifact"],
                "analysis_reference_mismatch",
            )?;
            let mut h = message["hostEvidence"].clone();
            h["tool"] = json!("analyze_interviews");
            legacy = vec![h];
            legacy.as_slice()
        } else if message["hostEvidence"].is_null() {
            &[][..]
        } else {
            message["hostEvidence"]
                .as_array()
                .ok_or("invalid_host_evidence")?
                .as_slice()
        };
        match operation {
            "describe" => Ok(contract()["catalog"].clone()),
            "prepare" => prepare(tool, &message["input"], hosts),
            "finalize" => finalize(
                tool,
                &message["input"],
                &message["response"],
                hosts,
                &message["context"],
                &message["usage"],
            ),
            "prepare_review" => {
                quality::prepare_review(tool, &message["input"], &message["artifact"], hosts)
            }
            "validate_review" => quality::validate_review(
                tool,
                &message["artifact"],
                &message["response"],
                &message["context"],
            ),
            "prepare_repair" => quality::prepare_repair(
                tool,
                &message["input"],
                &message["candidate"],
                &message["review"],
                &message["diagnostics"],
                hosts,
            ),
            _ => Err("invalid_operation".into()),
        }
    })();
    match result {
        Ok(mut result) => {
            if tool == "create_prd"
                && !message["hostEvidence"].is_array()
                && message["input"].get("sources").is_none()
            {
                if let Some(resolved) = result
                    .get_mut("resolvedInput")
                    .and_then(Value::as_object_mut)
                {
                    resolved.remove("sources");
                }
            }
            json!({"id":identity,"ok":true,"result":result})
        }
        Err(error) => {
            let safe = &contract()["safeInputErrors"][&error.code];
            let specialized = !error.diagnostics.is_empty();
            let code = if safe.is_string() {
                error.code.as_str()
            } else if specialized || ["finalize", "validate_review"].contains(&operation) {
                "AXWISE_LOCAL_INVALID_OUTPUT"
            } else {
                "AXWISE_LOCAL_INVALID_INPUT"
            };
            let message = if safe.is_string() {
                text(safe)
            } else if specialized {
                "Generated artifact failed local validation; no artifact was published."
            } else {
                "The selected inputs or generated artifact failed local validation; no artifact was published."
            };
            let mut value =
                json!({"id":identity,"ok":false,"error":{"code":code,"message":message}});
            if !safe.is_string() {
                value["error"]["diagnostics"] = json!(if specialized {
                    error.diagnostics
                } else if operation == "finalize" {
                    vec![if tool == "analyze_interviews" {
                        "INVALID_ANALYSIS_LINEAGE".into()
                    } else {
                        "INVALID_CANDIDATE_SCHEMA".into()
                    }]
                } else {
                    vec![]
                });
            }
            value
        }
    }
}
