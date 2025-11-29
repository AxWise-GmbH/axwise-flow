"""
PRECALL API Router - Pre-Call Intelligence Dashboard

Provides endpoints for:
- POST /api/precall/v1/generate - Generate call intelligence from prospect data
- POST /api/precall/v1/coach - Get real-time coaching responses
- POST /api/precall/v1/generate-persona-image - Generate persona avatar image
- GET /api/precall/v1/health - Health check

Following the same patterns as axpersona/router.py
"""

import logging
import os
import time
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.api.precall.models import (
    GenerateIntelligenceRequest,
    GenerateIntelligenceResponse,
    CoachingRequest,
    CoachingResponse,
    CallIntelligence,
)
from backend.api.precall.agents import IntelligenceAgent, CoachingAgent
from backend.services.generative.gemini_image_service import GeminiImageService
from backend.services.generative.gemini_search_service import GeminiSearchService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/precall/v1", tags=["PRECALL Intelligence"])

# Lazy-initialized agents (created on first request)
_intelligence_agent: Optional[IntelligenceAgent] = None
_coaching_agent: Optional[CoachingAgent] = None


def get_intelligence_agent() -> IntelligenceAgent:
    """Get or create the intelligence agent singleton."""
    global _intelligence_agent
    if _intelligence_agent is None:
        _intelligence_agent = IntelligenceAgent()
    return _intelligence_agent


def get_coaching_agent() -> CoachingAgent:
    """Get or create the coaching agent singleton."""
    global _coaching_agent
    if _coaching_agent is None:
        _coaching_agent = CoachingAgent()
    return _coaching_agent


@router.get("/health")
async def health_check():
    """Health check endpoint for PRECALL service."""
    return {
        "status": "healthy",
        "service": "precall",
        "version": "1.0.0",
    }


@router.post("/generate", response_model=GenerateIntelligenceResponse)
async def generate_intelligence(
    request: GenerateIntelligenceRequest,
) -> GenerateIntelligenceResponse:
    """
    Generate call intelligence from prospect data.
    
    Takes prospect information (company, stakeholders, pain points) and
    generates comprehensive call intelligence including:
    - Key insights (max 5)
    - Call guide with opening, questions, and closing strategy
    - Stakeholder personas with communication tips
    - Potential objections with prepared rebuttals
    
    Returns:
        GenerateIntelligenceResponse with structured CallIntelligence
    """
    start_time = time.time()

    try:
        # Extract a name for logging from the flexible JSON
        data_name = _extract_name(request.prospect_data)
        logger.info(f"Generating intelligence for: {data_name}")

        agent = get_intelligence_agent()
        intelligence = await agent.generate(request.prospect_data)

        processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"Intelligence generated successfully in {processing_time_ms}ms "
            f"for {data_name}"
        )

        return GenerateIntelligenceResponse(
            success=True,
            intelligence=intelligence,
            processing_time_ms=processing_time_ms,
        )

    except Exception as e:
        logger.error(f"Intelligence generation failed: {str(e)}")
        processing_time_ms = int((time.time() - start_time) * 1000)
        return GenerateIntelligenceResponse(
            success=False,
            error=str(e),
            processing_time_ms=processing_time_ms,
        )


def _extract_name(data: dict) -> str:
    """Extract a display name from flexible JSON for logging."""
    # Try common field names
    for field in ['company_name', 'name', 'scope_name', 'title', 'organization']:
        if field in data:
            return str(data[field])
    # Check nested dataset
    if 'dataset' in data and isinstance(data['dataset'], dict):
        for field in ['scope_name', 'name']:
            if field in data['dataset']:
                return str(data['dataset'][field])
    return "Unknown prospect"


@router.post("/coach", response_model=CoachingResponse)
async def coaching_chat(request: CoachingRequest) -> CoachingResponse:
    """
    Get real-time coaching response for pre-call preparation.

    Provides contextual guidance based on:
    - The user's question
    - Prospect data (company, stakeholders)
    - Previously generated intelligence
    - Chat history for conversation continuity
    - View context (what tab/section the user is viewing)

    Returns:
        CoachingResponse with coaching text and follow-up suggestions
    """
    try:
        logger.info(f"Coaching request: {request.question[:50]}...")
        if request.view_context:
            logger.info(f"View context: {request.view_context[:80]}...")

        agent = get_coaching_agent()
        response_text = await agent.respond(
            question=request.question,
            prospect_data=request.prospect_data,
            intelligence=request.intelligence,
            chat_history=request.chat_history,
            view_context=request.view_context,
        )

        # Generate follow-up suggestions based on the question type
        suggestions = _generate_suggestions(request.question, request.intelligence)

        logger.info(f"Coaching response generated ({len(response_text)} chars)")

        return CoachingResponse(
            success=True,
            response=response_text,
            suggestions=suggestions,
        )

    except Exception as e:
        logger.error(f"Coaching failed: {str(e)}")
        return CoachingResponse(
            success=False,
            response="",
            error=str(e),
        )


