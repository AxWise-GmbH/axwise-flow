//! First-class engineering tools executed by the current Goose agent.
//!
//! The host mounts this platform extension for an enabled session. No delegated
//! model, OMP runtime, or caller-controlled workspace is involved.

mod ast;
mod edits;
mod lsp;

use crate::agents::extension::PlatformExtensionContext;
use crate::agents::mcp_client::{Error, McpClientTrait};
use crate::agents::tool_execution::ToolCallContext;
use anyhow::Result;
use async_trait::async_trait;
use rmcp::model::{
    CallToolResult, ContentBlock, Implementation, InitializeResult, JsonObject, ListToolsResult,
    ServerCapabilities,
};
use serde_json::{json, Value};
use std::path::{Component, PathBuf};
use tokio_util::sync::CancellationToken;

pub const EXTENSION_NAME: &str = "native_engineering";

pub struct NativeEngineeringClient {
    info: InitializeResult,
    edits: edits::EditTools,
    lsp: lsp::LspTools,
}

impl NativeEngineeringClient {
    pub fn new(_context: PlatformExtensionContext) -> Result<Self> {
        let lsp = lsp::LspTools::new();
        let instructions = format!(
            "{}\n{}",
            include_str!("selection.md"),
            lsp.configuration_summary()
        );
        let info = InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new(EXTENSION_NAME, "1.3.0").with_title("Native Engineering"),
            )
            .with_instructions(instructions);
        Ok(Self {
            info,
            edits: edits::EditTools::new(),
            lsp,
        })
    }
}

/// Resolve the host-selected root; never silently fall back to process cwd.
pub(crate) fn workspace_root(ctx: &ToolCallContext) -> Result<PathBuf, String> {
    let root = ctx
        .working_dir
        .as_ref()
        .ok_or_else(|| "WORKSPACE_REQUIRED: the session has no working directory".to_string())?
        .canonicalize()
        .map_err(|_| {
            "WORKSPACE_UNAVAILABLE: the session working directory is unavailable".to_string()
        })?;
    if !root.is_dir() {
        return Err(
            "WORKSPACE_UNAVAILABLE: the session working directory is not a directory".into(),
        );
    }
    Ok(root)
}

/// Resolve an existing target within the trusted root. Reject symlink traversal
/// below that root, even when its current target happens to remain in scope.
pub(crate) fn workspace_path(ctx: &ToolCallContext, path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.contains('\0') {
        return Err("INVALID_PATH: a nonempty workspace path is required".into());
    }
    let root = workspace_root(ctx)?;
    let supplied = PathBuf::from(path);
    let candidate = if supplied.is_absolute() {
        // Resolve harmless aliases in the host root (/tmp vs /private/tmp on macOS).
        let raw_root = ctx
            .working_dir
            .as_ref()
            .expect("workspace_root checked cwd");
        if let Ok(relative) = supplied.strip_prefix(raw_root) {
            root.join(relative)
        } else {
            supplied
        }
    } else {
        root.join(supplied)
    };
    let relative = candidate.strip_prefix(&root).map_err(|_| {
        "PATH_OUTSIDE_WORKSPACE: target must be inside the session working directory".to_string()
    })?;
    let mut checked = root.clone();
    for component in relative.components() {
        match component {
            Component::CurDir => continue,
            Component::Normal(name) => checked.push(name),
            _ => return Err("PATH_OUTSIDE_WORKSPACE: parent traversal is not supported".into()),
        }
        let metadata = std::fs::symlink_metadata(&checked).map_err(|_| {
            "PATH_UNAVAILABLE: target does not exist or cannot be accessed".to_string()
        })?;
        if metadata.file_type().is_symlink() {
            return Err("SYMLINK_NOT_SUPPORTED: use a regular path within the workspace".into());
        }
    }
    let canonical = checked
        .canonicalize()
        .map_err(|_| "PATH_UNAVAILABLE: target cannot be resolved".to_string())?;
    if !canonical.starts_with(&root) {
        return Err(
            "PATH_OUTSIDE_WORKSPACE: resolved target leaves the session working directory".into(),
        );
    }
    Ok(canonical)
}

pub(crate) fn json_result(value: Value, is_error: bool) -> CallToolResult {
    let content = vec![ContentBlock::text(value.to_string())];
    let mut result = if is_error {
        CallToolResult::error(content)
    } else {
        CallToolResult::success(content)
    };
    result.structured_content = Some(value);
    result
}

