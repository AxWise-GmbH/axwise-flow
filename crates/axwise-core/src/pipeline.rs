use crate::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuditGateBInput {
    pub deliverable: String,
    #[serde(default)]
    pub acceptance_criteria: Vec<Value>,
    #[serde(default)]
    pub evidence: Option<Value>,
}

fn format_analysis_substantive_prompt(input: &AnalysisInput) -> String {
    let mut transcript_details = Vec::new();
    for t in &input.transcripts {
        let mut turns_text = Vec::new();
        for turn in &t.turns {
            let q_info = turn.question_id.as_deref().unwrap_or("unassigned");
            turns_text.push(format!(
                "[{} (role: {:?}, q: {})]: {}",
                turn.speaker, turn.role, q_info, turn.text
            ));
        }
        transcript_details.push(format!(
            "### Document: {} ({})\nOrigin: {:?}\nTurns:\n{}",
            t.id,
            t.title,
            t.origin,
            turns_text.join("\n")
        ));
    }
    format!(
        "Decision Question: {}\nRequested Questions: {:?}\nTarget Outputs: {:?}\nViews: {:?}\nDepth: {:?}\nReferences: {:?}\n\nSubstantive Evidence Transcripts:\n{}",
        input.decision_question,
        input.questions,
        input.outputs,
        input.views,
        input.depth,
        input.references,
        if transcript_details.is_empty() { "No raw transcripts provided; analyze referenced artifacts.".to_string() } else { transcript_details.join("\n\n") }
    )
}

fn format_personas_substantive_prompt(input: &GeneratePersonasInput) -> String {
    let mut roles = Vec::new();
    for s in &input.stakeholders {
        roles.push(format!(
            "- Role ID: {}\n  Label: {}\n  Description: {}\n  Target Participants: {}\n  Locality: {:?}, Country: {:?}",
            s.id, s.label, s.description, s.participants, s.locality, s.country_code
        ));
    }
    format!(
        "Brief: {:?}\nDepth: {:?}\nReferences: {:?}\nSources: {:?}\n\nStakeholder Roles to Model:\n{}",
        input.brief,
        input.depth,
        input.references,
        input.sources,
        if roles.is_empty() { "Derive stakeholder roles from supplied brief and references.".to_string() } else { roles.join("\n\n") }
    )
}

fn format_chat_substantive_prompt(
    input: &ChatWithPersonaInput,
    state_dir: &std::path::Path,
    session_id: &str,
) -> Result<String, String> {
    let persona_record = if let Ok(storage) = StorageManager::new(state_dir.to_path_buf()) {
        storage.find_operation(&input.persona_id).ok().flatten()
    } else {
        None
    };

    let Some(record) = persona_record else {
        return Err(format!(
            "Persona '{}' was not found in local storage. Please generate or simulate the persona first.",
            input.persona_id
        ));
    };

    if record.session_id != session_id {
        return Err(format!(
            "Access denied: Persona '{}' belongs to session '{}', but current session is '{}'.",
            input.persona_id, record.session_id, session_id
        ));
    }

    if record.tool != "generate_personas" && record.tool != "simulate_interviews" {
        return Err(format!(
            "Invalid artifact: Record '{}' is a '{}', not a persona artifact.",
            input.persona_id, record.tool
        ));
    }

    Ok(format!(
        "Persona ID: {}\nPersona Record ({}, tool: {}):\n{}\nDocument References: {:?}\nDocument Reference Selected: {:?}\nDepth: {:?}\n\nUser Message: {}",
        input.persona_id,
        record.operation_id,
        record.tool,
        record.artifact_json.as_deref().unwrap_or("{}"),
        input.references,
        input.document_reference,
        input.depth,
        input.message
    ))
}

fn validate_tool_candidate_schema(name: &str, value: &Value) -> Result<(), String> {
    match name {
        "create_prd" => serde_json::from_value::<prd::PrdCandidate>(value.clone())
            .map(|_| ())
            .map_err(|e| format!("Invalid PrdCandidate schema: {e}")),
        "analyze_interviews" => {
            serde_json::from_value::<analysis::AnalysisCandidateV1>(value.clone())
                .map(|_| ())
                .map_err(|e| format!("Invalid AnalysisCandidateV1 schema: {e}"))
        }
        "simulate_interviews" => {
            serde_json::from_value::<simulation::SimulationCandidateV1>(value.clone())
                .map(|_| ())
                .map_err(|e| format!("Invalid SimulationCandidateV1 schema: {e}"))
        }
        "prepare_discovery" => {
            serde_json::from_value::<discovery::DiscoveryCandidate>(value.clone())
                .map(|_| ())
                .map_err(|e| format!("Invalid DiscoveryCandidate schema: {e}"))
        }
        "research_market" => serde_json::from_value::<discovery::MarketCandidate>(value.clone())
            .map(|_| ())
            .map_err(|e| format!("Invalid MarketCandidate schema: {e}")),
        "generate_personas" => serde_json::from_value::<personas::PersonaCandidate>(value.clone())
            .map(|_| ())
            .map_err(|e| format!("Invalid PersonaCandidate schema: {e}")),
        "chat_with_persona" => {
            serde_json::from_value::<personas::PersonaChatCandidate>(value.clone())
                .map(|_| ())
                .map_err(|e| format!("Invalid PersonaChatCandidate schema: {e}"))
        }
        "create_delivery_brief" => {
            serde_json::from_value::<delivery::DeliveryCandidate>(value.clone())
                .map(|_| ())
                .map_err(|e| format!("Invalid DeliveryCandidate schema: {e}"))
        }
        _ => Ok(()),
    }
}

