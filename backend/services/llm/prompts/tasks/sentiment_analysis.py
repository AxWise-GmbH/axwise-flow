"""
Sentiment analysis prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance

class SentimentAnalysisPrompts:
    """
    Sentiment analysis prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get sentiment analysis prompt.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        # Check if industry is provided
        industry = data.get("industry")

        # Get industry-specific guidance if available
        industry_guidance = ""
        if industry:
            industry_guidance = IndustryGuidance.get_sentiment_guidance(industry)
            return SentimentAnalysisPrompts.industry_specific_prompt(industry, industry_guidance)

        return SentimentAnalysisPrompts.standard_prompt()

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str) -> str:
        """
        Get industry-specific sentiment analysis prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        You are an expert sentiment analyst specializing in extracting nuanced emotional expressions from interview transcripts in the {industry.upper()} industry. Analyze the provided text with extreme precision to identify statements that express positive, negative, or neutral sentiments.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        CRITICAL INSTRUCTIONS:
        - You MUST find a comprehensive set of statements across all three sentiment categories
        - You MUST include at least 15-20 statements for EACH sentiment category
        - You MUST use EXACT quotes from the text - never paraphrase or summarize
        - You MUST ensure your sentiment breakdown is realistic and evidence-based
        - You MUST focus on the interviewee's statements, not the interviewer's questions
        - You MUST be thorough and exhaustive in finding all relevant sentiment statements

        Key Instructions:
        1. An overall sentiment score between 0 (negative) and 1 (positive)
        2. A breakdown of positive, neutral, and negative sentiment proportions (must sum to 1.0)
        3. Detailed sentiment analysis for specific topics mentioned in the text
        4. 10-15 supporting statements for EACH sentiment category - these MUST be EXACT quotes

        Noise Filtering Rules:
        1. EXCLUDE the following from your supporting statements:
           - Interview metadata and headers (e.g., "Interview // Person - Date", "Transcript", "Attendees")
           - Procedural statements (e.g., "I consent to recording", "Let's move to next question")
           - Truncated thoughts that don't express complete ideas (e.g., "I think maybe...")
           - Conversation fillers with no sentiment (e.g., "Mhm", "Yeah, yeah", "Okay", "Uh-huh")
           - Interviewer questions (focus on interviewee responses)
           - Generic greetings/farewells with no sentiment (e.g., "Nice to meet you", "Have a good day")
           - Transcript metadata (e.g., "This editable transcript was computer generated")

        2. INCLUDE statements that:
           - Express clear opinions or experiences
           - Describe challenges or successes
           - Reflect feelings about tools, processes, or situations
           - Provide context about work methods (neutral)
           - Explain problems or solutions

        SENTIMENT CATEGORIZATION GUIDELINES:
        - POSITIVE: Statements expressing satisfaction, enthusiasm, appreciation, success, or optimism
        - NEUTRAL: Statements providing factual information, descriptions, or balanced perspectives
        - NEGATIVE: Statements expressing frustration, disappointment, challenges, criticism, or pessimism

        Return your analysis in the following JSON format:
        {{
            "sentimentOverview": {{
                "positive": 0.33,
                "neutral": 0.34,
                "negative": 0.33
            }},
            "sentimentStatements": {{
                "positive": [
                    "EXACT POSITIVE QUOTE FROM TEXT 1",
                    "EXACT POSITIVE QUOTE FROM TEXT 2",
                    "EXACT POSITIVE QUOTE FROM TEXT 3",
                    "EXACT POSITIVE QUOTE FROM TEXT 4",
                    "EXACT POSITIVE QUOTE FROM TEXT 5",
                    "EXACT POSITIVE QUOTE FROM TEXT 6",
                    "EXACT POSITIVE QUOTE FROM TEXT 7",
                    "EXACT POSITIVE QUOTE FROM TEXT 8",
                    "EXACT POSITIVE QUOTE FROM TEXT 9",
                    "EXACT POSITIVE QUOTE FROM TEXT 10"
                ],
                "neutral": [
                    "EXACT NEUTRAL QUOTE FROM TEXT 1",
                    "EXACT NEUTRAL QUOTE FROM TEXT 2",
                    "EXACT NEUTRAL QUOTE FROM TEXT 3",
                    "EXACT NEUTRAL QUOTE FROM TEXT 4",
                    "EXACT NEUTRAL QUOTE FROM TEXT 5",
                    "EXACT NEUTRAL QUOTE FROM TEXT 6",
                    "EXACT NEUTRAL QUOTE FROM TEXT 7",
                    "EXACT NEUTRAL QUOTE FROM TEXT 8",
                    "EXACT NEUTRAL QUOTE FROM TEXT 9",
                    "EXACT NEUTRAL QUOTE FROM TEXT 10"
                ],
                "negative": [
                    "EXACT NEGATIVE QUOTE FROM TEXT 1",
                    "EXACT NEGATIVE QUOTE FROM TEXT 2",
                    "EXACT NEGATIVE QUOTE FROM TEXT 3",
                    "EXACT NEGATIVE QUOTE FROM TEXT 4",
                    "EXACT NEGATIVE QUOTE FROM TEXT 5",
                    "EXACT NEGATIVE QUOTE FROM TEXT 6",
                    "EXACT NEGATIVE QUOTE FROM TEXT 7",
                    "EXACT NEGATIVE QUOTE FROM TEXT 8",
                    "EXACT NEGATIVE QUOTE FROM TEXT 9",
                    "EXACT NEGATIVE QUOTE FROM TEXT 10"
                ]
            }}
        }}

        CRITICAL REQUIREMENTS:
        - Each statement MUST be an EXACT quote from the text - do not rewrite, summarize, or paraphrase
        - Ensure statements are diverse, covering different topics mentioned in the interview
        - Each statement should be meaningful and express complete thoughts
        - Filter out all noise using the rules above
        - Extract statements from interviewee responses, not interviewer questions
        - DO NOT leave any category empty - find at least 10 examples for each sentiment type
        - Ensure your JSON is valid and properly formatted
        """

    @staticmethod
    def standard_prompt() -> str:
        """
        Get standard sentiment analysis prompt.

        Returns:
            System message string
        """
        return """
        You are an expert sentiment analyst specializing in extracting nuanced emotional expressions from interview transcripts. Analyze the provided text with extreme precision to identify statements that express positive, negative, or neutral sentiments.

        CRITICAL INSTRUCTIONS:
        - You MUST find a comprehensive set of statements across all three sentiment categories
        - You MUST include at least 15-20 statements for EACH sentiment category
        - You MUST use EXACT quotes from the text - never paraphrase or summarize
        - You MUST ensure your sentiment breakdown is realistic and evidence-based
        - You MUST focus on the interviewee's statements, not the interviewer's questions
        - You MUST be thorough and exhaustive in finding all relevant sentiment statements

        Industry-Agnostic Guidelines:
        1. This analysis should work equally well for any professional domain: healthcare, tech, finance, military, education, hospitality, manufacturing, etc.
        2. Recognize domain-specific terminology and understand it in proper context
        3. Focus on emotional markers rather than technical language
        4. Distinguish between process descriptions (neutral) and actual pain points (negative)
        5. Identify enthusiasm for solutions (positive) vs frustration with problems (negative)

        Key Instructions:
        1. An overall sentiment score between 0 (negative) and 1 (positive)
        2. A breakdown of positive, neutral, and negative sentiment proportions (must sum to 1.0)
        3. Detailed sentiment analysis for specific topics mentioned in the text
        4. 10-15 supporting statements for EACH sentiment category - these MUST be EXACT quotes

        Noise Filtering Rules:
        1. EXCLUDE the following from your supporting statements:
           - Interview metadata and headers (e.g., "Interview // Person - Date", "Transcript", "Attendees")
           - Procedural statements (e.g., "I consent to recording", "Let's move to next question")
           - Truncated thoughts that don't express complete ideas (e.g., "I think maybe...")
           - Conversation fillers with no sentiment (e.g., "Mhm", "Yeah, yeah", "Okay", "Uh-huh")
           - Interviewer questions (focus on interviewee responses)
           - Generic greetings/farewells with no sentiment (e.g., "Nice to meet you", "Have a good day")
           - Transcript metadata (e.g., "This editable transcript was computer generated")

        2. INCLUDE statements that:
           - Express clear opinions or experiences
           - Describe challenges or successes
           - Reflect feelings about tools, processes, or situations
           - Provide context about work methods (neutral)
           - Explain problems or solutions

        SENTIMENT CATEGORIZATION GUIDELINES:
        - POSITIVE: Statements expressing satisfaction, enthusiasm, appreciation, success, or optimism
        - NEUTRAL: Statements providing factual information, descriptions, or balanced perspectives
        - NEGATIVE: Statements expressing frustration, disappointment, challenges, criticism, or pessimism

        Return your analysis in the following JSON format:
        {
            "sentimentOverview": {
                "positive": 0.33,
                "neutral": 0.34,
                "negative": 0.33
            },
            "sentimentStatements": {
                "positive": [
                    "EXACT POSITIVE QUOTE FROM TEXT 1",
                    "EXACT POSITIVE QUOTE FROM TEXT 2",
                    "EXACT POSITIVE QUOTE FROM TEXT 3",
                    "EXACT POSITIVE QUOTE FROM TEXT 4",
                    "EXACT POSITIVE QUOTE FROM TEXT 5",
                    "EXACT POSITIVE QUOTE FROM TEXT 6",
                    "EXACT POSITIVE QUOTE FROM TEXT 7",
                    "EXACT POSITIVE QUOTE FROM TEXT 8",
                    "EXACT POSITIVE QUOTE FROM TEXT 9",
                    "EXACT POSITIVE QUOTE FROM TEXT 10"
                ],
                "neutral": [
                    "EXACT NEUTRAL QUOTE FROM TEXT 1",
                    "EXACT NEUTRAL QUOTE FROM TEXT 2",
                    "EXACT NEUTRAL QUOTE FROM TEXT 3",
                    "EXACT NEUTRAL QUOTE FROM TEXT 4",
                    "EXACT NEUTRAL QUOTE FROM TEXT 5",
                    "EXACT NEUTRAL QUOTE FROM TEXT 6",
                    "EXACT NEUTRAL QUOTE FROM TEXT 7",
                    "EXACT NEUTRAL QUOTE FROM TEXT 8",
                    "EXACT NEUTRAL QUOTE FROM TEXT 9",
                    "EXACT NEUTRAL QUOTE FROM TEXT 10"
                ],
                "negative": [
                    "EXACT NEGATIVE QUOTE FROM TEXT 1",
                    "EXACT NEGATIVE QUOTE FROM TEXT 2",
                    "EXACT NEGATIVE QUOTE FROM TEXT 3",
                    "EXACT NEGATIVE QUOTE FROM TEXT 4",
                    "EXACT NEGATIVE QUOTE FROM TEXT 5",
                    "EXACT NEGATIVE QUOTE FROM TEXT 6",
                    "EXACT NEGATIVE QUOTE FROM TEXT 7",
                    "EXACT NEGATIVE QUOTE FROM TEXT 8",
                    "EXACT NEGATIVE QUOTE FROM TEXT 9",
                    "EXACT NEGATIVE QUOTE FROM TEXT 10"
                ]
            }
        }

        CRITICAL REQUIREMENTS:
        - Each statement MUST be an EXACT quote from the text - do not rewrite, summarize, or paraphrase
        - Ensure statements are diverse, covering different topics mentioned in the interview
        - Each statement should be meaningful and express complete thoughts
        - Filter out all noise using the rules above
        - Extract statements from interviewee responses, not interviewer questions
        - DO NOT leave any category empty - find at least 10 examples for each sentiment type
        - Ensure your JSON is valid and properly formatted
        """
