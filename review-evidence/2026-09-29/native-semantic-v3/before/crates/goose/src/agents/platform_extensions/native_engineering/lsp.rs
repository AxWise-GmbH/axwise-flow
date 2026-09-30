//! Read-only LSP 3.17 queries against explicitly configured/local language servers.
//! Protocol reference: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
//! No agent, model request, installation, server command, or workspace edit is executed here.

use super::{json_result, workspace_path, workspace_root};
use crate::agents::ToolCallContext;
use rmcp::model::{CallToolResult, JsonObject, Tool, ToolAnnotations};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use url::Url;

const MAX_FRAME: usize = 1024 * 1024;
const MAX_HEADER: usize = 8192;
const MAX_DOCUMENT: u64 = 2 * 1024 * 1024;
const MAX_RESULT: usize = 64 * 1024;
const MAX_SERVERS: usize = 8;
const MAX_DOCUMENTS: usize = 32;
const CALL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Query {
    action: String,
    path: String,
    language: Option<String>,
    line: Option<u32>,
    character: Option<u32>,
    #[serde(default = "default_true")]
    include_declaration: bool,
}

fn default_true() -> bool {
    true
}

type ServerMap = HashMap<String, Vec<String>>;
type SessionKey = (PathBuf, String);

pub struct LspTools {
    configured: Result<ServerMap, String>,
    sessions: Mutex<HashMap<SessionKey, Arc<Mutex<Session>>>>,
    lifetime: CancellationToken,
}

impl Default for LspTools {
    fn default() -> Self {
        Self::new()
    }
}

impl LspTools {
    pub fn new() -> Self {
        let configured = match std::env::var("GOOSE_NATIVE_LSP_SERVERS") {
            Ok(value) => parse_servers(&value),
            Err(std::env::VarError::NotPresent) => Ok(HashMap::new()),
            Err(_) => Err("GOOSE_NATIVE_LSP_SERVERS must contain UTF-8 JSON".into()),
        };
        Self {
            configured,
            sessions: Mutex::new(HashMap::new()),
            lifetime: CancellationToken::new(),
        }
    }

    pub(super) fn configuration_summary(&self) -> String {
        match &self.configured {
            Ok(servers) => {
                let mut languages: Vec<_> = servers.keys().map(String::as_str).collect();
                languages.sort_unstable();
                let configured = if languages.is_empty() {
                    "none".to_string()
                } else {
                    languages.join(", ")
                };
                format!("Host-configured LSP languages: {configured}. Configuration is not a startup check: a successful lsp_query confirms that server answered. Other supported languages use known host PATH commands, whose availability is unverified. Never install a server automatically. LSP input limit: 2 MiB; response limit: 64 KiB; query deadline: 30 seconds. Diagnostics are current-document results; unversioned results are not proof of freshness or project-wide correctness.")
            }
            Err(_) => "Host LSP configuration is invalid; lsp_query is unavailable until the host configuration is corrected. Use bounded local alternatives and report this limitation; do not guess or install a server.".to_string(),
        }
    }

    pub fn tools() -> Vec<Tool> {
        let schema = json!({
            "type":"object", "additionalProperties":false,
            "required":["action","path"],
            "properties":{
                "action":{"type":"string","enum":["symbols","definition","references","hover","diagnostics"]},
                "path":{"type":"string","description":"Existing file inside this conversation's workspace; relative paths are preferred."},
                "language":{"type":"string","enum":["typescript","typescriptreact","javascript","javascriptreact","python","rust","go","c","cpp","json"],"description":"Optional language override; never an executable or command."},
                "line":{"type":"integer","minimum":0,"description":"Zero-based line, required for definition/references/hover."},
                "character":{"type":"integer","minimum":0,"description":"Zero-based UTF-16 character offset, required for definition/references/hover."},
                "include_declaration":{"type":"boolean","default":true}
            }
        });
        vec![Tool::new(
            "lsp_query",
            "Prefer for semantic definitions, references, types and diagnostics. Query a real local language server for symbols, definition, references, hover, or current-document diagnostics. If the position is unknown, call symbols for the file first and use the returned selectionRange. Positions use zero-based lines and UTF-16 characters. Requires a server installed by the user or bundled by the host; unavailable servers are reported, never installed. Read-only protocol: server edits and commands are rejected. Diagnostics without a document version are explicitly unverified. This runs a trusted host-configured language-server process, not a model or delegated agent.",
            schema.as_object().expect("literal object").clone(),
        ).annotate(ToolAnnotations::from_raw(Some("Language intelligence".into()), Some(true), Some(false), Some(true), Some(true))) ]
    }

