import os
import logging
from typing import Any

from pydantic_ai import Agent, PromptedOutput
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

logger = logging.getLogger(__name__)


def initialize_pydantic_ai_agent() -> tuple[Any, bool]:
    """Initialize the SimplifiedPersona PydanticAI agent.

    Returns (agent, available_flag).
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set")

        provider = GoogleProvider(api_key=api_key)
        gemini_model = GoogleModel("gemini-2.5-flash", provider=provider)
        logger.info("[QUALITY] Initialized Gemini 2.5 Flash model for high-quality persona generation")

        # Import here to avoid import cycles
        from backend.models.enhanced_persona_models import SimplifiedPersonaModel

        golden_system_prompt = """You are an expert data extraction agent. Your task is to populate the SimplifiedPersonaModel JSON schema.

**ABSOLUTELY CRITICAL RULES:**

1. For ALL demographic fields (experience_level, industry, location, professional_context, roles, age_range), create objects with ONLY "value" and "evidence" keys.

2. For all other fields (goals_and_motivations, challenges_and_frustrations, key_quotes), create objects with ONLY "value" and "evidence" keys.

3. NEVER create top-level "value" objects or top-level "evidence" lists.

4. NEVER generate Python constructor syntax like "AttributedField(".

Generate ONLY clean JSON matching the schema. No text, explanations, or formatting."""

        agent = Agent(
            model=gemini_model,
            output_type=SimplifiedPersonaModel,
            system_prompt=golden_system_prompt,
        )
        logger.info("[PYDANTIC_AI] SimplifiedPersona agent initialized")
        return agent, True

    except Exception as e:
        logger.error(f"[PYDANTIC_AI] Failed to initialize PydanticAI agent: {e}")
        logger.error("[PYDANTIC_AI] Full error traceback:", exc_info=True)
        return None, False


def initialize_production_persona_agent() -> tuple[Any, bool]:
    """Initialize the ProductionPersona PydanticAI agent.

    Returns (agent, available_flag).
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set")

        provider = GoogleProvider(api_key=api_key)
        gemini_model = GoogleModel("gemini-2.5-flash", provider=provider)
        logger.info("[PRODUCTION_PERSONA] Initialized Gemini 2.5 Flash model")

        from backend.domain.models.production_persona import ProductionPersona

        production_prompt = """You are a persona generation expert. Generate comprehensive user personas based on interview data.

REQUIRED OUTPUT STRUCTURE:
- demographics: Single PersonaTrait with aggregated demographic information
- goals_and_motivations: PersonaTrait with clear goals and evidence
- challenges_and_frustrations: PersonaTrait with pain points and evidence
- key_quotes: PersonaTrait with representative quotes

Each PersonaTrait must have:
- value: Clear, specific description
- confidence: 0.0-1.0 confidence score
- evidence: Array of supporting quotes from source material

Generate ONLY valid JSON matching the ProductionPersona schema.
"""
        agent = Agent(
            model=gemini_model,
            output_type=PromptedOutput(
                ProductionPersona,
                name="ProductionPersona",
                description="Generate a production-ready persona in the final format",
                template='Generate valid JSON matching this exact schema: {schema}\n\nCRITICAL: Generate the final persona structure directly. Each trait must have "value", "confidence", and "evidence" fields.',
            ),
            system_prompt=production_prompt,
        )
        logger.info("[PRODUCTION_PERSONA] Production persona agent initialized")
        return agent, True

    except Exception as e:
        logger.error(f"[PRODUCTION_PERSONA] Failed to initialize production persona agent: {e}")
        return None, False


def initialize_direct_persona_agent() -> tuple[Any, bool]:
    """Initialize the DirectPersona PydanticAI agent.

    Returns (agent, available_flag).
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set")

        provider = GoogleProvider(api_key=api_key)
        gemini_model = GoogleModel("gemini-2.5-flash", provider=provider)
        logger.info("[DIRECT_PERSONA] Initialized Gemini 2.5 Flash model")

        from backend.models.enhanced_persona_models import DirectPersona

        agent = Agent(
            model=gemini_model,
            output_type=PromptedOutput(
                DirectPersona,
                name="DirectPersona",
                description="Generate a complete persona directly in the final format",
                template='Generate valid JSON matching this exact schema: {schema}\n\nCRITICAL: Generate the final persona structure directly. Each trait must have "value", "confidence", and "evidence" fields.',
            ),
            system_prompt="""You are an expert persona analyst. Create detailed, authentic personas from interview data.

CRITICAL: Generate ONLY valid JSON that matches the DirectPersona schema. No additional text, explanations, or formatting.
""",
        )
        logger.info("[DIRECT_PERSONA] Direct persona agent initialized")
        return agent, True

    except Exception as e:
        logger.error(f"[DIRECT_PERSONA] Failed to initialize direct persona agent: {e}")
        return None, False

