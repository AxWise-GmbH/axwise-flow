from typing import Dict, List, Optional, Any
import logging
import json

# Alias DemographicsValue to StructuredDemographics to preserve existing behavior
from backend.domain.models.persona_schema import StructuredDemographics as DemographicsValue

logger = logging.getLogger(__name__)


def convert_string_to_structured_demographics(
    demographics_string: str,
) -> Optional[Dict[str, Any]]:
    """Convert string demographics to structured format (legacy-friendly).

    Mirrors the logic previously embedded in PersonaFormationService.
    """
    if not demographics_string or not isinstance(demographics_string, str):
        return None

    structured_demo: Dict[str, Any] = {}

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
            roles = [r.strip() for r in value.split(",") if r.strip()]
            if roles:
                structured_demo["roles"] = roles

    # Extract professional context from remaining text
    import re

    context_match = re.search(
        r"professional context[:\s]+(.*?)(?:\.|$)", demographics_string, re.IGNORECASE
    )
    if context_match:
        structured_demo["professional_context"] = context_match.group(1).strip()

    if len(structured_demo) > 0:
        logger.info(
            f"Converted string demographics to structured format: {list(structured_demo.keys())}"
        )
        return structured_demo

    return None


def process_structured_demographics(persona_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process structured demographics in persona data, handling both
    StructuredDemographics and legacy AttributedField formats.

    This function mutates only the demographics sub-dict in the provided persona_data
    and returns the same dict for convenience, matching existing behavior.
    """
    if "demographics" not in persona_data:
        return persona_data

    demographics = persona_data["demographics"]
    if not isinstance(demographics, dict):
        return persona_data

    logger.info(f"[DEMOGRAPHICS_DEBUG] Processing demographics: {demographics}")

    # Check if this is already the StructuredDemographics dict-like shape
    structured_fields = [
        "experience_level",
        "industry",
        "location",
        "professional_context",
        "roles",
        "age_range",
    ]
    found_fields = [key for key in structured_fields if key in demographics]
    logger.info(f"[DEMOGRAPHICS_DEBUG] Found structured fields: {found_fields}")

    if found_fields:
        logger.info(
            "[DEMOGRAPHICS_DEBUG] Demographics already in StructuredDemographics format with "
            f"{len(found_fields)} fields - preserving structure"
        )
        return persona_data

    # Handle legacy AttributedField format (has "value" key)
    demo_value = demographics.get("value")

    if isinstance(demo_value, dict):
        try:
            # Convert nested dict to DemographicsValue (alias of StructuredDemographics)
            structured_demo = DemographicsValue(**demo_value)
            demographics["value"] = structured_demo
            logger.info("Successfully converted demographics dict to DemographicsValue")
        except Exception as e:
            logger.warning(
                f"Failed to convert demographics dict to DemographicsValue: {e}"
            )
            # Keep original dict format as fallback
            pass

    elif isinstance(demo_value, str):
        # Try to convert string to structured format
        structured_dict = convert_string_to_structured_demographics(demo_value)
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
                # Keep original string format as fallback
                pass

    return persona_data

