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
from backend.models.enhanced_persona_models import EnhancedPersona as PersonaModel
from backend.domain.models.persona_schema import StructuredDemographics, AttributedField

# Import enhanced JSON parsing (kept for fallback compatibility)
from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair

# Import our modules
from .transcript_structuring_service import TranscriptStructuringService
from .attribute_extractor import AttributeExtractor
from .persona_builder import PersonaBuilder, persona_to_dict, Persona
from .prompts import PromptGenerator
from .evidence_linking_service import EvidenceLinkingService
from .trait_formatting_service import TraitFormattingService
from backend.utils.pydantic_ai_retry import (
    safe_pydantic_ai_call,
    get_conservative_retry_config,
)

# Import JSON validation utilities
import json
from typing import Dict, Any

import re

# Import new validation and highlighting services
from .evidence_validator import EvidenceValidator, ValidationResult
from .keyword_highlighter import ContextAwareKeywordHighlighter

try:
    from backend.services.processing.persona_formation_v2 import PersonaFormationFacade
except Exception:
    from services.processing.persona_formation_v2 import PersonaFormationFacade


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
                enhanced_evidence: List[str] = []
                for item in evidence_list:
                    quote = (
                        item
                        if isinstance(item, str)
                        else (item.get("quote") if isinstance(item, dict) else None)
                    )
                    if not isinstance(quote, str) or not quote:
                        continue
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


