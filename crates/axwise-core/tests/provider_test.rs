use axwise_core::provider::*;

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