    pub async fn call_tool(
        &self,
        arguments: Option<JsonObject>,
        ctx: &ToolCallContext,
        cancellation_token: CancellationToken,
    ) -> CallToolResult {
        let query: Query =
            match serde_json::from_value(Value::Object(arguments.unwrap_or_default())) {
                Ok(query) => query,
                Err(_) => {
                    return failure(
                        "invalid_arguments",
                        "Use the documented lsp_query arguments.",
                    )
                }
            };
        if !matches!(
            query.action.as_str(),
            "symbols" | "definition" | "references" | "hover" | "diagnostics"
        ) {
            return failure("invalid_arguments", "Unsupported language-server action.");
        }
        let root = match workspace_root(ctx) {
            Ok(root) => root,
            Err(error) => return failure("invalid_workspace", &error),
        };
        let path = match workspace_path(ctx, &query.path) {
            Ok(path) => path,
            Err(error) => return failure("invalid_path", &error),
        };
        let language = match language_for(&path, query.language.as_deref()) {
            Some(language) => language,
            None => {
                return failure(
                    "unsupported_language",
                    "No supported language is selected for this file.",
                )
            }
        };
        let content = match bounded_document(&path).await {
            Ok(content) => content,
            Err(error) => return failure("invalid_document", &error),
        };
        if matches!(query.action.as_str(), "definition" | "references" | "hover")
            && !valid_position(&content, query.line, query.character)
        {
            return failure(
                "invalid_position",
                "Provide an in-bounds zero-based line and UTF-16 character offset.",
            );
        }
        let uri = match Url::from_file_path(&path) {
            Ok(uri) => uri.to_string(),
            Err(_) => return failure("invalid_path", "Cannot represent the file as an LSP URI."),
        };
        let server_language = server_language(language);
        let configured = match &self.configured {
            Ok(configured) => configured,
            Err(error) => return failure("invalid_server_configuration", error),
        };
        let argv = configured
            .get(server_language)
            .cloned()
            .unwrap_or_else(|| default_command(server_language));
        let key = (root.clone(), server_language.to_string());
        let operation = async {
            let session = {
                let mut sessions = self.sessions.lock().await;
                if let Some(session) = sessions.get(&key) {
                    session.clone()
                } else {
                    if sessions.len() >= MAX_SERVERS {
                        return Err("server_limit: At most eight workspace/language servers can be active in one extension.".to_string());
                    }
                    // Insert before any protocol I/O so cancelled initialization is cleaned up.
                    let session =
                        Arc::new(Mutex::new(Session::spawn(&root, &argv, server_language)?));
                    sessions.insert(key.clone(), session.clone());
                    session
                }
            };
            let mut server = session.lock().await;
            if server.closed {
                return Err(
                    "server_closed: The language server was stopped; retry the query.".into(),
                );
            }
            if !server.initialized {
                server.initialize().await?;
            }
            server.refresh_open_documents(&uri).await?;
            server.sync_document(&uri, language, content).await?;
            let version = server.documents.get(&uri).expect("opened document").version;
            let value = server.query(&query, &uri).await?;
            if serde_json::to_vec(&value)
                .map_err(|_| "invalid_result".to_string())?
                .len()
                > MAX_RESULT
            {
                return Err(
                    "output_too_large: The result exceeded 64 KiB; use a more specific query."
                        .into(),
                );
            }
            Ok(
                json!({"status":"completed", "action":query.action, "language":language,
                "path":query.path, "documentVersion":version, "positionEncoding":"utf-16", "result":value}),
            )
        };
        let outcome: Result<Value, String> = tokio::select! {
            biased;
            _ = cancellation_token.cancelled() => Err("cancelled: Language-server query cancelled.".into()),
            _ = self.lifetime.cancelled() => Err("cancelled: Language-server extension stopped.".into()),
            result = tokio::time::timeout(CALL_TIMEOUT, operation) => result.unwrap_or_else(|_| Err("timeout: Language-server query exceeded 30 seconds.".into())),
        };
        match outcome {
            Ok(value) => json_result(value, false),
            Err(error) => {
                // A timed-out/cancelled request may have unread responses or partial frames.
                // Retire that entire process; the next turn gets a fresh protocol session.
                let mut sessions = self.sessions.lock().await;
                if let Some(session) = sessions.get(&key).cloned() {
                    // Cancelling a queued call must not kill another active query.
                    if let Ok(mut server) = session.try_lock() {
                        sessions.remove(&key);
                        server.stop().await;
                    }
                }
                let (code, message) = error.split_once(": ").unwrap_or(("protocol_error", &error));
                failure(code, message)
            }
        }
    }
}

impl Drop for LspTools {
    fn drop(&mut self) {
        self.lifetime.cancel();
    }
}

fn failure(code: &str, message: &str) -> CallToolResult {
    json_result(
        json!({"status":"unavailable", "code":code, "message":message}),
        true,
    )
}

fn parse_servers(raw: &str) -> Result<ServerMap, String> {
    if raw.len() > 32 * 1024 {
        return Err("GOOSE_NATIVE_LSP_SERVERS exceeds 32 KiB".into());
    }
    let servers: ServerMap = serde_json::from_str(raw).map_err(|_| {
        "GOOSE_NATIVE_LSP_SERVERS must map language names to executable/argument arrays".to_string()
    })?;
    for (language, argv) in &servers {
        if !matches!(
            language.as_str(),
            "typescript" | "javascript" | "python" | "rust" | "go" | "c" | "cpp" | "json"
        ) || argv.is_empty()
            || argv.len() > 32
            || argv[0].is_empty()
            || argv
                .iter()
                .any(|arg| arg.contains('\0') || arg.len() > 4096)
        {
            return Err("Invalid host language-server configuration".into());
        }
    }
    Ok(servers)
}

fn language_for(path: &Path, selected: Option<&str>) -> Option<&'static str> {
    let value = selected.unwrap_or_else(|| {
        path.extension()
            .and_then(|part| part.to_str())
            .unwrap_or("")
    });
    match value {
        "typescript" | "ts" | "mts" | "cts" => Some("typescript"),
        "typescriptreact" | "tsx" => Some("typescriptreact"),
        "javascript" | "js" | "mjs" | "cjs" => Some("javascript"),
        "javascriptreact" | "jsx" => Some("javascriptreact"),
        "python" | "py" | "pyi" => Some("python"),
        "rust" | "rs" => Some("rust"),
        "go" => Some("go"),
        "c" | "h" => Some("c"),
        "cpp" | "cc" | "cxx" | "hpp" => Some("cpp"),
        "json" => Some("json"),
        _ => None,
    }
}

fn server_language(language: &str) -> &str {
    match language {
        "typescriptreact" => "typescript",
        "javascriptreact" => "javascript",
        other => other,
    }
}

fn default_command(language: &str) -> Vec<String> {
    let parts: &[&str] = match language {
        "typescript" | "javascript" => &["typescript-language-server", "--stdio"],
        "python" => &["pyright-langserver", "--stdio"],
        "rust" => &["rust-analyzer"],
        "go" => &["gopls"],
        "c" | "cpp" => &["clangd"],
        "json" => &["vscode-json-language-server", "--stdio"],
        _ => &[],
    };
    parts.iter().map(|part| (*part).to_string()).collect()
}

