"""
Prompt templates for Gemini LLM service.
"""

from typing import Dict, Any, Callable

from .tasks.theme_analysis import ThemeAnalysisPrompts
from .tasks.pattern_recognition import PatternRecognitionPrompts
from .tasks.sentiment_analysis import SentimentAnalysisPrompts
from .tasks.insight_generation import InsightGenerationPrompts
from .tasks.theme_analysis_enhanced import ThemeAnalysisEnhancedPrompts
from .tasks.persona_formation import PersonaFormationPrompts
from .tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts
from .tasks.transcript_structuring import TranscriptStructuringPrompts

class GeminiPrompts:
    """
    Prompt templates for Gemini LLM service.
    Dispatches to specific prompt generation classes based on task.
    """

    # Type alias for prompt generator functions
    PromptGeneratorCallable = Callable[[Dict[str, Any]], str]

    PROMPT_GENERATORS: Dict[str, PromptGeneratorCallable] = {
        "theme_analysis": ThemeAnalysisPrompts.get_prompt,
        "pattern_recognition": PatternRecognitionPrompts.get_prompt,
        "sentiment_analysis": SentimentAnalysisPrompts.get_prompt,
        "insight_generation": InsightGenerationPrompts.get_prompt,
        "theme_analysis_enhanced": ThemeAnalysisEnhancedPrompts.get_prompt,
        "persona_formation": PersonaFormationPrompts.get_prompt,
        "transcript_structuring": TranscriptStructuringPrompts.get_prompt,
    }

    DEFAULT_PROMPT = "Analyze the following text."

    @staticmethod
    def get_system_message(task: str, request: Dict[str, Any]) -> str:
        """
        Get system message for Gemini based on task using a dictionary dispatcher.

        Args:
            task: Task type
            request: Request dictionary, passed to the specific prompt generator.

        Returns:
            System message string
        """
        generator_func = GeminiPrompts.PROMPT_GENERATORS.get(task)

        if generator_func:
            return generator_func(request) # All generators now accept 'request'
        
        # Fallback if the task is not found in the dictionary
        return GeminiPrompts.DEFAULT_PROMPT
