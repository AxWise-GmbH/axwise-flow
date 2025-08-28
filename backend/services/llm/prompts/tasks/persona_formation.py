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

        # Dynamic sample limit based on content size - Increased to provide more context
        # Original limit was 3500, which is too short for detailed persona extraction.
        # Gemini 2.5 Pro has a large context window, so we can be more generous.
        if len(original_text_input) > 200000:  # Very large datasets (200K+ chars)
            TEXT_SAMPLE_LIMIT = 100000  # Use first 100K chars
        elif len(original_text_input) > 100000:  # Large datasets (100K+ chars)
            TEXT_SAMPLE_LIMIT = 80000  # Use first 80K chars
        elif len(original_text_input) > 50000:  # Medium datasets (50K+ chars)
            TEXT_SAMPLE_LIMIT = 50000  # Use first 50K chars
        else:  # Small datasets
            TEXT_SAMPLE_LIMIT = len(original_text_input)  # Use full content

        # Apply the limit to create the text_sample
        text_sample = original_text_input[:TEXT_SAMPLE_LIMIT]

        if len(original_text_input) > TEXT_SAMPLE_LIMIT:
            logger.info(
                f"PersonaFormationPrompts: Using dynamic text sample of {TEXT_SAMPLE_LIMIT} chars (original: {len(original_text_input)} chars)"
            )
        else:
            logger.info(
                f"PersonaFormationPrompts: Using full text sample of {len(original_text_input)} chars"
            )

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_persona_guidance(industry)
            return PersonaFormationPrompts.industry_specific_prompt(
                industry, industry_guidance, text_sample
            )

        # Fallback to standard persona formation prompt if no specific prompt provided
        return PersonaFormationPrompts.standard_prompt(text_sample)

    @staticmethod
    def industry_specific_prompt(
        industry: str, industry_guidance: str, text_sample: str
    ) -> str:
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
        4. demographics: Extract demographic information as a structured object with specific fields (experience_level, roles, industry, location, age_range, professional_context). ONLY include information that is explicitly mentioned or clearly supported by evidence. Do NOT infer or assume demographics without clear evidence.
        5. role_context: Specific organizational context, team structure, and reporting relationships
        6. key_responsibilities: Primary job duties, tasks, and accountabilities in their role
        7. goals_and_motivations: Primary objectives, aspirations, and driving factors specific to their role in the {industry.upper()} industry
        8. skills_and_expertise: Technical and soft skills, knowledge areas, and expertise levels relevant to the {industry.upper()} industry
        9. workflow_and_environment: Work processes, physical/digital environment, and context typical in the {industry.upper()} industry
        10. tools_used: Specific software applications, hardware devices, and methodologies used regularly
        11. collaboration_style: How they work with others, communication preferences, and team dynamics
        12. analysis_approach: Methods used for problem-solving, decision-making, and evaluating information
        13. challenges_and_frustrations: Pain points, obstacles, and sources of frustration common in the {industry.upper()} industry
        14. pain_points: Specific issues that cause difficulties or inefficiencies in their daily work
        15. technology_and_tools: Software, hardware, and other tools used regularly in the {industry.upper()} industry
        16. key_quotes: 5-7 representative direct quotes from the text that best capture the persona's authentic voice, perspective, challenges, and priorities. Select quotes that reveal their thought process, emotional responses, and unique expressions. This field is REQUIRED and must contain actual quotes from the interview text.

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
            "value": {{
              "experience_level": "Senior/Mid-level/Junior/Executive/etc. - ONLY if explicitly mentioned",
              "roles": ["Primary Role", "Secondary Role"] - ONLY roles explicitly stated,
              "industry": "Industry Name - ONLY if explicitly mentioned",
              "location": "City/Region - ONLY if explicitly stated",
              "age_range": "Age range - ONLY if directly mentioned",
              "professional_context": "Detailed professional background and company context based on explicit information"
            }},
            "confidence": 0.8,
            "evidence": ["Direct quote supporting demographics", "Another supporting quote"]
          }},
          "structured_demographics": {{
            "experience_level": {{
              "value": "Senior/Mid-level/Junior/Executive/etc. - ONLY if explicitly mentioned",
              "evidence": ["Exact quote that specifically mentions experience level, years of experience, or seniority"]
            }},
            "industry": {{
              "value": "Industry Name - ONLY if explicitly mentioned",
              "evidence": ["Exact quote that specifically mentions the industry, company type, or business sector"]
            }},
            "location": {{
              "value": "City/Region - ONLY if explicitly stated",
              "evidence": ["Exact quote that specifically mentions geographic location, city, region, or place"]
            }},
            "age_range": {{
              "value": "Age range - ONLY if directly mentioned",
              "evidence": ["Exact quote that specifically mentions age, age range, or life stage"]
            }},
            "professional_context": {{
              "value": "Detailed professional background and company context based on explicit information",
              "evidence": ["Exact quotes that specifically describe professional background, company context, or work environment"]
            }},
            "roles": {{
              "value": "Primary professional roles - ONLY roles explicitly stated",
              "evidence": ["Exact quotes that specifically mention job titles, roles, or professional positions"]
            }},
            "confidence": 0.8
          }},
          "role_context": {{
            "value": "Detailed organizational context including specific company names, team structure, industry position, and reporting relationships",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "key_responsibilities": {{
            "value": "Primary job duties and tasks",
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
          "tools_used": {{
            "value": "Specific software and hardware tools",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "collaboration_style": {{
            "value": "How they work with others",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "analysis_approach": {{
            "value": "Methods for problem-solving",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "challenges_and_frustrations": {{
            "value": "Pain points and obstacles",
            "confidence": 0.9,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "pain_points": {{
            "value": "Specific issues causing difficulties",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "technology_and_tools": {{
            "value": "Software and hardware used",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "key_quotes": {{
            "value": "Collection of representative quotes",
            "confidence": 0.9,
            "evidence": ["Quote 1", "Quote 2", "Quote 3", "Quote 4", "Quote 5"]
          }},
          "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
          "overall_confidence": 0.75,
          "supporting_evidence_summary": ["Overall evidence 1", "Overall evidence 2"]
        }}

        CRITICAL INSTRUCTIONS FOR STRUCTURED DEMOGRAPHICS:
        1. For each field in structured_demographics, extract ONLY the specific value for that field
        2. Find exact quotes that support ONLY that specific field - do not reuse general quotes
        3. Each evidence array should contain quotes that specifically mention that demographic aspect
        4. Do not put the same quote in multiple evidence arrays unless it truly supports multiple specific claims
        5. If a field cannot be determined from the text, omit it entirely from structured_demographics
        6. Prioritize precision over completeness - better to have fewer fields with perfect evidence than many fields with weak evidence

        EVIDENCE ATTRIBUTION EXAMPLES:
        - experience_level evidence: "I've been working in this field for 8 years" (NOT general work descriptions)
        - industry evidence: "We're a fintech company" (NOT general business talk)
        - location evidence: "I'm based in Berlin" (NOT general geographic references)
        - age_range evidence: "I'm 32 years old" (NOT general life stage mentions)

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

        CRITICAL: JSON STRUCTURE REQUIREMENTS
        Each field must contain both the extracted information AND the specific quotes that support it.
        Use this exact JSON structure for all fields:

        STRUCTURED DEMOGRAPHICS (REQUIRED FORMAT):
        The demographics field must contain these sub-fields, each with value and evidence:
        - experience_level: {{"value": "Senior (7+ years)", "evidence": ["I've been working in this field for 7 years"]}}
        - industry: {{"value": "Technology", "evidence": ["We're a tech company"]}}
        - location: {{"value": "Bremen, Germany", "evidence": ["I live in Bremen"]}}
        - age_range: {{"value": "28-32", "evidence": ["I'm 30 years old"]}}
        - professional_context: {{"value": "Software developer", "evidence": ["I work as a software developer"]}}
        - roles: {{"value": "Team Lead", "evidence": ["I lead a team of developers"]}}
        - confidence: 0.85 (overall confidence for demographics)

        CORE DESIGN THINKING FIELDS (SAME JSON FORMAT):
        4. demographics: Object with sub-fields as shown above
        5. goals_and_motivations: {{"value": "description", "evidence": ["specific quotes supporting goals"]}}
        6. challenges_and_frustrations: {{"value": "description", "evidence": ["specific quotes about challenges"]}}
        7. key_quotes: {{"value": "representative quotes", "evidence": ["context quotes explaining why these are key"]}}

        EVIDENCE ATTRIBUTION RULES:
        1. Each evidence array should contain quotes that specifically support ONLY that field
        2. Do not reuse the same quote across multiple fields unless it truly supports multiple specific claims
        3. Only include demographic fields if you can find explicit evidence in the text
        4. Prioritize precision over completeness - better fewer fields with perfect evidence than many with weak evidence
        5. Each evidence quote must directly and specifically support the value it's paired with

        OVERALL PERSONA INFORMATION:
        8. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
        9. persona_metadata: Additional metadata about the persona creation process (optional)

        CONFIDENCE SCORES:
        Set confidence scores (0.0-1.0) based on evidence strength:
        - overall_confidence: Overall confidence in the persona
        - demographics.confidence: Confidence in demographic extraction
        - Individual field confidence is reflected in the overall_confidence

        CONTEXT-AWARE HIGHLIGHTING RULES:
        When providing supporting quotes in the evidence arrays, use **bold** formatting to highlight ONLY semantically relevant terms that directly support the trait being described:

        For Demographics - Highlight: **age indicators**, **job titles**, **experience levels**, **locations**, **family status**, **education**
        For Goals - Highlight: **desired outcomes**, **motivations**, **success criteria**, **priorities**, **values**, **objectives**
        For Challenges - Highlight: **pain points**, **obstacles**, **limitations**, **frustrations**, **barriers**, **difficulties**
        For Skills - Highlight: **abilities**, **expertise**, **competencies**, **knowledge areas**, **proficiencies**, **certifications**
        For Tools - Highlight: **software names**, **platforms**, **systems**, **technologies**, **equipment**, **applications**
        For Quotes - Highlight: **emotional expressions**, **key problems**, **solutions**, **decision factors**, **priorities**

        DOMAIN-SPECIFIC KEYWORDS TO PRIORITIZE:
        - Service/Maintenance: **maintenance**, **cleaning**, **repair**, **safety**, **equipment**, **professional**, **service**
        - Physical Aspects: **physical**, **climbing**, **ladder**, **roof**, **driveway**, **gutters**, **dangerous**, **height**
        - Time/Resources: **time**, **busy**, **demanding**, **schedule**, **hours**, **weekend**, **availability**, **urgent**
        - Age/Ability: **elderly**, **aging**, **limitations**, **difficult**, **can't**, **unable**, **struggle**, **health**
        - Quality/Trust: **reliable**, **trustworthy**, **professional**, **quality**, **experienced**, **certified**, **reputation**

        CRITICAL: AVOID HIGHLIGHTING GENERIC WORDS:
        Do NOT highlight common function words: **with**, **have**, **their**, **like**, **and**, **the**, **is**, **are**, **was**, **were**, **but**, **or**, **so**, **then**, **when**, **where**, **this**, **that**, **these**, **those**

        EVIDENCE QUALITY REQUIREMENTS:
        - Each evidence quote must contain at least one highlighted term that directly relates to the trait
        - Highlighted keywords should be semantically meaningful and support the trait description
        - Confidence scores should reflect the strength of evidence-to-trait alignment
        - Quotes should be authentic and directly from the interview text

        FORMAT YOUR RESPONSE AS VALID JSON with this exact structure:
        {{
          "name": "Role-Based Name",
          "archetype": "Persona Category",
          "description": "Brief overview of the persona",
          "demographics": {{
            "experience_level": {{
              "value": "Senior (7+ years)",
              "evidence": ["I've been working in software development for about 7 years now"]
            }},
            "industry": {{
              "value": "Technology",
              "evidence": ["We're a tech company focused on innovative solutions"]
            }},
            "location": {{
              "value": "Bremen, Germany",
              "evidence": ["I live in Bremen Nord, in one of the newly developed residential areas"]
            }},
            "age_range": {{
              "value": "28-32",
              "evidence": ["I'm 30 years old and just bought my first house"]
            }},
            "professional_context": {{
              "value": "Software development professional",
              "evidence": ["I've been working in software development for about 7 years now", "We're a tech company focused on innovative solutions"]
            }},
            "roles": {{
              "value": "Senior Developer",
              "evidence": ["I'm a senior developer on the team"]
            }},
            "confidence": 0.95
          }},
          "role_context": {{
            "value": "Detailed organizational context including specific company names, team structure, industry position, and reporting relationships",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "key_responsibilities": {{
            "value": "Primary job duties and tasks",
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
          "tools_used": {{
            "value": "Specific software and hardware tools",
            "confidence": 0.8,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "collaboration_style": {{
            "value": "How they work with others",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "analysis_approach": {{
            "value": "Methods for problem-solving",
            "confidence": 0.7,
            "evidence": ["Quote 1", "Quote 2"]
          }},
          "goals_and_motivations": {{
            "value": "Primary objectives and aspirations with specific details",
            "evidence": ["I want to improve our development process", "My goal is to deliver high-quality software"]
          }},
          "challenges_and_frustrations": {{
            "value": "Pain points and obstacles they face",
            "evidence": ["The biggest challenge is tight deadlines", "I get frustrated when requirements keep changing"]
          }},
          "key_quotes": {{
            "value": "Representative quotes that capture their voice and perspective",
            "evidence": ["This quote shows their thought process", "This quote reveals their priorities"]
          }},
          "overall_confidence": 0.85,
          "persona_metadata": {{
            "is_fallback": false,
            "generation_method": "pydantic_ai_structured_evidence"
          }}
        }}

        IMPORTANT: Output ONLY valid JSON. Do not include any code, variable names, or function calls in your response. Each field must be a proper JSON object with "value" and "evidence" keys.

        CRITICAL INSTRUCTIONS FOR STRUCTURED DEMOGRAPHICS:
        1. For each field in structured_demographics, extract ONLY the specific value for that field
        2. Find exact quotes that support ONLY that specific field - do not reuse general quotes
        3. Each evidence array should contain quotes that specifically mention that demographic aspect
        4. Do not put the same quote in multiple evidence arrays unless it truly supports multiple specific claims
        5. If a field cannot be determined from the text, omit it entirely from structured_demographics
        6. Prioritize precision over completeness - better to have fewer fields with perfect evidence than many fields with weak evidence

        EVIDENCE ATTRIBUTION EXAMPLES:
        - experience_level evidence: "I've been working in this field for 8 years" (NOT general work descriptions)
        - industry evidence: "We're a fintech company" (NOT general business talk)
        - location evidence: "I'm based in Berlin" (NOT general geographic references)
        - age_range evidence: "I'm 32 years old" (NOT general life stage mentions)
        """
