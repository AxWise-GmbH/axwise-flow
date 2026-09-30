//! Workspace-local guarded text edits and bounded, directly spawned test commands.
//!
//! Locks serialize cooperating Goose processes. The full-file digest is checked
//! again immediately before replacement; rollback never replaces an intervening
//! edit. These are filesystem concurrency guards, not an OS command sandbox.

use std::fs::{self, File, OpenOptions, Permissions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use fs2::FileExt;
use rmcp::model::{CallToolResult, JsonObject, Tool, ToolAnnotations};
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{json_result, workspace_path, workspace_root};
use crate::agents::tool_execution::ToolCallContext;

const MAX_FILE_BYTES: usize = 1_048_576;
const MAX_OUTPUT_BYTES: usize = 65_536;
const MAX_EDITS: usize = 100;

#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AnchoredEdit {
    /// Inclusive 1-based original line range. All edits refer to the same preimage.
    #[schemars(range(min = 1))]
    pub start_line: usize,
    #[schemars(range(min = 1))]
    pub end_line: usize,
    /// Copy the exact start/end anchors returned by hashline_edit action=read.
    pub start_anchor: String,
    pub end_anchor: String,
    /// Exact replacement text, including any desired trailing newline. Empty deletes the range.
    pub replacement: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HashlineAction {
    Read,
    Edit,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct HashlineParams {
    pub action: HashlineAction,
    pub path: String,
    /// Required for edit: the full 64-character SHA-256 returned by read.
    pub expected_sha256: Option<String>,
    /// Required for edit. Nonoverlapping inclusive line ranges; at most 100.
    pub edits: Option<Vec<AnchoredEdit>>,
    /// Read pagination; defaults to line 1. SHA-256 always covers the entire file.
    pub read_start_line: Option<usize>,
    /// Read pagination; defaults to 200 lines, maximum 2000.
    pub read_max_lines: Option<usize>,
}

fn default_timeout() -> u64 {
    60
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SafeEditParams {
    pub path: String,
    pub expected_sha256: String,
    pub edits: Vec<AnchoredEdit>,
    /// Executable followed by literal argv. No implicit shell expansion or shell parsing.
    pub test_command: Vec<String>,
    #[serde(default = "default_timeout")]
    #[schemars(range(min = 1, max = 600))]
    pub timeout_secs: u64,
}

pub struct EditTools;

impl Default for EditTools {
    fn default() -> Self {
        Self::new()
    }
}

impl EditTools {
    pub fn new() -> Self {
        Self
    }

    pub fn tools() -> Vec<Tool> {
        fn schema<T: JsonSchema>() -> JsonObject {
            serde_json::to_value(schema_for!(T))
                .expect("native edit schema")
                .as_object()
                .expect("object schema")
                .clone()
        }
        [
            Tool::new("hashline_edit", "Prefer action=read before editing a supported existing file. Copy returned hashes and anchors into action=edit or safe_edit_and_test; re-read on conflicts. Read a workspace text file with full-file SHA-256 and numbered line anchors, or apply exact anchored edits after verifying that preimage. Existing UTF-8 files only, maximum 1 MiB. Ranges include their line endings; replacement text must include any desired newline. Does not run tests or claim verification. Files outside the trusted workspace and symlink paths are rejected.", schema::<HashlineParams>()),
            Tool::new("safe_edit_and_test", "Prefer for an existing-file change with a suitable test command, after hashline_edit action=read. Apply exact SHA/line-anchor guarded edits to one existing workspace file, then execute the supplied test_command argv directly in the trusted workspace. Requires approval for the file change and command. Test timeout is 1–600 seconds (default 60); captured output is bounded. On test failure, timeout or cancellation, restore the original bytes only if the file still equals this tool's postimage; otherwise preserve intervening edits and report the conflict. No automatic model repair. Unix process containment only; other platforms fail before editing. This tool is not an OS sandbox: an approved test executable may affect other files.", schema::<SafeEditParams>()),
        ].into_iter().map(|tool| tool.annotate(ToolAnnotations::from_raw(
            None, Some(false), Some(true), Some(false), Some(true),
        ))).collect()
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
        ctx: &ToolCallContext,
        cancellation_token: CancellationToken,
    ) -> CallToolResult {
        let args = arguments.map(Value::Object).unwrap_or(Value::Null);
        let result = match name {
            "hashline_edit" => match serde_json::from_value::<HashlineParams>(args) {
                Ok(params) => hashline(params, ctx, &cancellation_token),
                Err(error) => Err(format!("INVALID_ARGUMENTS: {error}")),
            },
            "safe_edit_and_test" => match serde_json::from_value::<SafeEditParams>(args) {
                Ok(params) => safe_edit(params, ctx, &cancellation_token).await,
                Err(error) => Err(format!("INVALID_ARGUMENTS: {error}")),
            },
            _ => Err("UNKNOWN_TOOL".into()),
        };
        match result {
            Ok(value) => {
                let failed = matches!(value.get("status").and_then(Value::as_str), Some("failed"));
                json_result(value, failed)
            }
            Err(error) => json_result(
                json!({"status":"error", "error":error, "verified":false}),
                true,
            ),
        }
    }
}

fn sha(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn cancelled(token: &CancellationToken) -> Result<(), String> {
    if token.is_cancelled() {
        Err("CANCELLED: No new operation was started.".into())
    } else {
        Ok(())
    }
}

fn check_digest(expected: &str, bytes: &[u8]) -> Result<(), String> {
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(
            "INVALID_SHA256: Use the exact full lowercase SHA-256 returned by read.".into(),
        );
    }
    if sha(bytes) != expected {
        return Err("STALE_PREIMAGE: Read the current file and regenerate anchors.".into());
    }
    Ok(())
}

fn lines(text: &str) -> Vec<&str> {
    if text.is_empty() {
        vec![""]
    } else {
        text.split_inclusive('\n').collect()
    }
}

fn anchor(number: usize, text: &str) -> String {
    format!("{}:{}", number, sha(text.as_bytes()))
}

fn replacement(original: &[u8], edits: &[AnchoredEdit]) -> Result<Vec<u8>, String> {
    if edits.is_empty() || edits.len() > MAX_EDITS {
        return Err("INVALID_EDITS: Supply 1–100 ranges.".into());
    }
    let text =
        std::str::from_utf8(original).map_err(|_| "UNSUPPORTED_FILE: UTF-8 text required.")?;
    let rows = lines(text);
    let mut ordered: Vec<&AnchoredEdit> = edits.iter().collect();
    ordered.sort_by_key(|edit| edit.start_line);
    let mut previous_end = 0;
    let mut changed = String::new();
    for edit in ordered {
        if edit.start_line == 0
            || edit.end_line < edit.start_line
            || edit.end_line > rows.len()
            || edit.start_line <= previous_end
        {
            return Err(
                "INVALID_RANGE: Ranges must exist, be ordered internally and not overlap.".into(),
            );
        }
        if edit.start_anchor != anchor(edit.start_line, rows[edit.start_line - 1])
            || edit.end_anchor != anchor(edit.end_line, rows[edit.end_line - 1])
        {
            return Err("STALE_ANCHOR: Boundary anchors do not match this preimage.".into());
        }
        for line in &rows[previous_end..edit.start_line - 1] {
            changed.push_str(line);
        }
        changed.push_str(&edit.replacement);
        if changed.len() > MAX_FILE_BYTES {
            return Err("FILE_TOO_LARGE: Replacement exceeds 1 MiB.".into());
        }
        previous_end = edit.end_line;
    }
    for line in &rows[previous_end..] {
        changed.push_str(line);
    }
    if changed.len() > MAX_FILE_BYTES {
        return Err("FILE_TOO_LARGE: Replacement exceeds 1 MiB.".into());
    }
    Ok(changed.into_bytes())
}

fn read_file(path: &Path) -> Result<(Vec<u8>, Permissions), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("FILE_UNAVAILABLE: {error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("UNSUPPORTED_FILE: Regular file required.".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|error| format!("FILE_UNAVAILABLE: {error}"))?;
    let opened_metadata = file.metadata().map_err(|error| error.to_string())?;
    if !opened_metadata.is_file() {
        return Err("UNSUPPORTED_FILE".into());
    }
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("FILE_TOO_LARGE: Maximum 1 MiB.".into());
    }
    Ok((bytes, opened_metadata.permissions()))
}

/// A stable sidecar lock survives target-file atomic replacements. External
/// editors need not honor this advisory lock, hence the additional hash checks.
struct EditLock {
    _file: File,
}

impl EditLock {
    fn acquire(path: &Path) -> Result<Self, String> {
        #[cfg(unix)]
        let suffix = unsafe { libc::geteuid() }.to_string();
        #[cfg(not(unix))]
        let suffix = "user".to_string();
        let directory = std::env::temp_dir().join(format!("goose-native-edit-locks-{suffix}"));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&directory) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(format!("LOCK_UNAVAILABLE: {error}")),
        }
        let metadata = fs::symlink_metadata(&directory).map_err(|error| error.to_string())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("UNSAFE_LOCK_DIRECTORY".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.uid() != unsafe { libc::geteuid() } || metadata.mode() & 0o077 != 0 {
                return Err("UNSAFE_LOCK_DIRECTORY: Owner-private lock directory required.".into());
            }
        }
        let lock_path =
            directory.join(format!("{}.lock", sha(path.as_os_str().as_encoded_bytes())));
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options
            .open(lock_path)
            .map_err(|error| format!("LOCK_UNAVAILABLE: {error}"))?;
        if !file
            .metadata()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            return Err("UNSAFE_LOCK_FILE".into());
        }
        file.try_lock_exclusive()
            .map_err(|_| "FILE_BUSY: Another native edit/test transaction owns this file.")?;
        Ok(Self { _file: file })
    }
}

