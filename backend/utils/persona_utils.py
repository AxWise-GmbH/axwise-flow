"""
Utility functions for handling persona objects across different formats.

This module provides universal access functions to handle persona objects
whether they are dictionaries, Pydantic models, or SQLAlchemy ORM objects.
"""

import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime

logger = logging.getLogger(__name__)


def safe_persona_access(persona: Any, field: str, default: Any = None) -> Any:
    """
    Safely access persona fields regardless of type (dict, Pydantic, SQLAlchemy).

    Args:
        persona: Persona object (dict, Pydantic model, or SQLAlchemy object)
        field: Field name to access
        default: Default value if field doesn't exist

    Returns:
        Field value or default
    """
    if persona is None:
        return default

    try:
        if isinstance(persona, dict):
            return persona.get(field, default)
        else:
            return getattr(persona, field, default)
    except (AttributeError, KeyError, TypeError) as e:
        logger.debug(f"Error accessing field '{field}' on persona: {e}")
        return default


def normalize_persona_to_dict(persona: Any) -> Dict[str, Any]:
    """
    Convert any persona type to a standardized dictionary.

    Args:
        persona: Persona object of any type

    Returns:
        Dictionary representation of the persona

    Raises:
        ValueError: If persona type is not supported
    """
    if persona is None:
        return {}

    if isinstance(persona, dict):
        return persona.copy()

    # Handle Pydantic models
    if hasattr(persona, "model_dump"):
        try:
            return persona.model_dump()
        except Exception as e:
            logger.warning(f"Failed to use model_dump on persona: {e}")

    # Handle Pydantic models with dict() method
    if hasattr(persona, "model_dump"):
        try:
            return persona.model_dump()
        except Exception as e:
            logger.warning(f"Failed to use model_dump() on persona: {e}")
    elif hasattr(persona, "dict"):
        try:
            return persona.dict()  # Fallback for older Pydantic versions
        except Exception as e:
            logger.warning(f"Failed to use dict() on persona: {e}")

    # Handle SQLAlchemy objects
    if hasattr(persona, "__dict__"):
        try:
            result = {}
            for key, value in persona.__dict__.items():
                if not key.startswith("_"):  # Skip SQLAlchemy internal attributes
                    result[key] = value
            return result
        except Exception as e:
            logger.warning(f"Failed to convert SQLAlchemy persona to dict: {e}")

    # Handle objects with __slots__ or other attribute access
    if hasattr(persona, "__class__"):
        try:
            result = {}
            # Try to get all attributes from the class
            for attr in dir(persona):
                if not attr.startswith("_") and not callable(getattr(persona, attr)):
                    try:
                        result[attr] = getattr(persona, attr)
                    except (AttributeError, TypeError):
                        continue
            if result:  # Only return if we found some attributes
                return result
        except Exception as e:
            logger.warning(f"Failed to extract attributes from persona: {e}")

    raise ValueError(
        f"Unknown persona type: {type(persona)}. Cannot convert to dictionary."
    )


def normalize_persona_list(personas: List[Any]) -> List[Dict[str, Any]]:
    """
    Normalize a list of personas to a list of dictionaries.

    Args:
        personas: List of persona objects of any type

    Returns:
        List of normalized persona dictionaries
    """
    if not personas:
        return []

    normalized = []
    for i, persona in enumerate(personas):
        try:
            normalized_persona = normalize_persona_to_dict(persona)

            # Ensure required fields exist
            if "name" not in normalized_persona or not normalized_persona["name"]:
                normalized_persona["name"] = f"Persona_{i+1}"

            if "description" not in normalized_persona:
                normalized_persona["description"] = "Generated persona"

            # Ensure confidence field exists
            if "confidence" not in normalized_persona:
                normalized_persona["confidence"] = safe_persona_access(
                    persona, "confidence", 0.5
                )

            normalized.append(normalized_persona)

        except Exception as e:
            logger.warning(f"Skipping invalid persona {i}: {e}")
            # Create a minimal fallback persona
            fallback_persona = {
                "name": f"Persona_{i+1}",
                "description": "Generated persona (conversion failed)",
                "confidence": 0.3,
                "error": str(e),
            }
            normalized.append(fallback_persona)

    return normalized


def extract_persona_field_safely(
    persona: Any, field: str, field_type: type = str
) -> Any:
    """
    Extract a specific field from a persona with type conversion.

    Args:
        persona: Persona object
        field: Field name to extract
        field_type: Expected type for the field

    Returns:
        Extracted and converted field value
    """
    value = safe_persona_access(persona, field)

    if value is None:
        return None

    try:
        if field_type == str:
            return str(value) if value is not None else ""
        elif field_type == float:
            return float(value) if value is not None else 0.0
        elif field_type == int:
            return int(value) if value is not None else 0
        elif field_type == list:
            if isinstance(value, list):
                return value
            elif isinstance(value, str):
                return [value] if value else []
            else:
                return [str(value)] if value else []
        elif field_type == dict:
            if isinstance(value, dict):
                return value
            else:
                return {}
        else:
            return value
    except (ValueError, TypeError) as e:
        logger.debug(f"Type conversion failed for field '{field}': {e}")
        return None


def validate_persona_structure(persona: Any) -> bool:
    """
    Validate that a persona has the minimum required structure.

    Args:
        persona: Persona object to validate

    Returns:
        True if persona has valid structure, False otherwise
    """
    try:
        # Check for required fields
        name = safe_persona_access(persona, "name")
        if not name or not str(name).strip():
            return False

        # Persona should have some content
        description = safe_persona_access(persona, "description", "")
        confidence = safe_persona_access(persona, "confidence", 0)

        # At least one of these should exist and be meaningful
        if not description and confidence <= 0:
            return False

        return True

    except Exception as e:
        logger.debug(f"Persona validation failed: {e}")
        return False


def merge_persona_data(
    base_persona: Any, enhancement_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Merge enhancement data into a base persona.

    Args:
        base_persona: Original persona object
        enhancement_data: Additional data to merge

    Returns:
        Merged persona dictionary
    """
    try:
        # Start with normalized base persona
        merged = normalize_persona_to_dict(base_persona)

        # Merge enhancement data
        for key, value in enhancement_data.items():
            if value is not None:  # Only merge non-None values
                merged[key] = value

        return merged

    except Exception as e:
        logger.error(f"Failed to merge persona data: {e}")
        # Return base persona as fallback
        try:
            return normalize_persona_to_dict(base_persona)
        except Exception:
            return {
                "name": "Unknown Persona",
                "description": "Merge failed",
                "error": str(e),
            }
