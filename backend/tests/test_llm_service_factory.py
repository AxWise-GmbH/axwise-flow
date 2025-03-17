"""
Tests for the LLMServiceFactory.
"""

import pytest
from unittest.mock import patch
import importlib

from backend.services.llm import LLMServiceFactory
from backend.config import LLM_PROVIDERS_CONFIG

# Import the service classes to verify they can be instantiated
from backend.services.llm.openai_service import OpenAIService
from backend.services.llm.gemini_service import GeminiService
# We'll use conditional import for the Anthropic service since it's just an example

@pytest.fixture
def minimal_config():
    """Fixture for a minimal LLM service configuration."""
    return {
        "REDACTED_API_KEY": "dummy_key",
        "model": "dummy_model",
        "temperature": 0.7,
        "max_tokens": 100
    }

def test_create_openai_service(minimal_config):
    """Test that the factory can create an OpenAI service."""
    service = LLMServiceFactory.create("openai", minimal_config)
    assert isinstance(service, OpenAIService)
    assert service.REDACTED_API_KEY == "dummy_key"
    assert service.model == "dummy_model"

def test_create_gemini_service(minimal_config):
    """Test that the factory can create a Gemini service."""
    service = LLMServiceFactory.create("gemini", minimal_config)
    assert isinstance(service, GeminiService)
    assert service.REDACTED_API_KEY == "dummy_key"
    assert service.model == "dummy_model"

def test_create_anthropic_service(minimal_config):
    """Test that the factory can create an Anthropic service."""
    # Check if the Anthropic service module exists
    try:
        importlib.import_module("backend.services.llm.anthropic_service")
        anthropic_available = True
    except ImportError:
        anthropic_available = False
    
    if anthropic_available:
        from backend.services.llm.anthropic_service import AnthropicService
        service = LLMServiceFactory.create("anthropic", minimal_config)
        assert isinstance(service, AnthropicService)
        assert service.REDACTED_API_KEY == "dummy_key"
        assert service.model == "claude-3-opus"  # Default in our example
    else:
        # Skip this test if the Anthropic service is not available
        pytest.skip("Anthropic service module not available")

def test_case_insensitive_provider_name(minimal_config):
    """Test that provider names are case-insensitive."""
    service1 = LLMServiceFactory.create("OpenAI", minimal_config)
    service2 = LLMServiceFactory.create("openai", minimal_config)
    
    assert isinstance(service1, OpenAIService)
    assert isinstance(service2, OpenAIService)

def test_unknown_provider(minimal_config):
    """Test that the factory raises an error for unknown providers."""
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        LLMServiceFactory.create("unknown_provider", minimal_config)

def test_import_error_handling():
    """Test that the factory handles import errors gracefully."""
    # Mock LLM_PROVIDERS_CONFIG to include a nonexistent module
    mock_config = {
        "nonexistent": "backend.services.llm.nonexistent_service.NonexistentService"
    }
    
    with patch("backend.services.llm.LLM_PROVIDERS_CONFIG", mock_config):
        with pytest.raises(ValueError, match="Error loading LLM service class"):
            LLMServiceFactory.create("nonexistent", {}) 