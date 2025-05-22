"""
JSON processor utility.

This module provides a unified interface for JSON operations, including parsing,
validation, and repair. It leverages the existing JSON repair functionality
and adds additional validation and schema-based parsing.
"""

import json
import logging
from typing import Any, Dict, List, Union, Optional, Type, TypeVar
from pydantic import BaseModel, ValidationError

from backend.utils.json.json_repair import (
    repair_json, 
    repair_enhanced_themes_json, 
    parse_json_safely, 
    parse_json_array_safely
)

logger = logging.getLogger(__name__)

# Type variable for generic Pydantic model
T = TypeVar('T', bound=BaseModel)

class JSONProcessor:
    """
    Unified JSON processing utility.
    
    This class provides methods for parsing, validating, and repairing JSON data,
    with support for Pydantic models and schema validation.
    """
    
    @staticmethod
    def parse(json_str: str, schema: Optional[Dict[str, Any]] = None, 
              repair: bool = True, task_type: Optional[str] = None) -> Union[Dict[str, Any], List[Any]]:
        """
        Parse JSON string with optional schema validation and repair.
        
        Args:
            json_str: The JSON string to parse
            schema: Optional JSON schema for validation
            repair: Whether to attempt repair if parsing fails
            task_type: Optional task type for specialized repair
            
        Returns:
            The parsed JSON object or array
            
        Raises:
            ValueError: If parsing fails and repair is disabled or unsuccessful
        """
        if not json_str:
            return {}
            
        try:
            # First attempt: direct parsing
            parsed = json.loads(json_str)
            
            # Validate against schema if provided
            if schema:
                # TODO: Implement schema validation
                pass
                
            return parsed
        except json.JSONDecodeError as e:
            if not repair:
                raise ValueError(f"Invalid JSON: {str(e)}")
                
            logger.warning(f"Initial JSON parsing failed: {e}. Attempting repair.")
            
            # Use existing repair functionality
            return parse_json_safely(json_str, task_type=task_type)
    
    @staticmethod
    def validate(data: Union[Dict[str, Any], List[Any]], schema: Dict[str, Any]) -> bool:
        """
        Validate data against JSON schema.
        
        Args:
            data: The data to validate
            schema: The JSON schema to validate against
            
        Returns:
            True if validation succeeds, False otherwise
        """
        # TODO: Implement schema validation
        return True
    
    @staticmethod
    def to_json(data: Any, pretty: bool = False) -> str:
        """
        Convert data to JSON string.
        
        Args:
            data: The data to convert
            pretty: Whether to format the JSON with indentation
            
        Returns:
            JSON string representation of the data
        """
        indent = 2 if pretty else None
        return json.dumps(data, indent=indent, ensure_ascii=False)
    
    @staticmethod
    def parse_with_model(json_str: str, model_class: Type[T], repair: bool = True) -> T:
        """
        Parse JSON string and validate with Pydantic model.
        
        Args:
            json_str: The JSON string to parse
            model_class: The Pydantic model class to validate against
            repair: Whether to attempt repair if parsing fails
            
        Returns:
            An instance of the Pydantic model
            
        Raises:
            ValueError: If parsing or validation fails
        """
        try:
            # First try to parse the JSON
            data = JSONProcessor.parse(json_str, repair=repair)
            
            # Then validate with the model
            return model_class.parse_obj(data)
        except ValidationError as e:
            logger.error(f"Validation error with model {model_class.__name__}: {str(e)}")
            raise ValueError(f"Failed to validate JSON with model {model_class.__name__}: {str(e)}")
    
    @classmethod
    def parse_transcript(cls, json_str: str) -> Dict[str, Any]:
        """
        Parse transcript JSON with appropriate schema.
        
        Args:
            json_str: The JSON string to parse
            
        Returns:
            Parsed transcript data
        """
        # Import here to avoid circular imports
        from backend.domain.models.transcript import StructuredTranscript
        
        try:
            # Try to parse with the StructuredTranscript model
            transcript = cls.parse_with_model(json_str, StructuredTranscript)
            return transcript.dict()
        except ValueError:
            # If that fails, try to parse as a list of segments
            try:
                segments = parse_json_array_safely(json_str)
                return {"segments": segments}
            except Exception as e:
                logger.error(f"Failed to parse transcript JSON: {str(e)}")
                return {"segments": []}
    
    @classmethod
    def parse_themes(cls, json_str: str) -> Dict[str, Any]:
        """
        Parse themes JSON with appropriate schema.
        
        Args:
            json_str: The JSON string to parse
            
        Returns:
            Parsed themes data
        """
        try:
            # Try to parse as a dictionary with a 'themes' key
            data = cls.parse(json_str, repair=True, task_type="theme_analysis")
            
            # Check if we have a themes array
            if isinstance(data, dict) and "themes" in data and isinstance(data["themes"], list):
                return data
            
            # If we have an array directly, wrap it in a themes object
            if isinstance(data, list):
                return {"themes": data}
            
            # Otherwise, return an empty themes object
            return {"themes": []}
        except Exception as e:
            logger.error(f"Failed to parse themes JSON: {str(e)}")
            return {"themes": []}
    
    @classmethod
    def parse_enhanced_themes(cls, json_str: str) -> Dict[str, Any]:
        """
        Parse enhanced themes JSON with appropriate schema.
        
        Args:
            json_str: The JSON string to parse
            
        Returns:
            Parsed enhanced themes data
        """
        try:
            # Use specialized repair for enhanced themes
            data = cls.parse(json_str, repair=True, task_type="theme_analysis_enhanced")
            
            # Check if we have an enhanced_themes array
            if isinstance(data, dict) and "enhanced_themes" in data and isinstance(data["enhanced_themes"], list):
                return data
            
            # If we have a themes array, convert it to enhanced_themes
            if isinstance(data, dict) and "themes" in data and isinstance(data["themes"], list):
                return {"enhanced_themes": data["themes"]}
            
            # If we have an array directly, wrap it in an enhanced_themes object
            if isinstance(data, list):
                return {"enhanced_themes": data}
            
            # Otherwise, return an empty enhanced_themes object
            return {"enhanced_themes": []}
        except Exception as e:
            logger.error(f"Failed to parse enhanced themes JSON: {str(e)}")
            return {"enhanced_themes": []}
    
    @classmethod
    def parse_patterns(cls, json_str: str) -> Dict[str, Any]:
        """
        Parse patterns JSON with appropriate schema.
        
        Args:
            json_str: The JSON string to parse
            
        Returns:
            Parsed patterns data
        """
        try:
            # Try to parse as a dictionary with a 'patterns' key
            data = cls.parse(json_str, repair=True, task_type="pattern_recognition")
            
            # Check if we have a patterns array
            if isinstance(data, dict) and "patterns" in data and isinstance(data["patterns"], list):
                return data
            
            # If we have an array directly, wrap it in a patterns object
            if isinstance(data, list):
                return {"patterns": data}
            
            # Otherwise, return an empty patterns object
            return {"patterns": []}
        except Exception as e:
            logger.error(f"Failed to parse patterns JSON: {str(e)}")
            return {"patterns": []}
    
    @classmethod
    def parse_persona(cls, json_str: str) -> Dict[str, Any]:
        """
        Parse persona JSON with appropriate schema.
        
        Args:
            json_str: The JSON string to parse
            
        Returns:
            Parsed persona data
        """
        try:
            # Try to parse as a persona object
            data = cls.parse(json_str, repair=True, task_type="persona_formation")
            
            # Ensure we have a dictionary
            if not isinstance(data, dict):
                return {}
            
            return data
        except Exception as e:
            logger.error(f"Failed to parse persona JSON: {str(e)}")
            return {}
