import json
import logging
from typing import Any, Callable, Dict, List, Optional

from backend.domain.models.persona_schema import (
    AttributedField,
    StructuredDemographics,
)
from backend.services.processing.persona_formation.converters.full_persona_evidence import (
    distribute_evidence_semantically,
    extract_authentic_quotes_from_dialogue,
)

logger = logging.getLogger(__name__)


def _extract_evidence_texts(field: Any) -> List[str]:
    """Normalize various evidence formats to a list of strings (quotes)."""
    if field is None:
        return []
    evs: List[str] = []
    try:
        # AttributedField with structured evidence list
        evidence = getattr(field, "evidence", None)
        if evidence is None and isinstance(field, dict):
            evidence = field.get("evidence")
        if isinstance(evidence, list):
            for item in evidence:
                if item is None:
                    continue
                # EvidenceItem or dict with quote
                q = None
                if hasattr(item, "quote"):
                    q = getattr(item, "quote")
                elif isinstance(item, dict):
                    q = item.get("quote") or item.get("text") or item.get("value")
                elif isinstance(item, str):
                    q = item
                if q:
                    evs.append(str(q))
        # Some fields may be strings directly
        if isinstance(field, str):
            if len(field.strip()) > 0:
                evs.append(field.strip())
    except Exception as e:
        logger.debug(f"[EVIDENCE_NORMALIZE] Failed to normalize: {e}")
    return evs


