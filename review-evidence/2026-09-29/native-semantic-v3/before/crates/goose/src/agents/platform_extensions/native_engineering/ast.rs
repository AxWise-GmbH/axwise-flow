//! Bounded real Tree-sitter query execution, reusing Goose's existing grammars.

use super::{json_result, workspace_path, workspace_root};
use crate::agents::platform_extensions::analyze::languages::{lang_for_ext, LangInfo};
use crate::agents::tool_execution::ToolCallContext;
use ignore::WalkBuilder;
use rmcp::model::{CallToolResult, JsonObject, Tool, ToolAnnotations};
use schemars::{schema_for, JsonSchema};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::OpenOptions;
use std::io::Read;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use tree_sitter::{
    ParseOptions, Parser, Query, QueryCursor, QueryCursorOptions, StreamingIterator,
};

const MAX_FILE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_QUERY_BYTES: usize = 16 * 1024;
const MAX_WALK_ENTRIES: usize = 4096;
const MAX_SNIPPET_CHARS: usize = 512;
const SEARCH_DEADLINE: Duration = Duration::from_secs(5);

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct AstSearchParams {
    /// Existing file or directory inside the session working directory.
    path: String,
    /// Real Tree-sitter S-expression query with at least one @capture. Example:
    /// (function_declaration name: (identifier) @name). This is not a text pattern.
    query: String,
    /// Required for directories; optional override for a file. Supported: rust,
    /// python, javascript, typescript, tsx, go, java, kotlin, swift, ruby.
    #[serde(default)]
    language: Option<String>,
    /// Maximum returned captures, from 1 through 100. Defaults to 50.
    #[serde(default = "default_max_results")]
    max_results: usize,
    /// Maximum files to parse, from 1 through 256. Defaults to 128.
    #[serde(default = "default_max_files")]
    max_files: usize,
}

fn default_max_results() -> usize {
    50
}
fn default_max_files() -> usize {
    128
}

pub(super) fn tools() -> Vec<Tool> {
    let schema = serde_json::to_value(schema_for!(AstSearchParams))
        .expect("AST schema serialization")
        .as_object()
        .expect("AST object schema")
        .clone();
    vec![Tool::new(
        "ast_search".to_string(),
        "Prefer for structural code questions (declarations/call shapes) where text search would match comments or strings. Search real syntax-tree captures using a Tree-sitter query. Reads workspace files and respects ignored files when walking directories. Supply language for a directory. Returns exact node ranges (1-based lines, 0-based UTF-8 byte columns; exclusive end), bounded snippets and the full saved-file SHA-256. Unsupported languages, invalid queries, partial scans and cancellation are explicit; this is not an LSP or regex search.".to_string(),
        schema,
    ).annotate(ToolAnnotations::from_raw(
        Some("AST Search".into()), Some(true), Some(false), Some(true), Some(false),
    ))]
}

pub(super) async fn call_tool(
    arguments: Option<JsonObject>,
    ctx: &ToolCallContext,
    cancellation_token: CancellationToken,
) -> CallToolResult {
    let params: AstSearchParams =
        match serde_json::from_value(Value::Object(arguments.unwrap_or_default())) {
            Ok(params) => params,
            Err(error) => return failure("INVALID_ARGUMENTS", &error.to_string()),
        };
    if params.query.is_empty()
        || params.query.len() > MAX_QUERY_BYTES
        || !(1..=100).contains(&params.max_results)
        || !(1..=256).contains(&params.max_files)
    {
        return failure(
            "INVALID_ARGUMENTS",
            "Require a nonempty query up to 16384 bytes, max_results 1..100 and max_files 1..256",
        );
    }
    let root = match workspace_root(ctx) {
        Ok(root) => root,
        Err(error) => return failure("WORKSPACE_UNAVAILABLE", &error),
    };
    let target = match workspace_path(ctx, &params.path) {
        Ok(path) => path,
        Err(error) => return failure("INVALID_PATH", &error),
    };
    let language = match selected_language(&params, &target) {
        Ok(language) => language,
        Err(error) => return failure("UNSUPPORTED_LANGUAGE", &error),
    };
    // Parsing/querying is CPU work. A child-token guard stops the worker if
    // this future is dropped without cancelling other tools in the same turn.
    let task_token = cancellation_token.child_token();
    let _cancel_worker_on_drop = task_token.clone().drop_guard();
    let task =
        tokio::task::spawn_blocking(move || search(params, root, target, language, task_token));
    tokio::select! {
        biased;
        _ = cancellation_token.cancelled() => failure("CANCELLED", "AST search was cancelled"),
        result = task => match result {
            Ok(Ok(value)) => json_result(value, false),
            Ok(Err((code, message))) => failure(code, &message),
            Err(_) => failure("AST_SEARCH_FAILED", "AST search worker failed"),
        }
    }
}

