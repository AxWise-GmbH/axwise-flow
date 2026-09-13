"""
Standardized asynchronous client for Google GenAI SDK.

This module provides a standardized async implementation for the Google GenAI SDK,
with proper error handling, retry logic, and response parsing.
"""

import logging
import json
import asyncio
import re
import random
import socket
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Dict, Any, List, Union, Optional, AsyncGenerator, AsyncIterator

import google.genai as genai
from google.genai.types import GenerateContentConfig, Content

try:
    import httpx
except ImportError:  # pragma: no cover - google-genai installs httpx in production
    httpx = None  # type: ignore[assignment]

try:
    import aiohttp
except ImportError:  # pragma: no cover - the pinned SDK can use httpx only
    aiohttp = None  # type: ignore[assignment]

from backend.utils.json.json_repair import repair_json
from backend.infrastructure.constants.llm_constants import GEMINI_MODEL_NAME
from backend.services.llm.config.genai_config import GenAIConfigFactory, TaskType
from backend.services.llm.exceptions import (
    LLMAPIError,
    LLMResponseParseError,
    LLMProcessingError,
    LLMServiceError,
)

logger = logging.getLogger(__name__)

TRANSIENT_GEMINI_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})
MAX_GEMINI_ATTEMPTS = 3
MAX_RETRY_AFTER_SECONDS = 20.0
MAX_OPERATION_SECONDS = 420.0


