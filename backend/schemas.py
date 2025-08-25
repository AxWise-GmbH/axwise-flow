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

from pydantic import BaseModel, Field, validator, field_validator
from typing import Dict, List, Optional, Literal, Any, Union, TypedDict
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
        None,
        description="Industry context for analysis (auto-detected if not provided)",
    )
    # Enhanced theme analysis is now always enabled by default

    model_config = {
        "json_schema_extra": {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06",
                "industry": "healthcare",
            }
        }
    }


class PersonaGenerationRequest(BaseModel):
    """
    Request model for direct text-to-persona generation.
    """

    text: str = Field(..., description="Raw interview text to generate persona from")
    llm_provider: Optional[Literal["openai", "gemini", "enhanced_gemini"]] = Field(
        "enhanced_gemini", description="LLM provider to use for persona generation"
    )
    llm_model: Optional[str] = Field(
        "models/gemini-2.5-flash", description="Specific LLM model to use"
    )
    filename: Optional[str] = Field(
        None, description="Optional filename of the source file (for special handling)"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "text": "I'm a frontend developer working on web applications. I typically use React, TypeScript, and sometimes Angular. My biggest challenge is dealing with legacy code that's poorly documented.",
                "llm_provider": "gemini",
                "llm_model": "models/gemini-2.5-flash",
                "filename": "Interview_SoftwareTech_Demo.txt",
            }
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


class HierarchicalCode(BaseModel):
    """
    Model representing a hierarchical code with sub-codes.
    """

    code: str
    definition: str
    frequency: float = Field(default=0.5, ge=0.0, le=1.0)
    sub_codes: List["HierarchicalCode"] = Field(default_factory=list)


class ReliabilityMetrics(BaseModel):
    """
    Model representing detailed reliability metrics for a theme.
    """

    cohen_kappa: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    percent_agreement: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence_interval: Optional[List[float]] = Field(default=None)


class ThemeRelationship(BaseModel):
    """
    Model representing a relationship between themes.
    """

    related_theme: str
    relationship_type: Literal["causal", "correlational", "hierarchical"]
    strength: float = Field(default=0.5, ge=0.0, le=1.0)
    description: str


class SentimentDistribution(BaseModel):
    """
    Model representing the distribution of sentiment within a theme.
    """

    positive: float = Field(default=0.33, ge=0.0, le=1.0)
    neutral: float = Field(default=0.34, ge=0.0, le=1.0)
    negative: float = Field(default=0.33, ge=0.0, le=1.0)

    @field_validator("positive", "neutral", "negative")
    def validate_distribution(cls, v, info):
        """Ensure sentiment values are between 0 and 1"""
        if not 0 <= v <= 1:
            raise ValueError(f"{info.field_name} must be between 0 and 1")
        return v


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

    # Enhanced theme fields
    type: Optional[str] = Field(default="theme", description="Type of analysis object")
    sentiment_distribution: Optional[SentimentDistribution] = Field(
        default=None, description="Distribution of sentiment within this theme"
    )
    hierarchical_codes: Optional[List[HierarchicalCode]] = Field(
        default=None, description="Hierarchical representation of codes with sub-codes"
    )
    reliability_metrics: Optional[ReliabilityMetrics] = Field(
        default=None, description="Detailed reliability metrics"
    )
    relationships: Optional[List[ThemeRelationship]] = Field(
        default=None, description="Relationships to other themes"
    )

    # Stakeholder attribution fields
    stakeholder_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Stakeholder attribution and distribution for this theme",
    )
    stakeholder_attribution: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Direct stakeholder attribution data for this theme",
    )

    # Legacy fields
    count: Optional[int] = Field(
        default=None, description="Legacy field. Use frequency instead."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "User Interface",
                "frequency": 0.25,
                "sentiment": 0.8,
                "statements": ["The UI is very intuitive", "I love the design"],
                "keywords": ["UI", "design", "interface", "usability"],
                "definition": "The visual and interactive elements of the application that users engage with",
                "reliability": 0.85,
                "process": "enhanced",
                "sentiment_distribution": {
                    "positive": 0.7,
                    "neutral": 0.2,
                    "negative": 0.1,
                },
            }
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

    # Stakeholder attribution fields (matching Theme model)
    stakeholder_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Stakeholder attribution and distribution for this pattern",
    )
    stakeholder_attribution: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Direct stakeholder attribution data for this pattern",
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

    @field_validator("positive", "neutral", "negative")
    @classmethod
    def ensure_percentages(cls, v):
        """Ensure sentiment values are between 0 and 1"""
        if not 0 <= v <= 1:
            raise ValueError("Sentiment values must be between 0 and 1")
        return v


