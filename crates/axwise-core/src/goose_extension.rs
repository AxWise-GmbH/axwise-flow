use crate::*;
use schemars::schema_for;
use serde_json::Value;

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
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}

impl AxwisePlatformExtension {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_instructions(&self) -> &'static str {
        crate::prompts::CONVERSATION_INSTRUCTIONS
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

    pub async fn call_tool_in_scope(
        &self,
        name: &str,
        arguments: &Value,
        scope: &crate::scope::HostScope,
    ) -> Result<Value, String> {
        crate::pipeline::execute_in_scope(name, arguments, scope).await
    }

    /// Standalone compatibility entry point; embedded hosts should pass trusted scope.
    pub fn call_tool(&self, name: &str, arguments: &Value) -> Result<Value, String> {
        let name = name.to_owned();
        let arguments = arguments.clone();
        std::thread::Builder::new()
            .name("axwise-pipeline".into())
            .spawn(move || {
                tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?
                    .block_on(crate::pipeline::execute_pipeline(&name, &arguments, None))
            })
            .map_err(|e| e.to_string())?
            .join()
            .map_err(|_| "Native AxWise pipeline panicked".to_owned())?
    }
}
