"""
Examples of using the prompt template system.

This package contains example implementations of the prompt template system
for different types of prompts used in the application.
"""

from backend.services.llm.prompts.examples.template_example import (
    get_pattern_recognition_prompt,
    get_insight_generation_prompt
)

__all__ = [
    'get_pattern_recognition_prompt',
    'get_insight_generation_prompt'
]
