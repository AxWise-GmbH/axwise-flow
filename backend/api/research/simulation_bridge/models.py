"""
Pydantic models for the Simulation Bridge system.
"""

from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field
from enum import Enum


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
    personas_per_stakeholder: int = Field(default=2, ge=1, le=5)
    response_style: ResponseStyle = ResponseStyle.REALISTIC
    include_insights: bool = True
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)


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


class AIPersona(BaseModel):
    """Generated AI persona for simulation."""
    id: str
    name: str
    age: int
    background: str
    motivations: List[str]
    pain_points: List[str]
    communication_style: str
    stakeholder_type: str
    demographic_details: Dict[str, Any]


class InterviewResponse(BaseModel):
    """Single interview response."""
    question: str
    response: str
    sentiment: str
    key_insights: List[str]
    follow_up_questions: Optional[List[str]] = None


class SimulatedInterview(BaseModel):
    """Complete simulated interview."""
    persona_id: str
    stakeholder_type: str
    responses: List[InterviewResponse]
    interview_duration_minutes: int
    overall_sentiment: str
    key_themes: List[str]


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
    questions_data: QuestionsData
    business_context: BusinessContext
    config: SimulationConfig


class SimulationResponse(BaseModel):
    """Response from simulation."""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    simulation_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    personas: Optional[List[AIPersona]] = None
    interviews: Optional[List[SimulatedInterview]] = None
    simulation_insights: Optional[SimulationInsights] = None
    recommendations: Optional[List[str]] = None


class SimulationProgress(BaseModel):
    """Progress tracking for simulation."""
    simulation_id: str
    stage: str
    progress_percentage: int
    current_task: str
    estimated_time_remaining: Optional[int] = None
    completed_personas: int = 0
    total_personas: int = 0
    completed_interviews: int = 0
    total_interviews: int = 0
