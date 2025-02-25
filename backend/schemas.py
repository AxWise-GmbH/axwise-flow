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
        default=None,
        description="Model to use for analysis. Uses 'gpt-4o-2024-08-06' for OpenAI or 'gemini-2.0-flash' for Google."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06"
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