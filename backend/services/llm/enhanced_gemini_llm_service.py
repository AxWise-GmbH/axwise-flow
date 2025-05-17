"""
Enhanced Gemini LLM Service using the standardized AsyncGenAIClient.

This module provides an enhanced implementation of the GeminiLLMService
that uses the standardized AsyncGenAIClient for improved async handling,
error management, and configuration.
"""

import logging
import os
from typing import Dict, Any, List, Optional, Union

from domain.interfaces.llm_unified import ILLMService
from backend.services.llm.base_llm_service import BaseLLMService
from backend.services.llm.async_genai_client import AsyncGenAIClient
from backend.services.llm.config.genai_config import TaskType
from backend.services.llm.exceptions import (
    LLMAPIError, LLMResponseParseError, LLMProcessingError, LLMServiceError
)
from infrastructure.constants.llm_constants import ENV_GEMINI_API_KEY

logger = logging.getLogger(__name__)

class EnhancedGeminiLLMService(BaseLLMService):
    """
    Enhanced implementation of GeminiLLMService using AsyncGenAIClient.

    This class provides an enhanced implementation of the GeminiLLMService
    that uses the standardized AsyncGenAIClient for improved async handling,
    error management, and configuration.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the EnhancedGeminiLLMService.

        Args:
            config: Configuration dictionary
        """
        super().__init__(config)

        # Get API key from config or environment
        api_key = config.get("api_key") or os.getenv(ENV_GEMINI_API_KEY)
        if not api_key:
            logger.error("Gemini API key is not configured. Set GEMINI_API_KEY environment variable or provide in config.")
            raise ValueError("Gemini API key not found.")

        # Initialize the AsyncGenAIClient
        self.client = AsyncGenAIClient(api_key=api_key, model=config.get("model"))
        logger.info(f"EnhancedGeminiLLMService initialized with AsyncGenAIClient")

    # --- Implementation of BaseLLMService abstract methods ---

    def _get_system_message(self, task: str, request: Dict[str, Any]) -> Any:
        """
        Get system message for the task.

        Args:
            task: Task type
            request: Request data

        Returns:
            System message
        """
        from backend.services.llm.prompts.gemini_prompts import GeminiPrompts
        return GeminiPrompts.get_system_message(task, request)

    async def _call_llm_api(self, system_message: Any, text: str, task: str, request: Dict[str, Any]) -> Any:
        """
        Call the LLM API using AsyncGenAIClient.

        Args:
            system_message: System message
            text: Input text
            task: Task type
            request: Request data

        Returns:
            API response
        """
        try:
            # Extract custom configuration parameters if any
            custom_config = {}
            if "temperature" in request:
                custom_config["temperature"] = request["temperature"]
            if "max_tokens" in request:
                custom_config["max_output_tokens"] = request["max_tokens"]
            if "top_p" in request:
                custom_config["top_p"] = request["top_p"]
            if "top_k" in request:
                custom_config["top_k"] = request["top_k"]

            # Call the AsyncGenAIClient
            return await self.client.generate_content(
                task=task,
                prompt=text,
                custom_config=custom_config,
                system_instruction=system_message
            )
        except (LLMAPIError, LLMResponseParseError, LLMProcessingError, LLMServiceError) as e:
            # Re-raise known LLM exceptions
            logger.error(f"Error calling LLM API for task {task}: {str(e)}")
            raise
        except Exception as e:
            # Wrap unknown exceptions
            logger.error(f"Unexpected error calling LLM API for task {task}: {str(e)}", exc_info=True)
            raise LLMServiceError(f"Unexpected error: {str(e)}") from e

    def _parse_llm_response(self, response: Any, task: str) -> Dict[str, Any]:
        """
        Parse LLM response.

        This method is a pass-through since AsyncGenAIClient already handles parsing.

        Args:
            response: API response
            task: Task type

        Returns:
            Parsed response
        """
        # AsyncGenAIClient already handles parsing, so this is a pass-through
        return response

    def _post_process_results(self, result: Dict[str, Any], task: str) -> Dict[str, Any]:
        """
        Post-process results.

        This method is a pass-through since AsyncGenAIClient already handles post-processing.

        Args:
            result: Parsed response
            task: Task type

        Returns:
            Post-processed response
        """
        # AsyncGenAIClient already handles post-processing, so this is a pass-through
        return result

    # --- Implementation of ILLMService methods ---

    async def generate_text(self, prompt: str, **kwargs) -> str:
        """
        Generate text using the LLM.

        Args:
            prompt: Input prompt
            **kwargs: Additional parameters

        Returns:
            Generated text
        """
        try:
            # Extract custom configuration parameters if any
            custom_config = {}
            if "temperature" in kwargs:
                custom_config["temperature"] = kwargs["temperature"]
            if "max_tokens" in kwargs:
                custom_config["max_output_tokens"] = kwargs["max_tokens"]
            if "top_p" in kwargs:
                custom_config["top_p"] = kwargs["top_p"]
            if "top_k" in kwargs:
                custom_config["top_k"] = kwargs["top_k"]

            # Call the AsyncGenAIClient
            response = await self.client.generate_content(
                task=TaskType.TEXT_GENERATION,
                prompt=prompt,
                custom_config=custom_config,
                system_instruction=kwargs.get("system_instruction")
            )

            # Return the text
            return response.get("text", "")
        except Exception as e:
            logger.error(f"Error generating text: {str(e)}")
            raise

    async def analyze_themes(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze themes in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters

        Returns:
            Theme analysis results
        """
        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Determine if we should use enhanced theme analysis
        use_enhanced = kwargs.get("use_enhanced", True)

        # Extract industry if provided
        industry = kwargs.get("industry")

        # Prepare request data
        request_data = {
            "task": TaskType.THEME_ANALYSIS_ENHANCED if use_enhanced else TaskType.THEME_ANALYSIS,
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for theme analysis: {industry}")

        # Call analyze method
        return await self.analyze(request_data)

    async def analyze_patterns(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze patterns in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters

        Returns:
            Pattern analysis results
        """
        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Extract industry if provided
        industry = kwargs.get("industry")

        # Prepare request data
        request_data = {
            "task": TaskType.PATTERN_RECOGNITION,
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for pattern recognition: {industry}")

        # Call analyze method
        return await self.analyze(request_data)

    async def analyze_sentiment(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze sentiment in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters

        Returns:
            Sentiment analysis results
        """
        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Extract industry if provided
        industry = kwargs.get("industry")

        # Prepare request data
        request_data = {
            "task": TaskType.SENTIMENT_ANALYSIS,
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for sentiment analysis: {industry}")

        # Call analyze method
        return await self.analyze(request_data)

    async def generate_personas(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Generate personas from interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters

        Returns:
            Persona generation results
        """
        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Extract industry if provided
        industry = kwargs.get("industry")

        # Prepare request data
        request_data = {
            "task": TaskType.PERSONA_FORMATION,
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for persona formation: {industry}")

        # Call analyze method
        return await self.analyze(request_data)

    async def analyze_persona_attributes(self, patterns: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze persona attributes from patterns.

        Args:
            patterns: Pattern data

        Returns:
            Persona attribute analysis results
        """
        # Prepare request data
        request_data = {
            "task": "persona_attribute_extraction",
            "patterns": patterns.get("patterns", [])
        }

        # Call analyze method
        return await self.analyze(request_data)

    async def process_interview(self, text: str) -> Dict[str, Any]:
        """
        Process interview text.

        Args:
            text: Interview text

        Returns:
            Processed interview data
        """
        # Prepare request data
        request_data = {
            "task": TaskType.TRANSCRIPT_STRUCTURING,
            "text": text
        }

        # Call analyze method
        return await self.analyze(request_data)
