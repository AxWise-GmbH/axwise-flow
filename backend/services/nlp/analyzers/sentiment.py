"""
Sentiment analysis utilities.

This module provides utilities for processing and validating
sentiment analysis results.
"""

import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    """Analyzer for sentiment processing and validation."""

    def __init__(self, min_statement_length: int = 20, max_statements_per_category: int = 20):
        """
        Initialize the sentiment analyzer.

        Args:
            min_statement_length: Minimum length for valid statements
            max_statements_per_category: Maximum statements to keep per category
        """
        self.min_statement_length = min_statement_length
        self.max_statements_per_category = max_statements_per_category

    def process_results(self, sentiment_result: Any) -> Dict[str, List[str]]:
        """
        Process and validate sentiment results to ensure quality.

        Args:
            sentiment_result: Raw sentiment analysis result

        Returns:
            Processed sentiment dictionary with positive, neutral, negative lists
        """
        if not sentiment_result or not isinstance(sentiment_result, dict):
            logger.warning("Invalid sentiment result format")
            return {"positive": [], "neutral": [], "negative": []}

        try:
            positive, neutral, negative = self._extract_statements(sentiment_result)

            # Extract from themes if needed
            if self._needs_theme_extraction(positive, neutral, negative):
                positive, neutral, negative = self._extract_from_themes(
                    sentiment_result, positive, neutral, negative
                )

            # Filter and return
            return {
                "positive": self._filter_statements(positive),
                "neutral": self._filter_statements(neutral),
                "negative": self._filter_statements(negative),
            }
        except Exception as e:
            logger.error(f"Error processing sentiment results: {str(e)}")
            return {"positive": [], "neutral": [], "negative": []}

    def _extract_statements(self, result: Dict) -> tuple:
        """Extract statements from various result formats."""
        positive, neutral, negative = [], [], []

        if "sentimentStatements" in result:
            statements = result.get("sentimentStatements", {})
            positive = statements.get("positive", [])
            neutral = statements.get("neutral", [])
            negative = statements.get("negative", [])
        elif "supporting_statements" in result:
            statements = result.get("supporting_statements", {})
            positive = statements.get("positive", [])
            neutral = statements.get("neutral", [])
            negative = statements.get("negative", [])
        elif "positive" in result and "negative" in result:
            positive = result.get("positive", [])
            neutral = result.get("neutral", [])
            negative = result.get("negative", [])
        elif "sentiment" in result and isinstance(result["sentiment"], dict):
            sentiment_data = result["sentiment"]
            if "supporting_statements" in sentiment_data:
                statements = sentiment_data.get("supporting_statements", {})
                positive = statements.get("positive", [])
                neutral = statements.get("neutral", [])
                negative = statements.get("negative", [])
            else:
                positive = sentiment_data.get("positive", [])
                neutral = sentiment_data.get("neutral", [])
                negative = sentiment_data.get("negative", [])

        # Ensure lists
        positive = positive if isinstance(positive, list) else []
        neutral = neutral if isinstance(neutral, list) else []
        negative = negative if isinstance(negative, list) else []

        return positive, neutral, negative

    def _needs_theme_extraction(self, positive: List, neutral: List, negative: List) -> bool:
        """Check if we need to extract from themes."""
        return len(positive) < 10 or len(neutral) < 10 or len(negative) < 10

    def _extract_from_themes(
        self, result: Dict, positive: List, neutral: List, negative: List
    ) -> tuple:
        """Extract additional statements from themes."""
        themes = result.get("themes", [])
        for theme in themes:
            statements = theme.get("statements", []) or theme.get("examples", [])
            sentiment_score = theme.get("sentiment", 0)

            for statement in statements:
                if not isinstance(statement, str) or len(statement.strip()) < self.min_statement_length:
                    continue

                if sentiment_score > 0.2 and len(positive) < self.max_statements_per_category:
                    if statement not in positive:
                        positive.append(statement)
                elif sentiment_score < -0.2 and len(negative) < self.max_statements_per_category:
                    if statement not in negative:
                        negative.append(statement)
                elif len(neutral) < self.max_statements_per_category:
                    if statement not in neutral:
                        neutral.append(statement)

        return positive, neutral, negative

    def _filter_statements(self, statements: List) -> List[str]:
        """Filter out low-quality statements."""
        if not statements:
            return []
        return [
            s for s in statements
            if isinstance(s, str)
            and len(s) > self.min_statement_length
            and not s.startswith("Product Designer Interview")
        ]

    def preprocess_transcript(self, text: str) -> str:
        """Preprocess transcript to make Q&A pairs more identifiable."""
        if not text:
            return text

        # Normalize Q/A markers
        text = re.sub(r"^Q:\s*", "Question: ", text, flags=re.MULTILINE)
        text = re.sub(r"^A:\s*", "Answer: ", text, flags=re.MULTILINE)

        return text

