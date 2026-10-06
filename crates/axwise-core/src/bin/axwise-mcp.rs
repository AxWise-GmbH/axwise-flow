use schemars::schema_for;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

use axwise_core::pipeline::{execute_pipeline, AuditGateBInput};
use axwise_core::*;

async fn get_tools_manifest() -> Result<Value, String> {
    if std::env::var("AXWISE_EXPERIMENTAL_RUST_PIPELINE").as_deref() != Ok("1") {
        let catalog = axwise_core::specialist::describe().await?;
        let mut tools = catalog["tools"].clone();
        for tool in tools.as_array_mut().ok_or("invalid_kernel_catalog")? {
            tool["outputSchema"] = axwise_core::pipeline::completed_artifact_schema();
        }
        return Ok(tools);
    }
    let mut tools: Vec<Value> = AxwisePlatformExtension::new()
        .list_tools()
        .into_iter()
        .map(|tool| {
            json!({
                "name": tool.name, "description": tool.description,
                "inputSchema": tool.input_schema,
                "outputSchema": axwise_core::pipeline::completed_artifact_schema(),
            })
        })
        .collect();
    tools.push(json!({"name":"audit_gate_b", "description":"Audit the exact deliverable through the authenticated managed account gateway.", "inputSchema": schema_for!(AuditGateBInput)}));
    Ok(Value::Array(tools))
}

#[tokio::main]
async fn main() {
    let in_process = std::env::args().any(|arg| arg == "--in-process");
    let extension = AxwisePlatformExtension::new();
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err_res = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                let _ = writeln!(stdout, "{}", err_res);
                let _ = stdout.flush();
                continue;
            }
        };

        let id = request.get("id").cloned();
        let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");

        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "axwise-mcp",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }
            }),
            "notifications/initialized" => continue,
            "tools/list" => match get_tools_manifest().await {
                Ok(tools) => json!({"jsonrpc":"2.0","id":id,"result":{"tools":tools}}),
                Err(error) => {
                    json!({"jsonrpc":"2.0","id":id,"error":{"code":-32603,"message":error}})
                }
            },
            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or(Value::Null);
                let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                let metadata = params
                    .get("_meta")
                    .and_then(|meta| meta.get("orqanix/host-context"));
                let execution = if in_process {
                    match axwise_core::scope::HostScope::resolve(
                        metadata,
                        std::env::var("AXWISE_ACCOUNT_HASH")
                            .or_else(|_| std::env::var("ORQALY_ACCOUNT_HASH"))
                            .ok(),
                        std::env::var("AXWISE_SESSION_ID").ok(),
                        &args,
                    ) {
                        Ok(scope) => extension.call_tool_in_scope(tool_name, &args, &scope).await,
                        Err(error) => Err(error),
                    }
                } else {
                    execute_pipeline(tool_name, &args, metadata).await
                };
                match execution {
                    Ok(result) => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": result
                    }),
                    Err(err_msg) => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {
                            "code": -32603,
                            "message": err_msg
                        }
                    }),
                }
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32601,
                    "message": format!("Method not found: {}", method)
                }
            }),
        };

        let _ = writeln!(stdout, "{}", serde_json::to_string(&response).unwrap());
        let _ = stdout.flush();
    }
}
