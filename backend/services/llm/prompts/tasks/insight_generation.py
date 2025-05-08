"""
Insight generation prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance

class InsightGenerationPrompts:
    """
    Insight generation prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get insight generation prompt.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        # Check if industry is provided
        industry = data.get("industry")

        # Extract additional context from data
        themes = data.get("themes", [])
        patterns = data.get("patterns", [])
        sentiment = data.get("sentiment", {})
        existing_insights = data.get("existing_insights", [])

        # Create context string from additional data
        context = "Based on the following analysis:\n"

        if themes:
            context += "\nThemes:\n"
            for theme in themes:
                context += f"- {theme.get('name', 'Unknown')}: {theme.get('frequency', 0)}\n"
                if "statements" in theme:
                    for stmt in theme.get("statements", []):
                        context += f"  * {stmt}\n"

        if patterns:
            context += "\nPatterns:\n"
            for pattern in patterns:
                context += f"- {pattern.get('category', 'Unknown')}: {pattern.get('description', 'No description')} ({pattern.get('frequency', 0)})\n"
                if "evidence" in pattern:
                    for evidence in pattern.get("evidence", []):
                        context += f"  * {evidence}\n"

        if sentiment:
            context += "\nSentiment:\n"
            if isinstance(sentiment, dict):
                overall = sentiment.get("overall", "Unknown")
                context += f"- Overall: {overall}\n"

                breakdown = sentiment.get("breakdown", {})
                if breakdown:
                    context += f"- Positive: {breakdown.get('positive', 0)}\n"
                    context += f"- Neutral: {breakdown.get('neutral', 0)}\n"
                    context += f"- Negative: {breakdown.get('negative', 0)}\n"

                supporting_stmts = sentiment.get("supporting_statements", {})
                if supporting_stmts:
                    for category, statements in supporting_stmts.items():
                        context += f"\n{category.capitalize()} statements:\n"
                        for stmt in statements:
                            context += f"  * {stmt}\n"

        if existing_insights:
            context += "\nExisting Insights:\n"
            for insight in existing_insights:
                context += f"- {insight.get('topic', 'Unknown')}: {insight.get('observation', 'No observation')}\n"

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_insight_guidance(industry)
            return InsightGenerationPrompts.industry_specific_prompt(industry, industry_guidance, context)

        return InsightGenerationPrompts.standard_prompt(context)

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, context: str) -> str:
        """
        Get industry-specific insight generation prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            context: Analysis context

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        You are an expert insight generator specializing in the {industry.upper()} industry. {context}

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        Analyze the provided text and generate insights that go beyond the surface level, focusing on aspects particularly relevant to the {industry.upper()} industry.
        For each insight, provide:
        1. A topic that captures the key area of insight
        2. A detailed observation that provides actionable information
        3. Supporting evidence from the text (direct quotes or paraphrases)
        4. Implication - explain the "so what?" or consequence of this insight for {industry.upper()} organizations
        5. Recommendation - suggest a concrete next step or action that is appropriate for the {industry.upper()} industry
        6. Priority - indicate urgency/importance as "High", "Medium", or "Low"

        Return your analysis in the following JSON format:
        {{
            "insights": [
                {{
                    "topic": "Navigation Complexity",
                    "observation": "Users consistently struggle to find key features in the application interface",
                    "evidence": [
                        "I spent 5 minutes looking for the export button",
                        "The settings menu is buried too deep in the interface"
                    ],
                    "implication": "This leads to increased time-on-task and user frustration, potentially causing users to abandon tasks",
                    "recommendation": "Redesign the main navigation menu with a focus on discoverability of key features",
                    "priority": "High"
                }}
            ],
            "metadata": {{
                "quality_score": 0.85,
                "confidence_scores": {{
                    "themes": 0.9,
                    "patterns": 0.85,
                    "sentiment": 0.8
                }}
            }}
        }}

        IMPORTANT GUIDELINES:
        - Ensure insights are specific and actionable, not generic observations
        - Base priority on both impact and urgency (High = immediate action needed, Medium = important but not urgent, Low = consider for future)
        - Recommendations should be concrete, implementable, and appropriate for the {industry.upper()} industry
        - Implications should clearly explain why the insight matters to users or organizations in the {industry.upper()} sector
        - Use direct quotes from the text as evidence whenever possible
        - Ensure 100% of your response is in valid JSON format
        """

    @staticmethod
    def standard_prompt(context: str) -> str:
        """
        Get standard insight generation prompt.

        Args:
            context: Analysis context

        Returns:
            System message string
        """
        return f"""
        You are an expert insight generator. {context}

        Analyze the provided text and generate insights that go beyond the surface level.
        For each insight, provide:
        1. A topic that captures the key area of insight
        2. A detailed observation that provides actionable information
        3. Supporting evidence from the text (direct quotes or paraphrases)
        4. Implication - explain the "so what?" or consequence of this insight
        5. Recommendation - suggest a concrete next step or action
        6. Priority - indicate urgency/importance as "High", "Medium", or "Low"

        Return your analysis in the following JSON format:
        {{
            "insights": [
                {{
                    "topic": "Navigation Complexity",
                    "observation": "Users consistently struggle to find key features in the application interface",
                    "evidence": [
                        "I spent 5 minutes looking for the export button",
                        "The settings menu is buried too deep in the interface"
                    ],
                    "implication": "This leads to increased time-on-task and user frustration, potentially causing users to abandon tasks",
                    "recommendation": "Redesign the main navigation menu with a focus on discoverability of key features",
                    "priority": "High"
                }}
            ],
            "metadata": {{
                "quality_score": 0.85,
                "confidence_scores": {{
                    "themes": 0.9,
                    "patterns": 0.85,
                    "sentiment": 0.8
                }}
            }}
        }}

        IMPORTANT GUIDELINES:
        - Ensure insights are specific and actionable, not generic observations
        - Base priority on both impact and urgency (High = immediate action needed, Medium = important but not urgent, Low = consider for future)
        - Recommendations should be concrete and implementable
        - Implications should clearly explain why the insight matters to users or the business
        - Use direct quotes from the text as evidence whenever possible
        - Ensure 100% of your response is in valid JSON format
        """
