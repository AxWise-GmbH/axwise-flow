//! Production AxWise: Rust orchestration over the in-process desktop domain kernel.
//! The kernel has no credentials or filesystem authority. Only the host resolves saved
//! references; candidates are never published before domain validation, review and audit.
use crate::{
    progress::{report, ProgressObserver, SpecialistPhase},
    provider::{ModelProvider, ProviderType},
    scope::HostScope,
    storage::{OperationRecord, StorageManager},
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};

// Complete refresh-token rotation even when the enclosing chat is cancelled.
static ACTIVE_AUTH: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
pub fn active_auth_refreshes() -> usize {
    ACTIVE_AUTH.load(std::sync::atomic::Ordering::SeqCst)
}
struct AuthRefresh;
impl AuthRefresh {
    fn begin() -> Self {
        ACTIVE_AUTH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Self
    }
}
impl Drop for AuthRefresh {
    fn drop(&mut self) {
        ACTIVE_AUTH.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

struct Journal {
    directory: PathBuf,
    sequence: usize,
    finished: bool,
    publication_started: bool,
}
impl Journal {
    fn new(base: &Path, scope: &HostScope, operation: &str) -> Result<Self, String> {
        let mut directory = base.to_path_buf();
        std::fs::create_dir_all(&directory).map_err(|_| "storage_failed")?;
        for part in ["", &scope.account, &scope.session, ".operations", operation] {
            if !part.is_empty() {
                directory.push(part);
                std::fs::create_dir(&directory)
                    .or_else(|e| {
                        if e.kind() == std::io::ErrorKind::AlreadyExists {
                            Ok(())
                        } else {
                            Err(e)
                        }
                    })
                    .map_err(|_| "storage_failed")?;
            }
            if !std::fs::symlink_metadata(&directory)
                .map_err(|_| "storage_failed")?
                .is_dir()
            {
                return Err("unsafe_storage_directory".into());
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
                    .map_err(|_| "storage_failed")?;
            }
        }
        Ok(Self {
            directory,
            sequence: 0,
            finished: false,
            publication_started: false,
        })
    }
    fn stage(&mut self, stage: &str, data: &Value) -> Result<(), String> {
        use std::io::Write;
        if self.sequence >= 20 {
            return Err("stage_limit_exceeded".into());
        }
        let bytes = json!({"version":"axwise.stage.v1","stage":stage,"createdAt":chrono::Utc::now().to_rfc3339(),"data":data}).to_string();
        if bytes.len() > LIMIT {
            return Err("stage_snapshot_too_large".into());
        }
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(
                self.directory
                    .join(format!("{:02}-{stage}.json", self.sequence)),
            )
            .map_err(|_| "journal_failed")?;
        file.write_all(bytes.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|_| "journal_failed")?;
        self.sequence += 1;
        Ok(())
    }
}
impl Drop for Journal {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.stage(
                "interrupted",
                &json!({"completed":false,"automaticResume":false}),
            );
        }
    }
}

const LIMIT: usize = 1_048_576;
const TOOLS: &[&str] = &[
    "create_prd",
    "analyze_interviews",
    "simulate_interviews",
    "prepare_discovery",
    "research_market",
    "generate_personas",
    "chat_with_persona",
    "create_delivery_brief",
];
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn value_digest(value: &Value) -> String {
    digest(value.to_string().as_bytes())
}
fn configured_path(key: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(
        std::env::var_os(key).ok_or_else(|| format!("missing_host_configuration: {key}"))?,
    );
    if !path.is_absolute() {
        return Err(format!("invalid_host_configuration: {key}"));
    }
    Ok(path)
}

/// Killing or dropping a turn kills its active worker. One bounded protocol frame per process.
async fn bounded_command(
    mut command: Command,
    input: Option<&Value>,
    limit: usize,
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(|_| "worker_unavailable")?;
    let mut stdout = child.stdout.take().ok_or("worker_stdout_unavailable")?;
    let mut stdin = child.stdin.take().ok_or("worker_stdin_unavailable")?;
    let request = input.map(|v| format!("{v}\n")).unwrap_or_default();
    if request.len() > LIMIT {
        return Err("worker_input_too_large".into());
    }
    let run = async {
        let write = async {
            stdin.write_all(request.as_bytes()).await?;
            drop(stdin);
            Ok::<_, std::io::Error>(())
        };
        let read = async {
            let mut bytes = Vec::new();
            (&mut stdout)
                .take(limit as u64 + 1)
                .read_to_end(&mut bytes)
                .await?;
            Ok::<_, std::io::Error>(bytes)
        };
        let (_, bytes) = tokio::try_join!(write, read).map_err(|_| "worker_transport_failed")?;
        if bytes.len() > limit {
            return Err("worker_output_too_large".to_string());
        }
        let status = child.wait().await.map_err(|_| "worker_wait_failed")?;
        if !status.success() {
            return Err("worker_failed".into());
        }
        Ok(bytes)
    };
    tokio::time::timeout(timeout, run)
        .await
        .map_err(|_| "worker_timeout".to_string())?
}

