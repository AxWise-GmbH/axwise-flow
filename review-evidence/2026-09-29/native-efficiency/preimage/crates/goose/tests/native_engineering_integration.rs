//! Offline coverage of host mounting, primary-loop continuation and edit permissions.
use anyhow::Result;
use async_trait::async_trait;
use futures::StreamExt;
use goose::agents::{
    Agent, AgentConfig, AgentEvent, ExtensionConfig, GoosePlatform, SessionConfig,
};
use goose::config::{GooseMode, PermissionManager};
use goose::conversation::message::{ActionRequiredData, Message, MessageContent};
use goose::permission::Permission;
use goose::providers::base::{stream_from_single_message, MessageStream, Provider};
use goose::session::{Session, SessionManager, SessionType};
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use goose_providers::{errors::ProviderError, model::ModelConfig};
use rmcp::model::{CallToolRequestParams, CallToolResult, Tool};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const NATIVE_TOOLS: [&str; 4] = [
    "ast_search",
    "hashline_edit",
    "lsp_query",
    "safe_edit_and_test",
];
const ORIGINAL: &str = "value = \"before\"\n";
const UPDATED: &str = "value = \"after\"\n";

#[derive(Default)]
struct PromptProbe {
    observations: Mutex<Vec<(String, Vec<String>)>>,
}

#[async_trait]
impl Provider for PromptProbe {
    fn get_name(&self) -> &str {
        "native-prompt-offline-test"
    }

    async fn stream(
        &self,
        _: &ModelConfig,
        system_prompt: &str,
        _: &[Message],
        tools: &[Tool],
    ) -> std::result::Result<MessageStream, ProviderError> {
        self.observations.lock().unwrap().push((
            system_prompt.to_owned(),
            tools.iter().map(|tool| tool.name.to_string()).collect(),
        ));
        Ok(stream_from_single_message(
            Message::assistant().with_text("Prompt captured without running tools."),
            ProviderUsage::new("offline-model".into(), Usage::default()),
        ))
    }
}

async fn check_prompt(agent: &Agent, session: &Session, native: bool) -> Result<()> {
    let provider = Arc::new(PromptProbe::default());
    agent
        .update_provider(
            provider.clone(),
            ModelConfig::new("offline-model"),
            &session.id,
        )
        .await?;
    let stream = agent
        .reply(
            Message::user().with_text("Describe the currently available coding workflow."),
            SessionConfig {
                id: session.id.clone(),
                schedule_id: None,
                max_turns: Some(2),
                retry_config: None,
            },
            None,
        )
        .await?;
    tokio::pin!(stream);
    while let Some(event) = stream.next().await {
        event?;
    }
    let observations = provider.observations.lock().unwrap();
    assert_eq!(observations.len(), 1);
    let (prompt, tools) = &observations[0];
    assert_eq!(
        prompt.contains("Native engineering selection policy v1"),
        native
    );
    assert_eq!(
        prompt.contains("Use write and edit to efficiently make changes"),
        !native
    );
    assert_eq!(
        prompt.contains("Host-configured LSP languages: python"),
        native
    );
    assert!(!prompt.contains("private-test-server-command"));
    for name in NATIVE_TOOLS {
        assert_eq!(tools.iter().any(|tool| tool == name), native, "{name}");
    }
    assert!(
        tools.iter().any(|tool| tool == "write"),
        "new-file creation remains available"
    );
    Ok(())
}