class DemographicsValue(BaseModel):
    """Structured container for demographic details."""

    experience_level: Optional[str] = Field(
        None,
        description="Extract the professional experience level, e.g., 'Senior', 'Executive', 'Mid-level'.",
    )
    roles: Optional[List[str]] = Field(
        None,
        description="Extract a list of all job roles or titles mentioned, like 'Project Lead' or 'CEO'.",
    )
    industry: Optional[str] = Field(
        None,
        description="Extract the industry the person works in, e.g., 'Tech', 'Manufacturing', 'Logistics'.",
    )
    location: Optional[str] = Field(
        None,
        description="Extract the primary city or location mentioned, e.g., 'Bremen'.",
    )
    age_range: Optional[str] = Field(
        None, description="Extract the age range if mentioned, e.g., '55-64'."
    )
    professional_context: Optional[str] = Field(
        None,
        description="Summarize the person's professional background, their company, and their role within it.",
    )


class StructuredDemographics(BaseModel):
    """Holds the structured demographic data and the evidence for it."""

    value: DemographicsValue = Field(
        description="Contains all the structured demographic information extracted from the text."
    )
    confidence: float = Field(
        description="Assign a confidence score from 0.0 to 1.0 for the overall extraction."
    )
    evidence: List[str] = Field(
        description="Provide a list of direct quotes from the text that support the extracted data."
    )


class PersonaTrait(BaseModel):
    """
    Model representing a trait of a persona with evidence and confidence.
    """

    value: Union[str, dict, list, DemographicsValue] = Field(default_factory=dict)
    confidence: float = Field(..., ge=0, le=1)
    evidence: List[str] = Field(default_factory=list)

    def is_structured_demographics(self) -> bool:
        """Check if this trait contains structured demographics data."""
        return isinstance(self.value, DemographicsValue)

    def get_structured_demographics(self) -> Optional[DemographicsValue]:
        """Get structured demographics if available."""
        if self.is_structured_demographics():
            return self.value
        return None

    def to_structured_demographics(self) -> Optional[StructuredDemographics]:
        """Convert to StructuredDemographics format if this is demographics data."""
        if self.is_structured_demographics():
            return StructuredDemographics(
                value=self.value, confidence=self.confidence, evidence=self.evidence
            )
        return None

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
    technology_and_tools: Optional[PersonaTrait] = Field(
        None, description="Software, hardware, and other tools used regularly"
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

    # Stakeholder attribution fields (matching Theme and Pattern models)
    stakeholder_mapping: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Stakeholder attribution and mapping for this persona",
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

    # Stakeholder attribution fields (matching Theme, Pattern, and Persona models)
    stakeholder_perspectives: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Stakeholder perspectives and attribution for this insight",
    )

    model_config = {
        "json_schema_extra": {
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
    }


class EnhancedThemeResponse(BaseModel):
    """
    Response model for enhanced theme analysis.
    """

    enhanced_themes: List[Theme] = Field(
        default_factory=list,
        description="List of enhanced themes with detailed analysis",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "enhanced_themes": [
                    {
                        "name": "User Interface Complexity",
                        "definition": "The difficulty users experience navigating and using the interface",
                        "keywords": ["navigation", "UI", "complexity", "usability"],
                        "frequency": 0.75,
                        "sentiment": -0.3,
                        "statements": [
                            "I find the interface overwhelming with too many options",
                            "It takes me several clicks to find basic features",
                        ],
                        "codes": ["UI_COMPLEXITY", "NAVIGATION_ISSUES"],
                        "reliability": 0.85,
                        "process": "enhanced",
                        "sentiment_distribution": {
                            "positive": 0.1,
                            "neutral": 0.3,
                            "negative": 0.6,
                        },
                    }
                ]
            }
        }
    }


# Multi-Stakeholder Analysis Models


class DetectedStakeholder(BaseModel):
    """Individual stakeholder detected in the analysis"""

    stakeholder_id: str = Field(
        ..., description="Unique identifier for the stakeholder"
    )
    stakeholder_type: Literal[
        "primary_customer", "secondary_user", "decision_maker", "influencer"
    ] = Field(..., description="Classification of stakeholder type")
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence in stakeholder detection"
    )
    demographic_profile: Optional[Dict[str, Any]] = Field(
        None, description="Demographic information"
    )
    individual_insights: Dict[str, Any] = Field(
        default_factory=dict, description="Stakeholder-specific insights"
    )
    influence_metrics: Optional[Dict[str, float]] = Field(
        None, description="Influence and decision power metrics"
    )
    authentic_evidence: Optional[Dict[str, List[str]]] = Field(
        None, description="Authentic supporting evidence and quotes from interview data"
    )