const VALIDATION_DIAGNOSTICS: &[&str] = &[
    "INVALID_CANDIDATE_SCHEMA",
    "INVALID_PRD_SECTIONS",
    "UNKNOWN_SOURCE_REFERENCE",
    "INVALID_SOURCE_QUOTE",
    "SYNTHETIC_PROVENANCE_MISMATCH",
    "INVALID_OWNER_DECISION",
    "INVALID_ANALYSIS_LINEAGE",
    "UNKNOWN_FINDING_REFERENCE",
    "MISSING_REQUIREMENT_FINDING_LINK",
    "INVALID_MODEL_JSON",
    "MISSING_CONFLICT_GAP",
    "MISSING_INSUFFICIENT_GAP",
    "UNREQUESTED_ANALYSIS_OUTPUT",
    "INVALID_PRD_REVISION_BASE",
    "INVALID_PRD_REVISION_EDIT",
    "INVALID_PRD_REVISION_PATCH",
    "SOURCE_QUOTATION_BASIS_MISMATCH",
];

#[derive(Debug)]
struct KernelFailure {
    code: String,
    diagnostics: Vec<String>,
}
impl From<String> for KernelFailure {
    fn from(code: String) -> Self {
        let diagnostics = if code == "INVALID_MODEL_JSON" {
            vec![code.clone()]
        } else {
            vec![]
        };
        Self { code, diagnostics }
    }
}
impl From<KernelFailure> for String {
    fn from(error: KernelFailure) -> Self {
        error.code
    }
}
fn safe_failure_code(error: &str) -> &str {
    let code = error.split([':', ';', ' ']).next().unwrap_or_default();
    if !code.is_empty()
        && code.len() <= 64
        && code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        code
    } else {
        "AXWISE_FAILED"
    }
}
fn rejected(code: &str, diagnostics: &[String]) -> Value {
    let reason = if diagnostics.is_empty() {
        code.to_owned()
    } else {
        format!("{code}: {}", diagnostics.join(", "))
    };
    json!({"isError":true,"content":[{"type":"text","text":format!("AxWise artifact rejected ({reason}); no artifact was published.")}],
        "structuredContent":{"schemaVersion":"axwise.failure.v1","status":"rejected",
            "code":code,"diagnostics":diagnostics,"artifactPublished":false,"effectsPossible":false}})
}

pub async fn kernel(message: &Value) -> Result<Value, String> {
    kernel_checked(message).await.map_err(String::from)
}

async fn kernel_checked(message: &Value) -> Result<Value, KernelFailure> {
    kernel_frame(message)
        .await
        .map_err(KernelFailure::from)
        .and_then(|reply| {
            if reply["ok"] != true {
                let code =
                    safe_failure_code(reply["error"]["code"].as_str().unwrap_or("KERNEL_FAILED"))
                        .to_owned();
                let diagnostics = reply["error"]["diagnostics"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .filter(|code| VALIDATION_DIAGNOSTICS.contains(code))
                    .take(10)
                    .map(str::to_owned)
                    .collect();
                return Err(KernelFailure { code, diagnostics });
            }
            reply
                .get("result")
                .cloned()
                .ok_or_else(|| KernelFailure::from("invalid_kernel_result".to_owned()))
        })
}

async fn kernel_frame(message: &Value) -> Result<Value, String> {
    if serde_json::to_vec(message)
        .map_err(|_| "invalid_kernel_frame")?
        .len()
        > LIMIT
    {
        return Err("kernel_request_too_large".into());
    }
    let message = message.clone();
    let reply = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(move || crate::desktop_kernel::dispatch(&message)),
    )
    .await
    .map_err(|_| "kernel_timeout")?
    .map_err(|_| "kernel_failed")?;
    if serde_json::to_vec(&reply)
        .map_err(|_| "invalid_kernel_frame")?
        .len()
        > LIMIT
    {
        return Err("kernel_response_too_large".into());
    }
    Ok(reply)
}

pub async fn describe() -> Result<Value, String> {
    let value = kernel(&json!({"operation":"describe"})).await?;
    let tools = value["tools"].as_array().ok_or("invalid_kernel_catalog")?;
    if tools.len() != TOOLS.len()
        || TOOLS
            .iter()
            .any(|name| tools.iter().filter(|tool| tool["name"] == *name).count() != 1)
    {
        return Err("invalid_kernel_catalog".into());
    }
    Ok(value)
}

