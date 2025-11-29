"""
PydanticAI agents for PRECALL intelligence generation and coaching.

Uses PydanticAI Agent with typed output_type for structured responses,
following the same patterns as ConversationalAnalysisAgent.

FLEXIBLE INPUT: Accepts any JSON structure (AxPersona output, CRM data, meeting notes, etc.)
and intelligently extracts relevant prospect information for call preparation.
"""

import json
import logging
import os
from typing import Optional, Dict, Any

from pydantic_ai import Agent, ModelSettings
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider

from backend.api.precall.models import (
    CallIntelligence,
    ProspectData,
    ChatMessage,
)

logger = logging.getLogger(__name__)

# Default model for PRECALL agents
DEFAULT_MODEL = "gemini-2.5-flash"


def get_gemini_model() -> GeminiModel:
    """Get a configured GeminiModel instance using GoogleGLAProvider."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set")

    provider = GoogleGLAProvider(api_key=api_key)
    return GeminiModel(DEFAULT_MODEL, provider=provider)


# ============================================================================
# Intelligence Generation Agent
# ============================================================================

INTELLIGENCE_SYSTEM_PROMPT = """You are an expert sales intelligence analyst specializing in pre-call preparation.

Your task is to analyze ANY prospect data (in any JSON format) and generate comprehensive call intelligence.

INPUT DATA FLEXIBILITY:
You will receive JSON data that could be:
- AxPersona output with personas, interviews, key_themes, and evidence quotes
- CRM exports with company profiles and contact information
- Meeting notes or call transcripts
- Research reports or company profiles
- Any combination of the above

Your job is to EXTRACT and INTERPRET the relevant information:
- Company/organization context
- Key stakeholders/personas (names, roles, concerns, quotes)
- Pain points, challenges, frustrations
- Goals, motivations, desired outcomes
- Previous interactions or history
- Key themes and patterns
- LOCATION: Identify where the company/stakeholders are located (city, region, country)

ANALYSIS APPROACH:
1. First, understand the structure of the input data
2. Extract company context, industry challenges, and key stakeholders
3. Identify persona archetypes and their specific concerns from evidence/quotes
4. Synthesize pain points and challenges into actionable insights
5. Generate call strategy based on the extracted intelligence
6. IDENTIFY LOCATION and generate LOCAL BONDING INSIGHTS

OUTPUT REQUIREMENTS:
- keyInsights: Maximum 5 high-priority insights with clear title, description, priority (high/medium/low), and source (cite evidence from input)
- callGuide: Practical opening line referencing their specific situation, 4-6 discovery questions based on their challenges, tailored value proposition, closing strategy
- personas: For each identified stakeholder/persona - communication style, likely questions (3-5), engagement tips, decision factors
- objections: 3-5 likely objections extracted from concerns/frustrations with rebuttals, hooks, and supporting evidence
- summary: 2-3 sentence executive summary of the recommended call strategy
- localIntelligence: Location identification ONLY (see below)

LOCAL INTELLIGENCE REQUIREMENTS (localIntelligence):
Identify the location from company address, city mentions, or regional context.
ONLY provide:
- location: The identified city/region/country (e.g., "Berlin, Germany" or "Munich, Bavaria, Germany")
- cultural_notes: 2-3 BUSINESS ETIQUETTE notes ONLY - things like punctuality expectations, meeting culture, communication style (NOT generic tourism info)
- bonding_hooks: Leave EMPTY array [] - real-time news will be fetched separately via Google Search
- current_events: Leave EMPTY array [] - real-time news will be fetched separately via Google Search
- conversation_starters: Leave EMPTY array [] - will be generated from real news

DO NOT generate generic content like "Deutsche Bahn delays" or "FC Bayern performance" without specific facts.
Real news with actual match scores, dates, and sources will be fetched via a separate Google Search API call.

QUALITY STANDARDS:
- Quote specific evidence from the input data when possible
- Be specific to their industry, challenges, and stakeholders
- Questions should probe deeper into stated pain points
- Rebuttals should directly address their documented concerns
- All advice should be actionable within a single call
- Local insights should feel AUTHENTIC and SPECIFIC - avoid generic observations
- Use your knowledge of local culture, current events, and regional characteristics
"""


class IntelligenceAgent:
    """
    PydanticAI agent for generating call intelligence from any JSON data.
    Returns structured CallIntelligence with typed output.
    Accepts flexible input formats (AxPersona, CRM, meeting notes, etc.)
    """

    def __init__(self, model: Optional[GeminiModel] = None):
        self.model = model or get_gemini_model()
        self.agent = Agent(
            model=self.model,
            output_type=CallIntelligence,
            system_prompt=INTELLIGENCE_SYSTEM_PROMPT,
            model_settings=ModelSettings(timeout=120),
        )
        logger.info("IntelligenceAgent initialized")

    async def generate(self, prospect_data: ProspectData) -> CallIntelligence:
        """
        Generate call intelligence from any JSON prospect data.

        Args:
            prospect_data: Dict containing any structured prospect info

        Returns:
            CallIntelligence with structured insights, guide, personas, objections
        """
        # Format prospect data into a detailed prompt
        prompt = self._format_prospect_prompt(prospect_data)

        # Try to extract a name for logging
        data_name = self._extract_name(prospect_data)
        logger.info(f"Generating intelligence for: {data_name}")

        try:
            result = await self.agent.run(prompt)
            intelligence = result.output
            logger.info(
                f"Generated intelligence: {len(intelligence.keyInsights)} insights, "
                f"{len(intelligence.personas)} personas, {len(intelligence.objections)} objections"
            )
            return intelligence
        except Exception as e:
            logger.error(f"Intelligence generation failed: {e}")
            raise

    def _extract_name(self, data: ProspectData) -> str:
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

    def _format_prospect_prompt(self, data: ProspectData) -> str:
        """Format any JSON data into a prompt for the agent to interpret."""
        # Pretty-print the JSON for the AI to parse
        json_str = json.dumps(data, indent=2, default=str)

        return f"""
