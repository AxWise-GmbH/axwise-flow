"""
Instructor-based JSON parsing utilities.

This module provides a bridge between the legacy JSON parsing utilities and
the new Instructor-based approach. It maintains API compatibility with the
existing code while leveraging Instructor's structured output capabilities.
"""

import json
import logging
from typing import Any, Dict, List, Optional, Type, TypeVar, Union

from pydantic import BaseModel, ValidationError

from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
from backend.utils.json.json_repair import repair_json as legacy_repair_json
from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair

logger = logging.getLogger(__name__)

# Type variable for generic Pydantic model
T = TypeVar('T', bound=BaseModel)


class InstructorParser:
    """
    Instructor-based JSON parser.

    This class provides methods for parsing JSON using Instructor's structured
    output capabilities, with fallbacks to legacy parsers when needed.
    """

    def __init__(self, instructor_client: Optional[InstructorGeminiClient] = None):
        """
        Initialize the Instructor parser.

        Args:
            instructor_client: Optional InstructorGeminiClient instance
        """
        self.instructor_client = instructor_client
        self._initialized = instructor_client is not None

    def _ensure_initialized(self):
        """Ensure the Instructor client is initialized."""
        if not self._initialized:
            # Lazy initialization of the Instructor client
            from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
            from infrastructure.constants.llm_constants import ENV_GEMINI_API_KEY
            import os

            api_key = os.getenv(ENV_GEMINI_API_KEY)
            if api_key:
                self.instructor_client = InstructorGeminiClient(api_key=api_key)
                self._initialized = True
            else:
                logger.warning("No Gemini API key found. Instructor parser will use fallback methods.")

    def parse_json(
        self, 
        json_str: str, 
        context: str = "", 
        default_value: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Parse JSON string using Instructor's capabilities with fallback to legacy parsers.

        Args:
            json_str: The JSON string to parse
            context: Context for error logging
            default_value: Default value to return if parsing fails

        Returns:
            Parsed JSON as dictionary
        """
        if not json_str:
            logger.warning(f"Empty JSON string in {context}")
            return default_value or {}

        # First try direct parsing
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"Direct JSON parsing failed in {context}: {e}")

        # Try to remove markdown formatting
        cleaned_json = self._remove_markdown_formatting(json_str)
        try:
            return json.loads(cleaned_json)
        except json.JSONDecodeError:
            logger.warning(f"JSON parsing failed after markdown cleaning in {context}")

        # Try legacy repair
        try:
            repaired_json = legacy_repair_json(json_str)
            return json.loads(repaired_json)
        except Exception as e:
            logger.warning(f"Legacy JSON repair failed in {context}: {e}")

        # Try enhanced repair
        try:
            repaired_json = EnhancedJSONRepair.repair_json(json_str)
            return json.loads(repaired_json)
        except Exception as e:
            logger.warning(f"Enhanced JSON repair failed in {context}: {e}")

        # Return default value if all parsing attempts fail
        logger.error(f"All JSON parsing attempts failed in {context}")
        return default_value or {}

    def parse_with_model(
        self, 
        json_str: str, 
        model_class: Type[T], 
        context: str = ""
    ) -> Optional[T]:
        """
        Parse JSON string using a Pydantic model.

        Args:
            json_str: The JSON string to parse
            model_class: The Pydantic model class to use for parsing
            context: Context for error logging

        Returns:
            Parsed model instance or None if parsing fails
        """
        # First try direct parsing with the model
        try:
            return model_class.model_validate_json(json_str)
        except ValidationError as e:
            logger.warning(f"Pydantic validation error in {context}: {e}")
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error in {context}: {e}")

        # Try parsing as dict first, then validate with model
        parsed_dict = self.parse_json(json_str, context)
        if parsed_dict:
            try:
                return model_class.model_validate(parsed_dict)
            except ValidationError as e:
                logger.warning(f"Pydantic validation error after dict parsing in {context}: {e}")

        # If we have an Instructor client, try to repair the JSON
        if self.instructor_client:
            try:
                self._ensure_initialized()
                # Use Instructor to parse the JSON
                system_instruction = (
                    "You are a helpful assistant that repairs malformed JSON. "
                    "Your task is to fix the JSON and return a valid JSON object "
                    "that matches the expected schema."
                )
                
                # Create a simple prompt with the JSON string
                prompt = f"""
                The following JSON is malformed:
                
                ```
                {json_str}
                ```
                
                Please fix it to match this schema:
                
                ```
                {model_class.model_json_schema()}
                ```
                
                Return only the fixed JSON, nothing else.
                """
                
                # Use Instructor to repair the JSON
                repaired = self.instructor_client.generate_with_model(
                    prompt=prompt,
                    model_class=model_class,
                    temperature=0.0,
                    system_instruction=system_instruction,
                    response_mime_type="application/json"
                )
                
                logger.info(f"Successfully repaired JSON with Instructor in {context}")
                return repaired
            except Exception as e:
                logger.error(f"Instructor-based repair failed in {context}: {e}")

        return None

    def parse_llm_json_response(
        self, 
        response: Union[str, Dict[str, Any]], 
        context: str = "", 
        default_value: Optional[Dict] = None,
        task: str = ""
    ) -> Dict[str, Any]:
        """
        Parse JSON response from LLM with enhanced error recovery.
        
        This method maintains API compatibility with the legacy parser.

        Args:
            response: LLM response (string or dictionary)
            context: Context for error logging
            default_value: Default value to return if parsing fails
            task: Task type for specialized parsing

        Returns:
            Parsed JSON as dictionary
        """
        # If response is already a dict, return it
        if isinstance(response, dict):
            return response

        # If response is a string, parse it
        if isinstance(response, str):
            # Use specialized parsing for specific tasks
            if task == "persona_formation":
                try:
                    return self._parse_persona_formation(response, context, default_value)
                except Exception as e:
                    logger.error(f"Persona formation parsing failed in {context}: {e}")
            
            # Default parsing
            return self.parse_json(response, context, default_value)

        # If response is neither a dict nor a string, return default
        logger.warning(f"Unexpected response type in {context}: {type(response)}")
        return default_value or {}

    def _parse_persona_formation(
        self, 
        response: str, 
        context: str = "", 
        default_value: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Specialized parsing for persona formation task.

        Args:
            response: LLM response string
            context: Context for error logging
            default_value: Default value to return if parsing fails

        Returns:
            Parsed JSON as dictionary
        """
        # Try to use EnhancedJSONRepair first for persona formation
        try:
            repaired = EnhancedJSONRepair.repair_json(response)
            return json.loads(repaired)
        except Exception as e:
            logger.warning(f"Enhanced JSON repair failed for persona formation in {context}: {e}")

        # Fall back to standard parsing
        return self.parse_json(response, context, default_value)

    def _remove_markdown_formatting(self, json_str: str) -> str:
        """
        Remove markdown formatting from JSON string.

        Args:
            json_str: The JSON string to clean

        Returns:
            Cleaned JSON string
        """
        # Remove markdown code block markers
        cleaned = json_str.strip()
        
        # Remove leading 'json' or other language identifiers that might appear before code blocks
        if cleaned.startswith(('```json', '```JSON', '```')):
            cleaned = cleaned.split('```', 1)[-1]
            if '```' in cleaned:
                cleaned = cleaned.rsplit('```', 1)[0]
        
        # Remove any trailing backticks
        cleaned = cleaned.rstrip('`')
        
        # Remove any leading characters before the first {
        if '{' in cleaned and not cleaned.lstrip().startswith('{'):
            cleaned = cleaned[cleaned.find('{'):]
        
        # Remove any leading characters before the first [
        if '[' in cleaned and not cleaned.lstrip().startswith('['):
            cleaned = cleaned[cleaned.find('['):]
            
        return cleaned.strip()


# Create a singleton instance for easy import
instructor_parser = InstructorParser()


# Compatibility functions that match the legacy API
def parse_json_with_instructor(
    json_str: str, 
    context: str = "", 
    default_value: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Parse JSON string using Instructor's capabilities.
    
    This function provides a direct replacement for legacy parsing functions.

    Args:
        json_str: The JSON string to parse
        context: Context for error logging
        default_value: Default value to return if parsing fails

    Returns:
        Parsed JSON as dictionary
    """
    return instructor_parser.parse_json(json_str, context, default_value)


def parse_llm_json_response_with_instructor(
    response: Union[str, Dict[str, Any]], 
    context: str = "", 
    default_value: Optional[Dict] = None,
    task: str = ""
) -> Dict[str, Any]:
    """
    Parse JSON response from LLM using Instructor.
    
    This function provides a direct replacement for legacy parsing functions.

    Args:
        response: LLM response (string or dictionary)
        context: Context for error logging
        default_value: Default value to return if parsing fails
        task: Task type for specialized parsing

    Returns:
        Parsed JSON as dictionary
    """
    return instructor_parser.parse_llm_json_response(response, context, default_value, task)


def parse_with_model_instructor(
    json_str: str, 
    model_class: Type[T], 
    context: str = ""
) -> Optional[T]:
    """
    Parse JSON string using a Pydantic model with Instructor.
    
    This function provides a direct replacement for legacy parsing functions.

    Args:
        json_str: The JSON string to parse
        model_class: The Pydantic model class to use for parsing
        context: Context for error logging

    Returns:
        Parsed model instance or None if parsing fails
    """
    return instructor_parser.parse_with_model(json_str, model_class, context)