/// Inline local refs and keep the structural schema accepted by the managed
/// Gemini compiler. The unchanged full kernel schema remains authoritative.
pub fn provider_schema(schema: &Value) -> Result<Value, String> {
    fn expand(
        value: &Value,
        root: &Value,
        stack: &mut Vec<String>,
        depth: usize,
        nodes: &mut usize,
    ) -> Result<Value, String> {
        *nodes += 1;
        if depth > 40 || *nodes > 20_000 {
            return Err("schema_too_complex".into());
        }
        if let Some(reference) = value.get("$ref").and_then(Value::as_str) {
            if !reference.starts_with("#/") || stack.iter().any(|s| s == reference) {
                return Err("invalid_schema_reference".into());
            }
            let target = root
                .pointer(&reference[1..])
                .ok_or("missing_schema_reference")?;
            stack.push(reference.to_string());
            let mut expanded = expand(target, root, stack, depth + 1, nodes)?;
            stack.pop();
            for (key, item) in value.as_object().ok_or("invalid_schema")? {
                if key != "$ref" {
                    if !["title", "description", "default"].contains(&key.as_str()) {
                        return Err("unsupported_schema_ref_sibling".into());
                    }
                    expanded[key] = item.clone();
                }
            }
            return Ok(expanded);
        }
        if let Some(items) = value.as_array() {
            return items
                .iter()
                .map(|v| expand(v, root, stack, depth + 1, nodes))
                .collect();
        }
        if let Some(map) = value.as_object() {
            let mut output = serde_json::Map::new();
            for (key, item) in map {
                if key != "$defs" && key != "definitions" {
                    output.insert(key.clone(), expand(item, root, stack, depth + 1, nodes)?);
                }
            }
            return Ok(Value::Object(output));
        }
        Ok(value.clone())
    }
    fn hints(value: &Value) -> Result<Value, String> {
        let map = value.as_object().ok_or("invalid_schema_node")?;
        let mut output = serde_json::Map::new();
        let mut descriptions = vec![];
        for (key, item) in map {
            match key.as_str() {
                "type" | "required" | "enum" => {
                    output.insert(key.clone(), item.clone());
                }
                "const" => {
                    output.insert("enum".into(), json!([item]));
                }
                "properties" => {
                    let properties = item
                        .as_object()
                        .ok_or("invalid_schema_properties")?
                        .iter()
                        .map(|(k, v)| Ok((k.clone(), hints(v)?)))
                        .collect::<Result<serde_json::Map<String, Value>, String>>()?;
                    output.insert(key.clone(), Value::Object(properties));
                }
                "items" => {
                    output.insert(key.clone(), hints(item)?);
                }
                "anyOf" | "oneOf" => {
                    output.insert(
                        key.clone(),
                        item.as_array()
                            .ok_or("invalid_schema_union")?
                            .iter()
                            .map(hints)
                            .collect::<Result<Value, String>>()?,
                    );
                }
                "description" => descriptions.push(
                    item.as_str()
                        .ok_or("invalid_schema_description")?
                        .to_string(),
                ),
                "title" | "examples" => {}
                "additionalProperties" if item == &Value::Bool(false) => {
                    descriptions.push("No additional properties (locally enforced).".into())
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "minLength" | "maxLength" | "pattern" | "format" | "minItems" | "maxItems"
                | "uniqueItems" | "minProperties" | "maxProperties" | "default" => {
                    descriptions.push(format!("Locally enforced: {key}={item}."))
                }
                _ => return Err(format!("unsupported_schema_keyword: {key}")),
            }
        }
        if !descriptions.is_empty() {
            output.insert("description".into(), json!(descriptions.join(" ")));
        }
        Ok(Value::Object(output))
    }
    if schema.to_string().len() > 256_000 {
        return Err("schema_too_large".into());
    }
    let expanded = expand(schema, schema, &mut Vec::new(), 0, &mut 0)?;
    if expanded.to_string().len() > 256_000 {
        return Err("schema_too_large".into());
    }
    hints(&expanded)
}

async fn protected_auth_refresh(command: Command) -> Result<Vec<u8>, String> {
    let refresh = AuthRefresh::begin();
    let task = tokio::spawn(async move {
        let _refresh = refresh;
        bounded_command(command, None, 32_768, Duration::from_secs(60)).await
    });
    task.await
        .map_err(|_| "login_required")?
        .map_err(|_| "login_required".into())
}

async fn managed_provider(scope: &HostScope) -> Result<ModelProvider, String> {
    let (token, base) = if let Some(runtime) = std::env::var_os("ORQALY_DESKTOP_RUNTIME_ROOT") {
        let runtime = PathBuf::from(runtime);
        let profile = configured_path("GOOSE_PATH_ROOT")?;
        if profile.file_name().and_then(|s| s.to_str()) != Some(&scope.account) {
            return Err("account_scope_mismatch".into());
        }
        // The provider's configured base may be the desktop's approved loopback
        // relay. Paths are derived from the host bundle, never model arguments.
        let config: Value = serde_json::from_slice(
            &std::fs::read(profile.join("config/custom_providers/orqaly.json"))
                .map_err(|_| "provider_config_unavailable")?,
        )
        .map_err(|_| "invalid_provider_config")?;
        if config["headers"]["X-Orqaly-Account-Hash"].as_str() != Some(&scope.account) {
            return Err("provider_scope_mismatch".into());
        }
        let mut command = Command::new(runtime.join("node").join(if cfg!(windows) {
            "node.exe"
        } else {
            "bin/node"
        }));
        command
            .arg(runtime.join("connector/src/cli.mjs"))
            .arg("token")
            .arg("--config")
            .arg(runtime.join("connector/production.config.example.json"))
            .current_dir(runtime.join("connector"));
        let bytes = protected_auth_refresh(command).await?;
        let token = String::from_utf8(bytes)
            .map_err(|_| "invalid_account_token")?
            .trim()
            .to_string();
        let base = config["base_url"]
            .as_str()
            .ok_or("missing_managed_gateway_url")?
            .to_string();
        (token, base)
    } else {
        (
            std::env::var("AXWISE_ACCOUNT_TOKEN")
                .or_else(|_| std::env::var("ORQALY_ACCOUNT_TOKEN"))
                .map_err(|_| "missing_account_token")?,
            std::env::var("AXWISE_GATEWAY_URL")
                .or_else(|_| std::env::var("ORQALY_GATEWAY_URL"))
                .map_err(|_| "missing_managed_gateway_url")?,
        )
    };
    let url = reqwest::Url::parse(&base).map_err(|_| "invalid_managed_gateway_url")?;
    if (url.scheme() != "https" && !(url.scheme() == "http" && url.host_str() == Some("127.0.0.1")))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || token.is_empty()
        || token.bytes().any(|b| b.is_ascii_whitespace())
    {
        return Err("invalid_managed_gateway_configuration".into());
    }
    Ok(ModelProvider::with_account_hash(
        ProviderType::DesktopGateway,
        token,
        Some(base),
        "orqaly-gemini".into(),
        Some(scope.account.clone()),
    ))
}

/// Read each segment using openat/O_NOFOLLOW; never follow links out of a scope.
#[cfg(unix)]
fn read_owned(base: &Path, scope: &HostScope, name: &str) -> Result<Vec<u8>, String> {
    use std::{
        ffi::CString,
        io::Read,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::{ffi::OsStrExt, fs::OpenOptionsExt},
        },
    };
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open(base)
        .map_err(|_| "artifact_store_unavailable")?;
    let parts = [&scope.account, &scope.session, name];
    for (index, part) in parts.iter().enumerate() {
        let part = CString::new(Path::new(part).as_os_str().as_bytes())
            .map_err(|_| "invalid_artifact_path")?;
        let flags = libc::O_RDONLY
            | libc::O_NOFOLLOW
            | libc::O_CLOEXEC
            | if index == 2 {
                libc::O_NONBLOCK
            } else {
                libc::O_DIRECTORY
            };
        let fd = unsafe { libc::openat(file.as_raw_fd(), part.as_ptr(), flags) };
        if fd < 0 {
            return Err("artifact_not_found_or_wrong_owner".into());
        }
        file = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    let info = file.metadata().map_err(|_| "artifact_metadata_failed")?;
    if !info.is_file() || info.len() == 0 || info.len() > LIMIT as u64 {
        return Err("invalid_artifact_file".into());
    }
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "artifact_read_failed")?;
    if bytes.len() > LIMIT {
        return Err("artifact_too_large".into());
    }
    Ok(bytes)
}
#[cfg(not(unix))]
fn read_owned(base: &Path, scope: &HostScope, name: &str) -> Result<Vec<u8>, String> {
    let mut path = base.to_path_buf();
    for part in [&scope.account, &scope.session, name] {
        path.push(part);
        if std::fs::symlink_metadata(&path)
            .map_err(|_| "artifact_not_found")?
            .file_type()
            .is_symlink()
        {
            return Err("artifact_symlink_rejected".into());
        }
    }
    let bytes = std::fs::read(path).map_err(|_| "artifact_read_failed")?;
    if bytes.is_empty() || bytes.len() > LIMIT {
        return Err("invalid_artifact_file".into());
    }
    Ok(bytes)
}

