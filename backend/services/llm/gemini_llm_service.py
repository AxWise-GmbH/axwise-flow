"""
Gemini LLM service implementation.
"""

import logging
import json
from typing import Dict, Any, List, Optional
from domain.interfaces.llm_service import ILLMService
from backend.services.llm.base_llm_service import BaseLLMService
from backend.services.llm.gemini_service import GeminiService

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

    # Implement abstract methods from BaseLLMService

    def _get_system_message(self, task: str, request: Dict[str, Any]) -> Any:
        """
        Get system message based on task.

        Args:
            task: Task type
            request: Request dictionary

        Returns:
            System message in the format required by the LLM API
        """
        # Use the GeminiService's _get_system_message method
        return self.service._get_system_message(task, request)

    async def _call_llm_api(self, system_message: Any, text: str, task: str, request: Dict[str, Any]) -> Any:
        """
        Call LLM API with the given system message and text.

        Args:
            system_message: System message
            text: Input text
            task: Task type
            request: Original request dictionary

        Returns:
            Raw API response
        """
        # Prepare request data for the GeminiService
        request_data = {
            "task": task,
            "text": text
        }

        # Add any additional parameters from the request
        for key, value in request.items():
            if key not in ["task", "text"]:
                request_data[key] = value

        # Call the GeminiService's analyze method
        return await self.service.analyze(request_data)

    def _parse_llm_response(self, response: Any, task: str) -> Dict[str, Any]:
        """
        Parse LLM response into a dictionary.

        Args:
            response: Raw API response
            task: Task type

        Returns:
            Parsed response dictionary
        """
        # The GeminiService's analyze method already returns a parsed dictionary
        if isinstance(response, dict):
            return response
        elif isinstance(response, str):
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                return {"text": response}
        else:
            return {"error": "Unexpected response format"}

    def _post_process_results(self, result: Dict[str, Any], task: str) -> Dict[str, Any]:
        """
        Post-process results based on task.

        Args:
            result: Parsed result dictionary
            task: Task type

        Returns:
            Post-processed result dictionary
        """
        # The GeminiService's analyze method already post-processes the results
        return result
