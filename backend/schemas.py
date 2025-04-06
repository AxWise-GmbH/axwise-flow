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
        ..., description="LLM provider to use for analysis"
    )
    llm_model: Optional[str] = Field(
        None,
        description="Specific LLM model to use (defaults to provider's default model)",
    )
    is_free_text: Optional[bool] = Field(
        False, description="Whether the data is in free-text format"
    )
    # Enhanced theme analysis is now always enabled by default

    class Config:
        json_schema_extra = {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06",
            }
        }


class PersonaGenerationRequest(BaseModel):
    """
    Request model for direct text-to-persona generation.
    """

    text: str = Field(..., description="Raw interview text to generate persona from")
    llm_provider: Optional[Literal["openai", "gemini"]] = Field(
        "gemini", description="LLM provider to use for persona generation"
    )
    llm_model: Optional[str] = Field(
        "gemini-2.0-flash", description="Specific LLM model to use"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "text": "I'm a frontend developer working on web applications. I typically use React, TypeScript, and sometimes Angular. My biggest challenge is dealing with legacy code that's poorly documented.",
                "llm_provider": "gemini",
                "llm_model": "gemini-2.0-flash",
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
    frequency: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Frequency score (0-1 representing prevalence)",
    )
    sentiment: float = Field(
        default=0.0,
        ge=-1.0,
        le=1.0,
        description="Sentiment score (-1 to 1, where -1 is negative, 0 is neutral, 1 is positive)",
    )

    # Supporting quotes (statements is preferred, examples is for backward compatibility)
    statements: List[str] = Field(
        default_factory=list, description="Supporting statements from the text"
    )
    examples: Optional[List[str]] = Field(
        default=None,
        description="Legacy field for backward compatibility. Use statements instead.",
    )

    # Additional theme details
    definition: Optional[str] = Field(
        default=None, description="One-sentence description of the theme"
    )
    keywords: List[str] = Field(
        default_factory=list, description="Related keywords or terms"
    )
    codes: Optional[List[str]] = Field(
        default=None, description="Associated codes from the coding process"
    )
    reliability: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="Inter-rater reliability score (0-1)"
    )
    process: Optional[Literal["basic", "enhanced"]] = Field(
        default=None, description="Identifies which analysis process was used"
    )

    # Legacy fields
    count: Optional[int] = Field(
        default=None, description="Legacy field. Use frequency instead."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "name": "User Interface",
                "frequency": 0.25,
                "sentiment": 0.8,
                "statements": ["The UI is very intuitive", "I love the design"],
                "keywords": ["UI", "design", "interface", "usability"],
                "definition": "The visual and interactive elements of the application that users engage with",
                "reliability": 0.85,
                "process": "enhanced",
            }
        }


class Pattern(BaseModel):
    """
    Model representing a pattern identified in the analysis.
    """

    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Frequency score (0-1 representing prevalence)",
    )
    sentiment: Optional[float] = Field(
        None,
        ge=-1.0,
        le=1.0,
        description="Sentiment score (-1 to 1, where -1 is negative, 0 is neutral, 1 is positive)",
    )
    evidence: Optional[List[str]] = Field(
        None, description="Supporting quotes showing the pattern in action"
    )
    impact: Optional[str] = Field(
        None, description="Description of the consequence or impact of this pattern"
    )
    suggested_actions: Optional[List[str]] = Field(
        None,
        description="Potential next steps or recommendations based on this pattern",
    )

    # Legacy field for backward compatibility
    examples: Optional[List[str]] = Field(
        None,
        description="Legacy field for backward compatibility. Use evidence instead.",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Navigation Issues",
                "category": "User Experience",
                "description": "Users repeatedly struggle to find key features in the interface",
                "frequency": 0.65,
                "sentiment": -0.3,
                "evidence": [
                    "I always have to click through multiple menus to find settings",
                    "It takes me several attempts to locate the export function",
                ],
                "impact": "Increases time-to-task completion and creates user frustration",
                "suggested_actions": [
                    "Conduct usability testing on navigation",
                    "Implement search functionality",
                    "Reorganize menu structure",
                ],
            }
        }


class SentimentOverview(BaseModel):
    """
    Model representing overall sentiment distribution.
    """

    positive: float
    neutral: float
    negative: float

    @validator("positive", "neutral", "negative")
    def ensure_percentages(cls, v):
        """Ensure sentiment values are between 0 and 1"""
        if not 0 <= v <= 1:
            raise ValueError("Sentiment values must be between 0 and 1")
        return v


