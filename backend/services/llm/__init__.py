"""
LLM service factory module.
"""

import logging
import importlib
from typing import Dict, Any

from backend.config import LLM_PROVIDERS_CONFIG

logger = logging.getLogger(__name__)

class LLMServiceFactory:
    """Factory for creating LLM service instances using a configuration-driven approach"""
    
    @staticmethod
    def create(provider: str, config: Dict[str, Any]):
        """
        Create an LLM service instance based on the provider using configuration.
        
        Args:
            provider (str): The LLM provider name (e.g., 'openai', 'gemini')
            config (Dict[str, Any]): Configuration for the service
            
        Returns:
            An instance of the appropriate LLM service
            
        Raises:
            ValueError: If provider is unknown or service class cannot be loaded
        """
        provider_lower = provider.lower()
        provider_class_path = LLM_PROVIDERS_CONFIG.get(provider_lower)
        
        if not provider_class_path:
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
            logger.error(f"Error loading LLM service class for provider '{provider}': {e}")
            raise ValueError(f"Error loading LLM service class for provider '{provider}': {e}")