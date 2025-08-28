"""Unified LLM service interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel


class LLMError(Exception):
    """Base exception for LLM errors"""
    pass


class RateLimitError(LLMError):
    """Rate limit exceeded error"""
    pass


class TokenLimitError(LLMError):
    """Token limit exceeded error"""
    pass


class APIError(LLMError):
    """API error"""
    pass


class ILLMService(ABC):
    """Interface for LLM services"""
    
    @abstractmethod
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Generate text from prompt"""
        pass
    
    @abstractmethod
    async def generate_structured(self, prompt: str, response_model: BaseModel, **kwargs) -> BaseModel:
        """Generate structured response using Pydantic model"""
        pass
    
    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the model"""
        pass
