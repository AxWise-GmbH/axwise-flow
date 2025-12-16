"""
Pattern enrichment utilities.

This module provides utilities for enriching patterns with
detailed descriptions, categories, and impact statements.
"""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


# Category keywords for pattern classification
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "Workflow": ["workflow", "process", "step", "sequence", "procedure", "routine", "method"],
    "Coping Strategy": ["cope", "strategy", "deal with", "manage", "handle", "overcome", "mitigate"],
    "Decision Process": ["decision", "choose", "select", "evaluate", "assess", "judge", "determine"],
    "Workaround": ["workaround", "alternative", "bypass", "circumvent", "hack", "shortcut"],
    "Habit": ["habit", "regular", "consistently", "always", "frequently", "tend to", "typically"],
    "Collaboration": ["collaborate", "team", "share", "together", "group", "collective", "joint"],
    "Communication": ["communicate", "discuss", "talk", "message", "inform", "express", "convey"],
}


class PatternEnricher:
    """Enricher for pattern metadata and descriptions."""

    def __init__(self, category_keywords: Dict[str, List[str]] = None):
        """
        Initialize the pattern enricher.

        Args:
            category_keywords: Custom category keywords mapping
        """
        self.category_keywords = category_keywords or CATEGORY_KEYWORDS

    def determine_category(self, name: str, description: str, statements: List[str]) -> str:
        """
        Determine the appropriate category for a pattern.

        Args:
            name: Pattern name
            description: Pattern description
            statements: Supporting statements/evidence

        Returns:
            Category string from the predefined list
        """
        combined_text = f"{name} {description} {' '.join(statements)}".lower()

        scores = {}
        for category, keywords in self.category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in combined_text)
            scores[category] = score

        if any(scores.values()):
            return max(scores.items(), key=lambda x: x[1])[0]

        return "Workflow"

    def generate_detailed_description(
        self, name: str, description: str, statements: List[str]
    ) -> str:
        """
        Generate a detailed behavioral description for a pattern.

        Args:
            name: Pattern name
            description: Original description
            statements: Supporting statements/evidence

        Returns:
            Detailed description focusing on behaviors and actions
        """
        if description and description != "No description available." and len(description) > 50:
            return description

        return (
            f"Users demonstrate specific behaviors related to {name.lower()}, "
            f"showing consistent patterns in how they interact with the system. "
            f"These behaviors reflect how users approach and engage with this aspect of the experience."
        )

    def generate_impact_statement(
        self, name: str, description: str, sentiment: float, statements: List[str]
    ) -> str:
        """
        Generate a specific impact statement for a pattern.

        Args:
            name: Pattern name
            description: Pattern description
            sentiment: Sentiment score (-1 to 1)
            statements: Supporting statements/evidence

        Returns:
            Specific impact statement
        """
        if sentiment > 0.3:
            impact_type = "positive"
            consequences = [
                "increases user satisfaction and engagement",
                "enhances productivity and efficiency",
                "improves the overall user experience",
            ]
        elif sentiment < -0.3:
            impact_type = "negative"
            consequences = [
                "creates friction and frustration for users",
                "slows down task completion and reduces efficiency",
                "diminishes user confidence in the system",
            ]
        else:
            impact_type = "mixed"
            consequences = [
                "has both positive and negative effects on user experience",
                "creates trade-offs between efficiency and thoroughness",
                "varies in impact depending on user expertise and context",
            ]

        # Select consequences based on pattern name
        name_words = set(name.lower().split())
        selected = []
        for consequence in consequences:
            for word in name_words:
                if len(word) > 4 and word in consequence:
                    selected.append(consequence)
                    break

        if not selected:
            selected = consequences[:2]
        else:
            selected = selected[:2]

        impact = f"This pattern {selected[0]}"
        if len(selected) > 1:
            impact += f" and {selected[1]}"
        impact += f", resulting in a {impact_type} effect on overall system usability."

        return impact

    def calculate_sentiment_distribution(
        self, statements: List[str], sentiment_data: Dict[str, List[str]]
    ) -> Dict[str, float]:
        """Calculate sentiment distribution for a list of statements."""
        distribution = {"positive": 0, "neutral": 0, "negative": 0}

        if sentiment_data and statements:
            positive_set = set(sentiment_data.get("positive", []))
            neutral_set = set(sentiment_data.get("neutral", []))
            negative_set = set(sentiment_data.get("negative", []))

            for statement in statements:
                if statement in positive_set:
                    distribution["positive"] += 1
                elif statement in negative_set:
                    distribution["negative"] += 1
                else:
                    distribution["neutral"] += 1
        else:
            total = len(statements)
            distribution["positive"] = total // 3
            distribution["neutral"] = total // 3
            distribution["negative"] = total - distribution["positive"] - distribution["neutral"]

        total = sum(distribution.values())
        if total > 0:
            for key in distribution:
                distribution[key] = round(distribution[key] / total, 2)

        return distribution

