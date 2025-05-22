"""
Enhanced persona formation service with improved JSON parsing.

This module provides an enhanced version of the persona formation service
with improved JSON parsing capabilities.
"""

import logging
from typing import Dict, Any, Union

from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair
import re

logger = logging.getLogger(__name__)

def parse_llm_json_response_enhanced(response: Union[str, Dict[str, Any]], context: str = "") -> Dict[str, Any]:
    """
    Parse JSON response from LLM with enhanced error recovery.

    Args:
        response: LLM response (string or dictionary)
        context: Context for error logging

    Returns:
        Parsed JSON as dictionary
    """
    if not response:
        logger.warning(f"Empty response from LLM in {context}")
        return {}

    # If response is already a dictionary, return it directly
    if isinstance(response, dict):
        logger.info(f"Response is already a dictionary in {context}")

        # Check if it's a personas wrapper
        if "personas" in response and isinstance(response["personas"], list) and len(response["personas"]) > 0:
            logger.info(f"Found personas wrapper in response, extracting first persona")
            return response["personas"][0]

        return response

    # If response is not a string, convert it to string
    if not isinstance(response, str):
        logger.warning(f"Response is not a string or dict in {context}: {type(response)}")
        response_str = str(response)
    else:
        response_str = response

    # Log a sample of the response for debugging
    logger.info(f"Response sample in {context}: {response_str[:200]}...")

    # Use the enhanced JSON repair utility
    try:
        # First try to parse directly
        parsed_json = EnhancedJSONRepair.parse_json_with_context(response_str, context)
        
        # Check if it's a personas wrapper
        if isinstance(parsed_json, dict) and "personas" in parsed_json and isinstance(parsed_json["personas"], list) and len(parsed_json["personas"]) > 0:
            logger.info(f"Found personas wrapper in response, extracting first persona")
            return parsed_json["personas"][0]
            
        if parsed_json:
            return parsed_json
    except Exception as e:
        logger.error(f"Enhanced JSON repair failed in {context}: {e}")
    
    # If enhanced repair fails, try to extract structured data from text as a last resort
    try:
        # Look for key patterns like "Name:" or "Demographics:"
        persona_data = {}

        # Extract name
        name_match = re.search(r'(?:Name|Person):\s*([^\n]+)', response_str)
        if name_match:
            persona_data["name"] = name_match.group(1).strip()

        # Extract description
        desc_match = re.search(r'(?:Description|Summary):\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\n[A-Z])', response_str)
        if desc_match:
            persona_data["description"] = desc_match.group(1).strip()

        # Extract archetype
        arch_match = re.search(r'(?:Archetype|Role|Type):\s*([^\n]+)', response_str)
        if arch_match:
            persona_data["archetype"] = arch_match.group(1).strip()

        # Extract demographics
        demo_match = re.search(r'(?:Demographics|Background):\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\n[A-Z])', response_str)
        if demo_match:
            persona_data["demographics"] = {"value": demo_match.group(1).strip(), "confidence": 0.5}

        # Extract goals
        goals_match = re.search(r'(?:Goals|Motivations|Objectives):\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\n[A-Z])', response_str)
        if goals_match:
            persona_data["goals_and_motivations"] = {"value": goals_match.group(1).strip(), "confidence": 0.5}

        # Extract challenges
        challenges_match = re.search(r'(?:Challenges|Frustrations|Pain Points):\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\n|\n[A-Z])', response_str)
        if challenges_match:
            persona_data["challenges_and_frustrations"] = {"value": challenges_match.group(1).strip(), "confidence": 0.5}

        if persona_data:
            logger.warning(f"Created partial persona data from text extraction in {context}")
            return persona_data
    except Exception as e4:
        logger.error(f"Text extraction failed in {context}: {e4}")

    # Return empty dict if all parsing attempts fail
    logger.error(f"All JSON parsing attempts failed in {context}")
    return {}
