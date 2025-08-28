"""
LLM service factory module.

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

Last Updated: 2025-03-24
"""

import logging
import importlib
from typing import Dict, Any

# Use centralized settings instead of importing from backend.config
from backend.infrastructure.config.settings import settings

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
