from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def filter_design_thinking_persona(persona_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Filter a persona down to core design thinking fields with quality checks.

    Mirrors ResultsService.filter_design_thinking_persona behavior (pure).
    """
    filtered = {
        "persona_id": persona_dict.get("persona_id"),
        "name": persona_dict.get("name", "Unknown Persona"),
        "description": persona_dict.get("description", ""),
        "archetype": persona_dict.get("archetype", "Professional"),
        "overall_confidence": persona_dict.get(
            "overall_confidence", persona_dict.get("confidence", 0.5)
        ),
        "populated_traits": {},
    }

    design_thinking_fields = [
        "demographics",
        "goals_and_motivations",
        "challenges_and_frustrations",
        "key_quotes",
    ]

    CONFIDENCE_THRESHOLD = 0.3
    MIN_CONTENT_LENGTH = 5

    for field in design_thinking_fields:
        trait = persona_dict.get(field)

        if trait and hasattr(trait, "value") and hasattr(trait, "confidence"):
            value = trait.value or ""
            confidence = trait.confidence or 0
            evidence = (
                getattr(trait, "evidence", []) if hasattr(trait, "evidence") else []
            )
        elif trait and "PersonaTrait" in str(type(trait)):
            try:
                value = getattr(trait, "value", "")
                confidence = getattr(trait, "confidence", 0)
                evidence = getattr(trait, "evidence", [])
            except Exception:
                continue
        elif isinstance(trait, dict) and "value" in trait:
            value = trait.get("value", "")
            confidence = trait.get("confidence", 0)
            evidence = trait.get("evidence", [])
        elif isinstance(trait, str):
            value = trait
            confidence = 0.8
            evidence = []
        else:
            continue

        if (
            value
            and len(value) >= MIN_CONTENT_LENGTH
            and confidence >= CONFIDENCE_THRESHOLD
        ):
            trait_dict = {
                "value": value,
                "confidence": confidence,
                "evidence": evidence,
            }
            # Store in populated_traits for backward compatibility
            filtered["populated_traits"][field] = trait_dict
            # Also expose as top-level fields to satisfy ProductionPersona validator
            filtered[field] = trait_dict
            filtered[field] = trait_dict

    filtered["trait_count"] = len(filtered["populated_traits"])
    filtered["evidence_count"] = sum(
        len(trait.get("evidence", []))
        for trait in filtered["populated_traits"].values()
    )

    return filtered


def assemble_design_thinking_personas(
    full_result: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Build the list of design-thinking personas from a full analysis result dict.

    full_result is the output of ResultsService.get_analysis_result. This function is
    pure and contains no DB access.
    """
    if full_result.get("status") != "completed":
        logger.warning("Analysis not completed for result; returning empty list")
        return []

    personas = full_result.get("results", {}).get("personas", [])
    if not personas:
        return []

    out: List[Dict[str, Any]] = []
    for persona in personas:
        if hasattr(persona, "__dict__"):
            persona_dict = persona.__dict__
        elif hasattr(persona, "model_dump"):
            persona_dict = persona.model_dump()
        else:
            persona_dict = persona
        filtered = filter_design_thinking_persona(persona_dict)
        if filtered.get("trait_count", 0) > 0:
            out.append(filtered)

    return out
