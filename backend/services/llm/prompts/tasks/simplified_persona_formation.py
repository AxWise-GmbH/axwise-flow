"""
Simplified persona formation prompt templates for LLM services.

This module provides simplified prompts for persona formation that are more
reliable for LLMs like Gemini 2.5 Flash.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance

class SimplifiedPersonaFormationPrompts:
    """
    Simplified persona formation prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get simplified persona formation prompt.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        # Add support for direct persona prompts if provided
        if "prompt" in data and data["prompt"]:
            # Use the prompt provided directly by persona_formation service
            return data["prompt"]

        # Check if industry is provided
        industry = data.get("industry")

        # Get role information
        role = data.get("role", "Participant")

        # Limit sample size
        text_sample = data.get("text", "")[:8000]  # Using more text with Gemini 1.5 Flash

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_persona_guidance(industry)
            return SimplifiedPersonaFormationPrompts.industry_specific_prompt(industry, industry_guidance, text_sample, role)

        # Fallback to standard persona formation prompt if no specific prompt provided
        return SimplifiedPersonaFormationPrompts.standard_prompt(text_sample, role)

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, text_sample: str, role: str) -> str:
        """
        Get industry-specific simplified persona formation prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            text_sample: Interview text sample
            role: Role of the person (Interviewer, Interviewee, Participant)

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON object. DO NOT include ANY text, comments, or markdown formatting (like ```json) before or after the JSON.

You are an expert user researcher specializing in creating detailed personas from interview transcripts in the {industry.upper()} industry. Your task is to analyze the provided text from a {role.upper()} and create a comprehensive persona.

INDUSTRY CONTEXT: {industry.upper()}

{industry_guidance}

INTERVIEW TEXT (excerpt from {role.upper()}):
{text_sample}

Extract the following details to build a rich, detailed persona specific to the {industry.upper()} industry:

INSTRUCTIONS:
1. Focus ONLY on the {role.upper()} in this transcript.
2. Be specific and concrete - avoid generic descriptions.
3. Include direct quotes and specific examples from the text.
4. Be concise but comprehensive.
5. Ensure all attributes reflect the specific context of the {industry.upper()} industry.

FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT with the following structure:

{{
  "name": "A descriptive name for this {role}",
  "description": "A brief overview of the persona",
  "archetype": "A general category this persona falls into",

  // IMPORTANT: All fields below should be SIMPLE STRINGS or LISTS, NOT nested objects
  // Do NOT use nested structures with "value", "confidence", or "evidence" fields

  "role_context": "How this person functions in their {role} capacity",
  "key_responsibilities": "Main duties and responsibilities",
  "tools_used": "Specific tools and technologies mentioned",
  "collaboration_style": "How they work with others",
  "analysis_approach": "How they analyze problems and make decisions",
  "pain_points": "Specific challenges and frustrations",
  "demographics": "Age, experience level, etc. (if mentioned)",
  "goals_and_motivations": "Primary objectives and driving factors",
  "skills_and_expertise": "Technical and soft skills",
  "workflow_and_environment": "Work processes and context",
  "challenges_and_frustrations": "Obstacles and sources of frustration",
  "needs_and_desires": "Specific needs and wants",
  "technology_and_tools": "Software and hardware used",
  "attitude_towards_research": "Views on research and data",
  "attitude_towards_ai": "Perspective on AI and automation",

  // The only list in the response should be key_quotes
  "key_quotes": ["Quote 1", "Quote 2", "Quote 3"],
  "overall_confidence_score": 0.75
}}

IMPORTANT:
- Include ONLY information that can be reasonably inferred from the text.
- For any field where you don't have enough information, provide your best estimate and note the uncertainty.
- The "key_quotes" field should contain actual quotes from the text that best represent the persona's perspective.
- The "overall_confidence_score" should be a number between 0.0 and 1.0 reflecting your confidence in the accuracy of this persona.
"""

    @staticmethod
    def standard_prompt(text_sample: str, role: str) -> str:
        """
        Get standard simplified persona formation prompt.

        Args:
            text_sample: Interview text sample
            role: Role of the person (Interviewer, Interviewee, Participant)

        Returns:
            System message string
        """
        return f"""
CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON object. DO NOT include ANY text, comments, or markdown formatting (like ```json) before or after the JSON.

You are an expert user researcher specializing in creating detailed personas from interview transcripts. Your task is to analyze the provided text from a {role.upper()} and create a comprehensive persona.

INTERVIEW TEXT (excerpt from {role.upper()}):
{text_sample}

Extract the following details to build a rich, detailed persona:

INSTRUCTIONS:
1. Focus ONLY on the {role.upper()} in this transcript.
2. Be specific and concrete - avoid generic descriptions.
3. Include direct quotes and specific examples from the text.
4. Be concise but comprehensive.

FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT with the following structure:

{{
  "name": "A descriptive name for this {role}",
  "description": "A brief overview of the persona",
  "archetype": "A general category this persona falls into",

  // IMPORTANT: All fields below should be SIMPLE STRINGS or LISTS, NOT nested objects
  // Do NOT use nested structures with "value", "confidence", or "evidence" fields

  "role_context": "How this person functions in their {role} capacity",
  "key_responsibilities": "Main duties and responsibilities",
  "tools_used": "Specific tools and technologies mentioned",
  "collaboration_style": "How they work with others",
  "analysis_approach": "How they analyze problems and make decisions",
  "pain_points": "Specific challenges and frustrations",
  "demographics": "Age, experience level, etc. (if mentioned)",
  "goals_and_motivations": "Primary objectives and driving factors",
  "skills_and_expertise": "Technical and soft skills",
  "workflow_and_environment": "Work processes and context",
  "challenges_and_frustrations": "Obstacles and sources of frustration",
  "needs_and_desires": "Specific needs and wants",
  "technology_and_tools": "Software and hardware used",
  "attitude_towards_research": "Views on research and data",
  "attitude_towards_ai": "Perspective on AI and automation",

  // The only list in the response should be key_quotes
  "key_quotes": ["Quote 1", "Quote 2", "Quote 3"],
  "overall_confidence_score": 0.75
}}

IMPORTANT:
- Include ONLY information that can be reasonably inferred from the text.
- For any field where you don't have enough information, provide your best estimate and note the uncertainty.
- The "key_quotes" field should contain actual quotes from the text that best represent the persona's perspective.
- The "overall_confidence_score" should be a number between 0.0 and 1.0 reflecting your confidence in the accuracy of this persona.
"""