impl Drop for EditLock {
    fn drop(&mut self) {
        // A concurrent spawn may retain a duplicate until exec; closing our fd alone
        // would let that duplicate extend the completed transaction's lock lifetime.
        let _ = FileExt::unlock(&self._file);
    }
}

fn atomic_replace(
    ctx: &ToolCallContext,
    root: &Path,
    path: &Path,
    expected: &[u8],
    replacement: &[u8],
    permissions: Permissions,
) -> Result<(), String> {
    if workspace_root(ctx)? != root
        || workspace_path(ctx, path.to_str().ok_or("UNSUPPORTED_PATH_ENCODING")?)? != path
    {
        return Err(
            "WORKSPACE_CHANGED: Target no longer resolves within the original workspace.".into(),
        );
    }
    let parent = path.parent().ok_or("INVALID_PATH")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary
        .write_all(replacement)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .set_permissions(permissions)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    // No model, network or subprocess wait between this final check and rename.
    if workspace_root(ctx)? != root
        || workspace_path(ctx, path.to_str().ok_or("UNSUPPORTED_PATH_ENCODING")?)? != path
    {
        return Err("WORKSPACE_CHANGED: Target changed before publication.".into());
    }
    let (current, _) = read_file(path)?;
    if current != expected {
        return Err("CONCURRENT_MODIFICATION: Target changed before publication.".into());
    }
    temporary
        .persist(path)
        .map_err(|error| format!("WRITE_FAILED: {}", error.error))?;
    Ok(())
}