fn failure(code: &str, message: &str) -> CallToolResult {
    json_result(
        json!({"status": "failed", "code": code, "message": message}),
        true,
    )
}

fn language_by_name(name: &str) -> Option<&'static LangInfo> {
    let extension = match name {
        "rust" => "rs",
        "python" => "py",
        "javascript" => "js",
        "typescript" => "ts",
        "tsx" => "tsx",
        "go" => "go",
        "java" => "java",
        "kotlin" => "kt",
        "swift" => "swift",
        "ruby" => "rb",
        _ => return None,
    };
    lang_for_ext(extension)
}

fn selected_language(params: &AstSearchParams, target: &Path) -> Result<&'static LangInfo, String> {
    if let Some(ref name) = params.language {
        return language_by_name(name)
            .ok_or_else(|| "The requested language has no bundled Tree-sitter grammar".into());
    }
    if target.is_dir() {
        return Err(
            "Directory searches require an explicit language so one query has a defined grammar"
                .into(),
        );
    }
    target
        .extension()
        .and_then(|extension| extension.to_str())
        .and_then(lang_for_ext)
        .ok_or_else(|| {
            "Cannot detect a supported grammar from the file extension; supply language explicitly"
                .into()
        })
}

type SearchError = (&'static str, String);

fn check_cancel(token: &CancellationToken, deadline: Instant) -> Result<(), SearchError> {
    if token.is_cancelled() {
        Err(("CANCELLED", "AST search was cancelled".into()))
    } else if Instant::now() >= deadline {
        Err((
            "TIMED_OUT",
            "AST search exceeded its five-second deadline".into(),
        ))
    } else {
        Ok(())
    }
}

fn read_source(path: &Path) -> Result<String, &'static str> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options.open(path).map_err(|_| "unreadable")?;
    let metadata = file.metadata().map_err(|_| "unreadable")?;
    if !metadata.is_file() {
        return Err("not_regular_file");
    }
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err("file_too_large");
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "unreadable")?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("file_too_large");
    }
    String::from_utf8(bytes).map_err(|_| "not_utf8")
}

