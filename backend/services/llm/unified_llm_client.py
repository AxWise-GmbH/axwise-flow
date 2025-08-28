"""
Unified LLM Client for V3 Simplified Implementation.

This client addresses the environment variable and stability issues found in the original V3
by using the proven patterns from V1/V2 while providing enhanced capabilities.

Key improvements:
- Uses secure environment system (like V1/V2)
- Single client instance per request (no duplication)
- Proper error handling and retry logic
- Memory efficient (no unbounded collections)
- Compatible with both basic and enhanced models
"""

import logging
import time
import asyncio
import os
from typing import Type, TypeVar, Any, Dict, List, Optional, Union
from dataclasses import dataclass

# Use the secure environment system from V1/V2
from backend.services.external.secure_env import secure_env

# Import proven LLM patterns from V1/V2
from backend.services.llm.base_llm_service import BaseLLMService

# Import Gemini and Instructor for enhanced capabilities
try:
    import google.generativeai as genai
    import instructor
    from pydantic import BaseModel, ValidationError
    ENHANCED_FEATURES_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Enhanced features not available: {e}")
    ENHANCED_FEATURES_AVAILABLE = False

from backend.infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME, GEMINI_TEMPERATURE, GEMINI_MAX_TOKENS,
    GEMINI_TOP_P, GEMINI_TOP_K, ENV_GEMINI_API_KEY
)

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


@dataclass
class RequestMetrics:
    """Lightweight metrics for a single request."""
    
    start_time: float
    end_time: float = 0.0
    success: bool = False
    retry_count: int = 0
    error_type: Optional[str] = None
    
    @property
    def duration_ms(self) -> int:
        """Calculate duration in milliseconds."""
        end = self.end_time if self.end_time > 0 else time.time()
        return int((end - self.start_time) * 1000)