struct Transaction {
    ctx: ToolCallContext,
    root: PathBuf,
    path: PathBuf,
    original: Vec<u8>,
    postimage: Vec<u8>,
    permissions: Permissions,
    active: bool,
    _lock: EditLock,
}

impl Transaction {
    fn apply(
        ctx: &ToolCallContext,
        path: PathBuf,
        expected: &str,
        edits: &[AnchoredEdit],
        token: &CancellationToken,
    ) -> Result<Self, String> {
        let root = workspace_root(ctx)?;
        let lock = EditLock::acquire(&path)?;
        let (original, permissions) = read_file(&path)?;
        check_digest(expected, &original)?;
        let postimage = replacement(&original, edits)?;
        cancelled(token)?;
        atomic_replace(
            ctx,
            &root,
            &path,
            &original,
            &postimage,
            permissions.clone(),
        )?;
        Ok(Self {
            ctx: ctx.clone(),
            root,
            path,
            original,
            postimage,
            permissions,
            active: true,
            _lock: lock,
        })
    }

    fn current(&self) -> Result<Vec<u8>, String> {
        if workspace_root(&self.ctx)? != self.root
            || workspace_path(
                &self.ctx,
                self.path.to_str().ok_or("UNSUPPORTED_PATH_ENCODING")?,
            )? != self.path
        {
            return Err("WORKSPACE_CHANGED: Intervening path change preserved.".into());
        }
        read_file(&self.path).map(|(bytes, _)| bytes)
    }

    fn rollback(&mut self) -> Value {
        self.active = false;
        match self.current() {
            Ok(current) if current == self.postimage => {
                match atomic_replace(
                    &self.ctx,
                    &self.root,
                    &self.path,
                    &self.postimage,
                    &self.original,
                    self.permissions.clone(),
                ) {
                    Ok(()) => {
                        json!({"attempted":true,"restored":true,"sha256":sha(&self.original)})
                    }
                    Err(error) => json!({"attempted":true,"restored":false,"reason":error}),
                }
            }
            Ok(current) => {
                json!({"attempted":false,"restored":false,"reason":"intervening_modification_preserved","current_sha256":sha(&current)})
            }
            Err(error) => json!({"attempted":false,"restored":false,"reason":error}),
        }
    }
}

impl Drop for Transaction {
    fn drop(&mut self) {
        if self.active {
            let _ = self.rollback();
        }
    }
}

