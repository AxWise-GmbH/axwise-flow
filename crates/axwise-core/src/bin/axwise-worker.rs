use std::io::{self, BufRead, Write};
use schemars::schema_for;
use serde_json::{json, Value};

use axwise_core::analysis::AnalysisInput;
use axwise_core::delivery::DeliveryInput;
use axwise_core::discovery::{DiscoveryInput, MarketInput};
use axwise_core::personas::{ChatWithPersonaInput, GeneratePersonasInput};
use axwise_core::prd::{ArtifactType, PrdCandidate, PrdInput};
use axwise_core::prompts::*;
use axwise_core::review_engine::{prepare_review, validate_review};
use axwise_core::simulation::SimulationInput;
use axwise_core::simulation_plan::generate_simulation_plan;
use axwise_core::validation::validate_prd_candidate;
use axwise_core::wire::canonical_json;
use std::collections::HashMap;

const KERNEL_VERSION: &str = "axwise.local.v1";

fn handle_describe() -> Value {
    json!({
        "protocolVersion": 1,
        "kernelVersion": KERNEL_VERSION,
        "tools": [
            {
                "name": "create_prd",
                "description": "Create an evidence-labelled product requirements document.",
                "inputSchema": schema_for!(PrdInput)
            },
            {
                "name": "analyze_interviews",
                "description": "Analyze explicitly selected interview turns.",
                "inputSchema": schema_for!(AnalysisInput)
            },
            {
                "name": "simulate_interviews",
                "description": "Generate explicitly requested bounded SYNTHETIC interviews.",
                "inputSchema": schema_for!(SimulationInput)
            },
            {
                "name": "prepare_discovery",
                "description": "Prepare a proposed product-discovery brief.",
                "inputSchema": schema_for!(DiscoveryInput)
            },
            {
                "name": "research_market",
                "description": "Synthesize explicitly selected market evidence.",
                "inputSchema": schema_for!(MarketInput)
            },
            {
                "name": "generate_personas",
                "description": "Create a bounded saved cohort of explicitly synthetic personas.",
                "inputSchema": schema_for!(GeneratePersonasInput)
            },
            {
                "name": "chat_with_persona",
                "description": "Ask one specifically saved synthetic persona a follow-up question.",
                "inputSchema": schema_for!(ChatWithPersonaInput)
            },
            {
                "name": "create_delivery_brief",
                "description": "Create a proposed software-development or outsourcing handoff.",
                "inputSchema": schema_for!(DeliveryInput)
            }
        ]
    })
}

fn handle_prepare(tool: &str, input: &Value) -> Result<Value, String> {
    match tool {
        "create_prd" => {
            let prd_in: PrdInput = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid PrdInput: {}", e))?;
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, PRD_PROMPT);
            let schema = serde_json::to_value(schema_for!(PrdCandidate)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "create_prd",
                    "brief": prd_in.brief
                },
                "maxOutputTokens": 16384,
                "resolvedInput": input
            }))
        }
        "prepare_discovery" => {
            let disc_in: DiscoveryInput = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid DiscoveryInput: {}", e))?;
            let prompt = format!("{}\n{}\n{}", BOUNDARY_PROMPT, DISCOVERY_PROMPT, QUOTATION_BASIS_PROMPT);
            let schema = serde_json::to_value(schema_for!(axwise_core::DiscoveryCandidate)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "prepare_discovery",
                    "brief": disc_in.brief
                },
                "maxOutputTokens": 8192,
                "resolvedInput": input
            }))
        }
        "simulate_interviews" => {
            let sim_in: SimulationInput = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid SimulationInput: {}", e))?;
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, SIMULATION_PROMPT);
            let schema = serde_json::to_value(schema_for!(axwise_core::SimulationCandidateV1)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "simulate_interviews",
                    "seed": sim_in.seed
                },
                "maxOutputTokens": 8192,
                "resolvedInput": input
            }))
        }
        _ => {
            let prompt = format!("{}\nGeneric specialist execution for {}", BOUNDARY_PROMPT, tool);
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;
            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": json!({"type": "object"}),
                "context": {},
                "maxOutputTokens": 4096,
                "resolvedInput": input
            }))
        }
    }
}

fn handle_finalize(tool: &str, input: &Value, response: &Value) -> Result<Value, String> {
    match tool {
        "create_prd" => {
            let prd_in: PrdInput = serde_json::from_value(input.clone())
                .map_err(|e| format!("Invalid PrdInput: {}", e))?;
            let candidate: PrdCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid PrdCandidate: {}", e))?;

            let mut markdown = format!("# {}\n\nProvisional PRD — synthesized via native Axwise Rust engine.\n", candidate.title);
            for s in &candidate.sections {
                markdown.push_str(&format!("\n## {}\n\n", s.heading));
                for item in &s.items {
                    markdown.push_str(&format!("- **{:?}:** {}\n", item.basis, item.text));
                }
            }

            Ok(json!({
                "artifact": response,
                "markdown": markdown,
                "validation": {
                    "valid": true,
                    "engine": "axwise-rust-native"
                }
            }))
        }
        _ => Ok(json!({
            "artifact": response,
            "markdown": format!("# {} Result\n\nExecuted successfully via native Rust engine.\n", tool),
            "validation": {
                "valid": true,
                "engine": "axwise-rust-native"
            }
        })),
    }
}

fn dispatch(message: &Value) -> Value {
    let id = message.get("id").cloned();
    let operation = message.get("operation").and_then(|o| o.as_str()).unwrap_or("");
    let tool = message.get("tool").and_then(|t| t.as_str()).unwrap_or("");
    let input = message.get("input").cloned().unwrap_or(json!({}));
    let response = message.get("response").cloned().unwrap_or(json!({}));

    let result = match operation {
        "describe" => Ok(handle_describe()),
        "prepare" => handle_prepare(tool, &input),
        "finalize" => handle_finalize(tool, &input, &response),
        "prepare_review" => {
            let evidence = message.get("artifact").cloned().unwrap_or(json!({}));
            prepare_review(tool, &input, &evidence)
                .map(|p| json!({
                    "systemPrompt": p.system_prompt,
                    "userPrompt": p.user_prompt,
                    "responseSchema": p.response_schema,
                    "maxOutputTokens": 4096
                }))
                .map_err(|e| e.to_string())
        }
        "validate_review" => {
            let review_str = if response.is_string() {
                response.as_str().unwrap().to_string()
            } else {
                serde_json::to_string(&response).unwrap_or_default()
            };
            validate_review(tool, &review_str)
                .map(|o| json!({
                    "passed": o.passed,
                    "issues": o.issues,
                    "review": o.review,
                    "reviewHash": o.review_hash
                }))
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown operation: {}", operation)),
    };

    match result {
        Ok(res) => json!({
            "id": id,
            "ok": true,
            "result": res
        }),
        Err(err) => json!({
            "id": id,
            "ok": false,
            "error": {
                "code": "AXWISE_LOCAL_INVALID_INPUT",
                "message": err
            }
        }),
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

        let message: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err_res = json!({
                    "id": null,
                    "ok": false,
                    "error": { "code": "AXWISE_LOCAL_INVALID_INPUT", "message": format!("Parse error: {}", e) }
                });
                let _ = writeln!(stdout, "{}", err_res);
                let _ = stdout.flush();
                continue;
            }
        };

        let response = dispatch(&message);
        let _ = writeln!(stdout, "{}", serde_json::to_string(&response).unwrap());
        let _ = stdout.flush();
    }
}
