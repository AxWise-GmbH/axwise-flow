"""
Configuration management for Google GenAI SDK.

This module provides a centralized configuration system for the Google GenAI SDK,
with task-specific profiles, schema definitions, and validation.
"""

import logging
from enum import Enum
from typing import Dict, Any, List, Optional, Union, Literal
from pydantic import BaseModel, Field, field_validator

from google.genai import types
from google.genai.types import (
    GenerateContentConfig,
    SafetySetting,
    HarmCategory,
    HarmBlockThreshold,
    Schema,
)

from backend.infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    GEMINI_TOP_P,
    GEMINI_TOP_K,
    ENV_GEMINI_API_KEY,
    GEMINI_SAFETY_SETTINGS_BLOCK_NONE,
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
    INDUSTRY_DETECTION = "industry_detection"
    PRD_GENERATION = "prd_generation"
    UNKNOWN = "unknown_task"


class ResponseFormat(str, Enum):
    """Enum for response format types."""

    JSON = "application/json"
    TEXT = "text/plain"


# Response schema models for different task types
class PatternModel(BaseModel):
    """Schema for a pattern in pattern recognition."""

    name: str
    category: str = Field(
        ...,
        description="One of: Workflow, Coping Strategy, Decision Process, Workaround, Habit, Collaboration, Communication",
    )
    description: str
    evidence: List[str]
    frequency: float = Field(..., ge=0.0, le=1.0)
    sentiment: float = Field(..., ge=-1.0, le=1.0)
    impact: str = Field(default="")
    suggested_actions: List[str] = Field(default_factory=list)


class PatternResponse(BaseModel):
    """Schema for pattern recognition response."""

    patterns: List[PatternModel]


class ThemeModel(BaseModel):
    """Schema for a theme in theme analysis."""

    name: str
    definition: str
    keywords: List[str]
    evidence: List[str]
    sentiment: float = Field(..., ge=-1.0, le=1.0)
    frequency: float = Field(..., ge=0.0, le=1.0)


class ThemeResponse(BaseModel):
    """Schema for theme analysis response."""

    themes: List[ThemeModel]


class InsightModel(BaseModel):
    """Schema for an insight in insight generation."""

    topic: str
    observation: str
    evidence: List[str]
    implication: str
    recommendation: str
    priority: Literal["High", "Medium", "Low"]


class InsightResponse(BaseModel):
    """Schema for insight generation response."""

    insights: List[InsightModel]
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Simplified persona schema for Gemini compatibility (no nested objects)
class SimplePersonaModel(BaseModel):
    """Simplified schema for a persona - compatible with Gemini API."""

    name: str
    description: str
    role_context: str
    key_responsibilities: str
    tools_used: str
    collaboration_style: str
    analysis_approach: str
    pain_points: str
    patterns: str = ""
    confidence: float = Field(..., ge=0.0, le=1.0)

    def to_frontend_format(self) -> Dict[str, Any]:
        """Convert to frontend-compatible format with PersonaTrait objects."""
        return {
            "name": self.name,
            "description": self.description,
            "role_context": {
                "value": self.role_context,
                "confidence": self.confidence,
                "evidence": [],
            },
            "key_responsibilities": {
                "value": self.key_responsibilities,
                "confidence": self.confidence,
                "evidence": [],
            },
            "tools_used": {
                "value": self.tools_used,
                "confidence": self.confidence,
                "evidence": [],
            },
            "collaboration_style": {
                "value": self.collaboration_style,
                "confidence": self.confidence,
                "evidence": [],
            },
            "analysis_approach": {
                "value": self.analysis_approach,
                "confidence": self.confidence,
                "evidence": [],
            },
            "pain_points": {
                "value": self.pain_points,
                "confidence": self.confidence,
                "evidence": [],
            },
            "patterns": self.patterns.split(", ") if self.patterns else [],
            "confidence": self.confidence,
            "evidence": [],
        }


class PersonaResponse(BaseModel):
    """Schema for persona formation response."""

    personas: List[SimplePersonaModel] = Field(
        default_factory=list, description="List of generated personas"
    )