ANALYZE THE FOLLOWING PROSPECT/RESEARCH DATA:

The data below may be in any format - AxPersona output, CRM data, meeting notes, etc.
Your task is to:
1. Understand the structure and extract relevant information
2. Identify the company/organization context
3. Extract personas, stakeholders, or key contacts
4. Find pain points, challenges, goals, and evidence quotes
5. Generate comprehensive call intelligence based on your analysis

=== RAW DATA START ===
{json_str}
=== RAW DATA END ===

Please analyze this data thoroughly and generate structured call intelligence.
Focus on actionable insights and cite specific evidence from the data when possible.
"""


# ============================================================================
# Coaching Chat Agent
# ============================================================================

COACHING_SYSTEM_PROMPT = """You are an expert sales coach providing real-time guidance for pre-call preparation.

You have access to:
1. The raw prospect/research data (could be any JSON format)
2. Previously generated call intelligence (insights, call guide, personas, objections)
3. The conversation history with the sales professional

YOUR ROLE:
- Answer questions about the prospect, stakeholders, or recommended approach
- Provide tactical advice for specific situations
- Help refine talking points or responses to objections
- Suggest ways to build rapport with specific personas
- Offer alternative approaches if the user disagrees with recommendations
- Reference specific quotes or evidence from the source data when helpful

RESPONSE STYLE:
- Be concise and actionable (2-4 sentences typically)
- Use bullet points for lists
- Reference specific persona/stakeholder names when relevant
- Provide concrete examples and quotes when helpful
- End with a brief follow-up suggestion when appropriate

IMPORTANT:
- Stay focused on the specific call being prepared
- Ground your advice in the actual data and generated intelligence
- If you don't have enough context, ask for clarification
"""


class CoachingAgent:
    """
    PydanticAI agent for real-time coaching chat.
    Provides contextual guidance based on any JSON prospect data and intelligence.
    """

    def __init__(self, model: Optional[GeminiModel] = None):
        self.model = model or get_gemini_model()
        # For coaching, we use plain text output (no structured type)
        self.agent = Agent(
            model=self.model,
            system_prompt=COACHING_SYSTEM_PROMPT,
            model_settings=ModelSettings(timeout=60),
        )
        logger.info("CoachingAgent initialized")

    async def respond(
        self,
        question: str,
        prospect_data: ProspectData,
        intelligence: Optional[CallIntelligence] = None,
        chat_history: Optional[list[ChatMessage]] = None,
        view_context: Optional[str] = None,
    ) -> str:
        """
        Generate a coaching response to the user's question.

        Args:
            question: User's coaching question
            prospect_data: Any JSON dict with prospect data
            intelligence: Previously generated call intelligence
            chat_history: Previous messages in the coaching chat
            view_context: Context about what the user is currently viewing

        Returns:
            Coaching response as a string
        """
        prompt = self._format_coaching_prompt(
            question, prospect_data, intelligence, chat_history, view_context
        )

        logger.info(f"Coaching question: {question[:50]}...")

        try:
            result = await self.agent.run(prompt)
            response = str(result.output)
            logger.info(f"Coaching response generated ({len(response)} chars)")
            return response
        except Exception as e:
            logger.error(f"Coaching response failed: {e}")
            raise

    def _format_coaching_prompt(
        self,
        question: str,
        prospect_data: ProspectData,
        intelligence: Optional[CallIntelligence],
        chat_history: Optional[list[ChatMessage]],
        view_context: Optional[str] = None,
    ) -> str:
        """Format the coaching prompt with full context."""
        # Include raw prospect data as JSON (truncated if very large)
        prospect_json = json.dumps(prospect_data, indent=2, default=str)
        if len(prospect_json) > 3000:
            prospect_json = prospect_json[:3000] + "\n... (truncated)"

        # Format intelligence summary if available
        intel_summary = ""
        if intelligence:
            insights = [f"- {i.title}: {i.description[:80]}..." for i in intelligence.keyInsights[:3]]
            objections = [f"- {o.objection}" for o in intelligence.objections[:3]]
            personas = [f"- {p.name} ({p.role})" for p in intelligence.personas[:5]]
            intel_summary = f"""
GENERATED INTELLIGENCE:
Key Insights:
{chr(10).join(insights) or '  None'}

Personas:
{chr(10).join(personas) or '  None'}

Top Objections:
{chr(10).join(objections) or '  None'}

Opening Line: {intelligence.callGuide.opening_line[:150] if intelligence.callGuide.opening_line else 'Not generated'}
"""

        # Format chat history
        history_text = ""
        if chat_history:
            history_text = "\nPREVIOUS CONVERSATION:\n"
            for msg in chat_history[-5:]:  # Last 5 messages for context
                role = "User" if msg.role == "user" else "Coach"
                history_text += f"{role}: {msg.content}\n"

        # Format view context
        view_context_text = ""
        if view_context:
            view_context_text = f"""
CURRENT VIEW CONTEXT:
{view_context}
(Tailor your response to be most relevant to what the user is currently viewing)
"""

        return f"""
PROSPECT DATA (raw):
{prospect_json}

{intel_summary}
{history_text}
{view_context_text}

USER QUESTION:
{question}

Please provide helpful coaching guidance based on this context.
"""

