"""
Pydantic models for PRECALL API request/response schemas.

These models define the data contracts for:
- ProspectData (input): Company and stakeholder information
- CallIntelligence (output): AI-generated intelligence for calls
- Coaching request/response for real-time guidance
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# ============================================================================
# Input Models - ProspectData (Flexible JSON)
# ============================================================================

# ProspectData is now a flexible Dict[str, Any] - the AI will interpret any JSON structure
# This allows users to paste AxPersona output, CRM data, meeting notes, or any structured info
ProspectData = Dict[str, Any]


# ============================================================================
# Output Models - CallIntelligence
# ============================================================================

class KeyInsight(BaseModel):
    """A single key insight for the call."""
    title: str = Field(..., description="Brief insight title")
    description: str = Field(..., description="Detailed explanation")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    source: str = Field(default="", description="Source of this insight")


class TimeAllocationItem(BaseModel):
    """A single time allocation entry for call planning."""
    phase: str = Field(..., description="Call phase name: discovery, presentation, discussion, close")
    percentage: int = Field(..., description="Percentage of call time to allocate", ge=0, le=100)


class CallGuide(BaseModel):
    """Structured guide for conducting the call."""
    opening_line: str = Field(..., description="Suggested opening statement")
    discovery_questions: List[str] = Field(
        default_factory=list,
        description="Questions to ask during discovery"
    )
    value_proposition: str = Field(
        default="",
        description="Tailored value proposition"
    )
    closing_strategy: str = Field(
        default="",
        description="Recommended closing approach"
    )
    time_allocation: List[TimeAllocationItem] = Field(
        default_factory=lambda: [
            TimeAllocationItem(phase="discovery", percentage=40),
            TimeAllocationItem(phase="presentation", percentage=30),
            TimeAllocationItem(phase="discussion", percentage=20),
            TimeAllocationItem(phase="close", percentage=10),
        ],
        description="Suggested time allocation as list of phase/percentage pairs"
    )


class PersonaDetail(BaseModel):
    """Detailed profile for a stakeholder persona."""
    name: str = Field(..., description="Stakeholder name")
    role: str = Field(..., description="Role/title")
    communication_style: str = Field(default="", description="Preferred communication style")
    likely_questions: List[str] = Field(
        default_factory=list,
        description="Questions this person might ask"
    )
    engagement_tips: List[str] = Field(
        default_factory=list,
        description="Tips for engaging this stakeholder"
    )
    decision_factors: List[str] = Field(
        default_factory=list,
        description="Factors that influence their decisions"
    )


class ObjectionDetail(BaseModel):
    """Potential objection with prepared responses."""
    objection: str = Field(..., description="The likely objection")
    likelihood: str = Field(default="medium", description="Likelihood: high, medium, low")
    rebuttal: str = Field(..., description="Prepared rebuttal/response")
    hook: str = Field(default="", description="Conversation hook to address proactively")
    supporting_evidence: List[str] = Field(
        default_factory=list,
        description="Evidence to support the rebuttal"
    )


class LocalBondingInsight(BaseModel):
    """A single local bonding insight for ice-breakers."""
    category: str = Field(..., description="Category: Transportation, Sports, Local News, Culture, Food & Drink, etc.")
    hook: str = Field(..., description="The conversation starter/hook")
    context: str = Field(..., description="Why this is relevant or interesting")
    tip: str = Field(..., description="How to use this in conversation")


class LocalIntelligence(BaseModel):
    """Location-based intelligence for building rapport."""
    location: str = Field(..., description="City, region, country identified from prospect data")
    cultural_notes: List[str] = Field(
        default_factory=list,
        description="General cultural observations about doing business in this location"
    )
    bonding_hooks: List[LocalBondingInsight] = Field(
        default_factory=list,
        description="Specific ice-breakers based on local knowledge"
    )
    current_events: List[str] = Field(
        default_factory=list,
        description="Recent news/events relevant to the area (as of AI knowledge cutoff)"
    )
    conversation_starters: List[str] = Field(
        default_factory=list,
        description="Ready-to-use opening lines incorporating local context"
    )


class CallIntelligence(BaseModel):
    """
    Complete call intelligence output from the AI.
    This is the structured response from the intelligence generation agent.
    """
    keyInsights: List[KeyInsight] = Field(
        default_factory=list,
        description="Top insights for the call (max 5)"
    )
    callGuide: CallGuide = Field(
        default_factory=CallGuide,
        description="Structured call guide"
    )
    personas: List[PersonaDetail] = Field(
        default_factory=list,
        description="Detailed profiles for each stakeholder"
    )
    objections: List[ObjectionDetail] = Field(
        default_factory=list,
        description="Potential objections with rebuttals"
    )
    summary: str = Field(
        default="",
        description="Executive summary of the call strategy"
    )
    localIntelligence: Optional[LocalIntelligence] = Field(
        default=None,
        description="Location-based bonding insights for ice-breakers"
    )


# ============================================================================
# API Request/Response Models
# ============================================================================

class GenerateIntelligenceRequest(BaseModel):
    """Request model for intelligence generation endpoint."""
    prospect_data: ProspectData = Field(..., description="Flexible JSON with prospect/company data")


class GenerateIntelligenceResponse(BaseModel):
    """Response model for intelligence generation endpoint."""
    success: bool = True
    intelligence: Optional[CallIntelligence] = None
    error: Optional[str] = None
    processing_time_ms: Optional[int] = None


# ============================================================================
# Coaching Chat Models
# ============================================================================

class ChatMessage(BaseModel):
    """A single message in the coaching chat history."""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class CoachingRequest(BaseModel):
    """Request model for coaching chat endpoint."""
    question: str = Field(..., description="User's coaching question")
    prospect_data: ProspectData = Field(..., description="Flexible JSON with prospect/company data")
    intelligence: Optional[CallIntelligence] = Field(
        default=None,
        description="Previously generated intelligence for context"
    )
    chat_history: List[ChatMessage] = Field(
        default_factory=list,
        description="Previous chat messages for context"
    )
    view_context: Optional[str] = Field(
        default=None,
        description="Context about what the user is currently viewing (tab, section)"
    )


class CoachingResponse(BaseModel):
    """Response model for coaching chat endpoint."""
    success: bool = True
    response: str = Field(default="", description="Coaching response")
    suggestions: List[str] = Field(
        default_factory=list,
        description="Follow-up question suggestions"
    )
    error: Optional[str] = None

