"""
Persona formation service that orchestrates the persona generation process.

This service coordinates the following steps:
1. Parsing and structuring raw transcripts
2. Extracting attributes from text
3. Building personas from attributes
4. Handling error cases and creating fallback personas
"""

from typing import List, Dict, Any, Optional, Union, Tuple
import asyncio
import json
import logging
import os
import time
from datetime import datetime
import re

# MIGRATION TO PYDANTICAI: Replace Instructor with PydanticAI
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel
from domain.models.persona_schema import Persona as PersonaModel

# Import enhanced JSON parsing (kept for fallback compatibility)
from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair
from backend.services.processing.persona_formation_service_enhanced import (
    parse_llm_json_response_enhanced,
)

# Import our modules
from .transcript_structuring_service import TranscriptStructuringService
from .attribute_extractor import AttributeExtractor
from .persona_builder import PersonaBuilder, persona_to_dict, Persona
from .prompts import PromptGenerator
from .evidence_linking_service import EvidenceLinkingService
from .trait_formatting_service import TraitFormattingService
from backend.utils.content_deduplication import deduplicate_persona_list
from backend.utils.pydantic_ai_retry import (
    safe_pydantic_ai_call,
    get_conservative_retry_config,
)

import re

# Import new validation and highlighting services
from .evidence_validator import EvidenceValidator, ValidationResult
from .keyword_highlighter import ContextAwareKeywordHighlighter


def apply_domain_keywords_to_persona(
    persona: Dict[str, Any], domain_keywords: List[str], persona_name: str
) -> Dict[str, Any]:
    """
    Apply domain-specific keyword highlighting to all evidence in a persona.

    Args:
        persona: Persona dictionary with traits containing evidence
        domain_keywords: List of domain-specific keywords to highlight
        persona_name: Name of the persona for logging

    Returns:
        Updated persona with enhanced keyword highlighting
    """
    logger = logging.getLogger(__name__)

    if not domain_keywords:
        return persona

    # Normalize keywords for matching
    normalized_keywords = [
        kw.lower().strip() for kw in domain_keywords if kw and len(kw.strip()) > 2
    ]

    trait_fields = [
        "demographics",
        "goals_and_motivations",
        "challenges_and_frustrations",
        "skills_and_expertise",
        "technology_and_tools",
        "workflow_and_environment",
        "needs_and_expectations",
        "decision_making_process",
        "communication_style",
        "technology_usage",
        "pain_points",
        "key_quotes",
    ]

    updated_count = 0

    for trait_name in trait_fields:
        trait_data = persona.get(trait_name, {})
        if isinstance(trait_data, dict) and "evidence" in trait_data:
            evidence_list = trait_data["evidence"]
            if evidence_list:
                enhanced_evidence = []
                for quote in evidence_list:
                    enhanced_quote = apply_domain_highlighting_to_quote(
                        quote, normalized_keywords
                    )
                    enhanced_evidence.append(enhanced_quote)
                    if enhanced_quote != quote:
                        updated_count += 1

                trait_data["evidence"] = enhanced_evidence

    if updated_count > 0:
        logger.info(
            f"[DOMAIN_HIGHLIGHTING] ✅ Enhanced {updated_count} evidence quotes for {persona_name}"
        )
    else:
        logger.warning(
            f"[DOMAIN_HIGHLIGHTING] ⚠️ No evidence enhanced for {persona_name}"
        )

    return persona


def apply_domain_highlighting_to_quote(quote: str, domain_keywords: List[str]) -> str:
    """
    Apply domain-specific highlighting to a single quote.

    Args:
        quote: Evidence quote to enhance
        domain_keywords: List of normalized domain keywords

    Returns:
        Quote with enhanced domain-specific highlighting
    """
    if not quote or not domain_keywords:
        return quote

    # Remove existing highlighting to start fresh
    clean_quote = re.sub(r"\*\*(.*?)\*\*", r"\1", quote)

    # Apply domain-specific highlighting
    enhanced_quote = clean_quote

    # Sort keywords by length (longest first) to avoid partial replacements
    sorted_keywords = sorted(domain_keywords, key=len, reverse=True)

    for keyword in sorted_keywords:
        if len(keyword) > 2:  # Only highlight meaningful keywords
            # Use word boundaries to avoid partial matches
            pattern = r"\b" + re.escape(keyword) + r"\b"
            replacement = f"**{keyword}**"
            enhanced_quote = re.sub(
                pattern, replacement, enhanced_quote, flags=re.IGNORECASE
            )

    return enhanced_quote


def validate_and_regenerate_low_quality_traits(
    personas: List[Dict[str, Any]], evidence_validator
) -> List[Dict[str, Any]]:
    """
    Validate persona traits and regenerate those with low alignment scores.

    Args:
        personas: List of persona dictionaries
        evidence_validator: Evidence validator instance

    Returns:
        Updated personas with improved trait quality
    """
    logger = logging.getLogger(__name__)

    regeneration_count = 0

    for i, persona in enumerate(personas):
        persona_name = persona.get("name", f"Persona {i+1}")

        # Validate evidence for this persona
        validation_results = evidence_validator.validate_persona_evidence(persona)

        traits_to_regenerate = []

        for trait_name, result in validation_results.items():
            # Check for critical quality issues
            if (
                result.semantic_alignment_score < 0.5
                or result.keyword_relevance_score < 0.3
                or not result.is_valid
            ):

                traits_to_regenerate.append(trait_name)
                logger.warning(
                    f"[QUALITY_GATE] ⚠️ {persona_name} - {trait_name} needs regeneration "
                    f"(alignment: {result.semantic_alignment_score:.2f}, "
                    f"keyword: {result.keyword_relevance_score:.2f})"
                )

        # Regenerate problematic traits
        if traits_to_regenerate:
            regeneration_count += len(traits_to_regenerate)
            personas[i] = regenerate_persona_traits(
                persona, traits_to_regenerate, persona_name
            )

    if regeneration_count > 0:
        logger.info(
            f"[QUALITY_GATE] ✅ Regenerated {regeneration_count} low-quality traits"
        )
    else:
        logger.info("[QUALITY_GATE] ✅ All traits passed quality validation")

    return personas


def regenerate_persona_traits(
    persona: Dict[str, Any], traits_to_regenerate: List[str], persona_name: str
) -> Dict[str, Any]:
    """
    Regenerate specific persona traits with improved evidence alignment.

    Args:
        persona: Persona dictionary
        traits_to_regenerate: List of trait names to regenerate
        persona_name: Name of the persona for logging

    Returns:
        Updated persona with regenerated traits
    """
    logger = logging.getLogger(__name__)

    for trait_name in traits_to_regenerate:
        trait_data = persona.get(trait_name, {})

        if isinstance(trait_data, dict):
            # Generate more evidence-focused description
            evidence_list = trait_data.get("evidence", [])

            if evidence_list:
                # Create evidence-based description
                evidence_summary = " ".join(
                    evidence_list[:3]
                )  # Use first 3 pieces of evidence

                # Generate improved description based on evidence
                improved_description = generate_evidence_based_description(
                    trait_name, evidence_summary, persona_name
                )

                if improved_description and improved_description != trait_data.get(
                    "description", ""
                ):
                    trait_data["description"] = improved_description
                    logger.info(
                        f"[TRAIT_REGENERATION] ✅ Improved {trait_name} for {persona_name}"
                    )
                else:
                    # Fallback: Mark as insufficient evidence
                    trait_data["description"] = (
                        f"Insufficient evidence available for {trait_name.replace('_', ' ')}"
                    )
                    logger.warning(
                        f"[TRAIT_REGENERATION] ⚠️ Insufficient evidence for {trait_name} in {persona_name}"
                    )
            else:
                # No evidence available
                trait_data["description"] = (
                    f"No evidence available for {trait_name.replace('_', ' ')}"
                )
                logger.warning(
                    f"[TRAIT_REGENERATION] ⚠️ No evidence for {trait_name} in {persona_name}"
                )

    return persona


def generate_evidence_based_description(
    trait_name: str, evidence_text: str, persona_name: str
) -> str:
    """
    Generate a trait description that closely aligns with available evidence.

    Args:
        trait_name: Name of the trait
        evidence_text: Available evidence text
        persona_name: Name of the persona

    Returns:
        Evidence-based trait description
    """
    if not evidence_text or len(evidence_text.strip()) < 20:
        return ""

    # Simple evidence-based description generation
    # Extract key themes from evidence
    evidence_lower = evidence_text.lower()

    # Common patterns for different traits
    if trait_name == "demographics":
        if any(
            term in evidence_lower for term in ["work", "job", "company", "business"]
        ):
            return "Professional working in a business environment"
        elif any(
            term in evidence_lower
            for term in ["student", "school", "university", "college"]
        ):
            return "Student or academic professional"
        else:
            return "Individual with varied background and experience"

    elif trait_name == "goals_and_motivations":
        if any(
            term in evidence_lower for term in ["want", "need", "goal", "hope", "aim"]
        ):
            return "Focused on achieving specific objectives and meeting personal needs"
        else:
            return "Motivated by practical outcomes and problem-solving"

    elif trait_name == "challenges_and_frustrations":
        if any(
            term in evidence_lower
            for term in ["problem", "issue", "difficult", "hard", "frustrating"]
        ):
            return "Faces specific challenges that impact daily activities"
        else:
            return "Encounters occasional obstacles in workflow"

    else:
        # Generic evidence-based description
        return f"Demonstrates specific patterns and behaviors related to {trait_name.replace('_', ' ')}"


