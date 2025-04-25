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
    Repair common JSON formatting issues in LLM responses.
    
    Args:
        json_str: The potentially malformed JSON string
        
    Returns:
        A repaired JSON string that should be parseable
    """
    if not json_str or not isinstance(json_str, str):
        return "{}"
    
    # Step 1: Remove any markdown code block markers
    json_str = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', json_str)
    
    # Step 2: Extract JSON if it's embedded in other text
    json_match = re.search(r'({[\s\S]*}|\[[\s\S]*\])', json_str)
    if json_match:
        json_str = json_match.group(1)
    
    # Step 3: Fix trailing commas in objects and arrays
    json_str = re.sub(r',\s*}', '}', json_str)
    json_str = re.sub(r',\s*\]', ']', json_str)
    
    # Step 4: Fix missing quotes around property names
    json_str = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_str)
    
    # Step 5: Fix single quotes used instead of double quotes
    # This is more complex as we need to avoid replacing single quotes within strings
    in_string = False
    in_escape = False
    result = []
    
    for char in json_str:
        if char == '\\' and not in_escape:
            in_escape = True
            result.append(char)
        elif in_escape:
            in_escape = False
            result.append(char)
        elif char == '"' and not in_escape:
            in_string = not in_string
            result.append(char)
        elif char == "'" and not in_string and not in_escape:
            # Replace single quotes with double quotes when not in a string
            result.append('"')
        else:
            result.append(char)
    
    json_str = ''.join(result)
    
    # Step 6: Fix unquoted string values
    # This is a heuristic and may not catch all cases
    json_str = re.sub(r':\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}])', r':"\1"\2', json_str)
    
    # Step 7: Fix missing commas between array elements
    json_str = re.sub(r'}\s*{', '},{', json_str)
    json_str = re.sub(r'"\s*{', '",{', json_str)
    json_str = re.sub(r'}\s*"', '},"', json_str)
    json_str = re.sub(r'"\s*"', '","', json_str)
    
    # Step 8: Fix missing commas between object properties
    json_str = re.sub(r'"\s*"', '","', json_str)
    
    # Step 9: Fix boolean and null values
    json_str = re.sub(r':\s*True\s*([,}])', r':true\1', json_str)
    json_str = re.sub(r':\s*False\s*([,}])', r':false\1', json_str)
    json_str = re.sub(r':\s*None\s*([,}])', r':null\1', json_str)
    
    # Step 10: Fix numeric values
    # This is a heuristic and may not catch all cases
    json_str = re.sub(r':\s*([0-9]+\.[0-9]+)\s*([,}])', r':\1\2', json_str)
    json_str = re.sub(r':\s*([0-9]+)\s*([,}])', r':\1\2', json_str)
    
    return json_str

def parse_json_safely(json_str: str) -> Dict[str, Any]:
    """
    Parse JSON with repair attempts if initial parsing fails.
    
    Args:
        json_str: The JSON string to parse
        
    Returns:
        The parsed JSON object or an empty dict if parsing fails
    """
    if not json_str:
        return {}
    
    try:
        # First attempt: direct parsing
        return json.loads(json_str)
    except json.JSONDecodeError:
        # Second attempt: repair and parse
        try:
            repaired = repair_json(json_str)
            return json.loads(repaired)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON even after repair: {e}")
            return {}
        except Exception as e:
            logger.error(f"Unexpected error during JSON repair: {e}")
            return {}
