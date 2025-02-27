"""
LLM service factory module.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class LLMServiceFactory:
    """Factory for creating LLM service instances"""
    
    @staticmethod
    def create(provider: str, config: Dict[str, Any]):
        """
        Create an LLM service instance based on the provider.
        
        Args:
            provider (str): The LLM provider ('openai' or 'gemini')
            config (Dict[str, Any]): Configuration for the service
            
        Returns:
            An instance of the appropriate LLM service
        """
        if provider == 'openai':
            logger.info("Using OpenAI service")
            from .openai_service import OpenAIService
            return OpenAIService(config)
        elif provider == 'gemini':
            logger.info("Using Gemini service")
            from .gemini_service import GeminiService
            return GeminiService(config)
        else:
            logger.error(f"Unknown LLM provider: {provider}")
            raise ValueError(f"Unknown LLM provider: {provider}")