pub fn resolve_reference(
    base: &Path,
    scope: &HostScope,
    reference: &Value,
) -> Result<Value, String> {
    let identity = reference["operationId"]
        .as_str()
        .ok_or("invalid_artifact_reference")?;
    if uuid::Uuid::parse_str(identity).is_err()
        || reference.as_object().is_none_or(|m| m.len() != 2)
    {
        return Err("invalid_artifact_reference".into());
    }
    let bytes = read_owned(base, scope, &format!("{identity}.json"))?;
    if reference["sha256"].as_str() != Some(digest(&bytes).as_str()) {
        return Err("artifact_digest_mismatch".into());
    }
    let record: Value = serde_json::from_slice(&bytes).map_err(|_| "invalid_artifact_record")?;
    if !["axwise.local-artifact.v2", "axwise.artifact.v3"]
        .contains(&record["version"].as_str().unwrap_or(""))
        || record["accountHash"] != scope.account
        || record["conversationId"] != scope.session
        || record["operationId"] != identity
        || !TOOLS.contains(&record["tool"].as_str().unwrap_or(""))
        || record["validation"]["valid"] != true
        || (record["tool"] != "simulate_interviews" && record["qualityReview"]["passed"] != true)
        || record["inputSha256"] != value_digest(&record["selectedInput"])
        || record["artifactSha256"] != value_digest(&record["artifact"])
    {
        return Err("artifact_not_accepted".into());
    }
    if let Some(resolved) = record.get("resolvedInput") {
        if record["resolvedInputSha256"] != value_digest(resolved) {
            return Err("resolved_input_digest_mismatch".into());
        }
    }
    if record["version"] == "axwise.artifact.v3" {
        let storage =
            StorageManager::new(base.join(&scope.account)).map_err(|_| "storage_unavailable")?;
        let accepted = storage
            .find_operation(identity)
            .map_err(|_| "storage_unavailable")?
            .ok_or("artifact_not_accepted")?;
        if accepted.session_id != scope.session
            || accepted.status != "completed"
            || accepted.sha256 != digest(&bytes)
        {
            return Err("artifact_not_accepted".into());
        }
    }
    let descriptor = &record["resultArtifact"];
    let path = base
        .join(&scope.account)
        .join(&scope.session)
        .join(format!("{identity}.md"));
    let markdown = read_owned(base, scope, &format!("{identity}.md"))?;
    if descriptor["revisionId"] != identity
        || descriptor["path"].as_str() != path.to_str()
        || descriptor["sha256"].as_str() != Some(digest(&markdown).as_str())
        || record["markdown"].as_str().map(str::as_bytes) != Some(markdown.as_slice())
    {
        return Err("artifact_markdown_mismatch".into());
    }
    Ok(
        json!({"input":record.get("resolvedInput").unwrap_or(&record["selectedInput"]), "candidate":record["candidate"], "artifact":record["artifact"], "reference":reference, "tool":record["tool"], "markdown":record["markdown"], "qualityReview":record["qualityReview"], "resultArtifact":descriptor}),
    )
}

