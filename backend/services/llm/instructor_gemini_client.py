"""
Instructor-patched Gemini client for structured outputs.

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

This module provides a wrapper around the Google GenAI client that uses
Instructor to extract structured data from LLM responses.
"""

import logging
import time
import asyncio
import os
from typing import Type, TypeVar, Any, Dict, List, Optional, Union
from dataclasses import dataclass

from google import genai
import instructor
from pydantic import BaseModel, ValidationError

from infrastructure.constants.llm_constants import (
    GEMINI_MODEL_NAME,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    GEMINI_TOP_P,
    GEMINI_TOP_K,
    ENV_GEMINI_API_KEY,
)

logger = logging.getLogger(__name__)

# Type variable for generic Pydantic model
T = TypeVar("T", bound=BaseModel)


@dataclass
class GenerationMetrics:
    """Metrics for generation performance monitoring."""

    start_time: float
    end_time: float
    model_name: str
    response_model: str
    temperature: float
    tokens_used: Optional[int] = None
    retry_count: int = 0
    success: bool = True
    error_type: Optional[str] = None

    @property
    def duration_ms(self) -> int:
        """Duration in milliseconds."""
        return int((self.end_time - self.start_time) * 1000)


class EnhancedInstructorError(Exception):
    """Enhanced error for Instructor operations."""

    def __init__(
        self,
        message: str,
        error_type: str,
        retry_count: int = 0,
        original_error: Exception = None,
    ):
        super().__init__(message)
        self.error_type = error_type
        self.retry_count = retry_count
        self.original_error = original_error