fn hashline(
    params: HashlineParams,
    ctx: &ToolCallContext,
    token: &CancellationToken,
) -> Result<Value, String> {
    cancelled(token)?;
    let path = workspace_path(ctx, &params.path)?;
    match params.action {
        HashlineAction::Read => {
            if params.expected_sha256.is_some() || params.edits.is_some() {
                return Err("INVALID_ARGUMENTS: Read does not accept edits/preimage.".into());
            }
            let (bytes, _) = read_file(&path)?;
            let text = std::str::from_utf8(&bytes)
                .map_err(|_| "UNSUPPORTED_FILE: UTF-8 text required.")?;
            let start = params.read_start_line.unwrap_or(1);
            let limit = params.read_max_lines.unwrap_or(200);
            let all_lines = lines(text);
            if start == 0 || start > all_lines.len() || !(1..=2000).contains(&limit) {
                return Err("INVALID_READ_RANGE: Select an existing line and 1–2000 lines.".into());
            }
            let rows: Vec<Value> = all_lines
                .iter()
                .enumerate()
                .skip(start - 1)
                .take(limit)
                .map(|(index, row)| json!({"line":index+1,"anchor":anchor(index+1,row),"text":row}))
                .collect();
            Ok(
                json!({"status":"read","path":path,"sha256":sha(&bytes),"total_lines":all_lines.len(),
                    "start_line":start,"has_more":start - 1 + rows.len() < all_lines.len(),"lines":rows,"verified":false}),
            )
        }
        HashlineAction::Edit => {
            if params.read_start_line.is_some() || params.read_max_lines.is_some() {
                return Err("INVALID_ARGUMENTS: Edit does not accept read pagination.".into());
            }
            let expected = params.expected_sha256.ok_or("EXPECTED_SHA256_REQUIRED")?;
            let edits = params.edits.ok_or("EDITS_REQUIRED")?;
            let mut transaction = Transaction::apply(ctx, path.clone(), &expected, &edits, token)?;
            transaction.active = false;
            Ok(
                json!({"status":"edited","path":path,"before_sha256":sha(&transaction.original),"sha256":sha(&transaction.postimage),"verified":false,"tests_executed":false}),
            )
        }
    }
}

#[derive(Debug, Serialize)]
struct TestOutcome {
    executed: bool,
    exit_code: Option<i32>,
    timed_out: bool,
    cancelled: bool,
    stdout: String,
    stderr: String,
    output_truncated: bool,
    output_error: Option<String>,
}

#[cfg(unix)]
struct ProcessGroup(Option<u32>);
#[cfg(unix)]
impl ProcessGroup {
    fn kill(&mut self) {
        if let Some(pid) = self.0.take() {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
}
#[cfg(unix)]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        self.kill();
    }
}

async fn capture<R: AsyncRead + Unpin>(mut stream: R) -> std::io::Result<(Vec<u8>, bool)> {
    let mut retained = Vec::new();
    let mut buffer = [0u8; 8192];
    let mut truncated = false;
    loop {
        let count = stream.read(&mut buffer).await?;
        if count == 0 {
            return Ok((retained, truncated));
        }
        let keep = count.min(MAX_OUTPUT_BYTES.saturating_sub(retained.len()));
        retained.extend_from_slice(&buffer[..keep]);
        truncated |= keep < count;
    }
}

type OutputTask = JoinHandle<std::io::Result<(Vec<u8>, bool)>>;
struct OutputTasks {
    stdout: OutputTask,
    stderr: OutputTask,
}
impl Drop for OutputTasks {
    fn drop(&mut self) {
        self.stdout.abort();
        self.stderr.abort();
    }
}

#[cfg(unix)]
async fn run_test(
    argv: &[String],
    root: &Path,
    timeout_secs: u64,
    token: &CancellationToken,
) -> Result<TestOutcome, String> {
    cancelled(token)?;
    let mut command = Command::new(&argv[0]);
    command
        .args(&argv[1..])
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|error| format!("TEST_SPAWN_FAILED: {error}"))?;
    let mut group = ProcessGroup(Some(child.id().ok_or("TEST_PROCESS_ID_UNAVAILABLE")?));
    let mut output = OutputTasks {
        stdout: tokio::spawn(capture(
            child.stdout.take().ok_or("TEST_STDOUT_UNAVAILABLE")?,
        )),
        stderr: tokio::spawn(capture(
            child.stderr.take().ok_or("TEST_STDERR_UNAVAILABLE")?,
        )),
    };
    let mut result = TestOutcome {
        executed: true,
        exit_code: None,
        timed_out: false,
        cancelled: false,
        stdout: String::new(),
        stderr: String::new(),
        output_truncated: false,
        output_error: None,
    };
    tokio::select! {
        biased;
        _ = token.cancelled() => { result.cancelled = true; }
        _ = tokio::time::sleep(Duration::from_secs(timeout_secs)) => { result.timed_out = true; }
        status = child.wait() => { result.exit_code = status.map_err(|error| format!("TEST_WAIT_FAILED: {error}"))?.code(); }
    }
    // A test must not leave background descendants running against restored files.
    group.kill();
    if result.cancelled || result.timed_out {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
    }
    let drains = tokio::time::timeout(Duration::from_millis(500), async {
        tokio::join!(&mut output.stdout, &mut output.stderr)
    })
    .await;
    match drains {
        Ok((Ok(Ok((stdout, out_cut))), Ok(Ok((stderr, err_cut))))) => {
            result.stdout = String::from_utf8_lossy(&stdout).into_owned();
            result.stderr = String::from_utf8_lossy(&stderr).into_owned();
            result.output_truncated = out_cut || err_cut;
        }
        _ => {
            result.output_error = Some("Test output could not be completely collected.".into());
            result.output_truncated = true;
        }
    }
    Ok(result)
}