async fn infer(provider: &ModelProvider, prepared: &Value) -> Result<Value, String> {
    let schema = provider_schema(&prepared["responseSchema"])?;
    let text = provider
        .complete_prepared(
            prepared["systemPrompt"].as_str().ok_or("invalid_prompt")?,
            prepared["userPrompt"].as_str().ok_or("invalid_prompt")?,
            prepared["maxOutputTokens"]
                .as_u64()
                .filter(|n| *n > 0 && *n <= 16_384)
                .ok_or("invalid_output_budget")? as u32,
            &schema,
        )
        .await
        .map_err(|_| "model_completion_failed; no artifact was published")?;
    serde_json::from_str(&text).map_err(|_| "INVALID_MODEL_JSON".into())
}

pub async fn execute(tool: &str, input: &Value, scope: &HostScope) -> Result<Value, String> {
    execute_with_progress(tool, input, scope, None).await
}

pub async fn execute_with_progress(
    tool: &str,
    input: &Value,
    scope: &HostScope,
    progress: Option<ProgressObserver>,
) -> Result<Value, String> {
    let scope = HostScope::resolve(Some(&json!(scope)), None, None, input)?;
    if !TOOLS.contains(&tool)
        || !input.is_object()
        || input.to_string().len() > 160_000
        || input.get("hostEvidence").is_some()
        || input.get("hostContext").is_some()
    {
        return Err("invalid_specialist_input".into());
    }
    tokio::time::timeout(
        Duration::from_secs(180),
        execute_bounded(tool, input, &scope, progress),
    )
    .await
    .map_err(|_| "axwise_timeout; no completed receipt was issued".to_string())?
}

async fn execute_bounded(
    tool: &str,
    input: &Value,
    scope: &HostScope,
    progress: Option<ProgressObserver>,
) -> Result<Value, String> {
    let base = configured_path("AXWISE_STATE_DIR")?;
    let operation_id = uuid::Uuid::new_v4().to_string();
    let mut journal = Journal::new(&base, scope, &operation_id)?;
    report(&progress, SpecialistPhase::Preparing);
    let outcome = execute_journaled(
        tool,
        input,
        scope,
        &base,
        &operation_id,
        &mut journal,
        &progress,
    )
    .await;
    match &outcome {
        Ok(value) if value["isError"] == true => {
            journal.stage("rejected", &value["structuredContent"])?;
            journal.finished = true;
        }
        Err(error) => {
            let code = safe_failure_code(error);
            journal.stage("rejected", &json!({"code":code,"effectsPossible":journal.publication_started,"artifactPublished":if journal.publication_started {Value::Null} else {json!(false)}}))?;
            journal.finished = true;
            if !journal.publication_started {
                return Ok(rejected(code, &[]));
            }
        }
        _ => {}
    }
    outcome
}

