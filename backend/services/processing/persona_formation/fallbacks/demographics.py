from typing import Optional
import logging

from backend.domain.models.persona_schema import (
    StructuredDemographics,
    AttributedField,
)

logger = logging.getLogger(__name__)


def create_minimal_fallback_demographics() -> StructuredDemographics:
    """Create the most minimal possible StructuredDemographics as last resort."""
    return StructuredDemographics(
        experience_level=AttributedField(value="Not specified", evidence=["Not available"]),
        industry=AttributedField(value="Not specified", evidence=["Not available"]),
        location=AttributedField(value="Not specified", evidence=["Not available"]),
        confidence=0.1,
    )


def create_clean_fallback_demographics(
    validate_fn,
    persona_name: str = "Unknown",
) -> StructuredDemographics:
    """
    Create completely clean fallback StructuredDemographics with no corruption.

    The caller supplies validate_fn(demographics)->bool to preserve existing
    validation behavior from the service while keeping this helper pure.
    """
    try:
        clean_demographics = StructuredDemographics(
            experience_level=AttributedField(
                value="Professional experience level not specified",
                evidence=["Inferred from interview context"],
            ),
            industry=AttributedField(
                value="Industry context not clearly specified",
                evidence=["Inferred from interview context"],
            ),
            location=AttributedField(
                value="Location not specified",
                evidence=["Inferred from interview context"],
            ),
            age_range=AttributedField(
                value="Age range not specified",
                evidence=["Inferred from interview context"],
            ),
            professional_context=AttributedField(
                value="Professional context not clearly specified",
                evidence=["Inferred from interview context"],
            ),
            roles=AttributedField(
                value="Role not clearly specified",
                evidence=["Inferred from interview context"],
            ),
            confidence=0.3,
        )

        # Validate via provided function
        if validate_fn(clean_demographics):
            logger.info(
                f"[CLEAN_FALLBACK] Created clean fallback demographics for {persona_name}"
            )
            return clean_demographics
        else:
            logger.error(
                f"[CLEAN_FALLBACK] Fallback demographics validation failed for {persona_name}"
            )
            return create_minimal_fallback_demographics()

    except Exception as e:
        logger.error(f"[CLEAN_FALLBACK] Error creating clean fallback: {e}")
        return create_minimal_fallback_demographics()

