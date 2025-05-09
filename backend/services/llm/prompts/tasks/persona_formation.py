"""
Persona formation prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance
import logging

logger = logging.getLogger(__name__)

class PersonaFormationPrompts:
    """
    Persona formation prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get persona formation prompt.

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

        # Get the full original text first
        original_text_input = data.get("text", "")

        # Define the sample limit - Increased to provide more context
        # Original limit was 3500, which is too short for detailed persona extraction.
        # Gemini 2.5 Pro has a large context window.
        TEXT_SAMPLE_LIMIT = 32000 
        
        # Apply the limit to create the text_sample
        text_sample = original_text_input[:TEXT_SAMPLE_LIMIT]
        
        if len(original_text_input) > TEXT_SAMPLE_LIMIT:
            logger.info(f"PersonaFormationPrompts: Using truncated text sample of {TEXT_SAMPLE_LIMIT} chars (original: {len(original_text_input)} chars)")
        else:
            logger.info(f"PersonaFormationPrompts: Using full text sample of {len(original_text_input)} chars")

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_persona_guidance(industry)
            return PersonaFormationPrompts.industry_specific_prompt(industry, industry_guidance, text_sample)

        # Fallback to standard persona formation prompt if no specific prompt provided
        return PersonaFormationPrompts.standard_prompt(text_sample)

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, text_sample: str) -> str:
        """
        Get industry-specific persona formation prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            text_sample: Interview text sample

        Returns:
            System message string with industry-specific guidance
        """
        return f"""
        Analyze the following interview text excerpt from the {industry.upper()} industry and create a comprehensive user persona profile that reflects industry-specific characteristics.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        INTERVIEW TEXT (excerpt):
        {text_sample}

        Extract the following details to build a rich, detailed persona specific to the {industry.upper()} industry:

        BASIC INFORMATION:
        1. name: A descriptive role-based name relevant to the {industry.upper()} industry (e.g., "Data-Driven Healthcare Administrator")
        2. archetype: A general category this persona falls into within the {industry.upper()} context (e.g., "Clinical Decision Maker", "Technical Healthcare Expert")
        3. description: A brief 1-3 sentence overview of the persona highlighting their role in the {industry.upper()} industry

        DETAILED ATTRIBUTES (each with value, confidence score 0.0-1.0, and supporting evidence):
        4. demographics: Age, gender, education, experience level, and other demographic information
        5. goals_and_motivations: Primary objectives, aspirations, and driving factors specific to their role in the {industry.upper()} industry
        6. skills_and_expertise: Technical and soft skills, knowledge areas, and expertise levels relevant to the {industry.upper()} industry
        7. workflow_and_environment: Work processes, physical/digital environment, and context typical in the {industry.upper()} industry
        8. challenges_and_frustrations: Pain points, obstacles, and sources of frustration common in the {industry.upper()} industry
        9. needs_and_desires: Specific needs, wants, and desires related to their role in the {industry.upper()} industry
        10. technology_and_tools: Software, hardware, and other tools used regularly in the {industry.upper()} industry
        11. attitude_towards_research: Views on research, data, and evidence-based approaches in the {industry.upper()} context
        12. attitude_towards_ai: Perspective on AI, automation, and technological change in the {industry.upper()} industry
        13. key_quotes: Representative quotes that capture the persona's voice and perspective

        OVERALL PERSONA INFORMATION:
        14. patterns: List of behavioral patterns associated with this persona in the {industry.upper()} industry
        15. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
        16. supporting_evidence_summary: Key evidence supporting the overall persona characterization

        FORMAT YOUR RESPONSE AS JSON with the following structure:
        {{
          "name": "Role-Based Name",
          "archetype": "Persona Category",
          "description": "Brief overview of the persona",
          "demographics": {{
            "value": "Age, experience, etc.",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "goals_and_motivations": {{
            "value": "Primary objectives and aspirations",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "skills_and_expertise": {{
            "value": "Technical and soft skills",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "workflow_and_environment": {{
            "value": "Work processes and context",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "challenges_and_frustrations": {{
            "value": "Pain points and obstacles",
            "confidence": 0.9,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "needs_and_desires": {{
            "value": "Specific needs and wants",
            "confidence": 0.6,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "technology_and_tools": {{
            "value": "Software and hardware used",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "attitude_towards_research": {{
            "value": "Views on research and data",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "attitude_towards_ai": {{
            "value": "Perspective on AI and automation",
            "confidence": 0.6,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "key_quotes": ["Quote 1", "Quote 2", "Quote 3"],
          "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
          "overall_confidence": 0.75,
          "supporting_evidence_summary": ["Overall evidence 1", "Overall evidence 2"]
        }}

        IMPORTANT: Ensure all attributes reflect the specific context of the {industry.upper()} industry.
        """

    @staticmethod
    def standard_prompt(text_sample: str) -> str:
        """
        Get standard persona formation prompt.

        Args:
            text_sample: Interview text sample

        Returns:
            System message string
        """
        return f"""
        Analyze the following interview text excerpt and create a comprehensive user persona profile.

        INTERVIEW TEXT (excerpt):
        {text_sample}

        Extract the following details to build a rich, detailed persona:

        BASIC INFORMATION:
        1. name: A descriptive role-based name (e.g., "Data-Driven Product Manager")
        2. archetype: A general category this persona falls into (e.g., "Decision Maker", "Technical Expert")
        3. description: A brief 1-3 sentence overview of the persona

        DETAILED ATTRIBUTES (each with value, confidence score 0.0-1.0, and supporting evidence):
        4. demographics: Age, gender, education, experience level, and other demographic information
        5. goals_and_motivations: Primary objectives, aspirations, and driving factors
        6. skills_and_expertise: Technical and soft skills, knowledge areas, and expertise levels
        7. workflow_and_environment: Work processes, physical/digital environment, and context
        8. challenges_and_frustrations: Pain points, obstacles, and sources of frustration
        9. needs_and_desires: Specific needs, wants, and desires related to the problem domain
        10. technology_and_tools: Software, hardware, and other tools used regularly
        11. attitude_towards_research: Views on research, data, and evidence-based approaches
        12. attitude_towards_ai: Perspective on AI, automation, and technological change
        13. key_quotes: Representative quotes that capture the persona's voice and perspective

        OVERALL PERSONA INFORMATION:
        14. patterns: List of behavioral patterns associated with this persona
        15. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
        16. supporting_evidence_summary: Key evidence supporting the overall persona characterization

        FORMAT YOUR RESPONSE AS JSON with the following structure:
        {{
          "name": "Role-Based Name",
          "archetype": "Persona Category",
          "description": "Brief overview of the persona",
          "demographics": {{
            "value": "Age, experience, etc.",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "goals_and_motivations": {{
            "value": "Primary objectives and aspirations",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "skills_and_expertise": {{
            "value": "Technical and soft skills",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "workflow_and_environment": {{
            "value": "Work processes and context",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "challenges_and_frustrations": {{
            "value": "Pain points and obstacles",
            "confidence": 0.9,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "needs_and_desires": {{
            "value": "Specific needs and wants",
            "confidence": 0.6,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "technology_and_tools": {{
            "value": "Software and hardware used",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "attitude_towards_research": {{
            "value": "Views on research and data",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "attitude_towards_ai": {{
            "value": "Perspective on AI and automation",
            "confidence": 0.6,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "key_quotes": ["Quote 1", "Quote 2", "Quote 3"],
          "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
          "overall_confidence": 0.75,
          "supporting_evidence_summary": ["Overall evidence 1", "Overall evidence 2"]
        }}
        """
