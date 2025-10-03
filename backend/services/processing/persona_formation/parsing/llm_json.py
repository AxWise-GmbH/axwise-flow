"""
JSON parsing helpers for persona formation.

This module wraps the instructor-based and enhanced parsing flows for persona
LLM responses, keeping the service as a thin delegator and enabling reuse.
"""
from typing import Any, Callable, Dict, Union
import logging

from backend.utils.json import parse_llm_json_response_with_instructor
from backend.services.processing.persona_formation_service_enhanced import (
    parse_llm_json_response_enhanced,
)

logger = logging.getLogger(__name__)


def parse_persona_llm_json_response(
    response: Union[str, Dict[str, Any]],
    context: str,
    process_structured_demographics_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    """Parse LLM JSON for persona formation with robust fallbacks.

    Attempts instructor-based parsing first; on failure, falls back to the
    enhanced parser. Always post-processes with the provided demographics
    processor to preserve the Golden Schema structure.
    """
    # First try the Instructor-based parser
    try:
        result = parse_llm_json_response_with_instructor(
            response, context=context, task="persona_formation"
        )
        if result and isinstance(result, dict) and len(result) > 0:
            logger.info("Successfully parsed JSON with Instructor in %s", context)
            return process_structured_demographics_fn(result)
    except Exception as e:
        logger.warning("Instructor-based parsing failed in %s: %s", context, e)

    # Fallback to the enhanced parsing implementation
    logger.info("Falling back to enhanced JSON parsing in %s", context)
    result = parse_llm_json_response_enhanced(response, context)
    return process_structured_demographics_fn(result)

