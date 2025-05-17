"""
Configuration management for Google GenAI SDK.

This module provides a centralized configuration system for the Google GenAI SDK,
with task-specific profiles and validation.
"""

import logging
from enum import Enum
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field, validator

from google.genai import types
from google.genai.types import GenerateContentConfig, SafetySetting, HarmCategory, HarmBlockThreshold

from infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME, GEMINI_TEMPERATURE, GEMINI_MAX_TOKENS,
    GEMINI_TOP_P, GEMINI_TOP_K, ENV_GEMINI_API_KEY,
    GEMINI_SAFETY_SETTINGS_BLOCK_NONE
)

logger = logging.getLogger(__name__)

class TaskType(str, Enum):
    """Enum for different LLM task types."""
    TRANSCRIPT_STRUCTURING = "transcript_structuring"
    THEME_ANALYSIS = "theme_analysis"
    THEME_ANALYSIS_ENHANCED = "theme_analysis_enhanced"
    PATTERN_RECOGNITION = "pattern_recognition"
    SENTIMENT_ANALYSIS = "sentiment_analysis"
    INSIGHT_GENERATION = "insight_generation"
    PERSONA_FORMATION = "persona_formation"
    TEXT_GENERATION = "text_generation"
    PATTERN_ENHANCEMENT = "pattern_enhancement"
    EVIDENCE_LINKING = "evidence_linking"
    TRAIT_FORMATTING = "trait_formatting"
    UNKNOWN = "unknown_task"

class ResponseFormat(str, Enum):
    """Enum for response format types."""
    JSON = "application/json"
    TEXT = "text/plain"

class GenAIConfigModel(BaseModel):
    """Pydantic model for GenAI configuration validation."""
    model: str = Field(default=GEMINI_MODEL_NAME)
    temperature: float = Field(default=GEMINI_TEMPERATURE, ge=0.0, le=1.0)
    max_output_tokens: int = Field(default=GEMINI_MAX_TOKENS, gt=0)
    top_p: float = Field(default=GEMINI_TOP_P, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(default=GEMINI_TOP_K, ge=1)
    response_mime_type: Optional[str] = None
    safety_settings: Optional[List[Dict[str, Any]]] = None

    @validator('safety_settings', pre=True)
    def validate_safety_settings(cls, v):
        """Validate safety settings format."""
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("safety_settings must be a list")
        return v

class GenAIConfigFactory:
    """Factory for creating GenAI configurations based on task type."""

    @staticmethod
    def create_config(task: Union[str, TaskType], custom_params: Optional[Dict[str, Any]] = None) -> GenerateContentConfig:
        """
        Create a GenerateContentConfig for the specified task.

        Args:
            task: Task type (string or TaskType enum)
            custom_params: Optional custom parameters to override defaults

        Returns:
            GenerateContentConfig object
        """
        # Convert string task to enum if needed
        if isinstance(task, str):
            try:
                task = TaskType(task)
            except ValueError:
                logger.warning(f"Unknown task type: {task}, using default configuration")
                task = TaskType.UNKNOWN

        # Start with base configuration
        config_params = {
            "model": GEMINI_MODEL_NAME,
            "temperature": GEMINI_TEMPERATURE,
            "max_output_tokens": GEMINI_MAX_TOKENS,
            "top_p": GEMINI_TOP_P,
            "top_k": GEMINI_TOP_K,
        }

        # Apply task-specific configuration
        config_params = GenAIConfigFactory._apply_task_specific_config(task, config_params)

        # Override with custom parameters if provided
        if custom_params:
            config_params.update(custom_params)

        # Validate configuration
        validated_config = GenAIConfigModel(**config_params)

        # Create safety settings
        safety_settings = GenAIConfigFactory._create_safety_settings()

        # Create and return the GenerateContentConfig
        return GenAIConfigFactory._create_generate_content_config(validated_config, safety_settings)

    @staticmethod
    def _apply_task_specific_config(task: TaskType, config_params: Dict[str, Any]) -> Dict[str, Any]:
        """Apply task-specific configuration parameters."""
        # JSON tasks should use application/json response_mime_type and temperature=0.0
        json_tasks = [
            TaskType.TRANSCRIPT_STRUCTURING,
            TaskType.THEME_ANALYSIS,
            TaskType.THEME_ANALYSIS_ENHANCED,
            TaskType.PATTERN_RECOGNITION,
            TaskType.INSIGHT_GENERATION,
            TaskType.PERSONA_FORMATION,
            TaskType.PATTERN_ENHANCEMENT,
        ]

        if task in json_tasks:
            config_params["response_mime_type"] = ResponseFormat.JSON.value
            config_params["temperature"] = 0.0
            logger.info(f"Using JSON response format for task: {task}")

        # Task-specific token limits and other parameters
        if task in [TaskType.TRANSCRIPT_STRUCTURING, TaskType.THEME_ANALYSIS, TaskType.THEME_ANALYSIS_ENHANCED]:
            config_params["max_output_tokens"] = 131072  # Doubled from 65536 for large responses
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(f"Using enhanced config for {task}: max_tokens=131072, top_k=1, top_p=0.95")
        elif task in [TaskType.PERSONA_FORMATION, TaskType.PATTERN_RECOGNITION]:
            config_params["max_output_tokens"] = 65536
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(f"Using specific config for {task}: max_tokens=65536, top_k=1, top_p=0.95")
        elif task == TaskType.TEXT_GENERATION:
            # For text generation, explicitly DO NOT use response_mime_type
            if "response_mime_type" in config_params:
                del config_params["response_mime_type"]

        return config_params

    @staticmethod
    def _create_safety_settings() -> List[SafetySetting]:
        """Create safety settings for the GenerateContentConfig."""
        # Create safety settings that block nothing (as per GEMINI_SAFETY_SETTINGS_BLOCK_NONE)
        safety_settings = [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE
            )
        ]
        return safety_settings

    @staticmethod
    def _create_generate_content_config(
        config: GenAIConfigModel,
        safety_settings: List[SafetySetting]
    ) -> GenerateContentConfig:
        """Create a GenerateContentConfig from validated parameters."""
        config_dict = config.dict(exclude_none=True)
        
        # Create the GenerateContentConfig with safety settings
        return types.GenerateContentConfig(
            temperature=config_dict.get("temperature", 0.0),
            max_output_tokens=config_dict.get("max_output_tokens", 65536),
            top_k=config_dict.get("top_k", 1),
            top_p=config_dict.get("top_p", 0.95),
            response_mime_type=config_dict.get("response_mime_type"),
            safety_settings=safety_settings
        )