async fn bounded_document(path: &Path) -> Result<String, String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| "Cannot read the selected file.".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_DOCUMENT {
        return Err("Language-server input must be a regular UTF-8 file of at most 2 MiB.".into());
    }
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "Cannot open the selected file.".to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_DOCUMENT + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| "Cannot read the selected file.".to_string())?;
    if bytes.len() as u64 > MAX_DOCUMENT || bytes.contains(&0) {
        return Err("Language-server input is oversized or binary.".into());
    }
    String::from_utf8(bytes).map_err(|_| "Language-server input must be UTF-8.".into())
}

fn valid_position(text: &str, line: Option<u32>, character: Option<u32>) -> bool {
    let (Some(line), Some(character)) = (line, character) else {
        return false;
    };
    text.split('\n')
        .nth(line as usize)
        .map(|line| {
            let mut offset = 0;
            if character == 0 {
                return true;
            }
            for ch in line.trim_end_matches('\r').chars() {
                offset += ch.len_utf16() as u32;
                if offset == character {
                    return true;
                }
            }
            false
        })
        .unwrap_or(false)
}

fn end_position(text: &str) -> Value {
    let mut lines = text.split('\n');
    let first = lines.next().unwrap_or("");
    let mut line = 0;
    let mut last = first;
    for next in lines {
        line += 1;
        last = next;
    }
    json!({"line":line,"character":last.trim_end_matches('\r').encode_utf16().count()})
}

struct Document {
    text: String,
    language: String,
    version: i64,
    diagnostics: Option<Value>,
}

struct Session {
    root: PathBuf,
    child: Child,
    stdin: ChildStdin,
    messages: mpsc::Receiver<Result<Value, String>>,
    reader: JoinHandle<()>,
    stderr: JoinHandle<()>,
    capabilities: Value,
    documents: HashMap<String, Document>,
    next_id: u64,
    initialized: bool,
    closed: bool,
    process_id: Option<u32>,
    initialization_options: Value,
}

impl Session {
    fn spawn(root: &Path, argv: &[String], language: &str) -> Result<Self, String> {
        let executable = argv
            .first()
            .ok_or("server_unavailable: No language server is configured.")?;
        let initialization_options = initialization_options(root, argv, language)?;
        let executable = resolve_host_executable(root, executable)?;
        let mut command = Command::new(executable);
        command
            .args(&argv[1..])
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // Do not pass provider tokens or other application secrets to language servers.
        command.env_clear();
        for name in [
            "HOME",
            "TMPDIR",
            "TMP",
            "TEMP",
            "LANG",
            "SYSTEMROOT",
            "WINDIR",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
        ] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        // Relative/workspace PATH entries must not select repository-owned
        // executables when a language server starts a helper process.
        command.env("PATH", safe_host_path(root));
        // Querying Go symbols must not download modules or an alternate toolchain.
        command
            .env("GOPROXY", "off")
            .env("GOSUMDB", "off")
            .env("GOTOOLCHAIN", "local");
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command.spawn().map_err(|_| "server_unavailable: The configured language server could not start. Install/configure it through the host; this tool never installs servers.".to_string())?;
        let process_id = child.id();
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let mut stderr_pipe = child.stderr.take().expect("piped stderr");
        let (tx, messages) = mpsc::channel(16);
        let reader = tokio::spawn(async move {
            let mut stream = BufReader::new(stdout);
            loop {
                let frame = read_frame(&mut stream).await;
                let failed = frame.is_err();
                if tx.send(frame).await.is_err() || failed {
                    break;
                }
            }
        });
        let stderr = tokio::spawn(async move {
            // Drain in fixed-size chunks, retaining/returning no potentially sensitive text.
            let mut buffer = [0u8; 4096];
            while let Ok(size) = stderr_pipe.read(&mut buffer).await {
                if size == 0 {
                    break;
                }
            }
        });
        Ok(Self {
            root: root.into(),
            child,
            stdin,
            messages,
            reader,
            stderr,
            capabilities: Value::Null,
            documents: HashMap::new(),
            next_id: 1,
            initialized: false,
            closed: false,
            process_id,
            initialization_options,
        })
    }

    async fn send(&mut self, value: Value) -> Result<(), String> {
        let body = serde_json::to_vec(&value)
            .map_err(|_| "protocol_error: Invalid client message.".to_string())?;
        if body.len() > MAX_DOCUMENT as usize + MAX_HEADER {
            return Err("protocol_error: Client message too large.".into());
        }
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        self.stdin
            .write_all(header.as_bytes())
            .await
            .map_err(|_| "server_closed: Cannot write to the language server.".to_string())?;
        self.stdin
            .write_all(&body)
            .await
            .map_err(|_| "server_closed: Cannot write to the language server.".to_string())?;
        self.stdin
            .flush()
            .await
            .map_err(|_| "server_closed: Cannot flush language-server input.".into())
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.send(json!({"jsonrpc":"2.0","method":method,"params":params}))
            .await
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await?;
        loop {
            let message = self.receive().await?;
            if message.get("method").is_some() {
                self.handle_server_message(message).await?;
            } else if message.get("id") == Some(&json!(id)) {
                if let Some(error) = message.get("error") {
                    let code = error.get("code").and_then(Value::as_i64).unwrap_or(-32603);
                    return Err(format!(
                        "server_error: Language server rejected {method} (code {code})."
                    ));
                }
                return message.get("result").cloned().ok_or_else(|| {
                    "protocol_error: Language-server response has no result.".into()
                });
            }
        }
    }

    async fn receive(&mut self) -> Result<Value, String> {
        self.messages
            .recv()
            .await
            .ok_or_else(|| "server_closed: Language-server output ended.".to_string())?
    }

