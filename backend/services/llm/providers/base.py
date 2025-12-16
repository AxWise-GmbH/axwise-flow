"""
Base LLM Provider abstraction.

This module defines the abstract base class for all LLM providers,
ensuring a consistent interface across different LLM backends.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Type, TypeVar, Union

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass
class LLMProviderConfig:
    """Configuration for LLM providers."""
    
    api_key: str = ""
    model: str = ""
    temperature: float = 0.7
    max_tokens: int = 8192
    top_p: float = 0.95
    top_k: int = 40
    timeout: float = 120.0
    max_retries: int = 3
    retry_delay: float = 1.0
    extra: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def from_dict(cls, config: Dict[str, Any]) -> "LLMProviderConfig":
        """Create config from dictionary, ignoring unknown keys."""
        known_keys = {
            "api_key", "model", "temperature", "max_tokens",
            "top_p", "top_k", "timeout", "max_retries", "retry_delay"
        }
        known_params = {k: v for k, v in config.items() if k in known_keys}
        extra_params = {k: v for k, v in config.items() if k not in known_keys}
        return cls(**known_params, extra=extra_params)


class BaseLLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    All LLM providers must implement these methods to ensure
    consistent behavior across different backends.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the provider with configuration.
        
        Args:
            config: Configuration dictionary for the provider
        """
        self.config = LLMProviderConfig.from_dict(config)
        self._client = None
        logger.info(f"Initialized {self.__class__.__name__} with model: {self.config.model}")
    
    @property
    def model_name(self) -> str:
        """Return the model name."""
        return self.config.model
    
    @abstractmethod
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
        pass
    
    @abstractmethod
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
        pass
    
    @abstractmethod
    async def analyze(
        self,
        text_or_payload: Union[str, Dict[str, Any]],
        task: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform analysis using the LLM.

        This method provides backward compatibility with the existing
        service interface that uses task-based analysis.

        Handles both calling conventions:
        1. analyze({"task": ..., "text": ...}) - dict payload style
        2. analyze(text, task, data) - separate args style

        Args:
            text_or_payload: Either a dict payload containing task/text or a text string
            task: The analysis task type (optional if using dict payload)
            data: Data for analysis including text and parameters (optional)

        Returns:
            Analysis results as a dictionary
        """
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the model.
        
        Returns:
            Dictionary with model information
        """
        return {
            "provider": self.__class__.__name__,
            "model": self.config.model,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }
    
    @abstractmethod
    def _get_client(self) -> Any:
        """
        Get or create the underlying client.
        
        Returns:
            The provider-specific client instance
        """
        pass

