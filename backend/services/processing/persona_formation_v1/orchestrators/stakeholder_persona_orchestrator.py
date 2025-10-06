"""Orchestrator for stakeholder-aware persona formation.

Extracted thin logic for form_personas_by_stakeholder to reduce LOC in the service.
Behavior is preserved by delegating to the service instance (svc) for heavy lifting.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


async def form_personas_by_stakeholder(
    svc: Any,
    stakeholder_segments: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate personas from stakeholder-segmented transcript data.

    This method processes each stakeholder category separately to maintain
    stakeholder boundaries and populate stakeholder_mapping fields.
    """
    try:
        logger.info(
            f"[STAKEHOLDER_PERSONA] Starting stakeholder-aware persona formation"
        )
        logger.info(
            f"[STAKEHOLDER_PERSONA] Processing {len(stakeholder_segments)} stakeholder categories"
        )

        all_personas: List[Dict[str, Any]] = []

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

            # Generate personas for this stakeholder category via service callback
            stakeholder_personas = await svc._generate_stakeholder_specific_personas(
                segments, stakeholder_category, interview_count, context
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
        logger.info("[STAKEHOLDER_PERSONA] Falling back to standard persona formation")

        # Flatten all segments for fallback processing
        all_segments = []
        for segment_data in stakeholder_segments.values():
            all_segments.extend(segment_data.get("segments", []))

        return await svc.form_personas_from_transcript(all_segments, context=context)

