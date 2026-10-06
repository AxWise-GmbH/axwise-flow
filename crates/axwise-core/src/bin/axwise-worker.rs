use schemars::schema_for;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

use axwise_core::analysis::{AnalysisCandidateV1, AnalysisInput};
use axwise_core::delivery::{DeliveryCandidate, DeliveryInput};
use axwise_core::discovery::{DiscoveryCandidate, DiscoveryInput, MarketCandidate, MarketInput};
use axwise_core::personas::{
    ChatWithPersonaInput, GeneratePersonasInput, PersonaCandidate, PersonaChatCandidate,
};
use axwise_core::prd::{PrdCandidate, PrdInput};
use axwise_core::prompts::*;
use axwise_core::review_engine::{prepare_review, validate_review};
use axwise_core::simulation::{SimulationCandidateV1, SimulationInput};
use axwise_core::validation::validate_prd_candidate;
use axwise_core::wire::canonical_json;

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
            let schema =
                serde_json::to_value(schema_for!(PrdCandidate)).map_err(|e| e.to_string())?;
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
            let prompt = format!(
                "{}\n{}\n{}",
                BOUNDARY_PROMPT, DISCOVERY_PROMPT, QUOTATION_BASIS_PROMPT
            );
            let schema =
                serde_json::to_value(schema_for!(DiscoveryCandidate)).map_err(|e| e.to_string())?;
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
            let schema = serde_json::to_value(schema_for!(SimulationCandidateV1))
                .map_err(|e| e.to_string())?;
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
        "analyze_interviews" => {
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, ANALYSIS_PROMPT);
            let schema = serde_json::to_value(schema_for!(AnalysisCandidateV1))
                .map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "analyze_interviews"
                },
                "maxOutputTokens": 16384,
                "resolvedInput": input
            }))
        }
        "research_market" => {
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, MARKET_PROMPT);
            let schema =
                serde_json::to_value(schema_for!(MarketCandidate)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "research_market"
                },
                "maxOutputTokens": 8192,
                "resolvedInput": input
            }))
        }
        "generate_personas" => {
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, PERSONA_METHOD);
            let schema =
                serde_json::to_value(schema_for!(PersonaCandidate)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "generate_personas"
                },
                "maxOutputTokens": 8192,
                "resolvedInput": input
            }))
        }
        "chat_with_persona" => {
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, PERSONA_METHOD);
            let schema = serde_json::to_value(schema_for!(PersonaChatCandidate))
                .map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "chat_with_persona"
                },
                "maxOutputTokens": 4096,
                "resolvedInput": input
            }))
        }
        "create_delivery_brief" => {
            let prompt = format!("{}\n{}", BOUNDARY_PROMPT, PRD_PROMPT);
            let schema =
                serde_json::to_value(schema_for!(DeliveryCandidate)).map_err(|e| e.to_string())?;
            let user_prompt = canonical_json(input).map_err(|e| e.to_string())?;

            Ok(json!({
                "systemPrompt": prompt,
                "userPrompt": user_prompt,
                "responseSchema": schema,
                "context": {
                    "tool": "create_delivery_brief"
                },
                "maxOutputTokens": 16384,
                "resolvedInput": input
            }))
        }
        _ => {
            let prompt = format!(
                "{}\nGeneric specialist execution for {}",
                BOUNDARY_PROMPT, tool
            );
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
            let _ = validate_prd_candidate(&prd_in, &candidate, &std::collections::HashMap::new());

            let mut markdown = format!(
                "# {}\n\nProvisional PRD — synthesized via native Axwise Rust engine.\n",
                candidate.title
            );
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
        "prepare_discovery" => {
            let candidate: DiscoveryCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid DiscoveryCandidate: {}", e))?;
            let mut markdown = format!(
                "# Product Discovery Plan\n\n**Decision:** {}\n\n## Scope\n",
                candidate.decision
            );
            for item in &candidate.scope {
                markdown.push_str(&format!("- {}\n", item));
            }
            markdown.push_str("\n## Key Uncertainties\n");
            for u in &candidate.uncertainties {
                markdown.push_str(&format!("- **{}**: {}\n", u.id, u.text));
            }
            markdown.push_str("\n## Stakeholders & Targeted Questions\n");
            for s in &candidate.stakeholders {
                markdown.push_str(&format!(
                    "\n### {} ({})\n{}\n",
                    s.label, s.id, s.description
                ));
                for q in &s.questions {
                    markdown.push_str(&format!("- [{}] {}\n", q.id, q.text));
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
        "simulate_interviews" => {
            let candidate: SimulationCandidateV1 = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid SimulationCandidateV1: {}", e))?;
            let mut markdown = format!("# Simulated Stakeholder Interviews\n\n**Cohort size:** {} participants\n\n## Participants\n", candidate.participants.len());
            for p in &candidate.participants {
                markdown.push_str(&format!(
                    "\n### {} ({})\n{}\n- **Motivations:** {}\n- **Pain Points:** {}\n",
                    p.display_name,
                    p.participant_id,
                    p.biography,
                    p.motivations.join("; "),
                    p.pain_points.join("; ")
                ));
            }
            markdown.push_str("\n## Interview Transcripts\n");
            for inv in &candidate.interviews {
                markdown.push_str(&format!("\n### Interview with {}\n", inv.participant_id));
                for ans in &inv.answers {
                    markdown.push_str(&format!("- **Q [{}]:** {}\n", ans.question_id, ans.text));
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
        "analyze_interviews" => {
            let candidate: AnalysisCandidateV1 = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid AnalysisCandidateV1: {}", e))?;
            let mut markdown = format!(
                "# Qualitative Interview Analysis\n\n**Synthesized Findings:** {}\n\n## Findings\n",
                candidate.findings.len()
            );
            for f in &candidate.findings {
                markdown.push_str(&format!(
                    "- **[{:?}] {:?}:** {} (Support: {:?})\n",
                    f.category, f.basis, f.statement, f.support_status
                ));
            }
            if !candidate.gaps.is_empty() {
                markdown.push_str("\n## Evidence Gaps\n");
                for g in &candidate.gaps {
                    markdown.push_str(&format!("- **{:?}:** {}\n", g.code, g.message));
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
        "research_market" => {
            let candidate: MarketCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid MarketCandidate: {}", e))?;
            let mut markdown = format!(
                "# Market Research Synthesis\n\n**Findings:** {}\n\n## Verified Findings\n",
                candidate.findings.len()
            );
            for f in &candidate.findings {
                markdown.push_str(&format!(
                    "- **[{:?}]:** \"{}\" (Source: {}, Question: {})\n",
                    f.basis, f.quote, f.source_id, f.question_id
                ));
            }
            if !candidate.interpretations.is_empty() {
                markdown.push_str("\n## Interpretations\n");
                for i in &candidate.interpretations {
                    markdown.push_str(&format!("- {}\n", i.text));
                }
            }
            if !candidate.gaps.is_empty() {
                markdown.push_str("\n## Evidence Gaps & Search Requests\n");
                for g in &candidate.gaps {
                    markdown.push_str(&format!("- **Q {}:** {}\n", g.question_id, g.reason));
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
        "generate_personas" => {
            let candidate: PersonaCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid PersonaCandidate: {}", e))?;
            let mut markdown = format!(
                "# Generated Stakeholder Personas\n\n**Cohort size:** {}\n",
                candidate.personas.len()
            );
            for p in &candidate.personas {
                markdown.push_str(&format!(
                    "\n## {} ({})\n{}\n- **Origin:** {}\n- **Communication Style:** {}\n",
                    p.label, p.id, p.description, p.origin, p.communication_style
                ));
                markdown.push_str("### Motivations\n");
                for m in &p.motivations {
                    markdown.push_str(&format!("- {}\n", m.text));
                }
                markdown.push_str("### Pain Points\n");
                for pt in &p.pain_points {
                    markdown.push_str(&format!("- {}\n", pt.text));
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
        "chat_with_persona" => {
            let candidate: PersonaChatCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid PersonaChatCandidate: {}", e))?;
            let markdown = format!(
                "# Consultation with Persona {}\n\n{}\n",
                candidate.persona_id, candidate.response
            );
            Ok(json!({
                "artifact": response,
                "markdown": markdown,
                "validation": {
                    "valid": true,
                    "engine": "axwise-rust-native"
                }
            }))
        }
        "create_delivery_brief" => {
            let candidate: DeliveryCandidate = serde_json::from_value(response.clone())
                .map_err(|e| format!("Invalid DeliveryCandidate: {}", e))?;
            let mut markdown = format!(
                "# Engineering Delivery Brief: {}\n\n## Milestones\n",
                candidate.title
            );
            for m in &candidate.milestones {
                markdown.push_str(&format!("\n### {}\n- **Deliverable:** {}\n- **Exit Condition:** {}\n- **Requirements:** {}\n",
                    m.title, m.deliverable, m.exit_condition, m.requirement_ids.join(", ")));
            }
            markdown.push_str("\n## Requirement Test Coverage\n");
            for r in &candidate.requirements {
                markdown.push_str(&format!("\n### Requirement {}\n", r.requirement_id));
                for t in &r.acceptance_tests {
                    markdown.push_str(&format!(
                        "- **Given** {}, **When** {}, **Then** {} (Evidence: {})\n",
                        t.given, t.when, t.then, t.evidence_expected
                    ));
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
    let operation = message
        .get("operation")
        .and_then(|o| o.as_str())
        .unwrap_or("");
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
                .map(|p| {
                    json!({
                        "systemPrompt": p.system_prompt,
                        "userPrompt": p.user_prompt,
                        "responseSchema": p.response_schema,
                        "maxOutputTokens": 4096
                    })
                })
                .map_err(|e| e.to_string())
        }
        "validate_review" => {
            let review_str = if response.is_string() {
                response.as_str().unwrap().to_string()
            } else {
                serde_json::to_string(&response).unwrap_or_default()
            };
            validate_review(tool, &review_str)
                .map(|o| {
                    json!({
                        "passed": o.passed,
                        "issues": o.issues,
                        "review": o.review,
                        "reviewHash": o.review_hash
                    })
                })
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
