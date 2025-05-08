"""
Prompt templates for LLM services.
"""

from backend.services.llm.prompts.gemini_prompts import GeminiPrompts
from backend.services.llm.prompts.openai_prompts import OpenAIPrompts
from backend.services.llm.prompts.original_gemini_prompts import OriginalGeminiPrompts
from backend.services.llm.prompts.original_gemini_prompts_part2 import OriginalGeminiPromptsPart2

__all__ = ["GeminiPrompts", "OpenAIPrompts", "OriginalGeminiPrompts", "OriginalGeminiPromptsPart2"]
