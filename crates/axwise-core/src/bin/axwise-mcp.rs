use std::io::{self, BufRead, Write};
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
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
        },
        {
            "name": "audit_gate_b",
            "description": "Execute Stage 8 Gate B Deliverable Integrity and Hedging Verification via TypeSafe JEV System-1.",
            "inputSchema": schema_for!(AuditGateBInput)
        }
    ])
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuditGateBInput {
    pub deliverable: String,
    #[serde(default)]
    pub acceptance_criteria: Vec<Value>,
    #[serde(default)]
    pub evidence: Option<Value>,
}

const KNOWN_TOOLS: &[&str] = &[
    "create_prd",
    "analyze_interviews",
    "simulate_interviews",
    "prepare_discovery",
    "research_market",
    "generate_personas",
    "chat_with_persona",
    "create_delivery_brief",
    "audit_gate_b",
];

async fn execute_pipeline(name: &str, arguments: &Value) -> Result<Value, String> {
    if !KNOWN_TOOLS.contains(&name) {
        return Err(format!("Unknown tool: {}", name));
    }

    if name == "audit_gate_b" {
        let input: AuditGateBInput = serde_json::from_value(arguments.clone())
            .map_err(|e| format!("Invalid arguments for audit_gate_b: {}", e))?;
        let outcome = jev::audit_gate_b(&input.deliverable, &input.acceptance_criteria, input.evidence.as_ref())
            .await
            .map_err(|e| format!("JEV Gate B error: {}", e))?;
        return Ok(json!({
            "content": [{
                "type": "text",
                "text": serde_json::to_string_pretty(&outcome).unwrap_or_default()
            }],
            "structuredContent": outcome
        }));
    }

    let depth = arguments.get("depth").and_then(|d| d.as_str()).unwrap_or("standard");
    let default_gemini_model = if depth == "deep" {
        "gemini-3.8-flash"
    } else {
        "gemini-3.5-flash-lite"
    };

    let creds = discover_credentials();
    let provider = if let Some(token) = creds.get("AXWISE_ACCOUNT_TOKEN").or_else(|| creds.get("ORQALY_ACCOUNT_TOKEN")) {
        let gateway_url = creds.get("AXWISE_GATEWAY_URL").or_else(|| creds.get("ORQALY_GATEWAY_URL")).cloned();
        let account_hash = creds.get("AXWISE_ACCOUNT_HASH").or_else(|| creds.get("ORQALY_ACCOUNT_HASH")).cloned();
        Some(ModelProvider::with_account_hash(ProviderType::DesktopGateway, token.clone(), gateway_url, "orqaly-gemini".to_string(), account_hash))
    } else if let Some(key) = creds.get("OPENAI_API_KEY") {
        Some(ModelProvider::new(ProviderType::OpenAi, key.clone(), None, "gpt-4o".to_string()))
    } else if let Some(key) = creds.get("ANTHROPIC_API_KEY") {
        Some(ModelProvider::new(ProviderType::Anthropic, key.clone(), None, "claude-3-5-sonnet-20241022".to_string()))
    } else if let Some(key) = creds.get("GOOGLE_API_KEY").or_else(|| creds.get("GEMINI_API_KEY")) {
        let model = std::env::var("AXWISE_GEMINI_MODEL").unwrap_or_else(|_| default_gemini_model.to_string());
        Some(ModelProvider::new(ProviderType::Gemini, key.clone(), None, model))
    } else {
        None
    };

    let Some(provider) = provider else {
        return Ok(json!({
            "content": [{
                "type": "text",
                "text": format!("Native Axwise requires LLM provider credentials to execute '{}'. Please configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in your environment or Goose keychain.", name)
            }],
            "isError": true
        }));
    };

    let (system_prompt, user_prompt, max_tokens) = match name {
        "create_prd" => {
            let input: PrdInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for create_prd: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PRD_PROMPT),
                format!("Brief: {}\nReferences: {:?}", input.brief, input.references),
                16384,
            )
        }
        "prepare_discovery" => {
            let input: DiscoveryInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for prepare_discovery: {}", e))?;
            (
                format!("{}\n{}\n{}", prompts::BOUNDARY_PROMPT, prompts::DISCOVERY_PROMPT, prompts::QUOTATION_BASIS_PROMPT),
                format!("Brief: {}\nDepth: {:?}", input.brief, input.depth),
                8192,
            )
        }
        "simulate_interviews" => {
            let input: SimulationInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for simulate_interviews: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::SIMULATION_PROMPT),
                format!("Scenario: {:?}\nSeed: {:?}", input.scenario, input.seed),
                8192,
            )
        }
        "analyze_interviews" => {
            let input: AnalysisInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for analyze_interviews: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::ANALYSIS_PROMPT),
                format!("Transcripts to analyze: {} documents", input.transcripts.len()),
                16384,
            )
        }
        "research_market" => {
            let input: MarketInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for research_market: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::MARKET_PROMPT),
                format!("Discovery Brief: {}\nQuestions: {:?}", input.brief, input.questions),
                8192,
            )
        }
        "generate_personas" => {
            let input: GeneratePersonasInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for generate_personas: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PERSONA_METHOD),
                format!("Brief: {:?}\nStakeholders: {} roles", input.brief, input.stakeholders.len()),
                8192,
            )
        }
        "chat_with_persona" => {
            let input: ChatWithPersonaInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for chat_with_persona: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PERSONA_METHOD),
                format!("Persona ID: {}\nMessage: {}", input.persona_id, input.message),
                4096,
            )
        }
        "create_delivery_brief" => {
            let input: DeliveryInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for create_delivery_brief: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PRD_PROMPT),
                format!("Delivery Brief: {}\nRequirements: {:?}", input.brief, input.requirement_ids),
                16384,
            )
        }
        _ => unreachable!(),
    };

    let mut completion = provider
        .complete(&system_prompt, &user_prompt, max_tokens)
        .await
        .map_err(|e| format!("Model provider error during {}: {}", name, e))?;

    let mut parsed: Value = serde_json::from_str(&completion)
        .unwrap_or_else(|_| json!({ "raw": completion }));

    // Stage 2: Substantive Quality Review and Auto-Repair Loop
    let mut quality_review_val: Option<Value> = None;
    if let Ok(rev_prompt) = review_engine::prepare_review(name, arguments, &parsed) {
        if let Ok(rev_completion) = provider.complete(&rev_prompt.system_prompt, &rev_prompt.user_prompt, 4096).await {
            if let Ok(outcome) = review_engine::validate_review(name, &rev_completion) {
                if !outcome.passed && !outcome.issues.is_empty() {
                    // Attempt single bounded repair
                    let repair_prompt = format!(
                        "Original Generated Artifact:\n{}\n\nQuality Review Feedback (Unsatisfied Criteria):\n- {}\n\nPlease revise the artifact to resolve every issue above while strictly conforming to the schema.",
                        completion,
                        outcome.issues.join("\n- ")
                    );
                    if let Ok(repaired_completion) = provider.complete(&system_prompt, &repair_prompt, max_tokens).await {
                        if let Ok(repaired_parsed) = serde_json::from_str::<Value>(&repaired_completion) {
                            completion = repaired_completion;
                            parsed = repaired_parsed;
                        }
                    }
                }
                quality_review_val = serde_json::to_value(&outcome.review).ok();
            }
        }
    }

    // Stage 3 / Gate B: TypeSafe JEV System-1 Deliverable Integrity Audit
    let mut gate_b_audit_val: Option<Value> = None;
    if name == "create_prd" || name == "create_delivery_brief" {
        let acceptance_criteria = parsed.get("sections")
            .and_then(|s| s.as_array())
            .map(|secs| {
                secs.iter().flat_map(|sec| {
                    sec.get("items").and_then(|i| i.as_array()).into_iter().flatten().cloned()
                }).collect::<Vec<Value>>()
            })
            .unwrap_or_default();

        if let Ok(outcome) = jev::audit_gate_b(&completion, &acceptance_criteria, arguments.get("sources")).await {
            gate_b_audit_val = serde_json::to_value(&outcome).ok();
        }
    }

    let state_dir = std::env::var("AXWISE_STATE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| std::path::PathBuf::from(h).join(".axwise").join("state"))
                .unwrap_or_else(|_| std::path::PathBuf::from(".axwise-state"))
        });

    let operation_id = format!("op-{}", uuid::Uuid::new_v4());
    let session_id = "default".to_string();
    let timestamp_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let created_at = format!("{}", timestamp_secs);

    let raw_artifact_json = serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| completion.clone());
    let quality_review_json = quality_review_val.as_ref().map(|v| v.to_string());
    let sha256_hash = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(raw_artifact_json.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    let session_dir = state_dir.join(&session_id);
    let _ = std::fs::create_dir_all(&session_dir);
    let json_path = session_dir.join(format!("{}.json", operation_id));
    let md_path = session_dir.join(format!("{}.md", operation_id));

    let record = OperationRecord {
        operation_id: operation_id.clone(),
        session_id: session_id.clone(),
        tool: name.to_string(),
        title: parsed.get("title").and_then(|t| t.as_str()).map(String::from),
        created_at: created_at.clone(),
        sha256: sha256_hash.clone(),
        json_path: json_path.to_string_lossy().to_string(),
        md_path: md_path.to_string_lossy().to_string(),
        markdown: Some(completion.clone()),
        artifact_json: Some(raw_artifact_json.clone()),
        candidate_json: Some(completion.clone()),
        input_json: Some(serde_json::to_string(arguments).unwrap_or_default()),
        provenance_json: None,
        quality_review_json: quality_review_json.clone(),
        status: "completed".to_string(),
    };

    if let Ok(mut storage) = StorageManager::new(state_dir) {
        let _ = storage.save_operation(&record, &raw_artifact_json, &completion);
    }

    Ok(json!({
        "content": [{
            "type": "text",
            "text": completion
        }],
        "structuredContent": {
            "tool": name,
            "status": "completed",
            "operationId": operation_id,
            "sha256": sha256_hash,
            "artifactPath": json_path.to_string_lossy(),
            "markdownPath": md_path.to_string_lossy(),
            "qualityReview": quality_review_val,
            "gateBAudit": gate_b_audit_val,
            "artifact": parsed
        }
    }))
}

#[tokio::main]
async fn main() {
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
                        "version": "0.4.3"
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

                match execute_pipeline(tool_name, &args).await {
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