class GenAIConfigModel(BaseModel):
    """Pydantic model for GenAI configuration validation."""

    model: str = Field(default=GEMINI_MODEL_NAME)
    temperature: float = Field(default=GEMINI_TEMPERATURE, ge=0.0, le=1.0)
    max_output_tokens: int = Field(default=GEMINI_MAX_TOKENS, gt=0)
    top_p: float = Field(default=GEMINI_TOP_P, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(default=GEMINI_TOP_K, ge=1)
    response_mime_type: Optional[str] = None
    response_schema: Optional[Any] = None
    safety_settings: Optional[List[Dict[str, Any]]] = None

    @field_validator("safety_settings", mode="before")
    @classmethod
    def validate_safety_settings(cls, v):
        """Validate safety settings format."""
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("safety_settings must be a list")
        return v


class GenAIConfigFactory:
    """Factory for creating GenAI configurations based on task type."""

    # Map task types to their corresponding schema models
    TASK_SCHEMA_MAP = {
        TaskType.PATTERN_RECOGNITION: PatternResponse,
        TaskType.THEME_ANALYSIS: ThemeResponse,
        TaskType.THEME_ANALYSIS_ENHANCED: ThemeResponse,
        TaskType.INSIGHT_GENERATION: InsightResponse,
        TaskType.PERSONA_FORMATION: PersonaResponse,  # Re-enabled with fixed schema
    }

    @staticmethod
    def create_config(
        task: Union[str, TaskType], custom_params: Optional[Dict[str, Any]] = None
    ) -> GenerateContentConfig:
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
                logger.warning(
                    f"Unknown task type: {task}, using default configuration"
                )
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
        config_params = GenAIConfigFactory._apply_task_specific_config(
            task, config_params
        )

        # Add response schema if applicable
        if (
            task in GenAIConfigFactory.TASK_SCHEMA_MAP
            and "response_mime_type" in config_params
        ):
            schema_model = GenAIConfigFactory.TASK_SCHEMA_MAP[task]
            config_params["response_schema"] = schema_model
            logger.info(
                f"Using response schema for task {task}: {schema_model.__name__}"
            )

        # Override with custom parameters if provided
        if custom_params:
            config_params.update(custom_params)

        # Validate configuration
        validated_config = GenAIConfigModel(**config_params)

        # Create safety settings
        safety_settings = GenAIConfigFactory._create_safety_settings()

        # Create and return the GenerateContentConfig
        return GenAIConfigFactory._create_generate_content_config(
            validated_config, safety_settings
        )

    @staticmethod
    def _apply_task_specific_config(
        task: TaskType, config_params: Dict[str, Any]
    ) -> Dict[str, Any]:
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
            TaskType.PRD_GENERATION,
        ]

        if task in json_tasks:
            config_params["response_mime_type"] = ResponseFormat.JSON.value
            config_params["temperature"] = 0.0
            logger.info(f"Using JSON response format for task: {task}")

        # Task-specific token limits and other parameters
        if task in [
            TaskType.TRANSCRIPT_STRUCTURING,
            TaskType.THEME_ANALYSIS,
            TaskType.THEME_ANALYSIS_ENHANCED,
        ]:
            config_params["max_output_tokens"] = (
                131072  # Doubled from 65536 for large responses
            )
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(
                f"Using enhanced config for {task}: max_tokens=131072, top_k=1, top_p=0.95"
            )
        elif task == TaskType.PRD_GENERATION:
            config_params["max_output_tokens"] = (
                131072  # Use maximum token limit for PRD generation
            )
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(
                f"Using enhanced config for {task}: max_tokens=131072, top_k=1, top_p=0.95"
            )
        elif task in [TaskType.PERSONA_FORMATION, TaskType.PATTERN_RECOGNITION]:
            config_params["max_output_tokens"] = 65536
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(
                f"Using specific config for {task}: max_tokens=65536, top_k=1, top_p=0.95"
            )
        elif task in [TaskType.TEXT_GENERATION, TaskType.INDUSTRY_DETECTION]:
            # For text generation and industry detection, explicitly DO NOT use response_mime_type
            if "response_mime_type" in config_params:
                del config_params["response_mime_type"]

            # For industry detection, use lower temperature for more deterministic results
            if task == TaskType.INDUSTRY_DETECTION:
                config_params["temperature"] = 0.0

        return config_params

    @staticmethod
    def _create_safety_settings() -> List[SafetySetting]:
        """Create safety settings for the GenerateContentConfig."""
        # Create safety settings that block nothing (as per GEMINI_SAFETY_SETTINGS_BLOCK_NONE)
        safety_settings = [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
        ]
        return safety_settings

    @staticmethod
    def _create_generate_content_config(
        config: GenAIConfigModel, safety_settings: List[SafetySetting]
    ) -> GenerateContentConfig:
        """Create a GenerateContentConfig from validated parameters."""
        config_dict = config.dict(exclude_none=True)

        # Extract response_schema if present
        response_schema = None
        if "response_schema" in config_dict:
            response_schema = config_dict.pop("response_schema")

        # Create the GenerateContentConfig with safety settings
        generate_content_config = types.GenerateContentConfig(
            temperature=config_dict.get("temperature", 0.0),
            max_output_tokens=config_dict.get("max_output_tokens", 65536),
            top_k=config_dict.get("top_k", 1),
            top_p=config_dict.get("top_p", 0.95),
            response_mime_type=config_dict.get("response_mime_type"),
            safety_settings=safety_settings,
        )

        # Add response_schema if it exists
        if response_schema:
            generate_content_config.response_schema = response_schema

        return generate_content_config
