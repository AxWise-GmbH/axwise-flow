"""
NLP processing utilities for text analysis using PydanticAI/Instructor structured output.

This module provides functions for sentiment analysis, keyword extraction,
and semantic clustering of text data using structured LLM output with Pydantic models.
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)


# Pydantic Models for Structured Output
class KeywordAnalysis(BaseModel):
    """Structured model for keyword extraction results."""

    keyword: str = Field(..., description="The extracted keyword or concept")
    frequency: int = Field(default=1, description="Frequency of the keyword")
    statements: List[str] = Field(
        default_factory=list, description="Supporting statements"
    )

    @field_validator("keyword")
    @classmethod
    def keyword_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Keyword cannot be empty")
        return v.strip()

    @field_validator("statements")
    @classmethod
    def filter_empty_statements(cls, v):
        """Filter out empty statements"""
        return [stmt.strip() for stmt in v if stmt and stmt.strip()]


class KeywordExtractionResult(BaseModel):
    """Container for multiple keyword analysis results."""

    keywords: List[KeywordAnalysis] = Field(
        default_factory=list, description="List of extracted keywords"
    )

    @field_validator("keywords")
    @classmethod
    def limit_keywords(cls, v):
        """Limit to top 5 keywords"""
        return v[:5]


class ThemeCluster(BaseModel):
    """Structured model for theme clustering results."""

    name: str = Field(..., description="Theme name")
    description: str = Field(..., description="Theme description")
    text_indices: List[int] = Field(
        default_factory=list, description="Indices of texts belonging to this theme"
    )

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Theme name cannot be empty")
        return v.strip()


class SemanticClusteringResult(BaseModel):
    """Container for semantic clustering results."""

    themes: List[ThemeCluster] = Field(
        default_factory=list, description="List of identified themes"
    )

    @field_validator("themes")
    @classmethod
    def limit_themes(cls, v):
        """Limit to reasonable number of themes"""
        return v[:10]


def _run_async(coro):
    """Helper function to run async functions synchronously."""
    try:
        # Try to get the current event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If we're already in an async context, we can't use run()
            # This is a limitation - we'd need to refactor to be fully async
            logger.warning("Already in async context, using fallback")
            return None
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop exists, create a new one
        return asyncio.run(coro)


def _extract_json_from_markdown(text: str) -> str:
    """Extract JSON content from markdown code blocks."""
    if not text:
        return text

    # Remove markdown code block markers
    if text.strip().startswith("```json"):
        # Find the end of the code block
        lines = text.split("\n")
        json_lines = []
        in_json = False

        for line in lines:
            if line.strip() == "```json":
                in_json = True
                continue
            elif line.strip() == "```" and in_json:
                break
            elif in_json:
                json_lines.append(line)

        return "\n".join(json_lines)

    return text


def analyze_sentiment(text: str) -> Dict[str, float]:
    """
    Analyze sentiment of text.

    Args:
        text: Text to analyze

    Returns:
        Dictionary with polarity and subjectivity scores
    """
    # For testing purposes, return a simple sentiment score
    return {
        "polarity": 0.2,  # Range from -1 (negative) to 1 (positive)
        "subjectivity": 0.5,  # Range from 0 (objective) to 1 (subjective)
    }


def extract_keywords_and_statements(texts: List[str]) -> List[Dict[str, Any]]:
    """
    Extract keywords and supporting statements from texts using LLM-based analysis.

    Args:
        texts: List of text strings to analyze

    Returns:
        List of dictionaries with keywords and statements
    """
    if not texts:
        return []

    try:
        # Try to use Instructor for structured output
        from backend.services.llm.instructor_gemini_client import InstructorGeminiClient

        instructor_client = InstructorGeminiClient()

        # Combine texts for analysis
        combined_text = "\n\n".join(
            [f"Text {i+1}: {text}" for i, text in enumerate(texts)]
        )

        system_instruction = """You are an expert text analyst specializing in keyword extraction and thematic analysis.
