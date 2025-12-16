"""
Gemini LLM Provider implementation.

This module provides the Gemini provider that wraps the existing
GeminiService for backward compatibility while exposing the unified
provider interface.
"""

import logging
import os
from typing import Any, Dict, Optional, Type, TypeVar, Union

from pydantic import BaseModel

from .base import BaseLLMProvider
from backend.infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    GEMINI_TOP_P,
    GEMINI_TOP_K,
    ENV_GEMINI_API_KEY,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class GeminiProvider(BaseLLMProvider):
    """
    Gemini LLM provider implementation.
    
    This provider wraps the existing GeminiService to provide
    backward compatibility while exposing the unified interface.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Gemini provider.
        
        Args:
            config: Configuration dictionary
        """
        # Set defaults before calling parent
        config.setdefault("model", GEMINI_MODEL_NAME)
        config.setdefault("temperature", GEMINI_TEMPERATURE)
        config.setdefault("max_tokens", GEMINI_MAX_TOKENS)
        config.setdefault("top_p", GEMINI_TOP_P)
        config.setdefault("top_k", GEMINI_TOP_K)
        
        # Get API key from config or environment
        if not config.get("api_key"):
            config["api_key"] = os.getenv(ENV_GEMINI_API_KEY, "")
        
        super().__init__(config)
        
        # Lazy-loaded legacy service for backward compatibility
        self._legacy_service = None
    
    def _get_client(self) -> Any:
        """Get or create the Gemini client."""
        if self._client is None:
            try:
                import google.genai as genai
                self._client = genai.Client(api_key=self.config.api_key)
                logger.info("Initialized Gemini client")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
                raise
        return self._client
    
    def _get_legacy_service(self):
        """Get or create the legacy GeminiService for backward compat."""
        if self._legacy_service is None:
            from backend.services.llm.gemini_service import GeminiService
            legacy_config = {
                "model": self.config.model,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                "top_p": self.config.top_p,
                "api_key": self.config.api_key,
            }
            self._legacy_service = GeminiService(legacy_config)
        return self._legacy_service
    
    async def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> str:
        """Generate text using Gemini."""
        client = self._get_client()
        
        try:
            from google.genai.types import GenerateContentConfig
            
            config = GenerateContentConfig(
                temperature=kwargs.get("temperature", self.config.temperature),
                max_output_tokens=kwargs.get("max_tokens", self.config.max_tokens),
                top_p=kwargs.get("top_p", self.config.top_p),
            )
            
            # Build content with optional system instruction
            contents = []
            if system_instruction:
                contents.append({"role": "user", "parts": [{"text": system_instruction}]})
                contents.append({"role": "model", "parts": [{"text": "Understood."}]})
            contents.append({"role": "user", "parts": [{"text": prompt}]})
            
            response = await client.aio.models.generate_content(
                model=self.config.model,
                contents=contents,
                config=config,
            )
            
            return response.text or ""
            
        except Exception as e:
            logger.error(f"Error generating text with Gemini: {e}")
            raise
    
    async def generate_structured(
        self,
        prompt: str,
        response_model: Type[T],
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> T:
        """Generate structured response using Pydantic model."""
        # Use legacy service's instructor client for structured generation
        service = self._get_legacy_service()
        
        try:
            instructor_client = service.instructor_client()
            result = await instructor_client.generate(
                prompt=prompt,
                response_model=response_model,
                system_instruction=system_instruction,
                **kwargs
            )
            return result
        except Exception as e:
            logger.error(f"Error generating structured response: {e}")
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
        3. analyze(task=..., data=...) - keyword args style (legacy)

        Args:
            text_or_payload: Either a dict payload or text string
            task: Task name (optional if using dict payload)
            data: Additional data dict (optional)

        Returns:
            Analysis results as a dictionary
        """
        service = self._get_legacy_service()

        # Delegate to the legacy service which handles both calling patterns
        return await service.analyze(text_or_payload, task=task, data=data)