fn search(
    params: AstSearchParams,
    root: PathBuf,
    target: PathBuf,
    language: &'static LangInfo,
    cancellation: CancellationToken,
) -> Result<Value, SearchError> {
    let deadline = Instant::now() + SEARCH_DEADLINE;
    check_cancel(&cancellation, deadline)?;
    let grammar = (language.language)();
    let query = Query::new(&grammar, &params.query).map_err(|error| {
        (
            "INVALID_QUERY",
            format!(
                "{} query at {}:{}: {}",
                language.name,
                error.row + 1,
                error.column + 1,
                error.message
            ),
        )
    })?;
    if query.capture_names().is_empty() {
        return Err((
            "INVALID_QUERY",
            "Add at least one named @capture to return syntax nodes".into(),
        ));
    }
    let mut candidates = Vec::new();
    let mut truncated = false;
    let mut limit_reason: Option<&str> = None;
    let mut skipped: Vec<Value> = Vec::new();
    let single_file = target.is_file();
    if single_file {
        candidates.push(target);
    } else if target.is_dir() {
        let mut builder = WalkBuilder::new(&target);
        builder
            .follow_links(false)
            .max_depth(Some(12))
            .sort_by_file_name(|a, b| a.cmp(b));
        for (index, entry) in builder.build().enumerate() {
            check_cancel(&cancellation, deadline)?;
            if index >= MAX_WALK_ENTRIES {
                truncated = true;
                limit_reason = Some("walk_entry_limit");
                break;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    if skipped.len() < 32 {
                        skipped.push(json!({"reason": "walk_error"}));
                    }
                    continue;
                }
            };
            if entry.depth() == 12 && entry.file_type().is_some_and(|kind| kind.is_dir()) {
                truncated = true;
                limit_reason = Some("depth_limit");
            }
            if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                continue;
            }
            let info = entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .and_then(lang_for_ext);
            if info.is_none_or(|info| info.name != language.name) {
                continue;
            }
            if candidates.len() >= params.max_files {
                truncated = true;
                limit_reason = Some("file_limit");
                break;
            }
            candidates.push(entry.into_path());
        }
    } else {
        return Err((
            "INVALID_PATH",
            "AST search requires a regular file or directory".into(),
        ));
    }
    let mut parser = Parser::new();
    parser.set_language(&grammar).map_err(|_| {
        (
            "UNSUPPORTED_LANGUAGE",
            "Bundled grammar is incompatible with Tree-sitter".into(),
        )
    })?;
    let mut results = Vec::new();
    let mut bytes_scanned = 0;
    let mut files_scanned = 0;
    let mut syntax_error_files = Vec::new();
    'files: for path in candidates {
        check_cancel(&cancellation, deadline)?;
        // Revalidate after walking: a renamed/symlinked directory must not expand scope.
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| ("INVALID_PATH", "Search path left the workspace".into()))?;
        let rel = relative.to_string_lossy().to_string();
        let ctx = ToolCallContext::new("ast-internal".into(), Some(root.clone()), None);
        let checked = workspace_path(&ctx, &rel).map_err(|error| ("INVALID_PATH", error))?;
        let source = match read_source(&checked) {
            Ok(source) => source,
            Err(reason) => {
                if single_file {
                    return Err(("FILE_UNAVAILABLE", reason.into()));
                }
                if skipped.len() < 32 {
                    skipped.push(json!({"path": rel, "reason": reason}));
                }
                continue;
            }
        };
        if bytes_scanned + source.len() > MAX_TOTAL_BYTES {
            truncated = true;
            limit_reason = Some("byte_limit");
            break;
        }
        bytes_scanned += source.len();
        files_scanned += 1;
        let mut progress = |_: &tree_sitter::ParseState| {
            if cancellation.is_cancelled() || Instant::now() >= deadline {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        };
        let bytes = source.as_bytes();
        let tree = parser
            .parse_with_options(
                &mut |offset, _| bytes.get(offset..).unwrap_or_default(),
                None,
                Some(ParseOptions::new().progress_callback(&mut progress)),
            )
            .ok_or_else(|| {
                if cancellation.is_cancelled() {
                    ("CANCELLED", "AST search was cancelled".into())
                } else {
                    ("TIMED_OUT", "Syntax parsing exceeded its deadline".into())
                }
            })?;
        check_cancel(&cancellation, deadline)?;
        if tree.root_node().has_error() {
            syntax_error_files.push(rel.clone());
        }
        let file_sha256: String = Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let mut cursor = QueryCursor::new();
        cursor.set_match_limit(1024);
        let mut progress = |_: &tree_sitter::QueryCursorState| {
            if cancellation.is_cancelled() || Instant::now() >= deadline {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        };
        let mut matches = cursor.matches_with_options(
            &query,
            tree.root_node(),
            bytes,
            QueryCursorOptions::new().progress_callback(&mut progress),
        );
        while let Some(found) = matches.next() {
            check_cancel(&cancellation, deadline)?;
            for capture in found.captures {
                if results.len() >= params.max_results {
                    truncated = true;
                    limit_reason = Some("result_limit");
                    break 'files;
                }
                let node = capture.node;
                let text = node.utf8_text(bytes).unwrap_or_default();
                let snippet: String = text.chars().take(MAX_SNIPPET_CHARS).collect();
                results.push(json!({
                    "path": rel, "language": language.name, "capture": query.capture_names()[capture.index as usize],
                    "node_type": node.kind(), "file_sha256": file_sha256,
                    "start": {"line": node.start_position().row + 1, "byte_column": node.start_position().column, "byte_offset": node.start_byte()},
                    "end": {"line": node.end_position().row + 1, "byte_column": node.end_position().column, "byte_offset": node.end_byte()},
                    "snippet_truncated": snippet.len() < text.len(), "snippet": snippet,
                }));
            }
        }
        drop(matches);
        check_cancel(&cancellation, deadline)?;
        if cursor.did_exceed_match_limit() {
            truncated = true;
            limit_reason = Some("query_match_limit");
        }
    }
    Ok(
        json!({"status": if truncated || !skipped.is_empty() { "partial" } else { "completed" },
        "engine": "tree-sitter", "language": language.name, "matches": results,
        "scope": {"max_depth": 12, "respects_ignore_rules": true},
        "files_scanned": files_scanned, "bytes_scanned": bytes_scanned, "truncated": truncated,
        "limit_reason": limit_reason, "skipped": skipped, "syntax_error_files": syntax_error_files}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    async fn invoke(root: &Path, input: Value) -> Value {
        let ctx = ToolCallContext::new("test".into(), Some(root.to_owned()), None);
        call_tool(input.as_object().cloned(), &ctx, CancellationToken::new())
            .await
            .structured_content
            .unwrap()
    }

    #[tokio::test]
    async fn javascript_search_matches_syntax_and_not_comments_or_strings() {
        let root = tempdir().unwrap();
        let source = "// function fake() {}\nconst text = 'function fake() {}';\nfunction real(value) { return value; }\n";
        std::fs::write(root.path().join("code.js"), source).unwrap();
        let result = invoke(
            root.path(),
            json!({"path":"code.js", "query":"(function_declaration name: (identifier) @name)"}),
        )
        .await;
        assert_eq!(result["status"], "completed");
        assert_eq!(result["matches"].as_array().unwrap().len(), 1);
        let found = &result["matches"][0];
        assert_eq!(found["snippet"], "real");
        assert_eq!(found["start"]["line"], 3);
        assert_eq!(
            found["file_sha256"],
            Sha256::digest(source.as_bytes())
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
    }

    #[tokio::test]
    async fn python_capture_handles_multiline_structure_and_unicode_bytes() {
        let root = tempdir().unwrap();
        std::fs::write(
            root.path().join("code.py"),
            "# def false(): pass\ndef café(\n    value,\n):\n    return value\n",
        )
        .unwrap();
        let result = invoke(root.path(), json!({"path":"code.py", "query":"(function_definition name: (identifier) @name) @function"})).await;
        assert_eq!(result["status"], "completed");
        assert_eq!(result["matches"].as_array().unwrap().len(), 2);
        let captures = result["matches"].as_array().unwrap();
        assert!(captures
            .iter()
            .any(|value| value["capture"] == "name" && value["snippet"] == "café"));
        assert!(captures
            .iter()
            .any(|value| value["capture"] == "function" && value["end"]["line"] == 5));
    }

    #[tokio::test]
    async fn directory_search_respects_ignore_rules_and_restricts_language() {
        let root = tempdir().unwrap();
        std::fs::create_dir(root.path().join(".git")).unwrap();
        std::fs::write(root.path().join(".gitignore"), "ignored.js\n").unwrap();
        std::fs::write(root.path().join("ignored.js"), "function ignored() {}").unwrap();
        std::fs::write(root.path().join("yes.js"), "function visible() {}").unwrap();
        std::fs::write(root.path().join("other.py"), "def python(): pass").unwrap();
        let result = invoke(root.path(), json!({"path":".","language":"javascript","query":"(function_declaration name: (identifier) @name)"})).await;
        assert_eq!(result["files_scanned"], 1);
        assert_eq!(result["matches"][0]["snippet"], "visible");
    }

    #[tokio::test]
    async fn invalid_query_missing_language_and_limits_fail_explicitly() {
        let root = tempdir().unwrap();
        std::fs::write(root.path().join("code.js"), "function real() {}").unwrap();
        for (input, code) in [
            (
                json!({"path":"code.js","query":"(nonexistent_node) @node"}),
                "INVALID_QUERY",
            ),
            (
                json!({"path":"code.js","query":"(identifier)"}),
                "INVALID_QUERY",
            ),
            (
                json!({"path":".","query":"(identifier) @name"}),
                "UNSUPPORTED_LANGUAGE",
            ),
            (
                json!({"path":"code.js","query":"(identifier) @name", "max_results":0}),
                "INVALID_ARGUMENTS",
            ),
            (
                json!({"path":"code.js","query":"(identifier) @name", "extra":true}),
                "INVALID_ARGUMENTS",
            ),
        ] {
            assert_eq!(invoke(root.path(), input).await["code"], code);
        }
    }

    #[tokio::test]
    async fn bounded_search_reports_partial_results() {
        let root = tempdir().unwrap();
        std::fs::write(
            root.path().join("code.js"),
            "const a=1; const b=2; const c=3;",
        )
        .unwrap();
        let result = invoke(
            root.path(),
            json!({"path":"code.js","query":"(identifier) @name", "max_results":1}),
        )
        .await;
        assert_eq!(result["status"], "partial");
        assert_eq!(result["limit_reason"], "result_limit");
        assert_eq!(result["matches"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn cancelled_search_never_returns_completed() {
        let root = tempdir().unwrap();
        std::fs::write(root.path().join("code.js"), "function real() {}").unwrap();
        let token = CancellationToken::new();
        token.cancel();
        let input = json!({"path":"code.js","query":"(identifier) @name"});
        let ctx = ToolCallContext::new("test".into(), Some(root.path().to_owned()), None);
        let result = call_tool(input.as_object().cloned(), &ctx, token).await;
        assert_eq!(result.structured_content.unwrap()["code"], "CANCELLED");
    }

    #[tokio::test]
    async fn oversized_file_is_explicitly_rejected() {
        let root = tempdir().unwrap();
        std::fs::write(root.path().join("big.js"), vec![b' '; MAX_FILE_BYTES + 1]).unwrap();
        let result = invoke(
            root.path(),
            json!({"path":"big.js","query":"(identifier) @name"}),
        )
        .await;
        assert_eq!(result["code"], "FILE_UNAVAILABLE");
        assert_eq!(result["message"], "file_too_large");
    }
}
