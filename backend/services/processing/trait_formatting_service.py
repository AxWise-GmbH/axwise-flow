"""
Trait formatting service for persona formation.

This module provides functionality for:
1. Improving the formatting and clarity of trait values
2. Standardizing formatting across similar types of attributes
3. Preserving the original meaning while improving readability
"""

from typing import Dict, Any, List, Optional
import logging
import re
try:
    # Try to import from backend structure
    from domain.interfaces.llm_unified import ILLMService
    from backend.services.llm.prompts.tasks.trait_formatting import TraitFormattingPrompts
except ImportError:
    try:
        # Try to import from regular structure
        from backend.domain.interfaces.llm_unified import ILLMService
        from backend.services.llm.prompts.tasks.trait_formatting import TraitFormattingPrompts
    except ImportError:
        # Create a minimal interface if both fail
        class ILLMService:
            """Minimal LLM service interface"""
            async def analyze(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

        # Create a minimal prompt class
        class TraitFormattingPrompts:
            """Minimal prompt class"""
            @staticmethod
            def get_prompt(data):
                return ""

# Configure logging
logger = logging.getLogger(__name__)


class TraitFormattingService:
    """
    Service for formatting persona trait values.

    This service uses lightweight LLM calls or string processing to transform
    awkwardly phrased attribute values into natural, concise statements.
    """

    def __init__(self, llm_service: Optional[ILLMService] = None):
        """
        Initialize the trait formatting service.

        Args:
            llm_service: Optional LLM service for advanced formatting
        """
        self.llm_service = llm_service
        self.use_llm = llm_service is not None
        logger.info(f"Initialized TraitFormattingService (use_llm={self.use_llm})")

    async def format_trait_values(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format trait values for better readability.

        Args:
            attributes: Persona attributes (can be simple strings or nested dicts)

        Returns:
            Attributes with formatted trait values
        """
        logger.info("Formatting trait values")

        # List of trait fields to format
        trait_fields = [
            "demographics", "goals_and_motivations", "skills_and_expertise",
            "workflow_and_environment", "challenges_and_frustrations",
            "needs_and_desires", "technology_and_tools", "attitude_towards_research",
            "attitude_towards_ai", "key_quotes", "role_context", "key_responsibilities",
            "tools_used", "collaboration_style", "analysis_approach", "pain_points"
        ]

        # Create a new dictionary to store the formatted attributes
        formatted_attributes = attributes.copy()

        # Process each trait field
        for field in trait_fields:
            if field in attributes:
                try:
                    # Handle both simple string values and nested dict structures
                    trait_value = ""

                    if isinstance(attributes[field], dict) and "value" in attributes[field]:
                        # Nested structure
                        trait_value = attributes[field]["value"]
                    elif isinstance(attributes[field], str):
                        # Simple string value
                        trait_value = attributes[field]

                    # Skip if the trait value is empty or default
                    if not trait_value or trait_value.startswith("Unknown") or trait_value.startswith("Default"):
                        continue

                    # Format the trait value
                    if self.use_llm:
                        # Use LLM for advanced formatting
                        formatted_value = await self._format_with_llm(field, trait_value)
                    else:
                        # Use string processing for basic formatting
                        formatted_value = self._format_with_string_processing(field, trait_value)

                    # Update the trait value if formatting was successful
                    if formatted_value and formatted_value != trait_value:
                        # If the attribute is already a dict with value field, update it
                        if isinstance(formatted_attributes[field], dict) and "value" in formatted_attributes[field]:
                            formatted_attributes[field]["value"] = formatted_value
                        else:
                            # For simple string values, just update the string
                            formatted_attributes[field] = formatted_value

                        logger.info(f"Formatted trait value for {field}")
                except Exception as e:
                    logger.error(f"Error formatting trait value for {field}: {str(e)}", exc_info=True)

        return formatted_attributes

    async def _format_with_llm(self, field: str, trait_value: str) -> str:
        """
        Format trait value using LLM.

        Args:
            field: Trait field name
            trait_value: Trait value to format

        Returns:
            Formatted trait value
        """
        try:
            # Skip if LLM service is not available
            if not self.llm_service:
                return trait_value

            # Create a prompt for formatting
            prompt = self._create_formatting_prompt(field, trait_value)

            # Call LLM to format the trait value
            llm_response = await self.llm_service.analyze({
                "task": "trait_formatting",
                "text": trait_value,
                "prompt": prompt,
                "enforce_json": False,  # Simple text response is sufficient
                "temperature": 0.0  # Use deterministic output for consistent results
            })

            # Parse the response
            formatted_value = self._parse_llm_response(llm_response)

            # If LLM failed to format, fall back to string processing
            if not formatted_value:
                logger.info(f"LLM failed to format trait value for {field}, falling back to string processing")
                return self._format_with_string_processing(field, trait_value)

            return formatted_value

        except Exception as e:
            logger.error(f"Error formatting trait value with LLM for {field}: {str(e)}", exc_info=True)
            # Fall back to string processing on error
            return self._format_with_string_processing(field, trait_value)

    def _create_formatting_prompt(self, field: str, trait_value: str) -> str:
        """
        Create a prompt for formatting trait values.

        Args:
            field: Trait field name
            trait_value: Trait value to format

        Returns:
            Prompt string
        """
        # Use the prompt from the TraitFormattingPrompts class
        return TraitFormattingPrompts.get_prompt({
            "field": field,
            "trait_value": trait_value
        })

    def _parse_llm_response(self, llm_response: Any) -> str:
        """
        Parse LLM response to extract formatted trait value.

        Args:
            llm_response: Response from LLM

        Returns:
            Formatted trait value
        """
        try:
            # Handle different response types
            if isinstance(llm_response, str):
                # Clean up the response
                formatted_value = llm_response.strip()

                # Remove any markdown formatting
                formatted_value = re.sub(r'```.*?```', '', formatted_value, flags=re.DOTALL)
                formatted_value = re.sub(r'`(.*?)`', r'\1', formatted_value)

                # Remove any "Formatted Value:" prefix
                formatted_value = re.sub(r'^(Formatted Value:|Reformatted Value:|Result:)\s*', '', formatted_value, flags=re.IGNORECASE)

                return formatted_value.strip()

            # Default to empty string if parsing fails
            return ""

        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}", exc_info=True)
            return ""

    def _format_with_string_processing(self, field: str, trait_value: str) -> str:
        """
        Format trait value using string processing.

        Args:
            field: Trait field name
            trait_value: Trait value to format

        Returns:
            Formatted trait value
        """
        # Remove any markdown formatting
        formatted_value = re.sub(r'[*_#]', '', trait_value)

        # Fix common formatting issues

        # 1. Convert list-like strings to proper bullet points
        if ',' in formatted_value and len(formatted_value) > 30:
            # Check if it looks like a comma-separated list
            items = [item.strip() for item in formatted_value.split(',') if item.strip()]
            if len(items) >= 3:
                # Format as bullet points
                formatted_value = '\n'.join([f"• {item}" for item in items])

        # 2. Fix capitalization
        if formatted_value and not formatted_value.startswith('•'):
            # Capitalize first letter of the value
            formatted_value = formatted_value[0].upper() + formatted_value[1:]

        # 3. Ensure proper ending punctuation for sentences
        if formatted_value and not formatted_value.endswith(('.', '!', '?', ':', ';')) and not '\n' in formatted_value:
            formatted_value += '.'

        # 4. Remove redundant field name from the value
        field_name = field.replace('_', ' ')
        if formatted_value.lower().startswith(field_name.lower()):
            # Remove the field name from the beginning
            formatted_value = formatted_value[len(field_name):].strip()
            # Capitalize first letter again
            if formatted_value:
                formatted_value = formatted_value[0].upper() + formatted_value[1:]

        # 5. Fix spacing issues
        formatted_value = re.sub(r'\s+', ' ', formatted_value)
        formatted_value = formatted_value.replace(' .', '.').replace(' ,', ',')

        # 6. Handle field-specific formatting
        if field == "demographics":
            # Ensure demographics are formatted consistently
            if not "age" in formatted_value.lower() and not "years" in formatted_value.lower():
                # Add age placeholder if missing
                formatted_value = f"Age not specified. {formatted_value}"

        elif field == "tools_used" or field == "technology_and_tools":
            # Format tools as a list if not already
            if not '\n' in formatted_value and ',' in formatted_value:
                tools = [tool.strip() for tool in formatted_value.split(',') if tool.strip()]
                formatted_value = '\n'.join([f"• {tool}" for tool in tools])

        return formatted_value
