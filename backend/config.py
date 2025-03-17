"""
Configuration for the backend application.
"""

import os
import logging
from typing import Dict, Any

# Configure logging
logger = logging.getLogger(__name__)

# LLM Configuration
LLM_CONFIG = {
    "openai": {
        "REDACTED_API_KEY": os.getenv("REDACTED_OPENAI_KEY"),
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-2024-08-06"),
        "temperature": 0.0,  # Explicitly set to 0.0, ignoring env variable
        "max_tokens": int(os.getenv("OPENAI_MAX_TOKENS", "16384")),
        "context_window": int(os.getenv("OPENAI_CONTEXT_WINDOW", "128000"))
    },
    "gemini": {
        "REDACTED_API_KEY": os.getenv("REDACTED_GEMINI_KEY"),
        "model": os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        "temperature": 0.0,  # Explicitly set to 0.0, ignoring env variable
        "max_tokens": int(os.getenv("GEMINI_MAX_TOKENS", "8192")),
        "context_window": int(os.getenv("GEMINI_CONTEXT_WINDOW", "32000")),
        "top_p": float(os.getenv("GEMINI_TOP_P", "0.95")),
        "top_k": int(os.getenv("GEMINI_TOP_K", "40"))
    }
}

# LLM Provider Service Configuration
# Maps provider names to their service class implementation paths
LLM_PROVIDERS_CONFIG = {
    "openai": "backend.services.llm.openai_service.OpenAIService",
    "gemini": "backend.services.llm.gemini_service.GeminiService",
    "anthropic": "backend.services.llm.anthropic_service.AnthropicService"
}

def validate_config() -> bool:
    """
    Validate the configuration.
    
    Returns:
        bool: True if the configuration is valid, False otherwise.
        
    Raises:
        ValueError: If any required configuration values are missing or invalid
    """
    try:
        # Check OpenAI configuration
        openai_config = LLM_CONFIG["openai"]
        if not openai_config["REDACTED_API_KEY"]:
            raise ValueError("OpenAI API key is required. Please set REDACTED_OPENAI_KEY environment variable.")
            
        if not openai_config["model"]:
            raise ValueError("OpenAI model name is required. Please set OPENAI_MODEL environment variable.")
            
        # Validate OpenAI numeric parameters
        if not (0 <= openai_config["temperature"] <= 2):
            raise ValueError("OpenAI temperature must be between 0 and 2")
            
        if openai_config["max_tokens"] <= 0:
            raise ValueError("OpenAI max_tokens must be positive")
            
        if openai_config["context_window"] <= 0:
            raise ValueError("OpenAI context_window must be positive")
            
        # Check Gemini configuration
        gemini_config = LLM_CONFIG["gemini"]
        if not gemini_config["REDACTED_API_KEY"]:
            raise ValueError("Gemini API key is required. Please set REDACTED_GEMINI_KEY environment variable.")
            
        if not gemini_config["model"]:
            raise ValueError("Gemini model name is required. Please set GEMINI_MODEL environment variable.")
            
        # Validate Gemini numeric parameters
        if not (0 <= gemini_config["temperature"] <= 1):
            raise ValueError("Gemini temperature must be between 0 and 1")
            
        if gemini_config["max_tokens"] <= 0:
            raise ValueError("Gemini max_tokens must be positive")
            
        if gemini_config["context_window"] <= 0:
            raise ValueError("Gemini context_window must be positive")
            
        if not (0 < gemini_config["top_p"] <= 1):
            raise ValueError("Gemini top_p must be between 0 and 1")
            
        if gemini_config["top_k"] <= 0:
            raise ValueError("Gemini top_k must be positive")
            
        # Log validated configuration (with masked API keys)
        logger.info("Configuration for openai:")
        logger.info(f"  REDACTED_API_KEY: {openai_config['REDACTED_API_KEY'][:6]}...")
        logger.info(f"  model: {openai_config['model']}")
        logger.info(f"  temperature: {openai_config['temperature']}")
        logger.info(f"  max_tokens: {openai_config['max_tokens']}")
        logger.info(f"  context_window: {openai_config['context_window']}")
        
        logger.info("Configuration for gemini:")
        logger.info(f"  REDACTED_API_KEY: {gemini_config['REDACTED_API_KEY'][:6]}...")
        logger.info(f"  model: {gemini_config['model']}")
        logger.info(f"  temperature: {gemini_config['temperature']}")
        logger.info(f"  max_tokens: {gemini_config['max_tokens']}")
        logger.info(f"  context_window: {gemini_config['context_window']}")
        logger.info(f"  top_p: {gemini_config['top_p']}")
        logger.info(f"  top_k: {gemini_config['top_k']}")
        
        logger.info("Configuration validation successful")
        return True
        
    except Exception as e:
        logger.error(f"Configuration validation failed: {str(e)}")
        raise ValueError(f"Configuration validation failed: {str(e)}")