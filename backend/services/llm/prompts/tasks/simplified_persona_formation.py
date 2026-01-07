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

        # Get speaker name (the actual name of the person being analyzed)
        speaker_name = data.get("speaker_name")

        # Limit sample size - using full text with Gemini 3 Flash's 1M context
        # Increased from 8k to 100k to preserve complete interview content
        text_sample = data.get("text", "")[
            :100000
        ]  # Using full text with Gemini 3 Flash's large context window

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_persona_guidance(industry)
            return SimplifiedPersonaFormationPrompts.industry_specific_prompt(
                industry, industry_guidance, text_sample, role, speaker_name=speaker_name
            )

        # Fallback to standard persona formation prompt if no specific prompt provided
        return SimplifiedPersonaFormationPrompts.standard_prompt(text_sample, role, speaker_name=speaker_name)

    @staticmethod
    def industry_specific_prompt(
        industry: str, industry_guidance: str, text_sample: str, role: str,
        speaker_name: str = None
    ) -> str:
        """
        Get industry-specific simplified persona formation prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            text_sample: Interview text sample
            role: Role of the person (Interviewer, Interviewee, Participant)
            speaker_name: Optional actual name of the speaker (e.g., "Alex", "Jordan")

        Returns:
            System message string with industry-specific guidance
        """
        # Build speaker context for the prompt
        if speaker_name:
            speaker_context = f"This persona is for the specific person named '{speaker_name}' who has the role of {role}."
            name_instruction = f"Use '{speaker_name}' as the persona name. Do NOT invent a fictional name."
        else:
            speaker_context = f"This persona is for a {role}."
            name_instruction = "Use a descriptive persona name based on their role and characteristics."

        return f"""You are an expert persona analyst. Your task is to create a persona STRICTLY from the interview content provided below.

CRITICAL ANTI-HALLUCINATION RULES (MUST FOLLOW):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ONLY use information explicitly stated in the INTERVIEW CONTENT below OR strongly implied by their described actions/workflows
2. DO NOT use external knowledge, generic templates, or assumptions
3. DO NOT invent tools, software, or terminology not mentioned in the text
   - If "Jira" is not in the text, do NOT mention Jira
   - If "Salesforce" is not in the text, do NOT mention Salesforce
   - If "technical debt" is not in the text, do NOT mention technical debt
   - If "sprints" is not in the text, do NOT mention sprints
4. ALL quotes in key_quotes MUST be VERBATIM from the interview text
5. ALL tools/software mentioned MUST appear in the interview text
6. If information is not in the text, leave that field empty or say "Not mentioned"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK: Create a SimplifiedPersona for the {role} using ONLY the interview content below.

SPEAKER IDENTITY: {speaker_context}

INDUSTRY CONTEXT: {industry.upper()}
{industry_guidance}

INTERVIEW CONTENT (USE ONLY THIS - NO EXTERNAL KNOWLEDGE):
{text_sample}

EXTRACTION APPROACH:
1. Read the interview carefully and identify what tools/systems they ACTUALLY mention
2. Note their ACTUAL job responsibilities as described in their own words
3. Extract their REAL challenges as they describe them. **INFER challenges from described workflow frictions or complaints.**
4. **INFER goals from their described responsibilities and what they are trying to achieve/optimize.**
5. Copy EXACT quotes - do not paraphrase or invent quotes
6. Use their terminology (e.g., if they say "MMPs", "Reward Curves", "CPIs" - use those terms)

SIMPLIFIED PERSONA FORMAT:
Generate a JSON object with these fields. Leave empty or write "Not mentioned in interview" if info is not available:

{{
  "name": "{speaker_name if speaker_name else 'Descriptive persona name based on role'}",
  "description": "Summary based ONLY on what they actually said in the interview about their role in {industry}",
  "archetype": "Role category based on their stated responsibilities in {industry}",

  "demographics": "REQUIRED. Extract or infer Role, Industry, and Experience Level. If not explicitly stated, infer from context. Do NOT leave empty. Example: 'Senior Account Manager, AdTech, 5+ years'.",
  "goals_and_motivations": "REQUIRED. Extract explicit goals OR INFER them from their described responsibilities and desired outcomes. Look for what they are trying to optimize, achieve, or improve.",
  "challenges_and_frustrations": "REQUIRED. Extract described challenges OR INFER them from described workflow frictions, annoyances, or complaints (e.g., 'It takes too long to X' -> Challenge: Time consuming manual process X).",
  "skills_and_expertise": "Skills evident from their statements",
  "technology_and_tools": "ONLY tools/systems they explicitly mentioned by name (e.g., if they mention 'Sensor Tower' or 'Quicksight', include those - NOT generic tools)",
  "pain_points": "Problems they specifically described in their own words",
  "workflow_and_environment": "Workflow details they mentioned",
  "needs_and_expectations": "Needs they expressed",

  "key_quotes": ["EXACT verbatim quote 1 from interview", "EXACT verbatim quote 2", "EXACT verbatim quote 3"],

  "overall_confidence": 0.85,
  "structured_demographics": {{
    "experience_level": {{
      "value": "Only if mentioned",
      "evidence": ["Exact quote about experience"]
    }},
    "industry": {{
      "value": "{industry} - their specific area as stated",
      "evidence": ["Exact quote about their work"]
    }},
    "confidence": 0.85
  }}
}}

FINAL CHECK BEFORE OUTPUT:
- Are ALL quotes copy-pasted from the interview text? (not paraphrased)
- Are ALL tools/software mentioned actually in the interview? (no Jira/Salesforce if not mentioned)
- Is the description based on their actual statements? (not a generic {industry} template)
- {name_instruction}

OUTPUT: SimplifiedPersona JSON using ONLY evidence from the interview content above."""

    @staticmethod
    def standard_prompt(text_sample: str, role: str, speaker_name: str = None) -> str:
        """
        Get standard simplified persona formation prompt.

        UPDATED: Now uses correct SimplifiedPersona format with simple string fields
        instead of complex nested objects to match the SimplifiedPersona schema.

        Args:
            text_sample: Interview text sample
            role: Role of the person (Interviewer, Interviewee, Participant)
            speaker_name: Optional actual name of the speaker (e.g., "Alex", "Jordan")

        Returns:
            System message string optimized for SimplifiedPersona schema
        """
        # Build speaker context for the prompt
        if speaker_name:
            speaker_context = f"SPEAKER IDENTITY: This persona is for the specific person named '{speaker_name}' who has the role of {role}."
            name_instruction = f"Use '{speaker_name}' as the persona name. Do NOT invent a fictional name like 'Jordan' or 'Sarah'."
            name_field_example = speaker_name
        else:
            speaker_context = f"This persona is for a {role}."
            name_instruction = "Use a descriptive persona name based on their role and characteristics."
            name_field_example = "Descriptive persona name based on role"

        return f"""You are an expert persona analyst. Your task is to create a persona STRICTLY from the interview content provided below.

CRITICAL ANTI-HALLUCINATION RULES (MUST FOLLOW):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ONLY use information explicitly stated in the INTERVIEW CONTENT below OR strongly implied by their described actions/workflows
2. DO NOT use external knowledge, generic templates, or assumptions
3. DO NOT invent tools, software, or terminology not mentioned in the text
   - If "Jira" is not in the text, do NOT mention Jira
   - If "Salesforce" is not in the text, do NOT mention Salesforce
   - If "technical debt" is not in the text, do NOT mention technical debt
   - If "sprints" is not in the text, do NOT mention sprints
4. ALL quotes in key_quotes MUST be VERBATIM from the interview text
5. ALL tools/software mentioned MUST appear in the interview text
6. If information is not in the text, leave that field empty or say "Not mentioned"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK: Create a SimplifiedPersona for the {role} using ONLY the interview content below.

{speaker_context}

INTERVIEW CONTENT (USE ONLY THIS - NO EXTERNAL KNOWLEDGE):
{text_sample}

EXTRACTION APPROACH:
1. Read the interview carefully and identify what tools/systems they ACTUALLY mention
2. Note their ACTUAL job responsibilities as described in their own words
3. Extract their REAL challenges as they describe them. **INFER challenges from described workflow frictions or complaints.**
4. **INFER goals from their described responsibilities and what they are trying to achieve/optimize.**
5. Copy EXACT quotes - do not paraphrase or invent quotes
6. Use their terminology, not generic industry terms

SIMPLIFIED PERSONA FORMAT:
Generate a JSON object with these fields. Leave empty or write "Not mentioned in interview" if info is not available:

{{
  "name": "{name_field_example}",
  "description": "Summary based ONLY on what {name_field_example if speaker_name else 'they'} actually said in the interview",
  "archetype": "Role category based on their stated responsibilities",

  "demographics": "REQUIRED. Extract or infer Role, Industry, and Experience Level. If not explicitly stated, infer from context. Do NOT leave empty. Example: 'Senior Account Manager, AdTech, 5+ years'.",
  "goals_and_motivations": "REQUIRED. Extract explicit goals OR INFER them from their described responsibilities and desired outcomes. Look for what they are trying to optimize, achieve, or improve.",
  "challenges_and_frustrations": "REQUIRED. Extract described challenges OR INFER them from described workflow frictions, annoyances, or complaints (e.g., 'It takes too long to X' -> Challenge: Time consuming manual process X).",
  "skills_and_expertise": "Skills evident from their statements",
  "technology_and_tools": "ONLY tools/systems they explicitly mentioned by name in the interview",
  "pain_points": "Problems they specifically described",
  "workflow_and_environment": "Workflow details they mentioned",
  "needs_and_expectations": "Needs they expressed",

  "key_quotes": ["EXACT verbatim quote 1 from interview", "EXACT verbatim quote 2", "EXACT verbatim quote 3"],

  "overall_confidence": 0.85,
  "structured_demographics": {{
    "experience_level": {{
      "value": "Only if mentioned",
      "evidence": ["Exact quote about experience"]
    }},
    "industry": {{
      "value": "Their actual industry as stated",
      "evidence": ["Exact quote about industry"]
    }},
    "confidence": 0.85
  }}
}}

FINAL CHECK BEFORE OUTPUT:
- Are ALL quotes copy-pasted from the interview text? (not paraphrased)
- Are ALL tools/software mentioned actually in the interview? (no Jira/Salesforce if not mentioned)
- Is the description based on their actual statements? (not a generic template)
- {name_instruction}

OUTPUT: SimplifiedPersona JSON using ONLY evidence from the interview content above."""