# Import LLM interface
try:
    # Try to import from backend structure
    from backend.domain.interfaces.llm_unified import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from domain.interfaces.llm_unified import ILLMService
    except ImportError:
        # Create a minimal interface if both fail
        logger = logging.getLogger(__name__)
        logger.warning(
            "Could not import ILLMService interface, using minimal definition"
        )

        class ILLMService:
            """Minimal LLM service interface"""

            async def generate_response(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")


# Add error handling for event imports
try:
    from backend.infrastructure.events.event_manager import event_manager, EventType

    logger = logging.getLogger(__name__)
    logger.info(
        "Successfully imported event_manager from backend.infrastructure.events"
    )
except ImportError:
    try:
        from infrastructure.events.event_manager import event_manager, EventType

        logger = logging.getLogger(__name__)
        logger.info("Successfully imported event_manager from infrastructure.events")
    except ImportError:
        # Use the fallback events implementation
        try:
            from backend.infrastructure.state.events import event_manager, EventType

            logger = logging.getLogger(__name__)
            logger.info(
                "Using fallback event_manager from backend.infrastructure.state.events"
            )
        except ImportError:
            try:
                from infrastructure.state.events import event_manager, EventType

                logger = logging.getLogger(__name__)
                logger.info(
                    "Using fallback event_manager from infrastructure.state.events"
                )
            except ImportError:
                # Create minimal event system if all imports fail
                logger = logging.getLogger(__name__)
                logger.error(
                    "Failed to import events system, using minimal event logging"
                )
                from enum import Enum

                class EventType(Enum):
                    """Minimal event types for error handling"""

                    PROCESSING_STATUS = "PROCESSING_STATUS"
                    PROCESSING_ERROR = "PROCESSING_ERROR"
                    PROCESSING_STEP = "PROCESSING_STEP"
                    PROCESSING_COMPLETED = "PROCESSING_COMPLETED"

                class MinimalEventManager:
                    """Minimal event manager for logging only"""

                    async def emit(self, event_type, payload=None):
                        logger.info(f"Event: {event_type}, Payload: {payload}")

                    async def emit_error(self, error, context=None):
                        logger.error(f"Error: {str(error)}, Context: {context}")

                event_manager = MinimalEventManager()

# Configure logging
logger = logging.getLogger(__name__)


class PersonaFormationService:
    """
    Service for forming personas from analysis patterns or raw text.

    This service orchestrates the entire persona formation process, delegating
    specific tasks to specialized modules.
    """

    def __init__(self, config=None, llm_service: ILLMService = None):
        """
        Initialize the persona formation service.

        Args:
            config: System configuration object (optional, will create minimal config if None)
            llm_service: Initialized LLM service
        """
        # Handle flexible constructor for backward compatibility
        if config is None and llm_service is None:
            raise ValueError("At least llm_service must be provided")

        # If only one argument is provided, assume it's llm_service
        if config is not None and llm_service is None and hasattr(config, "analyze"):
            llm_service = config
            config = None

        # Create minimal config if not provided
        if config is None:

            class MinimalConfig:
                class Validation:
                    min_confidence = 0.4

                validation = Validation()

            config = MinimalConfig()

        self.config = config
        self.llm_service = llm_service
        self.min_confidence = getattr(config.validation, "min_confidence", 0.4)
        self.validation_threshold = self.min_confidence

        # Initialize our helper modules
        self.transcript_structuring_service = TranscriptStructuringService(llm_service)
        self.attribute_extractor = AttributeExtractor(llm_service)
        self.persona_builder = PersonaBuilder()
        self.prompt_generator = PromptGenerator()

        # Initialize our new services
        self.evidence_linking_service = EvidenceLinkingService(llm_service)
        self.trait_formatting_service = TraitFormattingService(llm_service)

        # MIGRATION TO PYDANTICAI: Initialize PydanticAI agent for persona generation
        self._initialize_pydantic_ai_agent()

        # No longer using TranscriptProcessor - all functionality is now in TranscriptStructuringService
        logger.info("Using TranscriptStructuringService for transcript processing")
        logger.info("Using EvidenceLinkingService for enhanced evidence linking")
        logger.info("Using TraitFormattingService for improved trait value formatting")
        logger.info(
            "Using PydanticAI for structured persona outputs (migrated from Instructor)"
        )

        logger.info(
            f"Initialized PersonaFormationService with {llm_service.__class__.__name__}"
        )

    def _initialize_pydantic_ai_agent(self):
        """
        MIGRATION TO PYDANTICAI: Initialize PydanticAI agent for persona generation.

        This replaces the Instructor-based approach with a modern PydanticAI agent
        while maintaining the same high-quality persona generation capabilities.
        """
        try:
            # Get API key from environment (PydanticAI v0.4.3 compatibility)
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError(
                    "Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set"
                )

            # QUALITY OPTIMIZATION: Use full Gemini 2.5 Flash for high-quality persona generation
            # Full Flash model provides better quality and detail for persona formation
            from pydantic_ai.providers.google_gla import GoogleGLAProvider

            provider = GoogleGLAProvider(api_key=api_key)
            gemini_model = GeminiModel("gemini-2.5-flash", provider=provider)
            logger.info(
                "[QUALITY] Initialized Gemini 2.5 Flash model for high-quality persona generation"
            )

            # Import simplified model for PydanticAI
            from backend.domain.models.persona_schema import SimplifiedPersonaModel

            # Create persona generation agent with simplified schema for reliability
            self.persona_agent = Agent(
                model=gemini_model,
                output_type=SimplifiedPersonaModel,  # Use simplified schema to avoid MALFORMED_FUNCTION_CALL
                system_prompt="""You are an expert persona analyst. Create detailed, authentic personas from interview data.

TASK: Analyze the provided content and create a comprehensive persona using the SimplifiedPersona format.

PERSONA STRUCTURE:
- name: Descriptive persona name (e.g., "Alex, The Strategic Optimizer")
- description: Brief persona overview summarizing key characteristics
- archetype: General persona category (e.g., "Tech-Savvy Strategist")

TRAIT FIELDS (as detailed strings):
- demographics: Age, background, experience level, location, industry details
- goals_motivations: What drives this person, their primary objectives
- challenges_frustrations: Specific challenges and obstacles they face
- skills_expertise: Professional skills, competencies, areas of knowledge
- technology_tools: Technology usage patterns, tools used, tech relationship
- pain_points: Specific problems and issues they experience regularly
- workflow_environment: Work environment, workflow preferences, collaboration style
- needs_expectations: What they need from solutions and their expectations
- key_quotes: 3-5 actual quotes from the interview that represent their voice

STRUCTURED DEMOGRAPHICS (CRITICAL):
You MUST populate the structured_demographics field with AttributedField format where each demographic component has its own specific evidence:

structured_demographics: {
  "experience_level": {
    "value": "Senior/Mid-level/Junior/Executive/etc. - ONLY if explicitly mentioned",
    "evidence": ["Exact quote that specifically mentions experience level, years of experience, or seniority"]
  },
  "industry": {
    "value": "Industry Name - ONLY if explicitly mentioned",
    "evidence": ["Exact quote that specifically mentions the industry, company type, or business sector"]
  },
  "location": {
    "value": "City/Region - ONLY if explicitly stated",
    "evidence": ["Exact quote that specifically mentions geographic location, city, region, or place"]
  },
  "age_range": {
    "value": "Age range - ONLY if directly mentioned",
    "evidence": ["Exact quote that specifically mentions age, age range, or life stage"]
  },
  "professional_context": {
    "value": "Detailed professional background and company context based on explicit information",
    "evidence": ["Exact quote that specifically describes their professional context, company, or role"]
  },
  "roles": {
    "value": "Primary professional roles - ONLY if explicitly stated",
    "evidence": ["Exact quote that specifically mentions their job title, role, or position"]
  },
  "confidence": 0.85
}

STRUCTURED DEMOGRAPHICS RULES:
1. Each field's evidence array should contain quotes that specifically support ONLY that demographic aspect
2. Do not reuse the same quote across multiple fields unless it truly supports multiple specific claims
3. Only include fields if you can find explicit evidence in the text
4. Prioritize precision over completeness - better fewer fields with perfect evidence than many with weak evidence
5. Each evidence quote must directly and specifically support the value it's paired with

CONFIDENCE SCORES:
Set confidence scores (0.0-1.0) for each trait based on evidence strength:
- overall_confidence: Overall confidence in the persona
- demographics_confidence, goals_confidence, etc.: Individual trait confidence

CRITICAL RULES:
1. Use specific details from the transcript, never generic placeholders
2. Extract real quotes for key_quotes field
3. Set confidence scores based on evidence strength
4. Make personas feel like real, specific people with authentic details
5. Focus on creating rich, detailed content for each trait field
6. ALWAYS populate structured_demographics with proper AttributedField format

OUTPUT: Complete SimplifiedPersona object with all fields populated using actual evidence.""",
            )

            logger.info(
                "[PYDANTIC_AI] Successfully initialized persona generation agent"
            )
            self.pydantic_ai_available = True

        except Exception as e:
            logger.error(f"[PYDANTIC_AI] Failed to initialize PydanticAI agent: {e}")
            logger.error("[PYDANTIC_AI] Full error traceback:", exc_info=True)

            # Check specific error types for better debugging
            error_str = str(e).lower()
            if "import" in error_str or "module" in error_str:
                logger.error(
                    "[PYDANTIC_AI] Import error - check if pydantic-ai is installed"
                )
            elif "api" in error_str or "key" in error_str:
                logger.error(
                    "[PYDANTIC_AI] API key error - check Gemini API configuration"
                )
            elif "model" in error_str:
                logger.error(
                    "[PYDANTIC_AI] Model error - check if gemini-2.5-flash is available"
                )

            self.persona_agent = None
            self.pydantic_ai_available = False
            logger.warning(
                "[PYDANTIC_AI] Falling back to legacy Instructor-based approach"
            )

    async def form_personas(
        self, patterns: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Form personas from identified patterns.

        Args:
            patterns: List of identified patterns from analysis
            context: Optional additional context

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Forming personas from {len(patterns)} patterns")

            # Skip if no patterns
            if not patterns or len(patterns) == 0:
                logger.warning("No patterns provided for persona formation")
                return []

            # Group patterns by similarity
            grouped_patterns = self._group_patterns(patterns)
            logger.info(
                f"Grouped patterns into {len(grouped_patterns)} potential personas"
            )

            # Form a persona from each group
            personas = []

            for i, group in enumerate(grouped_patterns):
                try:
                    # Convert the group to a persona
                    attributes = await self._analyze_patterns_for_persona(group)
                    logger.debug(
                        f"[form_personas] Attributes received from LLM for group {i}: {attributes}"
                    )

                    if (
                        attributes
                        and isinstance(attributes, dict)
                        and attributes.get("confidence", 0) >= self.validation_threshold
                    ):
                        try:
                            # Build persona from attributes
                            persona = (
                                self.persona_builder.build_persona_from_attributes(
                                    attributes
                                )
                            )
                            personas.append(persona)
                            logger.info(
                                f"Created persona: {persona.name} with confidence {persona.confidence}"
                            )
                        except Exception as persona_creation_error:
                            logger.error(
                                f"Error creating Persona object for group {i}: {persona_creation_error}",
                                exc_info=True,
                            )
                    else:
                        logger.warning(
                            f"Skipping persona creation for group {i} - confidence {attributes.get('confidence', 0)} "
                            f"below threshold {self.validation_threshold} or attributes invalid."
                        )
                except Exception as attr_error:
                    logger.error(
                        f"Error analyzing persona attributes for group {i}: {str(attr_error)}",
                        exc_info=True,
                    )

                # Emit event for tracking
                try:
                    await event_manager.emit(
                        EventType.PROCESSING_STEP,
                        {
                            "stage": "persona_formation",
                            "progress": (i + 1) / len(grouped_patterns),
                            "data": {
                                "personas_found": len(personas),
                                "groups_processed": i + 1,
                            },
                        },
                    )
                except Exception as event_error:
                    logger.warning(
                        f"Could not emit processing step event: {str(event_error)}"
                    )

            # If no personas were created, try to create a default one
            if not personas:
                logger.warning(
                    "No personas created from patterns, creating default persona"
                )
                personas = await self._create_default_persona(context)

            logger.info(f"[form_personas] Returning {len(personas)} personas.")
            # Convert Persona objects to dictionaries before returning
            persona_dicts = [persona_to_dict(p) for p in personas]

            # CONTENT DEDUPLICATION: Remove repetitive patterns from persona content
            logger.info("[form_personas] 🧹 Deduplicating persona content...")
            deduplicated_personas = deduplicate_persona_list(persona_dicts)
            logger.info(f"[form_personas] ✅ Content deduplication completed")

            # QUALITY VALIDATION: Simple pipeline validation with logging
            try:
                self._validate_persona_quality(deduplicated_personas)
            except Exception as validation_error:
                logger.error(
                    f"[QUALITY_VALIDATION] Error in persona validation: {str(validation_error)}",
                    exc_info=True,
                )
                # Don't fail the entire process due to validation errors

            return deduplicated_personas

        except Exception as e:
            logger.error(f"Error creating personas: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(e, {"stage": "persona_formation"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    async def generate_persona_from_text(
        self,
        text: Union[str, List[Dict[str, Any]]],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate persona directly from raw interview text.

        Args:
            text: Raw interview transcript text or structured transcript data
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Generating persona from text of type {type(text)}")

            # Check if text is empty or too short
            if isinstance(text, str) and (not text or len(text.strip()) < 10):
                logger.warning("Text is empty or too short for persona generation")
                # Return a fallback persona
                fallback_persona = self.persona_builder.create_fallback_persona(
                    "Participant"
                )
                return [persona_to_dict(fallback_persona)]
            elif isinstance(text, list) and (not text or len(text) == 0):
                logger.warning("Structured transcript is empty")
                # Return a fallback persona
                fallback_persona = self.persona_builder.create_fallback_persona(
                    "Participant"
                )
                return [persona_to_dict(fallback_persona)]

            # Log the length of the text for debugging
            if isinstance(text, str):
                logger.info(f"Text length: {len(text)} characters")
            elif isinstance(text, list):
                logger.info(f"Structured transcript with {len(text)} entries")

            # Check if text is already a structured transcript
            is_structured_transcript = False
            if isinstance(text, list) and len(text) > 0:
                # Check if it has the expected structure
                if all(
                    isinstance(item, dict) and "speaker" in item and "text" in item
                    for item in text
                ):
                    is_structured_transcript = True
                    logger.info("Input is already a structured transcript")
                    # Log a sample of the structured transcript
                    logger.info(f"Sample entry: {text[0]}")

            # If we have a structured transcript, use it directly
            if is_structured_transcript:
                return await self.form_personas_from_transcript(text, context=context)

            # If we still don't have a structured transcript, check for stakeholder structure first
            if isinstance(text, str) and not is_structured_transcript:
                logger.info(
                    "No structured format detected, checking for stakeholder-aware content structure"
                )

                # STAKEHOLDER-AWARE PERSONA FORMATION: Check if content has stakeholder structure
                try:
                    # Import the stakeholder-aware transcript processor
                    from backend.services.processing.pipeline.stakeholder_aware_transcript_processor import (
                        StakeholderAwareTranscriptProcessor,
                    )

                    # Create a temporary processor instance
                    processor = StakeholderAwareTranscriptProcessor()

                    # Try to parse stakeholder sections
                    stakeholder_segments = processor._parse_stakeholder_sections(text)

                    if stakeholder_segments and len(stakeholder_segments) > 0:
                        logger.info(
                            f"[STAKEHOLDER_PERSONA] Detected {len(stakeholder_segments)} stakeholder categories"
                        )
                        logger.info(
                            f"[STAKEHOLDER_PERSONA] Categories: {list(stakeholder_segments.keys())}"
                        )

                        # Convert to the format expected by form_personas_by_stakeholder
                        formatted_segments = {}
                        for category, interviews in stakeholder_segments.items():
                            # Create mock segments for each interview
                            segments = []
                            for i, interview_text in enumerate(interviews):
                                segments.append(
                                    {
                                        "text": interview_text,
                                        "speaker": f"Interviewee_{i+1}",
                                        "role": "Interviewee",
                                        "stakeholder_category": category,
                                    }
                                )

                            formatted_segments[category] = {
                                "segments": segments,
                                "interview_count": len(interviews),
                                "content_info": {"type": "stakeholder_interview"},
                            }

                        # Use stakeholder-aware persona formation
                        personas_list = await self.form_personas_by_stakeholder(
                            formatted_segments, context=context
                        )
                        logger.info(
                            f"[STAKEHOLDER_PERSONA] Generated {len(personas_list)} stakeholder-aware personas"
                        )
                        return personas_list

                except Exception as e:
                    logger.error(
                        f"[STAKEHOLDER_PERSONA] Error in stakeholder-aware processing: {str(e)}"
                    )
                    # Continue with standard processing

                logger.info(
                    "No stakeholder structure detected, using LLM-powered transcript structuring"
                )

                # Log a sample of the text for debugging
                logger.info(f"Text sample: {text[:200]}...")

                # Use the new TranscriptStructuringService to structure the transcript
                # Pass filename if available in context
                filename = None
                if context and "filename" in context:
                    filename = context.get("filename")
                    logger.info(
                        f"Using filename from context for transcript structuring: {filename}"
                    )

                structured_transcript = (
                    await self.transcript_structuring_service.structure_transcript(
                        text, filename=filename
                    )
                )

                if structured_transcript and len(structured_transcript) > 0:
                    logger.info(
                        f"Successfully structured transcript using LLM: {len(structured_transcript)} segments"
                    )
                    # Log a sample of the structured transcript
                    logger.info(f"Sample segment: {structured_transcript[0]}")
                    return await self.form_personas_from_transcript(
                        structured_transcript, context=context
                    )

            # If LLM structuring fails, we will now rely on robust error handling
            # or return empty/fallback personas rather than using regex.
            logger.warning(
                "LLM-based transcript structuring failed or returned empty. No regex fallback implemented."
            )
            # Consider what to return here: an empty list, a specific error, or a generic fallback persona.
            # For now, let's return an empty list, which will propagate up.
            # A fallback persona could also be generated here if desired.
            # fallback_persona = self.persona_builder.create_fallback_persona("Participant", "Transcript structuring failed")
            # return [persona_to_dict(fallback_persona)]
            return []  # Returning empty list if structuring fails

        except Exception as e:
            logger.error(
                f"Error in generate_persona_from_text: {str(e)}", exc_info=True
            )
            # Consider emitting an error event here if you have an event system
            # from backend.services.event_manager import event_manager
            # try:
            #     await event_manager.emit_error(e, {"stage": "generate_persona_from_text"})
            # except Exception as event_error:
            #     logger.warning(f"Could not emit error event: {str(event_error)}")
            return []  # Return empty list to prevent analysis failure

    async def form_personas_from_transcript(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from a structured transcript with speaker identification.

        PERFORMANCE OPTIMIZATION: Uses parallel processing with semaphore-controlled concurrency
        instead of sequential processing with artificial delays for 6-10x performance improvement.

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        # Use the new parallel implementation
        return await self._form_personas_from_transcript_parallel(
            transcript, participants, context
        )

    async def form_personas_by_stakeholder(
        self,
        stakeholder_segments: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from stakeholder-segmented transcript data.

        This method processes each stakeholder category separately to maintain
        stakeholder boundaries and populate stakeholder_mapping fields.

        Args:
            stakeholder_segments: Dictionary of stakeholder segments from transcript processor
            context: Optional additional context information

        Returns:
            List of persona dictionaries with stakeholder_mapping populated
        """
        try:
            logger.info(
                f"[STAKEHOLDER_PERSONA] Starting stakeholder-aware persona formation"
            )
            logger.info(
                f"[STAKEHOLDER_PERSONA] Processing {len(stakeholder_segments)} stakeholder categories"
            )

            all_personas = []

            for stakeholder_category, segment_data in stakeholder_segments.items():
                logger.info(
                    f"[STAKEHOLDER_PERSONA] Processing stakeholder: {stakeholder_category}"
                )

                # Extract segments for this stakeholder
                segments = segment_data.get("segments", [])
                interview_count = segment_data.get("interview_count", 0)

                if not segments:
                    logger.warning(
                        f"[STAKEHOLDER_PERSONA] No segments found for stakeholder: {stakeholder_category}"
                    )
                    continue

                logger.info(
                    f"[STAKEHOLDER_PERSONA] Generating personas from {len(segments)} segments for {stakeholder_category}"
                )

                # Generate personas for this stakeholder category
                stakeholder_personas = (
                    await self._generate_stakeholder_specific_personas(
                        segments, stakeholder_category, interview_count, context
                    )
                )

                # Add stakeholder mapping to each persona
                for persona in stakeholder_personas:
                    if isinstance(persona, dict):
                        persona["stakeholder_mapping"] = {
                            "stakeholder_category": stakeholder_category,
                            "interview_count": interview_count,
                            "confidence": persona.get("overall_confidence", 0.7),
                            "processing_method": "stakeholder_aware",
                        }
                        logger.info(
                            f"[STAKEHOLDER_PERSONA] Added stakeholder mapping for persona: {persona.get('name', 'Unknown')}"
                        )

                all_personas.extend(stakeholder_personas)
                logger.info(
                    f"[STAKEHOLDER_PERSONA] Generated {len(stakeholder_personas)} personas for {stakeholder_category}"
                )

            logger.info(
                f"[STAKEHOLDER_PERSONA] Total personas generated: {len(all_personas)}"
            )
            return all_personas

        except Exception as e:
            logger.error(
                f"[STAKEHOLDER_PERSONA] Error in stakeholder-aware persona formation: {str(e)}",
                exc_info=True,
            )
            # Fall back to standard processing
            logger.info(
                "[STAKEHOLDER_PERSONA] Falling back to standard persona formation"
            )

            # Flatten all segments for fallback processing
            all_segments = []
            for segment_data in stakeholder_segments.values():
                all_segments.extend(segment_data.get("segments", []))

            return await self.form_personas_from_transcript(
                all_segments, context=context
            )

    async def _generate_stakeholder_specific_personas(
        self,
        segments: List[Dict[str, Any]],
        stakeholder_category: str,
        interview_count: int,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas specifically for a single stakeholder category.

        Args:
            segments: Transcript segments for this stakeholder
            stakeholder_category: Name of the stakeholder category
            interview_count: Number of interviews for this stakeholder
            context: Optional context information

        Returns:
            List of persona dictionaries for this stakeholder
        """
        try:
            logger.info(
                f"[STAKEHOLDER_SPECIFIC] Generating personas for: {stakeholder_category}"
            )
            logger.info(
                f"[STAKEHOLDER_SPECIFIC] Processing {len(segments)} segments from {interview_count} interviews"
            )

            # Combine all text for this stakeholder
            stakeholder_text = ""
            speakers = set()

            for segment in segments:
                if isinstance(segment, dict):
                    text = segment.get("text", "")
                    speaker = segment.get("speaker", "Unknown")
                    speakers.add(speaker)
                    stakeholder_text += f"\n{text}"
                elif hasattr(segment, "text"):
                    text = segment.text
                    speaker = getattr(segment, "speaker", "Unknown")
                    speakers.add(speaker)
                    stakeholder_text += f"\n{text}"

            stakeholder_text = stakeholder_text.strip()

            if not stakeholder_text:
                logger.warning(
                    f"[STAKEHOLDER_SPECIFIC] No text content found for {stakeholder_category}"
                )
                return []

            logger.info(
                f"[STAKEHOLDER_SPECIFIC] Combined text length: {len(stakeholder_text)} chars"
            )
            logger.info(f"[STAKEHOLDER_SPECIFIC] Unique speakers: {len(speakers)}")

            # Create enhanced context with stakeholder information
            enhanced_context = {
                "stakeholder_category": stakeholder_category,
                "interview_count": interview_count,
                "speaker_count": len(speakers),
                **(context or {}),
            }

            # Generate personas using stakeholder-specific approach
            # For now, generate 1 persona per stakeholder category to maintain clear boundaries
            personas = []

            # Use the existing persona generation but with stakeholder context
            persona = await self._generate_single_stakeholder_persona(
                stakeholder_text, stakeholder_category, enhanced_context
            )

            if persona:
                personas.append(persona)
                logger.info(
                    f"[STAKEHOLDER_SPECIFIC] Generated persona for {stakeholder_category}: {persona.get('name', 'Unknown')}"
                )

            return personas

        except Exception as e:
            logger.error(
                f"[STAKEHOLDER_SPECIFIC] Error generating personas for {stakeholder_category}: {str(e)}",
                exc_info=True,
            )
            return []

    async def _generate_single_stakeholder_persona(
        self,
        stakeholder_text: str,
        stakeholder_category: str,
        context: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a single persona for a specific stakeholder category.

        Args:
            stakeholder_text: Combined text content for this stakeholder
            stakeholder_category: Name of the stakeholder category
            context: Context with stakeholder information

        Returns:
            Persona dictionary or None if generation fails
        """
        try:
            logger.info(
                f"[SINGLE_STAKEHOLDER] Generating persona for: {stakeholder_category}"
            )

            # Create stakeholder-specific prompt
            prompt = self.prompt_generator.create_stakeholder_specific_persona_prompt(
                stakeholder_text, stakeholder_category, context
            )

            # Generate persona using PydanticAI
            retry_config = {
                "max_retries": 3,
                "base_delay": 2.0,
                "max_delay": 10.0,
                "exponential_base": 2.0,
            }

            persona_result = await safe_pydantic_ai_call(
                agent=self.persona_agent,
                prompt=prompt,
                context=f"Stakeholder-specific persona generation for {stakeholder_category}",
                retry_config=retry_config,
            )

            if persona_result and hasattr(persona_result, "data"):
                persona_data = persona_result.data

                # Convert to dictionary format
                if hasattr(persona_data, "model_dump"):
                    persona_dict = persona_data.model_dump()
                elif hasattr(persona_data, "dict"):
                    persona_dict = persona_data.dict()
                else:
                    persona_dict = dict(persona_data)

                logger.info(
                    f"[SINGLE_STAKEHOLDER] Successfully generated persona: {persona_dict.get('name', 'Unknown')}"
                )
                return persona_dict
            else:
                logger.warning(
                    f"[SINGLE_STAKEHOLDER] No valid persona result for {stakeholder_category}"
                )
                return None

        except Exception as e:
            logger.error(
                f"[SINGLE_STAKEHOLDER] Error generating persona for {stakeholder_category}: {str(e)}",
                exc_info=True,
            )
            return None

    async def _form_personas_from_transcript_parallel(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        PERFORMANCE OPTIMIZATION: Generate personas using parallel processing with semaphore-controlled concurrency.

        This replaces sequential processing (43 personas × 2-3 minutes = 86-129 minutes) with parallel processing
        using semaphore-controlled concurrency (43 personas ÷ 3 concurrent = ~15 batches × 2-3 minutes = 10-15 minutes)
        for 6-8x performance improvement while maintaining full persona quality.

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(
                f"[PERSONA_FORMATION_DEBUG] Starting PARALLEL persona formation with {len(transcript)} entries"
            )
            start_time = time.time()

            # Log a sample of the transcript for debugging
            if transcript and len(transcript) > 0:
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Sample transcript entry: {transcript[0]}"
                )

            # Validate input
            if not transcript or len(transcript) == 0:
                logger.warning(
                    "[PERSONA_FORMATION_DEBUG] Empty transcript provided, returning empty list"
                )
                return []

            # Consolidate text per speaker and extract roles
            speaker_dialogues = {}
            speaker_roles_map = {}

            # Handle both old and new transcript formats
            for turn in transcript:
                # Extract speaker ID (handle both old and new formats)
                speaker_id = turn.get(
                    "speaker_id", turn.get("speaker", "Unknown Speaker")
                )

                # Extract dialogue/text (handle both old and new formats)
                dialogue = turn.get("dialogue", turn.get("text", ""))

                # Extract role (handle both old and new formats, with fallback to participants if provided)
                role = turn.get("role", "Participant")

                # Initialize speaker entry if not exists
                if speaker_id not in speaker_dialogues:
                    speaker_dialogues[speaker_id] = []
                    speaker_roles_map[speaker_id] = (
                        role  # Store the first inferred role
                    )

                # Add this dialogue to the speaker's collection
                speaker_dialogues[speaker_id].append(dialogue)

            # Consolidate dialogues into a single text per speaker
            speaker_texts = {
                speaker: " ".join(dialogues)
                for speaker, dialogues in speaker_dialogues.items()
            }

            logger.info(f"Consolidated text for {len(speaker_texts)} speakers")

            # Log the speakers and text lengths for debugging
            for speaker, text in speaker_texts.items():
                logger.info(
                    f"Speaker: {speaker}, Role: {speaker_roles_map.get(speaker, 'Unknown')}, Text length: {len(text)} chars"
                )

            # Override with provided participant roles if available
            if participants and isinstance(participants, list):
                for participant in participants:
                    if "name" in participant and "role" in participant:
                        speaker_name = participant["name"]
                        if speaker_name in speaker_roles_map:
                            speaker_roles_map[speaker_name] = participant["role"]
                            logger.info(
                                f"Overriding role for {speaker_name} to {participant['role']}"
                            )

                logger.info(f"Applied {len(participants)} provided participant roles")

            # Generate personas for all speakers using parallel processing
            personas = []

            # Process speakers in order of text length (most text first)
            sorted_speakers = sorted(
                speaker_texts.items(), key=lambda x: len(x[1]), reverse=True
            )

            # PERFORMANCE OPTIMIZATION: Intelligent persona limiting based on content diversity
            MAX_PERSONAS = int(os.getenv("MAX_PERSONAS", "6"))
            if len(sorted_speakers) > MAX_PERSONAS:
                logger.info(
                    f"[PERFORMANCE] Applying intelligent persona clustering: {len(sorted_speakers)} speakers → {MAX_PERSONAS} diverse personas"
                )
                # Keep the speakers with most diverse content (by text length and role diversity)
                sorted_speakers = self._select_diverse_speakers(
                    sorted_speakers, speaker_roles_map, MAX_PERSONAS
                )

            # PERFORMANCE OPTIMIZATION: Use parallel processing with semaphore-controlled concurrency
            logger.info(
                f"[PERFORMANCE] Starting parallel persona generation for {len(sorted_speakers)} speakers..."
            )

            # PAID TIER OPTIMIZATION: Use 12 concurrent LLM calls for maximum performance
            # PERFORMANCE OPTIMIZATION: Increased to 12 for paid Gemini API tier (1000+ RPM)
            PAID_TIER_CONCURRENCY = int(os.getenv("PAID_TIER_CONCURRENCY", "12"))
            semaphore = asyncio.Semaphore(PAID_TIER_CONCURRENCY)
            logger.info(
                f"[PERFORMANCE] Created semaphore with max {PAID_TIER_CONCURRENCY} concurrent persona generations (PAID TIER OPTIMIZATION)"
            )

            # Create tasks for parallel persona generation
            persona_tasks = []
            for i, (speaker, text) in enumerate(sorted_speakers):
                # Get the role for this speaker from our consolidated role mapping
                role = speaker_roles_map.get(speaker, "Participant")

                # PERFORMANCE OPTIMIZATION: Skip interviewer personas
                if role == "Interviewer":
                    logger.info(
                        f"[PERFORMANCE] Skipping interviewer persona for {speaker} - focusing on interviewees only"
                    )
                    continue

                # Skip if text is too short (likely noise)
                if len(text) < 100:
                    logger.warning(
                        f"[PERSONA_FORMATION_DEBUG] Skipping persona generation for {speaker} - text too short ({len(text)} chars)"
                    )
                    continue

                # Create task for parallel persona generation
                # Pass original dialogues for authentic quote extraction
                original_dialogues = speaker_dialogues.get(speaker, [])
                task = self._generate_single_persona_with_semaphore(
                    speaker, text, role, semaphore, i + 1, context, original_dialogues
                )
                persona_tasks.append((i, speaker, task))

            # Execute all persona generation tasks in parallel with robust error handling
            logger.info(
                f"[PERFORMANCE] Executing {len(persona_tasks)} persona generation tasks in parallel..."
            )

            # Use asyncio.gather with return_exceptions=True to handle individual failures gracefully
            task_results = await asyncio.gather(
                *[task for _, _, task in persona_tasks], return_exceptions=True
            )

            # Process results and handle exceptions
            successful_personas = 0
            failed_personas = 0

            for (i, speaker, _), result in zip(persona_tasks, task_results):
                if isinstance(result, Exception):
                    logger.error(
                        f"[PERFORMANCE] Persona generation failed for {speaker}: {str(result)}",
                        exc_info=True,
                    )
                    failed_personas += 1

                    # Create fallback persona for failed generation
                    role = speaker_roles_map.get(speaker, "Participant")
                    minimal_persona = self.persona_builder.create_fallback_persona(
                        role, speaker
                    )
                    personas.append(persona_to_dict(minimal_persona))
                    logger.info(
                        f"[PERFORMANCE] Created fallback persona for failed generation: {speaker}"
                    )
                elif result and isinstance(result, dict):
                    personas.append(result)
                    successful_personas += 1
                    logger.info(
                        f"[PERFORMANCE] Successfully processed persona for {speaker}"
                    )
                else:
                    logger.warning(
                        f"[PERFORMANCE] Invalid result for {speaker}, creating fallback"
                    )
                    failed_personas += 1

                    # Create fallback persona for invalid result
                    role = speaker_roles_map.get(speaker, "Participant")
                    minimal_persona = self.persona_builder.create_fallback_persona(
                        role, speaker
                    )
                    personas.append(persona_to_dict(minimal_persona))

            # Enhanced performance logging with aggressive concurrency metrics
            total_time = time.time() - start_time
            requests_per_minute = (len(sorted_speakers) / total_time) * 60
            sequential_estimate = len(sorted_speakers) * 2.5  # minutes
            performance_improvement = sequential_estimate / max(total_time / 60, 0.1)

            logger.info(
                f"[PYDANTIC_AI] BALANCED PARALLEL persona generation completed in {total_time:.2f} seconds "
                f"({successful_personas} successful, {failed_personas} failed, concurrency=5)"
            )
            logger.info(
                f"[PYDANTIC_AI] Achieved {requests_per_minute:.1f} requests per minute with 5 concurrent PydanticAI agents"
            )
            logger.info(
                f"[PYDANTIC_AI] Performance improvement: ~{performance_improvement:.1f}x faster than sequential "
                f"(estimated {sequential_estimate:.1f} min → {total_time/60:.1f} min)"
            )

            # Rate limit monitoring with PydanticAI
            if failed_personas > 0:
                failure_rate = (failed_personas / len(sorted_speakers)) * 100
                logger.warning(
                    f"[PYDANTIC_AI] Failure rate: {failure_rate:.1f}% - Monitor for rate limit issues with PydanticAI agents"
                )
                if failure_rate > 20:
                    logger.error(
                        f"[PYDANTIC_AI] HIGH FAILURE RATE ({failure_rate:.1f}%) - Consider reducing concurrency"
                    )
            else:
                logger.info(
                    "[PYDANTIC_AI] ✅ Zero failures - Balanced concurrency with PydanticAI working perfectly!"
                )

            # Emit final progress event
            try:
                await event_manager.emit(
                    EventType.PROCESSING_STEP,
                    {
                        "stage": "persona_formation_from_transcript",
                        "progress": 1.0,
                        "data": {
                            "personas_found": len(personas),
                            "speakers_processed": len(sorted_speakers),
                            "processing_time_seconds": total_time,
                            "concurrency_level": 15,
                            "requests_per_minute": requests_per_minute,
                            "performance_improvement": f"~{performance_improvement:.1f}x faster",
                            "failure_rate": (
                                (failed_personas / len(sorted_speakers)) * 100
                                if len(sorted_speakers) > 0
                                else 0
                            ),
                            "optimization_type": "AGGRESSIVE_PARALLEL",
                        },
                    },
                )
            except Exception as event_error:
                logger.warning(
                    f"Could not emit processing step event: {str(event_error)}"
                )

            logger.info(
                f"[PERSONA_FORMATION_DEBUG] 🎯 FINAL RESULT: Returning {len(personas)} personas from transcript with {len(sorted_speakers)} speakers"
            )

            # CONTENT DEDUPLICATION: Remove repetitive patterns from persona content
            logger.info("[PERSONA_FORMATION_DEBUG] 🧹 Deduplicating persona content...")
            deduplicated_personas = deduplicate_persona_list(personas)
            logger.info(f"[PERSONA_FORMATION_DEBUG] ✅ Content deduplication completed")

            # QUALITY VALIDATION: Simple pipeline validation with logging
            try:
                self._validate_persona_quality(deduplicated_personas)
            except Exception as validation_error:
                logger.error(
                    f"[QUALITY_VALIDATION] Error in transcript persona validation: {str(validation_error)}",
                    exc_info=True,
                )
                # Don't fail the entire process due to validation errors

            # Log summary of generated personas
            if deduplicated_personas:
                persona_names = [
                    p.get("name", "Unknown") for p in deduplicated_personas
                ]
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Generated persona names: {persona_names}"
                )
            else:
                logger.warning(
                    f"[PERSONA_FORMATION_DEBUG] ⚠️ No personas were generated despite having {len(sorted_speakers)} speakers"
                )

            return deduplicated_personas

        except Exception as e:
            logger.error(
                f"[PERSONA_FORMATION_DEBUG] ❌ Error forming personas from transcript: {str(e)}",
                exc_info=True,
            )
            try:
                await event_manager.emit_error(
                    e, {"stage": "form_personas_from_transcript"}
                )
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    def _select_diverse_speakers(
        self,
        sorted_speakers: List[Tuple[str, str]],
        speaker_roles_map: Dict[str, str],
        max_personas: int,
    ) -> List[Tuple[str, str]]:
        """
        PERFORMANCE OPTIMIZATION: Select diverse speakers for persona generation.

        Prioritizes speakers with:
        1. Different roles (Interviewee, Participant, etc.)
        2. Substantial content (longer text)
        3. Diverse content patterns

        Args:
            sorted_speakers: List of (speaker, text) tuples sorted by text length
            speaker_roles_map: Mapping of speakers to their roles
            max_personas: Maximum number of personas to generate

        Returns:
            List of selected (speaker, text) tuples
        """
        if len(sorted_speakers) <= max_personas:
            return sorted_speakers

        selected_speakers = []
        role_counts = {}

        # First pass: Select speakers with different roles
        for speaker, text in sorted_speakers:
            role = speaker_roles_map.get(speaker, "Participant")

            # Skip interviewers (already filtered above)
            if role == "Interviewer":
                continue

            # Prioritize role diversity
            if role not in role_counts:
                role_counts[role] = 0

            if role_counts[role] < 2:  # Max 2 personas per role
                selected_speakers.append((speaker, text))
                role_counts[role] += 1

                if len(selected_speakers) >= max_personas:
                    break

        # Second pass: Fill remaining slots with speakers with most content
        if len(selected_speakers) < max_personas:
            remaining_speakers = [
                (speaker, text)
                for speaker, text in sorted_speakers
                if (speaker, text) not in selected_speakers
                and speaker_roles_map.get(speaker, "Participant") != "Interviewer"
            ]

            needed = max_personas - len(selected_speakers)
            selected_speakers.extend(remaining_speakers[:needed])

        logger.info(
            f"[PERFORMANCE] Selected {len(selected_speakers)} diverse speakers: "
            f"roles={list(role_counts.keys())}, "
            f"avg_text_length={sum(len(text) for _, text in selected_speakers) // len(selected_speakers) if selected_speakers else 0}"
        )

        return selected_speakers

    async def _generate_single_persona_with_semaphore(
        self,
        speaker: str,
        text: str,
        role: str,
        semaphore: asyncio.Semaphore,
        persona_number: int,
        context: Optional[Dict[str, Any]] = None,
        original_dialogues: List[str] = None,
    ) -> Dict[str, Any]:
        """
        MIGRATION TO PYDANTICAI: Generate single persona with semaphore-controlled concurrency using PydanticAI.

        This uses PydanticAI agents instead of Instructor for structured persona generation,
        while maintaining the same aggressive 15-concurrent optimization and high-quality
        persona generation with full text analysis and detailed prompts.

        Args:
            speaker: Speaker identifier
            text: Full text content for the speaker
            role: Speaker role (Interviewee, Interviewer, etc.)
            semaphore: Asyncio semaphore for concurrency control
            persona_number: Persona number for logging
            context: Optional additional context

        Returns:
            Persona dictionary or raises exception on failure
        """
        async with semaphore:
            logger.info(
                f"[PYDANTIC_AI] Starting persona generation for {speaker} (persona {persona_number}, semaphore acquired)"
            )
            logger.info(
                f"[PERSONA_FORMATION_DEBUG] Processing speaker {persona_number}: {speaker} with role {role}, text length: {len(text)} chars"
            )

            try:
                # Check if PydanticAI is available
                if not self.pydantic_ai_available or not self.persona_agent:
                    logger.warning(
                        f"[PYDANTIC_AI] Agent not available for {speaker}, falling back to legacy method"
                    )
                    return await self._generate_persona_legacy_fallback(
                        speaker, text, role, context
                    )

                # Create a context object for this speaker
                speaker_context = {
                    "speaker": speaker,
                    "role": role,
                    **(context or {}),
                }

                # Create a prompt based on the role using simplified format
                # MAINTAIN HIGH QUALITY: Use the same detailed prompt generation as before
                prompt = self.prompt_generator.create_simplified_persona_prompt(
                    text, role
                )

                # Log the prompt length for debugging
                logger.info(
                    f"Created simplified prompt for {speaker} with length: {len(prompt)} chars"
                )

                # MAINTAIN HIGH QUALITY: Use the full text for analysis with Gemini 2.5 Flash's large context window
                text_to_analyze = text  # Use the full text without truncation
                logger.info(
                    f"Using full text of {len(text_to_analyze)} chars for {speaker}"
                )

                # MIGRATION TO PYDANTICAI: Create comprehensive analysis prompt
                analysis_prompt = f"""
SPEAKER ANALYSIS REQUEST:
Speaker: {speaker}
Role: {role}
Context: {speaker_context.get('industry', 'general')}

TRANSCRIPT CONTENT:
{text_to_analyze}

DETAILED PROMPT:
{prompt}

Please analyze this speaker's content and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine quotes, and realistic behavioral patterns."""

                # NO ARTIFICIAL DELAYS: Semaphore handles rate limiting
                # Call PydanticAI agent to generate persona with enhanced error handling
                # Log content size for timeout monitoring
                content_size = len(analysis_prompt)
                if content_size > 30000:
                    logger.warning(
                        f"[PYDANTIC_AI] Large content detected for {speaker}: {content_size:,} characters "
                        f"(May take longer to process, timeout extended to 15min)"
                    )

                logger.info(
                    f"[PYDANTIC_AI] Calling PydanticAI persona agent for {speaker} ({content_size:,} chars)"
                )

                # Use temperature 0 for consistent structured output with retry logic
                retry_config = get_conservative_retry_config()

                # Call PydanticAI agent directly with retry logic
                persona_result = await safe_pydantic_ai_call(
                    agent=self.persona_agent,
                    prompt=analysis_prompt,
                    context=f"Persona generation for {speaker} (#{persona_number})",
                    retry_config=retry_config,
                )

                logger.info(
                    f"[PYDANTIC_AI] PydanticAI agent returned response for {speaker} (type: {type(persona_result)})"
                )

                # The safe_pydantic_ai_call already extracts the output, so persona_result is the SimplifiedPersona model
                simplified_persona = persona_result
                logger.info(
                    f"[PYDANTIC_AI] Extracted simplified persona model for {speaker}: {simplified_persona.name}"
                )

                # Convert SimplifiedPersona to full Persona with PersonaTrait objects
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Converting SimplifiedPersona to full Persona for {speaker}"
                )

                # Convert simplified persona to full persona format with original dialogues
                persona_data = self._convert_simplified_to_full_persona(
                    simplified_persona, original_dialogues
                )
                logger.info(
                    f"[PYDANTIC_AI] Successfully converted persona model to dictionary for {speaker}"
                )

                # DEBUG: Log the actual PersonaTrait field values to understand why they're empty
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Persona data keys for {speaker}: {list(persona_data.keys())}"
                )

                # Check specific PersonaTrait fields
                trait_fields = [
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                    "needs_and_expectations",
                    "decision_making_process",
                    "communication_style",
                    "technology_usage",
                    "pain_points",
                    "key_quotes",
                ]

                for field in trait_fields:
                    field_value = persona_data.get(field)
                    if field_value is None:
                        logger.warning(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' is None for {speaker}"
                        )
                    elif isinstance(field_value, dict):
                        logger.info(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker}: {field_value.get('value', 'NO_VALUE')[:100]}..."
                        )
                    else:
                        logger.info(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker} (type {type(field_value)}): {str(field_value)[:100]}..."
                        )

                # Log the persona data keys for debugging
                if persona_data and isinstance(persona_data, dict):
                    logger.info(
                        f"[PERSONA_FORMATION_DEBUG] Persona data keys for {speaker}: {list(persona_data.keys())}"
                    )

                    # Use the speaker ID from the transcript as the default/override name
                    name_override = speaker
                    logger.info(
                        f"Using speaker ID from transcript as name_override: {name_override}"
                    )

                    # If the persona data doesn't have a name, use the speaker name
                    if "name" not in persona_data or not persona_data["name"]:
                        persona_data["name"] = name_override
                        logger.info(
                            f"Using speaker name as persona name: {name_override}"
                        )
                    elif name_override and name_override != persona_data.get("name"):
                        logger.info(
                            f"PydanticAI provided name '{persona_data.get('name')}' differs from transcript speaker_id '{name_override}'. Using PydanticAI name for now."
                        )

                    # MAINTAIN HIGH QUALITY: Build persona from attributes using the same detailed process
                    persona = self.persona_builder.build_persona_from_attributes(
                        persona_data, persona_data.get("name", name_override), role
                    )
                    result = persona_to_dict(persona)
                    logger.info(
                        f"[PYDANTIC_AI] ✅ Successfully created persona for {speaker}: {persona.name}"
                    )
                    return result
                else:
                    logger.warning(f"[PYDANTIC_AI] No valid persona data for {speaker}")
                    raise Exception(f"No valid persona data generated for {speaker}")

            except Exception as e:
                error_message = str(e).lower()

                # Enhanced error monitoring for rate limits and API issues with PydanticAI
                if (
                    "rate limit" in error_message
                    or "quota" in error_message
                    or "429" in error_message
                ):
                    logger.error(
                        f"[PYDANTIC_AI] ⚠️ RATE LIMIT ERROR for {speaker}: {str(e)} "
                        f"(Consider reducing concurrency from 15)",
                        exc_info=True,
                    )
                elif (
                    "timeout" in error_message
                    or "connection" in error_message
                    or "ReadTimeout" in str(e)
                ):
                    content_size = len(speaker_content.get(speaker, ""))
                    logger.error(
                        f"[PYDANTIC_AI] ⏱️ TIMEOUT ERROR for {speaker}: {str(e)} "
                        f"(Content size: {content_size:,} chars, Consider chunking large content)",
                        exc_info=True,
                    )
                elif "pydantic" in error_message or "validation" in error_message:
                    logger.error(
                        f"[PYDANTIC_AI] 📋 VALIDATION ERROR for {speaker}: {str(e)} "
                        f"(PydanticAI model validation failed)",
                        exc_info=True,
                    )
                elif (
                    "malformed_function_call" in error_message
                    or "finishreason" in error_message
                ):
                    logger.error(
                        f"[PYDANTIC_AI] 🔧 MALFORMED_FUNCTION_CALL ERROR for {speaker}: {str(e)} "
                        f"(Gemini API returned malformed function call response - retrying with fallback)",
                        exc_info=True,
                    )
                    # For MALFORMED_FUNCTION_CALL errors, we should try to continue with fallback
                    # instead of failing completely
                    logger.info(
                        f"[PYDANTIC_AI] Attempting fallback persona generation for {speaker}"
                    )
                    try:
                        # Create a basic fallback persona instead of failing
                        fallback_persona = {
                            "name": self._generate_descriptive_name_from_speaker_id(
                                speaker
                            ),
                            "description": f"Representative persona from {speaker} stakeholder group",
                            "confidence": 0.75,
                            "evidence": [
                                f"Generated as fallback due to MALFORMED_FUNCTION_CALL error"
                            ],
                            "role_context": {"value": role if role else "Participant"},
                            "archetype": {"value": "Unknown"},
                            "key_responsibilities": {
                                "value": "Not determined due to API error"
                            },
                            "tools_used": {"value": "Not determined"},
                            "collaboration_style": {"value": "Not determined"},
                            "analysis_approach": {"value": "Not determined"},
                            "pain_points": {"value": "Not determined"},
                            "patterns": [],
                            "overall_confidence": 0.5,
                            "supporting_evidence_summary": {
                                "value": "Fallback persona due to API error"
                            },
                        }
                        logger.info(
                            f"[PYDANTIC_AI] Created fallback persona for {speaker}"
                        )
                        return fallback_persona
                    except Exception as fallback_error:
                        logger.error(
                            f"[PYDANTIC_AI] Failed to create fallback persona: {fallback_error}"
                        )
                        # Re-raise original error if fallback fails
                        raise
                else:
                    logger.error(
                        f"[PYDANTIC_AI] ❌ GENERAL ERROR for {speaker}: {str(e)}",
                        exc_info=True,
                    )

                # Re-raise the exception to be handled by the calling method
                raise

    async def _generate_persona_legacy_fallback(
        self,
        speaker: str,
        text: str,
        role: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Legacy fallback method using the original Instructor-based approach.

        This method is used when PydanticAI is not available or fails to initialize.
        It maintains the same interface but uses the legacy implementation.
        """
        logger.info(
            f"[LEGACY_FALLBACK] Using legacy Instructor-based approach for {speaker}"
        )

        try:
            # Create a prompt based on the role using simplified format
            prompt = self.prompt_generator.create_simplified_persona_prompt(text, role)

            # Add more context to the request
            request_data = {
                "task": "persona_formation",
                "text": text,
                "prompt": prompt,
                "enforce_json": True,
                "response_mime_type": "application/json",
                "speaker": speaker,
                "role": role,
            }

            # Call LLM service using legacy approach
            llm_response = await self.llm_service.analyze(request_data)

            # Parse the response using legacy parsing
            persona_data = self._parse_llm_json_response(
                llm_response, f"legacy_fallback_for_{speaker}"
            )

            if persona_data and isinstance(persona_data, dict):
                # Use the speaker ID from the transcript as the default/override name
                name_override = speaker
                if "name" not in persona_data or not persona_data["name"]:
                    persona_data["name"] = name_override

                # Build persona from attributes using the same detailed process
                persona = self.persona_builder.build_persona_from_attributes(
                    persona_data, persona_data.get("name", name_override), role
                )
                result = persona_to_dict(persona)
                logger.info(
                    f"[LEGACY_FALLBACK] ✅ Successfully created persona for {speaker}: {persona.name}"
                )
                return result
            else:
                raise Exception(f"No valid persona data generated for {speaker}")

        except Exception as e:
            logger.error(
                f"[LEGACY_FALLBACK] Failed to generate persona for {speaker}: {str(e)}"
            )
            raise

    async def _analyze_patterns_for_persona(
        self, patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analyze patterns to extract persona attributes.

        Args:
            patterns: List of patterns to analyze

        Returns:
            Dictionary of persona attributes
        """
        try:
            logger.info(f"Analyzing {len(patterns)} patterns for persona attributes")

            # Convert patterns to a string representation for the prompt
            pattern_descriptions = "\n".join(
                [
                    f"Pattern {i+1}: {p.get('name', 'Unnamed')} - {p.get('description', 'No description')} "
                    f"(Evidence: {', '.join(p.get('evidence', [])[:3])})"
                    for i, p in enumerate(patterns)
                ]
            )

            # Create a prompt for pattern-based persona formation
            prompt = self.prompt_generator.create_pattern_prompt(pattern_descriptions)

            # Try using PydanticAI first (migrated from Instructor)
            if self.pydantic_ai_available and self.persona_agent:
                try:
                    logger.info(
                        "[PYDANTIC_AI] Using PydanticAI for pattern-based persona formation"
                    )

                    # Create comprehensive analysis prompt for patterns
                    analysis_prompt = f"""
PATTERN ANALYSIS REQUEST:
Analyze the following patterns to create a comprehensive persona.

PATTERNS TO ANALYZE:
{pattern_descriptions}

DETAILED PROMPT:
{prompt}

Please analyze these patterns and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine behavioral patterns, and realistic traits derived from the pattern analysis."""

                    # Use PydanticAI agent for pattern-based persona formation with retry logic
                    retry_config = get_conservative_retry_config()
                    persona_result = await safe_pydantic_ai_call(
                        agent=self.persona_agent,
                        prompt=analysis_prompt,
                        context=f"Pattern-based persona generation for {pattern.get('name', 'Unknown')}",
                        retry_config=retry_config,
                    )

                    logger.info(
                        "[PYDANTIC_AI] Received structured persona response from PydanticAI"
                    )

                    # Extract and convert PydanticAI model to dictionary (using new API)
                    persona_model = persona_result.output
                    attributes = persona_model.model_dump()

                    logger.info(
                        f"[PYDANTIC_AI] Successfully generated persona '{attributes.get('name', 'Unnamed')}' from patterns using PydanticAI"
                    )
                    return attributes
                except Exception as pydantic_ai_error:
                    logger.error(
                        f"[PYDANTIC_AI] Error using PydanticAI for pattern-based persona formation: {str(pydantic_ai_error)}",
                        exc_info=True,
                    )
                    logger.info(
                        "[PYDANTIC_AI] Falling back to legacy method for pattern-based persona formation"
                    )
            else:
                logger.warning(
                    "[PYDANTIC_AI] PydanticAI agent not available for pattern analysis, using legacy method"
                )

                # Fall back to original implementation
                # Import Pydantic model for response schema
                from backend.domain.models.persona_schema import Persona

                # Create a response schema for structured output
                response_schema = {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "archetype": {"type": "string"},
                        "demographics": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["name", "description"],
                }

                # Call LLM to analyze patterns
                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": pattern_descriptions,
                        "prompt": prompt,
                        "enforce_json": True,
                        "temperature": 0.0,
                        "response_mime_type": "application/json",
                        "response_schema": response_schema,
                    }
                )

                # --- ADD DETAILED LOGGING HERE ---
                logger.info(
                    f"[_analyze_patterns_for_persona] Raw LLM response (first 500 chars): {str(llm_response)[:500]}"
                )
                # If it's a string, log the full string for debugging if it's not too long
                if isinstance(llm_response, str) and len(llm_response) < 2000:
                    logger.debug(
                        f"[_analyze_patterns_for_persona] Full raw LLM response string: {llm_response}"
                    )
                # --- END DETAILED LOGGING ---

                # Parse the response
                attributes = self._parse_llm_json_response(
                    llm_response, "_analyze_patterns_for_persona"
                )

                if attributes and isinstance(attributes, dict):
                    logger.info(
                        f"Successfully parsed persona attributes from patterns."
                    )
                    return attributes
                else:
                    logger.warning(
                        "Failed to parse valid JSON attributes from LLM for pattern analysis."
                    )
                    return self._create_fallback_attributes(patterns)

        except Exception as e:
            logger.error(
                f"Error analyzing patterns for persona: {str(e)}", exc_info=True
            )
            return self._create_fallback_attributes(patterns)

    async def _convert_free_text_to_structured_transcript(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Convert free-text transcript to structured JSON format with speaker and text fields.

        Args:
            text: Raw interview transcript text
            context: Optional additional context information

        Returns:
            List of dictionaries with speaker and text fields
        """
        try:
            logger.info("Converting free-text to structured transcript format")

            # Check if text is empty or too short
            if not text or len(text.strip()) < 10:
                logger.warning("Text is empty or too short for transcript structuring")
                return []

            # Create a prompt for transcript structuring
            prompt = self.prompt_generator.create_transcript_structuring_prompt(text)

            # Import constants for LLM configuration
            from infrastructure.constants.llm_constants import (
                PERSONA_FORMATION_TEMPERATURE,
            )

            # Create a response schema for structured output
            response_schema = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "speaker": {"type": "string"},
                        "text": {"type": "string"},
                        "role": {"type": "string"},
                    },
                    "required": ["speaker", "text"],
                },
            }

            # Call LLM to convert text to structured format
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "prompt": prompt,
                    "is_json_task": True,
                    "temperature": PERSONA_FORMATION_TEMPERATURE,
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                }
            )

            # Parse the response
            structured_data = self._parse_llm_json_response(
                llm_response, "convert_free_text_to_structured_transcript"
            )

            if structured_data and isinstance(structured_data, list):
                logger.info(
                    f"Successfully converted free-text to structured format with {len(structured_data)} speakers"
                )
                return structured_data
            else:
                logger.warning("Failed to convert free-text to structured format")
                return []

        except Exception as e:
            logger.error(
                f"Error converting free-text to structured transcript: {str(e)}",
                exc_info=True,
            )
            return []

    async def _create_default_persona(
        self, context: Optional[Dict[str, Any]] = None
    ) -> List[Persona]:
        """
        Create a default persona when no patterns are available.

        Args:
            context: Optional additional context information

        Returns:
            List containing a single default Persona
        """
        try:
            logger.info("Creating default persona")

            # Check if we have original text in the context
            original_text = ""
            if context and "original_text" in context:
                original_text = context["original_text"]
                if isinstance(original_text, list):
                    # If it's a structured transcript, convert to text
                    original_text = "\n".join(
                        [
                            f"{entry.get('speaker', 'Unknown')}: {entry.get('text', '')}"
                            for entry in original_text
                        ]
                    )

                logger.info(
                    f"Using original text from context ({len(original_text)} chars)"
                )

                # Check if text is empty or too short
                if not original_text or len(original_text.strip()) < 10:
                    logger.warning(
                        "Original text is empty or too short for persona creation"
                    )
                    return [self.persona_builder.create_fallback_persona()]

                # Create a prompt for persona formation
                prompt = self.prompt_generator.create_participant_prompt(original_text)

                # Import Pydantic model for response schema
                from backend.domain.models.persona_schema import Persona

                # Create a response schema for structured output
                response_schema = {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "archetype": {"type": "string"},
                        "demographics": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["name", "description"],
                }

                # Call LLM for persona creation
                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": original_text,
                        "prompt": prompt,
                        "enforce_json": True,
                        "temperature": 0.0,
                        "response_mime_type": "application/json",
                        "response_schema": response_schema,
                    }
                )

                # Parse the response
                persona_data = self._parse_llm_json_response(
                    llm_response, "_create_default_persona"
                )

                if persona_data and isinstance(persona_data, dict):
                    # Build persona from attributes
                    persona = self.persona_builder.build_persona_from_attributes(
                        persona_data
                    )
                    return [persona]

            # If we don't have original text or persona creation failed, create a fallback persona
            logger.info("Creating fallback persona")
            return [self.persona_builder.create_fallback_persona()]

        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}", exc_info=True)
            return [self.persona_builder.create_fallback_persona()]

    def _create_fallback_attributes(
        self, patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Create fallback attributes when pattern analysis fails.

        Args:
            patterns: List of patterns

        Returns:
            Dictionary of fallback attributes
        """
        logger.info("Creating fallback attributes from patterns")

        # Create a default trait
        default_trait = {
            "value": "Unknown",
            "confidence": 0.3,
            "evidence": ["Fallback due to analysis error"],
        }

        # Extract pattern descriptions for evidence
        pattern_descriptions = [
            p.get("description", "Unknown pattern")
            for p in patterns
            if p.get("description")
        ]

        # Return structure that can be processed by Persona constructor
        return {
            # Basic information
            "name": "Default Persona",
            "archetype": "Unknown",
            "description": "Default persona due to analysis error or low confidence",
            # Detailed attributes (new fields)
            "demographics": default_trait,
            "goals_and_motivations": default_trait,
            "skills_and_expertise": default_trait,
            "workflow_and_environment": default_trait,
            "challenges_and_frustrations": default_trait,
            "technology_and_tools": default_trait,
            "key_quotes": default_trait,
            # Legacy fields
            "role_context": default_trait,
            "key_responsibilities": default_trait,
            "tools_used": default_trait,
            "collaboration_style": default_trait,
            "analysis_approach": default_trait,
            "pain_points": default_trait,
            # Overall persona information
            "patterns": pattern_descriptions[:5],
            "confidence": 0.3,
            "evidence": ["Fallback due to analysis error"],
        }

    # MIGRATION TO PYDANTICAI: Removed instructor_client property
    # This has been replaced with PydanticAI agent initialization

    # MIGRATION TO PYDANTICAI: Removed _generate_persona_from_attributes_with_instructor method
    # This functionality has been replaced with PydanticAI agent-based persona generation

    async def _generate_persona_from_attributes_original(
        self, attributes: Dict[str, Any], transcript_id: str
    ) -> Dict[str, Any]:
        """
        Original implementation of persona generation for fallback.

        Args:
            attributes: Dictionary of extracted attributes
            transcript_id: ID of the transcript

        Returns:
            Persona dictionary
        """
        # Prepare the prompt for persona formation
        prompt = self._prepare_persona_formation_prompt(attributes)

        # Call LLM to generate persona
        try:
            logger.info(
                f"Calling LLM for persona formation for transcript {transcript_id}"
            )

            # Call LLM for persona formation
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "prompt": prompt,
                    "is_json_task": True,
                    "temperature": 0.0,
                }
            )

            # Parse the response
            persona_data = self._parse_llm_json_response(
                llm_response, f"persona_formation_{transcript_id}"
            )

            if persona_data and isinstance(persona_data, dict):
                logger.info(
                    f"Successfully generated persona for transcript {transcript_id}"
                )
                return persona_data
            else:
                logger.warning(
                    f"Failed to generate valid persona data for transcript {transcript_id}"
                )
                return self._create_fallback_persona(transcript_id)
        except Exception as e:
            logger.error(
                f"Error generating persona for transcript {transcript_id}: {str(e)}",
                exc_info=True,
            )
            return self._create_fallback_persona(transcript_id)

    def _parse_llm_json_response(
        self, response: Union[str, Dict[str, Any]], context: str = ""
    ) -> Dict[str, Any]:
        """
        Parse JSON response from LLM with enhanced error recovery.

        Args:
            response: LLM response (string or dictionary)
            context: Context for error logging

        Returns:
            Parsed JSON as dictionary
        """
        # First try the new Instructor-based parser
        try:
            # Use the Instructor-based parser with task-specific handling
            result = parse_llm_json_response_with_instructor(
                response, context=context, task="persona_formation"
            )

            # If we got a valid result, process structured demographics and return it
            if result and isinstance(result, dict) and len(result) > 0:
                logger.info(f"Successfully parsed JSON with Instructor in {context}")
                # Process structured demographics if present
                result = self._process_structured_demographics(result)
                return result

        except Exception as e:
            logger.warning(f"Instructor-based parsing failed in {context}: {e}")

        # Fall back to the enhanced JSON parsing implementation
        logger.info(f"Falling back to enhanced JSON parsing in {context}")
        result = parse_llm_json_response_enhanced(response, context)
        # Process structured demographics if present
        return self._process_structured_demographics(result)

    def _convert_string_to_structured_demographics(
        self, demographics_string: str
    ) -> Optional[Dict[str, Any]]:
        """
        Convert string demographics to structured format.

        Args:
            demographics_string: String containing demographics information

        Returns:
            Dictionary with structured demographics fields or None if conversion fails
        """
        if not demographics_string or not isinstance(demographics_string, str):
            return None

        structured_demo = {}

        # Parse bullet-point format demographics
        lines = demographics_string.split("•")
        lines = [line.strip() for line in lines if line.strip()]

        for line in lines:
            if ":" not in line:
                continue

            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()

            if not value:
                continue

            # Map common demographic fields
            if "experience" in key and "level" in key:
                structured_demo["experience_level"] = value
            elif "industry" in key:
                structured_demo["industry"] = value
            elif "location" in key:
                structured_demo["location"] = value
            elif "age" in key and "range" in key:
                structured_demo["age_range"] = value
            elif "role" in key or "position" in key:
                # Handle roles as array
                roles = [r.strip() for r in value.split(",") if r.strip()]
                if roles:
                    structured_demo["roles"] = roles

        # Extract professional context from remaining text
        import re

        context_match = re.search(
            r"professional context[:\s]+(.*?)(?:\.|$)",
            demographics_string,
            re.IGNORECASE,
        )
        if context_match:
            structured_demo["professional_context"] = context_match.group(1).strip()

        # Only return if we found meaningful structured data
        if len(structured_demo) > 0:
            logger.info(
                f"Converted string demographics to structured format: {list(structured_demo.keys())}"
            )
            return structured_demo

        return None

    def _process_structured_demographics(
        self, persona_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process structured demographics in persona data, converting to DemographicsValue if needed.

        Args:
            persona_data: Parsed persona data dictionary

        Returns:
            Persona data with processed demographics
        """
        from backend.schemas import DemographicsValue

        if "demographics" not in persona_data:
            return persona_data

        demographics = persona_data["demographics"]
        if not isinstance(demographics, dict):
            return persona_data

        # Check if demographics has a structured value
        demo_value = demographics.get("value")

        if isinstance(demo_value, dict):
            try:
                # Try to create a DemographicsValue object from the structured data
                structured_demo = DemographicsValue(**demo_value)
                demographics["value"] = structured_demo
                logger.info(
                    "Successfully converted demographics dict to DemographicsValue"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to convert demographics dict to DemographicsValue: {e}"
                )
                # Keep the original dict format as fallback
                pass
        elif isinstance(demo_value, str):
            # Try to convert string to structured format
            structured_dict = self._convert_string_to_structured_demographics(
                demo_value
            )
            if structured_dict:
                try:
                    structured_demo = DemographicsValue(**structured_dict)
                    demographics["value"] = structured_demo
                    logger.info(
                        "Successfully converted string demographics to DemographicsValue"
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to convert string demographics to DemographicsValue: {e}"
                    )
                    # Keep the original string format as fallback
                    pass

        return persona_data

    def _group_patterns(
        self, patterns: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        """
        Group patterns by similarity.

        Args:
            patterns: List of patterns from analysis

        Returns:
            List of pattern groups
        """
        # Simple grouping by pattern type
        grouped = {}
        for pattern in patterns:
            pattern_type = pattern.get(
                "type", "unknown"
            )  # Use 'type' if available, else 'category'
            if not pattern_type or pattern_type == "unknown":
                pattern_type = pattern.get("category", "unknown")

            if pattern_type not in grouped:
                grouped[pattern_type] = []
            grouped[pattern_type].append(pattern)

        # Convert to list of groups
        return list(grouped.values())

    def _generate_descriptive_name_from_speaker_id(self, speaker_id: str) -> str:
        """Generate a descriptive persona name from speaker_id for better fallback personas"""
        try:
            # Extract meaningful parts from speaker_id
            if "_" in speaker_id:
                parts = speaker_id.split("_")
                if len(parts) >= 2:
                    # Convert from "Tech_Reviewers_Influencers" to "Alex, the Tech Reviewer"
                    category = parts[0].replace("_", " ")
                    role = parts[1].replace("_", " ")

                    # Generate a human name based on category
                    names = {
                        "Tech": ["Alex", "Sarah", "David", "Emma"],
                        "Price": ["Patricia", "Michael", "Lisa", "James"],
                        "Savvy": ["Jordan", "Taylor", "Morgan", "Casey"],
                        "Community": ["Riley", "Avery", "Quinn", "Blake"],
                        "Principled": ["Eleanor", "William", "Grace", "Henry"],
                    }

                    for key, name_list in names.items():
                        if key.lower() in category.lower():
                            import random

                            name = random.choice(name_list)
                            return f"{name}, the {category} {role}"

            # Fallback to cleaned up speaker_id
            cleaned = speaker_id.replace("_", " ").title()
            return f"Representative {cleaned}"

        except Exception as e:
            logger.warning(f"Error generating descriptive name for {speaker_id}: {e}")
            return f"Representative User"

    def _convert_simplified_to_full_persona(
        self, simplified_persona, original_dialogues: List[str] = None
    ) -> Dict[str, Any]:
        """
        Convert SimplifiedPersona to full Persona format with PersonaTrait objects.

        Args:
            simplified_persona: SimplifiedPersona model from PydanticAI
            original_dialogues: List of original dialogue strings for authentic quote extraction

        Returns:
            Dictionary in full Persona format with PersonaTrait objects
        """
        from backend.domain.models.persona_schema import PersonaTrait

        # Helper function to create PersonaTrait
        def create_trait(
            value: str, confidence: float, evidence: List[str] = None
        ) -> Dict[str, Any]:
            return {
                "value": value,
                "confidence": confidence,
                "evidence": evidence or [],
            }

        # Extract quotes for evidence and distribute them intelligently
        quotes = simplified_persona.key_quotes if simplified_persona.key_quotes else []

        # Create unique evidence pools for different categories to prevent duplication
        def distribute_evidence_semantically(quotes_list, num_pools=8):
            """Distribute quotes based on semantic relevance to persona trait categories"""
            if not quotes_list:
                return [[] for _ in range(num_pools)]

            # Define semantic keywords for each persona trait category
            trait_keywords = {
                0: [
                    "role",
                    "position",
                    "company",
                    "department",
                    "experience",
                    "background",
                    "demographics",
                ],  # demographics
                1: [
                    "goal",
                    "motivation",
                    "want",
                    "need",
                    "objective",
                    "aim",
                    "purpose",
                    "drive",
                ],  # goals_and_motivations
                2: [
                    "challenge",
                    "frustration",
                    "problem",
                    "issue",
                    "difficulty",
                    "struggle",
                    "pain",
                ],  # challenges_and_frustrations
                3: [
                    "skill",
                    "expertise",
                    "ability",
                    "competency",
                    "knowledge",
                    "proficient",
                    "expert",
                ],  # skills_and_expertise
                4: [
                    "technology",
                    "tool",
                    "software",
                    "system",
                    "platform",
                    "application",
                    "tech",
                ],  # technology_and_tools
                5: [
                    "workflow",
                    "environment",
                    "process",
                    "work",
                    "office",
                    "team",
                    "collaboration",
                ],  # workflow_and_environment
                6: [
                    "responsibility",
                    "duty",
                    "task",
                    "role",
                    "accountable",
                    "manage",
                    "lead",
                ],  # key_responsibilities
                7: [
                    "quote",
                    "said",
                    "mentioned",
                    "stated",
                    "expressed",
                    "voice",
                    "opinion",
                ],  # key_quotes/general
            }

            pools = [[] for _ in range(num_pools)]

            # Distribute quotes based on semantic matching
            for quote in quotes_list:
                quote_lower = quote.lower()
                best_pool = 7  # Default to general pool
                max_matches = 0

                # Find the pool with the most keyword matches
                for pool_idx, keywords in trait_keywords.items():
                    matches = sum(1 for keyword in keywords if keyword in quote_lower)
                    if matches > max_matches:
                        max_matches = matches
                        best_pool = pool_idx

                pools[best_pool].append(quote)

            # Ensure no pool is completely empty by redistributing if needed
            non_empty_pools = [i for i, pool in enumerate(pools) if pool]
            if len(non_empty_pools) < num_pools and quotes_list:
                # Distribute some quotes to empty pools
                for i, pool in enumerate(pools):
                    if not pool and non_empty_pools:
                        source_pool_idx = non_empty_pools[i % len(non_empty_pools)]
                        if len(pools[source_pool_idx]) > 1:
                            pools[i].append(pools[source_pool_idx].pop())

            return pools

        evidence_pools = distribute_evidence_semantically(quotes, 8)

        # Log evidence distribution for debugging
        logger.info(
            f"[EVIDENCE_DISTRIBUTION] Distributed {len(quotes)} quotes across {len(evidence_pools)} semantic pools"
        )
        for i, pool in enumerate(evidence_pools):
            if pool:
                logger.info(f"[EVIDENCE_DISTRIBUTION] Pool {i}: {len(pool)} quotes")

        # QUALITY VALIDATION: Check if we have rich description but poor evidence
        description_quality = self._assess_content_quality(
            simplified_persona.description
        )
        evidence_quality = self._assess_evidence_quality(quotes)

        logger.info(
            f"[QUALITY_CHECK] Description quality: {description_quality}, Evidence quality: {evidence_quality}"
        )

        # If description is rich but evidence is poor, try to extract evidence from description
        if description_quality > 0.7 and evidence_quality < 0.5:
            logger.warning(
                f"[QUALITY_MISMATCH] Rich description ({description_quality:.2f}) but poor evidence ({evidence_quality:.2f}) - attempting evidence extraction from description"
            )
            enhanced_quotes = self._extract_evidence_from_description(
                simplified_persona
            )
            if enhanced_quotes:
                quotes.extend(enhanced_quotes)
                evidence_pools = distribute_evidence_semantically(quotes, 8)
                logger.info(
                    f"[QUALITY_FIX] Enhanced evidence with {len(enhanced_quotes)} quotes from description"
                )

        # AUTHENTIC QUOTE EXTRACTION: Extract direct quotes from original interview dialogue
        def extract_authentic_quotes_from_dialogue(
            original_dialogues: List[str], trait_content: str, trait_name: str
        ) -> tuple[List[str], List[str]]:
            """Extract authentic verbatim quotes from original interview dialogue that support the trait

            Returns:
                tuple: (evidence_quotes, actual_keywords_used)
            """
            logger.error(
                f"🔥 [AUTHENTIC_QUOTES] FUNCTION CALLED! Extracting quotes for trait: {trait_name}"
            )
            logger.error(
                f"🔥 [AUTHENTIC_QUOTES] Original dialogues count: {len(original_dialogues) if original_dialogues else 0}"
            )
            logger.error(
                f"🔥 [AUTHENTIC_QUOTES] Trait content length: {len(trait_content) if trait_content else 0}"
            )

            # Log first few dialogues for debugging
            if original_dialogues:
                for i, dialogue in enumerate(original_dialogues[:3]):
                    logger.error(
                        f"🔥 [AUTHENTIC_QUOTES] Dialogue {i+1}: {dialogue[:100]}..."
                    )

            if not original_dialogues or not trait_content:
                logger.warning(
                    f"[AUTHENTIC_QUOTES] Missing data - dialogues: {bool(original_dialogues)}, trait_content: {bool(trait_content)}"
                )
                return [], []  # Return empty evidence and keywords

            import re

            evidence = []
            actual_keywords_used = (
                set()
            )  # Track keywords that were actually used for highlighting

            # Use LLM-based keyword extraction instead of hardcoded keywords
            from backend.utils.persona.nlp_processor import (
                extract_trait_keywords_for_highlighting,
            )

            # Extract keywords using PydanticAI based on trait content and existing evidence
            existing_evidence = []  # We'll build this as we find quotes
            keywords = extract_trait_keywords_for_highlighting(
                trait_content, existing_evidence
            )

            logger.info(
                f"[LLM_KEYWORDS] Extracted keywords for {trait_name}: {keywords}"
            )

            # Search through original dialogues for relevant quotes
            for dialogue in original_dialogues:
                if not dialogue or len(dialogue.strip()) < 20:
                    continue

                dialogue = dialogue.strip()

                # Split dialogue into sentences
                sentences = re.split(r"[.!?]+", dialogue)

                for sentence in sentences:
                    sentence = sentence.strip()
                    if len(sentence) < 30:  # Skip very short sentences
                        continue

                    # Check if sentence contains trait-relevant keywords
                    sentence_lower = sentence.lower()
                    keyword_matches = [kw for kw in keywords if kw in sentence_lower]

                    if keyword_matches:
                        # Format the quote with keyword highlighting
                        formatted_quote = f'"{sentence}"'

                        # Highlight the first 2-3 matched keywords with bold formatting
                        for keyword in keyword_matches[:3]:
                            # Use case-insensitive replacement with word boundaries
                            pattern = r"\b" + re.escape(keyword) + r"\b"
                            formatted_quote = re.sub(
                                pattern,
                                f"**{keyword}**",
                                formatted_quote,
                                flags=re.IGNORECASE,
                            )
                            # Track that this keyword was actually used
                            actual_keywords_used.add(keyword)

                        evidence.append(formatted_quote)

                        if len(evidence) >= 3:  # Limit to 3 quotes per trait
                            break

                if len(evidence) >= 3:
                    break

            # If no keyword matches found, try semantic matching with trait content
            if not evidence:
                # Look for quotes that contain words from the trait content
                trait_words = set(re.findall(r"\b\w{4,}\b", trait_content.lower()))

                for dialogue in original_dialogues:
                    if not dialogue or len(dialogue.strip()) < 20:
                        continue

                    sentences = re.split(r"[.!?]+", dialogue.strip())

                    for sentence in sentences:
                        sentence = sentence.strip()
                        if len(sentence) < 30:
                            continue

                        sentence_words = set(
                            re.findall(r"\b\w{4,}\b", sentence.lower())
                        )

                        # Check for word overlap
                        if len(trait_words & sentence_words) >= 2:
                            # Find overlapping words for highlighting
                            overlap_words = list(trait_words & sentence_words)[:3]

                            formatted_quote = f'"{sentence}"'
                            for word in overlap_words:
                                pattern = r"\b" + re.escape(word) + r"\b"
                                formatted_quote = re.sub(
                                    pattern,
                                    f"**{word}**",
                                    formatted_quote,
                                    flags=re.IGNORECASE,
                                )

                            evidence.append(formatted_quote)

                            if len(evidence) >= 2:  # Limit to 2 for semantic matching
                                break

                    if len(evidence) >= 2:
                        break

            logger.error(
                f"🔥 [AUTHENTIC_QUOTES] EXTRACTED {len(evidence)} quotes for {trait_name}"
            )
            for i, quote in enumerate(evidence[:3]):
                logger.error(f"🔥 [AUTHENTIC_QUOTES] Quote {i+1}: {quote[:100]}...")

            # Return both evidence and the keywords that were actually used for highlighting
            actual_keywords_list = list(actual_keywords_used)
            logger.info(
                f"[LLM_KEYWORDS] Actually used keywords for {trait_name}: {actual_keywords_list}"
            )

            return (
                evidence[:3],
                actual_keywords_list,
            )  # Return evidence and actual keywords used

        # Helper function to create trait with keywords
        def create_trait_with_keywords(
            content: str, confidence: float, trait_name: str
        ):
            evidence, keywords = extract_authentic_quotes_from_dialogue(
                original_dialogues or [], content, trait_name
            )
            trait = create_trait(content, confidence, evidence)
            # Add keywords to the trait
            if hasattr(trait, "__dict__"):
                trait.actual_keywords = keywords
            return trait

        # Convert to full persona format with contextual evidence extraction
        persona_data = {
            "name": simplified_persona.name,
            "description": simplified_persona.description,
            "archetype": simplified_persona.archetype,
            # Convert simple strings to PersonaTrait objects with authentic quote evidence
            "demographics": create_trait_with_keywords(
                simplified_persona.demographics,
                simplified_persona.demographics_confidence,
                "demographics",
            ),
            "goals_and_motivations": create_trait_with_keywords(
                simplified_persona.goals_motivations,
                simplified_persona.goals_confidence,
                "goals_and_motivations",
            ),
            "challenges_and_frustrations": create_trait_with_keywords(
                simplified_persona.challenges_frustrations,
                simplified_persona.challenges_confidence,
                "challenges_and_frustrations",
            ),
            "skills_and_expertise": create_trait_with_keywords(
                simplified_persona.skills_expertise,
                simplified_persona.skills_confidence,
                "skills_and_expertise",
            ),
            "technology_and_tools": create_trait_with_keywords(
                simplified_persona.technology_tools,
                simplified_persona.technology_confidence,
                "technology_and_tools",
            ),
            "pain_points": create_trait_with_keywords(
                simplified_persona.pain_points,
                simplified_persona.pain_points_confidence,
                "pain_points",
            ),
            "workflow_and_environment": create_trait_with_keywords(
                simplified_persona.workflow_environment,
                simplified_persona.overall_confidence,
                "workflow_and_environment",
            ),
            "needs_and_expectations": create_trait_with_keywords(
                simplified_persona.needs_expectations,
                simplified_persona.overall_confidence,
                "needs_and_expectations",
            ),
            # FIX: Use actual quotes content instead of generic description
            "key_quotes": create_trait(
                # Join first few quotes as the value, use all quotes as evidence
                "; ".join(quotes[:3]) if quotes else "Key insights from interview data",
                simplified_persona.overall_confidence,
                quotes,  # All quotes as evidence
            ),
            # Additional fields that PersonaBuilder expects (mapped from SimplifiedPersona)
            "key_responsibilities": create_trait(
                simplified_persona.skills_expertise,  # Map skills to responsibilities
                simplified_persona.skills_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.skills_expertise,
                    "key_responsibilities",
                ),
            ),
            "tools_used": create_trait(
                simplified_persona.technology_tools,  # Map technology to tools
                simplified_persona.technology_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.technology_tools,
                    "tools_used",
                ),
            ),
            "analysis_approach": create_trait(
                simplified_persona.workflow_environment,  # Use actual workflow content
                simplified_persona.overall_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.workflow_environment,
                    "analysis_approach",
                ),
            ),
            "decision_making_process": create_trait(
                simplified_persona.goals_motivations,  # Use actual goals content
                simplified_persona.goals_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.goals_motivations,
                    "decision_making_process",
                ),
            ),
            "communication_style": create_trait(
                simplified_persona.workflow_environment,  # Use actual workflow content
                simplified_persona.overall_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.workflow_environment,
                    "communication_style",
                ),
            ),
            "technology_usage": create_trait(
                simplified_persona.technology_tools,  # Map technology tools to usage patterns
                simplified_persona.technology_confidence,
                extract_authentic_quotes_from_dialogue(
                    original_dialogues or [],
                    simplified_persona.technology_tools,
                    "technology_usage",
                ),
            ),
            # Legacy fields for compatibility
            "role_context": create_trait(
                f"Professional context: {simplified_persona.demographics}",
                simplified_persona.demographics_confidence,
                evidence_pools[0][:1],  # Minimal evidence to avoid duplication
            ),
            "collaboration_style": create_trait(
                simplified_persona.workflow_environment,  # Use actual workflow content
                simplified_persona.overall_confidence,
                (
                    evidence_pools[6][1:3]
                    if len(evidence_pools[6]) > 1
                    else evidence_pools[6]
                ),  # Different slice to avoid duplication with communication_style
            ),
            # Overall confidence
            "overall_confidence": simplified_persona.overall_confidence,
        }

        logger.info(
            f"[CONVERSION] Successfully converted SimplifiedPersona to full Persona format with intelligent evidence distribution"
        )
        return persona_data

    def _assess_content_quality(self, content: str) -> float:
        """
        Assess the quality of content (description, traits) to detect rich vs generic content.

        Args:
            content: Content to assess

        Returns:
            Quality score from 0.0 (generic) to 1.0 (rich, specific)
        """
        if not content or len(content.strip()) < 10:
            return 0.0

        # Indicators of rich content
        rich_indicators = [
            # Specific details
            r"\b\d+\b",  # Numbers (ages, years, quantities)
            r"\b[A-Z][a-z]+\b",  # Proper nouns (names, places)
            r"\b(husband|wife|son|daughter|family|children)\b",  # Family relationships
            r"\b(years?|months?|experience|background)\b",  # Experience indicators
            r"\b(specific|particular|detailed|mentioned)\b",  # Specificity indicators
            # Emotional/personal language
            r"\b(loves?|enjoys?|prefers?|dislikes?|frustrated|excited)\b",
            # Professional context
            r"\b(manager|director|analyst|developer|consultant|specialist)\b",
            # Geographic/cultural context
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b.*\b(city|country|region|area)\b",
        ]

        # Indicators of generic content
        generic_indicators = [
            r"\b(generic|placeholder|unknown|not specified|inferred)\b",
            r"\b(stakeholder|participant|individual|person)\b.*\b(sharing|providing)\b",
            r"\b(no specific|limited|insufficient|unclear)\b",
            r"\b(fallback|default|basic)\b",
        ]

        import re

        rich_score = 0
        for pattern in rich_indicators:
            matches = len(re.findall(pattern, content, re.IGNORECASE))
            rich_score += min(matches * 0.1, 0.3)  # Cap each pattern's contribution

        generic_score = 0
        for pattern in generic_indicators:
            matches = len(re.findall(pattern, content, re.IGNORECASE))
            generic_score += min(matches * 0.2, 0.4)  # Penalize generic content more

        # Length bonus for detailed content
        length_bonus = min(len(content) / 200, 0.3)

        # Calculate final quality score
        quality = min(rich_score + length_bonus - generic_score, 1.0)
        return max(quality, 0.0)

    def _assess_evidence_quality(self, quotes: List[str]) -> float:
        """
        Assess the quality of evidence quotes.

        Args:
            quotes: List of evidence quotes

        Returns:
            Quality score from 0.0 (poor/generic) to 1.0 (rich, authentic)
        """
        if not quotes:
            return 0.0

        total_quality = 0
        for quote in quotes:
            quote_quality = self._assess_content_quality(quote)

            # Additional evidence-specific indicators
            if any(
                indicator in quote.lower()
                for indicator in [
                    "no specific",
                    "generic placeholder",
                    "inferred from",
                    "contextual",
                    "derived from",
                    "using generic",
                ]
            ):
                quote_quality *= 0.3  # Heavily penalize generic evidence

            # Bonus for direct quotes (contain quotation marks or first person)
            if '"' in quote or any(
                word in quote.lower() for word in ["i ", "my ", "we ", "our "]
            ):
                quote_quality += 0.2

            total_quality += quote_quality

        return min(total_quality / len(quotes), 1.0)

    def _extract_evidence_from_description(self, simplified_persona) -> List[str]:
        """
        Extract evidence quotes from rich persona descriptions and traits.

        Args:
            simplified_persona: SimplifiedPersona with rich content

        Returns:
            List of extracted evidence quotes
        """
        evidence_quotes = []

        # Extract from description
        description = simplified_persona.description
        if description and self._assess_content_quality(description) > 0.7:
            # Look for specific details that can serve as evidence
            import re

            # Extract sentences with specific details
            sentences = re.split(r"[.!?]+", description)
            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) > 20 and any(
                    indicator in sentence.lower()
                    for indicator in [
                        "husband",
                        "wife",
                        "son",
                        "daughter",
                        "family",
                        "years",
                        "experience",
                        "works",
                        "lives",
                        "manages",
                        "responsible",
                        "specializes",
                    ]
                ):
                    evidence_quotes.append(f"Profile insight: {sentence}")

        # Extract from trait fields if they contain rich content
        trait_fields = [
            ("demographics", simplified_persona.demographics),
            ("goals_motivations", simplified_persona.goals_motivations),
            ("challenges_frustrations", simplified_persona.challenges_frustrations),
            ("skills_expertise", simplified_persona.skills_expertise),
        ]

        for field_name, trait_content in trait_fields:
            if trait_content and self._assess_content_quality(trait_content) > 0.6:
                # Extract key phrases as evidence
                sentences = re.split(r"[.!?]+", trait_content)
                for sentence in sentences[:2]:  # Limit to avoid duplication
                    sentence = sentence.strip()
                    if len(sentence) > 15:
                        evidence_quotes.append(
                            f"{field_name.replace('_', ' ').title()} evidence: {sentence}"
                        )

        return evidence_quotes[:5]  # Limit to 5 extracted quotes

    def _validate_persona_quality(self, personas: List[Dict[str, Any]]) -> None:
        """
        Simple quality validation with developer-friendly logging.

        Args:
            personas: List of persona dictionaries to validate
        """
        if not personas:
            logger.warning("[QUALITY_VALIDATION] ⚠️ No personas generated")
            return

        quality_issues = []

        for i, persona in enumerate(personas):
            persona_name = persona.get("name", f"Persona {i+1}")

            # Check description quality
            description = persona.get("description", "")
            description_quality = self._assess_content_quality(description)

            # Check evidence quality across traits
            evidence_qualities = []
            trait_fields = [
                "demographics",
                "goals_and_motivations",
                "challenges_and_frustrations",
                "skills_and_expertise",
                "technology_and_tools",
                "workflow_and_environment",
            ]

            for field in trait_fields:
                trait_data = persona.get(field, {})
                if isinstance(trait_data, dict) and "evidence" in trait_data:
                    evidence = trait_data["evidence"]
                    if evidence:
                        evidence_quality = self._assess_evidence_quality(evidence)
                        evidence_qualities.append(evidence_quality)

            avg_evidence_quality = (
                sum(evidence_qualities) / len(evidence_qualities)
                if evidence_qualities
                else 0
            )

            # Detect quality mismatches
            if description_quality > 0.7 and avg_evidence_quality < 0.5:
                quality_issues.append(
                    {
                        "persona": persona_name,
                        "issue": "quality_mismatch",
                        "description_quality": description_quality,
                        "evidence_quality": avg_evidence_quality,
                        "message": f"Rich description ({description_quality:.2f}) but poor evidence ({avg_evidence_quality:.2f})",
                    }
                )

            # Detect generic content
            if description_quality < 0.4:
                quality_issues.append(
                    {
                        "persona": persona_name,
                        "issue": "generic_description",
                        "description_quality": description_quality,
                        "message": f"Generic description detected ({description_quality:.2f})",
                    }
                )

            if avg_evidence_quality < 0.3:
                quality_issues.append(
                    {
                        "persona": persona_name,
                        "issue": "generic_evidence",
                        "evidence_quality": avg_evidence_quality,
                        "message": f"Generic evidence detected ({avg_evidence_quality:.2f})",
                    }
                )

        # ENHANCED VALIDATION: Add evidence and keyword highlighting validation
        logger.info("[DEBUG] 🔍 About to call enhanced validation system...")
        logger.info(
            f"[DEBUG] Personas count: {len(personas)}, Quality issues count: {len(quality_issues)}"
        )

        try:
            logger.info("[DEBUG] 🚀 Calling _validate_evidence_and_highlighting...")
            self._validate_evidence_and_highlighting(personas, quality_issues)
            logger.info("[DEBUG] ✅ Enhanced validation completed successfully")
        except ImportError as e:
            logger.error(f"[ERROR] 🚨 Import error in enhanced validation: {e}")
            logger.error(
                "[ERROR] Enhanced validation services may not be properly imported"
            )
            import traceback

            traceback.print_exc()
        except Exception as e:
            logger.error(f"[ERROR] 🚨 Enhanced validation failed with exception: {e}")
            logger.error(f"[ERROR] Exception type: {type(e).__name__}")
            import traceback

            traceback.print_exc()

        logger.info("[DEBUG] 🏁 Enhanced validation section completed")

        # Log quality summary
        if quality_issues:
            logger.warning(
                f"[QUALITY_VALIDATION] ⚠️ Found {len(quality_issues)} quality issues:"
            )
            for issue in quality_issues:
                logger.warning(f"  • {issue['persona']}: {issue['message']}")
        else:
            logger.info(
                f"[QUALITY_VALIDATION] ✅ All {len(personas)} personas passed quality validation"
            )

    def _assess_content_quality(self, content: str) -> float:
        """
        Assess the quality of content (description, traits) to detect rich vs generic content.

        Args:
            content: Content to assess

        Returns:
            Quality score from 0.0 (generic) to 1.0 (rich, specific)
        """
        if not content or len(content.strip()) < 10:
            return 0.0

        # Indicators of rich content
        rich_indicators = [
            # Specific details
            r"\b\d+\b",  # Numbers (ages, years, quantities)
            r"\b[A-Z][a-z]+\b",  # Proper nouns (names, places)
            r"\b(husband|wife|son|daughter|family|children)\b",  # Family relationships
            r"\b(years?|months?|experience|background)\b",  # Experience indicators
            r"\b(specific|particular|detailed|mentioned)\b",  # Specificity indicators
            # Emotional/personal language
            r"\b(loves?|enjoys?|prefers?|dislikes?|frustrated|excited)\b",
            # Professional context
            r"\b(manager|director|analyst|developer|consultant|specialist)\b",
            # Geographic/cultural context
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b.*\b(city|country|region|area)\b",
        ]

        # Indicators of generic content
        generic_indicators = [
            r"\b(generic|placeholder|unknown|not specified|inferred)\b",
            r"\b(stakeholder|participant|individual|person)\b.*\b(sharing|providing)\b",
            r"\b(no specific|limited|insufficient|unclear)\b",
            r"\b(fallback|default|basic)\b",
        ]

        import re

        rich_score = 0
        for pattern in rich_indicators:
            matches = len(re.findall(pattern, content, re.IGNORECASE))
            rich_score += min(matches * 0.1, 0.3)  # Cap each pattern's contribution

        generic_score = 0
        for pattern in generic_indicators:
            matches = len(re.findall(pattern, content, re.IGNORECASE))
            generic_score += min(matches * 0.2, 0.4)  # Penalize generic content more

        # Length bonus for detailed content
        length_bonus = min(len(content) / 200, 0.3)

        # Calculate final quality score
        quality = min(rich_score + length_bonus - generic_score, 1.0)
        return max(quality, 0.0)

    def _assess_evidence_quality(self, evidence: List[str]) -> float:
        """
        Assess the quality of evidence quotes.

        Args:
            evidence: List of evidence quotes

        Returns:
            Quality score from 0.0 (poor/generic) to 1.0 (rich, authentic)
        """
        if not evidence:
            return 0.0

        total_quality = 0
        for quote in evidence:
            quote_quality = self._assess_content_quality(quote)

            # Additional evidence-specific indicators
            if any(
                indicator in quote.lower()
                for indicator in [
                    "no specific",
                    "generic placeholder",
                    "inferred from",
                    "contextual",
                    "derived from",
                    "using generic",
                ]
            ):
                quote_quality *= 0.3  # Heavily penalize generic evidence

            # Bonus for direct quotes (contain quotation marks or first person)
            if '"' in quote or any(
                word in quote.lower() for word in ["i ", "my ", "we ", "our "]
            ):
                quote_quality += 0.2

            total_quality += quote_quality

        return min(total_quality / len(evidence), 1.0)

    def _validate_evidence_and_highlighting(
        self, personas: List[Dict[str, Any]], quality_issues: List[Dict[str, Any]]
    ) -> None:
        """
        Enhanced validation for evidence quality and keyword highlighting.

        Args:
            personas: List of persona dictionaries to validate
            quality_issues: List to append quality issues to
        """
        logger.info("[DEBUG] 🎯 ENTERED _validate_evidence_and_highlighting method!")
        logger.info(f"[DEBUG] Method called with {len(personas)} personas")

        try:
            logger.info("[DEBUG] 📦 Attempting to initialize validators...")
            # Initialize validators
            evidence_validator = EvidenceValidator()
            logger.info("[DEBUG] ✅ EvidenceValidator initialized successfully")

            keyword_highlighter = ContextAwareKeywordHighlighter()
            logger.info(
                "[DEBUG] ✅ ContextAwareKeywordHighlighter initialized successfully"
            )

            # DYNAMIC DOMAIN DETECTION: Analyze content to detect research domain and keywords
            if personas and len(personas) > 0:
                # Get sample content from first persona for domain detection
                sample_persona = personas[0]
                sample_content = ""

                # Collect sample evidence from the first persona
                for trait_name in [
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                ]:
                    trait_data = sample_persona.get(trait_name, {})
                    if isinstance(trait_data, dict) and "evidence" in trait_data:
                        evidence = trait_data["evidence"]
                        if evidence:
                            sample_content += " ".join(
                                evidence[:2]
                            )  # First 2 quotes per trait

                if sample_content:
                    logger.info(
                        "[DYNAMIC_DOMAIN] 🔍 Detecting research domain from persona evidence..."
                    )
                    domain_info = (
                        keyword_highlighter.detect_research_domain_and_keywords(
                            sample_content
                        )
                    )

                    logger.info(
                        f"[DYNAMIC_DOMAIN] 📊 Detected domain: {domain_info['domain']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] 🏭 Industry context: {domain_info['industry']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] 🔑 Core terms: {domain_info['core_terms']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] ⚙️ Technical terms: {domain_info['technical_terms']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] 💭 Emotional terms: {domain_info['emotional_terms']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] 📈 Total keywords: {domain_info['total_keywords']}"
                    )
                    logger.info(
                        f"[DYNAMIC_DOMAIN] 🎯 Confidence: {domain_info['confidence']:.2f}"
                    )

                    # CRITICAL FIX: Apply detected domain keywords to all personas
                    detected_keywords = domain_info.get("all_keywords", [])
                    if detected_keywords:
                        logger.info(
                            f"[DYNAMIC_DOMAIN] 🔧 Applying {len(detected_keywords)} domain keywords to persona evidence..."
                        )

                        # Apply domain-specific highlighting to all personas
                        for i, persona in enumerate(personas):
                            persona_name = persona.get("name", f"Persona {i+1}")
                            personas[i] = apply_domain_keywords_to_persona(
                                persona, detected_keywords, persona_name
                            )
                    else:
                        logger.warning(
                            "[DYNAMIC_DOMAIN] ⚠️ No domain keywords detected to apply"
                        )

                    # QUALITY GATE: Check for traits that need regeneration due to low alignment
                    personas = validate_and_regenerate_low_quality_traits(
                        personas, evidence_validator
                    )
                else:
                    logger.warning(
                        "[DYNAMIC_DOMAIN] ⚠️ No sample content available for domain detection"
                    )

            logger.info(
                "[ENHANCED_VALIDATION] 🔍 Starting evidence and highlighting validation..."
            )

            for i, persona in enumerate(personas):
                persona_name = persona.get("name", f"Persona {i+1}")

                # Validate evidence for this persona
                validation_results = evidence_validator.validate_persona_evidence(
                    persona
                )

                # Check for validation failures
                failed_traits = []
                highlighting_issues = []

                for trait_name, result in validation_results.items():
                    if not result.is_valid:
                        failed_traits.append(trait_name)

                        # Add specific issues
                        for issue in result.issues:
                            if "Generic words highlighted" in issue:
                                highlighting_issues.append(f"{trait_name}: {issue}")
                            elif "Low semantic alignment" in issue:
                                quality_issues.append(
                                    {
                                        "persona": persona_name,
                                        "issue": "semantic_misalignment",
                                        "trait": trait_name,
                                        "score": result.semantic_alignment_score,
                                        "message": f"Evidence doesn't support {trait_name} description (score: {result.semantic_alignment_score:.2f})",
                                    }
                                )

                # Check keyword highlighting quality across all traits
                all_evidence_quotes = []
                for trait_name in [
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                ]:
                    trait_data = persona.get(trait_name, {})
                    if isinstance(trait_data, dict) and "evidence" in trait_data:
                        all_evidence_quotes.extend(trait_data.get("evidence", []))

                if all_evidence_quotes:
                    highlighting_quality = (
                        keyword_highlighter.validate_highlighting_quality(
                            all_evidence_quotes
                        )
                    )

                    if highlighting_quality["generic_ratio"] > 0.3:
                        quality_issues.append(
                            {
                                "persona": persona_name,
                                "issue": "poor_keyword_highlighting",
                                "generic_ratio": highlighting_quality["generic_ratio"],
                                "message": f"Too many generic words highlighted ({highlighting_quality['generic_ratio']:.1%})",
                            }
                        )

                    if highlighting_quality["domain_ratio"] < 0.2:
                        quality_issues.append(
                            {
                                "persona": persona_name,
                                "issue": "insufficient_domain_highlighting",
                                "domain_ratio": highlighting_quality["domain_ratio"],
                                "message": f"Insufficient domain-specific highlighting ({highlighting_quality['domain_ratio']:.1%})",
                            }
                        )

                # Log validation summary for this persona
                if failed_traits:
                    logger.warning(
                        f"[ENHANCED_VALIDATION] ⚠️ {persona_name}: Failed validation for {len(failed_traits)} traits: {', '.join(failed_traits)}"
                    )
                else:
                    logger.info(
                        f"[ENHANCED_VALIDATION] ✅ {persona_name}: Passed evidence validation"
                    )

            logger.info(
                "[ENHANCED_VALIDATION] 🔍 Evidence and highlighting validation completed"
            )

        except Exception as e:
            logger.error(
                f"[ENHANCED_VALIDATION] Error during enhanced validation: {str(e)}",
                exc_info=True,
            )
            # Don't fail the entire process due to validation errors
