"""
OpenAI LLM Provider implementation.

This module provides the OpenAI provider that wraps the existing
OpenAIService for backward compatibility while exposing the unified
provider interface.
"""

import logging
import os
from typing import Any, Dict, Optional, Type, TypeVar, Union

from pydantic import BaseModel

from .base import BaseLLMProvider
from backend.infrastructure.constants.llm_constants import (
    OPENAI_MODEL_NAME,
    OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS,
    ENV_OPENAI_API_KEY,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI LLM provider implementation.
    
    This provider wraps the existing OpenAIService to provide
    backward compatibility while exposing the unified interface.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the OpenAI provider.
        
        Args:
            config: Configuration dictionary
        """
        # Set defaults before calling parent
        config.setdefault("model", OPENAI_MODEL_NAME)
        config.setdefault("temperature", OPENAI_TEMPERATURE)
        config.setdefault("max_tokens", OPENAI_MAX_TOKENS)
        
        # Get API key from config or environment
        if not config.get("api_key"):
            config["api_key"] = os.getenv(ENV_OPENAI_API_KEY, "")
        
        super().__init__(config)
        
        # Lazy-loaded legacy service for backward compatibility
        self._legacy_service = None
    
    def _get_client(self) -> Any:
        """Get or create the OpenAI client."""
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self.config.api_key)
                logger.info("Initialized OpenAI client")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI client: {e}")
                raise
        return self._client
    
    def _get_legacy_service(self):
        """Get or create the legacy OpenAIService for backward compat."""
        if self._legacy_service is None:
            from backend.services.llm.openai_service import OpenAIService
            legacy_config = {
                "model": self.config.model,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                "api_key": self.config.api_key,
            }
            self._legacy_service = OpenAIService(legacy_config)
        return self._legacy_service
    
    async def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> str:
        """Generate text using OpenAI."""
        client = self._get_client()
        
        try:
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            response = await client.chat.completions.create(
                model=kwargs.get("model", self.config.model),
                messages=messages,
                temperature=kwargs.get("temperature", self.config.temperature),
                max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            )
            
            return response.choices[0].message.content or ""
            
        except Exception as e:
            logger.error(f"Error generating text with OpenAI: {e}")
            raise
    
    async def generate_structured(
        self,
        prompt: str,
        response_model: Type[T],
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> T:
        """Generate structured response using Pydantic model with OpenAI."""
        client = self._get_client()
        
        try:
            import instructor
            
            # Patch client with instructor
            instructor_client = instructor.from_openai(client)
            
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            result = await instructor_client.chat.completions.create(
                model=kwargs.get("model", self.config.model),
                messages=messages,
                response_model=response_model,
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error generating structured response with OpenAI: {e}")
            raise
    
    async def analyze(
        self,
        text_or_payload: Union[str, Dict[str, Any]],
        task: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform analysis using legacy service for full compatibility.

        Handles both calling conventions:
        1. analyze({"task": ..., "text": ...}) - dict payload style
        2. analyze(text, task, data) - separate args style

        Args:
            text_or_payload: Either a dict payload or text string
            task: Task name (optional if using dict payload)
            data: Additional data dict (optional)

        Returns:
            Analysis results as a dictionary
        """
        service = self._get_legacy_service()

        # Handle dict payload style
        if isinstance(text_or_payload, dict):
            payload = text_or_payload
            # Merge task if provided separately
            if task and "task" not in payload:
                payload["task"] = task
            # Merge additional data
            if data:
                payload = {**data, **payload}
            return await service.analyze(data=payload)
        else:
            # Handle separate args style
            analysis_data = data or {}
            if task:
                analysis_data["task"] = task
            analysis_data["text"] = text_or_payload
            return await service.analyze(data=analysis_data)

