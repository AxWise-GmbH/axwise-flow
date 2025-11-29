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
    - AI-generated mind map and org chart visualizations

    Returns:
        GenerateIntelligenceResponse with structured CallIntelligence
    """
    import asyncio
    start_time = time.time()

    try:
        # Extract a name for logging from the flexible JSON
        data_name = _extract_name(request.prospect_data)
        logger.info(f"Generating intelligence for: {data_name}")

        agent = get_intelligence_agent()
        intelligence = await agent.generate(request.prospect_data)

        # Generate visualization images in parallel (non-blocking)
        logger.info("Generating visualization images...")
        mind_map_task = generate_mind_map_image(intelligence)
        org_chart_task = generate_org_chart_image(intelligence)

        # Wait for both image generations
        mind_map_result, org_chart_result = await asyncio.gather(
            mind_map_task, org_chart_task, return_exceptions=True
        )

        # Attach images to intelligence if successful
        if isinstance(mind_map_result, str):
            intelligence.mindMapImage = mind_map_result
        elif isinstance(mind_map_result, Exception):
            logger.warning(f"Mind map generation error: {mind_map_result}")

        if isinstance(org_chart_result, str):
            intelligence.orgChartImage = org_chart_result
        elif isinstance(org_chart_result, Exception):
            logger.warning(f"Org chart generation error: {org_chart_result}")

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

        # Generate follow-up suggestions based on the conversation context
        suggestions = await _generate_suggestions(
            request.question, response_text, request.intelligence
        )

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


async def _generate_suggestions(
    question: str,
    response_text: str,
    intelligence: Optional[CallIntelligence],
) -> list[str]:
    """
    Generate contextual follow-up suggestions using AI based on the conversation.

    Uses Gemini to generate relevant follow-up questions based on:
    - The user's question
    - The coaching response
    - The available intelligence data
    """
    try:
        from google import genai
        import os

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return []

        client = genai.Client(api_key=api_key)

        # Build context for suggestion generation
        context_parts = []
        if intelligence:
            if intelligence.personas:
                persona_names = [p.name for p in intelligence.personas[:3]]
                context_parts.append(f"Key stakeholders: {', '.join(persona_names)}")
            if intelligence.objections:
                objection_topics = [o.objection[:50] for o in intelligence.objections[:2]]
                context_parts.append(f"Potential objections: {'; '.join(objection_topics)}")

        context_str = "\n".join(context_parts) if context_parts else "No additional context"

        prompt = f"""Based on this sales coaching conversation, generate exactly 3 brief follow-up questions the user might want to ask next.

USER'S QUESTION: {question}

COACH'S RESPONSE (summary): {response_text[:500]}...

CONTEXT:
{context_str}

Requirements:
- Each question should be 5-12 words max
- Questions should naturally follow from the conversation
- Focus on practical, actionable sales coaching
- Make them specific to the topic discussed
- Do NOT number them or use bullet points

Return ONLY the 3 questions, one per line, nothing else."""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
        )

        # Parse the response into individual suggestions
        if response.text:
            lines = [line.strip() for line in response.text.strip().split('\n') if line.strip()]
            # Clean up any numbering or bullets
            cleaned = []
            for line in lines[:3]:
                # Remove common prefixes like "1.", "- ", "• ", etc.
                cleaned_line = line.lstrip('0123456789.-•) ').strip()
                if cleaned_line and len(cleaned_line) > 5:
                    cleaned.append(cleaned_line)
            return cleaned[:3]

        return []
    except Exception as e:
        logger.warning(f"Failed to generate AI suggestions: {e}")
        return []


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
# Mind Map & Org Chart Image Generation
# ============================================================================

async def generate_mind_map_image(intelligence: CallIntelligence) -> Optional[str]:
    """
    Generate a visual mind map image using Gemini 3 Pro Image Preview.
    Synthesizes all context from the call intelligence into a visual diagram.
    Returns a base64 data URI or None on failure.
    """
    if os.getenv("ENABLE_PRECALL_IMAGES", "true").lower() not in {"1", "true", "yes"}:
        return None

    img_service = GeminiImageService()
    if not img_service.is_available():
        return None

    try:
        # Build comprehensive context from intelligence
        insights = [f"• {i.title}: {i.description}" for i in intelligence.keyInsights[:5]]
        stakeholders = [f"• {p.name} ({p.role}) - {p.role_in_decision}" for p in intelligence.personas[:6]]
        objections = [f"• {o.objection} [{o.likelihood}]" for o in intelligence.objections[:5]]
        questions = intelligence.callGuide.discovery_questions[:5]
        time_alloc = [f"{t.phase}: {t.percentage}%" for t in intelligence.callGuide.time_allocation]

        prompt = f"""Create a professional business mind map infographic with the following structure:

