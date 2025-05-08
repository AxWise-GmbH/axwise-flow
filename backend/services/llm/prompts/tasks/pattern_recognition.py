"""
Pattern recognition prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance

class PatternRecognitionPrompts:
    """
    Pattern recognition prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get pattern recognition prompt.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        # Check if industry is provided
        industry = data.get("industry")

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_pattern_guidance(industry)
            return PatternRecognitionPrompts.industry_specific_prompt(industry, industry_guidance)

        return PatternRecognitionPrompts.standard_prompt()

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str) -> str:
        """
        Get industry-specific pattern recognition prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in {industry.upper()} industry interview data.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees that are relevant to the {industry.upper()} industry.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (e.g., "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit")
        3. A description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0 and 1 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0
        6. Supporting evidence (direct quotes showing the SPECIFIC ACTIONS mentioned)
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Format your response as a JSON object with this structure:
        {{
          "patterns": [
            {{
              "name": "Multi-source Validation",
              "category": "Workflow",
              "description": "Users repeatedly check multiple sources before making UX decisions",
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
            }},
            ...
          ]
        }}

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
    def standard_prompt() -> str:
        """
        Get standard pattern recognition prompt.

        Returns:
            System message string
        """
        return """
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data.

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (e.g., "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit")
        3. A description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0 and 1 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0
        6. Supporting evidence (direct quotes showing the SPECIFIC ACTIONS mentioned)
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Format your response as a JSON object with this structure:
        {
          "patterns": [
            {
              "name": "Multi-source Validation",
              "category": "Workflow",
              "description": "Users repeatedly check multiple sources before making UX decisions",
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
            },
            ...
          ]
        }

        IMPORTANT:
        - Emphasize VERBS and ACTION words in your pattern descriptions
        - Each pattern should describe WHAT USERS DO, not just what they think or say
        - Evidence should contain quotes showing the ACTIONS mentioned
        - Impact should describe the consequences (positive or negative) of the pattern
        - Suggested actions should be specific, actionable recommendations
        - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
        - Ensure 100% of your response is in valid JSON format
        """
