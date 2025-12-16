"""
LLM service factory module.

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

This module provides:
- LLMServiceFactory: Legacy factory for creating LLM service instances
- UnifiedClient: New unified client with provider abstraction (USE_UNIFIED_LLM_CLIENT=true)
- Provider exports for direct provider access

Last Updated: 2025-03-24
"""

import logging
import importlib
from typing import Dict, Any

# Use centralized settings instead of importing from backend.config
from backend.infrastructure.config.settings import settings

# Import new unified components for backward compat exports
from .client import UnifiedClient, is_unified_client_enabled
from .retry import RetryConfig, with_retry, get_conservative_retry_config
from .providers import BaseLLMProvider, GeminiProvider, OpenAIProvider, get_provider

logger = logging.getLogger(__name__)


class LLMServiceFactory:
    """Factory for creating LLM service instances using a configuration-driven approach"""

    @staticmethod
    def create(provider: str, config: Dict[str, Any] = None):
        """
        Create an LLM service instance based on the provider using configuration.

        Args:
            provider (str): The LLM provider name (e.g., 'openai', 'gemini')
            config (Dict[str, Any], optional): Configuration for the service.
                If not provided, loads from centralized settings.

        Returns:
            An instance of the appropriate LLM service

        Raises:
            ValueError: If provider is unknown or service class cannot be loaded
        """
        provider_lower = provider.lower()

        # If no config provided, get from centralized settings
        if config is None:
            config = settings.get_llm_config(provider_lower)

        # Get provider class path from centralized settings
        try:
            provider_class_path = settings.get_llm_provider_class(provider_lower)
        except ValueError as e:
            logger.error(f"Unknown LLM provider: {provider}")
            raise ValueError(f"Unknown LLM provider: {provider}")

        try:
            # Dynamically import and instantiate the service class
            module_name, class_name = provider_class_path.rsplit(".", 1)
            module = importlib.import_module(module_name)
            service_class = getattr(module, class_name)

            logger.info(f"Using {class_name} for provider '{provider}'")
            return service_class(config)

        except (ImportError, AttributeError) as e:
            logger.error(
                f"Error loading LLM service class for provider '{provider}': {e}"
            )
            raise ValueError(
                f"Error loading LLM service class for provider '{provider}': {e}"
            )

    @staticmethod
    def create_unified(provider: str = "gemini", config: Dict[str, Any] = None) -> UnifiedClient:
        """
        Create a unified client instance using the new provider abstraction.

        This method uses the new UnifiedClient with provider abstraction
        for cleaner code and better separation of concerns.

        Args:
            provider: The LLM provider name (e.g., 'openai', 'gemini')
            config: Optional configuration for the provider

        Returns:
            UnifiedClient instance
        """
        return UnifiedClient.from_config(provider, config)


def get_llm_client(provider: str = "gemini", config: Dict[str, Any] = None):
    """
    Get an LLM client, using unified client if enabled, otherwise legacy service.

    This is the recommended entry point for getting an LLM client.
    It respects the USE_UNIFIED_LLM_CLIENT feature flag.

    Args:
        provider: The LLM provider name
        config: Optional configuration

    Returns:
        Either UnifiedClient or legacy service instance
    """
    if is_unified_client_enabled():
        logger.info("Using UnifiedClient (USE_UNIFIED_LLM_CLIENT=true)")
        return UnifiedClient.from_config(provider, config)
    else:
        logger.info("Using legacy LLMServiceFactory")
        return LLMServiceFactory.create(provider, config)


# Backward compatibility exports
__all__ = [
    # Legacy factory
    "LLMServiceFactory",
    # New unified components
    "UnifiedClient",
    "is_unified_client_enabled",
    "get_llm_client",
    # Providers
    "BaseLLMProvider",
    "GeminiProvider",
    "OpenAIProvider",
    "get_provider",
    # Retry utilities
    "RetryConfig",
    "with_retry",
    "get_conservative_retry_config",
]