CENTRAL TOPIC: "{intelligence.summary[:100] if intelligence.summary else 'Sales Call Strategy'}"

BRANCHES (create visual branches radiating from center):

1. KEY INSIGHTS (yellow/amber branch):
{chr(10).join(insights) if insights else '• Strategic opportunity identified'}

2. STAKEHOLDERS (blue branch):
{chr(10).join(stakeholders) if stakeholders else '• Key decision makers'}

3. OBJECTIONS (red branch):
{chr(10).join(objections) if objections else '• Potential concerns to address'}

4. VALUE PROPOSITION (green branch):
• {intelligence.callGuide.value_proposition[:150] if intelligence.callGuide.value_proposition else 'Value to be discussed'}

5. DISCOVERY QUESTIONS (purple branch):
{chr(10).join(f'• {q}' for q in questions) if questions else '• Key questions to ask'}

6. CALL FLOW (cyan branch):
{chr(10).join(f'• {t}' for t in time_alloc) if time_alloc else '• Call structure'}

STYLE: Professional business infographic mind map with clean design, clear hierarchy,
rounded rectangular nodes, connecting lines between related concepts, soft pastel colors
for each branch. Modern flat design aesthetic. White or light gray background.
High resolution, suitable for business presentation."""

        logger.info("Generating mind map image...")
        b64_image = img_service.generate_avatar_base64(prompt, temperature=0.7)

        if b64_image:
            data_uri = f"data:image/png;base64,{b64_image}"
            logger.info("Mind map image generated successfully")
            return data_uri
    except Exception as e:
        logger.warning(f"Mind map image generation failed: {e}")

    return None


async def generate_org_chart_image(intelligence: CallIntelligence) -> Optional[str]:
    """
    Generate an organizational chart image using Gemini 3 Pro Image Preview.
    Shows hierarchical structure with reporting relationships and decision roles.
    Returns a base64 data URI or None on failure.
    """
    if os.getenv("ENABLE_PRECALL_IMAGES", "true").lower() not in {"1", "true", "yes"}:
        return None

    img_service = GeminiImageService()
    if not img_service.is_available():
        return None

    try:
        # Organize personas by decision role
        primary = [p for p in intelligence.personas if p.role_in_decision == "primary"]
        secondary = [p for p in intelligence.personas if p.role_in_decision == "secondary"]
        executors = [p for p in intelligence.personas if p.role_in_decision == "executor"]
        blockers = [p for p in intelligence.personas if p.role_in_decision == "blocker"]
        others = [p for p in intelligence.personas if p.role_in_decision not in ["primary", "secondary", "executor", "blocker"]]

        def format_person(p) -> str:
            return f"{p.name} - {p.role}"

        prompt = f"""Create a professional organizational chart infographic showing a corporate hierarchy:

ORGANIZATION STRUCTURE (top to bottom hierarchy):

LEVEL 1 - DECISION MAKERS (Top tier, highlighted with green border):
{chr(10).join(f'[{format_person(p)}]' for p in primary) if primary else '[Primary Decision Maker - TBD]'}

LEVEL 2 - KEY INFLUENCERS (Second tier, blue accent):
{chr(10).join(f'[{format_person(p)}]' for p in secondary) if secondary else '[Key Influencer - TBD]'}

LEVEL 3 - EXECUTORS & BLOCKERS:
EXECUTORS (purple accent):
{chr(10).join(f'[{format_person(p)}]' for p in executors) if executors else '[Executor - TBD]'}

POTENTIAL BLOCKERS (red accent, warning indicator):
{chr(10).join(f'[{format_person(p)}]' for p in blockers) if blockers else '[No blockers identified]'}

LEVEL 4 - OTHER STAKEHOLDERS (gray, supporting):
{chr(10).join(f'[{format_person(p)}]' for p in others) if others else '[Additional stakeholders]'}

VISUAL REQUIREMENTS:
- Classic org chart layout with boxes connected by vertical and horizontal lines
- Clear hierarchical levels from top to bottom
- Each person in a rounded rectangle box with name and role
- Color-coded borders: Green for decision makers, Blue for influencers, Purple for executors, Red for blockers
- Show reporting lines between levels with connecting arrows
- Include a legend showing role types
- Professional business style, clean modern design
- White background, suitable for presentation
- High resolution infographic quality"""

        logger.info("Generating org chart image...")
        b64_image = img_service.generate_avatar_base64(prompt, temperature=0.7)

        if b64_image:
            data_uri = f"data:image/png;base64,{b64_image}"
            logger.info("Org chart image generated successfully")
            return data_uri
    except Exception as e:
        logger.warning(f"Org chart image generation failed: {e}")

    return None


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

