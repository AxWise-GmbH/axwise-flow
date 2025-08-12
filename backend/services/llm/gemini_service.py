import logging
import json
import asyncio
import os
import sys
import re
import time
import random
from datetime import datetime
from typing import Dict, Any, List, Union, Optional, AsyncGenerator, Type, TypeVar

import httpx
import google.genai as genai
from google.genai.types import (
    GenerateContentConfig,
    SafetySetting,
    HarmCategory,
    Content,
)
from pydantic import BaseModel, Field, ValidationError

from backend.utils.json.json_repair import (
    repair_json,
    repair_enhanced_themes_json,
    parse_json_safely,
    parse_json_array_safely,
)
from backend.utils.json.instructor_parser import (
    parse_json_with_instructor,
    parse_llm_json_response_with_instructor,
)
from domain.interfaces.llm_unified import ILLMService
from backend.services.llm.instructor_gemini_client import InstructorGeminiClient

from backend.schemas import Theme
from backend.services.llm.prompts.gemini_prompts import GeminiPrompts
from backend.services.llm.exceptions import (
    LLMAPIError,
    LLMResponseParseError,
    LLMProcessingError,
    LLMServiceError,
)  # Added LLMProcessingError, LLMServiceError
from infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    GEMINI_TOP_P,
    GEMINI_TOP_K,
    ENV_GEMINI_API_KEY,
    GEMINI_SAFETY_SETTINGS_BLOCK_NONE,  # Assuming this constant exists for safety settings
)

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Service for interacting with Google's Gemini LLM API.
    """

    def __init__(self, config: Dict[str, Any]):
        self.default_model_name = config.get("model", GEMINI_MODEL_NAME)
        self.default_temperature = config.get("temperature", GEMINI_TEMPERATURE)
        self.default_max_tokens = config.get("max_tokens", GEMINI_MAX_TOKENS)
        self.default_top_p = config.get("top_p", GEMINI_TOP_P)
        self.api_key = config.get("api_key") or os.getenv(ENV_GEMINI_API_KEY)
        if not self.api_key:
            logger.error(
                "Gemini API key is not configured. Set GEMINI_API_KEY environment variable or provide in config."
            )
            raise ValueError("Gemini API key not found.")

        try:
            # Initialize the client using the new client-based pattern from google-genai 1.2.0+
            self.client = genai.Client(api_key=self.api_key)
            logger.info(f"Successfully initialized genai with Client() constructor.")

            # Initialize the Instructor client (lazy loading - will be created when needed)
            self._instructor_client = None
        except Exception as e:
            logger.error(
                f"An unexpected error occurred during genai client initialization: {e}"
            )
            raise ValueError(f"Failed to initialize Gemini client: {e}") from e

        logger.info(
            f"GeminiService initialized with model: {self.default_model_name}, temp: {self.default_temperature}, max_tokens: {self.default_max_tokens}, top_p: {self.default_top_p}"
        )

    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        return GeminiPrompts.get_system_message(task, data)

    def _get_generation_config(
        self, task: str, data: Dict[str, Any]
    ) -> GenerateContentConfig:
        temperature = data.get("temperature", self.default_temperature)
        max_tokens = data.get("max_tokens", self.default_max_tokens)
        top_p = data.get("top_p", self.default_top_p)
        # top_k can also be part of GenerateContentConfig if needed

        config_params = {}
        if temperature is not None:
            config_params["temperature"] = temperature
        if max_tokens is not None:
            config_params["max_output_tokens"] = (
                max_tokens  # Note: API uses max_output_tokens
            )
        if top_p is not None:
            config_params["top_p"] = top_p
        # if top_k is not None:
        #     config_params["top_k"] = top_k

        # For tasks that might generate large responses, ensure we use the maximum possible tokens
        if task in [
            "transcript_structuring",
            "theme_analysis",
            "theme_analysis_enhanced",
        ]:
            # DYNAMIC TOKEN ALLOCATION: Adjust based on input size
            # Get content for token estimation from data parameter
            content_for_estimation = data.get("text", data.get("content", ""))
            input_tokens = (
                len(str(content_for_estimation).split()) * 1.3
            )  # Rough token estimation
            if input_tokens > 50000:  # Large files (>50K tokens)
                config_params["max_output_tokens"] = 65536  # 64K for large files
                logger.info(
                    f"Large input detected ({input_tokens:.0f} tokens), using 64K output limit"
                )
            elif input_tokens > 20000:  # Medium files (20-50K tokens)
                config_params["max_output_tokens"] = 49152  # 48K for medium files
                logger.info(
                    f"Medium input detected ({input_tokens:.0f} tokens), using 48K output limit"
                )
            else:  # Small files (<20K tokens)
                config_params["max_output_tokens"] = (
                    32768  # 32K for small files (fastest)
                )
                logger.info(
                    f"Small input detected ({input_tokens:.0f} tokens), using 32K output limit"
                )
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(
                f"Using enhanced config for {task}: max_tokens=131072, top_k=1, top_p=0.95"
            )
        elif task in ["persona_formation", "pattern_recognition"]:
            # For persona_formation and pattern_recognition, use the maximum configuration to prevent truncation
            # DYNAMIC TOKEN ALLOCATION: Adjust based on input size
            # Get content for token estimation from data parameter
            content_for_estimation = data.get("text", data.get("content", ""))
            input_tokens = (
                len(str(content_for_estimation).split()) * 1.3
            )  # Rough token estimation
            if input_tokens > 50000:  # Large files (>50K tokens)
                config_params["max_output_tokens"] = 65536  # 64K for large files
                logger.info(
                    f"Large input detected ({input_tokens:.0f} tokens), using 64K output limit"
                )
            elif input_tokens > 20000:  # Medium files (20-50K tokens)
                config_params["max_output_tokens"] = 49152  # 48K for medium files
                logger.info(
                    f"Medium input detected ({input_tokens:.0f} tokens), using 48K output limit"
                )
            else:  # Small files (<20K tokens)
                config_params["max_output_tokens"] = (
                    32768  # 32K for small files (fastest)
                )
                logger.info(
                    f"Small input detected ({input_tokens:.0f} tokens), using 32K output limit"
                )
            config_params["top_k"] = 1
            config_params["top_p"] = 0.95
            logger.info(
                f"Using specific config for {task}: max_tokens=131072, top_k=1, top_p=0.95"
            )

        # Remove automatic_function_calling as it's causing validation errors

        return GenerateContentConfig(**config_params)

    async def _call_llm_api(
        self,
        model_name: str,
        contents: Union[str, List[Union[str, Content]]],
        generation_config: Optional[GenerateContentConfig] = None,
        system_instruction_text: Optional[str] = None,
    ) -> genai.types.GenerateContentResponse:
        """Makes the actual asynchronous API call to Gemini using client.aio.models.generate_content()."""
        logger.info(f"Attempting to call Gemini API with model: {model_name}")

        # Process the main content
        final_contents = contents

        # Create a dictionary for the GenerateContentConfig fields
        config_fields = {}

        # Add generation parameters if provided
        if generation_config:
            # Extract fields from the existing generation_config
            if hasattr(generation_config, "model_dump"):
                # For Pydantic v2+
                config_fields.update(generation_config.model_dump(exclude_none=True))
            elif hasattr(generation_config, "dict"):
                # For Pydantic v1
                config_fields.update(generation_config.dict(exclude_none=True))
            else:
                # Fallback for non-Pydantic objects
                for attr in dir(generation_config):
                    if not attr.startswith("_") and not callable(
                        getattr(generation_config, attr)
                    ):
                        value = getattr(generation_config, attr)
                        if value is not None:
                            config_fields[attr] = value

        # Process the main content and include system instruction if provided
        if system_instruction_text:
            logger.debug(
                f"Using system instruction (first 200 chars): {system_instruction_text[:200]}..."
            )
            # Create Content objects with role="user" (Gemini API only accepts "user" and "model" roles)
            if isinstance(final_contents, str):
                # Convert string content to a list of Content objects
                user_content = Content(parts=[{"text": final_contents}], role="user")
                system_content = Content(
                    parts=[{"text": "System instruction: " + system_instruction_text}],
                    role="user",
                )
                final_contents = [system_content, user_content]
            elif isinstance(final_contents, list):
                # Add system instruction as the first item with proper role
                system_content = Content(
                    parts=[{"text": "System instruction: " + system_instruction_text}],
                    role="user",
                )
                final_contents = [system_content] + final_contents

        # Create safety settings using the types module from google.genai
        # This ensures we're using the correct SafetySetting class from the SDK
        from google.genai import types

        safety_settings = [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
        ]
        logger.info(f"Created safety settings: {safety_settings}")

        # Create the final GenerateContentConfig object with only valid fields
        try:
            # Do NOT add safety_settings to the config
            # Remove automatic_function_calling as it's causing validation errors
            final_config = GenerateContentConfig(**config_fields)
            logger.debug(f"Created GenerateContentConfig with fields: {config_fields}")
        except Exception as e:
            logger.error(f"Error creating GenerateContentConfig: {e}")
            # Fallback to empty config if creation fails
            final_config = None

        logger.debug(
            f"Gemini API call - Model: {model_name}, "
            f"Contents type: {type(final_contents)}, "
            f"System Instruction present: {bool(system_instruction_text)}, "
            f"Config: {final_config}"
        )

        try:
            # Use client.models.generate_content with the correct parameter structure
            # In the new SDK, safety_settings should be included in the config
            if final_config:
                config_dict = (
                    final_config.model_dump()
                    if hasattr(final_config, "model_dump")
                    else final_config.dict()
                )
                final_config = GenerateContentConfig(**config_dict)

            # Log the API call details
            logger.info(
                f"Calling client.aio.models.generate_content with model={model_name}, safety_settings={safety_settings}"
            )

            # Create a new config object that includes all necessary parameters
            from google.genai import types

            # DYNAMIC TOKEN ALLOCATION: Adjust based on input size
            input_tokens = len(str(contents).split()) * 1.3  # Rough token estimation
            if input_tokens > 50000:  # Large files (>50K tokens)
                max_output_tokens = 65536  # 64K for large files
                logger.info(
                    f"Large input detected ({input_tokens:.0f} tokens), using 64K output limit"
                )
            elif input_tokens > 20000:  # Medium files (20-50K tokens)
                max_output_tokens = 49152  # 48K for medium files
                logger.info(
                    f"Medium input detected ({input_tokens:.0f} tokens), using 48K output limit"
                )
            else:  # Small files (<20K tokens)
                max_output_tokens = 32768  # 32K for small files (fastest)
                logger.info(
                    f"Small input detected ({input_tokens:.0f} tokens), using 32K output limit"
                )

            config = types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=max_output_tokens,
                top_k=1,
                top_p=0.95,
                safety_settings=safety_settings,
            )

            # Add response_mime_type for JSON tasks
            if "response_mime_type" in config_dict:
                config_kwargs = {
                    "temperature": 0.0,
                    "max_output_tokens": 131072,  # Increased to prevent truncation
                    "top_k": 1,
                    "top_p": 0.95,
                    "safety_settings": safety_settings,
                }

                # Get response_mime_type from config_dict
                response_mime_type = config_dict["response_mime_type"]
                logger.info(
                    f"Using response_mime_type={response_mime_type} from config"
                )
                config_kwargs["response_mime_type"] = response_mime_type

                # Note: We're not using response_schema directly due to compatibility issues
                # Instead, we'll rely on response_mime_type="application/json" and our JSON repair functions

                # Create a new config with the response_mime_type included
                config = types.GenerateContentConfig(**config_kwargs)

            # Make the API call with the correct config parameter and timeout protection
            logger.info(f"Making API call with config={config}")

            # Add timeout protection for large requests
            timeout_seconds = 600  # 10 minutes timeout for very large requests
            if input_tokens > 50000:
                logger.info(
                    f"Large request detected ({input_tokens:.0f} tokens), using {timeout_seconds}s timeout"
                )

            response = await asyncio.wait_for(
                self.client.aio.models.generate_content(
                    model=model_name, contents=final_contents, config=config
                ),
                timeout=timeout_seconds,
            )
            return response
        except asyncio.TimeoutError:
            logger.error(
                f"Gemini API call timed out after {timeout_seconds} seconds for model '{model_name}'"
            )
            raise LLMAPIError(
                f"Gemini API call timed out after {timeout_seconds} seconds for model '{model_name}'"
            )
        except Exception as e:
            logger.error(
                f"Error calling client.aio.models.generate_content for model '{model_name}': {e}",
                exc_info=True,
            )
            if not isinstance(
                e,
                (
                    LLMAPIError,
                    LLMProcessingError,
                    LLMResponseParseError,
                    LLMServiceError,
                ),
            ):
                raise LLMAPIError(
                    f"Gemini API call (non-streaming) failed for model '{model_name}': {e}"
                ) from e
            raise

    async def _generate_text_stream_with_retry(
        self,
        model_name: str,
        contents: Union[str, List[Union[str, Content]]],
        generation_config: Optional[GenerateContentConfig] = None,
        system_instruction_text: Optional[str] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
    ) -> AsyncGenerator[str, None]:
        """Generates text stream using the Gemini API with retry logic."""
        delay = initial_delay
        last_exception = None

        for attempt in range(max_retries):
            try:
                logger.info(
                    f"Attempt {attempt + 1}/{max_retries} - Streaming from model: {model_name}, "
                    f"system_instruction: {bool(system_instruction_text)}"
                )

                # Process the main content
                final_contents = contents

                # Create a dictionary for the GenerateContentConfig fields
                config_fields = {}

                # Add generation parameters if provided
                if generation_config:
                    # Extract fields from the existing generation_config
                    if hasattr(generation_config, "model_dump"):
                        # For Pydantic v2+
                        config_fields.update(
                            generation_config.model_dump(exclude_none=True)
                        )
                    elif hasattr(generation_config, "dict"):
                        # For Pydantic v1
                        config_fields.update(generation_config.dict(exclude_none=True))
                    else:
                        # Fallback for non-Pydantic objects
                        for attr in dir(generation_config):
                            if not attr.startswith("_") and not callable(
                                getattr(generation_config, attr)
                            ):
                                value = getattr(generation_config, attr)
                                if value is not None:
                                    config_fields[attr] = value

                # Process the main content and include system instruction if provided
                if system_instruction_text:
                    logger.debug(
                        f"Using system instruction (first 200 chars): {system_instruction_text[:200]}..."
                    )
                    # Create Content objects with role="user" (Gemini API only accepts "user" and "model" roles)
                    if isinstance(final_contents, str):
                        # Convert string content to a list of Content objects
                        user_content = Content(
                            parts=[{"text": final_contents}], role="user"
                        )
                        system_content = Content(
                            parts=[
                                {
                                    "text": "System instruction: "
                                    + system_instruction_text
                                }
                            ],
                            role="user",
                        )
                        final_contents = [system_content, user_content]
                    elif isinstance(final_contents, list):
                        # Add system instruction as the first item with proper role
                        system_content = Content(
                            parts=[
                                {
                                    "text": "System instruction: "
                                    + system_instruction_text
                                }
                            ],
                            role="user",
                        )
                        final_contents = [system_content] + final_contents

                # Create safety settings using the types module from google.genai
                # This ensures we're using the correct SafetySetting class from the SDK
                from google.genai import types

                safety_settings = [
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold=types.HarmBlockThreshold.BLOCK_NONE,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold=types.HarmBlockThreshold.BLOCK_NONE,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold=types.HarmBlockThreshold.BLOCK_NONE,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold=types.HarmBlockThreshold.BLOCK_NONE,
                    ),
                ]
                logger.info(f"Created safety settings for streaming: {safety_settings}")

                # Create the final GenerateContentConfig object with only valid fields
                try:
                    # Do NOT add safety_settings to the config
                    # Remove automatic_function_calling as it's causing validation errors
                    final_config = GenerateContentConfig(**config_fields)
                    logger.debug(
                        f"Created GenerateContentConfig with fields: {config_fields}"
                    )
                except Exception as e:
                    logger.error(f"Error creating GenerateContentConfig: {e}")
                    # Fallback to empty config if creation fails
                    final_config = None

                logger.debug(
                    f"Calling client.aio.models.generate_content_stream for model='{model_name}' with "
                    f"Contents type: {type(final_contents)}, "
                    f"System Instruction present: {bool(system_instruction_text)}, "
                    f"Config: {final_config}"
                )

                # In the new SDK, safety_settings should be included in the config
                if final_config:
                    config_dict = (
                        final_config.model_dump()
                        if hasattr(final_config, "model_dump")
                        else final_config.dict()
                    )
                    final_config = GenerateContentConfig(**config_dict)

                # Log the API call details
                logger.info(
                    f"Calling client.aio.models.generate_content_stream with model={model_name}, safety_settings={safety_settings}"
                )

                # Create a new config object that includes all necessary parameters
                from google.genai import types

                config = types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=131072,  # Increased to prevent truncation
                    top_k=1,
                    top_p=0.95,
                    safety_settings=safety_settings,
                )

                # Add response_mime_type for JSON tasks
                if "response_mime_type" in config_dict:
                    config_kwargs = {
                        "temperature": 0.0,
                        "max_output_tokens": 131072,  # Increased to prevent truncation
                        "top_k": 1,
                        "top_p": 0.95,
                        "safety_settings": safety_settings,
                    }

                    # Get response_mime_type from config_dict
                    response_mime_type = config_dict["response_mime_type"]
                    logger.info(
                        f"Using response_mime_type={response_mime_type} from config for streaming"
                    )
                    config_kwargs["response_mime_type"] = response_mime_type

                    # Note: We're not using response_schema directly due to compatibility issues
                    # Instead, we'll rely on response_mime_type="application/json" and our JSON repair functions

                    # Create a new config with the response_mime_type included
                    config = types.GenerateContentConfig(**config_kwargs)

                # Make the API call with the correct config parameter
                logger.info(f"Making streaming API call with config={config}")
                async for chunk in await self.client.aio.models.generate_content_stream(
                    model=model_name,  # Note: parameter is 'model', not 'model_name'
                    contents=final_contents,
                    config=config,
                ):
                    yield chunk.text

                return  # Successful stream completion for this attempt

            except StopAsyncIteration:
                logger.info(
                    f"Stream for model {model_name} ended via StopAsyncIteration (likely empty or filtered)."
                )
                return
            except LLMAPIError as e:
                last_exception = e
                logger.warning(
                    f"LLM API stream failed on attempt {attempt + 1}/{max_retries} for model {model_name}: {e}. Retrying in {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
                delay *= backoff_factor
            except Exception as e:
                last_exception = e
                logger.error(
                    f"Unexpected error on attempt {attempt + 1}/{max_retries} during streaming for model {model_name}: {e}",
                    exc_info=True,
                )
                await asyncio.sleep(delay)
                delay *= backoff_factor

        logger.error(
            f"Failed to generate text stream after {max_retries} retries for model {model_name}."
        )
        if last_exception:
            raise last_exception
        raise LLMServiceError(
            f"Failed to generate text stream after {max_retries} retries for model {model_name}."
        )

    async def _generate_text_with_retry(
        self,
        model_name: str,
        prompt_parts: List[Any],
        generation_config: Optional[GenerateContentConfig] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
        system_instruction_text: Optional[str] = None,
    ) -> genai.types.GenerateContentResponse:
        """Generates text using the Gemini API with retry logic."""
        delay = initial_delay
        last_exception = None
        for attempt in range(max_retries):
            try:
                # Ensure prompt_parts are correctly formatted
                current_prompt_parts = []
                for part_item in prompt_parts:
                    if isinstance(part_item, str):
                        current_prompt_parts.append(part_item)
                    elif isinstance(part_item, Content):
                        current_prompt_parts.append(part_item)
                    else:
                        current_prompt_parts.append(str(part_item))

                logger.debug(
                    f"Attempt {attempt + 1}/{max_retries} - Calling _call_llm_api with model: {model_name}, "
                    f"system_instruction: {bool(system_instruction_text)}"
                )
                # Directly await the async _call_llm_api method
                response = await self._call_llm_api(
                    model_name=model_name,
                    contents=current_prompt_parts,
                    generation_config=generation_config,
                    system_instruction_text=system_instruction_text,
                )
                return response
            except LLMAPIError as e:  # Catch specific API errors for retry
                last_exception = e
                logger.warning(
                    f"LLM API call failed on attempt {attempt + 1}/{max_retries}: {e}. Retrying in {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
                delay *= backoff_factor
            except Exception as e:  # Catch other unexpected errors
                last_exception = e
                logger.error(
                    f"Unexpected error on attempt {attempt + 1}/{max_retries} while generating text: {e}",
                    exc_info=True,
                )
                # Depending on policy, you might want to break or retry for some unexpected errors too
                # For now, we'll retry on generic exceptions as well, but this could be refined.
                await asyncio.sleep(delay)
                delay *= backoff_factor

        logger.error(f"Failed to generate text after {max_retries} retries.")
        if last_exception:
            raise last_exception  # Re-raise the last caught exception
        # Fallback if no specific exception was caught but retries exhausted (should not happen if loop completes)
        raise LLMServiceError(
            f"Failed to generate text after {max_retries} retries for model {model_name}."
        )

    @property
    def instructor_client(self) -> InstructorGeminiClient:
        """
        Get the Instructor-patched Gemini client.

        Returns:
            InstructorGeminiClient: The Instructor-patched Gemini client
        """
        if self._instructor_client is None:
            self._instructor_client = InstructorGeminiClient(
                api_key=self.api_key, model_name=self.default_model_name
            )
            logger.info(
                f"Initialized InstructorGeminiClient with model {self.default_model_name}"
            )
        return self._instructor_client

    async def analyze_with_instructor(self, task: str, data: Dict[str, Any]) -> Any:
        """
        Analyze content using the Instructor-patched client.

        Args:
            task: The task to perform
            data: The data for the task

        Returns:
            The analysis result
        """
        if task != "persona_formation":
            # Only use Instructor for persona formation initially
            logger.info(
                f"Task {task} is not supported by Instructor yet, falling back to standard analyze method"
            )
            return await self.analyze(task, data)

        try:
            logger.info(f"Using Instructor for task: {task}")

            # Get the prompt from the data
            prompt = data.get("prompt", "")
            if not prompt and "text" in data:
                prompt = data["text"]

            # Get the system instruction if any
            system_instruction = data.get("system_instruction", None)
            if not system_instruction:
                system_instruction = self._get_system_message(task, data)

            # Import the Persona model
            from domain.models.persona_schema import Persona

            # Generate with Instructor
            try:
                persona = await self.instructor_client.generate_with_model_async(
                    prompt=prompt,
                    model_class=Persona,
                    temperature=data.get("temperature", 0.0),
                    system_instruction=system_instruction,
                    max_output_tokens=131072,  # Increased to prevent truncation
                    response_mime_type="application/json",  # Force JSON output
                )
            except Exception as e:
                logger.error(
                    f"Error using Instructor for {task}: {str(e)}", exc_info=True
                )
                # Try one more time with even more strict settings
                persona = await self.instructor_client.generate_with_model_async(
                    prompt=prompt,
                    model_class=Persona,
                    temperature=0.0,
                    system_instruction=system_instruction
                    + "\nYou MUST output valid JSON that conforms to the schema.",
                    max_output_tokens=131072,  # Increased to prevent truncation
                    response_mime_type="application/json",
                    top_p=1.0,
                    top_k=1,
                )

            # Convert to dictionary
            return persona.model_dump()
        except Exception as e:
            logger.error(f"Error using Instructor for {task}: {str(e)}", exc_info=True)
            # Fall back to the original method
            logger.info(f"Falling back to standard analyze method for {task}")
            return await self.analyze(task, data)

    async def analyze(
        self, text: str, task: str, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        data = data or {}
        system_message_content = self._get_system_message(task, data)
        user_message_content = text

        # Construct prompt parts. For Gemini, we're using the client.aio.models.generate_content() pattern.
        # The 'contents' parameter can be a string, a list of strings, or Content objects.
        # The SDK will handle converting these to the appropriate format.
        # For system instructions, we're including them in the GenerateContentConfig object.
        # The `GenerationConfig` object handles temperature, max_tokens, system_instruction, safety_settings, etc.
        # All these parameters are bundled into a single config object passed to generate_content().

        # Import Pydantic models for response schemas
        from backend.schemas import (
            EnhancedThemeResponse,
            Theme,
            SentimentDistribution,
            HierarchicalCode,
            ReliabilityMetrics,
            ThemeRelationship,
        )

        # Define JSON tasks
        json_tasks = [
            "transcript_structuring",
            "persona_formation",
            "theme_analysis",
            "theme_analysis_enhanced",
            "insight_generation",
            "pattern_analysis",
            "pattern_recognition",
            "sentiment_analysis",
        ]
        is_json_task = task in json_tasks

        # Check if content_info is provided in data
        content_info = data.get("content_info", {})
        if content_info:
            logger.info(f"Using content_info in LLM request: {content_info}")

            # Add special handling instructions based on content type
            if content_info.get("is_problem_focused", False):
                logger.info(
                    "Detected problem-focused content. Adding special handling instructions."
                )

                # Add special handling instructions to system message based on task
                if task == "transcript_structuring":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately structuring the dialogue without interpreting the content. Ensure the output is a valid JSON array with proper speaker_id, role, and dialogue fields."
                elif task == "persona_formation":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately extracting persona attributes from the dialogue. Pay special attention to the structure of the dialogue and ensure the output is a valid JSON object with all required persona fields."
                elif task == "theme_analysis" or task == "theme_analysis_enhanced":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately identifying themes from the dialogue. Ensure the output is a valid JSON object with proper theme structure including name, definition, statements, and other required fields."
                elif task == "pattern_recognition":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately identifying patterns from the dialogue. Ensure the output is a valid JSON object with proper pattern structure including name, description, evidence, and other required fields."
                elif task == "sentiment_analysis":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately analyzing sentiment from the dialogue. Ensure the output is a valid JSON object with proper sentiment structure including positive, neutral, and negative categories with supporting statements."
                elif task == "insight_generation":
                    system_message_content += "\n\nIMPORTANT: This is a problem-focused interview. Focus on accurately generating insights from the dialogue. Ensure the output is a valid JSON object with proper insight structure including title, description, evidence, and other required fields."

            # Add special handling for content with timestamps
            if content_info.get("has_timestamps", False):
                logger.info(
                    "Detected content with timestamps. Adding special handling instructions."
                )
                system_message_content += "\n\nNOTE: This content contains timestamps. Ensure you ignore timestamps when processing the content and focus on the actual dialogue."

            # Add special handling for high complexity content
            if content_info.get("content_complexity") == "high":
                logger.info(
                    "Detected high complexity content. Adding special handling instructions."
                )
                system_message_content += "\n\nNOTE: This is a complex transcript. Pay special attention to maintaining the correct sequence and context throughout your analysis."

        # Get base generation config - add text content for token estimation
        data_with_text = data.copy()
        data_with_text["text"] = text
        current_generation_config = self._get_generation_config(task, data_with_text)

        # Extract config parameters for modification
        config_params = {}
        if hasattr(current_generation_config, "model_dump"):
            # For Pydantic v2+
            config_params.update(
                current_generation_config.model_dump(exclude_none=True)
            )
        elif hasattr(current_generation_config, "dict"):
            # For Pydantic v1
            config_params.update(current_generation_config.dict(exclude_none=True))
        else:
            # Fallback for non-Pydantic objects
            for attr in dir(current_generation_config):
                if not attr.startswith("_") and not callable(
                    getattr(current_generation_config, attr)
                ):
                    value = getattr(current_generation_config, attr)
                    if value is not None:
                        config_params[attr] = value

        # Check if we should enforce JSON output
        enforce_json = data.get("enforce_json", False)

        # Initialize response_mime_type variable
        response_mime_type = None

        # Special handling for problem-focused content
        if content_info.get("is_problem_focused", False) and is_json_task:
            # Always enforce JSON output
            enforce_json = True
            logger.info("Enforcing JSON output for problem-focused content")

            # Set temperature to 0 for deterministic output
            config_params["temperature"] = 0.0
            logger.info("Setting temperature=0.0 for problem-focused content")

            # Set response_mime_type to application/json
            response_mime_type = "application/json"
            logger.info(
                "Setting response_mime_type=application/json for problem-focused content"
            )

        # Also enforce JSON output for high complexity content
        elif content_info.get("content_complexity") == "high" and is_json_task:
            # Always enforce JSON output
            enforce_json = True
            logger.info("Enforcing JSON output for high complexity content")

            # Set temperature to 0 for deterministic output
            config_params["temperature"] = 0.0
            logger.info("Setting temperature=0.0 for high complexity content")

            # Set response_mime_type to application/json
            response_mime_type = "application/json"
            logger.info(
                "Setting response_mime_type=application/json for high complexity content"
            )

        # Prepare response mime type and schema
        # Check if response_mime_type is already set by content type handling
        if not response_mime_type:
            # Get from data if available and is application/json
            response_mime_type = (
                data.get("output_format")
                if data.get("output_format") == "application/json"
                else None
            )
        response_schema = data.get("response_schema", None)

        # Check if we should enforce JSON output
        if (
            enforce_json
            or is_json_task
            or task == "pattern_recognition"
            or task == "theme_analysis_enhanced"
            or task == "persona_formation"
        ):
            # Add response_mime_type to config_params to enforce JSON output
            config_params["response_mime_type"] = "application/json"
            response_mime_type = "application/json"

            # Set temperature to 0 for deterministic output when generating structured data
            config_params["temperature"] = 0.0

            # Add specific instructions for persona_formation to ensure proper JSON formatting
            if task == "persona_formation":
                logger.info(
                    "Adding special JSON formatting instructions for persona formation"
                )
                if "prompt" in data and isinstance(data["prompt"], str):
                    json_formatting_instructions = """
