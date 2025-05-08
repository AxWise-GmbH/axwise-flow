"""
Prompt templates for Gemini LLM service.
"""

from typing import Dict, Any, List, Optional

from backend.services.llm.prompts.tasks.theme_analysis import ThemeAnalysisPrompts
from backend.services.llm.prompts.tasks.pattern_recognition import PatternRecognitionPrompts
from backend.services.llm.prompts.tasks.sentiment_analysis import SentimentAnalysisPrompts
from backend.services.llm.prompts.tasks.insight_generation import InsightGenerationPrompts
from backend.services.llm.prompts.tasks.theme_analysis_enhanced import ThemeAnalysisEnhancedPrompts
from backend.services.llm.prompts.tasks.persona_formation import PersonaFormationPrompts

class GeminiPrompts:
    """
    Prompt templates for Gemini LLM service.
    """

    @staticmethod
    def get_system_message(task: str, request: Dict[str, Any]) -> str:
        """
        Get system message for Gemini based on task.

        Args:
            task: Task type
            request: Request dictionary

        Returns:
            System message string
        """
        if task == "theme_analysis":
            return ThemeAnalysisPrompts.get_prompt(request)
        elif task == "pattern_recognition":
            return PatternRecognitionPrompts.get_prompt(request)
        elif task == "sentiment_analysis":
            return SentimentAnalysisPrompts.get_prompt(request)
        elif task == "insight_generation":
            return InsightGenerationPrompts.get_prompt(request)
        elif task == "theme_analysis_enhanced":
            return ThemeAnalysisEnhancedPrompts.get_prompt(request)
        elif task == "persona_formation":
            return PersonaFormationPrompts.get_prompt(request)
        else:
            return "Analyze the following text."