def convert_simplified_to_full_persona(
    simplified_persona: Any,
    original_dialogues: Optional[List[str]],
    *,
    validate_structured_demographics_fn: Callable[[Any], bool],
    create_clean_fallback_fn: Callable[[str], StructuredDemographics],
    create_minimal_fallback_fn: Callable[[], StructuredDemographics],
    assess_content_quality_fn: Callable[[str], float],
    assess_evidence_quality_fn: Callable[[List[str]], float],
    extract_evidence_from_description_fn: Callable[[Any], List[str]],
) -> Dict[str, Any]:
    """Convert SimplifiedPersona to a full Persona dict with contextual evidence.

    This mirrors the original service method, with behavior preserved by using
    callbacks for service-specific functions and existing extracted helpers.
    """

    # Local helper to create trait dict
    def create_trait(
        value: str, confidence: float, evidence: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        return {
            "value": value or "",
            "confidence": confidence,
            "evidence": (evidence or []),
        }

    # Collect quotes from provided AttributedField evidence
    quotes: List[str] = []
    quotes += _extract_evidence_texts(
        getattr(simplified_persona, "goals_and_motivations", None)
    )
    quotes += _extract_evidence_texts(
        getattr(simplified_persona, "challenges_and_frustrations", None)
    )
    quotes += _extract_evidence_texts(getattr(simplified_persona, "key_quotes", None))
    quotes += _extract_evidence_texts(getattr(simplified_persona, "demographics", None))

    # Distribute quotes into semantic pools
    evidence_pools = distribute_evidence_semantically(quotes, 8)

    # Quality cross-check between description and evidence
    description_quality = assess_content_quality_fn(
        getattr(simplified_persona, "description", "") or ""
    )
    evidence_quality = assess_evidence_quality_fn(quotes)

    if description_quality > 0.7 and evidence_quality < 0.5:
        enhanced_quotes = extract_evidence_from_description_fn(simplified_persona)
        if enhanced_quotes:
            quotes.extend(enhanced_quotes)
            evidence_pools = distribute_evidence_semantically(quotes, 8)
            logger.info(
                f"[QUALITY_FIX] Enhanced evidence with {len(enhanced_quotes)} quotes from description"
            )

    # Helper to create trait (with preserving StructureDemographics/AttributedField)
    def create_trait_with_keywords(content: Any, confidence: float, trait_name: str):
        # Preserve StructuredDemographics structure
        if isinstance(content, StructuredDemographics):
            if not validate_structured_demographics_fn(content):
                logger.error(
                    f"[STRUCTURED_DEMOGRAPHICS] Corruption detected in {trait_name}, using clean fallback"
                )
                content = create_clean_fallback_fn(f"fallback_{trait_name}")
            demographics_dict = content.model_dump()
            # Validate JSON serialization to avoid constructor-like strings
            serialized_str = (
                content.model_dump_json()
                if hasattr(content, "model_dump_json")
                else json.dumps(demographics_dict)
            )
            if any(
                ind in serialized_str
                for ind in [
                    "AttributedField(",
                    "experience_level=",
                    "industry=",
                    "evidence=[",
                ]
            ):
                logger.error(
                    f"[STRUCTURED_DEMOGRAPHICS] Serialization corruption detected in {trait_name}, using minimal fallback"
                )
                demographics_dict = create_minimal_fallback_fn().model_dump()
            demographics_dict["confidence"] = confidence
            return demographics_dict
        # Preserve AttributedField
        if isinstance(content, AttributedField):
            field_dict = content.model_dump()
            field_dict["confidence"] = confidence
            return field_dict
        # Fallback: legacy types (strings/objects)
        ev, used_keywords = extract_authentic_quotes_from_dialogue(
            original_dialogues or [], content, trait_name
        )
        # Extract text value
        content_str = ""
        if hasattr(content, "value"):
            content_str = str(getattr(content, "value") or "")
        elif isinstance(content, str):
            content_str = content
        else:
            content_str = str(content) if content is not None else ""
        trait = create_trait(content_str, confidence, ev)
        # Keep used keywords info if consumer supports attributes
        try:
            setattr(trait, "actual_keywords", used_keywords)  # harmless if dict
        except Exception:
            pass
        return trait

    # Validate demographics before proceeding
    if not validate_structured_demographics_fn(
        getattr(simplified_persona, "demographics", None)
    ):
        try:
            demo_json = (
                simplified_persona.demographics.model_dump_json()
                if hasattr(simplified_persona.demographics, "model_dump_json")
                else (
                    json.dumps(simplified_persona.demographics.model_dump())
                    if hasattr(simplified_persona.demographics, "model_dump")
                    else str(simplified_persona.demographics)
                )
            )
            logger.error(
                f"[PERSONA_FORMATION_DEBUG] Demographics validation failed. Content: {demo_json[:500]}..."
            )
        except Exception:
            logger.error("[PERSONA_FORMATION_DEBUG] Demographics validation failed.")
        simplified_persona.demographics = create_clean_fallback_fn(
            getattr(simplified_persona, "name", "Unknown")
        )

    # Prefer human names from dialogues when LLM provides a generic archetype title
    resolved_name = getattr(simplified_persona, "name", "") or ""
    try:
        from backend.services.processing.persona_formation.naming.name_extraction import (
            extract_person_name_candidates,
            is_generic_archetype_name,
        )

        if is_generic_archetype_name(resolved_name):
            cand = extract_person_name_candidates(original_dialogues or [])
            if cand:
                # If the LLM returned an archetype like "The Meticulous Construction Accountant",
                # keep it as a suffix for memorability
                if resolved_name.startswith("The "):
                    resolved_name = f"{cand[0]}, {resolved_name}"
                else:
                    resolved_name = cand[0]
    except Exception:
        # On any failure, keep the original name
        resolved_name = resolved_name or "Unknown"

    # Build persona data (preserve legacy fields for compatibility)
    persona_data: Dict[str, Any] = {
        "name": resolved_name or getattr(simplified_persona, "name", "Unknown"),
        "description": getattr(simplified_persona, "description", ""),
        "archetype": getattr(simplified_persona, "archetype", ""),
        "demographics": create_trait_with_keywords(
            getattr(simplified_persona, "demographics", None),
            getattr(
                simplified_persona,
                "demographics_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            "demographics",
        ),
        "goals_and_motivations": create_trait_with_keywords(
            getattr(simplified_persona, "goals_and_motivations", None),
            getattr(
                simplified_persona,
                "goals_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            "goals_and_motivations",
        ),
        "challenges_and_frustrations": create_trait_with_keywords(
            getattr(simplified_persona, "challenges_and_frustrations", None),
            getattr(
                simplified_persona,
                "challenges_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            "challenges_and_frustrations",
        ),
        # Legacy/compatibility traits populated with sensible fallbacks
        "skills_and_expertise": create_trait(
            "Skills and expertise derived from interview context",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "technology_and_tools": create_trait(
            "Technology and tools mentioned in interview",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "pain_points": create_trait_with_keywords(
            getattr(simplified_persona, "challenges_and_frustrations", None),
            getattr(
                simplified_persona,
                "challenges_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            "pain_points",
        ),
        "workflow_and_environment": create_trait(
            "Workflow and environment context from interview",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "needs_and_expectations": create_trait(
            "Needs and expectations derived from goals and challenges",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "key_quotes": create_trait_with_keywords(
            getattr(simplified_persona, "key_quotes", None),
            getattr(simplified_persona, "overall_confidence", 0.7),
            "key_quotes",
        ),
        "key_responsibilities": create_trait(
            "Key responsibilities derived from interview context",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "tools_used": create_trait(
            "Tools and technologies mentioned in interview",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "analysis_approach": create_trait(
            "Analysis approach derived from interview responses",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "decision_making_process": create_trait_with_keywords(
            getattr(simplified_persona, "goals_and_motivations", None),
            getattr(
                simplified_persona,
                "goals_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            "decision_making_process",
        ),
        "communication_style": create_trait(
            "Communication style derived from interview responses",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        "technology_usage": create_trait(
            "Technology usage patterns mentioned in interview",
            getattr(simplified_persona, "overall_confidence", 0.7),
            [],
        ),
        # Back-compat fields
        "role_context": create_trait(
            f"Professional context: {getattr(simplified_persona, 'demographics', '')}",
            getattr(
                simplified_persona,
                "demographics_confidence",
                getattr(simplified_persona, "overall_confidence", 0.7),
            ),
            evidence_pools[0][:1] if evidence_pools else [],
        ),
        "key_responsibilities": create_trait(
            "Key responsibilities derived from role context and goals",
            getattr(simplified_persona, "overall_confidence", 0.7),
            evidence_pools[6][:2] if evidence_pools and len(evidence_pools) > 6 else [],
        ),
        "tools_and_technology": create_trait(
            "Primary tools and technology used",
            getattr(simplified_persona, "overall_confidence", 0.7),
            evidence_pools[4][:2] if evidence_pools and len(evidence_pools) > 4 else [],
        ),
        "key_quotes_legacy": create_trait(
            "Representative quotes",
            getattr(simplified_persona, "overall_confidence", 0.7),
            evidence_pools[7][:3] if evidence_pools else [],
        ),
        "overall_confidence": getattr(simplified_persona, "overall_confidence", 0.7),
    }

    return persona_data
