"""
JSON validator utility.

This module provides utilities for validating JSON data against schemas,
with support for Pydantic models and JSON Schema.
"""

import json
import logging
from typing import Any, Dict, List, Union, Optional, Type, TypeVar
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

# Type variable for generic Pydantic model
T = TypeVar('T', bound=BaseModel)

class JSONValidator:
    """
    JSON validation utility.
    
    This class provides methods for validating JSON data against schemas,
    with support for Pydantic models and JSON Schema.
    """
    
    @staticmethod
    def validate_with_schema(data: Union[Dict[str, Any], List[Any]], schema: Dict[str, Any]) -> bool:
        """
        Validate data against JSON Schema.
        
        Args:
            data: The data to validate
            schema: The JSON Schema to validate against
            
        Returns:
            True if validation succeeds, False otherwise
        """
        try:
            # Try to import jsonschema, but don't fail if it's not available
            try:
                from jsonschema import validate, ValidationError as SchemaValidationError
                validate(instance=data, schema=schema)
                return True
            except ImportError:
                logger.warning("jsonschema package not available, falling back to basic validation")
                # Fallback to basic validation if jsonschema is not available
                return JSONValidator._basic_schema_validation(data, schema)
            except SchemaValidationError as e:
                logger.warning(f"JSON Schema validation failed: {str(e)}")
                return False
        except Exception as e:
            logger.error(f"Unexpected error during schema validation: {str(e)}")
            return False
    
    @staticmethod
    def _basic_schema_validation(data: Any, schema: Dict[str, Any]) -> bool:
        """
        Basic schema validation without jsonschema package.
        
        This is a fallback method that performs basic validation against a schema.
        It only supports a subset of JSON Schema features.
        
        Args:
            data: The data to validate
            schema: The JSON Schema to validate against
            
        Returns:
            True if validation succeeds, False otherwise
        """
        # Check type
        if "type" in schema:
            schema_type = schema["type"]
            if schema_type == "object" and not isinstance(data, dict):
                return False
            elif schema_type == "array" and not isinstance(data, list):
                return False
            elif schema_type == "string" and not isinstance(data, str):
                return False
            elif schema_type == "number" and not isinstance(data, (int, float)):
                return False
            elif schema_type == "integer" and not isinstance(data, int):
                return False
            elif schema_type == "boolean" and not isinstance(data, bool):
                return False
            elif schema_type == "null" and data is not None:
                return False
        
        # Check required properties for objects
        if isinstance(data, dict) and "required" in schema:
            for prop in schema["required"]:
                if prop not in data:
                    return False
        
        # Check properties for objects
        if isinstance(data, dict) and "properties" in schema:
            for prop, prop_schema in schema["properties"].items():
                if prop in data:
                    if not JSONValidator._basic_schema_validation(data[prop], prop_schema):
                        return False
        
        # Check items for arrays
        if isinstance(data, list) and "items" in schema:
            for item in data:
                if not JSONValidator._basic_schema_validation(item, schema["items"]):
                    return False
        
        return True
    
    @staticmethod
    def validate_with_model(data: Any, model_class: Type[T]) -> bool:
        """
        Validate data with Pydantic model.
        
        Args:
            data: The data to validate
            model_class: The Pydantic model class to validate against
            
        Returns:
            True if validation succeeds, False otherwise
        """
        try:
            model_class.parse_obj(data)
            return True
        except ValidationError as e:
            logger.warning(f"Pydantic validation failed with model {model_class.__name__}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during Pydantic validation: {str(e)}")
            return False
    
    @staticmethod
    def get_validation_errors(data: Any, model_class: Type[T]) -> List[str]:
        """
        Get validation errors for data against a Pydantic model.
        
        Args:
            data: The data to validate
            model_class: The Pydantic model class to validate against
            
        Returns:
            List of validation error messages
        """
        try:
            model_class.parse_obj(data)
            return []
        except ValidationError as e:
            return [f"{'.'.join(map(str, error['loc']))}: {error['msg']}" for error in e.errors()]
        except Exception as e:
            return [f"Unexpected error: {str(e)}"]
