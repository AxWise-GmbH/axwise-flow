"""
Utility functions for parsing JSON from LLM responses.

This module provides robust JSON parsing functions that can handle various
formats and edge cases in LLM responses.
"""

import json
import re
import logging
from typing import Dict, Any, Optional, Union, List

# Configure logging
logger = logging.getLogger(__name__)

def extract_themes_from_text(text: str) -> Dict[str, Any]:
    """
    Extract themes from a text response when JSON parsing fails.

    This function attempts to parse a text response into a structured format
    that can be used by the application.

    Args:
        text: The text response from the LLM

    Returns:
        A dictionary with themes extracted from the text
    """
    themes = []
    theme_pattern = r"\*\*([^*]+)\*\*:?\s*([^\n]+)(?:\n|$)"

    # Find all theme matches
    matches = re.findall(theme_pattern, text)

    for i, (name, description) in enumerate(matches):
        # Clean up the name and description
        name = name.strip()
        description = description.strip()

        # Skip if it's just "Overall Theme" or similar
        if "overall" in name.lower() or len(name) > 50:
            continue

        # Create a theme object
        theme = {
            "name": name,
            "description": description,
            "keywords": [w.strip() for w in name.split() if len(w.strip()) > 3],
            "frequency": 0.5,  # Default frequency
            "sentiment": 0.0,   # Neutral sentiment
            "statements": [],   # No statements
            "confidence": 0.5   # Medium confidence
        }

        themes.append(theme)

    # If no themes were found, create a default theme
    if not themes:
        themes = [{
            "name": "General Discussion",
            "description": "General topics from the interview",
            "keywords": ["general", "discussion", "interview"],
            "frequency": 0.5,
            "sentiment": 0.0,
            "statements": [],
            "confidence": 0.5
        }]

    return {"themes": themes}

def parse_llm_json_response(
    response_text: Union[str, Dict, Any],
    context_msg: str = "",
    default_value: Optional[Dict] = None,
    task: str = ""
) -> Optional[Dict]:
    """
    Parse JSON from LLM response text, handling various formats.

    This function attempts multiple strategies to extract valid JSON:
    1. Direct JSON parsing if already a dict
    2. Direct JSON parsing of string
    3. Extracting JSON from markdown code blocks
    4. Extracting JSON without markdown markers
    5. Converting text to structured format for specific tasks
    6. Falling back to default value if all else fails

    Args:
        response_text: The raw response from the LLM
        context_msg: Context message for logging
        default_value: Default value to return if parsing fails
        task: Task type for specialized parsing

    Returns:
        Parsed JSON as dictionary or default value if parsing fails

    Deprecated:
        This function is deprecated and will be removed in a future version.
        Use backend.utils.json.instructor_parser.parse_llm_json_response_with_instructor instead.
    """
    import warnings
    warnings.warn(
        "parse_llm_json_response is deprecated and will be removed in a future version. "
        "Use backend.utils.json.instructor_parser.parse_llm_json_response_with_instructor instead.",
        DeprecationWarning,
        stacklevel=2
    )
    # If already a dict, return it
    if isinstance(response_text, dict):
        logger.debug(f"[{context_msg}] Response is already a dict")
        return response_text

    # If not a string, log error and return default
    if not isinstance(response_text, str):
        logger.error(f"[{context_msg}] Unexpected response type: {type(response_text)}. Expected string or dict.")
        return default_value

    # If empty string, return default
    if not response_text.strip():
        logger.error(f"[{context_msg}] Empty response")
        return default_value

    # Try direct JSON parsing
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        logger.debug(f"[{context_msg}] Direct JSON parsing failed, trying alternative methods")

    # Try to find JSON within markdown code blocks
    try:
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response_text)
        if json_match:
            json_str = json_match.group(1).strip()
            return json.loads(json_str)
    except Exception:
        logger.debug(f"[{context_msg}] Markdown code block extraction failed")

    # Try to find JSON without markdown markers
    try:
        json_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", response_text)
        if json_match:
            json_str = json_match.group(1).strip()
            return json.loads(json_str)
    except Exception:
        logger.debug(f"[{context_msg}] JSON pattern extraction failed")

    # Try finding the first '{' and last '}'
    try:
        start_index = response_text.find("{")
        end_index = response_text.rfind("}")
        if start_index != -1 and end_index != -1 and end_index > start_index:
            json_str = response_text[start_index : end_index + 1]
            logger.debug(f"[{context_msg}] Found potential JSON between first '{{' and last '}}'.")
            # Clean potential trailing commas
            cleaned_json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
            parsed_json = json.loads(cleaned_json_str)
            logger.debug(f"[{context_msg}] Successfully parsed JSON using first/last brace method.")
            return parsed_json
    except Exception:
        logger.debug(f"[{context_msg}] First/last brace extraction failed")

    # If we get here, no valid JSON was found
    logger.error(f"[{context_msg}] No valid JSON found in response: {response_text[:200]}...")

    # Try task-specific text parsing as a last resort
    if task and "theme" in task.lower():
        logger.info(f"[{context_msg}] Attempting to extract themes from text response")
        return extract_themes_from_text(response_text)

    return default_value

def normalize_persona_response(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize persona response to ensure it has the expected format.

    This function handles cases where the LLM returns a single persona object
    instead of a personas array.

    Args:
        result: The parsed JSON result

    Returns:
        Normalized result with proper personas array
    """
    # If we got a single persona object instead of a personas array
    if isinstance(result, dict):
        # Check if it's a single persona object (has name but no personas array)
        if "name" in result and "personas" not in result:
            logger.info("Normalizing single persona object to personas array")
            return {"personas": [result]}

        # Check if personas key exists but is not a list
        if "personas" in result and not isinstance(result["personas"], list):
            logger.info("Converting non-list personas to list")
            result["personas"] = [result["personas"]]

    return result