#[cfg(not(unix))]
async fn run_test(
    _argv: &[String],
    _root: &Path,
    _timeout_secs: u64,
    _token: &CancellationToken,
) -> Result<TestOutcome, String> {
    Err("UNSUPPORTED_PLATFORM: Process-tree containment requires Unix.".into())
}

async fn safe_edit(
    params: SafeEditParams,
    ctx: &ToolCallContext,
    token: &CancellationToken,
) -> Result<Value, String> {
    cancelled(token)?;
    if !cfg!(unix) {
        return Err(
            "UNSUPPORTED_PLATFORM: No edit was made; process-tree containment requires Unix."
                .into(),
        );
    }
    if !(1..=600).contains(&params.timeout_secs) {
        return Err("INVALID_TIMEOUT: Choose 1–600 seconds.".into());
    }
    if params.test_command.is_empty()
        || params.test_command.len() > 100
        || params.test_command[0].trim().is_empty()
        || params
            .test_command
            .iter()
            .any(|arg| arg.contains('\0') || arg.len() > 8192)
        || params.test_command.iter().map(String::len).sum::<usize>() > 65_536
    {
        return Err("INVALID_COMMAND: Supply bounded executable argv.".into());
    }
    let root = workspace_root(ctx)?;
    let path = workspace_path(ctx, &params.path)?;
    let mut transaction = Transaction::apply(
        ctx,
        path.clone(),
        &params.expected_sha256,
        &params.edits,
        token,
    )?;
    let test = run_test(&params.test_command, &root, params.timeout_secs, token).await;
    let unchanged = transaction
        .current()
        .is_ok_and(|current| current == transaction.postimage);
    let verified = test.as_ref().is_ok_and(|result| {
        result.exit_code == Some(0)
            && !result.timed_out
            && !result.cancelled
            && result.output_error.is_none()
    }) && unchanged
        && !token.is_cancelled();
    let rollback = if verified {
        transaction.active = false;
        json!({"attempted":false,"restored":false,"reason":"tests_passed"})
    } else {
        transaction.rollback()
    };
    let test_json = match test {
        Ok(result) => serde_json::to_value(result).expect("test outcome"),
        Err(error) => json!({"executed":false,"error":error}),
    };
    let current_sha = transaction.current().ok().map(|current| sha(&current));
    Ok(
        json!({"status":if verified {"verified"} else {"failed"},"verified":verified,"path":path,
        "before_sha256":sha(&transaction.original),"edited_sha256":sha(&transaction.postimage),"current_sha256":current_sha,
        "target_unchanged_during_test":unchanged,"test":test_json,"rollback":rollback}),
    )
}

#[cfg(test)]
mod native_edit_tests {
    use super::*;
    use tempfile::TempDir;

    fn setup(contents: &str) -> (TempDir, ToolCallContext, PathBuf) {
        let directory = TempDir::new().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let path = root.join("target.txt");
        fs::write(&path, contents).unwrap();
        let ctx = ToolCallContext::new("native-edit-test".into(), Some(root), None);
        (directory, ctx, path)
    }

    fn edit_json(original: &str, start: usize, end: usize, replacement: &str) -> Value {
        let rows = lines(original);
        json!({"start_line":start,"end_line":end,"start_anchor":anchor(start,rows[start-1]),
            "end_anchor":anchor(end,rows[end-1]),"replacement":replacement})
    }

    fn arguments(original: &str, replacement: &str) -> Value {
        json!({"path":"target.txt","expected_sha256":sha(original.as_bytes()),
            "edits":[edit_json(original,1,lines(original).len(),replacement)]})
    }

    async fn call(
        name: &str,
        value: Value,
        ctx: &ToolCallContext,
        token: CancellationToken,
    ) -> (bool, Value) {
        let result = EditTools::new()
            .call_tool(name, value.as_object().cloned(), ctx, token)
            .await;
        (
            result.is_error.unwrap_or(false),
            result.structured_content.unwrap(),
        )
    }

    fn safe_args(original: &str, replacement: &str, script: &str) -> Value {
        let mut args = arguments(original, replacement);
        args["test_command"] = json!(["/bin/sh", "-c", script]);
        args["timeout_secs"] = json!(10);
        args
    }

