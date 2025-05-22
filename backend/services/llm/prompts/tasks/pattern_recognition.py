"""
Pattern recognition prompt templates for LLM services.

This module provides prompt templates for pattern recognition tasks,
optimized for use with the Instructor library and Pydantic models.
"""

from typing import Dict, Any, Optional
from backend.services.llm.prompts.industry_guidance import IndustryGuidance
from backend.models.pattern import Pattern, PatternResponse

class PatternRecognitionPrompts:
    """
    Pattern recognition prompt templates.

    This class provides prompt templates for pattern recognition tasks,
    including industry-specific prompts and structured output guidance.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get pattern recognition prompt based on data.

        Args:
            data: Request data containing text and optional industry

        Returns:
            Prompt string optimized for structured output
        """
        # Check if industry is provided
        industry = data.get("industry")

        # Get sample text (truncate if too long)
        text = data.get("text", "")
        if len(text) > 8000:
            text = text[:8000] + "..."

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_pattern_guidance(industry)
            return PatternRecognitionPrompts.industry_specific_prompt(industry, industry_guidance, text)

        return PatternRecognitionPrompts.standard_prompt(text)

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, text: str) -> str:
        """
        Get industry-specific pattern recognition prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            text: Text to analyze

        Returns:
            System message string with industry-specific guidance
        """
        # Get the Pydantic schema for structured output
        pattern_schema = Pattern.model_json_schema()
        pattern_response_schema = PatternResponse.model_json_schema()

        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in {industry.upper()} industry interview data.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        ANALYZE THIS TEXT:
        {text}

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees that are relevant to the {industry.upper()} industry.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit
        6. Collaboration patterns - How users work with others
        7. Communication patterns - How users share information

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (must be one of: "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit", "Collaboration", "Communication")
        3. A detailed description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0.0 and 1.0 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0 (negative, neutral, or positive)
        6. Supporting evidence as direct quotes showing the SPECIFIC ACTIONS mentioned
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Your response MUST follow this exact JSON schema:
        ```
        {pattern_response_schema}
        ```

        Example of a well-formatted pattern:
        ```
        {{
          "patterns": [
            {{
              "name": "Multi-source Validation",
              "category": "Decision Process",
              "description": "Users consistently seek validation from multiple sources before making UX decisions",
              "frequency": 0.65,
              "sentiment": -0.3,
              "evidence": [
                  "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                  "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
              ],
              "impact": "Slows down decision-making process but increases confidence in final decisions",
              "suggested_actions": [
                  "Create a centralized knowledge base of UX best practices",
                  "Develop a streamlined validation checklist",
                  "Implement a faster user testing protocol for quick validation"
              ]
            }}
          ]
        }}
        ```

        EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array, even if you only identify one pattern. If you cannot identify any patterns, return an empty array like this:
        {{
          "patterns": []
        }}

        CRITICAL REQUIREMENTS:
        1. EVERY pattern MUST have a clear, descriptive name (never "Uncategorized" or generic labels)
        2. EVERY pattern MUST be assigned to one of these specific categories:
           - Workflow (sequences of actions to accomplish goals)
           - Coping Strategy (ways users overcome obstacles)
           - Decision Process (how users make choices)
           - Workaround (alternative approaches when standard methods fail)
           - Habit (repeated behaviors users exhibit)
           - Collaboration (how users work with others)
           - Communication (how users share information)
        3. EVERY pattern MUST have a detailed description that explains the behavior
        4. NEVER leave any field empty or with placeholder text like "No description available"
        5. Use UNIQUE evidence for each pattern - never reuse the same quotes across patterns

        IMPORTANT:
        - Emphasize VERBS and ACTION words in your pattern descriptions
        - Each pattern should describe WHAT USERS DO, not just what they think or say
        - Evidence should contain quotes showing the ACTIONS mentioned
        - Impact should describe the consequences (positive or negative) of the pattern
        - Suggested actions should be specific, actionable recommendations that are appropriate for the {industry.upper()} industry
        - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
        - Ensure 100% of your response is in valid JSON format
        """

    @staticmethod
    def standard_prompt(text: str) -> str:
        """
        Get standard pattern recognition prompt.

        Args:
            text: Text to analyze

        Returns:
            System message string optimized for structured output
        """
        # Get the Pydantic schema for structured output
        pattern_schema = Pattern.model_json_schema()
        pattern_response_schema = PatternResponse.model_json_schema()

        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data.

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        ANALYZE THIS TEXT:
        {text}

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit
        6. Collaboration patterns - How users work with others
        7. Communication patterns - How users share information

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (must be one of: "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit", "Collaboration", "Communication")
        3. A detailed description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0.0 and 1.0 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0 (negative, neutral, or positive)
        6. Supporting evidence as direct quotes showing the SPECIFIC ACTIONS mentioned
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Your response MUST follow this exact JSON schema:
        ```
        {pattern_response_schema}
        ```

        Example of a well-formatted pattern:
        ```
        {{
          "patterns": [
            {{
              "name": "Multi-source Validation",
              "category": "Decision Process",
              "description": "Users consistently seek validation from multiple sources before making UX decisions",
              "frequency": 0.65,
              "sentiment": -0.3,
              "evidence": [
                  "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                  "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
              ],
              "impact": "Slows down decision-making process but increases confidence in final decisions",
              "suggested_actions": [
                  "Create a centralized knowledge base of best practices",
                  "Develop a streamlined validation checklist"
              ]
            }}
          ]
        }}
        ```

        EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array, even if you only identify one pattern. If you cannot identify any patterns, return an empty array like this:
        {{
          "patterns": []
        }}

        CRITICAL REQUIREMENTS:
        1. EVERY pattern MUST have a clear, descriptive name (never "Uncategorized" or generic labels)
        2. EVERY pattern MUST be assigned to one of these specific categories:
           - Workflow (sequences of actions to accomplish goals)
           - Coping Strategy (ways users overcome obstacles)
           - Decision Process (how users make choices)
           - Workaround (alternative approaches when standard methods fail)
           - Habit (repeated behaviors users exhibit)
           - Collaboration (how users work with others)
           - Communication (how users share information)
        3. EVERY pattern MUST have a detailed description that explains the behavior
        4. NEVER leave any field empty or with placeholder text like "No description available"
        5. Use UNIQUE evidence for each pattern - never reuse the same quotes across patterns

        IMPORTANT:
        - Emphasize VERBS and ACTION words in your pattern descriptions
        - Each pattern should describe WHAT USERS DO, not just what they think or say
        - Evidence should contain quotes showing the ACTIONS mentioned
        - Impact should describe the consequences (positive or negative) of the pattern
        - Suggested actions should be specific, actionable recommendations
        - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
        - Ensure 100% of your response is in valid JSON format
        """
