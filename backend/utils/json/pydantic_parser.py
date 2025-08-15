"""
Pydantic-based JSON parser for robust parsing of LLM-generated JSON.

This module provides utilities for parsing JSON using Pydantic models,
with special handling for common issues in LLM-generated JSON.
"""

import json
import logging
from typing import (
    Any,
    Dict,
    List,
    Union,
    Optional,
    Type,
    TypeVar,
    Generic,
    get_type_hints,
)
from pydantic import BaseModel, ValidationError, create_model, Field

from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair

logger = logging.getLogger(__name__)


def parse_json_with_pydantic(
    json_str: str, context: str = "", default_value: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Parse JSON string using Pydantic-based parsing as a replacement for Instructor.

    This function provides a direct replacement for parse_json_with_instructor.

    Args:
        json_str: The JSON string to parse
        context: Context for error logging
        default_value: Default value to return if parsing fails

    Returns:
        Parsed JSON as dictionary
    """
    if not json_str:
        logger.warning(f"Empty JSON string in context: {context}")
        return default_value or {}

    # First try direct JSON parsing
    try:
        result = json.loads(json_str)
        logger.info(
            f"Successfully parsed JSON with direct parsing in context: {context}"
        )
        return result
    except json.JSONDecodeError as e:
        logger.warning(f"JSON decode error in context {context}: {str(e)}")
        # Continue to repair and retry
    except Exception as e:
        logger.error(f"Unexpected error parsing JSON in context {context}: {str(e)}")
        # Continue to repair and retry

    # Try to repair the JSON
    try:
        repaired = EnhancedJSONRepair.repair_json(json_str)
        logger.info(f"Repaired JSON in context {context}")

        # Try to parse the repaired JSON
        try:
            result = json.loads(repaired)
            logger.info(f"Successfully parsed repaired JSON in context: {context}")
            return result
        except json.JSONDecodeError as e:
            logger.error(
                f"JSON decode error after repair in context {context}: {str(e)}"
            )
            return default_value or {}
    except Exception as e:
        logger.error(f"Error repairing JSON in context {context}: {str(e)}")
        return default_value or {}


def parse_llm_json_response_with_pydantic(
    response: Union[str, Dict[str, Any]],
    context: str = "",
    default_value: Optional[Dict] = None,
    task: str = "",
) -> Dict[str, Any]:
    """
    Parse JSON response from LLM using Pydantic-based parsing as a replacement for Instructor.

    This function provides a direct replacement for parse_llm_json_response_with_instructor.

    Args:
        response: LLM response (string or dictionary)
        context: Context for error logging
        default_value: Default value to return if parsing fails
        task: Task type for specialized parsing

    Returns:
        Parsed JSON as dictionary
    """
    if isinstance(response, dict):
        logger.info(f"Response is already a dictionary in context: {context}")
        return response

    if isinstance(response, str):
        return parse_json_with_pydantic(response, context, default_value)

    logger.warning(f"Unexpected response type {type(response)} in context: {context}")
    return default_value or {}


# Type variable for generic Pydantic model
T = TypeVar("T", bound=BaseModel)


class PydanticParser:
    """
    Pydantic-based JSON parser for robust parsing of LLM-generated JSON.

    This class provides methods for parsing JSON using Pydantic models,
    with special handling for common issues in LLM-generated JSON.
    """

    @staticmethod
    def parse_json(json_str: str, model: Type[T], context: str = "") -> Optional[T]:
        """
        Parse JSON string into a Pydantic model with robust error handling.

        Args:
            json_str: JSON string to parse
            model: Pydantic model class to parse into
            context: Context information for error reporting

        Returns:
            Parsed Pydantic model or None if parsing fails
        """
        if not json_str:
            logger.warning(f"Empty JSON string in context: {context}")
            return None

        # First try direct parsing
        try:
            # Try to parse directly into the model
            return model.parse_raw(json_str)
        except ValidationError as e:
            logger.warning(f"Pydantic validation error in context {context}: {str(e)}")
            # Continue to repair and retry
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error in context {context}: {str(e)}")
            # Continue to repair and retry
        except Exception as e:
            logger.error(
                f"Unexpected error parsing JSON in context {context}: {str(e)}"
            )
            # Continue to repair and retry

        # Try to repair the JSON
        try:
            repaired = EnhancedJSONRepair.repair_json(json_str)
            logger.info(f"Repaired JSON in context {context}")

            # Try to parse the repaired JSON
            try:
                return model.parse_raw(repaired)
            except ValidationError as e:
                logger.warning(
                    f"Pydantic validation error after repair in context {context}: {str(e)}"
                )
                # Try partial parsing
                return PydanticParser._partial_parse(repaired, model, context)
            except json.JSONDecodeError as e:
                logger.error(
                    f"JSON decode error after repair in context {context}: {str(e)}"
                )
                return None
        except Exception as e:
            logger.error(f"Error repairing JSON in context {context}: {str(e)}")
            return None

    @staticmethod
    def _partial_parse(json_str: str, model: Type[T], context: str) -> Optional[T]:
        """
        Attempt partial parsing of JSON into a Pydantic model.

        This method tries to extract as much valid data as possible from the JSON
        and create a model instance with partial data.

        Args:
            json_str: JSON string to parse
            model: Pydantic model class to parse into
            context: Context information for error reporting

        Returns:
            Partially parsed Pydantic model or None if parsing fails
        """
        try:
            # Parse the JSON into a dict
            data = json.loads(json_str)

            # Get the model's fields
            model_fields = model.__annotations__

            # Extract valid fields
            valid_data = {}
            for field_name, field_type in model_fields.items():
                if field_name in data:
                    valid_data[field_name] = data[field_name]

            # Create a model instance with the valid fields
            return model.parse_obj(valid_data)
        except Exception as e:
            logger.error(f"Error during partial parsing in context {context}: {str(e)}")
            return None

    @staticmethod
    def parse_list(json_str: str, model: Type[T], context: str = "") -> List[T]:
        """
        Parse JSON string into a list of Pydantic models with robust error handling.

        Args:
            json_str: JSON string to parse
            model: Pydantic model class for list items
            context: Context information for error reporting

        Returns:
            List of parsed Pydantic models or empty list if parsing fails
        """
        if not json_str:
            logger.warning(f"Empty JSON string in context: {context}")
            return []

        # First try direct parsing
        try:
            # Try to parse directly into a list of models
            data = json.loads(json_str)
            if not isinstance(data, list):
                logger.warning(
                    f"Expected list but got {type(data).__name__} in context {context}"
                )
                if isinstance(data, dict):
                    # Check if there's a list field in the dict
                    for key, value in data.items():
                        if isinstance(value, list):
                            logger.info(
                                f"Found list in field '{key}' in context {context}"
                            )
                            data = value
                            break
                    else:
                        # If no list field found, wrap the dict in a list
                        data = [data]
                else:
                    # For any other type, return empty list
                    return []

            # Parse each item in the list
            result = []
            for item in data:
                try:
                    result.append(model.parse_obj(item))
                except ValidationError as e:
                    logger.warning(
                        f"Validation error for list item in context {context}: {str(e)}"
                    )
                    # Try partial parsing for this item
                    parsed_item = PydanticParser._partial_parse_dict(
                        item, model, context
                    )
                    if parsed_item:
                        result.append(parsed_item)

            return result
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error in context {context}: {str(e)}")
            # Continue to repair and retry
        except Exception as e:
            logger.error(
                f"Unexpected error parsing JSON list in context {context}: {str(e)}"
            )
            # Continue to repair and retry

        # Try to repair the JSON
        try:
            repaired = EnhancedJSONRepair.repair_json(json_str)
            logger.info(f"Repaired JSON list in context {context}")

            # Try to parse the repaired JSON
            try:
                data = json.loads(repaired)
                if not isinstance(data, list):
                    logger.warning(
                        f"Expected list but got {type(data).__name__} after repair in context {context}"
                    )
                    if isinstance(data, dict):
                        # Check if there's a list field in the dict
                        for key, value in data.items():
                            if isinstance(value, list):
                                logger.info(
                                    f"Found list in field '{key}' after repair in context {context}"
                                )
                                data = value
                                break
                        else:
                            # If no list field found, wrap the dict in a list
                            data = [data]
                    else:
                        # For any other type, return empty list
                        return []

                # Parse each item in the list
                result = []
                for item in data:
                    try:
                        result.append(model.parse_obj(item))
                    except ValidationError as e:
                        logger.warning(
                            f"Validation error for list item after repair in context {context}: {str(e)}"
                        )
                        # Try partial parsing for this item
                        parsed_item = PydanticParser._partial_parse_dict(
                            item, model, context
                        )
                        if parsed_item:
                            result.append(parsed_item)

                return result
            except json.JSONDecodeError as e:
                logger.error(
                    f"JSON decode error after repair in context {context}: {str(e)}"
                )
                return []
        except Exception as e:
            logger.error(f"Error repairing JSON list in context {context}: {str(e)}")
            return []

    @staticmethod
    def _partial_parse_dict(
        data: Dict[str, Any], model: Type[T], context: str
    ) -> Optional[T]:
        """
        Attempt partial parsing of a dict into a Pydantic model.

        Args:
            data: Dict to parse
            model: Pydantic model class to parse into
            context: Context information for error reporting

        Returns:
            Partially parsed Pydantic model or None if parsing fails
        """
        try:
            # Get the model's fields
            model_fields = model.__annotations__

            # Extract valid fields
            valid_data = {}
            for field_name, field_type in model_fields.items():
                if field_name in data:
                    valid_data[field_name] = data[field_name]

            # Create a model instance with the valid fields
            return model.parse_obj(valid_data)
        except Exception as e:
            logger.error(
                f"Error during partial dict parsing in context {context}: {str(e)}"
            )
            return None