class EnhancedInstructorGeminiClient:
    """
    Enhanced Instructor-patched Gemini client for structured outputs.

    This class provides an advanced wrapper around the Google GenAI client that uses
    Instructor to extract structured data from LLM responses with enhanced error handling,
    retry logic, performance monitoring, and progressive temperature adjustment.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = GEMINI_MODEL_NAME,
        max_retries: int = 3,
        enable_metrics: bool = True,
    ):
        """
        Initialize the Enhanced Instructor-patched Gemini client.

        Args:
            api_key: Optional API key (defaults to environment variable)
            model_name: Model name to use
            max_retries: Maximum number of retries for failed requests
            enable_metrics: Whether to collect performance metrics
        """
        # Get API key from environment if not provided
        if api_key is None:
            api_key = os.getenv(ENV_GEMINI_API_KEY)
            if not api_key:
                raise ValueError(
                    f"No API key provided and {ENV_GEMINI_API_KEY} environment variable not set"
                )

        # Create the Gemini client using the correct pattern for new google.genai library
        self.genai_client = genai.Client(api_key=api_key)

        # Initialize the Instructor-patched client using the correct method for new library
        self.instructor_client = instructor.from_genai(
            client=self.genai_client,
            mode=instructor.Mode.GENAI_TOOLS,  # Use GENAI_TOOLS mode as per official docs
        )

        self.model_name = model_name
        self.max_retries = max_retries
        self.enable_metrics = enable_metrics
        self.metrics_history: List[GenerationMetrics] = []

        # Retry configuration
        self.retry_strategies = [
            {
                "temperature": 0.0,
                "top_p": 1.0,
                "top_k": 1,
                "response_mime_type": "application/json",
            },
            {
                "temperature": 0.1,
                "top_p": 0.9,
                "top_k": 5,
                "response_mime_type": "application/json",
            },
            {
                "temperature": 0.2,
                "top_p": 0.8,
                "top_k": 10,
                "response_mime_type": "application/json",
            },
        ]

        logger.info(
            f"Initialized EnhancedInstructorGeminiClient with model {model_name}, max_retries={max_retries}"
        )

    def _create_metrics(
        self, model_class: Type[T], temperature: float
    ) -> GenerationMetrics:
        """Create a new metrics object."""
        return GenerationMetrics(
            start_time=time.time(),
            end_time=0.0,
            model_name=self.model_name,
            response_model=model_class.__name__,
            temperature=temperature,
        )

    def _finalize_metrics(
        self, metrics: GenerationMetrics, success: bool = True, error_type: str = None
    ) -> None:
        """Finalize metrics and add to history."""
        metrics.end_time = time.time()
        metrics.success = success
        metrics.error_type = error_type

        if self.enable_metrics:
            self.metrics_history.append(metrics)

        logger.info(
            f"Generation completed: {metrics.duration_ms}ms, success={success}, retries={metrics.retry_count}"
        )

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics."""
        if not self.metrics_history:
            return {"total_requests": 0}

        successful = [m for m in self.metrics_history if m.success]
        failed = [m for m in self.metrics_history if not m.success]

        return {
            "total_requests": len(self.metrics_history),
            "successful_requests": len(successful),
            "failed_requests": len(failed),
            "success_rate": (
                len(successful) / len(self.metrics_history)
                if self.metrics_history
                else 0
            ),
            "avg_duration_ms": (
                sum(m.duration_ms for m in successful) / len(successful)
                if successful
                else 0
            ),
            "avg_retries": sum(m.retry_count for m in self.metrics_history)
            / len(self.metrics_history),
            "error_types": {
                error_type: len([m for m in failed if m.error_type == error_type])
                for error_type in set(m.error_type for m in failed if m.error_type)
            },
        }

    def generate_with_model(
        self,
        prompt: str,
        model_class: Type[T],
        temperature: float = GEMINI_TEMPERATURE,
        max_output_tokens: int = GEMINI_MAX_TOKENS,
        top_p: float = GEMINI_TOP_P,
        top_k: int = GEMINI_TOP_K,
        system_instruction: Optional[str] = None,
        enable_retry: bool = True,
        **kwargs,
    ) -> T:
        """
        Generate content with a specific Pydantic model using enhanced retry logic.

        Args:
            prompt: The prompt to send to the model
            model_class: The Pydantic model class to parse the response into
            temperature: Temperature parameter for generation
            max_output_tokens: Maximum number of tokens to generate
            top_p: Top-p parameter for generation
            top_k: Top-k parameter for generation
            system_instruction: Optional system instruction
            enable_retry: Whether to enable retry logic
            **kwargs: Additional arguments to pass to the client

        Returns:
            Parsed response as an instance of the specified model class
        """
        metrics = self._create_metrics(model_class, temperature)

        logger.info(
            f"Generating content with model {self.model_name} and response model {model_class.__name__}"
        )

        # Prepare messages for google.genai format
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        # Base parameters for google.genai
        base_params = {
            "model": self.model_name,
            "messages": messages,
            "response_model": model_class,
            "config": {
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
                "top_p": top_p,
                "top_k": top_k,
                "response_mime_type": "application/json",
            },
            **kwargs,
        }

        last_error = None

        # Try initial generation
        try:
            response = self.instructor_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                response_model=model_class,
                **kwargs,
            )
            self._finalize_metrics(metrics, success=True)
            logger.info(
                f"Successfully generated content with model {model_class.__name__}"
            )
            return response

        except Exception as e:
            last_error = e
            logger.warning(f"Initial generation failed: {str(e)}")

            if not enable_retry:
                self._finalize_metrics(
                    metrics, success=False, error_type=type(e).__name__
                )
                raise EnhancedInstructorError(
                    f"Generation failed: {str(e)}",
                    error_type=type(e).__name__,
                    original_error=e,
                )

        # Enhanced retry logic with progressive parameter adjustment
        for retry_count in range(self.max_retries):
            metrics.retry_count = retry_count + 1
            strategy = self.retry_strategies[
                min(retry_count, len(self.retry_strategies) - 1)
            ]

            logger.info(
                f"Retry {retry_count + 1}/{self.max_retries} with strategy: {strategy}"
            )

            # Update parameters with retry strategy
            retry_params = base_params.copy()
            retry_params.update(strategy)

            try:
                response = self.instructor_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    response_model=model_class,
                    **kwargs,
                )
                self._finalize_metrics(metrics, success=True)
                logger.info(
                    f"Successfully generated content on retry {retry_count + 1}"
                )
                return response

            except Exception as e:
                last_error = e
                logger.warning(f"Retry {retry_count + 1} failed: {str(e)}")

                # Add delay between retries
                if retry_count < self.max_retries - 1:
                    time.sleep(0.5 * (retry_count + 1))  # Progressive delay

        # All retries failed
        self._finalize_metrics(
            metrics, success=False, error_type=type(last_error).__name__
        )
        raise EnhancedInstructorError(
            f"Generation failed after {self.max_retries} retries. Last error: {str(last_error)}",
            error_type=type(last_error).__name__,
            retry_count=self.max_retries,
            original_error=last_error,
        )

    async def generate_with_model_async(
        self,
        prompt: str,
        model_class: Type[T],
        temperature: float = GEMINI_TEMPERATURE,
        max_output_tokens: int = GEMINI_MAX_TOKENS,
        top_p: float = GEMINI_TOP_P,
        top_k: int = GEMINI_TOP_K,
        system_instruction: Optional[str] = None,
        **kwargs,
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
        logger.info(
            f"Generating content asynchronously with model {self.model_name} and response model {model_class.__name__}"
        )

        # Prepare messages for google.genai format
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        # Generate content using correct Instructor API for Gemini
        try:
            # Use the correct Instructor API for Gemini
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.instructor_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    response_model=model_class,
                    **kwargs,
                ),
            )
        except Exception as e:
            logger.error(
                f"Error generating content asynchronously with Instructor: {str(e)}"
            )
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Model class: {model_class.__name__}")
            logger.error(f"Prompt length: {len(prompt)}")
            if hasattr(e, "__dict__"):
                logger.error(f"Error details: {e.__dict__}")

            # Add specific handling for validation errors
            if "validation" in str(e).lower() or "pydantic" in str(e).lower():
                logger.warning(
                    "Pydantic validation error detected. This suggests the LLM response doesn't match the expected schema."
                )
                logger.error(f"Expected schema: {model_class.__name__}")

            raise

        logger.info(
            f"Successfully generated content asynchronously with model {model_class.__name__}"
        )
        return response


# Backward compatibility alias
InstructorGeminiClient = EnhancedInstructorGeminiClient