class PersonaTrait(BaseModel):
    """
    Model representing a trait of a persona with evidence and confidence.
    """

    value: Union[str, dict, list] = Field(default_factory=dict)
    confidence: float = Field(..., ge=0, le=1)
    evidence: List[str] = Field(default_factory=list)

    class Config:
        json_schema_extra = {
            "example": {
                "value": "Frequently uses collaboration tools",
                "confidence": 0.85,
                "evidence": [
                    "Uses Slack daily",
                    "Coordinates with team members using Trello",
                ],
            }
        }


class Persona(BaseModel):
    """
    Model representing a user persona derived from interview analysis.
    """

    name: str
    description: str = ""
    role_context: PersonaTrait
    key_responsibilities: PersonaTrait
    tools_used: PersonaTrait
    collaboration_style: PersonaTrait
    analysis_approach: PersonaTrait
    pain_points: PersonaTrait
    patterns: List[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    evidence: List[str] = Field(default_factory=list)
    persona_metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, alias="metadata"
    )  # Use alias for potential backward compatibility if needed, map to persona_metadata

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Data-Driven Product Manager",
                "description": "Experienced product manager who relies heavily on data analytics for decision-making",
                "role_context": {
                    "value": "Product development and roadmap planning",
                    "confidence": 0.9,
                    "evidence": [
                        "Mentions roadmap planning sessions",
                        "Discusses product prioritization",
                    ],
                },
                "key_responsibilities": {
                    "value": "Market research, feature prioritization, and coordinating with development teams",
                    "confidence": 0.85,
                    "evidence": [
                        "Conducts competitor analysis",
                        "Prioritizes backlog items",
                    ],
                },
                "tools_used": {
                    "value": "Jira, Google Analytics, and Tableau",
                    "confidence": 0.8,
                    "evidence": [
                        "Uses Jira for tracking",
                        "Analyzes data using Tableau",
                    ],
                },
                "collaboration_style": {
                    "value": "Highly collaborative with regular cross-functional meetings",
                    "confidence": 0.75,
                    "evidence": [
                        "Weekly sync meetings",
                        "Collaborates with design and development",
                    ],
                },
                "analysis_approach": {
                    "value": "Balances quantitative metrics with qualitative user feedback",
                    "confidence": 0.8,
                    "evidence": [
                        "Reviews usage metrics",
                        "Considers user feedback in decisions",
                    ],
                },
                "pain_points": {
                    "value": "Insufficient data on user behavior and slow development cycles",
                    "confidence": 0.7,
                    "evidence": [
                        "Mentions lack of user insights",
                        "Frustrated with slow release cycles",
                    ],
                },
                "patterns": [
                    "Data-driven decision making",
                    "Cross-functional collaboration",
                ],
                "confidence": 0.85,
                "evidence": [
                    "Interview mentions product management activities",
                    "Uses typical PM tools",
                ],
                "persona_metadata": {  # Changed key here
                    "sample_size": 3,
                    "timestamp": "2023-10-26T14:30:00Z",
                },
            }
        }


class Insight(BaseModel):
    """
    Model representing an insight derived from analysis.
    """

    topic: str
    observation: str
    evidence: List[str] = Field(default_factory=list)
    implication: Optional[str] = Field(
        None, description="Explains the 'so what?' or consequence of the insight"
    )
    recommendation: Optional[str] = Field(
        None, description="Suggests a concrete next step or action"
    )
    priority: Optional[Literal["High", "Medium", "Low"]] = Field(
        None, description="Indicates urgency/importance of the insight"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "topic": "Navigation Complexity",
                "observation": "Users consistently struggle to find key features in the application interface",
                "evidence": [
                    "I spent 5 minutes looking for the export button",
                    "The settings menu is buried too deep in the interface",
                ],
                "implication": "This leads to increased time-on-task and user frustration, potentially causing users to abandon tasks",
                "recommendation": "Redesign the main navigation menu with a focus on discoverability of key features",
                "priority": "High",
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
    enhanced_themes: Optional[List[Theme]] = (
        None  # Enhanced themes from the enhanced analysis process
    )
    patterns: List[Pattern]
    sentimentOverview: SentimentOverview
    sentiment: Optional[List[Dict[str, Any]]] = None
    personas: Optional[List[Persona]] = None
    insights: Optional[List[Insight]] = None
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
