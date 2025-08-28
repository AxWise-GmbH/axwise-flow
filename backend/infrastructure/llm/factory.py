"""LLM service factory"""

import logging
from typing import Optional
from backend.domain.interfaces.llm_unified import ILLMService
from backend.services.llm import LLMServiceFactory
from backend.infrastructure.data.config import SystemConfig
from backend.infrastructure.config.settings import settings

logger = logging.getLogger(__name__)

_llm_service: Optional[ILLMService] = None


def get_llm_service(config: Optional[SystemConfig] = None) -> Optional[ILLMService]:
    """Get or create LLM service instance"""
    global _llm_service

    if _llm_service is None and config is not None:
        try:
            # Use the default provider from settings (enhanced_gemini)
            provider = settings.default_llm_provider

            # Create service configuration
            service_config = {
                "api_key": config.llm.api_key,
                "model": config.llm.model,
                "temperature": config.llm.temperature,
                "max_tokens": config.llm.max_tokens,
            }

            # Use the LLMServiceFactory to create the appropriate service
            _llm_service = LLMServiceFactory.create(provider, service_config)
            logger.info(f"LLM service initialized using provider: {provider}")
        except Exception as e:
            logger.error(f"Failed to initialize LLM service: {str(e)}")
            return None

    return _llm_service


def reset_llm_service():
    """Reset LLM service instance"""
    global _llm_service
    _llm_service = None
    logger.info("LLM service reset")
