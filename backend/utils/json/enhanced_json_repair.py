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

            # For persona formation, we'll apply task-specific repairs after general repairs
            # This ensures structural issues are fixed first

        # Apply repair strategies in sequence
        repaired = json_str

        # Check for truncated JSON first (incomplete response)
        repaired = EnhancedJSONRepair._fix_truncated_json(repaired)

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

        # Apply task-specific repairs after general repairs
        if task == "persona_formation":
            try:
                repaired = EnhancedJSONRepair._apply_persona_specific_repairs(repaired)
                logger.info("Applied persona-specific repairs after general repairs")
            except Exception as e_persona:
                logger.warning(f"Persona-specific repairs failed: {str(e_persona)}")

        # Validate the repaired JSON
        try:
            json.loads(repaired)
            logger.info("JSON successfully repaired")
            return repaired
        except json.JSONDecodeError as e:
            logger.warning(f"JSON repair failed: {str(e)}")

            # Try iterative repair for multiple comma issues
            try:
                return EnhancedJSONRepair._iterative_repair(repaired, max_iterations=10)
            except Exception as e_iterative:
                logger.warning(f"Iterative repair failed: {str(e_iterative)}")

            # Try third-party JSON repair library if available
            try:
                import json_repair

                logger.info("Attempting repair with json_repair library")
                repaired_with_lib = json_repair.repair_json(json_str)
                # Validate the repair
                json.loads(repaired_with_lib)
                logger.info("Successfully repaired JSON with json_repair library")
                return repaired_with_lib
            except ImportError:
                logger.info("json_repair library not available")
            except Exception as e_lib:
                logger.warning(f"json_repair library failed: {str(e_lib)}")

            # Try more aggressive repair as a last resort
            try:
                return EnhancedJSONRepair._aggressive_repair(json_str, e)
            except Exception as e2:
                logger.error(f"Aggressive JSON repair failed: {str(e2)}")
                return "{}"  # Return empty object as a last resort

    @staticmethod
    def _fix_truncated_json(json_str: str) -> str:
        """
        Fix truncated JSON by completing incomplete structures.

        This method detects if the JSON appears to be cut off mid-response
        and attempts to complete it properly.
        """
        # Check if the JSON appears to be truncated
        stripped = json_str.strip()

        # Count opening and closing braces/brackets
        open_braces = stripped.count("{")
        close_braces = stripped.count("}")
        open_brackets = stripped.count("[")
        close_brackets = stripped.count("]")

        # Handle both truncated JSON and bracket/brace mismatches
        if open_braces != close_braces or open_brackets != close_brackets:
            logger.info(
                f"Detected JSON structure mismatch: {open_braces} open braces, {close_braces} close braces, {open_brackets} open brackets, {close_brackets} close brackets"
            )

            repaired = stripped

            # Handle the case where we have more closing braces than opening (extra closing brace)
            if close_braces > open_braces:
                extra_close_braces = close_braces - open_braces
                logger.info(f"Removing {extra_close_braces} extra closing braces")
                # Remove extra closing braces from the end
                for _ in range(extra_close_braces):
                    last_brace = repaired.rfind("}")
                    if last_brace >= 0:
                        repaired = repaired[:last_brace] + repaired[last_brace + 1 :]

            # Handle missing closing brackets
            if open_brackets > close_brackets:
                missing_close_brackets = open_brackets - close_brackets
                logger.info(f"Adding {missing_close_brackets} missing closing brackets")

                # Try to find the best position to insert the missing bracket
                # Look for incomplete arrays (evidence arrays are common in persona JSON)
                lines = repaired.split("\n")
                for i, line in enumerate(lines):
                    # Look for lines that have an opening bracket but no closing bracket
                    if '"evidence"' in line and "[" in line and "]" not in line:
                        # This line starts an evidence array but doesn't close it
                        # Find the next line that should close it
                        for j in range(i + 1, len(lines)):
                            next_line = lines[j].strip()
                            if next_line.startswith("}") or next_line.startswith('"'):
                                # Insert the closing bracket before this line
                                lines.insert(j, "    ]")  # Add proper indentation
                                logger.info(
                                    f"Inserted closing bracket before line {j+1}"
                                )
                                repaired = "\n".join(lines)
                                missing_close_brackets -= 1
                                break
                        if missing_close_brackets == 0:
                            break

                # If we still have missing brackets, add them at the end
                for _ in range(missing_close_brackets):
                    repaired += "]"

            # Handle missing closing braces (for truncated JSON)
            elif open_braces > close_braces:
                missing_close_braces = open_braces - close_braces
                logger.info(f"Adding {missing_close_braces} missing closing braces")

                # Check if the JSON ends abruptly in the middle of a string value
                if stripped.endswith('"') and stripped.count('"') % 2 == 1:
                    # Odd number of quotes means we're in the middle of a string
                    logger.info("JSON appears to end in the middle of a string value")
                    repaired += '"'

                # Close any unclosed string values that don't end with quotes
                elif (
                    not repaired.endswith(('"', "}", "]", "true", "false", "null"))
                    and not repaired[-1].isdigit()
                ):
                    # If it ends with partial text, complete it as a string
                    if repaired.rfind('"') > repaired.rfind(":"):
                        # We're in a string value
                        repaired += '"'
                        logger.info("Completed truncated string value")

                for _ in range(missing_close_braces):
                    repaired += "}"

            return repaired

        return json_str

    @staticmethod
    def _iterative_repair(json_str: str, max_iterations: int = 5) -> str:
        """
        Perform iterative repair to handle multiple JSON issues.

        This method repeatedly applies repair strategies until the JSON is valid
        or the maximum number of iterations is reached.
        """
        current_json = json_str

        for iteration in range(max_iterations):
            try:
                # Try to parse the current JSON
                json.loads(current_json)
                logger.info(
                    f"JSON successfully repaired after {iteration + 1} iterations"
                )
                return current_json
            except json.JSONDecodeError as e:
                logger.info(f"Iteration {iteration + 1}: JSON error - {str(e)}")

                # Apply aggressive repair for this specific error
                try:
                    current_json = EnhancedJSONRepair._aggressive_repair(
                        current_json, e
                    )
                    logger.info(
                        f"Applied aggressive repair in iteration {iteration + 1}"
                    )
                except Exception as repair_error:
                    logger.warning(
                        f"Repair failed in iteration {iteration + 1}: {str(repair_error)}"
                    )
                    break

        # If we've exhausted iterations, return the last attempt
        logger.warning(
            f"Iterative repair completed after {max_iterations} iterations, JSON may still be invalid"
        )
        return current_json

    @staticmethod
    def _apply_persona_specific_repairs(json_str: str) -> str:
        """
        Apply persona-specific JSON repairs.

        This method applies repairs that are specific to persona JSON structure,
        focusing on structural issues, not content within string values.
        """
        repaired = json_str

        # Fix missing commas in evidence arrays
        repaired = re.sub(r'("evidence":\s*\[\s*"[^"]*")\s*(")', r"\1,\2", repaired)

        # Fix missing commas between trait objects
        repaired = re.sub(r"(}\s*)\n(\s*{)", r"\1,\n\2", repaired)

        # Fix missing commas between persona traits
        repaired = re.sub(r'(}\s*)\n(\s*"[^"]+"\s*:)', r"\1,\n\2", repaired)

        # Fix missing commas in nested objects (between JSON properties)
        repaired = re.sub(
            r'("value"\s*:\s*"[^"]*")\s*("confidence")', r"\1,\2", repaired
        )
        repaired = re.sub(
            r'("confidence"\s*:\s*\d+(?:\.\d+)?)\s*("evidence")', r"\1,\2", repaired
        )

        return repaired

    @staticmethod
    def _remove_markdown_markers(json_str: str) -> str:
        """Remove markdown code block markers."""
        # Remove ```json and ``` markers
        json_str = re.sub(r"^```json\s*", "", json_str)
        json_str = re.sub(r"\s*```$", "", json_str)
        return json_str.strip()

    @staticmethod
    def _fix_missing_commas_in_arrays(json_str: str) -> str:
        """Fix missing commas between array elements."""
        # Pattern: matches closing bracket/brace followed by opening bracket/brace without comma
        pattern = r"([\]\}])(\s*)([\[\{])"
        return re.sub(pattern, r"\1,\2\3", json_str)

    @staticmethod
    def _fix_missing_commas_in_objects(json_str: str) -> str:
        """Fix missing commas between object properties."""
        # This is more complex as we need to identify property boundaries
        # Pattern: matches end of a value (quote or number or boolean or null or closing bracket/brace)
        # followed by a property name (quoted string followed by colon)
        pattern = r"([\"\d\}\]true|false|null])(\s*)(\"[^\"]+\"\s*:)"
        return re.sub(pattern, r"\1,\2\3", json_str)

    @staticmethod
    def _fix_trailing_commas(json_str: str) -> str:
        """Fix trailing commas in arrays and objects."""
        # Remove trailing commas before closing brackets/braces
        pattern = r",(\s*[\}\]])"
        return re.sub(pattern, r"\1", json_str)

    @staticmethod
    def _fix_unquoted_keys(json_str: str) -> str:
        """Fix unquoted object keys."""
        # Pattern: matches unquoted keys (word characters followed by colon)
        pattern = r"([\{\,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)"
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
        open_curly = json_str.count("{")
        close_curly = json_str.count("}")
        open_square = json_str.count("[")
        close_square = json_str.count("]")

        # Add missing closing brackets/braces
        result = json_str
        for _ in range(open_curly - close_curly):
            result += "}"
        for _ in range(open_square - close_square):
            result += "]"

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
        line_col_match = re.search(r"line (\d+) column (\d+)", error_msg)

        if line_col_match:
            error_line = int(line_col_match.group(1))
            error_column = int(line_col_match.group(2))
            logger.info(
                f"Persona JSON error at line {error_line}, column {error_column}"
            )

            # Split the JSON string into lines
            lines = json_str.split("\n")

            # Check if the error line is within range
            if 0 < error_line <= len(lines):
                problem_line = lines[error_line - 1]
                logger.info(f"Problem line ({error_line}): {problem_line}")

                # Check if this is a missing comma error
                if "Expecting ',' delimiter" in error_msg:
                    # Insert a comma at the error position
                    if 0 < error_column <= len(problem_line):
                        fixed_line = (
                            problem_line[:error_column]
                            + ","
                            + problem_line[error_column:]
                        )
                        logger.info(f"Fixed line: {fixed_line}")
                        lines[error_line - 1] = fixed_line

                        # Reconstruct the JSON string
                        repaired = "\n".join(lines)

                        # Try to validate the repaired JSON
                        try:
                            json.loads(repaired)
                            logger.info("Position-aware comma insertion succeeded")
                            return repaired
                        except json.JSONDecodeError as e:
                            logger.warning(
                                f"Position-aware comma insertion failed: {str(e)}"
                            )
                            # Continue with other repairs

        # Apply persona-specific repairs using the dedicated method
        repaired = EnhancedJSONRepair._apply_persona_specific_repairs(json_str)

        # Fix missing quotes around property names
        repaired = re.sub(
            r"([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:", r'\1"\2":', repaired
        )

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
        pos_match = re.search(r"char (\d+)", error_msg)
        line_col_match = re.search(r"line (\d+) column (\d+)", error_msg)

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
                lines = json_str.split("\n")
                if error_line <= len(lines):
                    error_pos = sum(len(lines[i]) + 1 for i in range(error_line - 1))
                    if error_column <= len(lines[error_line - 1]):
                        error_pos += error_column - 1
                    logger.info(
                        f"Calculated error position from line/column: {error_pos}"
                    )

        # Handle specific error types
        if "Expecting ',' delimiter" in error_msg:
            if error_pos is not None:
                # Look at the characters around the error position
                before_char = (
                    json_str[error_pos - 1 : error_pos] if error_pos > 0 else ""
                )
                current_char = (
                    json_str[error_pos : error_pos + 1]
                    if error_pos < len(json_str)
                    else ""
                )
                logger.info(
                    f"Characters around error: before='{before_char}', current='{current_char}'"
                )

                # Get more context around the error
                after_char = (
                    json_str[error_pos + 1 : error_pos + 2]
                    if error_pos + 1 < len(json_str)
                    else ""
                )
                context_start = max(0, error_pos - 50)
                context_end = min(len(json_str), error_pos + 50)
                context = json_str[context_start:context_end]
                logger.info(f"Error context: ...{context}...")

                # Check if we're inside a string value (which we shouldn't modify)
                # Count quotes before the error position, but ignore escaped quotes
                text_before_error = json_str[:error_pos]

                # Count unescaped quotes to determine if we're inside a string
                quote_count = 0
                i = 0
                while i < len(text_before_error):
                    if text_before_error[i] == '"' and (
                        i == 0 or text_before_error[i - 1] != "\\"
                    ):
                        quote_count += 1
                    i += 1

                # If we have an odd number of quotes, we're inside a string value
                inside_string = quote_count % 2 == 1

                if inside_string:
                    logger.info(
                        "Error is inside a string value, skipping comma insertion to avoid corrupting content"
                    )
                    # Don't insert comma inside string values - this corrupts the content
                    # Instead, try to find the end of the string and insert comma there
                    next_quote = json_str.find('"', error_pos)
                    if next_quote > error_pos:
                        # Insert comma after the closing quote
                        repaired = (
                            json_str[: next_quote + 1]
                            + ","
                            + json_str[next_quote + 1 :]
                        )
                        logger.info(
                            f"Inserted comma after string at position {next_quote + 1}"
                        )
                    else:
                        repaired = json_str
                else:
                    # We're in JSON structure, safe to insert comma
                    # Check if this is a missing comma between array elements or object properties
                    if before_char in ['"', "}", "]"] and current_char in [
                        '"',
                        "{",
                        "[",
                    ]:
                        # This is likely a missing comma between elements
                        repaired = json_str[:error_pos] + "," + json_str[error_pos:]
                        logger.info(
                            f"Inserted comma between elements at position {error_pos}"
                        )
                    elif before_char == "}" and current_char in ["\n", " ", "\t"]:
                        # Missing comma after closing brace, before whitespace
                        repaired = json_str[:error_pos] + "," + json_str[error_pos:]
                        logger.info(
                            f"Inserted comma after closing brace at position {error_pos}"
                        )
                    else:
                        # Try the original approach
                        repaired = json_str[:error_pos] + "," + json_str[error_pos:]
                        logger.info(f"Inserted comma at position {error_pos}")

                # Validate the repair
                try:
                    json.loads(repaired)
                    return repaired
                except json.JSONDecodeError as e:
                    logger.warning(f"Initial comma insertion failed: {str(e)}")

                    # Try alternative positions around the error
                    for offset in [-1, 1, -2, 2, -3, 3]:
                        try_pos = error_pos + offset
                        if 0 <= try_pos < len(json_str):
                            try:
                                alternative = (
                                    json_str[:try_pos] + "," + json_str[try_pos:]
                                )
                                json.loads(alternative)
                                logger.info(
                                    f"Alternative comma insertion at position {try_pos} succeeded"
                                )
                                return alternative
                            except json.JSONDecodeError:
                                pass

                    # Try removing characters that might be causing issues
                    for offset in range(-5, 6):
                        try_pos = error_pos + offset
                        if 0 <= try_pos < len(json_str):
                            char_at_pos = json_str[try_pos]
                            if char_at_pos in [
                                "}",
                                "]",
                            ]:  # Try removing extra closing brackets/braces
                                try:
                                    alternative = (
                                        json_str[:try_pos] + json_str[try_pos + 1 :]
                                    )
                                    json.loads(alternative)
                                    logger.info(
                                        f"Removed extra '{char_at_pos}' at position {try_pos}"
                                    )
                                    return alternative
                                except json.JSONDecodeError:
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
                    colon_pos = json_str.find(":", error_pos)
                    if colon_pos > error_pos:
                        # Add closing quote before the colon
                        repaired = (
                            repaired[: colon_pos + 1] + '"' + repaired[colon_pos + 1 :]
                        )
                        logger.info(
                            f"Added closing quote before colon at position {colon_pos}"
                        )
                except (json.JSONDecodeError, IndexError, ValueError):
                    pass

                return repaired

        # Handle other common error types
        elif "Expecting ':' delimiter" in error_msg:
            if error_pos is not None:
                # Add colon at the error position
                repaired = json_str[:error_pos] + ":" + json_str[error_pos:]
                logger.info(f"Added colon at position {error_pos}")
                return repaired

        elif "Expecting value" in error_msg:
            if error_pos is not None:
                # Check if this is at the end of an object or array
                if error_pos > 0 and json_str[error_pos - 1] == ",":
                    # Remove trailing comma
                    repaired = json_str[: error_pos - 1] + json_str[error_pos:]
                    logger.info(f"Removed trailing comma at position {error_pos-1}")
                    return repaired
                else:
                    # Add a null value
                    repaired = json_str[:error_pos] + "null" + json_str[error_pos:]
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
                lines = json_str.split("\n")
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
                        repaired = "\n".join(lines)

                        # Validate the repair
                        try:
                            json.loads(repaired)
                            logger.info("Line-by-line repair succeeded")
                            return repaired
                        except json.JSONDecodeError:
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
            repaired = re.sub(
                r"([\"\d\}\]true|false|null])(\s*)(\"[^\"]+\"\s*:)",
                r"\1,\2\3",
                repaired,
            )

            # Fix missing commas between array elements
            repaired = re.sub(
                r"([\}\]\"true|false|null\d])(\s*)([\{\[\"])", r"\1,\2\3", repaired
            )

            # Fix trailing commas
            repaired = re.sub(r",(\s*[\}\]])", r"\1", repaired)

            # Fix unquoted keys
            repaired = re.sub(
                r"([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)", r'\1"\2"\3', repaired
            )

            # Fix single quotes
            repaired = repaired.replace("'", '"')

            # Validate the repair
            try:
                json.loads(repaired)
                logger.info("Aggressive general repair succeeded")
                return repaired
            except json.JSONDecodeError:
                logger.warning("Aggressive general repair failed validation")
        except Exception as e:
            logger.warning(f"Aggressive general repair failed: {str(e)}")

        # As a last resort, try to extract valid JSON objects/arrays
        logger.info("Attempting to extract valid JSON objects/arrays")
        # Look for patterns that might be valid JSON objects or arrays
        object_pattern = r"\{[^\{\}]*\}"
        array_pattern = r"\[[^\[\]]*\]"

        objects = re.findall(object_pattern, json_str)
        arrays = re.findall(array_pattern, json_str)

        # Try each extracted object/array
        for candidate in objects + arrays:
            try:
                json.loads(candidate)
                logger.info(f"Found valid JSON fragment: {candidate[:50]}...")
                return candidate  # Return the first valid JSON
            except json.JSONDecodeError:
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
    def parse_json_with_context(
        json_str: str, context: str = "", default_value: Any = None
    ) -> Any:
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
                logger.error(
                    f"Failed to parse JSON even after repair in context {context}: {str(e2)}"
                )

                # If this is a persona formation task, try using Pydantic
                if task == "persona_formation":
                    try:
                        # Import here to avoid circular imports
                        from backend.domain.models.persona_schema import (
                            Persona,
                            PersonaResponse,
                        )

                        logger.info(
                            f"Attempting to extract partial persona data in {context}"
                        )

                        # Extract name
                        name_match = re.search(r'"name"\s*:\s*"([^"]+)"', json_str)
                        name = name_match.group(1) if name_match else "Unknown Persona"

                        # Extract description
                        desc_match = re.search(
                            r'"description"\s*:\s*"([^"]+)"', json_str
                        )
                        description = (
                            desc_match.group(1)
                            if desc_match
                            else "Persona extracted from partial data"
                        )

                        # Create a basic persona
                        persona_data = {"name": name, "description": description}

                        # Try to extract other fields
                        for field in [
                            "archetype",
                            "demographics",
                            "goals_and_motivations",
                            "challenges_and_frustrations",
                        ]:
                            field_match = re.search(
                                f'"{field}"\\s*:\\s*\\{{([^}}]+)\\}}', json_str
                            )
                            if field_match:
                                field_content = field_match.group(1)

                                # Extract value
                                value_match = re.search(
                                    r'"value"\s*:\s*"([^"]+)"', field_content
                                )
                                if value_match:
                                    value = value_match.group(1)

                                    # Extract confidence
                                    confidence_match = re.search(
                                        r'"confidence"\s*:\s*(\d+(?:\.\d+)?)',
                                        field_content,
                                    )
                                    confidence = (
                                        float(confidence_match.group(1))
                                        if confidence_match
                                        else 0.5
                                    )

                                    # Create trait
                                    persona_data[field] = {
                                        "value": value,
                                        "confidence": confidence,
                                    }

                        # Create and validate the persona using Pydantic
                        try:
                            persona = Persona(**persona_data)
                            logger.info(
                                f"Successfully extracted partial persona data in {context}"
                            )
                            return persona.model_dump()
                        except Exception as e_pydantic:
                            logger.warning(
                                f"Pydantic validation failed: {str(e_pydantic)}"
                            )
                            # Return the raw data if validation fails
                            return persona_data
                    except Exception as e3:
                        logger.error(
                            f"Pydantic extraction failed in {context}: {str(e3)}"
                        )

                return default_value