class UnifiedLLMClient:
    """
    Unified LLM client that combines V1/V2 stability with V3 enhanced features.
    
    This client provides:
    - Secure environment variable handling (V1/V2 pattern)
    - Basic LLM operations (V1/V2 compatibility)
    - Enhanced structured outputs (V3 features)
    - Proper error handling and retries
    - Memory efficient operation
    """
    
    def __init__(self, model_name: str = GEMINI_MODEL_NAME, max_retries: int = 2):
        """Initialize the unified LLM client."""
        
        self.model_name = model_name
        self.max_retries = max_retries
        
        # Get API key using secure environment system (V1/V2 pattern)
        self.api_key = secure_env.get(ENV_GEMINI_API_KEY)
        if not self.api_key:
            raise ValueError(f"No API key found in environment variable {ENV_GEMINI_API_KEY}")
        
        # Initialize basic client for V1/V2 compatibility
        self._basic_client = None
        
        # Initialize enhanced client for V3 features (if available)
        self._enhanced_client = None
        self._instructor_client = None
        
        # Request-scoped metrics (bounded)
        self.current_metrics: Optional[RequestMetrics] = None
        
        logger.info(f"Initialized UnifiedLLMClient with model {model_name}")
    
    def _get_basic_client(self):
        """Get or create basic Gemini client for V1/V2 operations."""
        if self._basic_client is None:
            genai.configure(api_key=self.api_key)
            self._basic_client = genai.GenerativeModel(model_name=self.model_name)
        return self._basic_client
    
    def _get_enhanced_client(self):
        """Get or create enhanced client for V3 operations."""
        if not ENHANCED_FEATURES_AVAILABLE:
            raise RuntimeError("Enhanced features not available - missing dependencies")
        
        if self._enhanced_client is None:
            genai.configure(api_key=self.api_key)
            self._enhanced_client = genai.GenerativeModel(model_name=self.model_name)
            
            # Create Instructor client
            self._instructor_client = instructor.from_gemini(
                client=self._enhanced_client,
                mode=instructor.Mode.GEMINI_JSON
            )
        
        return self._enhanced_client
    
    async def generate_text(self, prompt: str, system_instruction: Optional[str] = None, **kwargs) -> str:
        """
        Generate text using basic client (V1/V2 compatibility).
        
        This method provides the same interface as V1/V2 LLM services.
        """
        
        self.current_metrics = RequestMetrics(start_time=time.time())
        
        try:
            client = self._get_basic_client()
            
            # Prepare generation config
            generation_config = {
                "temperature": kwargs.get("temperature", GEMINI_TEMPERATURE),
                "max_output_tokens": kwargs.get("max_tokens", GEMINI_MAX_TOKENS),
                "top_p": kwargs.get("top_p", GEMINI_TOP_P),
                "top_k": kwargs.get("top_k", GEMINI_TOP_K)
            }
            
            # Prepare messages
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            # Generate with retry logic
            last_error = None
            for attempt in range(self.max_retries + 1):
                try:
                    self.current_metrics.retry_count = attempt
                    
                    response = await client.generate_content_async(
                        prompt,
                        generation_config=generation_config
                    )
                    
                    result = response.text
                    
                    # Success
                    self.current_metrics.end_time = time.time()
                    self.current_metrics.success = True
                    
                    logger.debug(f"Text generation completed in {self.current_metrics.duration_ms}ms")
                    return result
                    
                except Exception as e:
                    last_error = e
                    logger.warning(f"Text generation attempt {attempt + 1} failed: {e}")
                    
                    if attempt < self.max_retries:
                        await asyncio.sleep(0.5 * (attempt + 1))  # Progressive delay
            
            # All retries failed
            self.current_metrics.end_time = time.time()
            self.current_metrics.success = False
            self.current_metrics.error_type = type(last_error).__name__
            
            raise last_error
            
        except Exception as e:
            logger.error(f"Text generation failed: {e}")
            raise
    
    async def generate_structured(self, prompt: str, model_class: Type[T], 
                                system_instruction: Optional[str] = None, **kwargs) -> T:
        """
        Generate structured output using enhanced client (V3 features).
        
        This method provides V3 enhanced capabilities with proper error handling.
        """
        
        if not ENHANCED_FEATURES_AVAILABLE:
            raise RuntimeError("Structured generation not available - missing dependencies")
        
        self.current_metrics = RequestMetrics(start_time=time.time())
        
        try:
            # Get enhanced client and instructor
            self._get_enhanced_client()
            
            # Prepare generation config
            generation_config = {
                "temperature": kwargs.get("temperature", 0.0),  # Lower temperature for structured output
                "max_output_tokens": kwargs.get("max_tokens", GEMINI_MAX_TOKENS),
                "top_p": kwargs.get("top_p", 1.0),
                "top_k": kwargs.get("top_k", 1),
                "response_mime_type": "application/json"
            }
            
            # Prepare messages
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            # Generate with retry logic
            last_error = None
            for attempt in range(self.max_retries + 1):
                try:
                    self.current_metrics.retry_count = attempt
                    
                    response = await self._instructor_client.chat.completions.create(
                        messages=messages,
                        response_model=model_class,
                        generation_config=generation_config
                    )
                    
                    # Success
                    self.current_metrics.end_time = time.time()
                    self.current_metrics.success = True
                    
                    logger.debug(f"Structured generation completed in {self.current_metrics.duration_ms}ms")
                    return response
                    
                except Exception as e:
                    last_error = e
                    logger.warning(f"Structured generation attempt {attempt + 1} failed: {e}")
                    
                    if attempt < self.max_retries:
                        await asyncio.sleep(0.5 * (attempt + 1))  # Progressive delay
            
            # All retries failed
            self.current_metrics.end_time = time.time()
            self.current_metrics.success = False
            self.current_metrics.error_type = type(last_error).__name__
            
            raise last_error
            
        except Exception as e:
            logger.error(f"Structured generation failed: {e}")
            raise
    
    def get_metrics(self) -> Optional[Dict[str, Any]]:
        """Get metrics for the current request."""
        if self.current_metrics is None:
            return None
        
        return {
            "duration_ms": self.current_metrics.duration_ms,
            "success": self.current_metrics.success,
            "retry_count": self.current_metrics.retry_count,
            "error_type": self.current_metrics.error_type
        }
    
    def reset_metrics(self):
        """Reset metrics for a new request."""
        self.current_metrics = None


# Factory function for easy integration with existing code
def create_unified_llm_client(model_name: str = GEMINI_MODEL_NAME) -> UnifiedLLMClient:
    """Create a unified LLM client instance."""
    return UnifiedLLMClient(model_name=model_name)
