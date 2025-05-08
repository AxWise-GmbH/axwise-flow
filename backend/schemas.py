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
    industry: Optional[str] = Field(
        None, description="Industry context for analysis (auto-detected if not provided)"
    )
    # Enhanced theme analysis is now always enabled by default

    class Config:
        json_schema_extra = {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06",
                "industry": "healthcare"
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
        "models/gemini-2.5-flash-preview-04-17", description="Specific LLM model to use"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "text": "I'm a frontend developer working on web applications. I typically use React, TypeScript, and sometimes Angular. My biggest challenge is dealing with legacy code that's poorly documented.",
                "llm_provider": "gemini",
                "llm_model": "models/gemini-2.5-flash-preview-04-17",
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

    # Supporting quotes
    statements: List[str] = Field(
        default_factory=list, description="Supporting statements from the text"
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

    This comprehensive model captures detailed information about a user persona,
    including demographics, goals, skills, challenges, and other key attributes.
    Each attribute is structured as a PersonaTrait with confidence scoring and supporting evidence.
    """

    # Basic information
    name: str = Field(
        description="A descriptive role-based name for the persona (e.g., 'Data-Driven Product Manager')"
    )
    archetype: Optional[str] = Field(
        None,
        description="A general category or archetype this persona falls into (e.g., 'Decision Maker', 'Technical Expert')",
    )
    description: str = Field(
        "",
        description="A brief 1-3 sentence overview of the persona",
    )

    # Detailed attributes as PersonaTrait objects
    demographics: Optional[PersonaTrait] = Field(
        None,
        description="Age, gender, education, experience level, and other demographic information",
    )
    goals_and_motivations: Optional[PersonaTrait] = Field(
        None, description="Primary objectives, aspirations, and driving factors"
    )
    skills_and_expertise: Optional[PersonaTrait] = Field(
        None,
        description="Technical and soft skills, knowledge areas, and expertise levels",
    )
    workflow_and_environment: Optional[PersonaTrait] = Field(
        None, description="Work processes, physical/digital environment, and context"
    )
    challenges_and_frustrations: Optional[PersonaTrait] = Field(
        None, description="Pain points, obstacles, and sources of frustration"
    )
    needs_and_desires: Optional[PersonaTrait] = Field(
        None,
        description="Specific needs, wants, and desires related to the problem domain",
    )
    technology_and_tools: Optional[PersonaTrait] = Field(
        None, description="Software, hardware, and other tools used regularly"
    )
    attitude_towards_research: Optional[PersonaTrait] = Field(
        None, description="Views on research, data, and evidence-based approaches"
    )
    attitude_towards_ai: Optional[PersonaTrait] = Field(
        None, description="Perspective on AI, automation, and technological change"
    )
    key_quotes: Optional[PersonaTrait] = Field(
        None,
        description="Representative quotes that capture the persona's voice and perspective",
    )

    # Legacy fields for backward compatibility
    role_context: Optional[PersonaTrait] = Field(
        None, description="Primary job function and work environment (legacy field)"
    )
    key_responsibilities: Optional[PersonaTrait] = Field(
        None, description="Main tasks and responsibilities (legacy field)"
    )
    tools_used: Optional[PersonaTrait] = Field(
        None, description="Specific tools or methods used (legacy field)"
    )
    collaboration_style: Optional[PersonaTrait] = Field(
        None, description="How they work with others (legacy field)"
    )
    analysis_approach: Optional[PersonaTrait] = Field(
        None, description="How they approach problems/analysis (legacy field)"
    )
    pain_points: Optional[PersonaTrait] = Field(
        None, description="Specific challenges mentioned (legacy field)"
    )

    # Overall persona information
    patterns: List[str] = Field(
        default_factory=list,
        description="Behavioral patterns associated with this persona",
    )
    overall_confidence: float = Field(
        0.7,
        ge=0,
        le=1,
        description="Overall confidence score for the entire persona",
        alias="confidence",  # For backward compatibility
    )
    supporting_evidence_summary: List[str] = Field(
        default_factory=list,
        description="Key evidence supporting the overall persona characterization",
        alias="evidence",  # For backward compatibility
    )
    persona_metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional metadata about the persona creation process",
        alias="metadata",  # For backward compatibility
    )

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
