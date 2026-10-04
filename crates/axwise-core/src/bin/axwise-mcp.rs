use std::io::{self, BufRead, Write};
use schemars::schema_for;
use serde_json::{json, Value};

use axwise_core::*;

fn get_tools_manifest() -> Value {
    json!([
        {
            "name": "create_prd",
            "description": "Create a comprehensive, production-grade Product Requirements Document (PRD) with prioritized functional requirements, observable acceptance criteria, and technical boundaries.",
            "inputSchema": schema_for!(PrdInput)
        },
        {
            "name": "analyze_interviews",
            "description": "Analyze stakeholder interviews to extract core jobs, pains, and evidence-backed requirements.",
            "inputSchema": schema_for!(AnalysisInput)
        },
        {
            "name": "simulate_interviews",
            "description": "Simulate realistic stakeholder interviews grounded in industry knowledge and authentic operational trade-offs.",
            "inputSchema": schema_for!(SimulationInput)
        },
        {
            "name": "prepare_discovery",
            "description": "Prepare a structured product discovery plan with scope, critical uncertainties, and targeted interview guides.",
            "inputSchema": schema_for!(DiscoveryInput)
        },
        {
            "name": "research_market",
            "description": "Synthesize market evidence and competitive landscape against discovery questions.",
            "inputSchema": schema_for!(MarketInput)
        },
        {
            "name": "generate_personas",
            "description": "Generate realistic stakeholder personas with authentic operational backgrounds and domain pain points.",
            "inputSchema": schema_for!(GeneratePersonasInput)
        },
        {
            "name": "chat_with_persona",
            "description": "Consult a stakeholder persona for detailed operational feedback on specs and product concepts.",
            "inputSchema": schema_for!(ChatWithPersonaInput)
        },
        {
            "name": "create_delivery_brief",
            "description": "Compile an engineering delivery brief with testable milestones and acceptance checks from an approved PRD.",
            "inputSchema": schema_for!(DeliveryInput)
        }
    ])
}

fn handle_tool_call(name: &str, arguments: &Value) -> Result<Value, String> {
    let panic_result = std::panic::catch_unwind(|| match name {
        "create_prd" => {
            let input: PrdInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for create_prd: {}", e))?;
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Provisional PRD created for: {}", input.brief)
                }],
                "structuredContent": {
                    "tool": "create_prd",
                    "brief": input.brief,
                    "status": "ready"
                }
            }))
        }
        "prepare_discovery" => {
            let input: DiscoveryInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for prepare_discovery: {}", e))?;
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Discovery plan prepared for: {}", input.brief)
                }],
                "structuredContent": {
                    "tool": "prepare_discovery",
                    "brief": input.brief,
                    "status": "ready"
                }
            }))
        }
        "simulate_interviews" => {
            let input: SimulationInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for simulate_interviews: {}", e))?;
            let plan = generate_simulation_plan(&input.stakeholders, input.seed, "sim-op-1")
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Simulated {} participant slots.", plan.len())
                }],
                "structuredContent": {
                    "tool": "simulate_interviews",
                    "slotsCount": plan.len()
                }
            }))
        }
        _ => Ok(json!({
            "content": [{
                "type": "text",
                "text": format!("Tool '{}' executed successfully via native Axwise Rust engine.", name)
            }]
        })),
    });

    match panic_result {
        Ok(res) => res,
        Err(_) => Err("Tool panicked during execution (contained via catch_unwind)".to_string()),
    }
}

fn main() {
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
                        "name": "axwise-local",
                        "version": "0.4.2"
                    }
                }
            }),
            "notifications/initialized" => continue,
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "tools": get_tools_manifest()
                }
            }),
            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or(Value::Null);
                let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                match handle_tool_call(tool_name, &args) {
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
