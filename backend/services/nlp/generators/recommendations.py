"""
Recommendation generation utilities.

This module provides utilities for generating actionable
recommendations based on patterns and analysis results.
"""

import logging
from typing import List

logger = logging.getLogger(__name__)


class RecommendationGenerator:
    """Generator for actionable recommendations."""

    def generate_for_pattern(
        self, name: str, description: str, sentiment: float
    ) -> List[str]:
        """
        Generate specific, actionable recommendations based on a pattern.

        Args:
            name: Pattern name
            description: Pattern description
            sentiment: Sentiment score (-1 to 1)

        Returns:
            List of actionable recommendations
        """
        name_lower = name.lower()

        if sentiment < -0.3:
            # Negative patterns need improvement
            return [
                f"Conduct targeted usability testing focused on the {name_lower} aspect of the experience",
                f"Redesign the interface elements related to {name_lower} to reduce friction and improve clarity",
                f"Develop clear documentation and tooltips to help users navigate the {name_lower} process more effectively",
            ]
        elif sentiment > 0.3:
            # Positive patterns should be enhanced
            return [
                f"Expand the {name_lower} functionality to cover more use cases and scenarios",
                f"Highlight the {name_lower} feature in onboarding materials to increase awareness",
                f"Gather additional user feedback on {name_lower} to identify further enhancement opportunities",
            ]
        else:
            # Neutral patterns need investigation
            return [
                f"Conduct further research to better understand user needs related to {name_lower}",
                f"Prototype alternative approaches to {name_lower} and test with users",
                f"Analyze usage data to identify patterns and opportunities for improving {name_lower}",
            ]

    def generate_for_theme(
        self, theme_name: str, sentiment: float, frequency: int
    ) -> List[str]:
        """
        Generate recommendations for a theme.

        Args:
            theme_name: Theme name
            sentiment: Theme sentiment score
            frequency: How often the theme appears

        Returns:
            List of recommendations
        """
        theme_lower = theme_name.lower()
        recommendations = []

        if frequency > 5:
            recommendations.append(
                f"Prioritize addressing {theme_lower} as it appears frequently in user feedback"
            )

        if sentiment < -0.3:
            recommendations.extend([
                f"Investigate root causes of negative sentiment around {theme_lower}",
                f"Create an action plan to address user concerns about {theme_lower}",
            ])
        elif sentiment > 0.3:
            recommendations.extend([
                f"Leverage positive sentiment around {theme_lower} in marketing materials",
                f"Identify what makes {theme_lower} successful and apply to other areas",
            ])
        else:
            recommendations.append(
                f"Gather more specific feedback about {theme_lower} to understand user needs"
            )

        return recommendations

    def generate_for_insight(
        self, insight_type: str, insight_content: str, confidence: float
    ) -> List[str]:
        """
        Generate recommendations for an insight.

        Args:
            insight_type: Type of insight (e.g., "pain_point", "opportunity")
            insight_content: The insight content
            confidence: Confidence score for the insight

        Returns:
            List of recommendations
        """
        recommendations = []

        if insight_type == "pain_point":
            recommendations.extend([
                f"Address the identified pain point: {insight_content[:100]}...",
                "Conduct follow-up interviews to understand the full scope of this issue",
            ])
        elif insight_type == "opportunity":
            recommendations.extend([
                f"Explore the opportunity: {insight_content[:100]}...",
                "Create prototypes to test potential solutions",
            ])
        elif insight_type == "need":
            recommendations.extend([
                f"Validate the user need: {insight_content[:100]}...",
                "Prioritize this need in the product roadmap",
            ])

        if confidence < 0.5:
            recommendations.append(
                "Gather additional data to increase confidence in this insight"
            )

        return recommendations

