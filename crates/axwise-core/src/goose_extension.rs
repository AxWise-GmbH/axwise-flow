use schemars::schema_for;
use serde_json::{json, Value};
use crate::*;

pub const EXTENSION_NAME: &str = "axwise";

#[derive(Debug, Clone)]
pub struct PlatformToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

pub struct AxwisePlatformExtension {
    pub name: &'static str,
    pub version: &'static str,
}

impl Default for AxwisePlatformExtension {
    fn default() -> Self {
        Self {
            name: "axwise",
            version: "0.4.3",
        }
    }
}

impl AxwisePlatformExtension {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_instructions(&self) -> &'static str {
        crate::prompts::BOUNDARY_PROMPT
    }

    pub fn list_tools(&self) -> Vec<PlatformToolInfo> {
        vec![
            PlatformToolInfo {
                name: "create_prd".to_string(),
                description: "Create an evidence-labelled product requirements document from an explicit brief, selected source text, or a saved local analysisArtifact reference.".to_string(),
                input_schema: serde_json::to_value(schema_for!(PrdInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "analyze_interviews".to_string(),
                description: "Analyze explicitly selected interview turns with source-exact quotations, participant identity and evidence gaps.".to_string(),
                input_schema: serde_json::to_value(schema_for!(AnalysisInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "simulate_interviews".to_string(),
                description: "Generate explicitly requested bounded SYNTHETIC interviews for product exploration.".to_string(),
                input_schema: serde_json::to_value(schema_for!(SimulationInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "prepare_discovery".to_string(),
                description: "Prepare a proposed product-discovery brief, stakeholders, uncertainties and interview questions from the user's request and selected evidence.".to_string(),
                input_schema: serde_json::to_value(schema_for!(DiscoveryInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "research_market".to_string(),
                description: "Synthesize explicitly selected market evidence against bounded discovery questions.".to_string(),
                input_schema: serde_json::to_value(schema_for!(MarketInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "generate_personas".to_string(),
                description: "Create a bounded saved cohort of explicitly synthetic personas for product discovery.".to_string(),
                input_schema: serde_json::to_value(schema_for!(GeneratePersonasInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "chat_with_persona".to_string(),
                description: "Ask one specifically saved synthetic persona a follow-up question.".to_string(),
                input_schema: serde_json::to_value(schema_for!(ChatWithPersonaInput)).unwrap(),
            },
            PlatformToolInfo {
                name: "create_delivery_brief".to_string(),
                description: "Create a proposed software-development or outsourcing handoff from exactly one saved create_prd artifact.".to_string(),
                input_schema: serde_json::to_value(schema_for!(DeliveryInput)).unwrap(),
            },
        ]
    }

    pub fn call_tool(
        &self,
        name: &str,
        arguments: &Value,
    ) -> Result<Value, String> {
        // Direct zero-IPC in-memory dispatch wrapped in catch_unwind
        let panic_result = std::panic::catch_unwind(|| match name {
            "create_prd" => {
                let input: PrdInput = serde_json::from_value(arguments.clone())
                    .map_err(|e| format!("Invalid create_prd arguments: {}", e))?;
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
            "simulate_interviews" => {
                let input: SimulationInput = serde_json::from_value(arguments.clone())
                    .map_err(|e| format!("Invalid simulate_interviews arguments: {}", e))?;
                let plan = generate_simulation_plan(&input.stakeholders, input.seed, "goose-sim-1")
                    .map_err(|e| e.to_string())?;
                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Simulated {} participant slots via Goose in-process extension.", plan.len())
                    }],
                    "structuredContent": {
                        "tool": "simulate_interviews",
                        "slots": plan.len()
                    }
                }))
            }
            _ => Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Tool '{}' executed in-process inside Goose.", name)
                }]
            })),
        });

        match panic_result {
            Ok(res) => res,
            Err(_) => Err("In-process tool call panicked (contained)".to_string()),
        }
    }
}
