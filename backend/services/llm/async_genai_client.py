"""
Standardized asynchronous client for Google GenAI SDK.

This module provides a standardized async implementation for the Google GenAI SDK,
with proper error handling, retry logic, and response parsing.
"""

import logging
import json
import asyncio
import re
from typing import Dict, Any, List, Union, Optional, AsyncGenerator, Tuple

import google.genai as genai
from google.genai.types import GenerateContentConfig, Content

from backend.utils.json.json_repair import repair_json
from backend.services.llm.config.genai_config import GenAIConfigFactory, TaskType
from backend.services.llm.exceptions import (
    LLMAPIError, LLMResponseParseError, LLMProcessingError, LLMServiceError
)

logger = logging.getLogger(__name__)

class AsyncGenAIClient:
    """
    Standardized asynchronous client for Google GenAI SDK.

    This class provides a standardized interface for interacting with the Google GenAI SDK
    asynchronously, with proper error handling, retry logic, and response parsing.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        """
        Initialize the AsyncGenAIClient.

        Args:
            api_key: Google API key
            model: Model name to use (default: gemini-2.5-flash)
        """
        self.api_key = api_key
        self.default_model = model

        try:
            # Initialize the client
            self.client = genai.Client(api_key=self.api_key)
            logger.info(f"Successfully initialized genai with Client() constructor")
        except Exception as e:
            logger.error(f"An unexpected error occurred during genai client initialization: {e}")
            raise ValueError(f"Failed to initialize Gemini client: {e}") from e

    async def generate_content(
        self,
        task: Union[str, TaskType],
        prompt: Union[str, List[Union[str, Content]]],
        custom_config: Optional[Dict[str, Any]] = None,
        system_instruction: Optional[str] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0
    ) -> Dict[str, Any]:
        """
        Generate content using the GenAI API with standardized async implementation.

        Args:
            task: Task type (string or TaskType enum)
            prompt: Prompt text or list of Content objects
            custom_config: Optional custom configuration parameters
            system_instruction: Optional system instruction
            max_retries: Maximum number of retries for API calls
            initial_delay: Initial delay for retry backoff
            backoff_factor: Backoff factor for retry delay

        Returns:
            Parsed response as a dictionary
        """
        try:
            # Get configuration for the task
            config = GenAIConfigFactory.create_config(task, custom_config)

            # Prepare prompt with system instruction if provided
            final_prompt = self._prepare_prompt(prompt, system_instruction)

            # Generate content with retry
            response = await self._generate_with_retry(
                model=self.default_model,
                prompt=final_prompt,
                config=config,
                max_retries=max_retries,
                initial_delay=initial_delay,
                backoff_factor=backoff_factor
            )

            # Parse the response
            parsed_response = await self._parse_response(response, task)

            # Post-process the response based on task
            return await self._post_process_response(parsed_response, task)

        except (LLMAPIError, LLMResponseParseError, LLMProcessingError) as e:
            # Re-raise known LLM exceptions
            logger.error(f"Error generating content for task {task}: {str(e)}")
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(f"Unexpected error generating content for task {task}: {str(e)}", exc_info=True)
            raise LLMServiceError(f"Unexpected error: {str(e)}") from e

    async def generate_content_stream(
        self,
        task: Union[str, TaskType],
        prompt: Union[str, List[Union[str, Content]]],
        custom_config: Optional[Dict[str, Any]] = None,
        system_instruction: Optional[str] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0
    ) -> AsyncGenerator[str, None]:
        """
        Generate content using the GenAI API with streaming.

        Args:
            task: Task type (string or TaskType enum)
            prompt: Prompt text or list of Content objects
            custom_config: Optional custom configuration parameters
            system_instruction: Optional system instruction
            max_retries: Maximum number of retries for API calls
            initial_delay: Initial delay for retry backoff
            backoff_factor: Backoff factor for retry delay

        Yields:
            Content chunks as they are generated
        """
        try:
            # Get configuration for the task
            config = GenAIConfigFactory.create_config(task, custom_config)

            # Prepare prompt with system instruction if provided
            final_prompt = self._prepare_prompt(prompt, system_instruction)

            # Generate content stream with retry
            stream = await self._generate_stream_with_retry(
                model=self.default_model,
                prompt=final_prompt,
                config=config,
                max_retries=max_retries,
                initial_delay=initial_delay,
                backoff_factor=backoff_factor
            )

            # Yield content chunks
            async for chunk in stream:
                try:
                    yield chunk.text
                except Exception as e:
                    logger.error(f"Error extracting text from chunk: {str(e)}")
                    yield ""

        except (LLMAPIError, LLMResponseParseError, LLMProcessingError) as e:
            # Re-raise known LLM exceptions
            logger.error(f"Error generating content stream for task {task}: {str(e)}")
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(f"Unexpected error generating content stream for task {task}: {str(e)}", exc_info=True)
            raise LLMServiceError(f"Unexpected error: {str(e)}") from e

    def _prepare_prompt(
        self,
        prompt: Union[str, List[Union[str, Content]]],
        system_instruction: Optional[str] = None
    ) -> List[Union[str, Content]]:
        """
        Prepare the prompt with system instruction if provided.

        Args:
            prompt: Prompt text or list of Content objects
            system_instruction: Optional system instruction

        Returns:
            Prepared prompt
        """
        if system_instruction:
            # Create Content objects with role="user" (Gemini API only accepts "user" and "model" roles)
            if isinstance(prompt, str):
                # Convert string content to a list of Content objects
                user_content = Content(parts=[{"text": prompt}], role="user")
                system_content = Content(parts=[{"text": "System instruction: " + system_instruction}], role="user")
                return [system_content, user_content]
            elif isinstance(prompt, list):
                # Add system instruction as the first item
                system_content = Content(parts=[{"text": "System instruction: " + system_instruction}], role="user")
                if all(isinstance(item, str) for item in prompt):
                    # Convert all string items to Content objects
                    content_list = [Content(parts=[{"text": item}], role="user") for item in prompt]
                    return [system_content] + content_list
                else:
                    # Mixed list of strings and Content objects
                    return [system_content] + list(prompt)
        else:
            # No system instruction, just return the prompt
            if isinstance(prompt, str):
                return [prompt]
            else:
                return prompt

    async def _generate_with_retry(
        self,
        model: str,
        prompt: List[Union[str, Content]],
        config: GenerateContentConfig,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0
    ) -> Any:
        """
        Generate content with retry logic.

        Args:
            model: Model name
            prompt: Prepared prompt
            config: Generation configuration
            max_retries: Maximum number of retries
            initial_delay: Initial delay for retry backoff
            backoff_factor: Backoff factor for retry delay

        Returns:
            Raw response from the API
        """
        delay = initial_delay
        last_exception = None

        for attempt in range(max_retries):
            try:
                # Make the API call
                response = await self.client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config
                )
                return response
            except Exception as e:
                last_exception = e
                if attempt < max_retries - 1:
                    # Log the error and retry
                    logger.warning(
                        f"API call failed (attempt {attempt + 1}/{max_retries}): {str(e)}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                    delay *= backoff_factor
                else:
                    # Last attempt failed, raise the exception
                    logger.error(f"API call failed after {max_retries} attempts: {str(e)}")
                    raise LLMAPIError(f"API call failed after {max_retries} attempts: {str(e)}") from e

        # This should never happen, but just in case
        raise LLMAPIError(f"API call failed: {str(last_exception)}")

    async def _generate_stream_with_retry(
        self,
        model: str,
        prompt: List[Union[str, Content]],
        config: GenerateContentConfig,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0
    ) -> AsyncGenerator:
        """
        Generate content stream with retry logic.

        Args:
            model: Model name
            prompt: Prepared prompt
            config: Generation configuration
            max_retries: Maximum number of retries
            initial_delay: Initial delay for retry backoff
            backoff_factor: Backoff factor for retry delay

        Returns:
            Async generator for the content stream
        """
        delay = initial_delay
        last_exception = None

        for attempt in range(max_retries):
            try:
                # Make the API call
                stream = await self.client.aio.models.generate_content_stream(
                    model=model,
                    contents=prompt,
                    config=config
                )
                return stream
            except Exception as e:
                last_exception = e
                if attempt < max_retries - 1:
                    # Log the error and retry
                    logger.warning(
                        f"API stream call failed (attempt {attempt + 1}/{max_retries}): {str(e)}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                    delay *= backoff_factor
                else:
                    # Last attempt failed, raise the exception
                    logger.error(f"API stream call failed after {max_retries} attempts: {str(e)}")
                    raise LLMAPIError(f"API stream call failed after {max_retries} attempts: {str(e)}") from e

        # This should never happen, but just in case
        raise LLMAPIError(f"API stream call failed: {str(last_exception)}")

    async def _parse_response(self, response: Any, task: Union[str, TaskType]) -> Dict[str, Any]:
        """
        Parse the response from the API.

        Args:
            response: Raw response from the API
            task: Task type

        Returns:
            Parsed response as a dictionary
        """
        try:
            # Check if response has parsed property (from schema validation)
            if hasattr(response, 'parsed') and response.parsed is not None:
                logger.info(f"Using schema-validated parsed response for task {task}")
                # Convert to dict if it's a Pydantic model
                if hasattr(response.parsed, 'dict'):
                    return response.parsed.dict()
                elif hasattr(response.parsed, 'model_dump'):
                    return response.parsed.model_dump()
                else:
                    # If it's already a dict or other serializable type
                    return response.parsed

            # Extract text from response
            try:
                text_response = response.text
            except Exception as e:
                # Fallback method if .text property fails
                logger.warning(f"Could not get response.text: {e}. Trying to extract from candidates...")
                try:
                    if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                        text_response = response.candidates[0].content.parts[0].text
                        logger.info(f"Successfully extracted text from response.candidates[0].content.parts[0].text")
                    else:
                        logger.error(f"No valid content in response candidates after response.text failed.")
                        raise LLMResponseParseError(f"Failed to extract text from response: {str(e)}")
                except Exception as nested_e:
                    logger.error(f"Failed to extract text from candidates: {str(nested_e)}")
                    raise LLMResponseParseError(f"Failed to extract text from response: {str(e)} -> {str(nested_e)}")

            # Check if response is empty or very short
            # Special case for industry detection which can return just the industry name
            if (isinstance(task, str) and task == "industry_detection") or (isinstance(task, TaskType) and task == TaskType.INDUSTRY_DETECTION):
                if not text_response:
                    logger.error(f"Empty response received for task '{task}'")
                    raise LLMResponseParseError(f"Empty response received for task '{task}'")
            elif not text_response or len(text_response.strip()) < 10:
                logger.error(f"Empty or very short response received for task '{task}'. Response: '{text_response}'")
                raise LLMResponseParseError(f"Empty or very short response received for task '{task}'")

            # Check if task is a JSON task
            if isinstance(task, str):
                try:
                    task_enum = TaskType(task)
                    is_json_task = task_enum != TaskType.TEXT_GENERATION
                except ValueError:
                    # Unknown task, assume it might be JSON
                    is_json_task = True
            else:
                is_json_task = task != TaskType.TEXT_GENERATION

            # Parse JSON if needed
            if is_json_task:
                # Check if JSON is truncated
                if not text_response.strip().endswith("}") and not text_response.strip().endswith("]"):
                    logger.warning(f"JSON response might be truncated. Attempting repair.")
                    try:
                        text_response = repair_json(text_response)
                        logger.info(f"Successfully repaired JSON response.")
                    except Exception as repair_e:
                        logger.error(f"Failed to repair JSON: {repair_e}. Original text: {text_response[:500]}")

                # Check if the response is wrapped in markdown code blocks
                markdown_json_pattern = r'```(?:json)?\s*([\s\S]*?)\s*```'
                markdown_match = re.search(markdown_json_pattern, text_response)

                if markdown_match:
                    # Extract the JSON content from the markdown code block
                    json_content = markdown_match.group(1).strip()
                    logger.info(f"Detected JSON wrapped in markdown code blocks, extracting content")
                    text_response = json_content
                    # Log the task type for debugging
                    logger.info(f"Task type for markdown-wrapped JSON: {task}")

                # Parse JSON
                try:
                    parsed_response = json.loads(text_response)
                    logger.info(f"Successfully parsed JSON response. Keys: {list(parsed_response.keys()) if isinstance(parsed_response, dict) else 'array with ' + str(len(parsed_response)) + ' items'}")
                    return parsed_response
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode JSON response: {e}. Response: {text_response[:500]}")

                    # Try repair again
                    try:
                        repaired = repair_json(text_response)
                        result = json.loads(repaired)
                        logger.info(f"Successfully parsed JSON after repair.")
                        return result
                    except Exception as e2:
                        logger.error(f"Failed to parse JSON even after repair: {e2}")
                        raise LLMResponseParseError(f"Failed to parse JSON response: {str(e)} -> {str(e2)}")
            else:
                # For non-JSON tasks, just return the text
                return {"text": text_response}
        except LLMResponseParseError:
            # Re-raise known parsing errors
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(f"Unexpected error parsing response: {str(e)}", exc_info=True)
            raise LLMResponseParseError(f"Unexpected error parsing response: {str(e)}")

    async def _post_process_response(self, result: Dict[str, Any], task: Union[str, TaskType]) -> Dict[str, Any]:
        """
        Post-process the parsed response based on task.

        Args:
            result: Parsed response
            task: Task type

        Returns:
            Post-processed response
        """
        # Convert string task to enum if needed
        if isinstance(task, str):
            try:
                task = TaskType(task)
            except ValueError:
                logger.warning(f"Unknown task type: {task}, skipping task-specific post-processing")
                return result

        # Task-specific post-processing
        if task == TaskType.PATTERN_RECOGNITION:
            return await self._post_process_pattern_recognition(result)
        elif task == TaskType.THEME_ANALYSIS or task == TaskType.THEME_ANALYSIS_ENHANCED:
            return await self._post_process_theme_analysis(result)
        else:
            # No specific post-processing for other tasks
            return result

    async def _post_process_pattern_recognition(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process pattern recognition results.

        Args:
            result: Parsed response

        Returns:
            Post-processed response
        """
        # For pattern recognition, ensure we have a proper structure
        if isinstance(result, list):
            result = {"patterns": result}

        # Ensure patterns key exists
        if "patterns" not in result:
            logger.warning(f"Pattern recognition response missing 'patterns' key, adding empty array")
            result["patterns"] = []

        # Ensure each pattern has required fields
        for pattern in result.get("patterns", []):
            # Ensure required fields with default values
            if "name" not in pattern or not pattern["name"]:
                pattern["name"] = "Unnamed Pattern"
            if "category" not in pattern or not pattern["category"]:
                pattern["category"] = "Workflow"
            if "description" not in pattern or not pattern["description"]:
                pattern["description"] = "No description provided"
            if "frequency" not in pattern:
                pattern["frequency"] = 0.5  # medium
            if "sentiment" not in pattern:
                pattern["sentiment"] = 0.0  # neutral
            if "evidence" not in pattern:
                pattern["evidence"] = []
            if "impact" not in pattern or not pattern["impact"]:
                pattern["impact"] = "Impact not specified"
            if "suggested_actions" not in pattern:
                pattern["suggested_actions"] = ["Consider further investigation"]

        # Log the patterns for debugging
        if result["patterns"]:
            logger.info(f"Pattern recognition returned {len(result['patterns'])} patterns")
            if len(result["patterns"]) > 0:
                logger.info(f"First pattern: {result['patterns'][0].get('name', 'Unnamed')}")
        else:
            logger.warning(f"Pattern recognition returned empty patterns array")

        return result

    async def _post_process_theme_analysis(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process theme analysis results.

        Args:
            result: Parsed response

        Returns:
            Post-processed response
        """
        # If response is a list of themes directly (not wrapped in an object)
        if isinstance(result, list):
            result = {"themes": result}

        # Ensure themes key exists
        if "themes" not in result:
            result["themes"] = []

        # Ensure each theme has required fields
        for theme in result.get("themes", []):
            # Ensure required fields with default values
            if "sentiment" not in theme:
                theme["sentiment"] = 0.0  # neutral
            if "frequency" not in theme:
                theme["frequency"] = 0.5  # medium
            if "statements" not in theme:
                theme["statements"] = []
            if "keywords" not in theme:
                theme["keywords"] = []
            if "codes" not in theme:
                theme["codes"] = []

        return result
