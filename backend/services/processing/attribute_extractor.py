"""
Attribute extractor module for persona formation.

This module provides functionality for:
1. Extracting attributes from text using LLM
2. Enhancing evidence fields
3. Cleaning and validating attributes
"""

from typing import Dict, Any, List, Optional
import logging
import json
import re
from pydantic import ValidationError

# Import LLM interface
try:
    # Try to import from backend structure
    from domain.interfaces.llm_unified import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from domain.interfaces.llm_unified import ILLMService
    except ImportError:
        # Create a minimal interface if both fail
        class ILLMService:
            """Minimal LLM service interface"""
            async def generate_response(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

# Configure logging
logger = logging.getLogger(__name__)


class AttributeExtractor:
    """
    Extracts persona attributes from text using LLM and enhances them with evidence.
    """

    def __init__(self, llm_service: ILLMService):
        """
        Initialize the attribute extractor.

        Args:
            llm_service: LLM service for text analysis
        """
        self.llm_service = llm_service
        logger.info(f"Initialized AttributeExtractor with {llm_service.__class__.__name__}")

    async def extract_attributes_from_text(
        self, text: str, role: str = "Participant"
    ) -> Dict[str, Any]:
        """
        Extract persona attributes from text using LLM.

        Args:
            text: Text to extract attributes from
            role: Role of the person in the text (Interviewer, Interviewee, Participant)

        Returns:
            Dictionary of persona attributes
        """
        logger.info(f"Extracting attributes for {role} from {len(text)} chars of text")

        try:
            # Create prompt based on role
            prompt = self._create_enhanced_persona_prompt(text, role)

            # Use more text for analysis with Gemini 2.5 Pro's larger context window
            text_to_analyze = text
            if len(text) > 16000:  # If text is very long, use a reasonable chunk
                logger.info(f"Text is very long ({len(text)} chars), using first 16000 chars")
                text_to_analyze = text[:16000]

            # Call LLM to extract attributes
            llm_response = await self.llm_service.analyze({
                "task": "persona_formation",
                "text": text_to_analyze,
                "prompt": prompt,
                "enforce_json": True  # Flag to enforce JSON output using response_mime_type
            })

            # Parse the response
            attributes = self._parse_llm_json_response(llm_response, f"extract_attributes_from_text for {role}")

            # Clean and enhance attributes
            if attributes:
                # Clean the attributes
                attributes = self._clean_persona_attributes(attributes)

                # Enhance evidence fields
                attributes = self._enhance_evidence_fields(attributes, text)

                # Fix trait value formatting
                attributes = self._fix_trait_value_formatting(attributes)

                logger.info(f"Successfully extracted and enhanced attributes for {role}")
                return attributes
            else:
                logger.warning(f"Failed to extract attributes for {role}, returning fallback attributes")
                return self._create_fallback_attributes(role)

        except Exception as e:
            logger.error(f"Error extracting attributes for {role}: {str(e)}", exc_info=True)
            return self._create_fallback_attributes(role)

    def _parse_llm_json_response(self, response: str, context: str = "") -> Dict[str, Any]:
        """
        Parse JSON response from LLM.

        Args:
            response: LLM response string
            context: Context for error logging

        Returns:
            Parsed JSON as dictionary
        """
        if not response:
            logger.warning(f"Empty response from LLM in {context}")
            return {}

        try:
            # Try to parse as JSON directly
            return json.loads(response)
        except json.JSONDecodeError:
            # If direct parsing fails, try to extract JSON from the response
            try:
                # Look for JSON object in the response
                json_match = re.search(r'({[\s\S]*})', response)
                if json_match:
                    json_str = json_match.group(1)
                    return json.loads(json_str)
                else:
                    logger.warning(f"No JSON object found in response: {context}")
                    return {}
            except Exception as e:
                logger.error(f"Error parsing JSON from LLM response in {context}: {str(e)}")
                return {}

    def _clean_persona_attributes(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Clean and validate persona attributes.

        Args:
            attributes: Raw persona attributes

        Returns:
            Cleaned persona attributes
        """
        logger.info("Cleaning persona attributes")

        # Ensure all required fields are present
        required_fields = [
            "name", "description", "archetype"
        ]

        for field in required_fields:
            if field not in attributes:
                attributes[field] = "" if field != "archetype" else "Unknown"

        # Ensure all trait fields are present and properly structured
        trait_fields = [
            "demographics", "goals_and_motivations", "skills_and_expertise",
            "workflow_and_environment", "challenges_and_frustrations",
            "needs_and_desires", "technology_and_tools", "attitude_towards_research",
            "attitude_towards_ai", "key_quotes", "role_context", "key_responsibilities",
            "tools_used", "collaboration_style", "analysis_approach", "pain_points"
        ]

        for field in trait_fields:
            if field not in attributes or not isinstance(attributes[field], dict):
                attributes[field] = {
                    "value": "",
                    "confidence": 0.5,
                    "evidence": []
                }
            else:
                # Ensure trait has all required fields
                trait = attributes[field]
                if "value" not in trait:
                    trait["value"] = ""
                if "confidence" not in trait:
                    trait["confidence"] = 0.5
                if "evidence" not in trait:
                    trait["evidence"] = []

                # Ensure confidence is a float between 0 and 1
                try:
                    trait["confidence"] = float(trait["confidence"])
                    trait["confidence"] = max(0.0, min(1.0, trait["confidence"]))
                except (ValueError, TypeError):
                    trait["confidence"] = 0.5

                # Ensure evidence is a list of strings
                if not isinstance(trait["evidence"], list):
                    trait["evidence"] = []
                trait["evidence"] = [str(e) for e in trait["evidence"] if e]

        # Ensure patterns, confidence, and evidence are present
        if "patterns" not in attributes or not isinstance(attributes["patterns"], list):
            attributes["patterns"] = []

        if "confidence" not in attributes:
            attributes["confidence"] = 0.7
        else:
            try:
                attributes["confidence"] = float(attributes["confidence"])
                attributes["confidence"] = max(0.0, min(1.0, attributes["confidence"]))
            except (ValueError, TypeError):
                attributes["confidence"] = 0.7

        if "evidence" not in attributes or not isinstance(attributes["evidence"], list):
            attributes["evidence"] = []

        return attributes

    def _enhance_evidence_fields(self, attributes: Dict[str, Any], text: str) -> Dict[str, Any]:
        """
        Enhance evidence fields with specific quotes from the text.

        Args:
            attributes: Persona attributes
            text: Original text

        Returns:
            Enhanced persona attributes
        """
        logger.info("Enhancing evidence fields")

        # List of trait fields to enhance
        trait_fields = [
            "demographics", "goals_and_motivations", "skills_and_expertise",
            "workflow_and_environment", "challenges_and_frustrations",
            "needs_and_desires", "technology_and_tools", "attitude_towards_research",
            "attitude_towards_ai", "key_quotes", "role_context", "key_responsibilities",
            "tools_used", "collaboration_style", "analysis_approach", "pain_points"
        ]

        # For each trait field, ensure evidence contains specific quotes
        for field in trait_fields:
            if field in attributes and isinstance(attributes[field], dict):
                # Get the current evidence
                evidence = attributes[field].get("evidence", [])

                # If evidence is empty or contains only general statements, try to find specific quotes
                if not evidence or all(len(e) < 10 for e in evidence):
                    # Extract key terms from the value
                    value = attributes[field].get("value", "")
                    if value:
                        # Split value into key terms
                        key_terms = [term.strip() for term in value.split(',')]
                        key_terms.extend([term.strip() for term in value.split('.')])
                        key_terms = [term for term in key_terms if len(term) > 5]

                        # Find sentences in the text that contain these key terms
                        new_evidence = []
                        sentences = re.split(r'[.!?]', text)
                        for term in key_terms:
                            for sentence in sentences:
                                if term.lower() in sentence.lower() and len(sentence.strip()) > 10:
                                    new_evidence.append(sentence.strip())
                                    if len(new_evidence) >= 3:  # Limit to 3 pieces of evidence
                                        break
                            if len(new_evidence) >= 3:
                                break

                        # Update evidence if we found any
                        if new_evidence:
                            attributes[field]["evidence"] = new_evidence
                            attributes[field]["confidence"] = min(attributes[field].get("confidence", 0.5) + 0.1, 1.0)

        return attributes

    def _fix_trait_value_formatting(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fix formatting issues in trait values.

        Args:
            attributes: Persona attributes

        Returns:
            Fixed persona attributes
        """
        logger.info("Fixing trait value formatting")

        # List of trait fields to fix
        trait_fields = [
            "demographics", "goals_and_motivations", "skills_and_expertise",
            "workflow_and_environment", "challenges_and_frustrations",
            "needs_and_desires", "technology_and_tools", "attitude_towards_research",
            "attitude_towards_ai", "key_quotes", "role_context", "key_responsibilities",
            "tools_used", "collaboration_style", "analysis_approach", "pain_points"
        ]

        # For each trait field, fix formatting issues
        for field in trait_fields:
            if field in attributes and isinstance(attributes[field], dict):
                value = attributes[field].get("value", "")

                # Fix common formatting issues
                if isinstance(value, list):
                    # Convert list to string
                    attributes[field]["value"] = ", ".join(str(v) for v in value if v)
                elif isinstance(value, dict):
                    # Convert dict to string
                    attributes[field]["value"] = ", ".join(f"{k}: {v}" for k, v in value.items() if v)

                # Remove any markdown formatting
                value = attributes[field].get("value", "")
                value = re.sub(r'[*_#]', '', value)
                attributes[field]["value"] = value

        return attributes

    def _create_fallback_attributes(self, role: str) -> Dict[str, Any]:
        """
        Create fallback attributes when extraction fails.

        Args:
            role: Role of the person (Interviewer, Interviewee, Participant)

        Returns:
            Fallback attributes
        """
        logger.info(f"Creating fallback attributes for {role}")

        # Create a default trait
        default_trait = {
            "value": f"Unknown {role}",
            "confidence": 0.3,
            "evidence": [f"Fallback trait for {role}"]
        }

        # Create fallback attributes
        return {
            "name": f"{role}",
            "description": f"Default {role} due to extraction failure",
            "archetype": "Unknown",
            # Detailed attributes
            "demographics": default_trait.copy(),
            "goals_and_motivations": default_trait.copy(),
            "skills_and_expertise": default_trait.copy(),
            "workflow_and_environment": default_trait.copy(),
            "challenges_and_frustrations": default_trait.copy(),
            "needs_and_desires": default_trait.copy(),
            "technology_and_tools": default_trait.copy(),
            "attitude_towards_research": default_trait.copy(),
            "attitude_towards_ai": default_trait.copy(),
            "key_quotes": default_trait.copy(),
            # Legacy fields
            "role_context": default_trait.copy(),
            "key_responsibilities": default_trait.copy(),
            "tools_used": default_trait.copy(),
            "collaboration_style": default_trait.copy(),
            "analysis_approach": default_trait.copy(),
            "pain_points": default_trait.copy(),
            # Overall persona information
            "patterns": [],
            "confidence": 0.3,
            "evidence": [f"Fallback persona for {role}"]
        }

    def _create_enhanced_persona_prompt(self, text: str, role: str) -> str:
        """
        Create an enhanced prompt for persona formation.

        Args:
            text: Text to analyze
            role: Role of the person (Interviewer, Interviewee, Participant)

        Returns:
            Enhanced prompt
        """
        if role == "Interviewer":
            return self._create_enhanced_interviewer_prompt(text)
        elif role == "Interviewee":
            return self._create_enhanced_interviewee_prompt(text)
        else:
            return self._create_enhanced_participant_prompt(text)

    def _create_enhanced_interviewer_prompt(self, text: str) -> str:
        """
        Create an enhanced prompt for interviewer persona formation.

        Args:
            text: Text to analyze

        Returns:
            Enhanced prompt
        """
        return f"""
        CRITICAL INSTRUCTION: Your ENTIRE response must be a single, valid JSON object. Start with '{{' and end with '}}'. DO NOT include ANY text, comments, or markdown formatting before or after the JSON.

        Analyze the following interview text excerpt and create a comprehensive, detailed interviewer persona profile with specific, concrete details.

        INTERVIEW TEXT:
        {text}

        IMPORTANT: For each attribute, include EXACT QUOTES from the text as evidence. Do not paraphrase or summarize.
        Extract at least 3-5 direct quotes for each attribute whenever possible.

        FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT with the following structure:
        {{
            "name": "Descriptive name for the interviewer (e.g., 'Methodical UX Researcher')",
            "description": "Brief 1-3 sentence overview of the interviewer",
            "archetype": "General category (e.g., 'Research Professional', 'Design Facilitator')",

            "demographics": {{
                "value": "Age, experience level, professional background",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "goals_and_motivations": {{
                "value": "Primary research objectives and motivations",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "skills_and_expertise": {{
                "value": "Technical and soft skills demonstrated",
                "confidence": 0.75,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "workflow_and_environment": {{
                "value": "Interview approach and environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "challenges_and_frustrations": {{
                "value": "Difficulties faced during the interview",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "needs_and_desires": {{
                "value": "What the interviewer is trying to achieve",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "technology_and_tools": {{
                "value": "Tools or methods mentioned",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_research": {{
                "value": "Approach to research and data",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_ai": {{
                "value": "Views on AI and technology",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_quotes": {{
                "value": "Representative quotes from the interviewer",
                "confidence": 0.9,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "role_context": {{
                "value": "Primary job function and work environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_responsibilities": {{
                "value": "Main tasks and responsibilities",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "tools_used": {{
                "value": "Specific tools or methods used",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "collaboration_style": {{
                "value": "How they work with others",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "analysis_approach": {{
                "value": "How they approach problems/analysis",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "pain_points": {{
                "value": "Specific challenges mentioned",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
            "confidence": 0.8,
            "evidence": ["Overall evidence 1", "Overall evidence 2", "Overall evidence 3"]
        }}
        """

    def _create_enhanced_interviewee_prompt(self, text: str) -> str:
        """
        Create an enhanced prompt for interviewee persona formation.

        Args:
            text: Text to analyze

        Returns:
            Enhanced prompt
        """
        return f"""
        CRITICAL INSTRUCTION: Your ENTIRE response must be a single, valid JSON object. Start with '{{' and end with '}}'. DO NOT include ANY text, comments, or markdown formatting before or after the JSON.

        Analyze the following interview text excerpt and create a comprehensive, detailed user persona profile with specific, concrete details.

        INTERVIEW TEXT:
        {text}

        IMPORTANT: For each attribute, include EXACT QUOTES from the text as evidence. Do not paraphrase or summarize.
        Extract at least 3-5 direct quotes for each attribute whenever possible.

        FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT with the following structure:
        {{
            "name": "Descriptive name for the persona (e.g., 'Data-Driven Product Manager')",
            "description": "Brief 1-3 sentence overview of the persona",
            "archetype": "General category (e.g., 'Decision Maker', 'Technical Expert')",

            "demographics": {{
                "value": "Age, gender, education, experience level",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "goals_and_motivations": {{
                "value": "Primary objectives and driving factors",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "skills_and_expertise": {{
                "value": "Technical and soft skills, knowledge areas",
                "confidence": 0.75,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "workflow_and_environment": {{
                "value": "Work processes and environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "challenges_and_frustrations": {{
                "value": "Pain points and obstacles",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "needs_and_desires": {{
                "value": "Specific needs and desires",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "technology_and_tools": {{
                "value": "Software, hardware, and tools used",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_research": {{
                "value": "Views on research and data",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_ai": {{
                "value": "Perspective on AI and automation",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_quotes": {{
                "value": "Representative quotes that capture the persona's voice",
                "confidence": 0.9,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "role_context": {{
                "value": "Primary job function and work environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_responsibilities": {{
                "value": "Main tasks and responsibilities",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "tools_used": {{
                "value": "Specific tools or methods used",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "collaboration_style": {{
                "value": "How they work with others",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "analysis_approach": {{
                "value": "How they approach problems/analysis",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "pain_points": {{
                "value": "Specific challenges mentioned",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
            "confidence": 0.8,
            "evidence": ["Overall evidence 1", "Overall evidence 2", "Overall evidence 3"]
        }}
        """

    def _create_enhanced_participant_prompt(self, text: str) -> str:
        """
        Create an enhanced prompt for general participant persona formation.

        Args:
            text: Text to analyze

        Returns:
            Enhanced prompt
        """
        return f"""
        CRITICAL INSTRUCTION: Your ENTIRE response must be a single, valid JSON object. Start with '{{' and end with '}}'. DO NOT include ANY text, comments, or markdown formatting before or after the JSON.

        Analyze the following text excerpt and create a comprehensive, detailed persona profile with specific, concrete details.

        TEXT:
        {text}

        IMPORTANT: For each attribute, include EXACT QUOTES from the text as evidence. Do not paraphrase or summarize.
        Extract at least 3-5 direct quotes for each attribute whenever possible.

        FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT with the following structure:
        {{
            "name": "Descriptive name for the persona (e.g., 'Analytical Business Strategist')",
            "description": "Brief 1-3 sentence overview of the persona",
            "archetype": "General category (e.g., 'Decision Maker', 'Technical Expert')",

            "demographics": {{
                "value": "Age, gender, education, experience level",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "goals_and_motivations": {{
                "value": "Primary objectives and driving factors",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "skills_and_expertise": {{
                "value": "Technical and soft skills, knowledge areas",
                "confidence": 0.75,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "workflow_and_environment": {{
                "value": "Work processes and environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "challenges_and_frustrations": {{
                "value": "Pain points and obstacles",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "needs_and_desires": {{
                "value": "Specific needs and desires",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "technology_and_tools": {{
                "value": "Software, hardware, and tools used",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_research": {{
                "value": "Views on research and data",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "attitude_towards_ai": {{
                "value": "Perspective on AI and automation",
                "confidence": 0.6,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_quotes": {{
                "value": "Representative quotes that capture the persona's voice",
                "confidence": 0.9,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "role_context": {{
                "value": "Primary job function and work environment",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "key_responsibilities": {{
                "value": "Main tasks and responsibilities",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "tools_used": {{
                "value": "Specific tools or methods used",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "collaboration_style": {{
                "value": "How they work with others",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "analysis_approach": {{
                "value": "How they approach problems/analysis",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},
            "pain_points": {{
                "value": "Specific challenges mentioned",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2", "Quote 3"]
            }},

            "patterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
            "confidence": 0.8,
            "evidence": ["Overall evidence 1", "Overall evidence 2", "Overall evidence 3"]
        }}
        """
