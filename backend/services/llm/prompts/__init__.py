"""
Prompt templates for LLM services.
"""

from backend.services.llm.prompts.gemini_prompts import GeminiPrompts
from backend.services.llm.prompts.openai_prompts import OpenAIPrompts

# Import new prompt modules
from backend.services.llm.prompts.tasks.transcript_structuring import TranscriptStructuringPrompts
from backend.services.llm.prompts.tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts

__all__ = ["GeminiPrompts", "OpenAIPrompts", "TranscriptStructuringPrompts", "SimplifiedPersonaFormationPrompts"]
