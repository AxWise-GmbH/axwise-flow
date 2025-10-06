"""Orchestrator for pattern-based persona formation.

Extracted from persona_formation_service.form_personas to reduce LOC.
This module keeps behavior identical and delegates to the service instance
("svc") for all internal collaborators and callbacks.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from backend.services.processing.persona_builder import persona_to_dict
from backend.utils.content_deduplication import deduplicate_persona_list

logger = logging.getLogger(__name__)


async def form_personas(
    svc: Any,
    patterns: List[Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None,
    event_manager=None,
    EventType=None,
) -> List[Dict[str, Any]]:
    """
    Form personas from identified patterns.

    Args:
        svc: The PersonaFormationService instance (for dependencies/callbacks)
        patterns: List of identified patterns from analysis
        context: Optional additional context
        event_manager: Event manager instance to emit progress events
        EventType: Enum of event types

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
        grouped_patterns = svc._group_patterns(patterns)
        logger.info(f"Grouped patterns into {len(grouped_patterns)} potential personas")

        # Form a persona from each group
        personas = []

        for i, group in enumerate(grouped_patterns):
            try:
                # Convert the group to a persona
                attributes = await svc._analyze_patterns_for_persona(group)
                logger.debug(
                    f"[form_personas] Attributes received from LLM for group {i}: {attributes}"
                )

                if (
                    attributes
                    and isinstance(attributes, dict)
                    and attributes.get("confidence", 0) >= svc.validation_threshold
                ):
                    try:
                        # Build persona from attributes
                        persona = svc.persona_builder.build_persona_from_attributes(
                            attributes
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
                        f"below threshold {svc.validation_threshold} or attributes invalid."
                    )
            except Exception as attr_error:
                logger.error(
                    f"Error analyzing persona attributes for group {i}: {str(attr_error)}",
                    exc_info=True,
                )

            # Emit event for tracking
            try:
                if event_manager and EventType:
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
            logger.warning("No personas created from patterns, creating default persona")
            personas = await svc._create_default_persona(context)

        logger.info(f"[form_personas] Returning {len(personas)} personas.")
        # Convert Persona objects to dictionaries before returning
        persona_dicts = [persona_to_dict(p) for p in personas]

        # CONTENT DEDUPLICATION: Remove repetitive patterns from persona content
        logger.info("[form_personas] 🧹 Deduplicating persona content...")
        deduplicated_personas = deduplicate_persona_list(persona_dicts)
        logger.info(f"[form_personas] ✅ Content deduplication completed")

        # QUALITY VALIDATION: Simple pipeline validation with logging
        try:
            await svc._validate_persona_quality(deduplicated_personas)
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
            if event_manager:
                await event_manager.emit_error(e, {"stage": "persona_formation"})
        except Exception as event_error:
            logger.warning(f"Could not emit error event: {str(event_error)}")
        # Return empty list instead of raising to prevent analysis failure
        return []

