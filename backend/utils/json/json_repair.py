"""
JSON repair utilities for fixing malformed JSON from LLM responses.

This module provides functions to repair and validate JSON data from LLM responses,
particularly focusing on common issues with Gemini's JSON output.
"""

import json
import re
import logging
from typing import Any, Dict, List, Union, Optional

logger = logging.getLogger(__name__)

def repair_json(json_str: str) -> str:
    """
    Repair common JSON formatting issues in LLM responses, with special handling for truncated responses.

    Args:
        json_str: The potentially malformed JSON string

    Returns:
        A repaired JSON string that should be parseable

    Deprecated:
        This function is deprecated and will be removed in a future version.
        Use backend.utils.json.instructor_parser.parse_json_with_instructor instead.
    """
    import warnings
    warnings.warn(
        "repair_json is deprecated and will be removed in a future version. "
        "Use backend.utils.json.instructor_parser.parse_json_with_instructor instead.",
        DeprecationWarning,
        stacklevel=2
    )

    # Import here to avoid circular imports
    from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair

    # Use the enhanced JSON repair utility
    return EnhancedJSONRepair.repair_json(json_str)

def repair_enhanced_themes_json(json_str: str) -> str:
    """
    Special repair function for enhanced themes JSON that preserves the structure.

    Args:
        json_str: The potentially malformed JSON string containing enhanced themes

    Returns:
        A repaired JSON string that preserves the enhanced themes structure
    """
    # First try standard repair
    repaired_json = repair_json(json_str)

    try:
        # Check if the repaired JSON is valid
        parsed = json.loads(repaired_json)
        if 'enhanced_themes' in parsed and isinstance(parsed['enhanced_themes'], list) and len(parsed['enhanced_themes']) > 0:
            logger.info(f"Successfully repaired enhanced themes JSON with {len(parsed['enhanced_themes'])} themes")
            return repaired_json
    except json.JSONDecodeError:
        pass

    # If standard repair failed or didn't preserve the structure, try a more targeted approach
    logger.info("Standard repair didn't preserve enhanced themes structure. Trying targeted repair...")

    # Check if we can identify the enhanced_themes array
    match = re.search(r'"enhanced_themes"\s*:\s*\[(.*?)\](?=\s*}$)', json_str, re.DOTALL)
    if not match:
        logger.warning("Could not find enhanced_themes array in JSON")
        return '{"enhanced_themes": []}'

    themes_content = match.group(1)

    # Split the themes content into individual theme objects
    theme_objects = []
    brace_count = 0
    current_theme = ""

    for char in themes_content:
        current_theme += char
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                # We've found a complete theme object
                theme_objects.append(current_theme.strip())
                current_theme = ""

    # Repair each theme object individually
    repaired_themes = []
    for theme_obj in theme_objects:
        # Add missing commas between properties
        theme_obj = re.sub(r'"\s*"', '","', theme_obj)

        # Fix missing commas in arrays
        theme_obj = re.sub(r'"\s*\{', '",{', theme_obj)
        theme_obj = re.sub(r'}\s*"', '},"', theme_obj)

        # Fix trailing commas
        theme_obj = re.sub(r',\s*}', '}', theme_obj)

        # Ensure the theme object is valid JSON
        try:
            json.loads(theme_obj)
            repaired_themes.append(theme_obj)
        except json.JSONDecodeError:
            logger.warning(f"Could not repair theme object: {theme_obj[:100]}...")

    if not repaired_themes:
        logger.warning("Could not repair any theme objects")
        return '{"enhanced_themes": []}'

    # Construct the final JSON
    final_json = '{"enhanced_themes": [' + ','.join(repaired_themes) + ']}'

    # Validate the final JSON
    try:
        parsed = json.loads(final_json)
        logger.info(f"Successfully repaired enhanced themes JSON with {len(parsed['enhanced_themes'])} themes")
        return final_json
    except json.JSONDecodeError as e:
        logger.error(f"Failed to create valid enhanced themes JSON: {e}")
        return '{"enhanced_themes": []}'

def parse_json_safely(json_str: str, default_type: str = "object", task_type: Optional[str] = None) -> Union[Dict[str, Any], List[Any]]:
    """
    Parse JSON with repair attempts if initial parsing fails.

    Args:
        json_str: The JSON string to parse
        default_type: The default type to return if parsing fails ("object" or "array")
        task_type: Optional task type to use specialized repair functions

    Returns:
        The parsed JSON object/array or an empty dict/list if parsing fails
    """
    if not json_str:
        return {} if default_type == "object" else []

    # Log the first part of the JSON string for debugging
    logger.info(f"Attempting to parse JSON safely (first 100 chars): {json_str[:100]}...")

    try:
        # First attempt: direct parsing
        parsed = json.loads(json_str)
        logger.info(f"Successfully parsed JSON directly: {type(parsed).__name__}")
        return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Initial JSON parsing failed: {e}. Attempting repair.")

        # Second attempt: repair and parse
        try:
            # Use specialized repair function if task_type is provided
            if task_type == "theme_analysis_enhanced":
                repaired = repair_enhanced_themes_json(json_str)
            else:
                repaired = repair_json(json_str)

            parsed = json.loads(repaired)
            logger.info(f"Successfully parsed JSON after repair: {type(parsed).__name__}")
            return parsed
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON even after repair: {e}")

            # Determine what type of structure we should return based on the content
            if json_str.strip().startswith('['):
                logger.warning("JSON appears to be an array. Returning empty array.")
                return []
            else:
                logger.warning("JSON appears to be an object. Returning empty object.")
                return {}
        except Exception as e:
            logger.error(f"Unexpected error during JSON repair: {e}")
            return {} if default_type == "object" else []


def parse_json_array_safely(json_str: str) -> List[Any]:
    """
    Parse JSON array with repair attempts if initial parsing fails.

    Args:
        json_str: The JSON string to parse

    Returns:
        The parsed JSON array or an empty list if parsing fails
    """
    result = parse_json_safely(json_str, default_type="array")

    # Ensure the result is a list
    if not isinstance(result, list):
        logger.warning(f"Expected array but got {type(result).__name__}. Converting to array.")
        if isinstance(result, dict):
            # If we got a dict, wrap it in a list
            return [result]
        else:
            # For any other type, return empty list
            return []

    return result