#[async_trait]
impl McpClientTrait for NativeEngineeringClient {
    async fn list_tools(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancellation_token: CancellationToken,
    ) -> Result<ListToolsResult, Error> {
        let mut tools = ast::tools();
        tools.extend(lsp::LspTools::tools());
        tools.extend(edits::EditTools::tools());
        Ok(ListToolsResult {
            tools,
            next_cursor: None,
            meta: None,
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        ctx: &ToolCallContext,
        name: &str,
        arguments: Option<JsonObject>,
        cancellation_token: CancellationToken,
    ) -> Result<CallToolResult, Error> {
        if cancellation_token.is_cancelled() {
            return Ok(json_result(
                json!({"status": "cancelled", "code": "CANCELLED"}),
                true,
            ));
        }
        Ok(match name {
            "ast_search" => ast::call_tool(arguments, ctx, cancellation_token).await,
            "lsp_query" => self.lsp.call_tool(arguments, ctx, cancellation_token).await,
            "hashline_edit" | "safe_edit_and_test" => {
                self.edits
                    .call_tool(name, arguments, ctx, cancellation_token)
                    .await
            }
            _ => json_result(json!({"status": "failed", "code": "UNKNOWN_TOOL"}), true),
        })
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        Some(&self.info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::platform_extensions::PLATFORM_EXTENSIONS;
    use crate::session::SessionManager;
    use std::sync::Arc;
    use tempfile::tempdir;

    fn context(root: PathBuf) -> ToolCallContext {
        ToolCallContext::new("native-test".into(), Some(root), None)
    }

    #[test]
    fn workspace_requires_host_context_and_rejects_escape() {
        assert!(workspace_root(&ToolCallContext::new("test".into(), None, None)).is_err());
        let directory = tempdir().unwrap();
        let root = directory.path().join("workspace");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("inside.rs"), "fn main() {}").unwrap();
        std::fs::write(directory.path().join("outside.rs"), "fn outside() {}").unwrap();
        let ctx = context(root.clone());
        assert_eq!(
            workspace_path(&ctx, "inside.rs").unwrap(),
            root.join("inside.rs").canonicalize().unwrap()
        );
        assert!(workspace_path(&ctx, "../outside.rs").is_err());
        assert!(
            workspace_path(&ctx, &directory.path().join("outside.rs").to_string_lossy()).is_err()
        );
        assert!(workspace_path(&ctx, "missing.rs").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn workspace_rejects_file_and_directory_symlinks() {
        use std::os::unix::fs::symlink;
        let root = tempdir().unwrap();
        std::fs::write(root.path().join("file.rs"), "fn main() {}").unwrap();
        symlink(root.path().join("file.rs"), root.path().join("link.rs")).unwrap();
        symlink(root.path(), root.path().join("link-dir")).unwrap();
        let ctx = context(root.path().to_owned());
        assert!(workspace_path(&ctx, "link.rs").is_err());
        assert!(workspace_path(&ctx, "link-dir/file.rs").is_err());
    }

    #[tokio::test]
    async fn platform_registration_is_opt_in_and_exposes_exact_native_tools() {
        let definition = PLATFORM_EXTENSIONS.get(EXTENSION_NAME).unwrap();
        assert!(!definition.default_enabled);
        assert!(definition.unprefixed_tools);
        assert!(definition.hidden);
        let root = tempdir().unwrap();
        let client = NativeEngineeringClient::new(PlatformExtensionContext {
            extension_manager: None,
            session_manager: Arc::new(SessionManager::new(root.path().to_path_buf())),
            scheduler: None,
            session: None,
            use_login_shell_path: false,
        })
        .unwrap();
        let listed = client
            .list_tools("session", None, CancellationToken::new())
            .await
            .unwrap();
        let mut names: Vec<_> = listed.tools.iter().map(|tool| tool.name.as_ref()).collect();
        names.sort();
        assert_eq!(
            names,
            [
                "ast_search",
                "hashline_edit",
                "lsp_query",
                "safe_edit_and_test"
            ]
        );
        for tool in listed.tools {
            let annotations = tool.annotations.unwrap();
            assert_eq!(
                annotations.read_only_hint,
                Some(matches!(tool.name.as_ref(), "ast_search" | "lsp_query"))
            );
        }
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        let result = client
            .call_tool(
                &context(root.path().to_owned()),
                "hashline_edit",
                None,
                cancelled,
            )
            .await
            .unwrap();
        assert_eq!(result.structured_content.unwrap()["code"], "CANCELLED");
    }
}
