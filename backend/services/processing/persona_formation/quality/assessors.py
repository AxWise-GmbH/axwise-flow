import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


def assess_content_quality(content: str) -> float:
    """Assess quality of content (description, traits) as a score in [0, 1]."""
    if not content or len(content.strip()) < 10:
        return 0.0

    # Indicators of rich content
    rich_indicators = [
        r"\b\d+\b",  # Numbers (ages, years, quantities)
        r"\b[A-Z][a-z]+\b",  # Proper nouns (names, places)
        r"\b(husband|wife|son|daughter|family|children)\b",
        r"\b(years?|months?|experience|background)\b",
        r"\b(specific|particular|detailed|mentioned)\b",
        r"\b(loves?|enjoys?|prefers?|dislikes?|frustrated|excited)\b",
        r"\b(manager|director|analyst|developer|consultant|specialist)\b",
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

    rich_score = 0.0
    for pattern in rich_indicators:
        matches = len(re.findall(pattern, content, re.IGNORECASE))
        rich_score += min(matches * 0.1, 0.3)

    generic_score = 0.0
    for pattern in generic_indicators:
        matches = len(re.findall(pattern, content, re.IGNORECASE))
        generic_score += min(matches * 0.2, 0.4)

    length_bonus = min(len(content) / 200, 0.3)
    quality = min(rich_score + length_bonus - generic_score, 1.0)
    return max(quality, 0.0)


def assess_evidence_quality(evidence: List[str]) -> float:
    """Assess the quality of evidence quotes as a score in [0, 1]."""
    if not evidence:
        return 0.0

    total_quality = 0.0
    for quote in evidence:
        quote_quality = assess_content_quality(quote)

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
            quote_quality *= 0.3

        if '"' in quote or any(word in quote.lower() for word in ["i ", "my ", "we ", "our "]):
            quote_quality += 0.2

        total_quality += quote_quality

    return min(total_quality / len(evidence), 1.0)


async def validate_persona_quality(
    personas: List[Dict[str, Any]],
    enhanced_validator: Optional[
        Callable[[List[Dict[str, Any]], List[Dict[str, Any]]], Awaitable[None]]
    ] = None,
) -> None:
    """Validate persona quality and optionally run enhanced validation via callback."""
    if not personas:
        logger.warning("[QUALITY_VALIDATION] ⚠️ No personas generated")
        return

    quality_issues: List[Dict[str, Any]] = []

    for i, persona in enumerate(personas):
        persona_name = persona.get("name", f"Persona {i+1}")

        description = persona.get("description", "")
        description_quality = assess_content_quality(description)

        evidence_qualities: List[float] = []
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
                ev = trait_data["evidence"]
                if ev:
                    evidence_quality = assess_evidence_quality(ev)
                    evidence_qualities.append(evidence_quality)

        avg_evidence_quality = (
            sum(evidence_qualities) / len(evidence_qualities) if evidence_qualities else 0.0
        )

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

    logger.info("[DEBUG] 🔍 About to call enhanced validation system...")
    logger.info(
        f"[DEBUG] Personas count: {len(personas)}, Quality issues count: {len(quality_issues)}"
    )

    if enhanced_validator is not None:
        try:
            logger.info("[DEBUG] 🚀 Calling enhanced validator...")
            await enhanced_validator(personas, quality_issues)
            logger.info("[DEBUG] ✅ Enhanced validation completed successfully")
        except Exception as e:
            logger.error(f"[ERROR] 🚨 Enhanced validation failed with exception: {e}")

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

