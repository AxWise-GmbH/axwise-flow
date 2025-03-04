"""
Pydantic models for API request/response validation and documentation.

This module defines the data structures used by the FastAPI endpoints for:
- Request validation
- Response serialization
- OpenAPI documentation generation
- Data validation

These models act as a contract between the frontend and backend, ensuring
consistent data structures throughout the application.
"""

from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Literal, Any, Union
from datetime import datetime


# Request Models

class AnalysisRequest(BaseModel):
    """
    Request model for triggering data analysis.
    """
    data_id: int = Field(..., description="ID of the uploaded data to analyze")
    llm_provider: Literal["openai", "gemini"] = Field(
        ...,
        description="LLM provider to use for analysis"
    )
    llm_model: Optional[str] = Field(
        None,
        description="Specific LLM model to use (defaults to provider's default model)"
    )
    is_free_text: Optional[bool] = Field(
        False,
        description="Whether the data is in free-text format"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06"
            }
        }


class PersonaGenerationRequest(BaseModel):
    """
    Request model for direct text-to-persona generation.
    """
    text: str = Field(..., description="Raw interview text to generate persona from")
    llm_provider: Optional[Literal["openai", "gemini"]] = Field(
        "gemini",
        description="LLM provider to use for persona generation"
    )
    llm_model: Optional[str] = Field(
        "gemini-2.0-flash",
        description="Specific LLM model to use"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "text": "I'm a frontend developer working on web applications. I typically use React, TypeScript, and sometimes Angular. My biggest challenge is dealing with legacy code that's poorly documented.",
                "llm_provider": "gemini",
                "llm_model": "gemini-2.0-flash"
            }
        }


# Response Models

class UploadResponse(BaseModel):
    """
    Response model for data upload endpoint.
    """
    data_id: int
    message: str


class AnalysisResponse(BaseModel):
    """
    Response model for analysis endpoint.
    """
    result_id: int
    message: str


class HealthCheckResponse(BaseModel):
    """
    Response model for health check endpoint.
    """
    status: str
    timestamp: datetime


# Detailed Analysis Result Models

class Theme(BaseModel):
    """
    Model representing a theme identified in the analysis.
    """
    name: str
    count: Optional[int] = None
    frequency: Optional[float] = None
    sentiment: Optional[float] = None
    examples: Optional[List[str]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "User Interface",
                "count": 12,
                "frequency": 0.25,
                "sentiment": 0.8,
                "examples": ["The UI is very intuitive", "I love the design"]
            }
        }


class Pattern(BaseModel):
    """
    Model representing a pattern identified in the analysis.
    """
    name: Optional[str] = None
    category: str
    frequency: Union[float, str, None] = None
    sentiment: Optional[float] = None
    description: Optional[str] = None
    examples: Optional[List[str]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Navigation Issues",
                "category": "User Experience",
                "frequency": 0.15,
                "sentiment": -0.2,
                "description": "Users consistently reported difficulty finding specific features",
                "examples": ["I couldn't find the settings", "The menu is confusing"]
            }
        }


class SentimentOverview(BaseModel):
    """
    Model representing overall sentiment distribution.
    """
    positive: float
    neutral: float
    negative: float

    @validator('positive', 'neutral', 'negative')
    def ensure_percentages(cls, v):
        """Ensure sentiment values are between 0 and 1"""
        if not 0 <= v <= 1:
            raise ValueError("Sentiment values must be between 0 and 1")
        return v


class PersonaTrait(BaseModel):
    """
    Model representing a trait of a persona with evidence and confidence.
    """
    value: str
    confidence: float
    evidence: List[str]

    class Config:
        json_schema_extra = {
            "example": {
                "value": "Frequently uses collaboration tools",
                "confidence": 0.85,
                "evidence": ["Uses Slack daily", "Coordinates with team members using Trello"]
            }
        }


class Persona(BaseModel):
    """
    Model representing a user persona derived from interview analysis.
    """
    name: str
    description: str
    role_context: PersonaTrait
    key_responsibilities: PersonaTrait
    tools_used: PersonaTrait
    collaboration_style: PersonaTrait
    analysis_approach: PersonaTrait
    pain_points: PersonaTrait
    patterns: List[str]
    confidence: float
    evidence: List[str]
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Data-Driven Product Manager",
                "description": "Experienced product manager who relies heavily on data analytics for decision-making",
                "role_context": {
                    "value": "Product development and roadmap planning",
                    "confidence": 0.9,
                    "evidence": ["Mentions roadmap planning sessions", "Discusses product prioritization"]
                },
                "key_responsibilities": {
                    "value": "Market research, feature prioritization, and coordinating with development teams",
                    "confidence": 0.85,
                    "evidence": ["Conducts competitor analysis", "Prioritizes backlog items"]
                },
                "tools_used": {
                    "value": "Jira, Google Analytics, and Tableau",
                    "confidence": 0.8,
                    "evidence": ["Uses Jira for tracking", "Analyzes data using Tableau"]
                },
                "collaboration_style": {
                    "value": "Highly collaborative with regular cross-functional meetings",
                    "confidence": 0.75,
                    "evidence": ["Weekly sync meetings", "Collaborates with design and development"]
                },
                "analysis_approach": {
                    "value": "Balances quantitative metrics with qualitative user feedback",
                    "confidence": 0.8,
                    "evidence": ["Reviews usage metrics", "Considers user feedback in decisions"]
                },
                "pain_points": {
                    "value": "Insufficient data on user behavior and slow development cycles",
                    "confidence": 0.7,
                    "evidence": ["Mentions lack of user insights", "Frustrated with slow release cycles"]
                },
                "patterns": ["Data-driven decision making", "Cross-functional collaboration"],
                "confidence": 0.85,
                "evidence": ["Interview mentions product management activities", "Uses typical PM tools"],
                "metadata": {
                    "sample_size": 3,
                    "timestamp": "2023-10-26T14:30:00Z"
                }
            }
        }


class DetailedAnalysisResult(BaseModel):
    """
    Comprehensive model for all analysis results.
    """
    id: str
    status: Literal["pending", "completed", "failed"]
    createdAt: str
    fileName: str
    fileSize: Optional[int] = None
    themes: List[Theme]
    patterns: List[Pattern]
    sentimentOverview: SentimentOverview
    sentiment: Optional[List[Dict[str, Any]]] = None
    personas: Optional[List[Persona]] = None
    error: Optional[str] = None


class ResultResponse(BaseModel):
    """
    Response model for results endpoint.
    """
    status: Literal["processing", "completed", "error"]
    result_id: Optional[int] = None
    analysis_date: Optional[datetime] = None
    results: Optional[Dict[str, Any]] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    error: Optional[str] = None


# User and Authentication Models

class UserCreate(BaseModel):
    """
    Model for user creation requests.
    """
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserResponse(BaseModel):
    """
    Response model for user data.
    """
    user_id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    subscription_status: Optional[str] = None


class TokenResponse(BaseModel):
    """
    Response model for authentication tokens.
    """
    access_token: str
    token_type: str