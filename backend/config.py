"""
Configuration for the backend application.

This module imports and re-exports the centralized settings from 
infrastructure/config/settings.py for backward compatibility.

Last Updated: 2025-03-24
"""

import os
import sys
import logging
from typing import Dict, Any

# Add project root to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from infrastructure.config.settings import Settings

# Get singleton instance of settings
settings = Settings()

# Configure logging
logger = logging.getLogger(__name__)

# Re-export LLM configuration for backward compatibility
LLM_CONFIG = {
    "openai": settings.llm_providers["openai"],
    "gemini": settings.llm_providers["gemini"]
}

# Re-export LLM provider service class mappings for backward compatibility
LLM_PROVIDERS_CONFIG = settings.llm_provider_classes

def validate_config(provider: str = None) -> bool:
    """
    Validate the configuration.
    
    Args:
        provider: Optional provider name to validate only that provider's config.
                 If None, validates all configurations.
    
    Returns:
        bool: True if the configuration is valid, False otherwise.
        
    Raises:
        ValueError: If any required configuration values are missing or invalid
    """
    # Delegate to centralized settings implementation
    return settings.validate_llm_config(provider)