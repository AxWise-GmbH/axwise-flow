"""
Instructor-patched Gemini client for structured outputs.

This module provides a wrapper around the Google GenAI client that uses
Instructor to extract structured data from LLM responses.
"""

import logging
from typing import Type, TypeVar, Any, Dict, List, Optional, Union

import google.genai as genai
import instructor
from pydantic import BaseModel

from infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME, GEMINI_TEMPERATURE, GEMINI_MAX_TOKENS,
    GEMINI_TOP_P, GEMINI_TOP_K, ENV_GEMINI_API_KEY
)

logger = logging.getLogger(__name__)

# Type variable for generic Pydantic model
T = TypeVar('T', bound=BaseModel)

class InstructorGeminiClient:
    """
    Instructor-patched Gemini client for structured outputs.

    This class provides a wrapper around the Google GenAI client that uses
    Instructor to extract structured data from LLM responses.
    """

    def __init__(self, api_key: Optional[str] = None, model_name: str = GEMINI_MODEL_NAME):
        """
        Initialize the Instructor-patched Gemini client.

        Args:
            api_key: Optional API key (defaults to environment variable)
            model_name: Model name to use
        """
        # Initialize the standard client
        self.standard_client = genai.Client(api_key=api_key)

        # Initialize the Instructor-patched client
        self.instructor_client = instructor.from_genai(
            self.standard_client,
            mode=instructor.Mode.GENAI_STRUCTURED_OUTPUTS
        )

        self.model_name = model_name
        logger.info(f"Initialized InstructorGeminiClient with model {model_name}")

    def generate_with_model(
        self,
        prompt: str,
        model_class: Type[T],
        temperature: float = GEMINI_TEMPERATURE,
        max_output_tokens: int = GEMINI_MAX_TOKENS,
        top_p: float = GEMINI_TOP_P,
        top_k: int = GEMINI_TOP_K,
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> T:
        """
        Generate content with a specific Pydantic model.

        Args:
            prompt: The prompt to send to the model
            model_class: The Pydantic model class to parse the response into
            temperature: Temperature parameter for generation
            max_output_tokens: Maximum number of tokens to generate
            top_p: Top-p parameter for generation
            top_k: Top-k parameter for generation
            system_instruction: Optional system instruction
            **kwargs: Additional arguments to pass to the client

        Returns:
            Parsed response as an instance of the specified model class
        """
        logger.info(f"Generating content with model {self.model_name} and response model {model_class.__name__}")

        # Prepare messages
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        # Generate content
        try:
            response = self.instructor_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                response_model=model_class,
                temperature=temperature,
                max_tokens=max_output_tokens,
                top_p=top_p,
                top_k=top_k,
                **kwargs
            )
        except Exception as e:
            logger.error(f"Error generating content with Instructor: {str(e)}")
            # Add specific handling for JSON parsing errors
            if "JSON" in str(e) or "json" in str(e):
                logger.warning("JSON parsing error detected. Retrying with more strict settings...")
                # Retry with more strict settings
                response = self.instructor_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    response_model=model_class,
                    temperature=0.0,  # Use zero temperature for deterministic output
                    max_tokens=max_output_tokens,
                    top_p=1.0,
                    top_k=1,
                    response_mime_type="application/json",  # Force JSON output
                    **kwargs
                )
            else:
                raise

        logger.info(f"Successfully generated content with model {model_class.__name__}")
        return response

    async def generate_with_model_async(
        self,
        prompt: str,
        model_class: Type[T],
        temperature: float = GEMINI_TEMPERATURE,
        max_output_tokens: int = GEMINI_MAX_TOKENS,
        top_p: float = GEMINI_TOP_P,
        top_k: int = GEMINI_TOP_K,
        system_instruction: Optional[str] = None,
        **kwargs
    ) -> T:
        """
        Generate content asynchronously with a specific Pydantic model.

        Args:
            prompt: The prompt to send to the model
            model_class: The Pydantic model class to parse the response into
            temperature: Temperature parameter for generation
            max_output_tokens: Maximum number of tokens to generate
            top_p: Top-p parameter for generation
            top_k: Top-k parameter for generation
            system_instruction: Optional system instruction
            **kwargs: Additional arguments to pass to the client

        Returns:
            Parsed response as an instance of the specified model class
        """
        # Initialize async client if needed
        if not hasattr(self, 'async_instructor_client'):
            self.async_instructor_client = instructor.from_genai(
                self.standard_client,
                mode=instructor.Mode.GENAI_STRUCTURED_OUTPUTS,
                use_async=True
            )

        logger.info(f"Generating content asynchronously with model {self.model_name} and response model {model_class.__name__}")

        # Prepare messages
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        # Generate content
        try:
            response = await self.async_instructor_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                response_model=model_class,
                temperature=temperature,
                max_tokens=max_output_tokens,
                top_p=top_p,
                top_k=top_k,
                **kwargs
            )
        except Exception as e:
            logger.error(f"Error generating content asynchronously with Instructor: {str(e)}")
            # Add specific handling for JSON parsing errors
            if "JSON" in str(e) or "json" in str(e):
                logger.warning("JSON parsing error detected. Retrying with more strict settings...")
                # Retry with more strict settings
                response = await self.async_instructor_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    response_model=model_class,
                    temperature=0.0,  # Use zero temperature for deterministic output
                    max_tokens=max_output_tokens,
                    top_p=1.0,
                    top_k=1,
                    response_mime_type="application/json",  # Force JSON output
                    **kwargs
                )
            else:
                raise

        logger.info(f"Successfully generated content asynchronously with model {model_class.__name__}")
        return response