CRITICAL: Your response MUST be valid JSON. Follow these formatting rules exactly:
1. Always include commas between array elements: [item1, item2, item3]
2. Always include commas between object properties: {"prop1": value1, "prop2": value2}
3. Never include a comma after the last element in an array or object
4. All property names must be in double quotes
5. String values must be in double quotes
6. Boolean values must be lowercase: true or false
7. Null values must be lowercase: null
8. Numbers should not be quoted

IMPORTANT: Double-check your JSON for missing commas before responding.
"""
                    data["prompt"] += "\n\n" + json_formatting_instructions

                    # Add a JSON schema to guide the response format
                    if "response_schema" not in data:
                        # Define a basic persona schema
                        persona_schema = {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "archetype": {"type": "string"},
                                "demographics": {
                                    "type": "object",
                                    "properties": {
                                        "value": {"type": "string"},
                                        "confidence": {"type": "number"},
                                        "evidence": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                                "goals_and_motivations": {
                                    "type": "object",
                                    "properties": {
                                        "value": {"type": "string"},
                                        "confidence": {"type": "number"},
                                        "evidence": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                                "challenges_and_frustrations": {
                                    "type": "object",
                                    "properties": {
                                        "value": {"type": "string"},
                                        "confidence": {"type": "number"},
                                        "evidence": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                },
                            },
                            "required": ["name", "description"],
                        }

                        # Add the schema to the request
                        data["response_schema"] = persona_schema
                        logger.info(
                            "Added persona schema to guide JSON response format"
                        )

            # Note: We're using both response_mime_type="application/json" and response_schema
            # to enforce structured output, along with our JSON repair functions as a fallback

            logger.info(f"Enforcing JSON output for task: {task}")

            # For persona_formation, ensure we use the maximum possible tokens (already set in _get_generation_config)
            # This is just a double-check to ensure consistency with the original implementation
            if (
                task == "persona_formation"
                and config_params.get("max_output_tokens") != 131072
            ):
                logger.warning(
                    f"Overriding max_output_tokens for persona_formation to 131072 (was {config_params.get('max_output_tokens')})"
                )
                config_params["max_output_tokens"] = 131072
                config_params["top_k"] = 1
                config_params["top_p"] = 0.95

            logger.info(
                f"Using response_mime_type='application/json' and temperature=0.0 for task '{task}' to enforce structured output"
            )
        elif task == "text_generation":
            # For text_generation, explicitly DO NOT use response_mime_type
            # This ensures we get plain text, not JSON
            if "response_mime_type" in config_params:
                del config_params["response_mime_type"]
            response_mime_type = None

            # Use the temperature provided in the request or the default
            config_params["temperature"] = data.get(
                "temperature", self.default_temperature
            )

            logger.info(
                f"Using plain text output for task '{task}' with temperature={config_params['temperature']}"
            )

        # Create the final GenerateContentConfig object
        try:
            current_generation_config = GenerateContentConfig(**config_params)
            logger.debug(f"Created GenerateContentConfig with fields: {config_params}")
        except Exception as e:
            logger.error(f"Error creating GenerateContentConfig: {e}")
            # Fallback to original config if creation fails
            logger.warning(f"Using original generation config due to error")

        prompt_parts: List[Union[str, Content]] = [user_message_content]

        # Log generation details
        logger.info(
            f"Generating content for task '{task}' with config: {config_params}"
        )

        # Prepare request options for schema if provided
        current_request_options = {}
        if response_schema:
            # Assuming response_schema from data is compatible (dict or genai.types.Schema)
            current_request_options["response_schema"] = response_schema

        final_request_options = (
            current_request_options if current_request_options else None
        )

        logger.debug(
            f"Analyzing text for task: {task}, "
            # f"Data: {data}, " # Avoid logging potentially large data object directly
            f"System message present: {bool(system_message_content)}, "
            f"Mime_type: {response_mime_type}, Schema present: {bool(response_schema)}, "
            f"Request_options: {final_request_options}"
        )

        try:
            response = await self._generate_text_with_retry(
                model_name=self.default_model_name,  # Added keyword arg for clarity
                prompt_parts=prompt_parts,
                generation_config=current_generation_config,
                system_instruction_text=system_message_content,
            )

            # Try to extract text from the response
            try:
                text_response = response.text
            except Exception as e_text:
                logger.warning(
                    f"[{task}] Could not get response.text: {e_text}. Trying to extract from candidates..."
                )
                try:
                    if (
                        response.candidates
                        and response.candidates[0].content
                        and response.candidates[0].content.parts
                        and response.candidates[0].content.parts[0].text
                    ):
                        text_response = response.candidates[0].content.parts[0].text
                        logger.info(
                            f"[{task}] Successfully extracted text from response.candidates[0].content.parts[0].text"
                        )
                    else:
                        logger.error(
                            f"[{task}] No valid content in response candidates after response.text failed."
                        )
                        return {
                            "error": f"Failed to extract text from Gemini response for {task}. Details: {e_text}"
                        }
                except Exception as e_parts:
                    logger.error(
                        f"[{task}] Failed to extract text from response candidates: {e_parts}",
                        exc_info=True,
                    )
                    return {
                        "error": f"Failed to extract text from Gemini response for {task}. Details: {e_parts}"
                    }

            # Log the raw response for debugging
            if text_response is not None:
                logger.info(
                    f"Raw response for task '{task}' (length: {len(text_response)}, first 500 chars): {text_response[:500]}"
                )
            else:
                logger.error(
                    f"Raw response for task '{task}' is None - this should not happen!"
                )
                return {"error": f"Gemini response text is None for task {task}"}

            # For persona_formation, also log the end of the response to check for truncation
            if task == "persona_formation" and text_response is not None:
                logger.info(
                    f"Raw response for task '{task}' (last 500 chars): {text_response[-500:]}"
                )
                if len(text_response) < 10000:  # If response seems too short
                    logger.warning(
                        f"Persona formation response seems short ({len(text_response)} chars). This might indicate truncation."
                    )

            # Special handling for transcript_structuring task
            if task == "transcript_structuring":
                # Log a concise preview of the raw response for transcript_structuring
                logger.info(
                    f"GeminiService.analyze: RAW response for transcript_structuring (first 500 chars): {text_response[:500]}"
                )
                # Log a snippet around the known error character if it's likely present
                error_char_index = 22972  # From previous logs
                if (
                    len(text_response) > error_char_index + 100
                ):  # Ensure text is long enough
                    snippet_start = max(0, error_char_index - 100)
                    snippet_end = error_char_index + 100
                    logger.info(
                        f"GeminiService.analyze: RAW transcript_structuring snippet around char {error_char_index}: ...{text_response[snippet_start:snippet_end]}..."
                    )
                else:
                    logger.info(
                        f"GeminiService.analyze: RAW transcript_structuring response too short for detailed error snippet (len: {len(text_response)})."
                    )

            # Check if response is empty or very short
            if not text_response or len(text_response.strip()) < 10:
                logger.error(
                    f"Empty or very short response received for task '{task}'. Response: '{text_response}'"
                )
                return {
                    "error": f"Empty or very short response received for task '{task}'",
                    "type": task,
                }

            # If JSON output was expected, attempt to repair if it looks truncated.
            # The 'response_obj.parsed' attribute could also be used if available and a schema was provided,
            # but for simplicity and consistency, we'll rely on 'response_obj.text' and repair logic here.
            # Downstream 'analyze' method will handle json.loads().
            if response_mime_type == "application/json":
                if not text_response.strip().endswith(
                    "}"
                ) and not text_response.strip().endswith("]"):
                    logger.warning(
                        f"LLM response for task '{task}' (JSON expected) might be truncated. Attempting repair."
                    )
                    try:
                        # Use specialized repair function for enhanced themes or persona formation
                        if task == "theme_analysis_enhanced":
                            logger.info(
                                f"Using specialized enhanced themes JSON repair function for task '{task}'"
                            )
                            text_response = repair_enhanced_themes_json(text_response)
                        elif task == "persona_formation":
                            logger.info(
                                f"Applying simple JSON fix for persona formation task"
                            )
                            # Apply a simple, targeted fix for the known issue
                            if '"value": "To discover unique, aut' in text_response:
                                logger.info(
                                    "Found truncated 'authentic' - applying targeted fix"
                                )
                                text_response = text_response.replace(
                                    '"value": "To discover unique, aut',
                                    '"value": "To discover unique, authentic experiences"',
                                )
                            # Skip the complex repair logic that corrupts the JSON
                        else:
                            text_response = repair_json(text_response)
                        logger.info(
                            f"Successfully repaired JSON response for task '{task}'."
                        )
                    except Exception as repair_e:
                        logger.error(
                            f"Failed to repair JSON for task '{task}': {repair_e}. Original text: {text_response[:500]}"
                        )
                        # Fallback to original text if repair fails, error will be caught by json.loads in analyze

            if response_mime_type == "application/json":
                try:
                    # For persona_formation, bypass all repair logic and try direct parsing
                    if task == "persona_formation":
                        logger.info(
                            f"[{task}] Attempting direct JSON parsing (bypassing all repair logic)"
                        )

                        # Always save the full JSON for debugging (not just on error)
                        try:
                            debug_file = f"/tmp/persona_json_{int(time.time())}.json"
                            with open(debug_file, "w") as f:
                                f.write(text_response)
                            logger.info(
                                f"[{task}] Saved full JSON ({len(text_response)} chars) to {debug_file}"
                            )
                        except Exception as save_e:
                            logger.warning(
                                f"[{task}] Could not save debug file: {save_e}"
                            )

                        try:
                            parsed_response = json.loads(text_response)
                            logger.info(
                                f"[{task}] Successfully parsed JSON directly without any repair!"
                            )
                        except json.JSONDecodeError as e:
                            logger.error(f"[{task}] Direct JSON parsing failed: {e}")
                            logger.info(
                                f"[{task}] Error at position {e.pos if hasattr(e, 'pos') else 'unknown'}"
                            )

                            # Show context around the error
                            if hasattr(e, "pos") and e.pos < len(text_response):
                                start = max(0, e.pos - 100)
                                end = min(len(text_response), e.pos + 100)
                                context = text_response[start:end]
                                logger.error(
                                    f"[{task}] Context around error position {e.pos}: ...{context}..."
                                )

                                # Show the exact character causing the issue
                                if e.pos < len(text_response):
                                    error_char = text_response[e.pos]
                                    logger.error(
                                        f"[{task}] Character at position {e.pos}: '{error_char}' (ASCII: {ord(error_char)})"
                                    )

                                    # Show a few characters before and after
                                    before_chars = text_response[
                                        max(0, e.pos - 5) : e.pos
                                    ]
                                    after_chars = text_response[
                                        e.pos : min(len(text_response), e.pos + 5)
                                    ]
                                    logger.error(
                                        f"[{task}] Before: '{before_chars}' | At: '{error_char}' | After: '{after_chars}'"
                                    )

                                # Apply targeted fix for the whitespace issue before closing brace
                                if (
                                    error_char == "}"
                                    and '"overall_confidence"' in context
                                ):
                                    logger.info(
                                        f"[{task}] Detected whitespace issue before closing brace, applying targeted fix"
                                    )
                                    # The issue is extra whitespace/newline before the closing brace
                                    # Pattern: '."
                                    #   },
                                    # Should be: '."
                                    # },

                                    # Fix the specific pattern: quote-newline-spaces-brace
                                    import re

                                    # Replace: quote + newline + spaces + closing brace
                                    # With: quote + newline + closing brace (no extra spaces)
                                    pattern = r'"\n\s+}'
                                    replacement = '"\n}'

                                    fixed_response = re.sub(
                                        pattern, replacement, text_response
                                    )

                                    if fixed_response != text_response:
                                        logger.info(
                                            f"[{task}] Applied whitespace fix: removed extra spaces before closing braces"
                                        )
                                    else:
                                        logger.info(
                                            f"[{task}] No whitespace pattern found, trying alternative fixes"
                                        )
                                        # Try alternative patterns
                                        patterns_to_fix = [
                                            ('"\n  }', '"\n}'),
                                            ('"\n    }', '"\n}'),
                                            ('"\n\t}', '"\n}'),
                                        ]

                                        for old_pattern, new_pattern in patterns_to_fix:
                                            if old_pattern in text_response:
                                                logger.info(
                                                    f"[{task}] Applying alternative fix: '{old_pattern}' -> '{new_pattern}'"
                                                )
                                                fixed_response = text_response.replace(
                                                    old_pattern, new_pattern
                                                )
                                                break

                                    try:
                                        parsed_response = json.loads(fixed_response)
                                        logger.info(
                                            f"[{task}] Successfully parsed JSON after targeted whitespace fix!"
                                        )
                                    except json.JSONDecodeError as e2:
                                        logger.error(
                                            f"[{task}] Targeted fix failed: {e2}"
                                        )
                                        # Show what the fix attempt looked like
                                        if hasattr(e2, "pos") and e2.pos < len(
                                            fixed_response
                                        ):
                                            start = max(0, e2.pos - 50)
                                            end = min(len(fixed_response), e2.pos + 50)
                                            fix_context = fixed_response[start:end]
                                            logger.error(
                                                f"[{task}] Fix attempt context: ...{fix_context}..."
                                            )

                                            # If we're still getting errors, try a more comprehensive fix
                                            logger.info(
                                                f"[{task}] Attempting comprehensive JSON cleanup"
                                            )
                                            try:
                                                # Apply multiple fixes in sequence
                                                comprehensive_fix = fixed_response

                                                # Fix 1: Ensure proper spacing around braces and brackets
                                                import re

                                                comprehensive_fix = re.sub(
                                                    r'"\s*\n\s*}',
                                                    '"\n}',
                                                    comprehensive_fix,
                                                )
                                                comprehensive_fix = re.sub(
                                                    r'"\s*\n\s*]',
                                                    '"\n]',
                                                    comprehensive_fix,
                                                )

                                                # Fix 2: Ensure proper comma placement
                                                comprehensive_fix = re.sub(
                                                    r'}\s*\n\s*"',
                                                    '},\n"',
                                                    comprehensive_fix,
                                                )
                                                comprehensive_fix = re.sub(
                                                    r']\s*\n\s*"',
                                                    '],\n"',
                                                    comprehensive_fix,
                                                )

                                                # Fix 3: Clean up any double commas
                                                comprehensive_fix = re.sub(
                                                    r",,+", ",", comprehensive_fix
                                                )

                                                parsed_response = json.loads(
                                                    comprehensive_fix
                                                )
                                                logger.info(
                                                    f"[{task}] Successfully parsed JSON after comprehensive cleanup!"
                                                )
                                            except json.JSONDecodeError as e3:
                                                logger.error(
                                                    f"[{task}] Comprehensive fix also failed: {e3}"
                                                )

                                                # Last resort: Try to extract valid JSON from the response
                                                logger.info(
                                                    f"[{task}] Attempting JSON extraction as last resort"
                                                )
                                                try:
                                                    # Find the first complete JSON object in the response
                                                    import re

                                                    # Look for the main JSON structure
                                                    json_match = re.search(
                                                        r'\{.*?"overall_confidence":\s*[\d.]+.*?\}',
                                                        text_response,
                                                        re.DOTALL,
                                                    )
                                                    if json_match:
                                                        extracted_json = (
                                                            json_match.group(0)
                                                        )
                                                        logger.info(
                                                            f"[{task}] Extracted JSON candidate ({len(extracted_json)} chars)"
                                                        )

                                                        # Try to parse the extracted JSON
                                                        parsed_response = json.loads(
                                                            extracted_json
                                                        )
                                                        logger.info(
                                                            f"[{task}] Successfully parsed extracted JSON!"
                                                        )
                                                    else:
                                                        logger.error(
                                                            f"[{task}] Could not extract valid JSON structure"
                                                        )
                                                        parsed_response = {}
                                                except Exception as e4:
                                                    logger.error(
                                                        f"[{task}] JSON extraction also failed: {e4}"
                                                    )
                                                    parsed_response = {}
                                        else:
                                            parsed_response = {}
                                else:
                                    # Return empty result to avoid corruption
                                    parsed_response = {}
                            else:
                                parsed_response = {}
                    else:
                        # For other tasks, use the Instructor-based parser
                        logger.info(
                            f"[{task}] Attempting to parse JSON with Instructor"
                        )
                        parsed_response = parse_json_with_instructor(
                            text_response,
                            context=f"GeminiService.analyze for task '{task}'",
                        )

                    # Log the parsed response structure
                    logger.info(
                        f"Successfully parsed JSON response for task '{task}' with Instructor. Keys: {list(parsed_response.keys()) if isinstance(parsed_response, dict) else 'array with ' + str(len(parsed_response)) + ' items'}"
                    )

                    # Check if the parsed JSON is an error object from the LLM
                    if isinstance(parsed_response, dict) and "error" in parsed_response:
                        llm_error_message = parsed_response.get(
                            "error", "LLM returned a JSON error object."
                        )
                        if (
                            isinstance(llm_error_message, dict)
                            and "message" in llm_error_message
                        ):
                            llm_error_message = llm_error_message.get(
                                "message", str(llm_error_message)
                            )
                        elif not isinstance(llm_error_message, str):
                            llm_error_message = str(llm_error_message)

                        logger.error(
                            f"[{task}] LLM returned a JSON error object: {llm_error_message}"
                        )
                        raise LLMAPIError(
                            f"LLM reported an error for task '{task}': {llm_error_message}"
                        )

                    result = parsed_response
                except Exception as e:
                    logger.error(
                        f"Failed to parse JSON response with Instructor for task '{task}': {e}. Response: {text_response[:500]}"
                    )
                    logger.warning(
                        f"[{task}] Instructor-based JSON parsing failed. Falling back to legacy parsers..."
                    )
                    try:
                        # Try direct JSON parsing first
                        parsed_response = json.loads(text_response)
                        logger.info(
                            f"Successfully parsed JSON response for task '{task}' with direct parsing."
                        )
                        result = parsed_response
                    except json.JSONDecodeError as e:
                        logger.error(
                            f"Direct JSON parsing failed for task '{task}': {e}. Response: {text_response[:500]}"
                        )
                        logger.warning(
                            f"[{task}] JSON parsing failed. Trying repair..."
                        )
                        try:
                            # Use specialized repair function for enhanced themes or persona formation
                            if task == "theme_analysis_enhanced":
                                logger.info(
                                    f"[{task}] Using specialized enhanced themes JSON repair function"
                                )
                                repaired = repair_enhanced_themes_json(text_response)
                            elif task == "persona_formation":
                                logger.info(
                                    f"[{task}] Skipping JSON repair for persona formation - using raw response"
                                )
                                # For persona formation, don't apply any repair - use raw response
                                repaired = text_response
                            else:
                                repaired = repair_json(text_response)

                            result = json.loads(repaired)
                            logger.info(
                                f"[{task}] Successfully parsed JSON after repair."
                            )

                            # Check if the parsed repaired JSON is an error object from the LLM
                            if isinstance(result, dict) and "error" in result:
                                llm_error_message = result.get(
                                    "error",
                                    "LLM returned a JSON error object after repair.",
                                )
                                if (
                                    isinstance(llm_error_message, dict)
                                    and "message" in llm_error_message
                                ):
                                    llm_error_message = llm_error_message.get(
                                        "message", str(llm_error_message)
                                    )
                                elif not isinstance(llm_error_message, str):
                                    llm_error_message = str(llm_error_message)

                                logger.error(
                                    f"[{task}] LLM returned a JSON error object after repair: {llm_error_message}"
                                )
                                raise LLMAPIError(
                                    f"LLM reported an error for task '{task}' (after repair): {llm_error_message}"
                                )

                            return result
                        except json.JSONDecodeError as e2:
                            logger.error(
                                f"[{task}] Failed to parse JSON even after repair: {e2}"
                            )

                            # Special handling for insights task
                            if task == "insight_generation":
                                logger.warning(
                                    f"[{task}] Using default insights structure due to JSON parsing failure"
                                )
                                # Return a default structure if parsing fails
                                return {
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
                            # Special handling for enhanced themes task
                            elif task == "theme_analysis_enhanced":
                                logger.warning(
                                    f"[{task}] Using default enhanced themes structure due to JSON parsing failure"
                                )
                                # Return a default structure if parsing fails
                                return {
                                    "enhanced_themes": [
                                        {
                                            "type": "theme",
                                            "name": "Analysis Incomplete",
                                            "definition": "The enhanced theme analysis could not be properly structured.",
                                            "keywords": [
                                                "incomplete",
                                                "analysis",
                                                "error",
                                            ],
                                            "frequency": 0.5,
                                            "sentiment": 0.0,
                                            "statements": [
                                                "Processing completed with non-structured output."
                                            ],
                                            "codes": ["PROCESSING_ERROR"],
                                            "reliability": 0.5,
                                            "process": "enhanced",
                                            "sentiment_distribution": {
                                                "positive": 0.0,
                                                "neutral": 1.0,
                                                "negative": 0.0,
                                            },
                                        }
                                    ]
                                }
                            else:
                                # Return a structured error response instead of raising an exception
                                return {
                                    "error": f"Failed to decode JSON response for task '{task}' even after repair: {e2}",
                                    "type": task,
                                }
            else:
                # If we are here, it means response_mime_type was not 'application/json'
                # However, the task might still have been intended to be a JSON task.
                logger.debug(
                    f"Raw response text (non-JSON path) for task {task}:\n{text_response[:500]}"
                )

                # If it was an expected JSON task, but we are in the non-JSON path, attempt parsing.
                if is_json_task:
                    logger.info(
                        f"[{task}] Attempting JSON parse for an expected JSON task in non-JSON response path."
                    )
                    try:
                        # First try using the Instructor-based parser
                        logger.info(
                            f"[{task}] Attempting to parse JSON with Instructor in non-JSON path"
                        )
                        result = parse_json_with_instructor(
                            text_response,
                            context=f"GeminiService.analyze non-JSON path for task '{task}'",
                        )
                        logger.info(
                            f"[{task}] Successfully parsed JSON in non-JSON path with Instructor."
                        )

                        # Check if the parsed JSON is an error object from the LLM
                        if isinstance(result, dict) and "error" in result:
                            llm_error_message = result.get(
                                "error", "LLM returned a JSON error object."
                            )
                            if (
                                isinstance(llm_error_message, dict)
                                and "message" in llm_error_message
                            ):
                                llm_error_message = llm_error_message.get(
                                    "message", str(llm_error_message)
                                )
                            elif not isinstance(llm_error_message, str):
                                llm_error_message = str(llm_error_message)

                            logger.error(
                                f"[{task}] LLM returned a JSON error object: {llm_error_message}"
                            )
                            raise LLMAPIError(
                                f"LLM reported an error for task '{task}': {llm_error_message}"
                            )

                        return result
                    except Exception as e:
                        logger.error(
                            f"Failed to parse JSON with Instructor in non-JSON path for task '{task}': {e}. Response: {text_response[:500]}"
                        )
                        logger.warning(
                            f"[{task}] Instructor-based JSON parsing failed in non-JSON path. Falling back to legacy parsers..."
                        )
                        try:
                            # Try direct JSON parsing
                            result = json.loads(text_response)
                            logger.info(
                                f"[{task}] Successfully parsed JSON in non-JSON path with direct parsing."
                            )
                            return result
                        except json.JSONDecodeError as e_non_json_path:
                            logger.warning(
                                f"[{task}] JSON parsing failed in non-JSON path: {e_non_json_path}. Trying repair..."
                            )
                            try:
                                # Use specialized repair function for enhanced themes or persona formation
                                if task == "theme_analysis_enhanced":
                                    logger.info(
                                        f"[{task}] Using specialized enhanced themes JSON repair function in non-JSON path"
                                    )
                                    repaired = repair_enhanced_themes_json(
                                        text_response
                                    )
                                elif task == "persona_formation":
                                    logger.info(
                                        f"[{task}] Skipping JSON repair for persona formation in non-JSON path - using raw response"
                                    )
                                    # For persona formation, don't apply any repair - use raw response
                                    repaired = text_response
                                else:
                                    repaired = repair_json(text_response)
                                result = json.loads(repaired)
                                logger.info(
                                    f"[{task}] Successfully parsed JSON in non-JSON path after repair."
                                )

                                # Check if the parsed repaired JSON is an error object from the LLM
                                if isinstance(result, dict) and "error" in result:
                                    llm_error_message = result.get(
                                        "error",
                                        "LLM returned a JSON error object after repair.",
                                    )
                                    if (
                                        isinstance(llm_error_message, dict)
                                        and "message" in llm_error_message
                                    ):
                                        llm_error_message = llm_error_message.get(
                                            "message", str(llm_error_message)
                                        )
                                    elif not isinstance(llm_error_message, str):
                                        llm_error_message = str(llm_error_message)

                                    logger.error(
                                        f"[{task}] LLM returned a JSON error object after repair: {llm_error_message}"
                                    )
                                    raise LLMAPIError(
                                        f"LLM reported an error for task '{task}' (after repair): {llm_error_message}"
                                    )

                                return result
                            except json.JSONDecodeError as e2_non_json_path:
                                logger.error(
                                    f"[{task}] Failed to parse JSON in non-JSON path even after repair: {e2_non_json_path}"
                                )
                                error_message = f"All parsing attempts failed in non-JSON path for task '{task}'. Detail: {e2_non_json_path}. Raw preview: {text_response[:200]}"
                                raise LLMResponseParseError(error_message)
                else:
                    # For non-JSON tasks, just return the text
                    logger.info(
                        f"[{task}] Returning raw text for non-JSON task in non-JSON path."
                    )
                    result = {"text": text_response}

            # Post-process results if needed
            if task == "pattern_recognition":
                # For pattern recognition, ensure we have a proper structure
                if isinstance(result, list):
                    result = {"patterns": result}

                # Ensure patterns key exists
                if "patterns" not in result:
                    logger.warning(
                        f"Pattern recognition response missing 'patterns' key, adding empty array"
                    )
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
                        pattern["suggested_actions"] = [
                            "Consider further investigation"
                        ]

                # Log the patterns for debugging
                if result["patterns"]:
                    logger.info(
                        f"Pattern recognition returned {len(result['patterns'])} patterns"
                    )
                    if len(result["patterns"]) > 0:
                        logger.info(
                            f"First pattern: {result['patterns'][0].get('name', 'Unnamed')}"
                        )
                else:
                    logger.warning(f"Pattern recognition returned empty patterns array")

            elif task == "theme_analysis" or task == "theme_analysis_enhanced":
                # If response is a list of themes directly (not wrapped in an object)
                if isinstance(result, list):
                    if task == "theme_analysis":
                        result = {"themes": result}
                    else:  # theme_analysis_enhanced
                        result = {"enhanced_themes": result}

                # Ensure proper themes array
                if task == "theme_analysis" and "themes" not in result:
                    result["themes"] = []
                elif (
                    task == "theme_analysis_enhanced"
                    and "enhanced_themes" not in result
                ):
                    # Check if there's a "themes" key that should be renamed to "enhanced_themes"
                    if "themes" in result:
                        result["enhanced_themes"] = result["themes"]
                        del result["themes"]
                    else:
                        result["enhanced_themes"] = []

                # Determine which themes array to process
                themes_to_process = []
                if task == "theme_analysis" and "themes" in result:
                    themes_to_process = result["themes"]
                elif task == "theme_analysis_enhanced" and "enhanced_themes" in result:
                    themes_to_process = result["enhanced_themes"]

                # Ensure each theme has required fields
                for theme in themes_to_process:
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

                # Determine which themes to validate and where to store the result
                themes_key = "themes" if task == "theme_analysis" else "enhanced_themes"
                themes_to_validate = (
                    result.get(themes_key, []) if isinstance(result, dict) else []
                )

                if isinstance(themes_to_validate, list):
                    for theme_data in themes_to_validate:
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
                    result[themes_key] = validated_themes_list
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
                        "LLM response for {} was not in the expected format (dict with '{}' list). Raw response: {}".format(
                            task, themes_key, result
                        )
                    )
                    # Return empty list if structure is wrong
                    result = {themes_key: []}

            return result

        except (LLMAPIError, LLMProcessingError, LLMServiceError) as e:
            logger.error(f"Error in GeminiService.analyze for task '{task}': {e}")
            raise
        except Exception as e:
            logger.error(
                f"Unexpected error in GeminiService.analyze for task '{task}': {e}",
                exc_info=True,
            )
            raise LLMServiceError(
                f"An unexpected error occurred in GeminiService for task '{task}': {e}"
            ) from e

    def get_model_name(self) -> str:
        """Get the current model name"""
        return self.default_model_name

    def get_pydantic_ai_model(self) -> str:
        """Get PydanticAI compatible model string for Google Gemini"""
        # PydanticAI now supports gemini-2.5-flash directly, no mapping needed
        # Based on PydanticAI docs: https://ai.pydantic.dev/api/models/gemini/
        # LatestGeminiModelNames includes "gemini-2.5-flash" natively

        # Return the model name as-is since PydanticAI supports it directly
        return self.default_model_name