async def validate_and_regenerate_low_quality_traits_parallel(
    personas: List[Dict[str, Any]], evidence_validator
) -> List[Dict[str, Any]]:
    """
    Validate persona traits and regenerate those with low alignment scores using parallel processing.

    Args:
        personas: List of persona dictionaries
        evidence_validator: Evidence validator instance

    Returns:
        Updated personas with improved trait quality
    """
    logger = logging.getLogger(__name__)

    if not personas:
        return personas

    # Create parallel tasks for persona validation and regeneration
    async def validate_and_regenerate_persona(
        i: int, persona: Dict[str, Any]
    ) -> tuple[int, Dict[str, Any]]:
        """Validate and regenerate traits for a single persona."""
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

        # Regenerate problematic traits using parallel method
        if traits_to_regenerate:
            updated_persona = await regenerate_persona_traits_parallel(
                persona, traits_to_regenerate, persona_name
            )
            return i, updated_persona, len(traits_to_regenerate)
        else:
            return i, persona, 0

    # Execute all persona validations and regenerations in parallel
    logger.info(
        f"[QUALITY_GATE] 🚀 Starting parallel validation and regeneration for {len(personas)} personas"
    )

    tasks = [
        validate_and_regenerate_persona(i, persona)
        for i, persona in enumerate(personas)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Apply results back to personas list
    updated_personas = [None] * len(personas)
    total_regeneration_count = 0

    for result in results:
        if isinstance(result, Exception):
            logger.error(f"[QUALITY_GATE] ❌ Error validating persona: {str(result)}")
            continue

        i, updated_persona, regeneration_count = result
        updated_personas[i] = updated_persona
        total_regeneration_count += regeneration_count

    # Filter out any None values (from errors)
    updated_personas = [p for p in updated_personas if p is not None]

    if total_regeneration_count > 0:
        logger.info(
            f"[QUALITY_GATE] ✅ Parallel regeneration completed: {total_regeneration_count} low-quality traits regenerated across {len(updated_personas)} personas"
        )
    else:
        logger.info("[QUALITY_GATE] ✅ All traits passed quality validation")

    return updated_personas


def validate_and_regenerate_low_quality_traits(
    personas: List[Dict[str, Any]], evidence_validator
) -> List[Dict[str, Any]]:
    """
    Validate persona traits and regenerate those with low alignment scores.

    This is a synchronous wrapper around the parallel implementation for backward compatibility.

    Args:
        personas: List of persona dictionaries
        evidence_validator: Evidence validator instance

    Returns:
        Updated personas with improved trait quality
    """
    # Run the parallel version in the current event loop
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If we're already in an async context, create a task
            return asyncio.create_task(
                validate_and_regenerate_low_quality_traits_parallel(
                    personas, evidence_validator
                )
            )
        else:
            # If not in async context, run directly
            return loop.run_until_complete(
                validate_and_regenerate_low_quality_traits_parallel(
                    personas, evidence_validator
                )
            )
    except RuntimeError:
        # Fallback to sequential processing if async context issues
        logger = logging.getLogger(__name__)
        logger.warning(
            "[QUALITY_GATE] ⚠️ Falling back to sequential trait validation and regeneration"
        )

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


async def regenerate_persona_traits_parallel(
    persona: Dict[str, Any], traits_to_regenerate: List[str], persona_name: str
) -> Dict[str, Any]:
    """
    Regenerate specific persona traits with improved evidence alignment using parallel processing.

    Args:
        persona: Persona dictionary
        traits_to_regenerate: List of trait names to regenerate
        persona_name: Name of the persona for logging

    Returns:
        Updated persona with regenerated traits
    """
    logger = logging.getLogger(__name__)

    if not traits_to_regenerate:
        return persona

    # Create parallel tasks for trait regeneration
    async def regenerate_single_trait(trait_name: str) -> tuple[str, Dict[str, Any]]:
        """Regenerate a single trait and return the result."""
        trait_data = persona.get(trait_name, {}).copy()

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

        return trait_name, trait_data

    # Execute all trait regenerations in parallel
    logger.info(
        f"[TRAIT_REGENERATION] 🚀 Starting parallel regeneration of {len(traits_to_regenerate)} traits for {persona_name}"
    )

    tasks = [regenerate_single_trait(trait_name) for trait_name in traits_to_regenerate]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Apply results back to persona
    updated_persona = persona.copy()
    successful_regenerations = 0

    for result in results:
        if isinstance(result, Exception):
            logger.error(
                f"[TRAIT_REGENERATION] ❌ Error regenerating trait: {str(result)}"
            )
            continue

        trait_name, trait_data = result
        updated_persona[trait_name] = trait_data
        successful_regenerations += 1

    logger.info(
        f"[TRAIT_REGENERATION] ✅ Parallel regeneration completed: {successful_regenerations}/{len(traits_to_regenerate)} traits updated for {persona_name}"
    )

    return updated_persona


def regenerate_persona_traits(
    persona: Dict[str, Any], traits_to_regenerate: List[str], persona_name: str
) -> Dict[str, Any]:
    """
    Regenerate specific persona traits with improved evidence alignment.

    This is a synchronous wrapper around the parallel implementation for backward compatibility.

    Args:
        persona: Persona dictionary
        traits_to_regenerate: List of trait names to regenerate
        persona_name: Name of the persona for logging

    Returns:
        Updated persona with regenerated traits
    """
    # Run the parallel version in the current event loop
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If we're already in an async context, create a task
            return asyncio.create_task(
                regenerate_persona_traits_parallel(
                    persona, traits_to_regenerate, persona_name
                )
            )
        else:
            # If not in async context, run directly
            return loop.run_until_complete(
                regenerate_persona_traits_parallel(
                    persona, traits_to_regenerate, persona_name
                )
            )
    except RuntimeError:
        # Fallback to sequential processing if async context issues
        logger = logging.getLogger(__name__)
        logger.warning(
            f"[TRAIT_REGENERATION] ⚠️ Falling back to sequential processing for {persona_name}"
        )

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
    from backend.services.llm.base_llm_service import BaseLLMService as ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from backend.services.llm.base_llm_service import BaseLLMService as ILLMService
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
        from backend.infrastructure.events.event_manager import event_manager, EventType

        logger = logging.getLogger(__name__)
        logger.info(
            "Successfully imported event_manager from backend.infrastructure.events"
        )
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
                from backend.infrastructure.state.events import event_manager, EventType

                logger = logging.getLogger(__name__)
                logger.info(
                    "Using fallback event_manager from backend.infrastructure.state.events"
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

        # NEW: Initialize production persona generation agent (unified schema)
        self._initialize_production_persona_agent()

        # NEW: Initialize direct persona generation agent (eliminates conversion step)
        self._initialize_direct_persona_agent()

        # No longer using TranscriptProcessor - all functionality is now in TranscriptStructuringService
        logger.info("Using TranscriptStructuringService for transcript processing")
        logger.info("Using EvidenceLinkingService for enhanced evidence linking")
        logger.info("Using TraitFormattingService for improved trait value formatting")
        logger.info(
            "Using PydanticAI for structured persona outputs (migrated from Instructor)"
        )
        # Initialize V2 facade (modular) for opt-in usage via feature flag
        self._v2_facade = None
        try:
            self._v2_facade = PersonaFormationFacade(llm_service)
            logger.info("Initialized PersonaFormationFacade (V2)")
        except Exception as e:
            logger.warning(f"Could not initialize PersonaFormationFacade: {e}")

    def _use_v2(self) -> bool:
        """Feature flag gate for PERSONA_FORMATION_V2."""
        return os.getenv("PERSONA_FORMATION_V2", "false").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

    def _validate_structured_demographics(self, demographics_data: Any) -> bool:
        """
        Validate that demographics data is properly formatted, supporting both
        legacy StructuredDemographics and new ProductionPersona PersonaTrait formats.

        This method is now more lenient for PydanticAI outputs and handles
        multiple data formats gracefully.

        Returns True if valid, False if corrupted.
        """
        try:
            # Handle None or empty data
            if demographics_data is None:
                logger.info(
                    "[DEMOGRAPHICS_VALIDATION] Demographics data is None, skipping validation"
                )
                return True

            # NEW: Support for PersonaTrait objects (ProductionPersona format)
            from backend.domain.models.production_persona import PersonaTrait

            if isinstance(demographics_data, PersonaTrait):
                logger.info(
                    "[DEMOGRAPHICS_VALIDATION] Found PersonaTrait object, validating structure"
                )
                # Validate PersonaTrait has required fields
                if hasattr(demographics_data, "value") and hasattr(
                    demographics_data, "evidence"
                ):
                    logger.info(
                        "[DEMOGRAPHICS_VALIDATION] PersonaTrait validation passed"
                    )
                    return True
                else:
                    logger.warning(
                        "[DEMOGRAPHICS_VALIDATION] PersonaTrait missing value or evidence fields"
                    )
                    return False

            # Handle dictionary format (frontend/API format)
            if isinstance(demographics_data, dict):
                logger.info(
                    "[DEMOGRAPHICS_VALIDATION] Found dictionary format, validating structure"
                )
                # Check if it looks like a PersonaTrait dict
                if "value" in demographics_data and "evidence" in demographics_data:
                    logger.info(
                        "[DEMOGRAPHICS_VALIDATION] Dictionary PersonaTrait format validation passed"
                    )
                    return True
                # Allow other dictionary formats to pass through
                logger.info(
                    "[DEMOGRAPHICS_VALIDATION] Dictionary format validation passed"
                )
                return True

            # Convert to string for analysis - use proper JSON serialization to avoid constructor syntax
            if hasattr(demographics_data, "model_dump_json"):
                # Pydantic model - use JSON serialization to avoid AttributedField constructor syntax
                data_str = demographics_data.model_dump_json()
                logger.debug(
                    "[CORRUPTION_FIX] Using JSON serialization for demographics validation"
                )
            else:
                # Fallback for non-Pydantic objects
                data_str = str(demographics_data)
                logger.debug(
                    "[CORRUPTION_FIX] Using str() fallback for non-Pydantic object"
                )

            # RELAXED: Only check for severe corruption indicators
            # Removed overly strict patterns that could reject valid PydanticAI output
            severe_corruption_indicators = [
                "AttributedField(",  # Python constructor calls (should not appear in JSON)
                "StructuredDemographics(",  # Class constructor calls
                "evidence=[",  # Evidence arrays as strings (should not appear in JSON)
            ]

            for indicator in severe_corruption_indicators:
                if indicator in data_str:
                    logger.warning(
                        f"[DEMOGRAPHICS_VALIDATION] Potential corruption detected: {indicator} found in demographics data"
                    )
                    # Continue validation instead of immediately failing

            # LEGACY: If it's a StructuredDemographics object, validate its structure
            if isinstance(demographics_data, StructuredDemographics):
                logger.info(
                    "[DEMOGRAPHICS_VALIDATION] Found StructuredDemographics object, validating legacy format"
                )
                # Check that AttributedField objects are properly structured
                for field_name in [
                    "experience_level",
                    "industry",
                    "location",
                    "age_range",
                    "professional_context",
                    "roles",
                ]:
                    field_value = getattr(demographics_data, field_name, None)
                    if field_value is not None:
                        if not isinstance(field_value, AttributedField):
                            logger.warning(
                                f"[DEMOGRAPHICS_VALIDATION] Field {field_name} is not an AttributedField: {type(field_value)} - allowing anyway"
                            )
                            # Don't fail for this, just log it
                            continue

                        # Validate AttributedField structure
                        if not hasattr(field_value, "value") or not hasattr(
                            field_value, "evidence"
                        ):
                            logger.warning(
                                f"[DEMOGRAPHICS_VALIDATION] AttributedField {field_name} missing value or evidence - allowing anyway"
                            )
                            # Don't fail for this, just log it
                            continue

            logger.info(
                "[DEMOGRAPHICS_VALIDATION] Demographics validation passed (relaxed validation for PydanticAI compatibility)"
            )
            return True

        except Exception as e:
            logger.warning(
                f"[DEMOGRAPHICS_VALIDATION] Validation error (allowing anyway): {e}"
            )
            # Be more permissive - don't fail the entire persona generation for validation issues
            return True

    def _create_clean_fallback_demographics(
        self, persona_name: str = "Unknown"
    ) -> StructuredDemographics:
        """Thin delegator to persona_formation.fallbacks.demographics.create_clean_fallback_demographics."""
        from backend.services.processing.persona_formation.fallbacks.demographics import (
            create_clean_fallback_demographics as _clean,
        )

        return _clean(self._validate_structured_demographics, persona_name)

    def _create_fallback_stakeholder_persona(
        self,
        stakeholder_category: str,
        stakeholder_text: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a fallback persona when PydanticAI fails to generate a valid persona.

        This ensures that stakeholder analysis doesn't fail completely when
        individual personas can't be generated.
        """
        try:
            from backend.domain.models.production_persona import PersonaTrait

            # Extract basic info from text for fallback
            text_sample = (
                stakeholder_text[:200]
                if stakeholder_text
                else "Limited content available"
            )

            # Create a basic persona structure using ProductionPersona format
            fallback_persona = {
                "name": f"{stakeholder_category}",
                "description": f"Representative of {stakeholder_category} based on available interview data",
                "archetype": stakeholder_category,
                "demographics": {
                    "value": f"{stakeholder_category} with professional background",
                    "confidence": 0.3,
                    "evidence": [
                        f"Inferred from {stakeholder_category} interview content"
                    ],
                },
                "goals_and_motivations": {
                    "value": f"Goals and motivations typical of {stakeholder_category}",
                    "confidence": 0.3,
                    "evidence": [f"Based on {stakeholder_category} context"],
                },
                "challenges_and_frustrations": {
                    "value": f"Challenges commonly faced by {stakeholder_category}",
                    "confidence": 0.3,
                    "evidence": [f"Inferred from interview context"],
                },
                "key_quotes": {
                    "value": text_sample,
                    "confidence": 0.5,
                    "evidence": [text_sample],
                },
                "overall_confidence": 0.3,
                "metadata": {
                    "is_fallback": True,
                    "generation_method": "fallback_stakeholder",
                    "stakeholder_category": stakeholder_category,
                    "text_length": len(stakeholder_text) if stakeholder_text else 0,
                },
            }

            # Calculate influence metrics for fallback persona
            try:
                influence_metrics = self._calculate_persona_influence_metrics(
                    fallback_persona
                )
                fallback_persona["stakeholder_intelligence"] = {
                    "influence_metrics": influence_metrics
                }
                logger.info(
                    f"[FALLBACK_PERSONA] Added influence metrics for {stakeholder_category}: "
                    f"decision_power={influence_metrics.get('decision_power', 0.5):.2f}, "
                    f"technical_influence={influence_metrics.get('technical_influence', 0.5):.2f}, "
                    f"budget_influence={influence_metrics.get('budget_influence', 0.5):.2f}"
                )
            except Exception as influence_error:
                logger.error(
                    f"[FALLBACK_PERSONA] Failed to calculate influence metrics for {stakeholder_category}: {influence_error}"
                )
                # Use default values if calculation fails
                fallback_persona["stakeholder_intelligence"] = {
                    "influence_metrics": {
                        "decision_power": 0.5,
                        "technical_influence": 0.5,
                        "budget_influence": 0.5,
                    }
                }

            logger.info(
                f"[FALLBACK_PERSONA] Created fallback persona for {stakeholder_category}"
            )

            return fallback_persona

        except Exception as e:
            logger.error(
                f"[FALLBACK_PERSONA] Error creating fallback persona for {stakeholder_category}: {e}"
            )
            return None

    def _create_minimal_fallback_demographics(self) -> StructuredDemographics:
        """Thin delegator to persona_formation.fallbacks.demographics.create_minimal_fallback_demographics."""
        from backend.services.processing.persona_formation.fallbacks.demographics import (
            create_minimal_fallback_demographics as _minimal,
        )

        return _minimal()

    def _initialize_pydantic_ai_agent(self):
        """Thin delegator to persona_formation.agents.initializers.initialize_pydantic_ai_agent."""
        from backend.services.processing.persona_formation.agents.initializers import (
            initialize_pydantic_ai_agent as _init,
        )

        agent, available = _init()
        self.persona_agent = agent
        self.pydantic_ai_available = available

    def _initialize_production_persona_agent(self):
        """Thin delegator to persona_formation.agents.initializers.initialize_production_persona_agent."""
        from backend.services.processing.persona_formation.agents.initializers import (
            initialize_production_persona_agent as _init,
        )

        agent, available = _init()
        self.production_persona_agent = agent
        self.production_persona_available = available

    def _initialize_direct_persona_agent(self):
        """Thin delegator to persona_formation.agents.initializers.initialize_direct_persona_agent."""
        from backend.services.processing.persona_formation.agents.initializers import (
            initialize_direct_persona_agent as _init,
        )

        agent, available = _init()
        self.direct_persona_agent = agent
        self.direct_persona_available = available

    async def _generate_production_persona(
        self,
        speaker: str,
        text: str,
        role: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate persona using the production-ready ProductionPersona model.

        This method eliminates schema conflicts by generating personas that match
        frontend expectations exactly, with consistent PersonaTrait structure.

        Args:
            speaker: Speaker identifier
            text: Full text content for the speaker
            role: Speaker role (Interviewee, Interviewer, etc.)
            context: Optional context information

        Returns:
            Dictionary in final persona format (production-ready)
        """
        try:
            if (
                not self.production_persona_available
                or not self.production_persona_agent
            ):
                logger.warning(
                    f"[PRODUCTION_PERSONA] Production persona agent not available for {speaker}, falling back to direct method"
                )
                # Fall back to direct persona method
                return await self._generate_direct_persona(speaker, text, role, context)

            logger.info(
                f"[PRODUCTION_PERSONA] Generating production persona for {speaker} using ProductionPersona model"
            )

            # Create analysis prompt
            analysis_prompt = f"""
SPEAKER ANALYSIS REQUEST:
Speaker: {speaker}
Role: {role}
Context: {context.get('industry', 'general') if context else 'general'}

TRANSCRIPT CONTENT:
{text}

Please analyze this speaker's content and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine quotes, and realistic behavioral patterns.

Generate a complete ProductionPersona object with all required traits populated based on the available evidence."""

            # Call the production persona agent
            logger.info(
                f"[PRODUCTION_PERSONA] Calling production persona agent for {speaker}"
            )

            # Use conservative retry config for reliability
            retry_config = get_conservative_retry_config()

            persona_result = await safe_pydantic_ai_call(
                agent=self.production_persona_agent,
                prompt=analysis_prompt,
                context=f"Production persona generation for {speaker}",
                retry_config=retry_config,
            )

            logger.info(
                f"[PRODUCTION_PERSONA] Successfully generated production persona for {speaker}: {persona_result.name}"
            )

            # Convert to frontend-compatible dictionary
            persona_dict = persona_result.to_frontend_dict()

            # Add metadata
            from backend.services.processing.persona_formation_v1.hygiene.metadata_filter import (
                add_generation_metadata as _add_meta,
            )

            _add_meta(
                persona_dict,
                speaker=speaker,
                generation_method="production_pydantic_ai",
                extra={
                    "content_length": len(text),
                    "quality_score": persona_result.get_quality_score(),
                },
            )

            logger.info(
                f"[PRODUCTION_PERSONA] Production persona generation completed for {speaker} - production ready!"
            )

            return persona_dict

        except Exception as e:
            logger.error(
                f"[PRODUCTION_PERSONA] Error generating production persona for {speaker}: {str(e)}",
                exc_info=True,
            )
            # Fall back to direct persona method
            logger.info(
                f"[PRODUCTION_PERSONA] Falling back to direct method for {speaker}"
            )
            return await self._generate_direct_persona(speaker, text, role, context)

    async def _generate_direct_persona(
        self,
        speaker: str,
        text: str,
        role: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate persona directly using the DirectPersona model without conversion.

        This method eliminates the fragile two-step conversion process by generating
        the final persona structure directly from PydanticAI.

        Args:
            speaker: Speaker identifier
            text: Full text content for the speaker
            role: Speaker role (Interviewee, Interviewer, etc.)
            context: Optional context information

        Returns:
            Dictionary in final persona format (no conversion needed)
        """
        try:
            if not self.direct_persona_available or not self.direct_persona_agent:
                logger.warning(
                    f"[DIRECT_PERSONA] Direct persona agent not available for {speaker}, falling back to legacy method"
                )
                # Fall back to the existing method
                return await self._generate_single_persona_with_semaphore(
                    speaker, text, role, asyncio.Semaphore(1), 1, context
                )

            logger.info(
                f"[DIRECT_PERSONA] Generating direct persona for {speaker} using DirectPersona model"
            )

            # Create analysis prompt
            analysis_prompt = f"""
SPEAKER ANALYSIS REQUEST:
Speaker: {speaker}
Role: {role}
Context: {context.get('industry', 'general') if context else 'general'}

TRANSCRIPT CONTENT:
{text}

Please analyze this speaker's content and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine quotes, and realistic behavioral patterns.

Generate a complete DirectPersona object with all required traits populated based on the available evidence."""

            # Call the direct persona agent
            logger.info(f"[DIRECT_PERSONA] Calling direct persona agent for {speaker}")

            # Use conservative retry config for reliability
            retry_config = get_conservative_retry_config()

            persona_result = await safe_pydantic_ai_call(
                agent=self.direct_persona_agent,
                prompt=analysis_prompt,
                context=f"Direct persona generation for {speaker}",
                retry_config=retry_config,
            )

            logger.info(
                f"[DIRECT_PERSONA] Successfully generated direct persona for {speaker}: {persona_result.name}"
            )

            # Convert to dictionary (no complex conversion needed!)
            persona_dict = persona_result.model_dump()

            # Add metadata
            from backend.services.processing.persona_formation_v1.hygiene.metadata_filter import (
                add_generation_metadata as _add_meta,
            )

            _add_meta(
                persona_dict,
                speaker=speaker,
                generation_method="direct_pydantic_ai",
                extra={"sample_size": len(text)},
            )

            logger.info(
                f"[DIRECT_PERSONA] Direct persona generation completed for {speaker} - no conversion needed!"
            )

            return persona_dict

        except Exception as e:
            logger.error(
                f"[DIRECT_PERSONA] Error generating direct persona for {speaker}: {str(e)}",
                exc_info=True,
            )
            # Fall back to the existing method
            logger.info(f"[DIRECT_PERSONA] Falling back to legacy method for {speaker}")
            return await self._generate_single_persona_with_semaphore(
                speaker, text, role, asyncio.Semaphore(1), 1, context
            )

    async def form_personas(
        self, patterns: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Thin delegator to the extracted orchestrator for pattern-based persona formation.
        Behavior preserved; reduces LOC in this service.
        """
        try:
            from backend.services.processing.persona_formation_v1.orchestrators import (
                pattern_persona_orchestrator as _pat,
            )
        except Exception as _imp_err:
            logger = logging.getLogger(__name__)
            logger.error(f"[FORM_PERSONAS_DELEGATE] Import failed: {_imp_err}")
            return []

        try:
            return await _pat.form_personas(
                self, patterns, context, event_manager, EventType
            )
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(
                f"[FORM_PERSONAS_DELEGATE] Delegation failed: {e}", exc_info=True
            )
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
        # V2 feature-flagged path
        if self._use_v2() and self._v2_facade is not None:
            try:
                return await self._v2_facade.generate_persona_from_text(
                    text, context=context
                )
            except Exception as e:
                logger.warning(f"V2 facade failed, falling back to V1: {e}")

        try:
            logger.info(f"Generating persona from text of type {type(text)}")

            # Check if text is empty or too short
            from backend.services.processing.persona_formation_v1.hygiene.content_filter import (
                is_empty_or_short_text as _short,
            )

            if _short(text, 10):
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

            # If LLM structuring fails, try to generate personas directly from raw text
            logger.warning(
                "LLM-based transcript structuring failed or returned empty. Attempting direct persona generation from raw text."
            )

            try:
                # Try to generate personas directly from the raw text without structuring
                logger.info(
                    "Attempting direct persona generation from raw text as fallback"
                )

                # Create a simple mock transcript structure
                mock_transcript = [
                    {
                        "speaker_id": "Participant",
                        "role": "Interviewee",
                        "dialogue": (
                            text[:50000] if len(text) > 50000 else text
                        ),  # Limit to 50K chars to avoid timeout
                    }
                ]

                # Try to form personas from this mock transcript
                personas = await self.form_personas_from_transcript(
                    mock_transcript, context=context
                )

                if personas and len(personas) > 0:
                    logger.info(
                        f"Successfully generated {len(personas)} personas using direct fallback method"
                    )
                    return personas
                else:
                    logger.warning(
                        "Direct persona generation also failed, returning empty list"
                    )
                    return []

            except Exception as fallback_error:
                logger.error(
                    f"Direct persona generation fallback failed: {str(fallback_error)}"
                )
                return []

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

    async def generate_persona_from_text_fast(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Fast persona generation that bypasses costly transcript structuring.
        Uses the same high-quality persona formation logic as debug mode.

        This method provides the reliability of debug mode while maintaining
        the quality of the current workflow by skipping the transcript structuring
        bottleneck and going directly to persona formation.

        Args:
            text: Raw interview text
            context: Optional context information

        Returns:
            List of persona dictionaries with full quality and evidence
        """
        logger.info(
            "Starting fast persona generation (bypassing transcript structuring)"
        )

        from backend.services.processing.persona_formation_v1.hygiene.content_filter import (
            is_empty_or_short_text as _short,
        )

        if _short(text, 1):
            logger.warning("Empty text provided for fast persona generation")
            return []

        # Log text length for debugging
        logger.info(f"Fast persona generation - Text length: {len(text)} characters")

        try:
            # Create a simple mock transcript structure directly
            # This mimics what debug mode does when transcript structuring fails
            mock_transcript = [
                {
                    "speaker_id": "Participant",
                    "role": "Interviewee",
                    "dialogue": (
                        text[:100000] if len(text) > 100000 else text
                    ),  # Limit to 100K chars to avoid timeout
                }
            ]

            logger.info("Created mock transcript structure for fast persona generation")

            # Use the same high-quality persona formation logic
            personas = await self.form_personas_from_transcript(
                mock_transcript, context=context
            )

            if personas and len(personas) > 0:
                logger.info(
                    f"Fast persona generation successful: {len(personas)} personas generated"
                )
                return personas
            else:
                logger.warning("Fast persona generation returned empty results")
                return []

        except Exception as e:
            logger.error(f"Error in fast persona generation: {str(e)}")
            return []

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
        # V2 feature-flagged path
        if self._use_v2() and self._v2_facade is not None:
            try:
                return await self._v2_facade.form_personas_from_transcript(
                    transcript, participants, context
                )
            except Exception as e:
                logger.warning(
                    f"V2 facade (transcript) failed, falling back to V1: {e}"
                )

        # Use the new parallel implementation via orchestrator seam
        try:
            from backend.services.processing.persona_formation_v1.orchestrators import (
                transcript_persona_orchestrator as _tx,
            )
        except Exception as _imp_err:
            logger = logging.getLogger(__name__)
            logger.error(f"[TRANSCRIPT_DELEGATE] Import failed: {_imp_err}")
            # Fall back to in-file implementation
            return await self._form_personas_from_transcript_parallel(
                transcript, participants, context
            )
        return await _tx.form_personas_from_transcript_parallel(
            self, transcript, participants, context
        )

    async def form_personas_by_stakeholder(
        self,
        stakeholder_segments: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Thin delegator to the extracted orchestrator for stakeholder-aware persona formation.
        Behavior preserved; reduces LOC in this service.
        """
        try:
            from backend.services.processing.persona_formation_v1.orchestrators import (
                stakeholder_persona_orchestrator as _stk,
            )
        except Exception as _imp_err:
            logger = logging.getLogger(__name__)
            logger.error(f"[STAKEHOLDER_DELEGATE] Import failed: {_imp_err}")
            # Fall back to flattened processing
            all_segments = []
            try:
                for segment_data in stakeholder_segments.values():
                    all_segments.extend(segment_data.get("segments", []))
            except Exception:
                pass
            return await self.form_personas_from_transcript(
                all_segments, context=context
            )

        try:
            return await _stk.form_personas_by_stakeholder(
                self, stakeholder_segments, context
            )
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(
                f"[STAKEHOLDER_DELEGATE] Delegation failed: {e}", exc_info=True
            )
            # Fall back to flattened processing
            all_segments = []
            try:
                for segment_data in stakeholder_segments.values():
                    all_segments.extend(segment_data.get("segments", []))
            except Exception:
                pass
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

            # Combine all text for this stakeholder (exclude non-interviewee speakers)
            from backend.services.processing.persona_formation_v1.hygiene.speaker_filter import (
                aggregate_stakeholder_text_excluding_non_interviewers as _agg,
            )

            stakeholder_text, speakers = _agg(segments)

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

            # Enhanced logging: Track generation attempt
            logger.info(
                f"[STAKEHOLDER_SPECIFIC] Attempting to generate persona for {stakeholder_category}"
            )

            # Generate persona with enhanced error tracking
            try:
                persona = await self._generate_single_stakeholder_persona(
                    stakeholder_text, stakeholder_category, enhanced_context
                )

                if persona:
                    personas.append(persona)
                    logger.info(
                        f"[STAKEHOLDER_SPECIFIC] ✅ Successfully generated persona for {stakeholder_category}: {persona.get('name', 'Unknown')}"
                    )

                    # Check if it's a fallback persona
                    if persona.get("metadata", {}).get("is_fallback", False):
                        logger.warning(
                            f"[STAKEHOLDER_SPECIFIC] ⚠️ Generated fallback persona for {stakeholder_category}"
                        )
                    else:
                        logger.info(
                            f"[STAKEHOLDER_SPECIFIC] 🎯 Generated full persona for {stakeholder_category}"
                        )
                else:
                    logger.error(
                        f"[STAKEHOLDER_SPECIFIC] ❌ Failed to generate persona for {stakeholder_category} - returned None"
                    )

            except Exception as generation_error:
                logger.error(
                    f"[STAKEHOLDER_SPECIFIC] ❌ Exception during persona generation for {stakeholder_category}: {generation_error}",
                    exc_info=True,
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
            retry_config = get_conservative_retry_config()

            persona_result = await safe_pydantic_ai_call(
                agent=self.persona_agent,
                prompt=prompt,
                context=f"Stakeholder-specific persona generation for {stakeholder_category}",
                retry_config=retry_config,
            )

            # DEBUG: Log what we actually received from PydanticAI
            logger.info(f"[DEBUG_FIX] persona_result type: {type(persona_result)}")
            logger.info(f"[DEBUG_FIX] persona_result is truthy: {bool(persona_result)}")
            if hasattr(persona_result, "__dict__"):
                logger.info(
                    f"[DEBUG_FIX] persona_result attributes: {list(persona_result.__dict__.keys())}"
                )

            if persona_result:
                # safe_pydantic_ai_call already extracts the output, so persona_result is the data directly
                persona_data = persona_result
                logger.info(f"[DEBUG_FIX] persona_data type: {type(persona_data)}")
                logger.info(
                    f"[DEBUG_FIX] persona_data has name: {hasattr(persona_data, 'name') if persona_data else 'N/A'}"
                )

                # NEW: More flexible validation for PydanticAI outputs
                # Check if we have a valid persona structure instead of strict demographics validation
                if hasattr(persona_data, "demographics"):
                    logger.info(
                        f"[PYDANTIC_AI_VALIDATION] Validating demographics for {stakeholder_category} using relaxed validation"
                    )

                    # Use the updated, more lenient validation method
                    validation_result = self._validate_structured_demographics(
                        persona_data.demographics
                    )

                    # Log the demographics content for debugging (but don't fail on validation)
                    if hasattr(persona_data.demographics, "model_dump_json"):
                        demographics_json = persona_data.demographics.model_dump_json()
                    elif hasattr(persona_data.demographics, "model_dump"):
                        demographics_json = json.dumps(
                            persona_data.demographics.model_dump()
                        )
                    else:
                        demographics_json = str(persona_data.demographics)

                    logger.info(
                        f"[PYDANTIC_AI_VALIDATION] Demographics for {stakeholder_category} (validation={validation_result}): {demographics_json[:200]}..."
                    )

                    # Don't skip personas based on strict validation anymore
                    # The new validation is more lenient and should pass most valid outputs

                # Convert to dictionary format
                if hasattr(persona_data, "model_dump"):
                    persona_dict = persona_data.model_dump()
                elif hasattr(persona_data, "dict"):
                    persona_dict = persona_data.dict()
                else:
                    persona_dict = dict(persona_data)

                # Ensure we have a valid persona with required fields
                if isinstance(persona_dict, dict) and persona_dict.get("name"):
                    # Calculate influence metrics based on persona characteristics
                    try:
                        influence_metrics = self._calculate_persona_influence_metrics(
                            persona_dict
                        )

                        # Add stakeholder intelligence with calculated influence metrics
                        if "stakeholder_intelligence" not in persona_dict:
                            persona_dict["stakeholder_intelligence"] = {}

                        persona_dict["stakeholder_intelligence"][
                            "influence_metrics"
                        ] = influence_metrics

                        logger.info(
                            f"[SINGLE_STAKEHOLDER] Added influence metrics for {persona_dict.get('name', 'Unknown')}: "
                            f"decision_power={influence_metrics.get('decision_power', 0.5):.2f}, "
                            f"technical_influence={influence_metrics.get('technical_influence', 0.5):.2f}, "
                            f"budget_influence={influence_metrics.get('budget_influence', 0.5):.2f}"
                        )
                    except Exception as influence_error:
                        logger.error(
                            f"[SINGLE_STAKEHOLDER] Failed to calculate influence metrics for {persona_dict.get('name', 'Unknown')}: {influence_error}"
                        )
                        # Use default values if calculation fails
                        if "stakeholder_intelligence" not in persona_dict:
                            persona_dict["stakeholder_intelligence"] = {}
                        persona_dict["stakeholder_intelligence"][
                            "influence_metrics"
                        ] = {
                            "decision_power": 0.5,
                            "technical_influence": 0.5,
                            "budget_influence": 0.5,
                        }

                    # Post-process demographics: extract exact ages from original text and create age_range bucket via LLM
                    try:
                        ctx = context or {}
                        original_text = (
                            ctx.get("original_text")
                            or ctx.get("source_text")
                            or ctx.get("raw_text")
                        )
                        if isinstance(original_text, str) and original_text.strip():
                            import re

                            ages = []
                            evidence_lines = []
                            # Look for header-like lines containing explicit ages
                            for line in original_text.splitlines():
                                m1 = re.search(
                                    r"\b(?:age|years? old)\s*[:\-]?\s*(\d{2})\b",
                                    line,
                                    re.IGNORECASE,
                                )
                                m2 = re.search(
                                    r"\b(\d{2})\s*(?:years? old)\b", line, re.IGNORECASE
                                )
                                age = None
                                if m1:
                                    age = m1.group(1)
                                elif m2:
                                    age = m2.group(1)
                                if age:
                                    try:
                                        age_int = int(age)
                                        if 14 <= age_int <= 99:
                                            ages.append(age_int)
                                            # Bold highlight the age for evidence quoting
                                            highlighted = re.sub(
                                                rf"\b{age}\b",
                                                f"**{age}**",
                                                line.strip(),
                                            )
                                            evidence_lines.append(highlighted[:220])
                                    except Exception:
                                        pass
                            if ages:
                                # Ask LLM to produce a concise bucket for this stakeholder
                                try:
                                    prompt = (
                                        "You are summarizing participant ages for a stakeholder persona. "
                                        "Given the ages: "
                                        + ", ".join(str(a) for a in ages)
                                        + ". Respond with a single concise age range label capturing the cluster, "
                                        "prefer en-dash like '31–35' or 'mid-30s'. Output ONLY the label."
                                    )
                                    llm_resp = await self.llm_service.analyze(
                                        {"task": "text_generation", "text": prompt}
                                    )
                                    bucket = (llm_resp or {}).get(
                                        "text", ""
                                    ).strip() or None
                                except Exception:
                                    bucket = None

                                if bucket:
                                    # Ensure demographics structure exists and inject age_range AttributedField
                                    demo = persona_dict.get("demographics")
                                    if not isinstance(demo, dict):
                                        persona_dict["demographics"] = {
                                            "experience_level": None,
                                            "industry": None,
                                            "location": None,
                                            "professional_context": None,
                                            "roles": None,
                                            "age_range": None,
                                            "confidence": float(
                                                persona_dict.get(
                                                    "overall_confidence", 0.7
                                                )
                                            ),
                                        }
                                        demo = persona_dict["demographics"]
                                    demo["age_range"] = {
                                        "value": bucket,
                                        "evidence": evidence_lines[:5],
                                    }
                    except Exception as age_e:
                        logger.warning(
                            f"[SINGLE_STAKEHOLDER] Age extraction/bucketing skipped due to error: {age_e}"
                        )

                        # Enhance evidence with V2 linking for stakeholder-specific persona
                        try:
                            if getattr(
                                self.evidence_linking_service, "enable_v2", False
                            ):
                                scope_meta = {
                                    "speaker": "Interviewee",
                                    "speaker_role": "Interviewee",
                                    "stakeholder_category": stakeholder_category,
                                }
                                try:
                                    doc_id = None
                                    if context and isinstance(context, dict):
                                        doc_id = context.get("document_id")
                                        # Fallback to stable id when transcripts absent but original_text present
                                        if not doc_id and (
                                            context.get("original_text") or context.get("source_text") or context.get("raw_text")
                                        ):
                                            doc_id = "original_text"
                                    if doc_id:
                                        scope_meta["document_id"] = doc_id
                                except Exception:
                                    pass
                                from backend.services.processing.persona_formation_v1.evidence.linker_adapter import (
                                    link_evidence_v2 as _link_v2,
                                )

                                persona_dict, evidence_map = _link_v2(
                                    self.evidence_linking_service,
                                    persona_dict,
                                    scoped_text=stakeholder_text,
                                    scope_meta=scope_meta,
                                    protect_key_quotes=True,
                                )

                                # Strict generation-time post-filter for demographics
                                try:
                                    ev2 = evidence_map or {}
                                    demo_items = list(ev2.get("demographics", []))
                                    before_cnt = len(demo_items)

                                    def _is_first_person(q: str) -> bool:
                                        ls = (q or "").lower()
                                        padded = f" {ls} "
                                        return any(tok in padded for tok in [" i ", " i'm ", " i’m ", " my ", " we ", " we're ", " we’re ", " our "])

                                    def _has_third_party(q: str) -> bool:
                                        ls = (q or "").lower()
                                        padded = f" {ls} "
                                        return any(tok in padded for tok in [" client", " clients", " policyholder", " policyholders", " customer", " customers", " they ", " their ", " them "])

                                    cleaned = [it for it in demo_items if _is_first_person(it.get("quote")) and not _has_third_party(it.get("quote"))]
                                    ev2["demographics"] = cleaned
                                    after_cnt = len(cleaned)
                                    try:
                                        logger.info(f"[EV2_DEMOGRAPHICS_FILTER] kept={after_cnt}/before={before_cnt}")
                                    except Exception:
                                        pass

                                    # Soft preference filter for goals/challenges
                                    try:
                                        for trait_key in ("goals_and_motivations", "challenges_and_frustrations"):
                                            items = list(ev2.get(trait_key, []) or [])
                                            if not items:
                                                continue
                                            def _is_first_person(q: str) -> bool:
                                                ls = (q or "").lower(); padded = f" {ls} "
                                                return any(tok in padded for tok in [" i ", " i'm ", " i’m ", " my ", " we ", " we're ", " we’re ", " our "])
                                            def _has_third_party(q: str) -> bool:
                                                ls = (q or "").lower(); padded = f" {ls} "
                                                return any(tok in padded for tok in [" client", " clients", " policyholder", " policyholders", " customer", " customers", " they ", " their ", " them "])
                                            gc_filtered = [it for it in items if _is_first_person(it.get("quote")) and not _has_third_party(it.get("quote"))]
                                            if gc_filtered:
                                                ev2[trait_key] = gc_filtered
                                    except Exception:
                                        pass

                                    # Persist cleaned EV2 instrumentation on persona for UI by default
                                    persona_dict["_evidence_linking_v2"] = {"evidence_map": ev2}
                                except Exception as _ev2_err:
                                    logger.debug(f"[EV2_DEMOGRAPHICS_FILTER] skipped due to error: {_ev2_err}")

                                # Ensure age is populated if missing (pattern-based fallback)
                                try:
                                    demo = (
                                        persona_dict.get("demographics")
                                        if isinstance(persona_dict, dict)
                                        else None
                                    )
                                    need_age = True
                                    if isinstance(demo, dict):
                                        ar = demo.get("age_range")
                                        if isinstance(ar, dict) and ar.get("value"):
                                            need_age = False
                                    if need_age:
                                        from backend.services.evidence_intelligence.demographic_intelligence import (
                                            DemographicIntelligence,
                                        )
                                        from backend.services.evidence_intelligence.speaker_intelligence import (
                                            SpeakerProfile,
                                            SpeakerRole,
                                        )

                                        di = DemographicIntelligence(llm_service=None)
                                        sp = SpeakerProfile(
                                            speaker_id=str(stakeholder_category),
                                            role=SpeakerRole.INTERVIEWEE,
                                            unique_identifier=str(stakeholder_category),
                                        )
                                        demographics_data = di._fallback_extraction(
                                            stakeholder_text, sp
                                        )
                                        if demographics_data and (
                                            demographics_data.age_range
                                            or demographics_data.age
                                        ):
                                            age_value = demographics_data.age_range or (
                                                str(demographics_data.age)
                                                if demographics_data.age
                                                else None
                                            )
                                            if age_value:
                                                demo = (
                                                    dict(demo)
                                                    if isinstance(demo, dict)
                                                    else {}
                                                )
                                                existing_evd = []
                                                if isinstance(
                                                    demo.get("age_range"), dict
                                                ):
                                                    existing_evd = (
                                                        demo["age_range"].get(
                                                            "evidence", []
                                                        )
                                                        or []
                                                    )
                                                demo["age_range"] = {
                                                    "value": age_value,
                                                    "evidence": existing_evd,
                                                }
                                                demo["confidence"] = (
                                                    demo.get("confidence", 0.7) or 0.7
                                                )
                                                persona_dict["demographics"] = demo
                                except Exception as _age_err:
                                    logger.debug(
                                        f"[DEMOGRAPHICS] Age fallback extraction skipped (stakeholder persona): {_age_err}"
                                    )

                        except Exception as el_err:
                            logger.warning(
                                f"[EVIDENCE_LINKING_V2] Skipped for stakeholder {stakeholder_category}: {el_err}"
                            )

                    logger.info(
                        f"[SINGLE_STAKEHOLDER] Successfully generated persona: {persona_dict.get('name', 'Unknown')}"
                    )
                    return persona_dict
                else:
                    logger.warning(
                        f"[SINGLE_STAKEHOLDER] Generated persona for {stakeholder_category} missing required fields (name: {persona_dict.get('name', 'Missing')})"
                    )
                    # Try to fix missing name
                    if isinstance(persona_dict, dict) and not persona_dict.get("name"):
                        persona_dict["name"] = f"{stakeholder_category} Persona"
                        logger.info(
                            f"[SINGLE_STAKEHOLDER] Added fallback name for {stakeholder_category}: {persona_dict['name']}"
                        )
                        return persona_dict
            else:
                logger.warning(
                    f"[SINGLE_STAKEHOLDER] No valid persona result for {stakeholder_category}"
                )
                # NEW: Add fallback persona generation when PydanticAI fails
                logger.info(
                    f"[SINGLE_STAKEHOLDER] Attempting to create fallback persona for {stakeholder_category}"
                )

                try:
                    fallback_persona = self._create_fallback_stakeholder_persona(
                        stakeholder_category, stakeholder_text, context
                    )
                    if fallback_persona:
                        logger.info(
                            f"[SINGLE_STAKEHOLDER] Successfully created fallback persona for {stakeholder_category}: {fallback_persona.get('name', 'Unknown')}"
                        )
                        return fallback_persona
                except Exception as fallback_error:
                    logger.error(
                        f"[SINGLE_STAKEHOLDER] Fallback persona creation failed for {stakeholder_category}: {fallback_error}"
                    )

                return None

        except Exception as e:
            logger.error(
                f"[DEBUG_FIX] ❌ EXCEPTION in _generate_single_stakeholder_persona for {stakeholder_category}: {str(e)}",
                exc_info=True,
            )
            logger.error(f"[DEBUG_FIX] Exception type: {type(e).__name__}")
            logger.error(f"[DEBUG_FIX] Exception args: {e.args}")
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
            # Phase 1 extraction: prepare inputs and concurrency in orchestrator
            try:
                from backend.services.processing.persona_formation_v1.orchestrators import (
                    transcript_persona_orchestrator as _tx,
                )
            except Exception as _imp_err:
                logger.warning(
                    f"[TRANSCRIPT_PREP] Import failed, using inline prep: {_imp_err}"
                )
                _tx = None

            if _tx is not None:
                (
                    start_time,
                    speaker_dialogues,
                    speaker_roles_map,
                    sorted_speakers,
                    semaphore,
                ) = await _tx.prepare_transcript_parallel_inputs(
                    self, transcript, participants, context
                )
                if not sorted_speakers:
                    return []
            else:
                # Fallback to inline prep if orchestrator unavailable
                start_time = time.time()
                speaker_dialogues = {}
                speaker_roles_map = {}
                for turn in transcript:
                    speaker_id = turn.get(
                        "speaker_id", turn.get("speaker", "Unknown Speaker")
                    )
                    dialogue = turn.get("dialogue", turn.get("text", ""))
                    role = turn.get("role", "Participant")
                    if speaker_id not in speaker_dialogues:
                        speaker_dialogues[speaker_id] = []
                        speaker_roles_map[speaker_id] = role
                    speaker_dialogues[speaker_id].append(dialogue)
                speaker_texts = {
                    speaker: " ".join(dialogues)
                    for speaker, dialogues in speaker_dialogues.items()
                }
                sorted_speakers = sorted(
                    speaker_texts.items(), key=lambda x: len(x[1]), reverse=True
                )
                semaphore = asyncio.Semaphore(
                    int(os.getenv("PAID_TIER_CONCURRENCY", "12"))
                )

            # Execute parallel generation in orchestrator (Phase 2 extraction)
            try:
                from backend.services.processing.persona_formation_v1.orchestrators import (
                    transcript_persona_orchestrator as _tx,
                )
            except Exception as _imp_err:
                _tx = None
                logger.warning(
                    f"[TRANSCRIPT_EXEC] Import failed, using inline exec: {_imp_err}"
                )

            if _tx is not None:
                personas = await _tx.execute_transcript_parallel_generation(
                    self,
                    start_time,
                    speaker_dialogues,
                    speaker_roles_map,
                    sorted_speakers,
                    semaphore,
                    context,
                    event_manager,
                    EventType,
                )
            else:
                # Fallback to previous inline implementation if orchestrator unavailable
                personas = []
                persona_tasks = []
                for i, (speaker, text) in enumerate(sorted_speakers):
                    role = speaker_roles_map.get(speaker, "Participant")
                    if role == "Interviewer":
                        continue
                    if len(text) < 100:
                        continue
                    original_dialogues = speaker_dialogues.get(speaker, [])
                    task = self._generate_single_persona_with_semaphore(
                        speaker,
                        text,
                        role,
                        semaphore,
                        i + 1,
                        context,
                        original_dialogues,
                    )
                    persona_tasks.append((i, speaker, task))
                task_results = await asyncio.gather(
                    *[task for _, _, task in persona_tasks], return_exceptions=True
                )
                for (i, speaker, _), result in zip(persona_tasks, task_results):
                    if isinstance(result, dict):
                        personas.append(result)
                    else:
                        role = speaker_roles_map.get(speaker, "Participant")
                        minimal_persona = self.persona_builder.create_fallback_persona(
                            role, speaker
                        )
                        personas.append(persona_to_dict(minimal_persona))

            # Finalize in orchestrator (Phase 3 extraction)
            from backend.services.processing.persona_formation_v1.orchestrators import (
                transcript_persona_orchestrator as _tx,
            )

            return await _tx.finalize_transcript_personas(
                self, personas, sorted_speakers
            )

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

    def _calculate_persona_influence_metrics(
        self, persona: Dict[str, Any]
    ) -> Dict[str, float]:
        """Thin delegator to persona_formation.influence.metrics.calculate_persona_influence_metrics."""
        from backend.services.processing.persona_formation.influence.metrics import (
            calculate_persona_influence_metrics as _calc,
        )

        return _calc(persona)

    def _select_diverse_speakers(
        self,
        sorted_speakers: List[Tuple[str, str]],
        speaker_roles_map: Dict[str, str],
        max_personas: int,
    ) -> List[Tuple[str, str]]:
        """Thin delegator to persona_formation.speakers.selection.select_diverse_speakers."""
        from backend.services.processing.persona_formation.speakers.selection import (
            select_diverse_speakers as _sel,
        )

        return _sel(sorted_speakers, speaker_roles_map, max_personas)

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

            # Delegate per-speaker generation core to orchestrator (Phase extraction)
            try:
                from backend.services.processing.persona_formation_v1.orchestrators import (
                    speaker_persona_generator as _sp,
                )
            except Exception as _imp_err:
                _sp = None
                logger.warning(
                    f"[SPEAKER_PERSONA] Import failed, using inline body: {_imp_err}"
                )
            if _sp is not None:
                return await _sp.generate_single_persona_core(
                    self,
                    speaker,
                    text,
                    role,
                    context,
                    original_dialogues,
                    persona_number,
                )

            # Orchestrator not available; use minimal legacy fallback
            return await self._generate_persona_legacy_fallback(
                speaker, text, role, context
            )

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
                        context="Pattern-based persona generation",
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
            from backend.infrastructure.constants.llm_constants import (
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
        """Thin delegator to persona_formation.fallbacks.attributes.create_fallback_attributes."""
        from backend.services.processing.persona_formation.fallbacks.attributes import (
            create_fallback_attributes as _cfa,
        )

        return _cfa(patterns)

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
        """Thin delegator to persona_formation.parsing.llm_json.parse_persona_llm_json_response."""
        from backend.services.processing.persona_formation.parsing.llm_json import (
            parse_persona_llm_json_response as _pp,
        )

        return _pp(response, context, self._process_structured_demographics)

    def _convert_string_to_structured_demographics(
        self, demographics_string: str
    ) -> Optional[Dict[str, Any]]:
        """Thin delegator to persona_formation.converters.persona_converter.convert_string_to_structured_demographics."""
        from backend.services.processing.persona_formation.converters.persona_converter import (
            convert_string_to_structured_demographics as _conv,
        )

        return _conv(demographics_string)

    def _process_structured_demographics(
        self, persona_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Thin delegator to persona_formation.converters.persona_converter.process_structured_demographics."""
        from backend.services.processing.persona_formation.converters.persona_converter import (
            process_structured_demographics as _proc,
        )

        return _proc(persona_data)

    def _group_patterns(
        self, patterns: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        """Thin delegator to persona_formation.grouping.patterns.group_patterns."""
        from backend.services.processing.persona_formation.grouping.patterns import (
            group_patterns as _grp,
        )

        return _grp(patterns)

    def _generate_descriptive_name_from_speaker_id(self, speaker_id: str) -> str:
        """Thin delegator to persona_formation.naming.speaker_labels.generate_descriptive_name_from_speaker_id."""
        from backend.services.processing.persona_formation.naming.speaker_labels import (
            generate_descriptive_name_from_speaker_id as _gen,
        )

        return _gen(speaker_id)

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
        # Thin delegator: use extracted converter and return early to preserve behavior
        try:
            from backend.services.processing.persona_formation.converters.simplified_to_full_converter import (
                convert_simplified_to_full_persona as _convert,
            )

            from backend.services.processing.persona_formation_v1.validation.validator import (
                make_converter_callbacks as _mk,
            )

            _cb = _mk(self)
            return _convert(
                simplified_persona,
                original_dialogues,
                **_cb,
            )
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"[PERSONA_CONVERTER_DELEGATE] Delegation failed: {e}")
            # Remove legacy fallback; surface the error to avoid silent divergence
            raise

    def _assess_content_quality(self, content: str) -> float:
        """Thin delegator to persona_formation.quality.assessors.assess_content_quality."""
        from backend.services.processing.persona_formation.quality.assessors import (
            assess_content_quality as _acq,
        )

        return _acq(content)

    def _assess_evidence_quality(self, quotes: List[str]) -> float:
        """Thin delegator to persona_formation.quality.assessors.assess_evidence_quality."""
        from backend.services.processing.persona_formation.quality.assessors import (
            assess_evidence_quality as _aeq,
        )

        return _aeq(quotes)

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

    async def _validate_persona_quality(self, personas: List[Dict[str, Any]]) -> None:
        """Thin delegator to persona_formation.quality.assessors.validate_persona_quality."""
        from backend.services.processing.persona_formation.quality.assessors import (
            validate_persona_quality as _vpq,
        )

        async def _enhanced(personas_arg, quality_issues_arg):
            return await self._validate_evidence_and_highlighting(
                personas_arg, quality_issues_arg
            )

        await _vpq(personas, _enhanced)

    def _assess_content_quality(self, content: str) -> float:
        """Thin delegator to persona_formation.quality.assessors.assess_content_quality."""
        from backend.services.processing.persona_formation.quality.assessors import (
            assess_content_quality as _acq,
        )

        return _acq(content)

    def _assess_evidence_quality(self, evidence: List[str]) -> float:
        """Thin delegator to persona_formation.quality.assessors.assess_evidence_quality."""
        from backend.services.processing.persona_formation.quality.assessors import (
            assess_evidence_quality as _aeq,
        )

        return _aeq(evidence)

    async def _validate_evidence_and_highlighting(
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
            # Initialize keyword highlighter first
            keyword_highlighter = ContextAwareKeywordHighlighter()
            logger.info(
                "[DEBUG] ✅ ContextAwareKeywordHighlighter initialized successfully"
            )

            # Initialize evidence validator with keyword highlighter reference
            evidence_validator = EvidenceValidator(
                keyword_highlighter=keyword_highlighter
            )
            logger.info("[DEBUG] ✅ EvidenceValidator initialized successfully")

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
                    personas = (
                        await validate_and_regenerate_low_quality_traits_parallel(
                            personas, evidence_validator
                        )
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
