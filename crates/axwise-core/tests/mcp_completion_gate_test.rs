use axwise_core::review_engine::get_tool_criteria;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use tempfile::tempdir;

fn review(tool: &str, passed: bool) -> Value {
    json!({ "checks": get_tool_criteria(tool).iter().map(|criterion|
        json!({ "criterion": criterion, "passed": passed, "reason": "fixture" })
    ).collect::<Vec<_>>() })
}

fn call(tool: &str, replies: Vec<Value>, state: &std::path::Path, arguments: Value) -> Value {
    let mcp = call_adapter(false, tool, replies.clone(), state, arguments.clone());
    let native = call_adapter(true, tool, replies, state, arguments);
    assert_eq!(mcp["result"]["isError"], native["result"]["isError"]);
    assert_eq!(
        mcp["result"]["structuredContent"]["status"],
        native["result"]["structuredContent"]["status"]
    );
    assert_eq!(
        mcp["error"]["message"]
            .as_str()
            .map(|s| s.split(':').next().unwrap()),
        native["error"]["message"]
            .as_str()
            .map(|s| s.split(':').next().unwrap())
    );
    native
}
fn call_adapter(
    in_process: bool,
    tool: &str,
    replies: Vec<Value>,
    state: &std::path::Path,
    arguments: Value,
) -> Value {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let server = std::thread::spawn(move || {
        for reply in replies {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
            let (mut stream, _) = loop {
                match listener.accept() {
                    Ok(connection) => break connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            std::time::Instant::now() < deadline,
                            "expected provider request missing"
                        );
                        std::thread::sleep(std::time::Duration::from_millis(10));
                    }
                    Err(error) => panic!("fixture accept: {error}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(10)))
                .unwrap();
            let mut data = Vec::new();
            loop {
                let mut chunk = [0; 4096];
                let count = stream.read(&mut chunk).unwrap();
                assert!(count > 0);
                data.extend_from_slice(&chunk[..count]);
                if let Some(end) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&data[..end]).to_lowercase();
                    let length: usize = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length: ")
                                .map(|n| n.parse().unwrap())
                        })
                        .unwrap();
                    if data.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let body =
                json!({ "choices": [{ "message": { "content": reply.to_string() } }] }).to_string();
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        }
    });
    let mut command = Command::new(env!("CARGO_BIN_EXE_axwise-mcp"));
    if in_process {
        command.arg("--in-process");
    }
    let mut child = command
        .env_clear()
        .env("AXWISE_EXPERIMENTAL_RUST_PIPELINE", "1")
        .env("OPENAI_API_KEY", "fixture")
        .env("GEMINI_API_KEY", "fixture")
        .env("AXWISE_OPENAI_BASE_URL", format!("http://{address}/v1"))
        .env("AXWISE_STATE_DIR", state)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    writeln!(child.stdin.take().unwrap(), "{}", json!({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
            "name": tool, "arguments": arguments,
            "_meta": { "orqanix/host-context": { "account": "fixture-account", "session": "fixture-session" } }
        }
    })).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    server.join().unwrap();
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn wrong_shape_is_not_a_completed_artifact() {
    let state = tempdir().unwrap();
    let result = call(
        "generate_personas",
        vec![json!({})],
        state.path(),
        json!({"brief":"fixture"}),
    );
    assert_eq!(result["result"]["isError"], true);
    assert!(!state.path().join("fixture-account/axwise.db").exists());
}

#[test]
fn repaired_candidate_must_pass_a_new_review() {
    let state = tempdir().unwrap();
    let candidate = json!({"title":"fixture", "sections":[]});
    let result = call(
        "create_prd",
        vec![
            candidate.clone(),
            review("create_prd", false),
            candidate,
            review("create_prd", false),
        ],
        state.path(),
        json!({"brief":"fixture"}),
    );
    assert!(result["error"]["message"]
        .as_str()
        .unwrap()
        .contains("review_failed"));
    assert!(!state.path().join("fixture-account/axwise.db").exists());
}

#[test]
fn missing_managed_audit_cannot_complete_a_prd() {
    let state = tempdir().unwrap();
    let result = call(
        "create_prd",
        vec![
            json!({"title":"fixture", "sections":[]}),
            review("create_prd", true),
        ],
        state.path(),
        json!({"brief":"fixture"}),
    );
    assert!(result["error"]["message"]
        .as_str()
        .unwrap()
        .contains("gate_b_failed"));
    assert!(!state.path().join("fixture-account/axwise.db").exists());
}

#[test]
fn failed_storage_and_successful_storage_have_different_outcomes() {
    let state = tempdir().unwrap();
    let blocked = state.path().join("not-a-directory");
    std::fs::write(&blocked, "fixture").unwrap();
    let replies = vec![
        json!({"personas":[], "limitations":[]}),
        review("generate_personas", true),
    ];
    let failed = call(
        "generate_personas",
        replies.clone(),
        &blocked,
        json!({"brief":"fixture"}),
    );
    assert_eq!(failed["result"]["isError"], true);
    assert_eq!(
        failed["result"]["structuredContent"]["status"],
        "storage_failed"
    );
    let accepted = call(
        "generate_personas",
        replies,
        state.path(),
        json!({"brief":"fixture"}),
    );
    assert_eq!(
        accepted["result"]["structuredContent"]["storageAccepted"],
        true
    );
    assert!(state
        .path()
        .join("fixture-account/fixture-session")
        .is_dir());
}

#[test]
fn caller_cannot_choose_another_session() {
    let state = tempdir().unwrap();
    let result = call(
        "generate_personas",
        vec![],
        state.path(),
        json!({"sessionId":"default"}),
    );
    assert!(result["error"]["message"]
        .as_str()
        .unwrap()
        .contains("caller_session_override"));
}

#[test]
fn every_native_handler_rejects_untrusted_scope_instead_of_completing_a_stub() {
    let extension = axwise_core::AxwisePlatformExtension::new();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let scope = axwise_core::scope::HostScope {
        account: "account".into(),
        session: "session".into(),
    };
    for tool in extension.list_tools() {
        let result = runtime.block_on(extension.call_tool_in_scope(
            &tool.name,
            &json!({"sessionId":"other"}),
            &scope,
        ));
        assert!(result
            .unwrap_err()
            .contains("caller_session_override_rejected"));
    }
    assert_eq!(extension.version, env!("CARGO_PKG_VERSION"));
}