    async fn handle_server_message(&mut self, message: Value) -> Result<(), String> {
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        if let Some(id) = message.get("id") {
            let result = match method {
                "workspace/applyEdit" => json!({"applied":false,"failureReason":"This read-only client rejects server edits."}),
                "workspace/configuration" => {
                    let items = message.pointer("/params/items").and_then(Value::as_array).ok_or("protocol_error: Invalid configuration request.")?;
                    if items.len() > 128 { return Err("protocol_error: Configuration request exceeded its bound.".into()); }
                    Value::Array(items.iter().map(|item| safe_configuration(item.get("section").and_then(Value::as_str).unwrap_or(""))).collect())
                }
                "workspace/workspaceFolders" => json!([{"uri":file_uri(&self.root)?,"name":"workspace"}]),
                "window/workDoneProgress/create" | "window/showMessageRequest" => Value::Null,
                _ => return self.send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Client method not supported; edits and command execution are forbidden."}})).await,
            };
            return self
                .send(json!({"jsonrpc":"2.0","id":id,"result":result}))
                .await;
        }
        if method == "textDocument/publishDiagnostics" {
            let Some(params) = message.get("params") else {
                return Ok(());
            };
            if let Some(document) = params
                .get("uri")
                .and_then(Value::as_str)
                .and_then(|uri| self.documents.get_mut(uri))
            {
                if params
                    .get("version")
                    .and_then(Value::as_i64)
                    .is_some_and(|version| version != document.version)
                {
                    return Ok(()); // Never reuse diagnostics explicitly tied to an older document.
                }
                if params.get("diagnostics").is_some_and(Value::is_array) {
                    document.diagnostics = Some(params.clone());
                }
            }
        }
        Ok(())
    }

    async fn initialize(&mut self) -> Result<(), String> {
        let root_uri = file_uri(&self.root)?;
        let result = self.request("initialize", json!({
            "processId":std::process::id(),"rootUri":root_uri,
            "clientInfo":{"name":"goose-native-engineering","version":"1.0.0"},
            "workspaceFolders":[{"uri":root_uri,"name":"workspace"}],
            "capabilities":{
                "general":{"positionEncodings":["utf-16"]},
                "workspace":{"applyEdit":false,"configuration":true,"workspaceFolders":true},
                "textDocument":{
                    "synchronization":{"dynamicRegistration":false,"didSave":true},
                    "documentSymbol":{"hierarchicalDocumentSymbolSupport":true},
                    "hover":{"contentFormat":["plaintext","markdown"]},
                    "publishDiagnostics":{"versionSupport":true},
                    "diagnostic":{"dynamicRegistration":false,"relatedDocumentSupport":false}
                }
            },
            "initializationOptions":self.initialization_options
        })).await?;
        self.capabilities = result
            .get("capabilities")
            .cloned()
            .filter(Value::is_object)
            .ok_or("protocol_error: initialize omitted capabilities.")?;
        if self
            .capabilities
            .get("positionEncoding")
            .and_then(Value::as_str)
            .is_some_and(|encoding| encoding != "utf-16")
        {
            return Err(
                "unsupported_encoding: Language server did not negotiate UTF-16 positions.".into(),
            );
        }
        self.notify("initialized", json!({})).await?;
        self.initialized = true;
        Ok(())
    }

    async fn sync_document(
        &mut self,
        uri: &str,
        language: &str,
        text: String,
    ) -> Result<(), String> {
        // Process already-arrived notifications before changing document versions.
        while let Ok(frame) = self.messages.try_recv() {
            self.handle_server_message(frame?).await?;
        }
        if let Some(previous) = self.documents.get(uri) {
            if previous.text == text {
                return Ok(());
            }
            let version = previous.version + 1;
            let sync = self
                .capabilities
                .get("textDocumentSync")
                .unwrap_or(&Value::Null);
            let kind = sync
                .as_u64()
                .or_else(|| sync.get("change").and_then(Value::as_u64))
                .unwrap_or(0);
            let change = match kind {
                1 => json!({"text":text}),
                2 => {
                    json!({"range":{"start":{"line":0,"character":0},"end":end_position(&previous.text)},"text":text})
                }
                _ => {
                    return Err(
                        "unsupported_sync: Language server cannot synchronize changed files."
                            .into(),
                    )
                }
            };
            self.documents.insert(
                uri.into(),
                Document {
                    text,
                    language: language.into(),
                    version,
                    diagnostics: None,
                },
            );
            self.notify(
                "textDocument/didChange",
                json!({"textDocument":{"uri":uri,"version":version},"contentChanges":[change]}),
            )
            .await?;
        } else {
            if self.documents.len() >= MAX_DOCUMENTS {
                if let Some(old) = self.documents.keys().next().cloned() {
                    self.documents.remove(&old);
                    self.notify("textDocument/didClose", json!({"textDocument":{"uri":old}}))
                        .await?;
                }
            }
            self.documents.insert(
                uri.into(),
                Document {
                    text: text.clone(),
                    language: language.into(),
                    version: 1,
                    diagnostics: None,
                },
            );
            self.notify(
                "textDocument/didOpen",
                json!({"textDocument":{"uri":uri,"languageId":language,"version":1,"text":text}}),
            )
            .await?;
        }
        Ok(())
    }

    async fn refresh_open_documents(&mut self, requested_uri: &str) -> Result<(), String> {
        // Open documents are owned by the client, so language servers cannot see
        // another tool's disk edits until we synchronize those snapshots too.
        let open: Vec<_> = self
            .documents
            .iter()
            .filter(|(uri, _)| uri.as_str() != requested_uri)
            .map(|(uri, document)| {
                (
                    uri.clone(),
                    document.language.clone(),
                    document.text.clone(),
                )
            })
            .collect();
        for (uri, language, previous) in open {
            let path = Url::parse(&uri)
                .ok()
                .and_then(|uri| uri.to_file_path().ok())
                .ok_or("invalid_path: An open document lost its local file URI.")?;
            let current = path.canonicalize();
            if current
                .as_ref()
                .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
            {
                self.documents.remove(&uri);
                self.notify("textDocument/didClose", json!({"textDocument":{"uri":uri}}))
                    .await?;
                continue;
            }
            let canonical =
                current.map_err(|_| "invalid_document: An open document became unavailable.")?;
            if canonical != path || !canonical.starts_with(&self.root) {
                return Err("invalid_document: An open document changed path identity.".into());
            }
            let text = bounded_document(&path).await?;
            if text != previous {
                for document in self.documents.values_mut() {
                    document.diagnostics = None;
                }
                self.sync_document(&uri, &language, text).await?;
            }
        }
        Ok(())
    }

