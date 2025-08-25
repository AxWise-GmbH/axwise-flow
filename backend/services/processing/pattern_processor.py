"""
Pattern processor module for generating and processing patterns.

This module provides a processor for generating patterns from text data
using PydanticAI with Pydantic models for structured outputs.
"""

import logging
import asyncio
import os
from typing import Dict, Any, List, Optional, Union

from models.pattern import Pattern, PatternResponse
from services.llm.prompts.tasks.pattern_recognition import (
    PatternRecognitionPrompts,
)
from domain.pipeline.processor import IProcessor

# PydanticAI imports
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel

# Import constants for API key
from infrastructure.constants.llm_constants import ENV_GEMINI_API_KEY

logger = logging.getLogger(__name__)


class PatternProcessor(IProcessor):
    """
    Processor for generating patterns from text data.

    This processor uses PydanticAI with Pydantic models to generate
    structured pattern data from text.
    """

    def __init__(self, llm_service=None):
        """
        Initialize the pattern processor.

        Args:
            llm_service: Optional LLM service instance (for compatibility)
        """
        # Initialize PydanticAI agent for pattern recognition
        try:
            # Get API key from environment
            api_key = os.getenv(ENV_GEMINI_API_KEY)
            if not api_key:
                logger.warning(
                    f"No API key found in environment variable {ENV_GEMINI_API_KEY}"
                )
                self.pydantic_ai_available = False
                self.pattern_agent = None
                return

            # Set API key in environment for PydanticAI
            if api_key:
                os.environ["GEMINI_API_KEY"] = api_key
            self.model = GeminiModel("gemini-2.5-flash")
            self.pattern_agent = Agent(
                model=self.model,
                output_type=PatternResponse,
                system_prompt=(
                    "You are an expert behavioral analyst specializing in identifying patterns "
                    "in user research data. Focus on extracting clear, specific patterns of behavior "
                    "that appear multiple times in the text. "
                    "Generate 3-7 distinct patterns with detailed evidence and actionable insights."
                ),
            )
            self.pydantic_ai_available = True
            logger.info("Initialized PatternProcessor with PydanticAI")
        except Exception as e:
            logger.error(f"Failed to initialize PydanticAI for PatternProcessor: {e}")
            self.pydantic_ai_available = False
            self.pattern_agent = None

    @property
    def name(self) -> str:
        """Get the name of the processor."""
        return "pattern_processor"

    @property
    def description(self) -> str:
        """Get the description of the processor."""
        return "Generates patterns from text data using PydanticAI"

    @property
    def version(self) -> str:
        """Get the version of the processor."""
        return "2.0.0"

    def supports_input_type(self, input_type: Any) -> bool:
        """Check if the processor supports the given input type."""
        return isinstance(input_type, (str, dict))

    def get_output_type(self) -> Any:
        """Get the output type of the processor."""
        return PatternResponse

    async def process(
        self, data: Any, context: Optional[Dict[str, Any]] = None
    ) -> PatternResponse:
        """
        Process the input data and generate patterns.

        Args:
            data: The input data (text or dict with text)
            context: Optional context information

        Returns:
            PatternResponse object containing the generated patterns
        """
        context = context or {}
        logger.info(f"Processing data for pattern generation with context: {context}")

        # Extract text from data
        text = self._extract_text(data)
        if not text:
            logger.warning("No text found in data for pattern generation")
            return PatternResponse(patterns=[])

        # Extract industry from context or data
        industry = context.get("industry") or self._extract_industry(data)

        # Generate patterns using PydanticAI
        if self.pydantic_ai_available:
            try:
                patterns = await self._generate_patterns_with_pydantic_ai(
                    text, industry, context.get("themes")
                )
                logger.info(
                    f"Generated {len(patterns.patterns)} patterns using PydanticAI"
                )
                return patterns
            except Exception as e:
                logger.error(f"Error generating patterns with PydanticAI: {str(e)}")
        else:
            logger.warning("PydanticAI not available for pattern generation")

        # Fallback to generating patterns from themes if available
        if "themes" in context:
            logger.info("Falling back to generating patterns from themes")
            patterns = await self._generate_patterns_from_themes(
                context["themes"], text
            )
            return PatternResponse(patterns=patterns)

        # Return empty patterns if all else fails
        logger.warning(
            "All pattern generation methods failed, returning empty patterns"
        )
        return PatternResponse(patterns=[])

    def _extract_text(self, data: Any) -> str:
        """
        Extract text from the input data.

        Args:
            data: The input data

        Returns:
            Extracted text
        """
        if isinstance(data, str):
            return data

        if isinstance(data, dict):
            # Try common keys that might contain text
            for key in ["text", "content", "transcript", "dialogue"]:
                if key in data and isinstance(data[key], str):
                    return data[key]

            # If no direct text found, try to extract from segments
            if "segments" in data and isinstance(data["segments"], list):
                segments_text = []
                for segment in data["segments"]:
                    if isinstance(segment, dict) and "dialogue" in segment:
                        segments_text.append(segment["dialogue"])

                if segments_text:
                    return "\n".join(segments_text)

        return ""

    def _extract_industry(self, data: Any) -> Optional[str]:
        """
        Extract industry from the input data.

        Args:
            data: The input data

        Returns:
            Extracted industry or None
        """
        if isinstance(data, dict):
            return data.get("industry")

        return None

    async def _generate_patterns_with_pydantic_ai(
        self,
        text: str,
        industry: Optional[str] = None,
        themes: Optional[List[Dict[str, Any]]] = None,
    ) -> PatternResponse:
        """
        Generate patterns using PydanticAI.

        Args:
            text: The text to analyze
            industry: Optional industry context
            themes: Optional themes to inform pattern generation

        Returns:
            PatternResponse object containing the generated patterns
        """
        # Prepare data for prompt generation
        prompt_data = {"text": text}
        if industry:
            prompt_data["industry"] = industry

        # Get the appropriate prompt
        prompt = PatternRecognitionPrompts.get_prompt(prompt_data)

        # Add themes context if available
        if themes:
            themes_context = "\n\nExisting themes to consider:\n"
            for theme in themes[:5]:  # Limit to top 5 themes
                theme_name = theme.get("name", "Unknown")
                theme_def = theme.get("definition", "No definition")
                themes_context += f"- {theme_name}: {theme_def}\n"
            prompt += themes_context

        # Generate patterns with PydanticAI
        try:
            logger.info("Generating patterns with PydanticAI agent")
            response = await self.pattern_agent.run(prompt)

            # PydanticAI returns the result directly
            if isinstance(response.output, PatternResponse):
                return response.output
            else:
                # If for some reason we get a different format, try to convert
                logger.warning(
                    f"Unexpected response type from PydanticAI: {type(response.output)}"
                )
                if hasattr(response.output, "patterns"):
                    return PatternResponse(patterns=response.output.patterns)
                else:
                    return PatternResponse(patterns=[])

        except Exception as e:
            logger.error(f"Error in PydanticAI pattern generation: {str(e)}")

            # Try with a simpler prompt as fallback
            try:
                logger.info("Retrying pattern generation with simplified prompt")
                simple_prompt = f"""
                Analyze the following text and identify 3-5 behavioral patterns:

                {text[:2000]}...

                Focus on recurring behaviors, workflows, or approaches that appear multiple times.
                """

                response = await self.pattern_agent.run(simple_prompt)

                if isinstance(response.output, PatternResponse):
                    return response.output
                else:
                    return PatternResponse(patterns=[])

            except Exception as e2:
                logger.error(f"Error in retry pattern generation: {str(e2)}")
                raise

    async def _generate_patterns_from_themes(
        self, themes: List[Dict[str, Any]], text: Optional[str] = None
    ) -> List[Pattern]:
        """
        Generate patterns from themes.

        Args:
            themes: List of themes to convert to patterns
            text: Optional original text for context

        Returns:
            List of Pattern objects
        """
        logger.info(f"Generating patterns from {len(themes)} themes")
        patterns = []

        for theme in themes:
            # Skip themes without names or definitions
            if not theme.get("name") or not (
                theme.get("definition") or theme.get("description")
            ):
                continue

            # Extract theme data
            name = theme.get("name", "Unknown Theme")
            description = theme.get("definition") or theme.get(
                "description", "No description available."
            )
            statements = theme.get("statements", []) or theme.get("evidence", [])
            sentiment = theme.get("sentiment", 0.0)

            # Create a pattern from the theme
            try:
                pattern = Pattern(
                    name=name,
                    category=self._determine_pattern_category(
                        name, description, statements
                    ),
                    description=description,
                    frequency=theme.get("frequency", 0.7),
                    sentiment=sentiment,
                    evidence=(
                        statements[:5] if statements else ["Based on theme analysis"]
                    ),
                    impact="This pattern affects how users approach their work and may influence tool adoption.",
                    suggested_actions=[
                        "Consider addressing this pattern in the design process."
                    ],
                )

                patterns.append(pattern)
            except Exception as e:
                logger.warning(f"Error creating pattern from theme '{name}': {str(e)}")

        logger.info(f"Generated {len(patterns)} patterns from themes")
        return patterns

    def _determine_pattern_category(
        self, name: str, description: str, statements: List[str]
    ) -> str:
        """
        Determine the category of a pattern.

        Args:
            name: Pattern name
            description: Pattern description
            statements: Supporting statements

        Returns:
            Category name
        """
        # Combine text for analysis
        combined_text = f"{name} {description} {' '.join(statements)}"
        combined_text = combined_text.lower()

        # Define category keywords
        category_keywords = {
            "Workflow": ["workflow", "process", "steps", "sequence", "procedure"],
            "Coping Strategy": ["cope", "deal with", "manage", "handle", "strategy"],
            "Decision Process": ["decision", "choose", "select", "evaluate", "assess"],
            "Workaround": ["workaround", "alternative", "bypass", "circumvent"],
            "Habit": ["habit", "routine", "regularly", "always", "consistently"],
            "Collaboration": ["collaborate", "team", "together", "share", "group"],
            "Communication": ["communicate", "talk", "discuss", "inform", "message"],
        }

        # Find matching category
        for category, keywords in category_keywords.items():
            for keyword in keywords:
                if keyword in combined_text:
                    return category

        # Default to Workflow if no match found
        return "Workflow"