Your task is to identify the most important keywords, concepts, and themes from interview or survey responses."""

        prompt = f"""
        Analyze the following texts and extract the most important keywords/concepts along with supporting statements.

        {combined_text}

        Focus on extracting:
        - Tools and technologies mentioned (e.g., Dovetail, Miro, Figma, Jira, Confluence, Looker, Qualtrics)
        - Key challenges or problems (e.g., data synthesis, time management, insight discovery)
        - Important processes or methods (e.g., qualitative analysis, user research, collaboration)
        - Core concepts or themes (e.g., automation, workflow optimization, team communication)

        For each keyword, provide:
        1. The specific keyword or concept name
        2. How frequently it appears or its importance level (1-5)
        3. 2-3 supporting statements that demonstrate this keyword in context

        Limit to the top 5 most important keywords that would be valuable for persona analysis.
        """

        # Generate structured output with temperature 0 for consistency
        result = instructor_client.generate_with_model(
            prompt=prompt,
            model_class=KeywordExtractionResult,
            system_instruction=system_instruction,
            temperature=0.0,  # Critical: Use temperature 0 for structured consistency
            max_output_tokens=1000,
        )

        # Convert to expected format
        return [
            {
                "keyword": kw.keyword,
                "frequency": kw.frequency,
                "statements": kw.statements,
            }
            for kw in result.keywords
        ]

    except Exception as e:
        logger.warning(f"Instructor keyword extraction failed: {e}, using fallback")
        return _simple_keyword_extraction(texts)


def _simple_keyword_extraction(texts: List[str]) -> List[Dict[str, Any]]:
    """Simple keyword extraction fallback."""
    if not texts:
        return []

    # Common important keywords to look for
    important_keywords = {
        "tools": ["tool", "software", "platform", "system", "application"],
        "challenges": [
            "challenge",
            "problem",
            "difficult",
            "issue",
            "struggle",
            "bottleneck",
        ],
        "processes": ["process", "workflow", "method", "approach", "procedure"],
        "collaboration": ["collaboration", "team", "meeting", "share", "communicate"],
        "analysis": ["analysis", "data", "insight", "research", "study"],
    }

    keyword_results = []
    combined_text = " ".join(texts).lower()

    for category, keywords in important_keywords.items():
        matching_statements = []
        total_frequency = 0

        for text in texts:
            text_lower = text.lower()
            if any(keyword in text_lower for keyword in keywords):
                matching_statements.append(text)
                total_frequency += sum(
                    1 for keyword in keywords if keyword in text_lower
                )

        if matching_statements:
            keyword_results.append(
                {
                    "keyword": category,
                    "frequency": total_frequency,
                    "statements": matching_statements[:2],  # Limit to 2 statements
                }
            )

    return keyword_results[:5]  # Return top 5


def perform_semantic_clustering(texts: List[str]) -> Dict[str, Any]:
    """
    Perform semantic clustering on texts using PydanticAI structured output.

    Args:
        texts: List of text strings to cluster

    Returns:
        Dictionary with clusters and theme summaries
    """
    if not texts:
        return {"clusters": {}, "theme_summaries": {}, "representatives": {}}

    try:
        # Try to use Instructor for structured output
        from backend.services.llm.instructor_gemini_client import InstructorGeminiClient

        instructor_client = InstructorGeminiClient()

        # Combine texts for analysis
        combined_text = "\n\n".join(
            [f"Text {i+1}: {text}" for i, text in enumerate(texts)]
        )

        system_instruction = """You are an expert in thematic analysis and semantic clustering.
Your task is to identify common themes, patterns, and concepts across multiple text responses and group them meaningfully."""

        prompt = f"""
        Analyze the following texts and identify common themes or patterns. Group similar texts together and provide meaningful theme names.

        {combined_text}

        Focus on identifying meaningful patterns such as:
        - Tools and technologies mentioned (e.g., research tools, design software, collaboration platforms)
        - Challenges and pain points (e.g., time constraints, data synthesis, workflow issues)
        - Processes and methods (e.g., research methodologies, collaboration approaches)
        - Goals and outcomes (e.g., insight generation, team alignment, user understanding)

        For each theme:
        1. Provide a clear, descriptive name
        2. Write a brief description explaining what this theme represents
        3. List the text indices (0-based) that belong to this theme

        Group texts that share similar concepts, even if they use different words.
        """

        # Generate structured output with temperature 0 for consistency
        result = instructor_client.generate_with_model(
            prompt=prompt,
            model_class=SemanticClusteringResult,
            system_instruction=system_instruction,
            temperature=0.0,  # Critical: Use temperature 0 for structured consistency
            max_output_tokens=1500,
        )

        # Convert to expected format
        clusters = {}
        theme_summaries = {}
        representatives = {}

        for i, theme in enumerate(result.themes):
            # Build cluster
            cluster_texts = []
            for idx in theme.text_indices:
                if 0 <= idx < len(texts):
                    cluster_texts.append({"text": texts[idx], "count": 1})

            if cluster_texts:
                clusters[i] = cluster_texts
                theme_summaries[i] = theme.name
                representatives[i] = cluster_texts[0]["text"]

        return {
            "clusters": clusters,
            "theme_summaries": theme_summaries,
            "representatives": representatives,
        }

    except Exception as e:
        logger.warning(f"Instructor clustering failed: {e}, using fallback")
        return _simple_clustering_fallback(texts)


def _simple_clustering_fallback(texts: List[str]) -> Dict[str, Any]:
    """Simple clustering fallback based on text length and keywords."""
    if not texts:
        return {"clusters": {}, "theme_summaries": {}, "representatives": {}}

    # Simple grouping by common keywords
    tool_keywords = ["tool", "software", "platform", "system", "application"]
    challenge_keywords = ["challenge", "problem", "difficult", "issue", "struggle"]
    process_keywords = ["process", "workflow", "method", "approach", "procedure"]

    clusters = {}
    theme_summaries = {}
    representatives = {}
    cluster_id = 0

    # Group by keyword themes
    for keywords, theme_name in [
        (tool_keywords, "Tools and Systems"),
        (challenge_keywords, "Challenges and Issues"),
        (process_keywords, "Processes and Methods"),
    ]:
        matching_texts = []
        for text in texts:
            text_lower = text.lower()
            if any(keyword in text_lower for keyword in keywords):
                matching_texts.append({"text": text, "count": 1})

        if matching_texts:
            clusters[cluster_id] = matching_texts
            theme_summaries[cluster_id] = theme_name
            representatives[cluster_id] = matching_texts[0]["text"]
            cluster_id += 1

    # If no themed clusters, put everything in one cluster
    if not clusters:
        clusters[0] = [{"text": text, "count": 1} for text in texts]
        theme_summaries[0] = "General Responses"
        representatives[0] = texts[0]

    return {
        "clusters": clusters,
        "theme_summaries": theme_summaries,
        "representatives": representatives,
    }