    fn supports(&self, capability: &str) -> bool {
        self.capabilities
            .get(capability)
            .is_some_and(|value| value == &Value::Bool(true) || value.is_object())
    }

    async fn query(&mut self, query: &Query, uri: &str) -> Result<Value, String> {
        if query.action == "diagnostics" {
            if self.supports("diagnosticProvider") {
                let result = self
                    .request(
                        "textDocument/diagnostic",
                        json!({"textDocument":{"uri":uri}}),
                    )
                    .await?;
                if result.get("kind").and_then(Value::as_str) != Some("full")
                    || !result.get("items").is_some_and(Value::is_array)
                {
                    return Err(
                        "protocol_error: A fresh full diagnostic report was not returned.".into(),
                    );
                }
                return Ok(
                    json!({"diagnostics":result["items"],"freshness":"requested_current_version","documentVersion":self.documents[uri].version}),
                );
            }
            loop {
                if let Some(report) = self.documents[uri].diagnostics.clone() {
                    let versioned = report.get("version").and_then(Value::as_i64)
                        == Some(self.documents[uri].version);
                    return Ok(json!({"diagnostics":report["diagnostics"],
                        "freshness":if versioned {"current_version"} else {"server_unversioned"},
                        "versionVerified":versioned,"documentVersion":report.get("version")}));
                }
                let message = self.receive().await?;
                self.handle_server_message(message).await?;
            }
        }
        let (method, capability) = match query.action.as_str() {
            "symbols" => ("textDocument/documentSymbol", "documentSymbolProvider"),
            "definition" => ("textDocument/definition", "definitionProvider"),
            "references" => ("textDocument/references", "referencesProvider"),
            "hover" => ("textDocument/hover", "hoverProvider"),
            _ => return Err("invalid_arguments: Unsupported query.".into()),
        };
        if !self.supports(capability) {
            return Err("unsupported_capability: This language server does not support the requested query.".into());
        }
        let mut params = json!({"textDocument":{"uri":uri}});
        if query.action != "symbols" {
            params["position"] = json!({"line":query.line,"character":query.character});
        }
        if query.action == "references" {
            params["context"] = json!({"includeDeclaration":query.include_declaration});
        }
        self.request(method, params).await
    }

    async fn stop(&mut self) {
        if self.closed {
            return;
        }
        self.closed = true;
        let _ = tokio::time::timeout(Duration::from_millis(250), async {
            if self.initialized {
                let _ = self.request("shutdown", Value::Null).await;
            }
            let _ = self.notify("exit", Value::Null).await;
        })
        .await;
        self.kill_process_group();
        let _ = tokio::time::timeout(Duration::from_millis(500), self.child.wait()).await;
        self.reader.abort();
        self.stderr.abort();
    }

