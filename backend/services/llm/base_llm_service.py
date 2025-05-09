"""
Base class for LLM services with common functionality.
"""

import logging
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Union

from domain.interfaces.llm_unified import ILLMService, LLMError, RateLimitError, TokenLimitError, APIError
from backend.services.llm.exceptions import LLMAPIError, LLMResponseParseError, LLMServiceError
from backend.utils.json.json_repair import repair_json

logger = logging.getLogger(__name__)

class BaseLLMService(ABC):
    """
    Base class for LLM services with common functionality.
    
    This class implements common methods for LLM services and defines
    abstract methods that must be implemented by subclasses.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the LLM service with configuration.
        
        Args:
            config: Configuration dictionary for the LLM service
        """
        self.config = config
        self.temperature = config.get("temperature", 0.0)
        self.max_tokens = config.get("max_tokens", 2000)
        self.model = config.get("model", "")
        
        logger.info(f"Initialized {self.__class__.__name__} with model: {self.model}")
    
    async def analyze(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze content using LLM.
        
        Args:
            request: Dictionary containing task and text
            
        Returns:
            Analysis results
        """
        task = request.get("task", "unknown_task")
        text = request.get("text", "")

        try:
            system_message = self._get_system_message(task, request)
            response = await self._call_llm_api(system_message, text, task, request)

            result = self._parse_llm_response(response, task)
            
            return self._post_process_results(result, task)
            
        except (LLMResponseParseError, LLMAPIError) as e:
            logger.error(f"Error in {task} analysis: {str(e)}", exc_info=True)
            return self._get_error_response(task, str(e))
        except LLMServiceError as e:
            logger.error(f"LLMServiceError in {task} analysis: {str(e)}", exc_info=True)
            return self._get_error_response(task, f"LLM Service Error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in {task} analysis: {str(e)}", exc_info=True)
            return self._get_error_response(task, f"Unexpected error: {str(e)}")
    
    def _parse_llm_json_response(self, response_text: str, context: str = "") -> Dict[str, Any]:
        try:
            result = json.loads(response_text)
            logger.debug(f"Successfully parsed JSON response for context: {context}")
            return result
        except json.JSONDecodeError as e1:
            logger.warning(f"[{context}] Direct JSON parsing failed: {e1}. Trying JSON repair...")
            
            try:
                repaired_json = repair_json(response_text)
                logger.debug(f"[{context}] Repaired JSON: {repaired_json[:200]}...")
                
                result = json.loads(repaired_json)
                logger.info(f"[{context}] Successfully parsed JSON after repair.")
                return result
            except json.JSONDecodeError as e2:
                logger.error(f"[{context}] Failed to parse JSON even after repair: {e2}")
                return {}
            except Exception as e_generic:
                logger.error(f"[{context}] Unexpected error during JSON repair: {e_generic}")
                return {}
    
    def _get_error_response(self, task: str, error_message: str) -> Dict[str, Any]:
        """
        Get appropriate error response based on task.
        
        Args:
            task: Task type
            error_message: Error message
            
        Returns:
            Error response dictionary
        """
        logger.debug(f"Generating error response for task: {task}, message: {error_message}")
        if task == "transcript_structuring":
            return {
                "segments": [],
                "error": error_message,
                "type": "structured_transcript", 
            }
        elif task == "persona_formation":
            return {"personas": [], "error": error_message}
        elif task == "theme_analysis" or task == "theme_analysis_enhanced":
            return {
                "themes": [],
                "error": error_message,
                "type": "themes"
            }
        elif task == "pattern_recognition":
            return {
                "patterns": [],
                "error": error_message,
                "type": "patterns"
            }
        elif task == "sentiment_analysis":
            return {
                "sentiment_results": [],
                "overall_sentiment": "neutral",
                "error": error_message,
                "type": "sentiment"
            }
        elif task == "insight_generation":
            return {
                "insights": [],
                "error": error_message,
                "type": "insights"
            }
        elif task == "text_generation" or task == "industry_detection": 
            return {
                "text": "",
                "error": error_message,
                "type": "text_generation"
            }
        logger.warning(f"No specific error structure for task: {task}. Returning generic error.")
        return {"error": error_message, "fallback_generic": True}
    
    @abstractmethod
    def _get_system_message(self, task: str, request: Dict[str, Any]) -> Any:
        """
        Get system message based on task.
        
        Args:
            task: Task type
            request: Request dictionary
            
        Returns:
            System message in the format required by the LLM API
        """
        pass
    
    @abstractmethod
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
        pass
    
    @abstractmethod
    def _parse_llm_response(self, response: Any, task: str) -> Dict[str, Any]:
        """
        Parse LLM response into a dictionary.
        
        Args:
            response: Raw API response
            task: Task type
            
        Returns:
            Parsed response dictionary
        """
        pass
    
    @abstractmethod
    def _post_process_results(self, result: Dict[str, Any], task: str) -> Dict[str, Any]:
        """
        Post-process results based on task.
        
        Args:
            result: Parsed result dictionary
            task: Task type
            
        Returns:
            Post-processed result dictionary
        """
        pass
    
    # Implement the remaining methods from ILLMService
    # These are placeholders that should be overridden by subclasses
    
    async def analyze_persona_attributes(self, patterns: Dict[str, Any]) -> Dict[str, Any]:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement analyze_persona_attributes")
    
    async def process_interview(self, text: str) -> Dict[str, Any]:
        """Default implementation using analyze with interview_processing task"""
        return await self.analyze({"task": "interview_processing", "text": text})
    
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement generate_text")
    
    async def analyze_themes(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement analyze_themes")
    
    async def analyze_patterns(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement analyze_patterns")
    
    async def analyze_sentiment(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement analyze_sentiment")
    
    async def generate_personas(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """Placeholder implementation - override in subclasses"""
        raise NotImplementedError("Subclasses must implement generate_personas")