class ConsensusArea(BaseModel):
    """Area where stakeholders show agreement"""

    topic: str = Field(..., description="Topic of consensus")
    agreement_level: float = Field(
        ..., ge=0.0, le=1.0, description="Level of agreement (0-1)"
    )
    participating_stakeholders: List[str] = Field(
        ..., description="Stakeholders in agreement"
    )
    shared_insights: List[str] = Field(
        default_factory=list, description="Common insights"
    )
    business_impact: str = Field(..., description="Business impact assessment")


class ConflictZone(BaseModel):
    """Area where stakeholders disagree"""

    topic: str = Field(..., description="Topic of conflict")
    conflicting_stakeholders: List[str] = Field(
        ..., description="Stakeholders in conflict"
    )
    conflict_severity: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Severity level"
    )
    potential_resolutions: List[str] = Field(
        default_factory=list, description="Potential resolution strategies"
    )
    business_risk: str = Field(..., description="Business risk assessment")


class InfluenceNetwork(BaseModel):
    """Influence relationship between stakeholders"""

    influencer: str = Field(..., description="Influencing stakeholder")
    influenced: List[str] = Field(..., description="Influenced stakeholders")
    influence_type: Literal["decision", "opinion", "adoption", "resistance"] = Field(
        ..., description="Type of influence"
    )
    strength: float = Field(..., ge=0.0, le=1.0, description="Strength of influence")
    pathway: str = Field(..., description="How influence flows")


class CrossStakeholderPatterns(BaseModel):
    """Cross-stakeholder analysis patterns"""

    consensus_areas: List[ConsensusArea] = Field(default_factory=list)
    conflict_zones: List[ConflictZone] = Field(default_factory=list)
    influence_networks: List[InfluenceNetwork] = Field(default_factory=list)
    stakeholder_priority_matrix: Optional[Dict[str, Any]] = Field(
        None, description="Priority matrix data"
    )


class MultiStakeholderSummary(BaseModel):
    """High-level multi-stakeholder summary"""

    total_stakeholders: int = Field(
        ..., ge=0, description="Total number of stakeholders detected"
    )
    consensus_score: float = Field(
        ..., ge=0.0, le=1.0, description="Overall consensus level"
    )
    conflict_score: float = Field(
        ..., ge=0.0, le=1.0, description="Overall conflict level"
    )
    key_insights: List[str] = Field(
        default_factory=list, description="Key multi-stakeholder insights"
    )
    implementation_recommendations: List[str] = Field(
        default_factory=list, description="Implementation recommendations"
    )


class StakeholderIntelligence(BaseModel):
    """Complete stakeholder intelligence data"""

    detected_stakeholders: List[DetectedStakeholder] = Field(
        ..., description="All detected stakeholders"
    )
    cross_stakeholder_patterns: Optional[CrossStakeholderPatterns] = Field(
        None, description="Cross-stakeholder patterns"
    )
    multi_stakeholder_summary: Optional[MultiStakeholderSummary] = Field(
        None, description="High-level summary"
    )
    processing_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Processing metadata"
    )


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
    enhanced_patterns: Optional[List[Pattern]] = (
        None  # Enhanced patterns from stakeholder analysis
    )
    sentimentOverview: Optional[SentimentOverview] = (
        None  # Optional since sentiment analysis can be disabled
    )
    sentiment: Optional[List[Dict[str, Any]]] = None
    personas: Optional[List[Persona]] = None
    enhanced_personas: Optional[List[Persona]] = (
        None  # Enhanced personas from stakeholder analysis
    )
    insights: Optional[List[Insight]] = None
    enhanced_insights: Optional[List[Insight]] = (
        None  # Enhanced insights from stakeholder analysis
    )
    error: Optional[str] = None

    # Multi-stakeholder intelligence - always present, empty if no stakeholders detected
    stakeholder_intelligence: StakeholderIntelligence = Field(
        default_factory=lambda: StakeholderIntelligence(
            detected_stakeholders=[], processing_metadata={"status": "not_analyzed"}
        ),
        description="Multi-stakeholder analysis intelligence - always present",
    )


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