    fn kill_process_group(&mut self) {
        #[cfg(unix)]
        if let Some(id) = self.process_id.take() {
            // Each child starts a fresh process group. Kill descendants (e.g. tsserver)
            // even if the language-server parent already exited.
            unsafe {
                libc::kill(-(id as i32), libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        if let Some(id) = self.process_id.take() {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &id.to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.kill_process_group();
        self.reader.abort();
        self.stderr.abort();
    }
}

fn file_uri(path: &Path) -> Result<String, String> {
    Url::from_file_path(path)
        .map(|uri| uri.to_string())
        .map_err(|_| "invalid_path: Cannot construct a workspace URI.".into())
}

fn safe_configuration(section: &str) -> Value {
    match section {
        "rust-analyzer" => {
            json!({"cargo":{"buildScripts":{"enable":false}},"procMacro":{"enable":false},"checkOnSave":false,"check":{"enable":false}})
        }
        "python" => json!({"analysis":{"autoSearchPaths":false,"diagnosticMode":"openFilesOnly"}}),
        "python.analysis" => json!({"autoSearchPaths":false,"diagnosticMode":"openFilesOnly"}),
        _ => json!({}),
    }
}

fn safe_host_path(root: &Path) -> std::ffi::OsString {
    let directories: Vec<_> = std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).collect())
        .unwrap_or_default();
    std::env::join_paths(directories.into_iter().filter(|directory| {
        directory.is_absolute()
            && directory
                .canonicalize()
                .is_ok_and(|path| !path.starts_with(root))
    }))
    .unwrap_or_default()
}

fn resolve_host_executable(root: &Path, executable: &str) -> Result<PathBuf, String> {
    let supplied = Path::new(executable);
    // Absolute paths come only from the trusted host configuration. Bare names
    // are resolved against non-workspace PATH entries before setting cwd.
    if supplied.is_absolute() {
        return supplied.canonicalize().map_err(|_| {
            "server_unavailable: The host-configured language-server executable is missing.".into()
        });
    }
    if supplied.components().count() != 1 {
        return Err("invalid_server_configuration: Server executables must be absolute paths or names on the host PATH.".into());
    }
    for directory in std::env::split_paths(&safe_host_path(root)) {
        let mut candidates = vec![directory.join(executable)];
        if cfg!(windows) && supplied.extension().is_none() {
            candidates.extend(
                ["exe", "cmd", "bat"]
                    .map(|extension| directory.join(format!("{executable}.{extension}"))),
            );
        }
        for candidate in candidates {
            if let Ok(canonical) = candidate.canonicalize() {
                if canonical.is_file() && !canonical.starts_with(root) {
                    return Ok(canonical);
                }
            }
        }
    }
    Err(
        "server_unavailable: No installed language-server executable was found on the host PATH."
            .into(),
    )
}

fn initialization_options(root: &Path, argv: &[String], language: &str) -> Result<Value, String> {
    if language == "rust" {
        return Ok(safe_configuration("rust-analyzer"));
    }
    if !matches!(language, "typescript" | "javascript") {
        return Ok(json!({}));
    }
    // Pin the TypeScript implementation alongside the trusted host server, never
    // execute a workspace's node_modules/typescript or tsconfig plugins.
    for argument in argv {
        let candidates: Vec<_> = resolve_host_executable(root, argument)
            .into_iter()
            .collect();
        for candidate in candidates {
            let Ok(cli) = candidate.canonicalize() else {
                continue;
            };
            let Some(package) = cli.parent().and_then(Path::parent) else {
                continue;
            };
            if package.file_name().and_then(|name| name.to_str())
                != Some("typescript-language-server")
            {
                continue;
            }
            let Some(modules) = package.parent() else {
                continue;
            };
            let Ok(tsserver) = modules.join("typescript/lib/tsserver.js").canonicalize() else {
                continue;
            };
            if tsserver.is_file() {
                return Ok(
                    json!({"disableAutomaticTypingAcquisition":true,"plugins":[],
                    "tsserver":{"path":tsserver,"fallbackPath":tsserver}}),
                );
            }
        }
    }
    Err("server_unavailable: TypeScript queries require a trusted TypeScript installation beside typescript-language-server; workspace TypeScript is not executed.".into())
}

async fn read_frame<R: AsyncRead + Unpin>(reader: &mut BufReader<R>) -> Result<Value, String> {
    let mut header = Vec::new();
    loop {
        let available = reader
            .fill_buf()
            .await
            .map_err(|_| "protocol_error: Cannot read LSP headers.".to_string())?;
        if available.is_empty() {
            return Err("server_closed: Language-server output ended.".into());
        }
        let mut consumed = 0;
        for byte in available {
            header.push(*byte);
            consumed += 1;
            if header.len() > MAX_HEADER {
                return Err("protocol_error: LSP header exceeds its bound.".into());
            }
            if header.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        reader.consume(consumed);
        if header.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    let header = std::str::from_utf8(&header)
        .map_err(|_| "protocol_error: LSP header is not ASCII.".to_string())?;
    let mut length = None;
    for line in header.trim_end().split("\r\n") {
        let (name, value) = line
            .split_once(':')
            .ok_or("protocol_error: Malformed LSP header.")?;
        if name.eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return Err("protocol_error: Duplicate Content-Length.".into());
            }
            length = Some(
                value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| "protocol_error: Invalid Content-Length.".to_string())?,
            );
        }
    }
    let length = length
        .filter(|length| *length > 0 && *length <= MAX_FRAME)
        .ok_or("protocol_error: Missing or oversized LSP Content-Length.")?;
    let mut bytes = vec![0; length];
    reader
        .read_exact(&mut bytes)
        .await
        .map_err(|_| "protocol_error: Incomplete LSP body.".to_string())?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "protocol_error: Invalid LSP JSON.".to_string())?;
    if !value.is_object() || value.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err("protocol_error: Invalid JSON-RPC envelope.".into());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_guidance_reports_configuration_without_commands_or_startup_claims() {
        let mut tools = client(vec!["/private/host-secret-command".into()]);
        tools
            .configured
            .as_mut()
            .unwrap()
            .insert("python".into(), vec!["private-argument".into()]);
        let summary = tools.configuration_summary();
        assert!(summary.contains("Host-configured LSP languages: python, rust."));
        assert!(summary.contains("Configuration is not a startup check"));
        assert!(!summary.contains("host-secret-command"));
        assert!(!summary.contains("private-argument"));
        tools.configured = Ok(HashMap::new());
        assert!(tools.configuration_summary().contains("languages: none."));
        assert!(tools
            .configuration_summary()
            .contains("availability is unverified"));
        tools.configured = Err("private-malformed-configuration".into());
        let invalid = tools.configuration_summary();
        assert!(invalid.contains("configuration is invalid"));
        assert!(!invalid.contains("private-malformed"));
    }

    fn fixture(mode: &str, log: &Path) -> Option<Vec<String>> {
        let node = std::env::var("GOOSE_TEST_NODE").unwrap_or_else(|_| "node".into());
        if std::process::Command::new(&node)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_err()
        {
            eprintln!("LSP process fixture requires Node (set GOOSE_TEST_NODE); protocol parser tests still run.");
            return None;
        }
        Some(vec![
            node,
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/native_lsp_server.mjs")
                .to_string_lossy()
                .into(),
            log.to_string_lossy().into(),
            mode.into(),
        ])
    }

    fn client(argv: Vec<String>) -> LspTools {
        LspTools {
            configured: Ok(HashMap::from([("rust".into(), argv)])),
            sessions: Mutex::new(HashMap::new()),
            lifetime: CancellationToken::new(),
        }
    }

    fn context(root: &Path) -> ToolCallContext {
        ToolCallContext::new("lsp-fixture".into(), Some(root.to_path_buf()), None)
    }

    async fn query(client: &LspTools, root: &Path, action: &str) -> Value {
        client
            .call_tool(
                Some(
                    json!({"action":action,"path":"fixture.rs","line":0,"character":0})
                        .as_object()
                        .unwrap()
                        .clone(),
                ),
                &context(root),
                CancellationToken::new(),
            )
            .await
            .structured_content
            .unwrap()
    }

