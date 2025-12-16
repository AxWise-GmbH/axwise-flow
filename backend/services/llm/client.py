"""
Unified LLM Client.

This module provides a unified client interface for all LLM operations,
delegating to the appropriate provider based on configuration.

Usage:
    from backend.services.llm.client import UnifiedClient
    
    client = UnifiedClient.from_config()
    response = await client.generate_text("Hello!")
    
Feature Flag:
    USE_UNIFIED_LLM_CLIENT=true enables this client.
"""

import logging
import os
from typing import Any, Dict, Optional, Type, TypeVar

from pydantic import BaseModel

from .providers import BaseLLMProvider, get_provider
from .retry import RetryConfig, with_retry, get_conservative_retry_config

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def is_unified_client_enabled() -> bool:
    """Check if the unified LLM client is enabled via feature flag."""
    return os.getenv("USE_UNIFIED_LLM_CLIENT", "false").lower() in ("true", "1", "yes")


class UnifiedClient:
    """
    Unified LLM client that provides a consistent interface across providers.
    
    This client:
    - Delegates to the appropriate provider based on configuration
    - Provides consistent error handling and retry logic
    - Maintains backward compatibility with existing services
    """
    
    def __init__(
        self,
        provider: BaseLLMProvider,
        retry_config: Optional[RetryConfig] = None
    ):
        """
        Initialize the unified client.
        
        Args:
            provider: The LLM provider to use
            retry_config: Optional retry configuration
        """
        self.provider = provider
        self.retry_config = retry_config or get_conservative_retry_config()
        logger.info(f"Initialized UnifiedClient with provider: {provider.__class__.__name__}")
    
    @classmethod
    def from_config(
        cls,
        provider_name: str = "gemini",
        config: Optional[Dict[str, Any]] = None
    ) -> "UnifiedClient":
        """
        Create a UnifiedClient from configuration.
        
        Args:
            provider_name: Name of the provider ("gemini", "openai")
            config: Optional provider configuration
            
        Returns:
            Configured UnifiedClient instance
        """
        # Load config from settings if not provided
        if config is None:
            from backend.infrastructure.config.settings import settings
            config = settings.get_llm_config(provider_name)
        
        provider = get_provider(provider_name, config)
        return cls(provider)
    
    @classmethod
    def get_default(cls) -> "UnifiedClient":
        """Get the default client using environment configuration."""
        default_provider = os.getenv("LLM_PROVIDER", "gemini")
        return cls.from_config(default_provider)
    
    async def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Generate text from a prompt.
        
        Args:
            prompt: The user prompt
            system_instruction: Optional system instruction
            **kwargs: Additional generation parameters
            
        Returns:
            Generated text response
        """
        return await self.provider.generate_text(
            prompt=prompt,
            system_instruction=system_instruction,
            **kwargs
        )
    
    async def generate_structured(
        self,
        prompt: str,
        response_model: Type[T],
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> T:
        """
        Generate a structured response using a Pydantic model.
        
        Args:
            prompt: The user prompt
            response_model: Pydantic model class for response validation
            system_instruction: Optional system instruction
            **kwargs: Additional generation parameters
            
        Returns:
            Instance of response_model with generated data
        """
        return await self.provider.generate_structured(
            prompt=prompt,
            response_model=response_model,
            system_instruction=system_instruction,
            **kwargs
        )
    
    async def analyze(
        self,
        task: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Perform analysis using the LLM.
        
        This method provides backward compatibility with the existing
        service interface that uses task-based analysis.
        
        Args:
            task: The analysis task type
            data: Data for analysis including text and parameters
            
        Returns:
            Analysis results as a dictionary
        """
        return await self.provider.analyze(task=task, data=data)
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model."""
        return self.provider.get_model_info()

