"""
Constants for LLM configuration.




This module defines constants for LLM configuration to ensure consistency
across the application. These constants are used as defaults in settings.py
and should be referenced by all services that need LLM parameters.
"""

# Gemini model constants
# Updated to use stable gemini-2.5-flash model instead of preview version
GEMINI_MODEL_NAME = "models/gemini-2.5-flash"
GEMINI_TEMPERATURE = 0.0
GEMINI_MAX_TOKENS = 65536
GEMINI_CONTEXT_WINDOW = 1048576
GEMINI_TOP_P = 0.95
GEMINI_TOP_K = 1

# OpenAI model constants
OPENAI_MODEL_NAME = "gpt-4o-2024-08-06"
OPENAI_TEMPERATURE = 0.0
OPENAI_MAX_TOKENS = 16384
OPENAI_CONTEXT_WINDOW = 128000

# Common constants
DEFAULT_TEMPERATURE = 0.0  # Default temperature for all models
DEFAULT_TOP_P = 0.95  # Default top_p for all models
DEFAULT_TOP_K = 1  # Default top_k for all models

# Environment variable names
ENV_GEMINI_API_KEY = "GEMINI_API_KEY"
ENV_GEMINI_MODEL = "GEMINI_MODEL"
ENV_GEMINI_TEMPERATURE = "GEMINI_TEMPERATURE"
ENV_GEMINI_MAX_TOKENS = "GEMINI_MAX_TOKENS"
ENV_GEMINI_CONTEXT_WINDOW = "GEMINI_CONTEXT_WINDOW"
ENV_GEMINI_TOP_P = "GEMINI_TOP_P"
ENV_GEMINI_TOP_K = "GEMINI_TOP_K"

ENV_OPENAI_API_KEY = "OPENAI_API_KEY"
ENV_OPENAI_MODEL = "OPENAI_MODEL"
ENV_OPENAI_TEMPERATURE = "OPENAI_TEMPERATURE"
ENV_OPENAI_MAX_TOKENS = "OPENAI_MAX_TOKENS"
ENV_OPENAI_CONTEXT_WINDOW = "OPENAI_CONTEXT_WINDOW"

# Task-specific parameters
PERSONA_FORMATION_MAX_TOKENS = (
    131072  # Maximum tokens for persona formation, doubled to ensure complete responses
)
PERSONA_FORMATION_TEMPERATURE = 0.0  # Temperature for persona formation

# Gemini Safety Settings
GEMINI_SAFETY_SETTINGS_BLOCK_NONE = [
    {
        "category": "HARM_CATEGORY_HARASSMENT",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "threshold": "BLOCK_NONE",
    },
]
