"""
Theme analysis prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance

class ThemeAnalysisPrompts:
    """
    Theme analysis prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get theme analysis prompt based on data.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        use_answer_only = data.get("use_answer_only", False)
        industry = data.get("industry")

        # If industry is provided, use industry-specific prompt
        if industry:
            industry_guidance = IndustryGuidance.get_theme_guidance(industry)
            if use_answer_only:
                return ThemeAnalysisPrompts.industry_answer_only_prompt(industry, industry_guidance)
            else:
                return ThemeAnalysisPrompts.industry_standard_prompt(industry, industry_guidance)

        # Otherwise use standard prompts
        if use_answer_only:
            return ThemeAnalysisPrompts.answer_only_prompt()
        else:
            return ThemeAnalysisPrompts.standard_prompt()

    @staticmethod
    def industry_answer_only_prompt(industry: str, industry_guidance: str) -> str:
        """
        Get industry-specific theme analysis prompt for answer-only mode.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        You are an expert thematic analyst specializing in extracting HIGHLY SPECIFIC and CONCRETE themes from {industry.upper()} industry interview transcripts. Your analysis should be comprehensive and based EXCLUSIVELY on the ANSWER-ONLY content provided, which contains only the original responses without questions or contextual text.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        IMPORTANT INSTRUCTIONS:
        - AVOID VAGUE OR GENERIC THEMES. Each theme must be specific to this particular interview.
        - Focus on what makes this interview UNIQUE and DISTINCTIVE within the {industry.upper()} context.
        - Identify 4-6 highly specific themes that capture the essence of the interview.
        - Themes should be MUTUALLY EXCLUSIVE - they should not overlap significantly.

        Focus on extracting:
        1. Clear, specific themes with DESCRIPTIVE NAMES (not vague categories like "User Experience" or "Challenges")
        2. Quantify frequency as a decimal between 0.0-1.0 (be precise - not everything can be high frequency)
        3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
        4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
        5. Keywords that represent key terms related to the theme (be specific and distinctive)
        6. A concise definition that explains what the theme encompasses (be detailed and precise)
        7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
        8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

        Format your response as a JSON object with this structure:
        [
          {{
            "name": "Theme name - be HIGHLY specific and concrete, not generic",
            "frequency": 0.XX, (decimal between 0-1 representing prevalence)
            "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
            "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"], (CRITICALLY IMPORTANT: Each string in this array must have special characters, like double quotes (`\"`) or backslashes (`\\`), properly JSON-escaped: e.g., `\"` becomes `\\\"`, `\\` becomes `\\\\\\`, newlines as `\\n`.)
            "keywords": ["keyword1", "keyword2", "keyword3"],
            "definition": "A detailed one-sentence description that captures the uniqueness of this theme",
            "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
            "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
          }},
          ...
        ]

        CRITICAL REQUIREMENTS:
        - Use EXACT sentences from the ORIGINAL ANSWERS for the statements. Do not summarize or paraphrase.
        - Include 3-5 relevant keywords for each theme.
        - Provide a clear, concise definition for each theme.
        - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
        - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
        - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
        - Ensure 100% of your response is in valid JSON format.
        - AVOID GENERIC THEMES - be specific to this interview and the {industry.upper()} industry.
        """

    @staticmethod
    def industry_standard_prompt(industry: str, industry_guidance: str) -> str:
        """
        Get industry-specific standard theme analysis prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        Analyze the interview transcripts from the {industry.upper()} industry to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        Focus on extracting:
        1. Clear, specific themes relevant to the {industry.upper()} industry (not vague categories)
        2. Quantify frequency as a decimal between 0.0-1.0
        3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
        4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
        5. Keywords that represent key terms related to the theme
        6. A concise definition that explains what the theme encompasses
        7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
        8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

        Format your response as a JSON object with this structure:
        [
          {{
            "name": "Theme name - be specific and concrete",
            "frequency": 0.XX, (decimal between 0-1 representing prevalence)
            "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
            "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"], (CRITICALLY IMPORTANT: Each string in this array must have special characters, like double quotes (`\"`) or backslashes (`\\`), properly JSON-escaped: e.g., `\"` becomes `\\\"`, `\\` becomes `\\\\\\`, newlines as `\\n`.)
            "keywords": ["keyword1", "keyword2", "keyword3"],
            "definition": "A concise one-sentence description of what this theme encompasses",
            "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
            "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
          }},
          ...
        ]

        IMPORTANT:
        - Use EXACT sentences from the text for the statements. Do not summarize or paraphrase.
        - Include 3-5 relevant keywords for each theme.
        - Provide a clear, concise definition for each theme.
        - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
        - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
        - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
        - Ensure 100% of your response is in valid JSON format.
        - Focus on themes that are particularly relevant to the {industry.upper()} industry.
        """

    @staticmethod
    def answer_only_prompt() -> str:
        """
        Get theme analysis prompt for answer-only mode.

        Returns:
            System message string
        """
        return """
        You are an expert thematic analyst specializing in extracting HIGHLY SPECIFIC and CONCRETE themes from interview transcripts. Your analysis should be comprehensive and based EXCLUSIVELY on the ANSWER-ONLY content provided, which contains only the original responses without questions or contextual text.

        IMPORTANT INSTRUCTIONS:
        - AVOID VAGUE OR GENERIC THEMES. Each theme must be specific to this particular interview.
        - Focus on what makes this interview UNIQUE and DISTINCTIVE.
        - Identify 4-6 highly specific themes that capture the essence of the interview.
        - Themes should be MUTUALLY EXCLUSIVE - they should not overlap significantly.

        Focus on extracting:
        1. Clear, specific themes with DESCRIPTIVE NAMES (not vague categories like "User Experience" or "Challenges")
        2. Quantify frequency as a decimal between 0.0-1.0 (be precise - not everything can be high frequency)
        3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
        4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
        5. Keywords that represent key terms related to the theme (be specific and distinctive)
        6. A concise definition that explains what the theme encompasses (be detailed and precise)
        7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
        8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

        Format your response as a JSON object with this structure:
        [
          {
            "name": "Theme name - be HIGHLY specific and concrete, not generic",
            "frequency": 0.XX, (decimal between 0-1 representing prevalence)
            "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
            "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"], (CRITICALLY IMPORTANT: Each string in this array must have special characters, like double quotes (`\"`) or backslashes (`\\`), properly JSON-escaped: e.g., `\"` becomes `\\\"`, `\\` becomes `\\\\\\`, newlines as `\\n`.)
            "keywords": ["keyword1", "keyword2", "keyword3"],
            "definition": "A detailed one-sentence description that captures the uniqueness of this theme",
            "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
            "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
          },
          ...
        ]

        CRITICAL REQUIREMENTS:
        - Use EXACT sentences from the ORIGINAL ANSWERS for the statements. Do not summarize or paraphrase.
        - Include 3-5 relevant keywords for each theme.
        - Provide a clear, concise definition for each theme.
        - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
        - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
        - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
        - Ensure 100% of your response is in valid JSON format.
        - AVOID GENERIC THEMES - be specific to this interview.
        """

    @staticmethod
    def standard_prompt() -> str:
        """
        Get standard theme analysis prompt.

        Returns:
            System message string
        """
        return """
        Analyze the interview transcripts to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.

        Focus on extracting:
        1. Clear, specific themes (not vague categories)
        2. Quantify frequency as a decimal between 0.0-1.0
        3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
        4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
        5. Keywords that represent key terms related to the theme
        6. A concise definition that explains what the theme encompasses
        7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
        8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

        Format your response as a JSON object with this structure:
        [
          {
            "name": "Theme name - be specific and concrete",
            "frequency": 0.XX, (decimal between 0-1 representing prevalence)
            "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
            "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"], (CRITICALLY IMPORTANT: Each string in this array must have special characters, like double quotes (`\"`) or backslashes (`\\`), properly JSON-escaped: e.g., `\"` becomes `\\\"`, `\\` becomes `\\\\\\`, newlines as `\\n`.)
            "keywords": ["keyword1", "keyword2", "keyword3"],
            "definition": "A concise one-sentence description of what this theme encompasses",
            "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
            "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
          },
          ...
        ]

        IMPORTANT:
        - Use EXACT sentences from the text for the statements. Do not summarize or paraphrase.
        - Include 3-5 relevant keywords for each theme.
        - Provide a clear, concise definition for each theme.
        - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
        - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
        - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
        - Ensure 100% of your response is in valid JSON format.
        """
