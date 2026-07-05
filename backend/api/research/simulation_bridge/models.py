"""
Pydantic models for the Simulation Bridge and the E2E Cognitive Simulation Pipelines.

This system supports three primary core qualitative architectures:
1. Pipeline B: Top-Down interview simulation (generates OCEAN profiles/digital twins from a business brief and simulates dialogues).
2. Pipeline A: Bottom-Up Empirical analysis (parses raw conversations into offset-linked, audited schemas).
3. The Closed-Loop Hybrid (A+B) Pipeline: Integrates both architectures together in a single pass.
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

    @classmethod
    def from_env(cls) -> "SimulationConfig":
        """Create SimulationConfig with defaults from environment variables."""
        import os

        people_per_stakeholder = int(os.getenv("MAX_PERSONAS", "5"))

        return cls(
            depth=SimulationDepth.DETAILED,
            people_per_stakeholder=people_per_stakeholder,
            response_style=ResponseStyle.REALISTIC,
            include_insights=True,
            temperature=0.7,
        )


class BusinessContext(BaseModel):
    """Business context for simulation."""

    business_idea: str
    target_customer: str
    problem: str
    industry: Optional[str] = "general"
    location: Optional[str] = None


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


class OCEANProfile(BaseModel):
    """Big Five personality traits, scored 0.0 to 1.0"""
    openness: float = Field(..., ge=0.0, le=1.0, description="Intellectual curiosity and creativity")
    conscientiousness: float = Field(..., ge=0.0, le=1.0, description="Methodical organization and structure")
    extraversion: float = Field(..., ge=0.0, le=1.0, description="Sociability, assertiveness, and energy level")
    agreeableness: float = Field(..., ge=0.0, le=1.0, description="Cooperativeness, empathy, and trust")
    neuroticism: float = Field(..., ge=0.0, le=1.0, description="Sensitivity, anxiety, and risk aversion")
    occupation_code: Optional[str] = Field(None, description="Statistical occupation baseline used for sampling")


class CognitiveGrounding(BaseModel):
    """Links the persona to private context databases, SOPs, or raw evidence logs. Phase 2 stub."""
    vector_partition_id: Optional[str] = None
    sop_references: List[str] = Field(default_factory=list)


class ToolProfile(BaseModel):
    """Defines tool schema endpoints and execution clearances for the persona. Phase 3 stub."""
    allowed_tools: List[str] = Field(default_factory=list)
    api_scopes: List[str] = Field(default_factory=list)
    rbac_role: str = Field(default="guest")


class PersonaGenerationItem(BaseModel):
    """LLM output that binds generated text to a pre-assigned profile index."""
    profile_index: int = Field(description="The index of the pre-assigned profile from the prompt (1 to N)")
    name: str
    background: str
    motivations: List[str]
    pain_points: List[str]
    communication_style: str
    demographic_details: DemographicDetails
    physical_description: str


class SimulatedPerson(BaseModel):

    """Individual simulated person for interviews."""

    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    age: int
    background: str
    motivations: List[str]
    pain_points: List[str]
    communication_style: str
    stakeholder_type: str
    demographic_details: DemographicDetails
    grounding_company: Optional[str] = None
    grounding_company_id: Optional[str] = None
    grounding_sources: Optional[List[str]] = None
    # Avatar generation fields
    physical_description: Optional[str] = None  # e.g. "a focused woman in her 40s with short dark hair, wearing a grey blazer"
    avatar_data_url: Optional[str] = None       # base64 "data:image/png;base64,..." populated by PinImageService

    # Context-Grounding Layers
    ocean_profile: Optional[OCEANProfile] = None
    cognitive_grounding: Optional[CognitiveGrounding] = None
    tool_profile: Optional[ToolProfile] = None


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
    """
    Request payload for executing qualitative simulations.
    Supports Top-Down Simulation (Pipeline B) and the Closed-Loop Hybrid (A+B) Pipeline.
    """

    questions_data: Optional[QuestionsData] = None
    business_context: Optional[BusinessContext] = None
    raw_questionnaire_content: Optional[str] = None
    config: SimulationConfig
    callback_url: Optional[str] = Field(
        None,
        description="Optional Webhook HTTP/S URL. If provided, progress updates and completed results will be POSTed back in real-time."
    )


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
    empirical_personas: Optional[List[Dict[str, Any]]] = None

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

    @completed_personas.setter
    def completed_personas(self, value: int):
        self.completed_people = value

    @property
    def total_personas(self) -> int:
        return self.total_people

    @total_personas.setter
    def total_personas(self, value: int):
        self.total_people = value


class CompanyDiscoveryItem(BaseModel):
    """Details of a discovered local business."""
    id: str
    name: str
    industry: str
    size: str
    location: str
    latitude: float
    longitude: float
    decision_makers: List[str]
    estimated_pain_points: List[str]
    insights: Optional[str] = None
    website: Optional[str] = None
    contact_phone: Optional[str] = None
    # New grounding fields
    linkedin_url: Optional[str] = None
    xing_url: Optional[str] = None
    email: Optional[str] = None
    register_court: Optional[str] = None
    register_number: Optional[str] = None
    legal_form: Optional[str] = None
    purpose: Optional[str] = None
    pain_point_sources: Optional[List[str]] = None
    pain_point_sentences: Optional[List[str]] = None
    decision_maker_details: Optional[List[Dict[str, str]]] = None



class RegionalWorkflowRequest(BaseModel):
    """Request payload to trigger the full regional geolocated workflow."""
    location: str
    business_problem: str
    target_user: str
    data_source: Optional[str] = "hybrid"
    companies: Optional[List[CompanyDiscoveryItem]] = None



class RegionalWorkflowResponse(BaseModel):
    """E2E workflow outcome containing discovered companies, generated personas, simulated interviews, and aggregated insights."""
    success: bool
    message: str
    simulation_id: Optional[str] = None
    companies: List[CompanyDiscoveryItem]
    business_context: BusinessContext
    stakeholders: List[Stakeholder]
    people: List[SimulatedPerson]
    interviews: List[SimulatedInterview]
    insights: SimulationInsights


class PersonaChatRequest(BaseModel):
    """Request payload for real-time persona conversation."""
    persona_id: str
    message: str
    simulation_id: Optional[str] = None
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    business_context: Optional[BusinessContext] = None


class PersonaChatResponse(BaseModel):
    """Response containing the persona's message and their simulated cognitive reasoning trace."""
    persona_response: str
    cognitive_steps: List[str]

