"""
LLM Provider implementations.

This module provides a unified provider abstraction for different LLM backends.
Use the UnifiedLLMProvider to get a consistent interface regardless of the underlying
LLM service (Gemini, OpenAI, etc.).

Usage:
    from backend.services.llm.providers import (
        BaseLLMProvider,
        GeminiProvider,
        OpenAIProvider,
        get_provider,
    )
    
    # Get provider by name
    provider = get_provider("gemini", config)
    
    # Use provider
    response = await provider.generate_text("Hello, world!")

Feature Flag:
    Set USE_UNIFIED_LLM_PROVIDERS=true to enable the unified provider system.
    When disabled, falls back to legacy service implementations.
"""

from .base import BaseLLMProvider, LLMProviderConfig
from .gemini import GeminiProvider
from .openai import OpenAIProvider


def get_provider(provider_name: str, config: dict = None) -> BaseLLMProvider:
    """
    Factory function to get an LLM provider by name.
    
    Args:
        provider_name: Name of the provider ("gemini", "openai")
        config: Optional configuration dictionary
        
    Returns:
        An instance of the appropriate provider
        
    Raises:
        ValueError: If provider_name is not recognized
    """
    provider_name_lower = provider_name.lower()
    
    if provider_name_lower == "gemini":
        return GeminiProvider(config or {})
    elif provider_name_lower == "openai":
        return OpenAIProvider(config or {})
    else:
        raise ValueError(f"Unknown LLM provider: {provider_name}")


__all__ = [
    "BaseLLMProvider",
    "LLMProviderConfig",
    "GeminiProvider",
    "OpenAIProvider",
    "get_provider",
]

