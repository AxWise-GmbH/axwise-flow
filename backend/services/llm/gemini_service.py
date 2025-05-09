import logging
import json
import os
import asyncio
import httpx
import google.genai as genai
from backend.utils.json.json_repair import repair_json
import random
from typing import Dict, Any, List, Optional, Union
from domain.interfaces.llm_service import ILLMService
from pydantic import BaseModel, Field, ValidationError
import re
import time
from datetime import datetime

from backend.schemas import Theme, Pattern, Insight
from backend.utils.json.json_parser import (
    parse_llm_json_response,
    normalize_persona_response,
)

from backend.services.llm.exceptions import LLMAPIError, LLMResponseParseError

logger = logging.getLogger(__name__)


# Note: We're using the prompt template to guide the model's output format
# rather than a schema, as the Gemini API has limitations with complex schemas


class GeminiService:
    """
    Service for interacting with Google's Gemini LLM API.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Gemini service with configuration.

        Args:
            config (Dict[str, Any]): Configuration for the Gemini service
        """
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "models/gemini-2.5-flash-preview-04-17")
        self.temperature = config.get("temperature", 0.0)
        self.max_tokens = config.get("max_tokens", 65536)
        self.top_p = config.get("top_p", 0.95)
        self.top_k = 1  # Force top_k to 1 for deterministic results

        # Override any environment settings that might cause vague results
        if "top_k" in config and config.get("top_k") > 1:
            logger.warning(f"Overriding top_k from {config.get('top_k')} to 1 for deterministic results")

        # Initialize Gemini client with the new google.genai package
        self.client = genai.Client(REDACTED_API_KEY=self.REDACTED_API_KEY)

        # Store generation config for later use
        self.generation_config = {
            "temperature": self.temperature,
            "max_output_tokens": self.max_tokens,
            "top_p": self.top_p,
            "top_k": self.top_k,
        }

        logger.info(
            f"Initialized Gemini service with model: {self.model} using google-genai package v{genai.version.__version__}"
        )

    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """
        Get system message based on task.

        Args:
            task: Task type
            data: Request data

        Returns:
            System message string
        """
        # Import the prompt templates
        from backend.services.llm.prompts.gemini_prompts import GeminiPrompts

        # Use the GeminiPrompts class to get the system message
        return GeminiPrompts.get_system_message(task, data)

    async def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze data using Gemini.

        Args:
            data (Dict[str, Any]): The data to analyze, including 'task' and 'text' fields

        Returns:
            Dict[str, Any]: Analysis results
        """
        task = data.get("task", "")
        text = data.get("text", "")
        use_answer_only = data.get("use_answer_only", False)

        if not text:
            logger.warning("Empty text provided for analysis")
            return {"error": "No text provided"}

        if use_answer_only:
            logger.info(
                "Running {} on answer-only text length: {}".format(task, len(text))
            )
        else:
            logger.info("Running {} on text length: {}".format(task, len(text)))

        try:
            # Prepare system message based on task
            system_message = self._get_system_message(task, data)

            # Prepare generation config
            # Determine if this is a JSON-expecting task
            json_tasks = [
                "theme_analysis",
                "pattern_recognition",
                "sentiment_analysis",
                "persona_formation",
                "insight_generation",
                "theme_analysis_enhanced",
                "transcript_structuring",
            ]
            is_json_task = task in json_tasks

            # Select the appropriate model based on task
            model_to_use = "models/gemini-2.5-flash-preview-04-17"  # Default model

            # Use Pro model for persona formation for better quality
            if task == "persona_formation":
                # model_to_use = "models/gemini-2.5-pro"
                # logger.info(f"Using Pro model {model_to_use} for persona_formation task")
                pass # Ensure it uses the default model assigned above

            logger.info(f"Using model {model_to_use} for task: {task}")

            # Use the temperature from config for all tasks
            config_params = {
                "temperature": self.temperature,
                "max_output_tokens": 65536,  # Always use maximum tokens
                "top_p": 0.95,
                "top_k": 1,  # Force top_k to 1 for deterministic results
            }

            logger.debug(
                f"Generation Config for '{task}': temp={self.temperature}, max_tokens=65536, top_p=0.95, top_k=1"
            )

            # For insight_generation, the system_message is already the complete prompt
            if task == "insight_generation":
                # Use the system message directly since it's the complete prompt
                logger.debug(
                    "Generating content for task '{}' with config: {}".format(
                        task, config_params
                    )
                )
                # Use the new API structure for the google-genai package
                response = await self.client.aio.models.generate_content(
                    model=model_to_use, contents=system_message, config=config_params
                )

                # For insight generation, return a structured result
                result_text = response.text
                logger.debug(
                    "Raw response for task {}:\n{}".format(task, result_text[:500]) # Log raw response
                )

                try:
                    result = json.loads(result_text)
                except json.JSONDecodeError:
                    # Try to repair the JSON
                    try:
                        repaired_json = repair_json(result_text)
                        result = json.loads(repaired_json)
                        logger.info("Successfully parsed insight JSON after repair.")
                    except json.JSONDecodeError:
                        # Return a default structure if parsing fails
                        result = {
                            "insights": [
                                {
                                    "topic": "Data Analysis",
                                    "observation": "Analysis completed but results could not be structured properly.",
                                    "evidence": [
                                        "Processing completed with non-structured output."
                                    ],
                                }
                            ],
                            "metadata": {
                                "quality_score": 0.5,
                                "confidence_scores": {
                                    "themes": 0.6,
                                    "patterns": 0.6,
                                    "sentiment": 0.6,
                                },
                            },
                        }

                return result
            else:
                # Generate content for other tasks (Original call structure)
                logger.debug(
                    "Generating content for task '{}' with config: {}".format(
                        task, config_params
                    )
                )
                # Use the new API structure for the google-genai package
                # Check if we should enforce JSON output
                enforce_json = data.get("enforce_json", False)

                # Check if we should enforce JSON output
                if enforce_json or task in json_tasks:
                    # Add response_mime_type to config_params to enforce JSON output
                    config_params["response_mime_type"] = "application/json"

                    # Set temperature to 0 for deterministic output when generating structured data
                    config_params["temperature"] = 0.0

                    # For persona_formation, ensure we use the maximum possible tokens
                    if task == "persona_formation":
                        config_params["max_output_tokens"] = 65536
                        config_params["top_k"] = 1
                        config_params["top_p"] = 0.95
                        logger.info(f"Using enhanced config for persona_formation: max_tokens=65536, top_k=1, top_p=0.95")

                    logger.info(f"Using response_mime_type='application/json' and temperature=0.0 for task '{task}' to enforce structured output")
                elif task == "text_generation":
                    # For text_generation, explicitly DO NOT use response_mime_type
                    # This ensures we get plain text, not JSON
                    if "response_mime_type" in config_params:
                        del config_params["response_mime_type"]

                    # Use the temperature provided in the request or the default
                    config_params["temperature"] = data.get("temperature", self.temperature)

                    logger.info(f"Using plain text output for task '{task}' with temperature={config_params['temperature']}")

                # Make the API call
                response = await self.client.aio.models.generate_content(
                    model=model_to_use,
                    contents=[system_message, text],
                    config=config_params
                )

                # Handle response based on whether JSON was enforced/expected
                if config_params.get("response_mime_type") == "application/json":
                    actual_response_text = ""
                    try:
                        # Extract text from the first candidate's first content part
                        actual_response_text = response.candidates[0].content.parts[0].text

                        if task == "transcript_structuring":
                            # Log a concise preview of the raw response for transcript_structuring
                            logger.info(f"GeminiService.analyze: RAW response for transcript_structuring (mime type enforced, from candidate part, first 500 chars): {actual_response_text[:500]}")
                            # Log a snippet around the known error character if it's likely present
                            error_char_index = 22972 # From previous logs
                            if len(actual_response_text) > error_char_index + 100: # Ensure text is long enough
                                snippet_start = max(0, error_char_index - 100)
                                snippet_end = error_char_index + 100
                                logger.info(f"GeminiService.analyze: RAW transcript_structuring snippet around char {error_char_index}: ...{actual_response_text[snippet_start:snippet_end]}...")
                            else:
                                logger.info(f"GeminiService.analyze: RAW transcript_structuring response too short for detailed error snippet (len: {len(actual_response_text)}).")

                        result = json.loads(actual_response_text)
                        logger.info(f"[{task}] GeminiService successfully parsed JSON directly from candidate part.")

                        # Check if the parsed JSON is an error object from the LLM
                        if isinstance(result, dict) and "error" in result:
                            llm_error_message = result.get("error", "LLM returned a JSON error object.")
                            if isinstance(llm_error_message, dict) and "message" in llm_error_message:
                                llm_error_message = llm_error_message.get("message", str(llm_error_message))
                            elif not isinstance(llm_error_message, str):
                                llm_error_message = str(llm_error_message)
                            
                            logger.error(f"[{task}] LLM returned a JSON error object: {llm_error_message}")
                            raise LLMAPIError(f"LLM reported an error for task '{task}': {llm_error_message}")

                        return result
                    except json.JSONDecodeError as e:
                        # Attempt 2: Use the JSON repair utility
                        try:
                            # Repair the JSON string
                            repaired_json = repair_json(actual_response_text)
                            logger.debug(
                                f"[{task}] Repaired JSON: {repaired_json[:200]}..."
                            )

                            # Try to parse the repaired JSON
                            result = json.loads(repaired_json)
                            logger.info(f"[{task}] Successfully parsed JSON after repair.")

                            # Check if the parsed repaired JSON is an error object from the LLM
                            if isinstance(result, dict) and "error" in result:
                                llm_error_message = result.get("error", "LLM returned a JSON error object after repair.")
                                if isinstance(llm_error_message, dict) and "message" in llm_error_message:
                                    llm_error_message = llm_error_message.get("message", str(llm_error_message))
                                elif not isinstance(llm_error_message, str):
                                    llm_error_message = str(llm_error_message)

                                logger.error(f"[{task}] LLM returned a JSON error object after repair: {llm_error_message}")
                                raise LLMAPIError(f"LLM reported an error for task '{task}' (after repair): {llm_error_message}")
                            
                            return result
                        except json.JSONDecodeError as e2:
                            logger.error(
                                f"[{task}] GeminiService failed to parse JSON from candidate part even after repair: {e2}"
                            )
                            error_message = f"Failed to parse JSON from candidate part for task '{task}' even after repair. Detail: {e2}. Raw preview: {actual_response_text[:200]}"
                            raise LLMResponseParseError(error_message)
                        except Exception as e_generic:
                            logger.error(
                                f"[{task}] Unexpected error during JSON repair: {e_generic}"
                            )
                            # Skip this theme due to unexpected error

                # Fallback to text if not JSON mime type, or if candidate access failed previously (though less likely to reach here)
                try:
                    result_text = response.text
                except Exception as e_text:
                    logger.warning(f"[{task}] GeminiService: Could not get response.text: {e_text}. Trying parts...")
                    try:
                        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                            result_text = response.candidates[0].content.parts[0].text
                        else:
                            logger.error(f"[{task}] GeminiService: No valid content in response parts after response.text failed.")
                            return {"error": f"Failed to extract text from Gemini response for {task}. Details: {e_text}"}
                    except Exception as e_parts_fallback:
                        logger.error(f"[{task}] GeminiService: Failed to extract text from response parts: {e_parts_fallback}", exc_info=True)
                        return {"error": f"Failed to extract text from Gemini response for {task}. Details: {e_parts_fallback}"}

                # If we are here, it means response_mime_type was not 'application/json' OR initial extraction for JSON failed before parsing
                # and we fell through to the non-JSON response handling part.
                # However, the task might still have been intended to be a JSON task.

                # Log the raw text received when not strictly handling as JSON (or if JSON path failed early)
                logger.debug(
                    "Raw response text (non-JSON path or early JSON path fail) for task {}:\n{}".format(task, result_text[:500]) # Log first 500 chars
                )

                # If it was an expected JSON task, but we are in the non-JSON path, attempt parsing.
                if is_json_task:  # is_json_task was defined earlier
                    logger.info(f"[{task}] Attempting JSON parse for an expected JSON task in non-JSON response path.")
                    try:
                        result = json.loads(result_text)
                        logger.info(f"[{task}] Successfully parsed JSON in non-JSON path.")

                        # Check if the parsed JSON is an error object from the LLM
                        if isinstance(result, dict) and "error" in result:
                            llm_error_message = result.get("error", "LLM returned a JSON error object.")
                            if isinstance(llm_error_message, dict) and "message" in llm_error_message:
                                llm_error_message = llm_error_message.get("message", str(llm_error_message))
                            elif not isinstance(llm_error_message, str):
                                llm_error_message = str(llm_error_message)
                            
                            logger.error(f"[{task}] LLM returned a JSON error object: {llm_error_message}")
                            raise LLMAPIError(f"LLM reported an error for task '{task}': {llm_error_message}")

                        return result
                    except json.JSONDecodeError as e_non_json_path:
                        logger.warning(f"[{task}] JSON parsing failed in non-JSON path: {e_non_json_path}. Trying repair...")
                        try:
                            repaired = repair_json(result_text)
                            result = json.loads(repaired)
                            logger.info(f"[{task}] Successfully parsed JSON in non-JSON path after repair.")

                            # Check if the parsed repaired JSON is an error object from the LLM
                            if isinstance(result, dict) and "error" in result:
                                llm_error_message = result.get("error", "LLM returned a JSON error object after repair.")
                                if isinstance(llm_error_message, dict) and "message" in llm_error_message:
                                    llm_error_message = llm_error_message.get("message", str(llm_error_message))
                                elif not isinstance(llm_error_message, str):
                                    llm_error_message = str(llm_error_message)

                                logger.error(f"[{task}] LLM returned a JSON error object after repair: {llm_error_message}")
                                raise LLMAPIError(f"LLM reported an error for task '{task}' (after repair): {llm_error_message}")

                            return result
                        except json.JSONDecodeError as e2_non_json_path:
                            logger.error(f"[{task}] Failed to parse JSON in non-JSON path even after repair: {e2_non_json_path}")
                            error_message = f"All parsing attempts failed in non-JSON path for task '{task}'. Detail: {e2_non_json_path}. Raw preview: {result_text[:200]}"
                            raise LLMResponseParseError(error_message)
                else:
                    # For non-JSON tasks, just return the text if we reached here
                    logger.info(f"[{task}] Returning raw text for non-JSON task in non-JSON path.")
                    return {"text": result_text}

            # Post-process results if needed
            if task == "theme_analysis":
                # If response is a list of themes directly (not wrapped in an object)
                if isinstance(result, list):
                    result = {"themes": result}

                # Ensure proper themes array
                if "themes" not in result:
                    result["themes"] = []

                # Ensure each theme has required fields
                for theme in result["themes"]:
                    # Ensure required fields with default values
                    if "sentiment" not in theme:
                        theme["sentiment"] = 0.0  # neutral
                    if "frequency" not in theme:
                        theme["frequency"] = 0.5  # medium

                    # Ensure statements field exists
                    if "statements" not in theme:
                        theme["statements"] = []

                    # Ensure keywords exists
                    if "keywords" not in theme:
                        theme["keywords"] = []

                    # Extract keywords from name if none provided
                    if len(theme["keywords"]) == 0 and "name" in theme:
                        # Simple extraction of potential keywords from the theme name
                        words = theme["name"].split()
                        # Filter out common words and keep only substantive ones (length > 3)
                        theme["keywords"] = [
                            word
                            for word in words
                            if len(word) > 3
                            and word.lower()
                            not in ["and", "the", "with", "that", "this", "for", "from"]
                        ]

                    # Ensure codes field exists
                    if "codes" not in theme:
                        # Generate codes based on keywords and theme name
                        theme["codes"] = []
                        if "keywords" in theme and len(theme["keywords"]) > 0:
                            # Convert first two keywords to codes
                            for keyword in theme["keywords"][:2]:
                                code = keyword.upper().replace(" ", "_")
                                if code not in theme["codes"]:
                                    theme["codes"].append(code)

                        # Add a code based on sentiment if not enough codes
                        if len(theme["codes"]) < 2 and "sentiment" in theme:
                            sentiment = theme["sentiment"]
                            if sentiment >= 0.3:
                                theme["codes"].append("POSITIVE_ASPECT")
                            elif sentiment <= -0.3:
                                theme["codes"].append("PAIN_POINT")
                            else:
                                theme["codes"].append("NEUTRAL_OBSERVATION")

                    # Ensure reliability field exists
                    if "reliability" not in theme:
                        # Calculate reliability based on number of statements and their length
                        statements = theme.get("statements", [])
                        if len(statements) >= 4:
                            theme["reliability"] = (
                                0.85  # Well-supported with many statements
                            )
                        elif len(statements) >= 2:
                            theme["reliability"] = 0.7  # Moderately supported
                        else:
                            theme["reliability"] = 0.5  # Minimally supported

                # Validate themes against Pydantic model
                validated_themes_list = []
                if (
                    isinstance(result, dict)
                    and "themes" in result
                    and isinstance(result["themes"], list)
                ):
                    for theme_data in result["themes"]:
                        try:
                            # Validate each theme dictionary against the Pydantic model
                            validated_theme = Theme(**theme_data)
                            # Append the validated data (as dict) to the list
                            validated_themes_list.append(validated_theme.model_dump())
                            logger.debug(
                                "Successfully validated theme: {}".format(
                                    theme_data.get("name", "Unnamed")
                                )
                            )
                        except ValidationError as e:
                            logger.warning(
                                "Theme validation failed for theme '{}': {}. Skipping this theme.".format(
                                    theme_data.get("name", "Unnamed"), e
                                )
                            )
                            # Invalid themes are skipped to ensure data integrity downstream
                        except Exception as general_e:
                            logger.error(
                                "Unexpected error during theme validation for '{}': {}".format(
                                    theme_data.get("name", "Unnamed"), general_e
                                ),
                                exc_info=True,
                            )
                            # Skip this theme due to unexpected error

                    # Replace the original themes list with the validated list
                    result["themes"] = validated_themes_list
                    logger.info(
                        "Validated {} themes successfully for task: {}".format(
                            len(validated_themes_list), task
                        )
                    )
                    logger.debug(
                        "Validated theme result: {}".format(
                            json.dumps(result, indent=2)
                        )
                    )
                else:
                    logger.warning(
                        "LLM response for theme_analysis was not in the expected format (dict with 'themes' list). Raw response: {}".format(
                            result
                        )
                    )
                    result = {"themes": []}  # Return empty list if structure is wrong

            return result
        except Exception as e:
            logger.error(f"Error in Gemini API call for task '{task}': {str(e)}", exc_info=True)
            error_message = f"General error in Gemini API call for task '{task}': {str(e)}"
            raise LLMAPIError(error_message) from e