class AsyncGenAIClient:
    """
    Standardized asynchronous client for Google GenAI SDK.

    This class provides a standardized interface for interacting with the Google GenAI SDK
    asynchronously, with proper error handling, retry logic, and response parsing.
    """

    def __init__(self, api_key: str, model: Optional[str] = GEMINI_MODEL_NAME):
        """
        Initialize the AsyncGenAIClient.

        Args:
            api_key: Google API key
            model: Model name to use (default: gemini-3.8-flash)
        """
        self.api_key = api_key
        self.default_model = model or GEMINI_MODEL_NAME

        try:
            # Initialize the client
            self.client = genai.Client(api_key=self.api_key)
            logger.info(f"Successfully initialized genai with Client() constructor")
        except Exception as e:
            logger.error(
                f"An unexpected error occurred during genai client initialization: {e}"
            )
            raise ValueError(f"Failed to initialize Gemini client: {e}") from e

    async def generate_content(
        self,
        task: Union[str, TaskType],
        prompt: Union[str, List[Union[str, Content]]],
        custom_config: Optional[Dict[str, Any]] = None,
        system_instruction: Optional[str] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
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
            config = GenAIConfigFactory.create_config(
                task,
                custom_config,
                model=self.default_model,
                system_instruction=system_instruction,
            )

            # Native system_instruction is carried by GenerateContentConfig, not
            # disguised as a user message in contents.
            final_prompt = self._prepare_prompt(prompt)

            # ``max_retries`` is retained as the public argument name for
            # compatibility but means total attempts, including the first call.
            local_max_retries = min(max(1, max_retries), MAX_GEMINI_ATTEMPTS)
            local_initial_delay = initial_delay
            local_backoff = backoff_factor

            # Generate content with retry
            response = await self._generate_with_retry(
                model=self.default_model,
                prompt=final_prompt,
                config=config,
                max_retries=local_max_retries,
                initial_delay=local_initial_delay,
                backoff_factor=local_backoff,
                task=task,
            )

            # Parse the response
            parsed_response = await self._parse_response(response, task)

            # Post-process the response based on task
            return await self._post_process_response(parsed_response, task)

        except asyncio.CancelledError:
            raise
        except (LLMAPIError, LLMResponseParseError, LLMProcessingError) as e:
            # Re-raise known LLM exceptions
            logger.error(f"Error generating content for task {task}: {str(e)}")
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(
                f"Unexpected error generating content for task {task}: {str(e)}",
                exc_info=True,
            )
            raise LLMServiceError(f"Unexpected error: {str(e)}") from e

    async def generate_content_stream(
        self,
        task: Union[str, TaskType],
        prompt: Union[str, List[Union[str, Content]]],
        custom_config: Optional[Dict[str, Any]] = None,
        system_instruction: Optional[str] = None,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
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
            config = GenAIConfigFactory.create_config(
                task,
                custom_config,
                model=self.default_model,
                system_instruction=system_instruction,
            )

            final_prompt = self._prepare_prompt(prompt)

            local_max_retries = min(max(1, max_retries), MAX_GEMINI_ATTEMPTS)
            local_initial_delay = initial_delay
            local_backoff = backoff_factor

            # Generate content stream with retry
            stream, operation_deadline = await self._generate_stream_with_retry(
                model=self.default_model,
                prompt=final_prompt,
                config=config,
                max_retries=local_max_retries,
                initial_delay=local_initial_delay,
                backoff_factor=local_backoff,
                task=task,
            )

            # ``generate_content_stream`` returns an async iterator. Bounding only
            # that coroutine leaves every subsequent ``__anext__`` able to hang
            # forever, so keep the same absolute deadline while consuming chunks.
            iterator = stream.__aiter__()
            try:
                while True:
                    remaining = (
                        operation_deadline - asyncio.get_running_loop().time()
                    )
                    if remaining <= 0:
                        raise LLMAPIError(
                            "Gemini stream exceeded its bounded operation deadline",
                            status_code=408,
                        )
                    try:
                        chunk = await asyncio.wait_for(
                            iterator.__anext__(), timeout=remaining
                        )
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError as e:
                        raise LLMAPIError(
                            "Gemini stream stalled before its bounded operation "
                            "deadline",
                            status_code=408,
                        ) from e

                    self._validate_response_completion(chunk, task)
                    try:
                        yield chunk.text
                    except Exception as e:
                        logger.error(f"Error extracting text from chunk: {str(e)}")
                        yield ""
            finally:
                await self._close_async_iterator(iterator)

        except asyncio.CancelledError:
            raise
        except (LLMAPIError, LLMResponseParseError, LLMProcessingError) as e:
            # Re-raise known LLM exceptions
            logger.error(f"Error generating content stream for task {task}: {str(e)}")
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(
                f"Unexpected error generating content stream for task {task}: {str(e)}",
                exc_info=True,
            )
            raise LLMServiceError(f"Unexpected error: {str(e)}") from e

    def _prepare_prompt(
        self,
        prompt: Union[str, List[Union[str, Content]]],
    ) -> List[Union[str, Content]]:
        """
        Normalize user contents for timeout calculation and the SDK call.

        Args:
            prompt: Prompt text or list of Content objects
        Returns:
            Prepared prompt
        """
        if isinstance(prompt, str):
            return [prompt]
        return list(prompt)

    @staticmethod
    def _task_expects_json(task: Union[str, TaskType]) -> bool:
        """Return whether the task contract requires a complete JSON response."""

        if isinstance(task, str):
            normalized = task.lower()
            if normalized in (
                "text_generation",
                "conversation_routine",
                "conversation_routines",
                "conversation_context_extraction",
                "conversation_suggestions",
            ):
                return False
            try:
                return TaskType(task) != TaskType.TEXT_GENERATION
            except ValueError:
                # Existing behavior treats unknown task names as structured so
                # callers do not accidentally publish unvalidated model text.
                return True
        return task != TaskType.TEXT_GENERATION

    @staticmethod
    def _finish_reason_name(reason: Any) -> Optional[str]:
        """Normalize google-genai enum and string finish reasons."""

        if reason is None:
            return None
        value = getattr(reason, "name", None) or getattr(reason, "value", None)
        normalized = str(value if value is not None else reason).strip()
        if not normalized:
            return None
        normalized = normalized.rsplit(".", 1)[-1].upper()
        # Streaming chunks may carry the SDK's explicit sentinel until the
        # final chunk. It does not mean the response was stopped unsuccessfully.
        if normalized == "FINISH_REASON_UNSPECIFIED":
            return None
        return normalized

    @classmethod
    def _response_finish_reasons(cls, response: Any) -> List[str]:
        reasons: List[str] = []
        for candidate in getattr(response, "candidates", None) or []:
            reason = cls._finish_reason_name(
                getattr(candidate, "finish_reason", None)
            )
            if reason:
                reasons.append(reason)
        return reasons

    @classmethod
    def _validate_response_completion(
        cls, response: Any, task: Union[str, TaskType]
    ) -> None:
        """Reject truncated or explicitly incomplete output before JSON repair."""

        reasons = cls._response_finish_reasons(response)
        failures = [
            reason
            for reason in reasons
            if reason == "MAX_TOKENS"
            or (cls._task_expects_json(task) and reason != "STOP")
        ]
        if not failures:
            return

        response_text = None
        try:
            response_text = response.text
        except Exception:
            pass
        raise LLMResponseParseError(
            "Gemini response did not complete cleanly "
            f"(finish_reason={','.join(failures)}); partial output will not be "
            "repaired or published",
            response_text=response_text,
            details={"finish_reasons": reasons, "task": str(task)},
        )

    @staticmethod
    async def _close_async_iterator(iterator: AsyncIterator[Any]) -> None:
        """Best-effort stream cleanup without swallowing task cancellation."""

        close = getattr(iterator, "aclose", None)
        if not callable(close):
            return
        try:
            await close()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover - defensive SDK cleanup
            logger.warning("Failed to close Gemini stream iterator: %s", e)

    def _calculate_dynamic_timeout(
        self, prompt: List[Union[str, Content]], task: Union[str, TaskType] = None
    ) -> float:
        """
        Calculate dynamic timeout based on content size and task complexity.

        Args:
            prompt: The prompt content to analyze
            task: Task type for complexity-based timeout adjustment

        Returns:
            Timeout in seconds
        """
        # Calculate total content length
        total_length = 0
        for item in prompt:
            if isinstance(item, str):
                total_length += len(item)
            elif hasattr(item, "parts"):
                for part in item.parts:
                    if hasattr(part, "text"):
                        total_length += len(part.text)

        # Base timeout varies by task complexity
        # REDUCED TIMEOUTS: Prevent indefinite hangs while allowing complex tasks to complete
        if task == TaskType.TRANSCRIPT_STRUCTURING or task == "transcript_structuring":
            # Transcript structuring is complex but should complete within reasonable time
            base_timeout = 120.0  # 2 minutes base (reduced from 3)
            complexity_multiplier = 2.0  # 2x more time per character (reduced from 3x)
        elif task in [
            TaskType.THEME_ANALYSIS_ENHANCED,
            TaskType.PATTERN_RECOGNITION,
            "theme_analysis_enhanced",
            "pattern_recognition",
        ]:
            # Complex analysis tasks need more time
            base_timeout = 90.0  # 1.5 minutes base (reduced from 2.5)
            complexity_multiplier = 1.5  # 1.5x more time per character (reduced from 2x)
        elif task == TaskType.PRD_GENERATION or task == "prd_generation":
            # PRD generation produces very long structured outputs
            base_timeout = 180.0  # 3 minutes base (reduced from 5)
            complexity_multiplier = 2.0  # (reduced from 3x)
        else:
            # Standard tasks (questionnaire generation, etc.)
            base_timeout = 60.0  # 1 minute base (reduced from 2)
            complexity_multiplier = 1.0  # Standard time per character

        # Add extra time for large content with task-specific multiplier
        if total_length > 50000:  # 50K characters
            extra_timeout = (total_length - 50000) / 1000.0 * complexity_multiplier
            # Cap at maximum 10 minutes for very complex tasks (reduced from 15-20 minutes)
            # This prevents indefinite hangs while still allowing large analysis to complete
            max_timeout = (
                600.0
                if task == TaskType.TRANSCRIPT_STRUCTURING
                or task == "transcript_structuring"
                else 480.0  # 8 minutes for other complex tasks
            )
            extra_timeout = min(extra_timeout, max_timeout - base_timeout)
            base_timeout += extra_timeout
            logger.info(
                f"Large content detected ({total_length} chars), task: {task}, using {base_timeout:.1f}s timeout"
            )

        return base_timeout

    @staticmethod
    def _status_code(error: BaseException) -> Optional[int]:
        """Extract an HTTP status from google-genai and HTTP client errors."""

        candidates = (
            getattr(error, "status_code", None),
            getattr(error, "code", None),
            getattr(getattr(error, "response", None), "status_code", None),
        )
        for candidate in candidates:
            try:
                if candidate is not None:
                    return int(candidate)
            except (TypeError, ValueError):
                continue
        return None

    @staticmethod
    def _parse_retry_after(value: Any) -> Optional[float]:
        """Parse Retry-After seconds or an HTTP date into a non-negative delay."""

        if value is None:
            return None
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            pass

        try:
            retry_at = parsedate_to_datetime(str(value))
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None

    @classmethod
    def _retry_after_seconds(cls, error: BaseException) -> Optional[float]:
        """Read Retry-After when the SDK exposes response headers or details."""

        response = getattr(error, "response", None)
        headers = getattr(response, "headers", None)
        if headers is not None and hasattr(headers, "get"):
            parsed = cls._parse_retry_after(
                headers.get("Retry-After") or headers.get("retry-after")
            )
            if parsed is not None:
                return parsed

        details = getattr(error, "details", None)
        if isinstance(details, dict):
            for key in ("retry_after", "retryAfter", "retry_delay", "retryDelay"):
                if key in details:
                    value = details[key]
                    if isinstance(value, str) and value.endswith("s"):
                        value = value[:-1]
                    parsed = cls._parse_retry_after(value)
                    if parsed is not None:
                        return parsed
        return None

    @classmethod
    def _is_transient_error(cls, error: BaseException) -> bool:
        status_code = cls._status_code(error)
        if status_code in TRANSIENT_GEMINI_STATUS_CODES:
            return True

        transport_errors: tuple[type[BaseException], ...] = (
            ConnectionError,
            socket.timeout,
            socket.gaierror,
        )
        if httpx is not None:
            transport_errors += (httpx.TransportError,)
        if aiohttp is not None:
            transport_errors += (aiohttp.ClientConnectionError,)

        # The SDK or a wrapper may retain the underlying transport error as the
        # cause/context. Walk only that bounded exception chain; never infer
        # retryability from arbitrary error-message text.
        current: Optional[BaseException] = error
        seen: set[int] = set()
        while current is not None and id(current) not in seen:
            seen.add(id(current))
            if isinstance(current, transport_errors):
                return True
            current = current.__cause__ or current.__context__
        return False

    @classmethod
    def _transient_sleep_seconds(cls, error: BaseException, delay: float) -> float:
        jitter = min(1.0, delay * 0.1) * random.random()
        retry_after = min(
            cls._retry_after_seconds(error) or 0.0, MAX_RETRY_AFTER_SECONDS
        )
        return max(delay + jitter, retry_after)

    async def _generate_with_retry(
        self,
        model: str,
        prompt: List[Union[str, Content]],
        config: GenerateContentConfig,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
        task: Union[str, TaskType] = None,
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

        # Calculate dynamic timeout based on content size and task complexity
        timeout_seconds = self._calculate_dynamic_timeout(prompt, task)
        operation_deadline = asyncio.get_running_loop().time() + MAX_OPERATION_SECONDS

        for attempt in range(max_retries):
            remaining = operation_deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise LLMAPIError("Gemini operation exceeded its bounded deadline")
            try:
                # Make the API call with dynamic timeout
                response = await asyncio.wait_for(
                    self.client.aio.models.generate_content(
                        model=model, contents=prompt, config=config
                    ),
                    timeout=min(timeout_seconds, remaining),
                )
                return response
            except asyncio.CancelledError:
                raise
            except asyncio.TimeoutError as e:
                last_exception = e
                if attempt < max_retries - 1:
                    # Log the timeout and retry
                    logger.warning(
                        f"API call timed out (attempt {attempt + 1}/{max_retries}): {str(e)}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(min(delay, max(0.0, operation_deadline - asyncio.get_running_loop().time())))
                    delay *= backoff_factor
                else:
                    # Last attempt failed, raise the exception
                    logger.error(
                        f"API call timed out after {max_retries} attempts: {str(e)}"
                    )
                    raise LLMAPIError(
                        f"API call timed out after {max_retries} attempts: {str(e)}"
                    ) from e
            except Exception as e:
                last_exception = e
                status_code = self._status_code(e)
                if not self._is_transient_error(e):
                    raise LLMAPIError(
                        f"Non-retryable Gemini API error: {str(e)}",
                        status_code=status_code,
                    ) from e
                if attempt >= max_retries - 1:
                    raise LLMAPIError(
                        f"Transient Gemini API error after {max_retries} attempts: {str(e)}",
                        status_code=status_code,
                    ) from e

                sleep_seconds = self._transient_sleep_seconds(e, delay)
                logger.warning(
                    "Transient Gemini API status %s (attempt %s/%s); retrying "
                    "the same model '%s' in %.2fs",
                    status_code,
                    attempt + 1,
                    max_retries,
                    model,
                    sleep_seconds,
                )
                await asyncio.sleep(
                    min(
                        sleep_seconds,
                        max(0.0, operation_deadline - asyncio.get_running_loop().time()),
                    )
                )
                delay *= backoff_factor

        # This should never happen, but just in case
        raise LLMAPIError(f"API call failed: {str(last_exception)}")

    async def _generate_stream_with_retry(
        self,
        model: str,
        prompt: List[Union[str, Content]],
        config: GenerateContentConfig,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        backoff_factor: float = 2.0,
        task: Union[str, TaskType] = None,
    ) -> tuple[AsyncIterator[Any], float]:
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
            Async iterator for the content stream and its absolute deadline
        """
        delay = initial_delay
        last_exception = None

        # Calculate dynamic timeout based on content size and task complexity
        timeout_seconds = self._calculate_dynamic_timeout(prompt, task)
        operation_deadline = asyncio.get_running_loop().time() + MAX_OPERATION_SECONDS

        for attempt in range(max_retries):
            remaining = operation_deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise LLMAPIError("Gemini stream operation exceeded its bounded deadline")
            try:
                # Make the API call with dynamic timeout
                stream = await asyncio.wait_for(
                    self.client.aio.models.generate_content_stream(
                        model=model, contents=prompt, config=config
                    ),
                    timeout=min(timeout_seconds, remaining),
                )
                return stream, operation_deadline
            except asyncio.CancelledError:
                raise
            except asyncio.TimeoutError as e:
                last_exception = e
                if attempt < max_retries - 1:
                    # Log the timeout and retry
                    logger.warning(
                        f"API stream call timed out (attempt {attempt + 1}/{max_retries}): {str(e)}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(
                        min(
                            delay,
                            max(0.0, operation_deadline - asyncio.get_running_loop().time()),
                        )
                    )
                    delay *= backoff_factor
                else:
                    # Last attempt failed, raise the exception
                    logger.error(
                        f"API stream call timed out after {max_retries} attempts: {str(e)}"
                    )
                    raise LLMAPIError(
                        f"API stream call timed out after {max_retries} attempts: {str(e)}"
                    ) from e
            except Exception as e:
                last_exception = e
                status_code = self._status_code(e)
                if not self._is_transient_error(e):
                    raise LLMAPIError(
                        f"Non-retryable Gemini stream API error: {str(e)}",
                        status_code=status_code,
                    ) from e
                if attempt >= max_retries - 1:
                    raise LLMAPIError(
                        "Transient Gemini stream API error after "
                        f"{max_retries} attempts: {str(e)}",
                        status_code=status_code,
                    ) from e

                sleep_seconds = self._transient_sleep_seconds(e, delay)
                logger.warning(
                    "Transient Gemini stream API status %s (attempt %s/%s); "
                    "retrying the same model '%s' in %.2fs",
                    status_code,
                    attempt + 1,
                    max_retries,
                    model,
                    sleep_seconds,
                )
                await asyncio.sleep(
                    min(
                        sleep_seconds,
                        max(0.0, operation_deadline - asyncio.get_running_loop().time()),
                    )
                )
                delay *= backoff_factor

        # This should never happen, but just in case
        raise LLMAPIError(f"API stream call failed: {str(last_exception)}")

    async def _parse_response(
        self, response: Any, task: Union[str, TaskType]
    ) -> Dict[str, Any]:
        """
        Parse the response from the API.

        Args:
            response: Raw response from the API
            task: Task type

        Returns:
            Parsed response as a dictionary
        """
        try:
            # A schema-valid object may still come from a response stopped by the
            # token ceiling. Check completion before accepting ``response.parsed``
            # or attempting the legacy JSON repair path below.
            self._validate_response_completion(response, task)

            # Check if response has parsed property (from schema validation)
            if hasattr(response, "parsed") and response.parsed is not None:
                logger.info(f"Using schema-validated parsed response for task {task}")
                # Convert to dict if it's a Pydantic model
                if hasattr(response.parsed, "dict"):
                    return response.parsed.dict()
                elif hasattr(response.parsed, "model_dump"):
                    return response.parsed.model_dump()
                else:
                    # If it's already a dict or other serializable type
                    return response.parsed

            # Debug the response structure first
            logger.info(f"Response type: {type(response)}")
            logger.info(f"Response has text: {hasattr(response, 'text')}")
            logger.info(f"Response has candidates: {hasattr(response, 'candidates')}")

            # Check for safety filters or other blocking
            if hasattr(response, "candidates") and response.candidates:
                for i, candidate in enumerate(response.candidates):
                    logger.info(
                        f"Candidate {i}: finish_reason={getattr(candidate, 'finish_reason', 'unknown')}"
                    )
                    if hasattr(candidate, "safety_ratings"):
                        logger.info(
                            f"Candidate {i} safety ratings: {candidate.safety_ratings}"
                        )

            # Check if response was blocked
            if hasattr(response, "prompt_feedback"):
                logger.info(f"Prompt feedback: {response.prompt_feedback}")

            # Extract text from response
            text_response = None
            try:
                text_response = response.text
                logger.info(
                    "Successfully extracted response text for task %s (length=%d)",
                    task,
                    len(text_response) if text_response else 0,
                )
            except Exception as e:
                logger.warning(f"Could not get response.text: {e}")
                logger.warning(
                    f"Exception type: {type(e)}, Exception details: {str(e)}"
                )

            # If text_response is None or empty, try alternative methods
            if not text_response:
                logger.warning(
                    f"response.text returned None or empty, trying alternative extraction methods..."
                )
                try:
                    # Method 1: Try candidates
                    if hasattr(response, "candidates") and response.candidates:
                        logger.info(f"Found {len(response.candidates)} candidates")
                        candidate = response.candidates[0]
                        logger.info(f"Candidate type: {type(candidate)}")
                        logger.info(f"Candidate attributes: {dir(candidate)}")

                        if hasattr(candidate, "content") and candidate.content:
                            logger.info(
                                f"Candidate content type: {type(candidate.content)}"
                            )
                            logger.info(
                                f"Candidate content attributes: {dir(candidate.content)}"
                            )

                            if (
                                hasattr(candidate.content, "parts")
                                and candidate.content.parts
                            ):
                                logger.info(
                                    f"Found {len(candidate.content.parts)} parts"
                                )
                                part = candidate.content.parts[0]
                                logger.info(f"Part type: {type(part)}")
                                logger.info(f"Part attributes: {dir(part)}")

                                # Prefer JSON-bearing fields before .text
                                extracted = None
                                try:
                                    # Some SDK variants return inline_data for JSON parts
                                    inline = getattr(part, "inline_data", None)
                                    if inline is not None:
                                        # Try common attributes in order
                                        for attr in ("data", "value", "content"):
                                            val = getattr(inline, attr, None)
                                            if val:
                                                try:
                                                    extracted = (
                                                        val.decode("utf-8")
                                                        if hasattr(val, "decode")
                                                        else str(val)
                                                    )
                                                    break
                                                except Exception:
                                                    extracted = str(val)
                                                    break
                                except Exception as _e:
                                    pass

                                if not extracted and hasattr(part, "text"):
                                    extracted = part.text

                                if extracted:
                                    text_response = extracted
                                    logger.info(
                                        f"Successfully extracted content from first part (len={len(text_response) if text_response else 0})"
                                    )
                                else:
                                    logger.error(
                                        "Part has neither inline_data nor text; cannot extract"
                                    )
                            else:
                                logger.error(f"Content has no parts or parts is empty")
                        else:
                            logger.error(
                                f"Candidate has no content or content is empty"
                            )
                    else:
                        logger.error(
                            f"Response has no candidates or candidates is empty"
                        )

                    # Method 2: Try to convert response to string
                    if not text_response:
                        logger.warning(f"Trying to convert response to string...")
                        text_response = str(response)
                        logger.info(
                            "Extracted response using string fallback for task %s "
                            "(length=%d)",
                            task,
                            len(text_response),
                        )

                except Exception as nested_e:
                    logger.error(
                        f"Failed to extract text using alternative methods: {str(nested_e)}"
                    )

            # Final check
            if not text_response:
                logger.error(
                    "All text extraction methods failed for task %s "
                    "(response_type=%s)",
                    task,
                    type(response).__name__,
                )
                raise LLMResponseParseError(f"Failed to extract any text from response")

            # Check if response is empty or very short
            # Special case for industry detection which can return just the industry name
            if (isinstance(task, str) and task == "industry_detection") or (
                isinstance(task, TaskType) and task == TaskType.INDUSTRY_DETECTION
            ):
                if not text_response:
                    logger.error(f"Empty response received for task '{task}'")
                    raise LLMResponseParseError(
                        f"Empty response received for task '{task}'"
                    )
            elif (
                not text_response or len(text_response.strip()) < 2
            ):  # More lenient for text generation
                logger.error(
                    "Empty or very short response received for task '%s' "
                    "(length=%d)",
                    task,
                    len(text_response or ""),
                )
                raise LLMResponseParseError(
                    f"Empty or very short response received for task '{task}'"
                )

            # Parse JSON if needed
            is_json_task = self._task_expects_json(task)
            if is_json_task:
                # Check if JSON is truncated
                if not text_response.strip().endswith(
                    "}"
                ) and not text_response.strip().endswith("]"):
                    logger.warning(
                        f"JSON response might be truncated. Attempting repair."
                    )
                    try:
                        text_response = repair_json(text_response)
                        logger.info(f"Successfully repaired JSON response.")
                    except Exception as repair_e:
                        logger.error(
                            "Failed to repair JSON for task %s: %s "
                            "(response_length=%d)",
                            task,
                            repair_e,
                            len(text_response),
                        )

                # Check if the response is wrapped in markdown code blocks
                markdown_json_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
                markdown_match = re.search(markdown_json_pattern, text_response)

                if markdown_match:
                    # Extract the JSON content from the markdown code block
                    json_content = markdown_match.group(1).strip()
                    logger.info(
                        f"Detected JSON wrapped in markdown code blocks, extracting content"
                    )
                    text_response = json_content
                    # Log the task type for debugging
                    logger.info(f"Task type for markdown-wrapped JSON: {task}")

                # Parse JSON
                try:
                    parsed_response = json.loads(text_response)
                    logger.info(
                        f"Successfully parsed JSON response. Keys: {list(parsed_response.keys()) if isinstance(parsed_response, dict) else 'array with ' + str(len(parsed_response)) + ' items'}"
                    )
                    return parsed_response
                except json.JSONDecodeError as e:
                    logger.error(
                        "Failed to decode JSON response for task %s: %s "
                        "(response_length=%d)",
                        task,
                        e,
                        len(text_response),
                    )

                    # Try repair again
                    try:
                        repaired = repair_json(text_response)
                        result = json.loads(repaired)
                        logger.info(f"Successfully parsed JSON after repair.")
                        return result
                    except Exception as e2:
                        logger.error(f"Failed to parse JSON even after repair: {e2}")
                        # For PRD generation, fall back to returning raw text so callers can extract
                        try:
                            is_prd = (task == TaskType.PRD_GENERATION) or (
                                isinstance(task, str) and str(task) == "prd_generation"
                            )
                        except Exception:
                            is_prd = False
                        if is_prd:
                            logger.warning(
                                "Falling back to raw text for prd_generation after JSON parse failure"
                            )
                            return {"text": text_response}
                        # Conversational routines and generic text-generation tasks should not hard-fail on JSON parsing
                        try:
                            task_name = (
                                task.value if isinstance(task, TaskType) else str(task)
                            )
                        except Exception:
                            task_name = str(task)
                        if str(task_name).lower() in (
                            "text_generation",
                            "conversation_routine",
                            "conversation_routines",
                            "conversation_context_extraction",
                            "conversation_suggestions",
                        ):
                            logger.warning(
                                "Falling back to raw text for conversational routine/text_generation after JSON parse failure"
                            )
                            return {"text": text_response}
                        raise LLMResponseParseError(
                            f"Failed to parse JSON response: {str(e)} -> {str(e2)}"
                        )
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

    async def _post_process_response(
        self, result: Dict[str, Any], task: Union[str, TaskType]
    ) -> Dict[str, Any]:
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
                logger.warning(
                    f"Unknown task type: {task}, skipping task-specific post-processing"
                )
                return result

        # Task-specific post-processing
        if task == TaskType.PATTERN_RECOGNITION:
            return await self._post_process_pattern_recognition(result)
        elif (
            task == TaskType.THEME_ANALYSIS or task == TaskType.THEME_ANALYSIS_ENHANCED
        ):
            return await self._post_process_theme_analysis(result)
        else:
            # No specific post-processing for other tasks
            return result

    async def _post_process_pattern_recognition(
        self, result: Dict[str, Any]
    ) -> Dict[str, Any]:
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
                pattern["suggested_actions"] = ["Consider further investigation"]

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

        return result

    async def _post_process_theme_analysis(
        self, result: Dict[str, Any]
    ) -> Dict[str, Any]:
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