    #[tokio::test]
    async fn read_returns_full_digest_and_exact_paginated_line_anchors() {
        let (_directory, ctx, _path) = setup("dirty first\r\nsecond\nlast");
        let (error, result) = call(
            "hashline_edit",
            json!({"action":"read","path":"target.txt","read_start_line":2,"read_max_lines":1}),
            &ctx,
            CancellationToken::new(),
        )
        .await;
        assert!(!error);
        assert_eq!(result["sha256"], sha(b"dirty first\r\nsecond\nlast"));
        assert_eq!(result["total_lines"], 3);
        assert_eq!(result["lines"][0]["anchor"], anchor(2, "second\n"));
        assert_eq!(result["lines"][0]["text"], "second\n");
        assert_eq!(result["has_more"], true);
    }

    #[tokio::test]
    async fn exact_multiple_ranges_preserve_untouched_dirty_text_and_endings() {
        let original = "dirty first\r\nreplace this\r\nkeep me\nlast";
        let (_directory, ctx, path) = setup(original);
        let (error, result) = call(
            "hashline_edit",
            json!({"action":"edit","path":"target.txt","expected_sha256":sha(original.as_bytes()),
            "edits":[edit_json(original,4,4,"final"),edit_json(original,2,2,"replacement\r\n")]}),
            &ctx,
            CancellationToken::new(),
        )
        .await;
        assert!(!error);
        assert_eq!(
            fs::read_to_string(path).unwrap(),
            "dirty first\r\nreplacement\r\nkeep me\nfinal"
        );
        assert_eq!(result["verified"], false);
        assert_eq!(result["tests_executed"], false);
    }

    #[tokio::test]
    async fn stale_digest_or_anchor_never_changes_file() {
        for stale_digest in [true, false] {
            let (_directory, ctx, path) = setup("original\n");
            let mut args = arguments("original\n", "changed\n");
            args["action"] = json!("edit");
            if stale_digest {
                fs::write(&path, "external edit\n").unwrap();
            } else {
                args["edits"][0]["start_anchor"] = json!(anchor(1, "different\n"));
            }
            let prior = fs::read(&path).unwrap();
            let (error, result) = call("hashline_edit", args, &ctx, CancellationToken::new()).await;
            assert!(error);
            assert!(result["error"].as_str().unwrap().starts_with("STALE_"));
            assert_eq!(fs::read(path).unwrap(), prior);
        }
    }

    #[tokio::test]
    async fn overlapping_ranges_and_zero_timeout_fail_before_writes() {
        let (_directory, ctx, path) = setup("a\nb\n");
        let args = json!({"action":"edit","path":"target.txt","expected_sha256":sha(b"a\nb\n"),
            "edits":[edit_json("a\nb\n",1,2,"x"),edit_json("a\nb\n",2,2,"y")]});
        assert!(
            call("hashline_edit", args, &ctx, CancellationToken::new())
                .await
                .0
        );
        let mut args = safe_args("a\nb\n", "wrong", "exit 0");
        args["timeout_secs"] = json!(0);
        assert!(
            call("safe_edit_and_test", args, &ctx, CancellationToken::new())
                .await
                .0
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "a\nb\n");
    }

    #[tokio::test]
    async fn empty_file_has_a_usable_anchor() {
        let (_directory, ctx, path) = setup("");
        let mut args = arguments("", "new text\n");
        args["action"] = json!("edit");
        assert!(
            !call("hashline_edit", args, &ctx, CancellationToken::new())
                .await
                .0
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "new text\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn executable_mode_is_preserved_by_edit_and_rollback() {
        use std::os::unix::fs::PermissionsExt;
        let (_directory, ctx, path) = setup("original\n");
        fs::set_permissions(&path, Permissions::from_mode(0o751)).unwrap();
        let (error, result) = call(
            "safe_edit_and_test",
            safe_args("original\n", "changed\n", "exit 7"),
            &ctx,
            CancellationToken::new(),
        )
        .await;
        assert!(error);
        assert_eq!(result["rollback"]["restored"], true);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o751
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "original\n");
    }

