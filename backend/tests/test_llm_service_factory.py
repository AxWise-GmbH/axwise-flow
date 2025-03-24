"""
Tests for the LLMServiceFactory.
"""

import pytest
import importlib
from typing import Dict, Any
from unittest.mock import patch

from backend.services.llm import LLMServiceFactory
from backend.config import LLM_PROVIDERS_CONFIG

# Import the service classes to verify they can be instantiated
from backend.services.llm.openai_service import OpenAIService
from backend.services.llm.gemini_service import GeminiService
# We'll use conditional import for the Anthropic service since it's just an example

@pytest.fixture
def minimal_config() -> Dict[str, Any]:
    """Return a minimal configuration for testing."""
    return {
        "REDACTED_API_KEY": "test-REDACTED_API_KEY",
        "model": "test-model",
        "temperature": 0.5,
        "max_tokens": 100
    }

def test_create_openai_service(minimal_config):
    """Test that the factory can create an OpenAI service."""
    service = LLMServiceFactory.create("openai", minimal_config)
    assert isinstance(service, OpenAIService)
    assert service.REDACTED_API_KEY == "test-REDACTED_API_KEY"
    assert service.model == "test-model"
    assert service.temperature == 0.5
    assert service.max_tokens == 100

def test_create_gemini_service(minimal_config):
    """Test that the factory can create a Gemini service."""
    service = LLMServiceFactory.create("gemini", minimal_config)
    assert isinstance(service, GeminiService)
    assert service.REDACTED_API_KEY == "test-REDACTED_API_KEY"
    assert service.model == "test-model"
    assert service.temperature == 0.5
    assert service.max_tokens == 100

def test_case_insensitive_provider_name(minimal_config):
    """Test that provider names are case-insensitive."""
    # Test with uppercase
    service_upper = LLMServiceFactory.create("OPENAI", minimal_config)
    assert isinstance(service_upper, OpenAIService)
    
    # Test with mixed case
    service_mixed = LLMServiceFactory.create("OpEnAi", minimal_config)
    assert isinstance(service_mixed, OpenAIService)

def test_unknown_provider(minimal_config):
    """Test that the factory raises an error for unknown providers."""
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        LLMServiceFactory.create("unknown", minimal_config)

def test_import_error_handling():
    """Test handling of import errors for service classes."""
    # Mock a provider that points to a non-existent module
    with patch("infrastructure.config.settings.Settings.get_llm_provider_class") as mock_get_class:
        mock_get_class.return_value = "nonexistent.module.NonexistentClass"
        with pytest.raises(ValueError, match="Error loading LLM service class"):
            LLMServiceFactory.create("nonexistent")

def test_create_service_with_default_config():
    """Test creating a service with the default config from settings."""
    # This test assumes that the settings module is properly configured
    service = LLMServiceFactory.create("openai")
    assert isinstance(service, OpenAIService)
    # We don't assert specifics here because they come from settings 