#[tokio::test]
async fn both_loops_refresh_native_guidance_after_mount_remove_and_session_resume() -> Result<()> {
    for state_machine in ["0", "1"] {
        let temp = tempfile::tempdir()?;
        let _env = env_lock::lock_env([
            ("GOOSE_PATH_ROOT", Some(temp.path().to_str().unwrap())),
            ("GOOSE_STATE_MACHINE", Some(state_machine)),
            (
                "GOOSE_NATIVE_LSP_SERVERS",
                Some(r#"{"python":["/private-test-server-command"]}"#),
            ),
        ]);
        let (agent, session) = fixture(temp.path(), GooseMode::Auto).await?;
        agent
            .add_extension(
                ExtensionConfig::Platform {
                    name: "developer".into(),
                    description: "Developer".into(),
                    display_name: None,
                    bundled: Some(true),
                    available_tools: vec![],
                },
                &session.id,
            )
            .await?;
        check_prompt(&agent, &session, false).await?;
        agent.add_extension(extension(), &session.id).await?;
        check_prompt(&agent, &session, true).await?;

        let sessions = Arc::new(SessionManager::new(temp.path().join("sessions")));
        let saved = sessions.get_session(&session.id, true).await?;
        let resumed = Arc::new(Agent::with_config(
            AgentConfig::new(
                sessions.clone(),
                Arc::new(PermissionManager::new(temp.path().join("permissions"))),
                None,
                GooseMode::Auto,
                true,
                GoosePlatform::GooseCli,
            )
            .with_use_login_shell_path(false),
        ));
        resumed.load_extensions_from_session(&saved).await;
        check_prompt(&resumed, &saved, true).await?;
        resumed
            .remove_extension("native_engineering", &saved.id)
            .await?;
        check_prompt(&resumed, &saved, false).await?;
        let disabled = sessions.get_session(&session.id, true).await?;
        let resumed_disabled = Arc::new(Agent::with_config(
            AgentConfig::new(
                sessions,
                Arc::new(PermissionManager::new(temp.path().join("permissions"))),
                None,
                GooseMode::Auto,
                true,
                GoosePlatform::GooseCli,
            )
            .with_use_login_shell_path(false),
        ));
        resumed_disabled
            .load_extensions_from_session(&disabled)
            .await;
        check_prompt(&resumed_disabled, &disabled, false).await?;
    }
    Ok(())
}

fn extension() -> ExtensionConfig {
    ExtensionConfig::Platform {
        name: "native_engineering".into(),
        description: "Native engineering test".into(),
        display_name: None,
        bundled: Some(true),
        available_tools: vec![],
    }
}
fn request(name: &str, arguments: Value) -> CallToolRequestParams {
    CallToolRequestParams::new(name.to_owned())
        .with_arguments(arguments.as_object().unwrap().clone())
}
async fn fixture(root: &Path, mode: GooseMode) -> Result<(Agent, Session)> {
    std::fs::create_dir_all(root.join("workspace"))?;
    let sessions = Arc::new(SessionManager::new(root.join("sessions")));
    let session = sessions
        .create_session(
            root.join("workspace"),
            "native-integration".into(),
            SessionType::Hidden,
            mode,
        )
        .await?;
    let agent = Agent::with_config(
        AgentConfig::new(
            sessions,
            Arc::new(PermissionManager::new(root.join("permissions"))),
            None,
            mode,
            true,
            GoosePlatform::GooseCli,
        )
        .with_use_login_shell_path(false),
    );
    Ok((agent, session))
}
async fn dispatch(
    agent: &Agent,
    session: &Session,
    call: CallToolRequestParams,
) -> Result<CallToolResult> {
    let dispatched = agent
        .dispatch_tool_call(call, "fixture-read".into(), None, session)
        .await
        .1
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    dispatched.result.await.map_err(|e| anyhow::anyhow!("{e}"))
}
fn result_json(result: &CallToolResult) -> Value {
    result
        .structured_content
        .clone()
        .or_else(|| {
            result
                .content
                .iter()
                .find_map(|c| c.as_text().and_then(|t| serde_json::from_str(&t.text).ok()))
        })
        .expect("JSON tool result")
}
fn response(messages: &[Message], id: &str) -> Option<CallToolResult> {
    messages
        .iter()
        .flat_map(|m| &m.content)
        .find_map(|c| match c {
            MessageContent::ToolResponse(r) if r.id == id => r.tool_result.as_ref().ok().cloned(),
            _ => None,
        })
}
struct ScriptedProvider {
    calls: AtomicUsize,
    requests: Vec<CallToolRequestParams>,
    seen_results: Mutex<Vec<CallToolResult>>,
}
#[async_trait]
impl Provider for ScriptedProvider {
    fn get_name(&self) -> &str {
        "native-engineering-offline-test"
    }
    async fn stream(
        &self,
        _: &ModelConfig,
        _: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> std::result::Result<MessageStream, ProviderError> {
        let index = self.calls.fetch_add(1, Ordering::SeqCst);
        for expected in NATIVE_TOOLS {
            assert!(
                tools.iter().any(|tool| tool.name == expected),
                "native tool missing from primary provider: {expected}"
            );
        }
        assert!(!tools.iter().any(|tool| tool.name.starts_with("omp__")));
        if index > 0 {
            let result = response(messages, &format!("native-{index}"))
                .expect("primary provider receives preceding tool response");
            self.seen_results.lock().unwrap().push(result);
        }
        let message = if let Some(call) = self.requests.get(index) {
            Message::assistant()
                .with_tool_request(format!("native-{}", index + 1), Ok(call.clone()))
        } else {
            assert_eq!(
                index,
                self.requests.len(),
                "unexpected inference after final answer"
            );
            Message::assistant().with_text("The same primary provider inspected the native result.")
        };
        Ok(stream_from_single_message(
            message,
            ProviderUsage::new("offline-model".into(), Usage::default()),
        ))
    }
}

#[tokio::test]
async fn host_mount_and_remove_control_inventory_and_dispatch() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let _env = env_lock::lock_env([("GOOSE_PATH_ROOT", Some(temp.path().to_str().unwrap()))]);
    let (agent, session) = fixture(temp.path(), GooseMode::Auto).await?;
    std::fs::write(session.working_dir.join("source.py"), ORIGINAL)?;
    let call = request("hashline_edit", json!({"action":"read","path":"source.py"}));
    let initial = agent.list_tools(&session.id, None).await;
    assert!(!initial
        .iter()
        .any(|t| NATIVE_TOOLS.contains(&t.name.as_ref())));
    assert!(dispatch(&agent, &session, call.clone()).await.is_err());
    agent.add_extension(extension(), &session.id).await?;
    let tools = agent
        .list_tools(&session.id, Some("native_engineering".into()))
        .await;
    let mut names: Vec<_> = tools.iter().map(|t| t.name.as_ref()).collect();
    names.sort();
    assert_eq!(names, NATIVE_TOOLS);
    let read = dispatch(&agent, &session, call.clone()).await?;
    assert_eq!(result_json(&read)["status"], "read");
    agent
        .remove_extension("native_engineering", &session.id)
        .await?;
    assert!(!agent
        .list_tools(&session.id, None)
        .await
        .iter()
        .any(|t| NATIVE_TOOLS.contains(&t.name.as_ref())));
    assert!(dispatch(&agent, &session, call).await.is_err());
    assert_eq!(
        std::fs::read_to_string(session.working_dir.join("source.py"))?,
        ORIGINAL
    );
    Ok(())
}

#[cfg(unix)]
async fn guarded_request(agent: &Agent, session: &Session) -> Result<CallToolRequestParams> {
    std::fs::write(session.working_dir.join("source.py"), ORIGINAL)?;
    std::fs::write(session.working_dir.join("check.sh"), "printf ran > process-marker\nIFS= read -r value < source.py\n[ \"$value\" = 'value = \"after\"' ]\n")?;
    let read = result_json(
        &dispatch(
            agent,
            session,
            request("hashline_edit", json!({"action":"read","path":"source.py"})),
        )
        .await?,
    );
    Ok(request(
        "safe_edit_and_test",
        json!({
            "path":"source.py", "expected_sha256":read["sha256"],
            "edits":[{"start_line":1,"end_line":1,"start_anchor":read["lines"][0]["anchor"],"end_anchor":read["lines"][0]["anchor"],"replacement":UPDATED}],
            "test_command":["/bin/sh","check.sh"],"timeout_secs":5,
        }),
    ))
}

#[cfg(unix)]
#[derive(Clone, Copy, Debug)]
enum Decision {
    Allow,
    Deny,
    CancelPermission,
    CancelToken,
}

#[cfg(unix)]
async fn run_loop(
    agent: &Agent,
    session: &Session,
    requests: Vec<CallToolRequestParams>,
    decision: Decision,
) -> Result<(Arc<ScriptedProvider>, usize)> {
    let provider = Arc::new(ScriptedProvider {
        calls: AtomicUsize::new(0),
        requests,
        seen_results: Mutex::new(Vec::new()),
    });
    agent
        .update_provider(
            provider.clone(),
            ModelConfig::new("offline-model"),
            &session.id,
        )
        .await?;
    let token = CancellationToken::new();
    let mut confirmations = 0;
    let mut cancelled_at_permission = false;
    tokio::time::timeout(Duration::from_secs(20), async {
        let stream = agent
            .reply(
                Message::user()
                    .with_text("Use the supplied native tools to update and check the fixture."),
                SessionConfig {
                    id: session.id.clone(),
                    schedule_id: None,
                    max_turns: Some(8),
                    retry_config: None,
                },
                Some(token.clone()),
            )
            .await?;
        tokio::pin!(stream);
        while let Some(event) = stream.next().await {
            let event = match event {
                Ok(event) => event,
                Err(_) if cancelled_at_permission => break,
                Err(error) => return Err(error),
            };
            if let AgentEvent::Message(message) = event {
                for content in message.content {
                    if let MessageContent::ActionRequired(action) = content {
                        if let ActionRequiredData::ToolConfirmation { id, .. } = action.data {
                            confirmations += 1;
                            match decision {
                                Decision::CancelToken => {
                                    cancelled_at_permission = true;
                                    token.cancel();
                                }
                                _ => {
                                    let permission = match decision {
                                        Decision::Allow => Permission::AllowOnce,
                                        Decision::Deny => Permission::DenyOnce,
                                        Decision::CancelPermission => Permission::Cancel,
                                        Decision::CancelToken => unreachable!(),
                                    };
                                    agent
                                        .submit_tool_confirmation(&session.id, &id, permission)
                                        .await?;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok::<_, anyhow::Error>(())
    })
    .await??;
    Ok((provider, confirmations))
}

#[cfg(unix)]
#[tokio::test]
async fn both_primary_loops_execute_native_ast_read_edit_and_test_with_approval() -> Result<()> {
    for state_machine in ["0", "1"] {
        let temp = tempfile::tempdir()?;
        let _env = env_lock::lock_env([
            ("GOOSE_PATH_ROOT", Some(temp.path().to_str().unwrap())),
            ("GOOSE_STATE_MACHINE", Some(state_machine)),
        ]);
        let (agent, session) = fixture(temp.path(), GooseMode::Approve).await?;
        agent.add_extension(extension(), &session.id).await?;
        let edit = guarded_request(&agent, &session).await?;
        let (provider, confirmations) = run_loop(
            &agent,
            &session,
            vec![
                request(
                    "ast_search",
                    json!({"path":"source.py", "query":"(assignment left: (identifier) @name)"}),
                ),
                request(
                    "hashline_edit",
                    json!({"action":"read", "path":"source.py"}),
                ),
                edit,
            ],
            Decision::Allow,
        )
        .await?;
        assert_eq!(
            confirmations, 3,
            "all native actions participate in Approve mode"
        );
        assert_eq!(provider.calls.load(Ordering::SeqCst), 4);
        let results = provider.seen_results.lock().unwrap();
        assert_eq!(result_json(&results[0])["engine"], "tree-sitter");
        assert_eq!(result_json(&results[0])["matches"][0]["snippet"], "value");
        assert_eq!(result_json(&results[1])["status"], "read");
        let outcome = result_json(&results[2]);
        assert_eq!(outcome["verified"], true, "{outcome}");
        assert_eq!(outcome["test"]["exit_code"], 0);
        assert_eq!(
            std::fs::read_to_string(session.working_dir.join("source.py"))?,
            UPDATED
        );
        assert_eq!(
            std::fs::read_to_string(session.working_dir.join("process-marker"))?,
            "ran"
        );
    }
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn both_primary_loops_deny_and_cancel_without_edit_or_process() -> Result<()> {
    for state_machine in ["0", "1"] {
        for decision in [
            Decision::Deny,
            Decision::CancelPermission,
            Decision::CancelToken,
        ] {
            let temp = tempfile::tempdir()?;
            let _env = env_lock::lock_env([
                ("GOOSE_PATH_ROOT", Some(temp.path().to_str().unwrap())),
                ("GOOSE_STATE_MACHINE", Some(state_machine)),
            ]);
            let (agent, session) = fixture(temp.path(), GooseMode::Approve).await?;
            agent.add_extension(extension(), &session.id).await?;
            let edit = guarded_request(&agent, &session).await?;
            let (_provider, confirmations) =
                run_loop(&agent, &session, vec![edit], decision).await?;
            assert_eq!(confirmations, 1, "loop={state_machine}, {decision:?}");
            assert_eq!(
                std::fs::read_to_string(session.working_dir.join("source.py"))?,
                ORIGINAL,
                "loop={state_machine}, {decision:?}"
            );
            assert!(
                !session.working_dir.join("process-marker").exists(),
                "loop={state_machine}, {decision:?}"
            );
        }
    }
    Ok(())
}
