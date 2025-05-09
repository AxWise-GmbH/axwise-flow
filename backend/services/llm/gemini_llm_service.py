"""
Gemini LLM service implementation.
"""

import logging
import json
from typing import Dict, Any, List, Optional
from domain.interfaces.llm_service import ILLMService
from backend.services.llm.base_llm_service import BaseLLMService
from backend.services.llm.gemini_service import GeminiService
from backend.services.llm.exceptions import LLMResponseParseError

logger = logging.getLogger(__name__)


class GeminiLLMService(BaseLLMService, ILLMService):
    """
    Gemini LLM service implementation.

    This class implements the ILLMService interface using the Gemini API.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Gemini LLM service.

        Args:
            config: Configuration for the service
        """
        super().__init__(config)
        self.service = GeminiService(config)
        logger.info("Initialized GeminiLLMService")

    # --- Implementation of BaseLLMService abstract methods ---

    def _get_system_message(self, task: str, request: Dict[str, Any]) -> Any:
        """
        System message generation is handled by GeminiService prompts based on task.
        This method returns None as BaseLLMService's _call_llm_api will use the 'request' directly.
        """
        # The actual prompt/system message for GeminiService is determined by the 'task'
        # and other data within the 'request' dict itself, handled by GeminiService.analyze
        # or its underlying prompt generation logic.
        logger.debug(f"[{self.__class__.__name__}] _get_system_message called for task: {task}. Returning None.")
        return None # Or an empty string, depending on how _call_llm_api expects it if not used.

    async def _call_llm_api(self, system_message: Any, text: str, task: str, request: Dict[str, Any]) -> Any:
        """
        Call the underlying GeminiService.analyze method.
        The 'system_message' and 'text' from BaseLLMService.analyze are ignored here
        as self.service.analyze (GeminiService.analyze) expects all necessary info in the 'request' dict.
        """
        logger.debug(f"[{self.__class__.__name__}] _call_llm_api called for task: {task}. Delegating to self.service.analyze.")
        # The 'request' dictionary already contains the 'task', 'text' (if needed directly by GeminiService),
        # and any other parameters GeminiService.analyze expects.
        return await self.service.analyze(request) # GeminiService.analyze is already robust

    def _parse_llm_response(self, response: Any, task: str) -> Dict[str, Any]:
        """
        Parse the response from self.service.analyze (GeminiService.analyze).
        Ensures the return type is Dict[str, Any] as expected by BaseLLMService.
        """
        logger.debug(f"[{self.__class__.__name__}] _parse_llm_response received for task {task}. Type: {type(response)}")
        if isinstance(response, str):
            # If GeminiService returned a raw string, try to parse it as JSON.
            # Use the base class's _parse_llm_json_response which includes repair logic.
            parsed_dict = super()._parse_llm_json_response(response, context=f"{self.__class__.__name__}._parse_llm_response for task {task}")
            if not parsed_dict and task == "transcript_structuring": # Ensure specific error structure if parsing completely fails
                 return {"segments": [], "error": "Failed to parse LLM string response after repair.", "type": "structured_transcript"}
            elif not parsed_dict:
                return {"error": "Failed to parse LLM string response after repair."}
            return parsed_dict
        elif isinstance(response, list):
            # For transcript_structuring, GeminiService.analyze is expected to return a list.
            # BaseLLMService.analyze pipeline expects a Dict, so we wrap it.
            if task == "transcript_structuring":
                logger.debug(f"Task is {task}, wrapping list response into dict with 'segments' key.")
                return {"segments": response}
            else:
                # For other tasks, if a list is returned unexpectedly, wrap it generically.
                logger.warning(f"Task {task} received a list, wrapping with 'data' key.")
                return {"data": response}
        elif isinstance(response, dict):
            # If GeminiService already returned a dict (e.g., an error dict or a pre-formatted result for other tasks)
            return response
        else:
            logger.error(f"Unexpected response type from self.service.analyze for task {task}: {type(response)}")
            raise LLMResponseParseError(f"Unexpected response type from LLM for task {task}: {type(response)}")

    def _post_process_results(self, result: Dict[str, Any], task: str) -> Dict[str, Any]:
        """
        Post-process results. For now, it's a pass-through.
        """
        logger.debug(f"[{self.__class__.__name__}] _post_process_results for task {task}. Returning as is.")
        # Specific post-processing can be added here if needed for GeminiLLMService
        return result

    # --- End of BaseLLMService abstract method implementations ---

    async def generate_text(self, prompt: str, **kwargs) -> str:
        """
        Generate text based on a prompt.

        Args:
            prompt: The prompt to generate text from
            **kwargs: Additional parameters for the LLM service

        Returns:
            The generated text
        """
        result = await self.service.analyze({
            "task": "text_generation",
            "text": prompt
        })

        if isinstance(result, dict) and "text" in result:
            return result["text"]
        elif isinstance(result, str):
            return result
        else:
            return str(result)

    async def analyze_themes(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze themes in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters for the LLM service

        Returns:
            Dictionary containing theme analysis results
        """
        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Determine if we should use enhanced theme analysis
        use_enhanced = kwargs.get("use_enhanced", True)

        # Extract industry if provided
        industry = kwargs.get("industry")

        # Call the appropriate method based on the enhanced flag
        if use_enhanced:
            task = "theme_analysis_enhanced"
        else:
            task = "theme_analysis"

        # Prepare request data
        request_data = {
            "task": task,
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for theme analysis: {industry}")

        # Call the Gemini service
        result = await self.service.analyze(request_data)

        # Add the industry to the result if provided
        if industry:
            result["industry"] = industry

        return result

    async def analyze_patterns(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze patterns in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters for the LLM service

        Returns:
            Dictionary containing pattern analysis results
        """
        # Extract industry if provided
        industry = kwargs.get("industry")

        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Prepare request data
        request_data = {
            "task": "pattern_recognition",
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for pattern recognition: {industry}")

        # Call the Gemini service
        result = await self.service.analyze(request_data)

        # Add the industry to the result if provided
        if industry:
            result["industry"] = industry

        return result

    async def analyze_sentiment(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze sentiment in interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters for the LLM service including industry

        Returns:
            Dictionary containing sentiment analysis results
        """
        try:
            # Extract industry if provided
            industry = kwargs.get("industry")

            # Format the interview data for analysis
            interview_text = self._format_interview_text(interviews)

            # Prepare request data
            request_data = {
                "task": "sentiment_analysis",
                "text": interview_text
            }

            # Add industry if provided
            if industry:
                request_data["industry"] = industry
                logger.info(f"Using industry-specific guidance for sentiment analysis: {industry}")

            # Call the Gemini service
            result = await self.service.analyze(request_data)

            # Add the industry to the result if provided
            if industry:
                result["industry"] = industry

            return result
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {str(e)}")
            return self._get_fallback_sentiment_result(industry=kwargs.get("industry"))

    async def generate_personas(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Generate personas from interview data.

        Args:
            interviews: List of interview data
            **kwargs: Additional parameters for the LLM service

        Returns:
            Dictionary containing generated personas
        """
        # Extract industry if provided
        industry = kwargs.get("industry")

        # Format the interview data for analysis
        interview_text = self._format_interview_text(interviews)

        # Prepare request data
        request_data = {
            "task": "persona_formation",
            "text": interview_text
        }

        # Add industry if provided
        if industry:
            request_data["industry"] = industry
            logger.info(f"Using industry-specific guidance for persona formation: {industry}")

        # Call the Gemini service
        result = await self.service.analyze(request_data)

        # Add the industry to the result if provided
        if industry:
            result["industry"] = industry

        return result

    def _format_interview_text(self, interviews: List[Dict[str, Any]]) -> str:
        """
        Format interview data for analysis.

        Args:
            interviews: List of interview data

        Returns:
            Formatted interview text
        """
        interview_text = ""
        for i, interview in enumerate(interviews):
            question = interview.get("question", "")
            answer = interview.get("answer", interview.get("response", interview.get("text", "")))

            if question and answer:
                interview_text += f"Q{i+1}: {question}\nA{i+1}: {answer}\n\n"
            elif answer:
                interview_text += f"Statement {i+1}: {answer}\n\n"

        return interview_text

    def _get_fallback_sentiment_result(self, industry: Optional[str] = None) -> Dict[str, Any]:
        """
        Get fallback sentiment result.

        Args:
            industry: Optional industry context

        Returns:
            Fallback sentiment result
        """
        result = {
            "sentimentOverview": {
                "positive": 0.33,
                "neutral": 0.34,
                "negative": 0.33
            },
            "sentimentStatements": {
                "positive": [],
                "neutral": [],
                "negative": []
            },
            "fallback": True
        }

        # Add industry if provided
        if industry:
            result["industry"] = industry

        return result