    #[tokio::test]
    async fn missing_workspace_and_outside_path_are_rejected() {
        let (directory, ctx, path) = setup("original\n");
        let outside = TempDir::new().unwrap();
        let outside_file = outside.path().join("outside");
        fs::write(&outside_file, "outside").unwrap();
        let absent = ToolCallContext::new("test".into(), None, None);
        for (context, target) in [
            (&absent, path.to_str().unwrap()),
            (&ctx, outside_file.to_str().unwrap()),
            (&ctx, "../target.txt"),
        ] {
            assert!(
                call(
                    "hashline_edit",
                    json!({"action":"read","path":target}),
                    context,
                    CancellationToken::new()
                )
                .await
                .0
            );
        }
        assert!(directory.path().exists());
        assert_eq!(fs::read_to_string(outside_file).unwrap(), "outside");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn symlink_file_and_parent_are_rejected() {
        use std::os::unix::fs::symlink;
        let (directory, ctx, path) = setup("original\n");
        symlink(&path, directory.path().join("link.txt")).unwrap();
        symlink(directory.path(), directory.path().join("link-dir")).unwrap();
        for target in ["link.txt", "link-dir/target.txt"] {
            assert!(
                call(
                    "hashline_edit",
                    json!({"action":"read","path":target}),
                    &ctx,
                    CancellationToken::new()
                )
                .await
                .0
            );
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn successful_test_receives_literal_argv_and_keeps_edits() {
        let (directory, ctx, path) = setup("original\n");
        let mut args = arguments("original\n", "changed\n");
        args["test_command"] = json!(["/bin/echo", "$(touch unexpected-file); *"]);
        let (error, result) =
            call("safe_edit_and_test", args, &ctx, CancellationToken::new()).await;
        assert!(!error);
        assert_eq!(result["verified"], true);
        assert_eq!(result["test"]["exit_code"], 0);
        assert!(result["test"]["stdout"]
            .as_str()
            .unwrap()
            .contains("$(touch unexpected-file); *"));
        assert!(!directory.path().join("unexpected-file").exists());
        assert_eq!(fs::read_to_string(path).unwrap(), "changed\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_test_restores_exact_dirty_preimage_and_returns_evidence() {
        let (_directory, ctx, path) = setup("uncommitted user text\n");
        let (error, result) = call(
            "safe_edit_and_test",
            safe_args(
                "uncommitted user text\n",
                "proposed\n",
                "printf failure-evidence; printf reason >&2; exit 7",
            ),
            &ctx,
            CancellationToken::new(),
        )
        .await;
        assert!(error);
        assert_eq!(result["test"]["exit_code"], 7);
        assert_eq!(result["test"]["stdout"], "failure-evidence");
        assert_eq!(result["test"]["stderr"], "reason");
        assert_eq!(result["rollback"]["restored"], true);
        assert_eq!(fs::read_to_string(path).unwrap(), "uncommitted user text\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_or_user_changes_are_preserved_even_when_tests_exit_zero() {
        for exit in [0, 1] {
            let (_directory, ctx, path) = setup("original\n");
            let (error, result) = call(
                "safe_edit_and_test",
                safe_args(
                    "original\n",
                    "proposed\n",
                    &format!("printf intervening > target.txt; exit {exit}"),
                ),
                &ctx,
                CancellationToken::new(),
            )
            .await;
            assert!(error);
            assert_eq!(result["verified"], false);
            assert_eq!(
                result["rollback"]["reason"],
                "intervening_modification_preserved"
            );
            assert_eq!(fs::read_to_string(path).unwrap(), "intervening");
        }
    }

    #[test]
    fn lock_ownership_ends_even_while_a_duplicated_descriptor_remains_open() {
        let (_directory, _ctx, path) = setup("original\n");
        let lock = EditLock::acquire(&path).unwrap();
        // A concurrent process spawn can temporarily inherit this open description.
        let inherited = lock._file.try_clone().unwrap();
        drop(lock);
        let next = EditLock::acquire(&path)
            .expect("a descriptor copy must not extend the completed transaction's lock");
        drop(inherited);
        assert!(
            EditLock::acquire(&path).is_err(),
            "closing the old copy must not release the new owner"
        );
        drop(next);
        assert!(EditLock::acquire(&path).is_ok());
    }

    #[test]
    fn stable_lock_rejects_second_transaction_and_drop_restores_first() {
        let (_directory, ctx, path) = setup("original\n");
        let edits: Vec<AnchoredEdit> =
            serde_json::from_value(arguments("original\n", "proposed\n")["edits"].clone()).unwrap();
        let transaction = Transaction::apply(
            &ctx,
            path.clone(),
            &sha(b"original\n"),
            &edits,
            &CancellationToken::new(),
        )
        .unwrap();
        assert!(EditLock::acquire(&path).is_err());
        drop(transaction);
        assert_eq!(fs::read_to_string(&path).unwrap(), "original\n");
        EditLock::acquire(&path).expect("completed transaction releases its edit lock");
    }

    #[test]
    fn dropped_transaction_does_not_overwrite_external_change() {
        let (_directory, ctx, path) = setup("original\n");
        let edits: Vec<AnchoredEdit> =
            serde_json::from_value(arguments("original\n", "proposed\n")["edits"].clone()).unwrap();
        let transaction = Transaction::apply(
            &ctx,
            path.clone(),
            &sha(b"original\n"),
            &edits,
            &CancellationToken::new(),
        )
        .unwrap();
        fs::write(&path, "external\n").unwrap();
        drop(transaction);
        assert_eq!(fs::read_to_string(path).unwrap(), "external\n");
    }

    #[tokio::test]
    async fn pre_cancelled_requests_never_mutate_or_spawn() {
        let (directory, ctx, path) = setup("original\n");
        let token = CancellationToken::new();
        token.cancel();
        let (error, _) = call(
            "safe_edit_and_test",
            safe_args("original\n", "proposed\n", "touch spawned"),
            &ctx,
            token,
        )
        .await;
        assert!(error);
        assert!(!directory.path().join("spawned").exists());
        assert_eq!(fs::read_to_string(path).unwrap(), "original\n");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_terminates_descendants_and_restores_preimage() {
        let (directory, ctx, path) = setup("original\n");
        let mut args = safe_args(
            "original\n",
            "proposed\n",
            "(sleep 2; printf leaked > descendant-write) & wait",
        );
        args["timeout_secs"] = json!(1);
        let started = std::time::Instant::now();
        let (error, result) =
            call("safe_edit_and_test", args, &ctx, CancellationToken::new()).await;
        assert!(error);
        assert_eq!(result["test"]["timed_out"], true);
        assert!(started.elapsed() < Duration::from_secs(4));
        assert_eq!(fs::read_to_string(path).unwrap(), "original\n");
        tokio::time::sleep(Duration::from_millis(1300)).await;
        assert!(!directory.path().join("descendant-write").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_terminates_descendants_and_restores_preimage() {
        let (directory, ctx, path) = setup("original\n");
        let token = CancellationToken::new();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            canceller.cancel();
        });
        let (error, result) = call(
            "safe_edit_and_test",
            safe_args(
                "original\n",
                "proposed\n",
                "(sleep 1; printf leaked > descendant-write) & wait",
            ),
            &ctx,
            token,
        )
        .await;
        assert!(error);
        assert_eq!(result["test"]["cancelled"], true);
        assert_eq!(fs::read_to_string(path).unwrap(), "original\n");
        tokio::time::sleep(Duration::from_millis(1100)).await;
        assert!(!directory.path().join("descendant-write").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropped_tool_future_kills_process_group_and_rolls_back() {
        let (directory, ctx, path) = setup("original\n");
        let ready = directory.path().join("ready");
        let handle = tokio::spawn(async move {
            call(
                "safe_edit_and_test",
                safe_args(
                    "original\n",
                    "proposed\n",
                    "printf ready > ready; (sleep 1; printf leaked > descendant-write) & wait",
                ),
                &ctx,
                CancellationToken::new(),
            )
            .await
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            while !ready.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        handle.abort();
        let _ = handle.await;
        assert_eq!(fs::read_to_string(path).unwrap(), "original\n");
        tokio::time::sleep(Duration::from_millis(1100)).await;
        assert!(!directory.path().join("descendant-write").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn output_capture_is_bounded_but_test_status_remains_explicit() {
        let (_directory, ctx, _path) = setup("original\n");
        let (error, result) = call(
            "safe_edit_and_test",
            safe_args("original\n", "proposed\n", "yes x | head -c 100000"),
            &ctx,
            CancellationToken::new(),
        )
        .await;
        assert!(!error);
        assert_eq!(result["test"]["output_truncated"], true);
        assert_eq!(
            result["test"]["stdout"].as_str().unwrap().len(),
            MAX_OUTPUT_BYTES
        );
        assert_eq!(result["test"]["exit_code"], 0);
    }

    #[cfg(unix)]
    #[test]
    fn rollback_rejects_a_parent_replaced_with_symlink() {
        use std::os::unix::fs::symlink;
        let (directory, ctx, _) = setup("unused");
        let sub = directory.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let path = sub.join("file");
        fs::write(&path, "original\n").unwrap();
        let path = path.canonicalize().unwrap();
        let edits: Vec<AnchoredEdit> =
            serde_json::from_value(arguments("original\n", "proposed\n")["edits"].clone()).unwrap();
        let mut transaction = Transaction::apply(
            &ctx,
            path,
            &sha(b"original\n"),
            &edits,
            &CancellationToken::new(),
        )
        .unwrap();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("file"), "proposed\n").unwrap();
        fs::rename(&sub, directory.path().join("sub-original")).unwrap();
        symlink(outside.path(), &sub).unwrap();
        let result = transaction.rollback();
        assert_eq!(result["restored"], false);
        assert_eq!(
            fs::read_to_string(outside.path().join("file")).unwrap(),
            "proposed\n"
        );
    }

    #[test]
    fn native_mutations_advertise_destructive_approval_hints() {
        for tool in EditTools::tools() {
            let value = serde_json::to_value(tool).unwrap();
            assert_eq!(value["annotations"]["readOnlyHint"], false);
            assert_eq!(value["annotations"]["destructiveHint"], true);
            assert_eq!(value["annotations"]["openWorldHint"], true);
        }
    }
}
