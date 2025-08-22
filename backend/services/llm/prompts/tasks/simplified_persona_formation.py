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
        text_sample = data.get("text", "")[
            :8000
        ]  # Using more text with Gemini 1.5 Flash

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_persona_guidance(industry)
            return SimplifiedPersonaFormationPrompts.industry_specific_prompt(
                industry, industry_guidance, text_sample, role
            )

        # Fallback to standard persona formation prompt if no specific prompt provided
        return SimplifiedPersonaFormationPrompts.standard_prompt(text_sample, role)

    @staticmethod
    def industry_specific_prompt(
        industry: str, industry_guidance: str, text_sample: str, role: str
    ) -> str:
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
        return f"""You are an expert persona analyst specializing in creating detailed, authentic personas from interview content in the {industry.upper()} industry.

TASK: Analyze the provided interview content and create a comprehensive SimplifiedPersona for the {role} with industry-specific insights.

INDUSTRY CONTEXT: {industry.upper()}
{industry_guidance}

INTERVIEW CONTENT:
{text_sample}

ANALYSIS APPROACH:
1. Extract specific demographic details, professional background, and experience level
2. Identify core goals, motivations, and what drives this person professionally
3. Understand their main challenges, frustrations, and pain points
4. Document their skills, expertise, and professional capabilities
5. Note their technology usage patterns, tools, and preferences
6. Capture their workflow style, work environment, and collaboration patterns
7. Understand their needs, expectations, and what they value
8. Extract 3-5 authentic quotes that represent their voice and concerns
9. Apply {industry.upper()} industry-specific context and insights

QUALITY REQUIREMENTS:
- Use specific, detailed information from the interview content
- Avoid generic placeholders - extract real insights
- Set confidence scores based on evidence strength (aim for 80-95% for clear evidence)
- Ensure the persona feels like a real, authentic person
- Include actual quotes, not paraphrases
- Focus on the {role} specifically mentioned in the content
- Apply {industry.upper()} industry context and terminology

SIMPLIFIED PERSONA FORMAT:
Generate a JSON object with these simple string fields (NOT nested objects):

{{

  "name": "Descriptive persona name (e.g., 'Sarah, The Strategic {industry} Balancer')",
  "description": "Brief persona overview summarizing key characteristics in {industry} context",
  "archetype": "Persona category relevant to {industry} (e.g., '{industry}-Focused Strategist')",

  "demographics": "Format as structured key-value pairs: Age Range: [if mentioned], Education: [if mentioned], Location: [if mentioned], Income Level: [if mentioned], Industry Experience: [if mentioned], Company Size: [if mentioned], Role Level: [if mentioned]. Include background, experience level, location, {industry} industry details",
  "goals_motivations": "What drives this person, their primary objectives and aspirations in {industry}",
  "challenges_frustrations": "Specific challenges, obstacles, and sources of frustration in {industry}",
  "skills_expertise": "Professional skills, competencies, areas of knowledge and {industry} expertise",
  "technology_tools": "Technology usage patterns, specific tools used, tech relationship in {industry}",
  "pain_points": "Specific problems and issues they experience regularly in {industry}",
  "workflow_environment": "Work environment, workflow preferences, collaboration style in {industry}",
  "needs_expectations": "What they need from solutions, products, or services and their expectations in {industry}",

  "key_quotes": ["Quote 1 from interview", "Quote 2 from interview", "Quote 3 from interview"],

  "overall_confidence": 0.90,
  "demographics_confidence": 0.85,
  "goals_confidence": 0.90,
  "challenges_confidence": 0.88,
  "skills_confidence": 0.92,
  "technology_confidence": 0.94,
  "pain_points_confidence": 0.87
}}

CRITICAL RULES:
1. Use specific details from the interview content, never generic placeholders
2. Extract real quotes for key_quotes field (3-5 actual quotes from the text)
3. Set confidence scores based on evidence strength (0.8-0.95 for clear evidence)
4. Make personas feel like real, specific people with authentic details
5. Focus on creating rich, detailed content for each field
6. All fields should be simple strings or arrays, NOT nested objects
7. Apply {industry.upper()} industry-specific context throughout

OUTPUT: Complete SimplifiedPersona JSON object with all fields populated using actual evidence from the interview content and {industry} industry context."""

    @staticmethod
    def standard_prompt(text_sample: str, role: str) -> str:
        """
        Get standard simplified persona formation prompt.

        UPDATED: Now uses correct SimplifiedPersona format with simple string fields
        instead of complex nested objects to match the SimplifiedPersona schema.

        Args:
            text_sample: Interview text sample
            role: Role of the person (Interviewer, Interviewee, Participant)

        Returns:
            System message string optimized for SimplifiedPersona schema
        """
        return f"""You are an expert persona analyst specializing in creating detailed, authentic personas from interview content.

TASK: Analyze the provided interview content and create a comprehensive SimplifiedPersona for the {role}.

INTERVIEW CONTENT:
{text_sample}

ANALYSIS APPROACH:
1. Extract specific demographic details, professional background, and experience level
2. Identify core goals, motivations, and what drives this person professionally
3. Understand their main challenges, frustrations, and pain points
4. Document their skills, expertise, and professional capabilities
5. Note their technology usage patterns, tools, and preferences
6. Capture their workflow style, work environment, and collaboration patterns
7. Understand their needs, expectations, and what they value
8. Extract 3-5 authentic quotes that represent their voice and concerns

QUALITY REQUIREMENTS:
- Use specific, detailed information from the interview content
- Avoid generic placeholders - extract real insights
- Set confidence scores based on evidence strength (aim for 80-95% for clear evidence)
- Ensure the persona feels like a real, authentic person
- Include actual quotes, not paraphrases
- Focus on the {role} specifically mentioned in the content

SIMPLIFIED PERSONA FORMAT:
Generate a JSON object with these simple string fields (NOT nested objects):

{{
  "name": "Descriptive persona name (e.g., 'Sarah, The Strategic Balancer')",
  "description": "Brief persona overview summarizing key characteristics",
  "archetype": "Persona category (e.g., 'Product-Driven Strategist')",

  "demographics": "Age, background, experience level, location, industry details",
  "goals_motivations": "What drives this person, their primary objectives and aspirations",
  "challenges_frustrations": "Specific challenges, obstacles, and sources of frustration",
  "skills_expertise": "Professional skills, competencies, areas of knowledge and expertise",
  "technology_tools": "Technology usage patterns, specific tools used, tech relationship",
  "pain_points": "Specific problems and issues they experience regularly",
  "workflow_environment": "Work environment, workflow preferences, collaboration style",
  "needs_expectations": "What they need from solutions, products, or services and their expectations",

  "key_quotes": ["Quote 1 from interview", "Quote 2 from interview", "Quote 3 from interview"],

  "overall_confidence": 0.90,
  "demographics_confidence": 0.85,
  "goals_confidence": 0.90,
  "challenges_confidence": 0.88,
  "skills_confidence": 0.92,
  "technology_confidence": 0.94,
  "pain_points_confidence": 0.87
}}

CRITICAL RULES:
1. Use specific details from the interview content, never generic placeholders
2. Extract real quotes for key_quotes field (3-5 actual quotes from the text)
3. Set confidence scores based on evidence strength (0.8-0.95 for clear evidence)
4. Make personas feel like real, specific people with authentic details
5. Focus on creating rich, detailed content for each field
6. All fields should be simple strings or arrays, NOT nested objects

OUTPUT: Complete SimplifiedPersona JSON object with all fields populated using actual evidence from the interview content."""
