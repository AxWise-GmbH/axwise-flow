use axwise_core::provider::*;
use axwise_core::specialist::model_for_depth;

#[tokio::test]
async fn unsupported_gemini_models_never_reach_http() {
    for model in [
        "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-flash-latest",
    ] {
        let provider = ModelProvider::new(
            ProviderType::Gemini,
            "dummy".into(),
            Some("http://127.0.0.1:1".into()),
            model.into(),
        );
        let result = provider.complete("system", "prompt", 100).await;
        assert!(
            matches!(result, Err(ProviderError::Incomplete(message)) if message.contains("Unsupported Gemini model"))
        );
    }
}

#[test]
fn depth_routes_standard_to_3_8_flash_and_deep_to_4_argon() {
    assert_eq!(model_for_depth("standard"), "gemini-3.8-flash");
    assert_eq!(model_for_depth("deep"), "gemini-4-argon");
    assert_eq!(model_for_depth(""), "gemini-3.8-flash");
    assert_eq!(gemini_reasoning_effort("gemini-4-argon"), "high");
    assert_eq!(gemini_reasoning_effort("models/gemini-4-argon"), "high");
    assert_eq!(gemini_reasoning_effort("gemini-3.8-flash"), "low");
    assert_eq!(gemini_thinking_level("gemini-4-argon"), "HIGH");
    assert_eq!(gemini_thinking_level("gemini-3.8-flash"), "LOW");
}

#[test]
fn test_clean_json_completion() {
    let with_fences = "```json\n{\n  \"title\": \"Sample PRD\"\n}\n```";
    assert_eq!(
        clean_json_completion(with_fences),
        "{\n  \"title\": \"Sample PRD\"\n}"
    );

    let with_plain_fences = "```\n{\n  \"key\": \"value\"\n}\n```";
    assert_eq!(
        clean_json_completion(with_plain_fences),
        "{\n  \"key\": \"value\"\n}"
    );

    let already_clean = "{\n  \"clean\": true\n}";
    assert_eq!(
        clean_json_completion(already_clean),
        "{\n  \"clean\": true\n}"
    );
}

#[test]
fn test_credential_discovery() {
    std::env::set_var("OPENAI_API_KEY", "test-openai-key-12345");
    let keys = discover_credentials();
    assert_eq!(
        keys.get("OPENAI_API_KEY"),
        Some(&"test-openai-key-12345".to_string())
    );
    std::env::remove_var("OPENAI_API_KEY");
}

#[test]
fn test_provider_initialization() {
    let provider = ModelProvider::new(
        ProviderType::OpenAi,
        "dummy-key".to_string(),
        None,
        "gpt-4o".to_string(),
    );
    assert_eq!(provider.base_url, "https://api.openai.com/v1");
    assert_eq!(provider.model, "gpt-4o");
    assert_eq!(provider.provider_type, ProviderType::OpenAi);
}