def _generate_suggestions(
    question: str,
    intelligence: Optional[CallIntelligence],
) -> list[str]:
    """
    Generate contextual follow-up suggestions based on the question.

    This provides quick-action suggestions for common coaching needs.
    """
    suggestions = []
    question_lower = question.lower()

    # Detect question type and suggest relevant follow-ups
    if any(word in question_lower for word in ["objection", "concern", "push back"]):
        suggestions = [
            "What if they say it's too expensive?",
            "How do I handle a 'not now' response?",
            "What evidence supports our value proposition?",
        ]
    elif any(word in question_lower for word in ["open", "start", "begin", "introduction"]):
        suggestions = [
            "What questions should I ask after the opening?",
            "How do I transition to discovery?",
            "What if they seem disengaged at the start?",
        ]
    elif any(word in question_lower for word in ["stakeholder", "person", "who"]):
        if intelligence and intelligence.personas:
            # Use actual stakeholder names if available
            names = [p.name for p in intelligence.personas[:2]]
            suggestions = [
                f"What motivates {names[0]}?" if names else "What motivates the decision maker?",
                "How do I handle conflicting stakeholder priorities?",
                "Who should I focus on most?",
            ]
        else:
            suggestions = [
                "What motivates the decision maker?",
                "How do I handle conflicting stakeholder priorities?",
                "Who should I focus on most?",
            ]
    elif any(word in question_lower for word in ["close", "next step", "commit"]):
        suggestions = [
            "What if they want to 'think about it'?",
            "How aggressive should my close be?",
            "What's a good fallback commitment?",
        ]
    else:
        # Default suggestions
        suggestions = [
            "What's the most important thing to remember?",
            "What questions should I definitely ask?",
            "What's my backup plan if things go off track?",
        ]

    return suggestions[:3]  # Always return max 3 suggestions


# ============================================================================
# Persona Image Generation
# ============================================================================

class PersonaImageRequest(BaseModel):
    """Request for generating a persona avatar image."""
    persona_name: str = Field(..., description="Name of the persona")
    persona_role: str = Field(..., description="Role/title of the persona")
    communication_style: Optional[str] = Field(None, description="Communication style hint")
    company_context: Optional[str] = Field(None, description="Company/industry context")


class PersonaImageResponse(BaseModel):
    """Response containing generated persona image."""
    success: bool = True
    image_data_uri: Optional[str] = Field(None, description="Base64 data URI of the generated image")
    error: Optional[str] = None


@router.post("/generate-persona-image", response_model=PersonaImageResponse)
async def generate_persona_image(request: PersonaImageRequest) -> PersonaImageResponse:
    """
    Generate an avatar image for a stakeholder persona using Gemini image generation.

    Creates a professional workplace portrait based on persona details.
    Returns a base64 data URI that can be used directly in img src.
    """
    try:
        logger.info(f"Generating persona image for: {request.persona_name} ({request.persona_role})")

        # Check if image generation is enabled
        if os.getenv("ENABLE_PRECALL_IMAGES", "true").lower() not in {"1", "true", "yes"}:
            return PersonaImageResponse(
                success=False,
                error="Persona image generation is disabled"
            )

        # Initialize Gemini image service
        img_service = GeminiImageService()
        if not img_service.is_available():
            return PersonaImageResponse(
                success=False,
                error="Gemini image service not available"
            )

        # Generate unique ID for variation
        unique_id = f"{uuid.uuid4().hex[:8]}-{int(time.time() * 1000)}"

        # Build descriptive prompt for professional portrait
        style_elements = [
            "professional workplace portrait",
            "business casual attire",
            "natural office lighting",
            "confident posture",
            "friendly expression",
        ]

        # Add communication style hints if available
        if request.communication_style:
            style_lower = request.communication_style.lower()
            if "analytical" in style_lower or "data" in style_lower:
                style_elements.append("thoughtful analytical expression")
            elif "direct" in style_lower or "executive" in style_lower:
                style_elements.append("decisive confident demeanor")
            elif "collaborative" in style_lower or "friendly" in style_lower:
                style_elements.append("warm approachable expression")

        # Text prevention instructions
        text_prevention = (
            "NO TEXT of any kind, NO watermarks, NO labels, NO captions, "
            "NO written words, NO overlays, NO graphics, NO logos, "
            "pure photographic portrait only, clean image without any text elements"
        )

        # Build the prompt
        prompt = (
            f"Professional workplace portrait photograph of {request.persona_name}, "
            f"a {request.persona_role}. "
            f"{', '.join(style_elements)}. "
            f"Unique session: {unique_id}. {text_prevention}."
        )

        # Add company context if available
        if request.company_context:
            prompt = prompt.replace(
                "Unique session:",
                f"Industry: {request.company_context[:50]}. Unique session:"
            )

        logger.info(f"Image prompt: {prompt[:100]}...")

        # Generate the image
        b64_image = img_service.generate_avatar_base64(prompt, temperature=0.85)

        if b64_image:
            data_uri = f"data:image/png;base64,{b64_image}"
            logger.info(f"Successfully generated image for {request.persona_name}")
            return PersonaImageResponse(
                success=True,
                image_data_uri=data_uri
            )
        else:
            logger.warning(f"Image generation returned no data for {request.persona_name}")
            return PersonaImageResponse(
                success=False,
                error="Image generation failed - no image data returned"
            )

    except Exception as e:
        logger.error(f"Persona image generation failed: {str(e)}")
        return PersonaImageResponse(
            success=False,
            error=str(e)
        )