fn format_simulation_substantive_prompt(input: &SimulationInput) -> String {
    let mut stakeholders_text = Vec::new();
    for s in &input.stakeholders {
        stakeholders_text.push(format!(
            "- Stakeholder {}: {} (Participants: {})\n  Description: {}\n  Questions:\n  * {}",
            s.id,
            s.label,
            s.participants,
            s.description,
            s.questions.join("\n  * ")
        ));
    }
    format!(
        "Scenario: {:?}\nProblem: {:?}\nTarget Audience: {:?}\nResponse Style: {:?}\nSeed: {:?}\nStakeholders:\n{}",
        input.scenario,
        input.problem,
        input.target_audience,
        input.response_style,
        input.seed,
        stakeholders_text.join("\n\n")
    )
}

fn format_prd_substantive_prompt(input: &PrdInput) -> String {
    format!(
        "Brief: {}\nArtifact Type: {:?}\nDepth: {:?}\nRevision Edits: {:?}\nAnalysis Artifact Reference: {:?}\nReferences: {:?}\nSources: {:?}",
        input.brief,
        input.artifact_type,
        input.depth,
        input.revision_edits,
        input.analysis_artifact,
        input.references,
        input.sources
    )
}

pub const KNOWN_TOOLS: &[&str] = &[
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

pub async fn execute_pipeline(
    name: &str,
    arguments: &Value,
    metadata: Option<&Value>,
) -> Result<Value, String> {
    let scope = crate::scope::HostScope::resolve(
        metadata,
        std::env::var("AXWISE_ACCOUNT_HASH")
            .or_else(|_| std::env::var("ORQALY_ACCOUNT_HASH"))
            .ok(),
        std::env::var("AXWISE_SESSION_ID").ok(),
        arguments,
    )?;

    execute_in_scope(name, arguments, &scope).await
}

pub async fn execute_in_scope(
    name: &str,
    arguments: &Value,
    scope: &crate::scope::HostScope,
) -> Result<Value, String> {
    if !KNOWN_TOOLS.contains(&name) {
        return Err(format!("Unknown tool: {name}"));
    }
    let scope = crate::scope::HostScope::resolve(
        Some(&serde_json::to_value(scope).map_err(|e| e.to_string())?),
        None,
        None,
        arguments,
    )?;

    // Desktop production uses the same mature domain kernel as the former
    // Local extension. Never fall back to the incomplete Rust candidate worker.
    if name != "audit_gate_b"
        && std::env::var("AXWISE_EXPERIMENTAL_RUST_PIPELINE").as_deref() != Ok("1")
    {
        return crate::specialist::execute(name, arguments, &scope).await;
    }
    if name == "audit_gate_b" {
        let input: AuditGateBInput = serde_json::from_value(arguments.clone())
            .map_err(|e| format!("Invalid arguments for audit_gate_b: {}", e))?;
        let outcome = jev::audit_gate_b_in_scope(
            &scope,
            &input.deliverable,
            &input.acceptance_criteria,
            input.evidence.as_ref(),
        )
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

    let depth = arguments
        .get("depth")
        .and_then(|d| d.as_str())
        .unwrap_or("standard");
    let default_gemini_model = if depth == "deep" {
        "gemini-3.8-flash"
    } else {
        "gemini-3.5-flash-lite"
    };

    let creds = discover_credentials();
    let provider = if let Some(token) = creds
        .get("AXWISE_ACCOUNT_TOKEN")
        .or_else(|| creds.get("ORQALY_ACCOUNT_TOKEN"))
    {
        let gateway_url = Some(
            creds
                .get("AXWISE_GATEWAY_URL")
                .or_else(|| creds.get("ORQALY_GATEWAY_URL"))
                .ok_or("missing_managed_gateway_url")?
                .clone(),
        );
        let account_hash = Some(scope.account.clone());
        Some(ModelProvider::with_account_hash(
            ProviderType::DesktopGateway,
            token.clone(),
            gateway_url,
            "orqaly-gemini".to_string(),
            account_hash,
        ))
    } else if let Some(key) = creds.get("OPENAI_API_KEY") {
        Some(ModelProvider::new(
            ProviderType::OpenAi,
            key.clone(),
            std::env::var("AXWISE_OPENAI_BASE_URL").ok(),
            "gpt-4o".to_string(),
        ))
    } else if let Some(key) = creds.get("ANTHROPIC_API_KEY") {
        Some(ModelProvider::new(
            ProviderType::Anthropic,
            key.clone(),
            None,
            "claude-3-5-sonnet-20241022".to_string(),
        ))
    } else if let Some(key) = creds
        .get("GOOGLE_API_KEY")
        .or_else(|| creds.get("GEMINI_API_KEY"))
    {
        let model = std::env::var("AXWISE_GEMINI_MODEL")
            .unwrap_or_else(|_| default_gemini_model.to_string());
        Some(ModelProvider::new(
            ProviderType::Gemini,
            key.clone(),
            None,
            model,
        ))
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

    let state_dir = std::env::var("AXWISE_STATE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| std::path::PathBuf::from(h).join(".axwise").join("state"))
                .unwrap_or_else(|_| std::path::PathBuf::from(".axwise-state"))
        });

    let state_dir = state_dir.join(&scope.account);
    let session_id = scope.session.clone();

    let (system_prompt, user_prompt, max_tokens) = match name {
        "create_prd" => {
            let input: PrdInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for create_prd: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PRD_PROMPT),
                format_prd_substantive_prompt(&input),
                16384,
            )
        }
        "prepare_discovery" => {
            let input: DiscoveryInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for prepare_discovery: {}", e))?;
            (
                format!(
                    "{}\n{}\n{}",
                    prompts::BOUNDARY_PROMPT,
                    prompts::DISCOVERY_PROMPT,
                    prompts::QUOTATION_BASIS_PROMPT
                ),
                format!(
                    "Brief: {}\nDepth: {:?}\nReferences: {:?}\nSources: {:?}\nExclusions: {:?}",
                    input.brief, input.depth, input.references, input.sources, input.exclusions
                ),
                8192,
            )
        }
        "simulate_interviews" => {
            let input: SimulationInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for simulate_interviews: {}", e))?;
            (
                format!(
                    "{}\n{}",
                    prompts::BOUNDARY_PROMPT,
                    prompts::SIMULATION_PROMPT
                ),
                format_simulation_substantive_prompt(&input),
                8192,
            )
        }
        "analyze_interviews" => {
            let input: AnalysisInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for analyze_interviews: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::ANALYSIS_PROMPT),
                format_analysis_substantive_prompt(&input),
                16384,
            )
        }
        "research_market" => {
            let input: MarketInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for research_market: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::MARKET_PROMPT),
                format!("Discovery Brief: {}\nQuestions: {:?}\nDepth: {:?}\nReferences: {:?}\nSources: {:?}", input.brief, input.questions, input.depth, input.references, input.sources),
                8192,
            )
        }
        "generate_personas" => {
            let input: GeneratePersonasInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for generate_personas: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PERSONA_METHOD),
                format_personas_substantive_prompt(&input),
                8192,
            )
        }
        "chat_with_persona" => {
            let input: ChatWithPersonaInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for chat_with_persona: {}", e))?;
            let prompt = format_chat_substantive_prompt(&input, &state_dir, &session_id)?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PERSONA_METHOD),
                prompt,
                4096,
            )
        }
        "create_delivery_brief" => {
            let input: DeliveryInput = serde_json::from_value(arguments.clone())
                .map_err(|e| format!("Invalid arguments for create_delivery_brief: {}", e))?;
            (
                format!("{}\n{}", prompts::BOUNDARY_PROMPT, prompts::PRD_PROMPT),
                format!(
                    "Delivery Brief: {}\nDepth: {:?}\nRequirements: {:?}\nReferences: {:?}",
                    input.brief, input.depth, input.requirement_ids, input.references
                ),
                16384,
            )
        }
        _ => unreachable!(),
    };

    let mut completion = provider
        .complete(&system_prompt, &user_prompt, max_tokens)
        .await
        .map_err(|e| format!("Model provider error during {}: {}", name, e))?;

    let mut parsed: Value = match serde_json::from_str(&completion) {
        Ok(v) => v,
        Err(e) => {
            return Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Model completion for '{}' did not conform to JSON syntax: {}. Completion: {}", name, e, completion)
                }],
                "isError": true
            }));
        }
    };

    // Validate against canonical typed candidate schema
    if let Err(schema_err) = validate_tool_candidate_schema(name, &parsed) {
        return Ok(json!({
            "content": [{
                "type": "text",
                "text": format!("Model completion for '{}' failed canonical schema validation: {}. Content: {}", name, schema_err, completion)
            }],
            "isError": true
        }));
    }

    // A repaired candidate must pass its own review before persistence.
    let mut accepted_review = None;
    for attempt in 0..=1 {
        let prompt = review_engine::prepare_review(name, arguments, &parsed)
            .map_err(|e| format!("review_failed: {e}"))?;
        let review_text = provider
            .complete(&prompt.system_prompt, &prompt.user_prompt, 4096)
            .await
            .map_err(|e| format!("review_failed: {e}"))?;
        let outcome = review_engine::validate_review(name, &review_text)
            .map_err(|e| format!("review_failed: {e}"))?;
        if outcome.passed {
            accepted_review = Some(outcome);
            break;
        }
        if attempt == 1 {
            return Err(format!("review_failed: {}", outcome.issues.join(", ")));
        }
        let repair = format!(
            "Original artifact:\n{completion}\n\nFailed review criteria: {}\nReturn a corrected artifact matching the original JSON schema.",
            outcome.issues.join(", "),
        );
        completion = provider
            .complete(&system_prompt, &repair, max_tokens)
            .await
            .map_err(|e| format!("repair_failed: {e}"))?;
        parsed =
            serde_json::from_str(&completion).map_err(|e| format!("repair_invalid_json: {e}"))?;
        validate_tool_candidate_schema(name, &parsed)?;
    }
    let quality_review_val = Some(
        serde_json::to_value(accepted_review.ok_or("review_not_accepted")?)
            .map_err(|e| e.to_string())?,
    );

    let mut gate_b_audit_val = None;
    if name == "create_prd" || name == "create_delivery_brief" {
        let acceptance_criteria = parsed
            .get("sections")
            .and_then(Value::as_array)
            .map(|sections| {
                sections
                    .iter()
                    .flat_map(|section| {
                        section
                            .get("items")
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .cloned()
                    })
                    .collect::<Vec<Value>>()
            })
            .unwrap_or_default();
        let audited = serde_json::to_string_pretty(&parsed).map_err(|e| e.to_string())?;
        let outcome = jev::audit_gate_b_in_scope(
            &scope,
            &audited,
            &acceptance_criteria,
            arguments.get("sources"),
        )
        .await
        .map_err(|e| format!("gate_b_failed: {e}"))?;
        if !outcome.passed {
            return Err(format!("gate_b_failed: {}", outcome.verdict));
        }
        gate_b_audit_val = Some(serde_json::to_value(outcome).map_err(|e| e.to_string())?);
    }

    let operation_id = format!("op-{}", uuid::Uuid::new_v4());
    let timestamp_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let created_at = format!("{}", timestamp_secs);

    let raw_artifact_json =
        serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| completion.clone());
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
        title: parsed
            .get("title")
            .and_then(|t| t.as_str())
            .map(String::from),
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

    let storage_accepted = if let Ok(mut storage) = StorageManager::new(state_dir) {
        storage
            .save_operation(&record, &raw_artifact_json, &completion)
            .is_ok()
    } else {
        false
    };

    if !storage_accepted {
        return Ok(json!({
            "content": [{
                "type": "text",
                "text": format!("Tool '{}' artifact generation succeeded, but persistent storage acceptance failed.", name)
            }],
            "isError": true,
            "structuredContent": {
                "tool": name,
                "status": "storage_failed",
                "storageAccepted": false
            }
        }));
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
            "bytes": raw_artifact_json.len(),
            "artifactPath": json_path.to_string_lossy(),
            "markdownPath": md_path.to_string_lossy(),
            "storageAccepted": storage_accepted,
            "qualityReview": quality_review_val,
            "gateBAudit": gate_b_audit_val,
            "artifact": parsed
        }
    }))
}

pub fn completed_artifact_schema() -> Value {
    json!({
        "type":"object",
        "required":["tool","status","operationId","sha256","bytes","artifactPath","storageAccepted","qualityReview","artifact"],
        "properties": {
            "tool":{"type":"string"}, "status":{"const":"completed"},
            "operationId":{"type":"string","minLength":1},
            "sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},
            "bytes":{"type":"integer","minimum":1},
            "artifactPath":{"type":"string","minLength":1},
            "storageAccepted":{"const":true},
            "qualityReview":{"type":"object"}, "artifact":{"type":"object"}
        }
    })
}
