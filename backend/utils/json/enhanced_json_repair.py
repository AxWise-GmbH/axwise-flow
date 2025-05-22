"""
Enhanced JSON repair utilities.

This module provides enhanced functions for repairing malformed JSON,
specifically targeting common issues in LLM-generated JSON like missing commas.
"""

import json
import re
import logging
from typing import Any, Dict, List, Union, Optional, Tuple

logger = logging.getLogger(__name__)

class EnhancedJSONRepair:
    """
    Enhanced JSON repair utilities for fixing common issues in LLM-generated JSON.

    This class provides methods for repairing malformed JSON, with a focus on
    fixing delimiter issues like missing commas between array elements or
    object properties.
    """

    @staticmethod
    def repair_json(json_str: str, task: str = None) -> str:
        """
        Repair malformed JSON string.

        This method applies multiple repair strategies to fix common issues
        in LLM-generated JSON.

        Args:
            json_str: Potentially malformed JSON string
            task: Optional task type for specialized repairs

        Returns:
            Repaired JSON string
        """
        if not json_str or not isinstance(json_str, str):
            return "{}"

        # Remove any markdown code block markers
        json_str = EnhancedJSONRepair._remove_markdown_markers(json_str)

        # Try to parse as-is first
        try:
            json.loads(json_str)
            return json_str  # Already valid JSON
        except json.JSONDecodeError as e:
            logger.info(f"Initial JSON parsing failed: {str(e)}")

            # If we have a specific task, try task-specific repairs first
            if task == "persona_formation":
                try:
                    repaired = EnhancedJSONRepair._repair_persona_json(json_str, e)
                    # Validate the repaired JSON
                    json.loads(repaired)
                    logger.info("Persona JSON successfully repaired with specialized function")
                    return repaired
                except Exception as e_persona:
                    logger.warning(f"Specialized persona repair failed: {str(e_persona)}")
                    # Continue with general repairs

        # Apply repair strategies in sequence
        repaired = json_str

        # Fix missing commas between array elements
        repaired = EnhancedJSONRepair._fix_missing_commas_in_arrays(repaired)

        # Fix missing commas between object properties
        repaired = EnhancedJSONRepair._fix_missing_commas_in_objects(repaired)

        # Fix trailing commas
        repaired = EnhancedJSONRepair._fix_trailing_commas(repaired)

        # Fix unquoted keys
        repaired = EnhancedJSONRepair._fix_unquoted_keys(repaired)

        # Fix single quotes
        repaired = EnhancedJSONRepair._fix_single_quotes(repaired)

        # Fix unclosed brackets and braces
        repaired = EnhancedJSONRepair._fix_unclosed_brackets(repaired)

        # Validate the repaired JSON
        try:
            json.loads(repaired)
            logger.info("JSON successfully repaired")
            return repaired
        except json.JSONDecodeError as e:
            logger.warning(f"JSON repair failed: {str(e)}")

            # Try more aggressive repair as a last resort
            try:
                return EnhancedJSONRepair._aggressive_repair(json_str, e)
            except Exception as e2:
                logger.error(f"Aggressive JSON repair failed: {str(e2)}")
                return "{}"  # Return empty object as a last resort

    @staticmethod
    def _remove_markdown_markers(json_str: str) -> str:
        """Remove markdown code block markers."""
        # Remove ```json and ``` markers
        json_str = re.sub(r'^```json\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)
        return json_str.strip()

    @staticmethod
    def _fix_missing_commas_in_arrays(json_str: str) -> str:
        """Fix missing commas between array elements."""
        # Pattern: matches closing bracket/brace followed by opening bracket/brace without comma
        pattern = r'([\]\}])(\s*)([\[\{])'
        return re.sub(pattern, r'\1,\2\3', json_str)

    @staticmethod
    def _fix_missing_commas_in_objects(json_str: str) -> str:
        """Fix missing commas between object properties."""
        # This is more complex as we need to identify property boundaries
        # Pattern: matches end of a value (quote or number or boolean or null or closing bracket/brace)
        # followed by a property name (quoted string followed by colon)
        pattern = r'([\"\d\}\]true|false|null])(\s*)(\"[^\"]+\"\s*:)'
        return re.sub(pattern, r'\1,\2\3', json_str)

    @staticmethod
    def _fix_trailing_commas(json_str: str) -> str:
        """Fix trailing commas in arrays and objects."""
        # Remove trailing commas before closing brackets/braces
        pattern = r',(\s*[\}\]])'
        return re.sub(pattern, r'\1', json_str)

    @staticmethod
    def _fix_unquoted_keys(json_str: str) -> str:
        """Fix unquoted object keys."""
        # Pattern: matches unquoted keys (word characters followed by colon)
        pattern = r'([\{\,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)'
        return re.sub(pattern, r'\1"\2"\3', json_str)

    @staticmethod
    def _fix_single_quotes(json_str: str) -> str:
        """Fix single quotes used instead of double quotes."""
        # This is complex because we need to handle nested quotes
        # For simplicity, we'll just replace all single quotes with double quotes
        # This might not work for all cases, especially if the JSON contains actual single quotes in strings
        return json_str.replace("'", '"')

    @staticmethod
    def _fix_unclosed_brackets(json_str: str) -> str:
        """Fix unclosed brackets and braces."""
        # Count opening and closing brackets/braces
        open_curly = json_str.count('{')
        close_curly = json_str.count('}')
        open_square = json_str.count('[')
        close_square = json_str.count(']')

        # Add missing closing brackets/braces
        result = json_str
        for _ in range(open_curly - close_curly):
            result += '}'
        for _ in range(open_square - close_square):
            result += ']'

        return result

    @staticmethod
    def _repair_persona_json(json_str: str, error: json.JSONDecodeError) -> str:
        """
        Specialized repair function for persona JSON.

        This method applies specific repairs for persona JSON, focusing on
        the common issues encountered in persona formation responses.

        Args:
            json_str: Potentially malformed persona JSON string
            error: The JSONDecodeError from the initial parsing attempt

        Returns:
            Repaired JSON string
        """
        logger.info(f"Applying specialized persona JSON repair for error: {str(error)}")

        # Check if this is the specific error we're targeting (line 73 column 67)
        error_msg = str(error)
        line_col_match = re.search(r'line (\d+) column (\d+)', error_msg)

        if line_col_match:
            error_line = int(line_col_match.group(1))
            error_column = int(line_col_match.group(2))
            logger.info(f"Persona JSON error at line {error_line}, column {error_column}")

            # Split the JSON string into lines
            lines = json_str.split('\n')

            # Check if the error line is within range
            if 0 < error_line <= len(lines):
                problem_line = lines[error_line - 1]
                logger.info(f"Problem line ({error_line}): {problem_line}")

                # Check if this is a missing comma error
                if "Expecting ',' delimiter" in error_msg:
                    # Insert a comma at the error position
                    if 0 < error_column <= len(problem_line):
                        fixed_line = problem_line[:error_column] + ',' + problem_line[error_column:]
                        logger.info(f"Fixed line: {fixed_line}")
                        lines[error_line - 1] = fixed_line

                        # Reconstruct the JSON string
                        repaired = '\n'.join(lines)

                        # Try to validate the repaired JSON
                        try:
                            json.loads(repaired)
                            logger.info("Position-aware comma insertion succeeded")
                            return repaired
                        except json.JSONDecodeError as e:
                            logger.warning(f"Position-aware comma insertion failed: {str(e)}")
                            # Continue with other repairs

        # Apply persona-specific repairs
        repaired = json_str

        # Fix common persona JSON issues

        # Fix missing commas in evidence arrays
        repaired = re.sub(r'("evidence":\s*\[\s*"[^"]*")\s*(")', r'\1,\2', repaired)

        # Fix missing commas between trait objects
        repaired = re.sub(r'(}\s*)\n(\s*{)', r'\1,\n\2', repaired)

        # Fix missing commas between persona traits
        repaired = re.sub(r'(}\s*)\n(\s*"[^"]+"\s*:)', r'\1,\n\2', repaired)

        # Fix missing commas in nested objects
        repaired = re.sub(r'("value"\s*:\s*"[^"]*")\s*("confidence")', r'\1,\2', repaired)
        repaired = re.sub(r'("confidence"\s*:\s*\d+(?:\.\d+)?)\s*("evidence")', r'\1,\2', repaired)

        # Fix missing quotes around property names
        repaired = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', repaired)

        # Try to validate the repaired JSON
        try:
            json.loads(repaired)
            logger.info("Persona-specific repairs succeeded")
            return repaired
        except json.JSONDecodeError as e:
            logger.warning(f"Persona-specific repairs failed: {str(e)}")

            # Fall back to general repairs
            return repaired

    @staticmethod
    def _aggressive_repair(json_str: str, error: json.JSONDecodeError) -> str:
        """
        Attempt more aggressive repair when other methods fail.

        This method uses the error information to target the specific issue.
        """
        error_msg = str(error)
        logger.info(f"Attempting aggressive repair for error: {error_msg}")

        # Extract position information from error message
        pos_match = re.search(r'char (\d+)', error_msg)
        line_col_match = re.search(r'line (\d+) column (\d+)', error_msg)

        # Get error position
        error_pos = None
        if pos_match:
            error_pos = int(pos_match.group(1))
            logger.info(f"Error position from char: {error_pos}")

        # Get line and column information for more precise repairs
        error_line = None
        error_column = None
        if line_col_match:
            error_line = int(line_col_match.group(1))
            error_column = int(line_col_match.group(2))
            logger.info(f"Error at line {error_line}, column {error_column}")

            # Calculate position from line and column if char position not available
            if error_pos is None:
                lines = json_str.split('\n')
                if error_line <= len(lines):
                    error_pos = sum(len(lines[i]) + 1 for i in range(error_line - 1))
                    if error_column <= len(lines[error_line - 1]):
                        error_pos += error_column - 1
                    logger.info(f"Calculated error position from line/column: {error_pos}")

        # Handle specific error types
        if "Expecting ',' delimiter" in error_msg:
            if error_pos is not None:
                # Look at the characters around the error position
                before_char = json_str[error_pos-1:error_pos] if error_pos > 0 else ""
                current_char = json_str[error_pos:error_pos+1] if error_pos < len(json_str) else ""
                logger.info(f"Characters around error: before='{before_char}', current='{current_char}'")

                # Insert a comma at the error position
                repaired = json_str[:error_pos] + ',' + json_str[error_pos:]
                logger.info(f"Inserted comma at position {error_pos}")

                # Validate the repair
                try:
                    json.loads(repaired)
                    return repaired
                except json.JSONDecodeError as e:
                    logger.warning(f"Initial comma insertion failed: {str(e)}")

                    # Try alternative positions around the error
                    for offset in [-1, 1, -2, 2]:
                        try_pos = error_pos + offset
                        if 0 <= try_pos < len(json_str):
                            try:
                                alternative = json_str[:try_pos] + ',' + json_str[try_pos:]
                                json.loads(alternative)
                                logger.info(f"Alternative comma insertion at position {try_pos} succeeded")
                                return alternative
                            except:
                                pass

                    # If all alternatives fail, return the original repair attempt
                    return repaired

        elif "Expecting property name enclosed in double quotes" in error_msg:
            if error_pos is not None:
                # Add opening quote for property name
                repaired = json_str[:error_pos] + '"' + json_str[error_pos:]
                logger.info(f"Added opening quote at position {error_pos}")

                # Try to find where to add the closing quote
                try:
                    # Look for the next colon
                    colon_pos = json_str.find(':', error_pos)
                    if colon_pos > error_pos:
                        # Add closing quote before the colon
                        repaired = repaired[:colon_pos + 1] + '"' + repaired[colon_pos + 1:]
                        logger.info(f"Added closing quote before colon at position {colon_pos}")
                except:
                    pass

                return repaired

        # Handle other common error types
        elif "Expecting ':' delimiter" in error_msg:
            if error_pos is not None:
                # Add colon at the error position
                repaired = json_str[:error_pos] + ':' + json_str[error_pos:]
                logger.info(f"Added colon at position {error_pos}")
                return repaired

        elif "Expecting value" in error_msg:
            if error_pos is not None:
                # Check if this is at the end of an object or array
                if error_pos > 0 and json_str[error_pos-1] == ',':
                    # Remove trailing comma
                    repaired = json_str[:error_pos-1] + json_str[error_pos:]
                    logger.info(f"Removed trailing comma at position {error_pos-1}")
                    return repaired
                else:
                    # Add a null value
                    repaired = json_str[:error_pos] + 'null' + json_str[error_pos:]
                    logger.info(f"Added null value at position {error_pos}")
                    return repaired

        elif "Unterminated string" in error_msg:
            # Find the last quote before the error position
            if error_pos is not None:
                last_quote = json_str.rfind('"', 0, error_pos)
                if last_quote >= 0:
                    # Add closing quote
                    repaired = json_str[:error_pos] + '"' + json_str[error_pos:]
                    logger.info(f"Added closing quote at position {error_pos}")
                    return repaired

        # Try line-by-line repair for the specific line with the error
        if error_line is not None:
            try:
                lines = json_str.split('\n')
                if 0 < error_line <= len(lines):
                    problem_line = lines[error_line - 1]
                    logger.info(f"Problem line ({error_line}): {problem_line}")

                    # Apply specific fixes to the problem line
                    fixed_line = problem_line

                    # Fix missing commas between properties
                    fixed_line = re.sub(r'"\s*"', '","', fixed_line)

                    # Fix missing commas after closing braces/brackets
                    fixed_line = re.sub(r'([\}\]])\s*"', r'\1,"', fixed_line)

                    # Fix missing commas before opening braces/brackets
                    fixed_line = re.sub(r'"([\{\[])', r'",\1', fixed_line)

                    if fixed_line != problem_line:
                        logger.info(f"Fixed line: {fixed_line}")
                        lines[error_line - 1] = fixed_line
                        repaired = '\n'.join(lines)

                        # Validate the repair
                        try:
                            json.loads(repaired)
                            logger.info("Line-by-line repair succeeded")
                            return repaired
                        except:
                            logger.warning("Line-by-line repair failed validation")
            except Exception as e:
                logger.warning(f"Line-by-line repair failed: {str(e)}")

        # If we can't handle the specific error, try a more general approach
        # Use a third-party JSON repair library if available
        try:
            import json_repair
            logger.info("Attempting repair with json_repair library")
            return json_repair.repair_json(json_str)
        except ImportError:
            logger.info("json_repair library not available")
            pass

        # Try a more aggressive general repair approach
        try:
            # Fix all potential missing commas
            repaired = json_str

            # Fix missing commas between object properties
            repaired = re.sub(r'([\"\d\}\]true|false|null])(\s*)(\"[^\"]+\"\s*:)', r'\1,\2\3', repaired)

            # Fix missing commas between array elements
            repaired = re.sub(r'([\}\]\"true|false|null\d])(\s*)([\{\[\"])', r'\1,\2\3', repaired)

            # Fix trailing commas
            repaired = re.sub(r',(\s*[\}\]])', r'\1', repaired)

            # Fix unquoted keys
            repaired = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)', r'\1"\2"\3', repaired)

            # Fix single quotes
            repaired = repaired.replace("'", '"')

            # Validate the repair
            try:
                json.loads(repaired)
                logger.info("Aggressive general repair succeeded")
                return repaired
            except:
                logger.warning("Aggressive general repair failed validation")
        except Exception as e:
            logger.warning(f"Aggressive general repair failed: {str(e)}")

        # As a last resort, try to extract valid JSON objects/arrays
        logger.info("Attempting to extract valid JSON objects/arrays")
        # Look for patterns that might be valid JSON objects or arrays
        object_pattern = r'\{[^\{\}]*\}'
        array_pattern = r'\[[^\[\]]*\]'

        objects = re.findall(object_pattern, json_str)
        arrays = re.findall(array_pattern, json_str)

        # Try each extracted object/array
        for candidate in objects + arrays:
            try:
                json.loads(candidate)
                logger.info(f"Found valid JSON fragment: {candidate[:50]}...")
                return candidate  # Return the first valid JSON
            except:
                continue

        # If all else fails, return an empty object
        logger.warning("All repair attempts failed, returning empty object")
        return "{}"

    @staticmethod
    def parse_json(json_str: str, default_value: Any = None) -> Any:
        """
        Parse JSON string with repair attempt.

        Args:
            json_str: JSON string to parse
            default_value: Default value to return if parsing fails

        Returns:
            Parsed JSON object or default value if parsing fails
        """
        if not json_str:
            return default_value

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # Try to repair the JSON
            repaired = EnhancedJSONRepair.repair_json(json_str)
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                logger.error("Failed to parse JSON even after repair")
                return default_value

    @staticmethod
    def parse_json_with_context(json_str: str, context: str = "", default_value: Any = None) -> Any:
        """
        Parse JSON string with repair attempt and context logging.

        Args:
            json_str: JSON string to parse
            context: Context information for logging
            default_value: Default value to return if parsing fails

        Returns:
            Parsed JSON object or default value if parsing fails
        """
        if not json_str:
            logger.warning(f"Empty JSON string in context: {context}")
            return default_value

        # Determine if this is a persona formation task
        task = None
        if "persona" in context.lower():
            task = "persona_formation"

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error in context {context}: {str(e)}")

            # Try to repair the JSON with task-specific repairs
            repaired = EnhancedJSONRepair.repair_json(json_str, task)
            try:
                result = json.loads(repaired)
                logger.info(f"Successfully repaired JSON in context: {context}")
                return result
            except json.JSONDecodeError as e2:
                logger.error(f"Failed to parse JSON even after repair in context {context}: {str(e2)}")

                # If this is a persona formation task, try using Pydantic
                if task == "persona_formation":
                    try:
                        # Import here to avoid circular imports
                        from backend.domain.models.persona_schema import Persona, PersonaResponse

                        logger.info(f"Attempting to extract partial persona data in {context}")

                        # Extract name
                        name_match = re.search(r'"name"\s*:\s*"([^"]+)"', json_str)
                        name = name_match.group(1) if name_match else "Unknown Persona"

                        # Extract description
                        desc_match = re.search(r'"description"\s*:\s*"([^"]+)"', json_str)
                        description = desc_match.group(1) if desc_match else "Persona extracted from partial data"

                        # Create a basic persona
                        persona_data = {
                            "name": name,
                            "description": description
                        }

                        # Try to extract other fields
                        for field in ["archetype", "demographics", "goals_and_motivations", "challenges_and_frustrations"]:
                            field_match = re.search(f'"{field}"\\s*:\\s*\\{{([^}}]+)\\}}', json_str)
                            if field_match:
                                field_content = field_match.group(1)

                                # Extract value
                                value_match = re.search(r'"value"\s*:\s*"([^"]+)"', field_content)
                                if value_match:
                                    value = value_match.group(1)

                                    # Extract confidence
                                    confidence_match = re.search(r'"confidence"\s*:\s*(\d+(?:\.\d+)?)', field_content)
                                    confidence = float(confidence_match.group(1)) if confidence_match else 0.5

                                    # Create trait
                                    persona_data[field] = {
                                        "value": value,
                                        "confidence": confidence
                                    }

                        # Create and validate the persona using Pydantic
                        try:
                            persona = Persona(**persona_data)
                            logger.info(f"Successfully extracted partial persona data in {context}")
                            return persona.model_dump()
                        except Exception as e_pydantic:
                            logger.warning(f"Pydantic validation failed: {str(e_pydantic)}")
                            # Return the raw data if validation fails
                            return persona_data
                    except Exception as e3:
                        logger.error(f"Pydantic extraction failed in {context}: {str(e3)}")

                return default_value