# ============================================================================
# Local News Search (Grounded Search)
# ============================================================================

class LocalNewsRequest(BaseModel):
    """Request for searching local news using Gemini Google Search grounding."""
    location: str = Field(..., description="Location to search news for (city, region, country)")
    days_back: int = Field(default=7, ge=1, le=30, description="How many days of news to search (default: 7 days)")
    max_items: int = Field(default=5, ge=1, le=10, description="Maximum news items to return")


class NewsSource(BaseModel):
    """A news source with title and URL."""
    title: str = ""
    url: Optional[str] = None


class NewsItem(BaseModel):
    """A single structured news item."""
    category: str = Field(description="Category: Sports, Transportation, Events, Economic, Weather, Political")
    headline: str = Field(description="Brief headline")
    details: str = Field(description="Full details with specific facts")
    date: Optional[str] = Field(None, description="Date of event if known")
    source_hint: Optional[str] = Field(None, description="Hint about source")


class LocalNewsResponse(BaseModel):
    """Response containing local news search results."""
    success: bool = True
    location: str = ""
    news_items: list[NewsItem] = Field(default_factory=list, description="Structured news items")
    raw_response: Optional[str] = Field(None, description="Raw AI response (fallback)")
    search_queries: list[str] = Field(default_factory=list, description="Search queries used")
    sources: list[NewsSource] = Field(default_factory=list, description="News sources with titles and URLs")
    error: Optional[str] = None


@router.post("/search-local-news", response_model=LocalNewsResponse)
async def search_local_news(request: LocalNewsRequest) -> LocalNewsResponse:
    """
    Search for recent local news using Gemini's Google Search grounding.

    This endpoint uses Gemini 2.5's built-in Google Search tool to fetch
    real-time news and current events for a specific location. The results
    include conversation-worthy topics for building rapport with prospects.

    Returns:
        LocalNewsResponse with news items, current events, and source metadata
    """
    try:
        logger.info(f"Searching local news for: {request.location} (last {request.days_back} days)")

        # Check if search is enabled
        if os.getenv("ENABLE_PRECALL_SEARCH", "true").lower() not in {"1", "true", "yes"}:
            return LocalNewsResponse(
                success=False,
                location=request.location,
                error="Local news search is disabled"
            )

        # Initialize Gemini search service
        search_service = GeminiSearchService()
        if not search_service.is_available():
            return LocalNewsResponse(
                success=False,
                location=request.location,
                error="Gemini search service not available"
            )

        # Perform the search
        result = search_service.search_location_news(
            location=request.location,
            days_back=request.days_back,
            max_items=request.max_items,
        )

        if not result.get("search_performed"):
            return LocalNewsResponse(
                success=False,
                location=request.location,
                error=result.get("error", "Search failed")
            )

        logger.info(
            f"Local news search completed for {request.location}: "
            f"{len(result.get('sources', []))} sources"
        )

        # Convert source dicts to NewsSource objects
        sources = [
            NewsSource(title=s.get("title", ""), url=s.get("url"))
            for s in result.get("sources", [])
        ]

        # Convert news_items dicts to NewsItem objects
        news_items = [
            NewsItem(
                category=item.get("category", "News"),
                headline=item.get("headline", ""),
                details=item.get("details", ""),
                date=item.get("date"),
                source_hint=item.get("source_hint"),
            )
            for item in result.get("news_items", [])
        ]

        return LocalNewsResponse(
            success=True,
            location=result.get("location", request.location),
            news_items=news_items,
            raw_response=result.get("raw_response"),
            search_queries=result.get("search_queries", []),
            sources=sources,
        )

    except Exception as e:
        logger.error(f"Local news search failed: {str(e)}")
        return LocalNewsResponse(
            success=False,
            location=request.location,
            error=str(e)
        )