async fn execute_journaled(
    tool: &str,
    input: &Value,
    scope: &HostScope,
    base: &Path,
    operation_id: &str,
    journal: &mut Journal,
    progress: &Option<ProgressObserver>,
) -> Result<Value, String> {
    journal.stage("selected_input", &json!({"tool":tool,"input":input}))?;
    let legacy = std::env::var_os("AXWISE_LEGACY_STATE_DIR").map(PathBuf::from);
    let resolve = |reference: &Value| match resolve_reference(base, scope, reference) {
        Ok(value) => Ok(value),
        Err(error) => match &legacy {
            Some(legacy) => resolve_reference(legacy, scope, reference).map_err(|_| error),
            None => Err(error),
        },
    };
    let references = input
        .get("references")
        .map(|v| v.as_array().ok_or("invalid_references"))
        .transpose()?
        .cloned()
        .unwrap_or_default();
    if references.len() > 8 {
        return Err("too_many_references".into());
    }
    let mut evidence = references
        .iter()
        .map(resolve)
        .collect::<Result<Vec<_>, _>>()?;
    let parent = input
        .get("revisionOf")
        .filter(|v| !v.is_null())
        .map(resolve)
        .transpose()?;
    if let Some(parent) = &parent {
        if parent["tool"] != tool {
            return Err("revision_tool_mismatch".into());
        }
        if !evidence
            .iter()
            .any(|v| v["reference"] == parent["reference"])
        {
            evidence.push(parent.clone());
        }
        if tool == "create_prd"
            && input.get("analysisArtifact").is_none()
            && !evidence.iter().any(|v| v["tool"] == "analyze_interviews")
        {
            if let Some(reference) = parent["input"]
                .get("analysisArtifact")
                .filter(|v| !v.is_null())
            {
                evidence.push(resolve(reference)?);
            }
        }
    }
    if let Some(reference) = input.get("analysisArtifact").filter(|v| !v.is_null()) {
        if tool != "create_prd" {
            return Err("invalid_analysis_reference".into());
        }
        let analysis = resolve(reference)?;
        if analysis["tool"] != "analyze_interviews" || analysis["qualityReview"]["passed"] != true {
            return Err("invalid_analysis_reference".into());
        }
        if evidence
            .iter()
            .any(|v| v["tool"] == "analyze_interviews" && v["reference"] != *reference)
        {
            return Err("conflicting_analysis_references".into());
        }
        if !evidence.iter().any(|v| v["reference"] == *reference) {
            evidence.push(analysis);
        }
    }
    let request = |operation: &str| json!({"operation":operation,"tool":tool,"input":input,"hostEvidence":evidence});
    let prepared = kernel(&request("prepare")).await?;
    journal.stage("prepared", &json!({"tool":tool,"references":references}))?;
    let provider = managed_provider(scope).await?;
    let mut calls = 0;
    report(progress, SpecialistPhase::Generating);
    let generation = if let Some(tasks) = prepared.get("generationTasks") {
        let tasks = tasks
            .as_array()
            .filter(|v| (2..=12).contains(&v.len()))
            .ok_or("invalid_simulation_plan")?;
        if tool != "simulate_interviews"
            || prepared["aggregation"] != "simulation_cohort"
            || prepared["concurrency"] != 2
        {
            return Err("invalid_simulation_plan".into());
        }
        let mut parts = Vec::new();
        for batch in tasks.chunks(2) {
            if batch.len() == 2 {
                let (a, b) =
                    tokio::try_join!(infer(&provider, &batch[0]), infer(&provider, &batch[1]))?;
                parts.extend([a, b]);
            } else {
                parts.push(infer(&provider, &batch[0]).await?);
            }
        }
        calls += tasks.len();
        let fixed = prepared.get("fixedParticipants");
        let mut participants = Vec::new();
        let mut interviews = Vec::new();
        for part in parts {
            let map = part.as_object().ok_or("invalid_simulation_part")?;
            let answers = part["interviews"]
                .as_array()
                .filter(|v| v.len() == 1)
                .ok_or("invalid_simulation_part")?;
            if map.len() != if fixed.is_some() { 1 } else { 2 } {
                return Err("invalid_simulation_part".into());
            }
            interviews.extend(answers.clone());
            if fixed.is_none() {
                participants.extend(
                    part["participants"]
                        .as_array()
                        .filter(|v| v.len() == 1)
                        .ok_or("invalid_simulation_part")?
                        .clone(),
                );
            }
        }
        Ok(if fixed.is_some() {
            json!({"interviews":interviews})
        } else {
            json!({"participants":participants,"interviews":interviews})
        })
    } else {
        calls += 1;
        infer(&provider, &prepared).await
    };
    if let Err(error) = &generation {
        if error != "INVALID_MODEL_JSON" {
            return Err(error.clone());
        }
    }
    let mut candidate = generation.clone().unwrap_or(Value::Null);
    journal.stage("generated", &json!({"candidate":candidate,"calls":calls}))?;
    report(progress, SpecialistPhase::Validating);
    let finalize = |candidate: &Value| {
        let mut value = request("finalize");
        value["response"] = candidate.clone();
        value["context"] = prepared["context"].clone();
        value
    };
    let mut finalized = match generation {
        Ok(_) => kernel_checked(&finalize(&candidate)).await,
        Err(error) => Err(KernelFailure::from(error)),
    };
    let mut quality = None;
    if tool == "simulate_interviews" {
        if let Err(error) = &finalized {
            journal.stage(
                "validation_failed",
                &json!({"code":error.code,"diagnostics":error.diagnostics}),
            )?;
            return Ok(rejected(&error.code, &error.diagnostics));
        }
    } else {
        if let Ok(value) = &finalized {
            report(progress, SpecialistPhase::Reviewing);
            let mut review = request("prepare_review");
            review["artifact"] = value["artifact"].clone();
            let prompt = kernel(&review).await?;
            calls += 1;
            let response = infer(&provider, &prompt).await?;
            let mut check = request("validate_review");
            check["response"] = response;
            check["artifact"] = value["artifact"].clone();
            check["context"] = prompt["context"].clone();
            quality = Some(kernel(&check).await?);
        }
        if finalized.is_err() || quality.as_ref().is_none_or(|v| v["passed"] != true) {
            let mut repair = request("prepare_repair");
            repair["candidate"] = candidate.clone();
            repair["review"] = quality.clone().unwrap_or(Value::Null);
            repair["diagnostics"] = if let Err(error) = &finalized {
                journal.stage(
                    "validation_failed",
                    &json!({"code":error.code,"diagnostics":error.diagnostics}),
                )?;
                if error.diagnostics.is_empty() {
                    return Ok(rejected(&error.code, &[]));
                }
                json!(error.diagnostics)
            } else {
                json!([])
            };
            report(progress, SpecialistPhase::Repairing);
            let prompt = kernel(&repair).await?;
            calls += 1;
            candidate = infer(&provider, &prompt).await?;
            journal.stage("repaired", &json!({"candidate":candidate,"calls":calls}))?;
            report(progress, SpecialistPhase::Validating);
            finalized = kernel_checked(&finalize(&candidate)).await;
            let value = match &finalized {
                Ok(value) => value,
                Err(error) => {
                    journal.stage(
                        "validation_failed",
                        &json!({"code":error.code,"diagnostics":error.diagnostics}),
                    )?;
                    return Ok(rejected(&error.code, &error.diagnostics));
                }
            };
            report(progress, SpecialistPhase::Reviewing);
            let mut review = request("prepare_review");
            review["artifact"] = value["artifact"].clone();
            let prompt = kernel(&review).await?;
            calls += 1;
            let response = infer(&provider, &prompt).await?;
            let mut check = request("validate_review");
            check["response"] = response;
            check["artifact"] = value["artifact"].clone();
            check["context"] = prompt["context"].clone();
            quality = Some(kernel(&check).await?);
        }
        if quality.as_ref().is_none_or(|v| v["passed"] != true) {
            return Err("quality_review_failed; no artifact was published".into());
        }
    }
    let finalized = finalized?;
    journal.stage(
        "validated",
        &json!({"validation":finalized["validation"],"qualityReview":quality,"calls":calls}),
    )?;
    if finalized["validation"]["valid"] != true || !finalized["artifact"].is_object() {
        return Err("invalid_finalized_artifact".into());
    }
    let markdown = finalized["markdown"]
        .as_str()
        .filter(|v| !v.trim().is_empty())
        .ok_or("missing_rendered_document")?;
    let gate = if tool == "create_prd" || tool == "create_delivery_brief" {
        report(progress, SpecialistPhase::Auditing);
        let audited = finalized["artifact"].to_string();
        let criteria = finalized["artifact"]["requirements"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let value = crate::jev::audit_gate_b_with_credentials(
            scope,
            &audited,
            &criteria,
            Some(&json!({"input":input,"references":evidence})),
            &provider.api_key,
            &provider.base_url,
        )
        .await
        .map_err(|_| "gate_b_failed; no artifact was published")?;
        if !value.passed {
            return Err("gate_b_failed; no artifact was published".into());
        }
        Some(value)
    } else {
        None
    };
    let created_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let owner = base.join(&scope.account);
    let session = owner.join(&scope.session);
    let title = finalized["artifact"]["title"]
        .as_str()
        .or_else(|| markdown.lines().find_map(|s| s.strip_prefix("# ")))
        .unwrap_or(tool)
        .chars()
        .filter(|c| !c.is_control())
        .take(256)
        .collect::<String>();
    let descriptor = json!({"schemaVersion":"orqanix.result.v1","artifactId":parent.as_ref().map(|p| p["resultArtifact"]["artifactId"].clone()).unwrap_or(json!(operation_id)),"revisionId":operation_id,"parentRevisionId":parent.as_ref().map(|p| p["reference"]["operationId"].clone()),"title":title,"mimeType":"text/markdown","path":session.join(format!("{operation_id}.md")),"sha256":digest(markdown.as_bytes()),"createdAt":created_at,"previousPath":parent.as_ref().map(|p| p["resultArtifact"]["path"].clone())});
    let mut record = json!({"version":"axwise.artifact.v3","operationId":operation_id,"accountHash":scope.account,"conversationId":scope.session,"tool":tool,"createdAt":created_at,"selectedInput":input,"inputSha256":value_digest(input),"candidate":candidate,"artifact":finalized["artifact"],"artifactSha256":value_digest(&finalized["artifact"]),"markdown":markdown,"validation":finalized["validation"],"provenance":finalized["provenance"],"qualityReview":quality,"gateBAudit":gate,"resultArtifact":descriptor,"execution":{"orchestration":"rust","pipelineVersion":"axwise.specialist.v1","calls":calls,"inference":"authenticated-desktop-gateway"}});
    if let Some(resolved) = prepared.get("resolvedInput") {
        record["resolvedInput"] = resolved.clone();
        record["resolvedInputSha256"] = json!(value_digest(resolved));
    }
    let bytes =
        serde_json::to_string_pretty(&record).map_err(|_| "artifact_serialization_failed")?;
    if bytes.len() > LIMIT || markdown.len() > LIMIT {
        return Err("artifact_too_large".into());
    }
    let receipt = OperationRecord {
        operation_id: operation_id.to_owned(),
        session_id: scope.session.clone(),
        tool: tool.into(),
        title: Some(title.clone()),
        created_at,
        sha256: digest(bytes.as_bytes()),
        json_path: session
            .join(format!("{operation_id}.json"))
            .to_string_lossy()
            .into(),
        md_path: session
            .join(format!("{operation_id}.md"))
            .to_string_lossy()
            .into(),
        markdown: Some(markdown.into()),
        artifact_json: Some(finalized["artifact"].to_string()),
        candidate_json: Some(candidate.to_string()),
        input_json: Some(input.to_string()),
        provenance_json: Some(finalized["provenance"].to_string()),
        quality_review_json: quality.as_ref().map(Value::to_string),
        status: "completed".into(),
    };
    report(progress, SpecialistPhase::Saving);
    journal.publication_started = true;
    let mut storage =
        StorageManager::new(owner).map_err(|_| "storage_failed; no artifact was accepted")?;
    storage
        .save_operation(&receipt, &bytes, markdown)
        .map_err(|_| "storage_failed; no artifact was accepted")?;
    // Read-back acceptance verifies immutable disk bytes and the SQLite receipt.
    resolve_reference(
        base,
        scope,
        &json!({"operationId":operation_id,"sha256":receipt.sha256}),
    )?;
    journal.stage(
        "completed",
        &json!({"operationId":operation_id,"sha256":receipt.sha256,"storageAccepted":true}),
    )?;
    journal.finished = true;
    Ok(
        json!({"content":[{"type":"text","text":format!("{markdown}\n\nOpen saved result: [{title}](orqanix-result:{operation_id})\nSaved artifact reference: {}\nUse this saved result only after this tool has completed successfully.",json!({"operationId":operation_id,"sha256":receipt.sha256}))}],"structuredContent":{"tool":tool,"status":"completed","operationId":operation_id,"sha256":receipt.sha256,"bytes":bytes.len(),"artifactPath":receipt.json_path,"markdownPath":receipt.md_path,"storageAccepted":true,"qualityReview":quality.unwrap_or(json!({"passed":true,"method":"deterministic_simulation_validation"})),"gateBAudit":gate,"artifact":finalized["artifact"],"markdown":markdown,"resultArtifact":descriptor,"execution":record["execution"]}}),
    )
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_finishes_token_refresh_before_releasing_maintenance_count() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("refresh-completed");
        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            &format!(
                "/bin/sleep 0.2; printf done > '{}'; printf synthetic-fixture-token",
                marker.display()
            ),
        ]);
        let task = tokio::spawn(protected_auth_refresh(command));
        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while active_auth_refreshes() == 0 && tokio::time::Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert_eq!(active_auth_refreshes(), 1);
        task.abort();
        assert!(matches!(task.await, Err(error) if error.is_cancelled()));
        assert_eq!(active_auth_refreshes(), 1);
        while active_auth_refreshes() != 0 && tokio::time::Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(
            marker.exists(),
            "the detached refresh must complete its credential write"
        );
        assert_eq!(active_auth_refreshes(), 0);
    }
}
