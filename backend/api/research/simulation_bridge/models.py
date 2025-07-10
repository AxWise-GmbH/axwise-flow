"""
Pydantic models for the Simulation Bridge system.
"""

from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


class DemographicDetails(BaseModel):
    """Structured demographic details for personas."""

    model_config = ConfigDict(extra="forbid")

    age_range: Optional[str] = None
    income_level: Optional[str] = None
    education: Optional[str] = None
    location: Optional[str] = None
    industry_experience: Optional[str] = None
    company_size: Optional[str] = None


class SimulationDepth(str, Enum):
    """Simulation depth options."""

    QUICK = "quick"
    DETAILED = "detailed"
    COMPREHENSIVE = "comprehensive"


class ResponseStyle(str, Enum):
    """Response style options."""

    REALISTIC = "realistic"
    OPTIMISTIC = "optimistic"
    CRITICAL = "critical"
    MIXED = "mixed"


class SimulationConfig(BaseModel):
    """Configuration for simulation parameters."""

    depth: SimulationDepth = SimulationDepth.DETAILED
    people_per_stakeholder: int = Field(
        default=5, ge=1, le=10
    )  # Changed from personas_per_stakeholder
    response_style: ResponseStyle = ResponseStyle.REALISTIC
    include_insights: bool = True
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)

    # Keep old field for backward compatibility during transition
    @property
    def personas_per_stakeholder(self) -> int:
        return self.people_per_stakeholder


class BusinessContext(BaseModel):
    """Business context for simulation."""

    business_idea: str
    target_customer: str
    problem: str
    industry: Optional[str] = "general"


class Stakeholder(BaseModel):
    """Stakeholder information."""

    id: str
    name: str
    description: str
    questions: List[str]


class QuestionsData(BaseModel):
    """Questions data structure."""

    stakeholders: Dict[str, List[Stakeholder]]
    timeEstimate: Optional[Dict[str, Any]] = None


class SimulatedPerson(BaseModel):
    """Individual simulated person for interviews."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    age: int
    background: str
    motivations: List[str]
    pain_points: List[str]
    communication_style: str
    stakeholder_type: str
    demographic_details: DemographicDetails


class PersonaTrait(BaseModel):
    """A trait or characteristic of a persona pattern."""

    name: str
    description: str
    evidence: List[str]  # Quotes or examples from interviews
    confidence: float = Field(ge=0.0, le=1.0)


class PersonaPattern(BaseModel):
    """Behavioral pattern discovered from multiple people's interviews."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str  # e.g., "Cost-Conscious Manager"
    description: str
    stakeholder_type: str
    traits: List[PersonaTrait]
    key_quotes: List[str]
    people_ids: List[str]  # IDs of people who exhibit this pattern
    confidence: float = Field(ge=0.0, le=1.0)
    frequency: float = Field(ge=0.0, le=1.0)  # How common this pattern is


# Keep AIPersona as alias for backward compatibility during transition
AIPersona = SimulatedPerson


class InterviewResponse(BaseModel):
    """Single interview response."""

    question: str
    response: str
    sentiment: str
    key_insights: List[str]
    follow_up_questions: Optional[List[str]] = None


class SimulatedInterview(BaseModel):
    """Complete simulated interview with an individual person."""

    person_id: str  # Changed from persona_id
    stakeholder_type: str
    responses: List[InterviewResponse]
    interview_duration_minutes: int
    overall_sentiment: str
    key_themes: List[str]

    # Keep old field for backward compatibility during transition
    @property
    def persona_id(self) -> str:
        return self.person_id


class SimulationInsights(BaseModel):
    """Insights from the simulation."""

    overall_sentiment: str
    key_themes: List[str]
    stakeholder_priorities: Dict[str, List[str]]
    potential_risks: List[str]
    opportunities: List[str]
    recommendations: List[str]


class SimulationRequest(BaseModel):
    """Request for simulation."""

    questions_data: Optional[QuestionsData] = None
    business_context: Optional[BusinessContext] = None
    raw_questionnaire_content: Optional[str] = None
    config: SimulationConfig


class PersonaAnalysisResult(BaseModel):
    """Result of analyzing interviews to generate persona patterns."""

    persona_patterns: List[PersonaPattern]
    analysis_summary: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    people_analyzed: int
    patterns_discovered: int


class SimulationResponse(BaseModel):
    """Response from simulation."""

    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    simulation_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    people: Optional[List[SimulatedPerson]] = None  # Changed from personas
    interviews: Optional[List[SimulatedInterview]] = None
    persona_patterns: Optional[List[PersonaPattern]] = (
        None  # New field for actual personas
    )
    persona_analysis: Optional[PersonaAnalysisResult] = None  # Analysis results
    simulation_insights: Optional[SimulationInsights] = None
    recommendations: Optional[List[str]] = None

    # Keep old field for backward compatibility during transition
    @property
    def personas(self) -> Optional[List[SimulatedPerson]]:
        return self.people


class SimulationProgress(BaseModel):
    """Progress tracking for simulation."""

    simulation_id: str
    stage: str  # "generating_people", "conducting_interviews", "analyzing_patterns"
    progress_percentage: int
    current_task: str
    estimated_time_remaining: Optional[int] = None
    completed_people: int = 0  # Changed from completed_personas
    total_people: int = 0  # Changed from total_personas
    completed_interviews: int = 0
    total_interviews: int = 0
    completed_patterns: int = 0  # New field for persona pattern analysis
    total_patterns: int = 0  # New field for persona pattern analysis

    # Keep old fields for backward compatibility during transition
    @property
    def completed_personas(self) -> int:
        return self.completed_people

    @property
    def total_personas(self) -> int:
        return self.total_people