    #[test]
    fn validates_host_configuration_and_utf16_positions() {
        assert!(parse_servers(r#"{"rust":["rust-analyzer"]}"#).is_ok());
        assert!(parse_servers(r#"{"rust":"sh -c arbitrary"}"#).is_err());
        assert!(parse_servers(r#"{"unsupported":["server"]}"#).is_err());
        assert!(parse_servers(r#"{"rust":[]}"#).is_err());
        assert!(valid_position("a😀b\r\n", Some(0), Some(3)));
        assert!(!valid_position("a😀b", Some(0), Some(2)));
        assert!(!valid_position("a", Some(1), Some(0)));
        assert_eq!(end_position("a\r\n😀"), json!({"line":1,"character":2}));
        assert_eq!(server_language("typescriptreact"), "typescript");
    }

    #[tokio::test]
    async fn parses_byte_counted_fragmented_frames_and_rejects_bounds() {
        let body = serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"result":"😀"})).unwrap();
        let frame = [
            format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes(),
            body,
        ]
        .concat();
        let (mut writer, reader) = tokio::io::duplex(8);
        let sending = tokio::spawn(async move {
            writer.write_all(&frame).await.unwrap();
        });
        assert_eq!(
            read_frame(&mut BufReader::new(reader)).await.unwrap()["result"],
            "😀"
        );
        sending.await.unwrap();
        for invalid in [
            b"Content-Length: 1048577\r\n\r\n".as_slice(),
            b"Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}".as_slice(),
            b"Content-Length: 2\r\n\r\n{}".as_slice(),
        ] {
            assert!(read_frame(&mut BufReader::new(invalid)).await.is_err());
        }
    }

    #[tokio::test]
    async fn actual_protocol_preserves_versions_and_refuses_server_mutations() {
        let root = tempfile::tempdir().unwrap();
        let log = root.path().join("messages.jsonl");
        let Some(argv) = fixture("normal", &log) else {
            return;
        };
        std::fs::write(root.path().join("fixture.rs"), "fn first() {}\n").unwrap();
        let client = client(argv);
        let first = query(&client, root.path(), "symbols").await;
        assert_eq!(first["status"], "completed", "{first}");
        assert_eq!(first["documentVersion"], 1);
        assert_eq!(first["result"][0]["name"], "fn first() {}\n");
        std::fs::write(root.path().join("fixture.rs"), "fn second() {}\n").unwrap();
        let changed = query(&client, root.path(), "symbols").await;
        assert_eq!(changed["documentVersion"], 2);
        assert_eq!(changed["result"][0]["name"], "fn second() {}\n");
        let diagnostics = query(&client, root.path(), "diagnostics").await;
        assert_eq!(
            diagnostics["result"]["diagnostics"][0]["message"],
            "current diagnostic"
        );
        assert_eq!(diagnostics["result"]["freshness"], "current_version");
        for action in ["definition", "references", "hover"] {
            assert_eq!(
                query(&client, root.path(), action).await["status"],
                "completed"
            );
        }
        let session = client
            .sessions
            .lock()
            .await
            .values()
            .next()
            .unwrap()
            .clone();
        session.lock().await.stop().await;
        let messages: Vec<Value> = std::fs::read_to_string(&log)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(
            messages
                .iter()
                .filter(|message| message["method"] == "initialize")
                .count(),
            1
        );
        assert!(messages
            .iter()
            .any(|message| message["id"] == "forbidden-edit"
                && message["result"]["applied"] == false));
        assert!(messages
            .iter()
            .any(|message| message["id"] == "forbidden-command"
                && message["error"]["code"] == -32601));
        let change = messages
            .iter()
            .find(|message| message["method"] == "textDocument/didChange")
            .unwrap();
        assert_eq!(change["params"]["textDocument"]["version"], 2);
        assert_eq!(
            change["params"]["contentChanges"][0]["range"]["end"],
            json!({"line":1,"character":0})
        );
        assert!(messages
            .iter()
            .any(|message| message["method"] == "shutdown"));
    }

    #[tokio::test]
    async fn unversioned_push_diagnostics_are_not_claimed_fresh() {
        let root = tempfile::tempdir().unwrap();
        let Some(argv) = fixture("unversioned", &root.path().join("log")) else {
            return;
        };
        std::fs::write(root.path().join("fixture.rs"), "fn first() {}\n").unwrap();
        let client = client(argv);
        assert_eq!(
            query(&client, root.path(), "symbols").await["status"],
            "completed"
        );
        std::fs::write(root.path().join("fixture.rs"), "fn second() {}\n").unwrap();
        let result = query(&client, root.path(), "diagnostics").await;
        assert_eq!(result["result"]["freshness"], "server_unversioned");
        assert_eq!(result["result"]["versionVerified"], false);
    }

    #[tokio::test]
    async fn pull_diagnostics_and_server_errors_are_real_protocol_results() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("fixture.rs"), "fn fixture() {}\n").unwrap();
        for mode in ["pull", "error", "oversized"] {
            let Some(argv) = fixture(mode, &root.path().join(format!("{mode}.log"))) else {
                return;
            };
            let client = client(argv);
            let result = query(
                &client,
                root.path(),
                if mode == "pull" {
                    "diagnostics"
                } else {
                    "symbols"
                },
            )
            .await;
            if mode == "pull" {
                assert_eq!(
                    result["result"]["diagnostics"][0]["message"],
                    "pull diagnostic"
                );
            } else {
                assert_eq!(result["status"], "unavailable", "{result}");
                assert!(client.sessions.lock().await.is_empty());
            }
        }
    }

    #[tokio::test]
    async fn cancellation_stops_child_and_clears_session() {
        let root = tempfile::tempdir().unwrap();
        let log = root.path().join("log");
        let Some(argv) = fixture("hang", &log) else {
            return;
        };
        std::fs::write(root.path().join("fixture.rs"), "fn fixture() {}\n").unwrap();
        let client = client(argv);
        let token = CancellationToken::new();
        let cancel = token.clone();
        let cancelling = tokio::spawn(async move {
            for _ in 0..200 {
                if std::fs::read_to_string(&log)
                    .unwrap_or_default()
                    .contains("textDocument/documentSymbol")
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            cancel.cancel();
        });
        let result = client
            .call_tool(
                Some(
                    json!({"action":"symbols","path":"fixture.rs"})
                        .as_object()
                        .unwrap()
                        .clone(),
                ),
                &context(root.path()),
                token,
            )
            .await
            .structured_content
            .unwrap();
        cancelling.await.unwrap();
        assert_eq!(result["code"], "cancelled", "{result}");
        assert!(client.sessions.lock().await.is_empty());
    }

    #[tokio::test]
    async fn missing_server_and_path_escape_are_explicit_failures() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("fixture.rs"), "fn fixture() {}\n").unwrap();
        let client = client(vec![root
            .path()
            .join("missing-server")
            .to_string_lossy()
            .into()]);
        assert_eq!(
            query(&client, root.path(), "symbols").await["code"],
            "server_unavailable"
        );
        let result = client
            .call_tool(
                Some(
                    json!({"action":"symbols","path":"../outside.rs"})
                        .as_object()
                        .unwrap()
                        .clone(),
                ),
                &context(root.path()),
                CancellationToken::new(),
            )
            .await;
        assert_eq!(result.structured_content.unwrap()["code"], "invalid_path");
    }

    #[tokio::test]
    async fn synchronizes_other_open_documents_after_external_edits() {
        let root = tempfile::tempdir().unwrap();
        let Some(argv) = fixture("normal", &root.path().join("log")) else {
            return;
        };
        std::fs::write(root.path().join("fixture.rs"), "fn first() {}\n").unwrap();
        std::fs::write(root.path().join("other.rs"), "fn other() {}\n").unwrap();
        let client = client(argv);
        assert_eq!(
            query(&client, root.path(), "symbols").await["status"],
            "completed"
        );
        std::fs::write(
            root.path().join("fixture.rs"),
            "fn externally_changed() {}\n",
        )
        .unwrap();
        let result = client
            .call_tool(
                Some(
                    json!({"action":"symbols","path":"other.rs"})
                        .as_object()
                        .unwrap()
                        .clone(),
                ),
                &context(root.path()),
                CancellationToken::new(),
            )
            .await;
        assert_eq!(result.structured_content.unwrap()["status"], "completed");
        let session = client
            .sessions
            .lock()
            .await
            .values()
            .next()
            .unwrap()
            .clone();
        let server = session.lock().await;
        let uri = file_uri(&root.path().canonicalize().unwrap().join("fixture.rs")).unwrap();
        assert_eq!(server.documents[&uri].text, "fn externally_changed() {}\n");
        assert_eq!(server.documents[&uri].version, 2);
    }

    /// Opt-in real server integration; no model calls or dependency installation.
    #[tokio::test]
    #[ignore = "set GOOSE_REAL_LSP_RUNTIME to the prepared orqaly-runtime directory"]
    async fn real_bundled_language_servers_smoke() {
        let runtime = PathBuf::from(
            std::env::var_os("GOOSE_REAL_LSP_RUNTIME").expect("GOOSE_REAL_LSP_RUNTIME is required"),
        );
        let node = runtime.join(if cfg!(windows) {
            "node/node.exe"
        } else {
            "node/bin/node"
        });
        assert!(node.is_file(), "prepared bundled Node is required");
        let modules = runtime.join("language-servers/node_modules");
        let mut metrics = Vec::new();
        for (language, filename, cli, text, changed, line, character) in [
            ("typescript", "fixture.ts", "typescript-language-server/lib/cli.mjs",
                "export function add(a: number, b: number): number { return a + b; }\nconst result = add(1, 2);\n",
                "export function add(a: number, b: number): number { return a + b; }\nconst result: number = \"wrong\";\n", 1, 15),
            ("python", "fixture.py", "pyright/langserver.index.js",
                "def add(a: int, b: int) -> int:\n    return a + b\n\nresult = add(1, 2)\n",
                "def add(a: int, b: int) -> int:\n    return \"wrong\"\n\nresult = add(1, 2)\n", 3, 10),
        ] {
            let root = tempfile::tempdir().unwrap();
            std::fs::write(root.path().join(filename), text).unwrap();
            let client = LspTools { configured: Ok(HashMap::from([(language.into(), vec![node.to_string_lossy().into(), modules.join(cli).to_string_lossy().into(), "--stdio".into()])])), sessions: Mutex::new(HashMap::new()), lifetime: CancellationToken::new() };
            for action in ["symbols", "definition", "references", "hover"] {
                let started = std::time::Instant::now();
                let result = client.call_tool(Some(json!({"action":action,"path":filename,"line":line,"character":character}).as_object().unwrap().clone()), &context(root.path()), CancellationToken::new()).await.structured_content.unwrap();
                assert_eq!(result["status"], "completed", "{language} {action}: {result}");
                assert!(!result["result"].is_null(), "{language} {action}: empty result");
                metrics.push(json!({"language":language,"action":action,"elapsedMs":started.elapsed().as_millis(),"documentVersion":result["documentVersion"]}));
            }
            std::fs::write(root.path().join(filename), changed).unwrap();
            let started = std::time::Instant::now();
            let diagnostics = client.call_tool(Some(json!({"action":"diagnostics","path":filename}).as_object().unwrap().clone()), &context(root.path()), CancellationToken::new()).await.structured_content.unwrap();
            assert_eq!(diagnostics["status"], "completed", "{language}: {diagnostics}");
            assert_eq!(diagnostics["documentVersion"], 2);
            assert!(diagnostics["result"]["diagnostics"].as_array().is_some_and(|items| !items.is_empty()), "{language}: injected type error was not diagnosed: {diagnostics}");
            metrics.push(json!({"language":language,"action":"diagnostics_after_edit","elapsedMs":started.elapsed().as_millis(),"result":diagnostics["result"]}));
            let session = client.sessions.lock().await.values().next().unwrap().clone();
            session.lock().await.stop().await;
        }
        println!(
            "REAL_LSP_SMOKE {}",
            json!({"modelCalls":0,"toolImplementation":"native_lsp","metrics":metrics})
        );
    }
}
