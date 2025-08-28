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
    from backend.domain.interfaces.llm_unified import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from backend.domain.interfaces.llm_unified import ILLMService
    except ImportError:
        # Create a minimal interface if both fail
        class ILLMService:
            """Minimal LLM service interface"""
            async def generate_response(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

# Import new services
try:
    # Try to import from backend structure
    from backend.services.processing.evidence_linking_service import EvidenceLinkingService
    from backend.services.processing.trait_formatting_service import TraitFormattingService
    from backend.services.processing.adaptive_tool_recognition_service import AdaptiveToolRecognitionService
except ImportError:
    # Try to import from regular structure
    from services.processing.evidence_linking_service import EvidenceLinkingService
    from services.processing.trait_formatting_service import TraitFormattingService
    from services.processing.adaptive_tool_recognition_service import AdaptiveToolRecognitionService

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

        # Initialize the evidence linking service
        self.evidence_linking_service = EvidenceLinkingService(llm_service)

        # Initialize the trait formatting service
        self.trait_formatting_service = TraitFormattingService(llm_service)

        # Initialize the adaptive tool recognition service with enhanced configuration
        self.tool_recognition_service = AdaptiveToolRecognitionService(
            llm_service=llm_service,
            similarity_threshold=0.75,
            learning_enabled=True
        )

        # Log the number of predefined corrections
        correction_count = len(self.tool_recognition_service.learned_corrections)
        logger.info(f"Initialized AdaptiveToolRecognitionService with {correction_count} predefined corrections")

        # Log some key corrections for debugging
        if "mirrorboards" in self.tool_recognition_service.learned_corrections:
            miro_correction = self.tool_recognition_service.learned_corrections["mirrorboards"]
            logger.info(f"Miro correction loaded: 'mirrorboards' → '{miro_correction['tool_name']}' (confidence: {miro_correction['confidence']})")

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

            # Process attributes
            if attributes:
                # Use the new evidence linking service for enhanced evidence
                # This should be done BEFORE converting to nested structures
                try:
                    logger.info("Using EvidenceLinkingService to find relevant quotes")
                    attributes = await self.evidence_linking_service.link_evidence_to_attributes(attributes, text)
                except Exception as e:
                    logger.error(f"Error using EvidenceLinkingService: {str(e)}", exc_info=True)
                    # Fall back to basic evidence enhancement if the service fails
                    attributes = self._enhance_evidence_fields(attributes, text)

                # Use the new trait formatting service for improved formatting
                # This should be done BEFORE converting to nested structures
                try:
                    logger.info("Using TraitFormattingService to improve trait value formatting")
                    attributes = await self.trait_formatting_service.format_trait_values(attributes)
                except Exception as e:
                    logger.error(f"Error using TraitFormattingService: {str(e)}", exc_info=True)
                    # Fall back to basic formatting if the service fails
                    attributes = self._fix_trait_value_formatting(attributes)

                # SOLUTION 1: Analyze the full transcript for tools first, then update the attributes
                try:
                    logger.info("Using AdaptiveToolRecognitionService to improve tool identification")

                    # First, identify all tools in the full transcript
                    logger.info("Identifying all tools in the full transcript")
                    all_identified_tools = await self.tool_recognition_service.identify_tools_in_text(
                        text,  # Use the full transcript as the primary text to analyze
                        ""     # No additional context needed since we're using the full text
                    )

                    if all_identified_tools:
                        logger.info(f"Identified {len(all_identified_tools)} tools in the full transcript")

                        # Format all identified tools
                        all_formatted_tools = self.tool_recognition_service.format_tools_for_persona(
                            all_identified_tools, "bullet"
                        )

                        # Create evidence from identified tools
                        tool_evidence = []
                        for tool in all_identified_tools:
                            if tool.get("confidence", 0) >= 0.8:
                                evidence = f"Identified '{tool['tool_name']}' from '{tool['original_mention']}'"
                                if tool.get("is_misspelling"):
                                    evidence += f" (corrected from possible transcription error)"
                                tool_evidence.append(evidence)

                        # Process both tools_used and technology_and_tools fields
                        for tool_field in ["tools_used", "technology_and_tools"]:
                            if tool_field in attributes:
                                # Update the attribute with all identified tools
                                if isinstance(attributes[tool_field], dict):
                                    attributes[tool_field]["value"] = all_formatted_tools
                                    if tool_evidence:
                                        attributes[tool_field]["evidence"] = tool_evidence
                                        attributes[tool_field]["confidence"] = 0.9  # High confidence
                                else:
                                    attributes[tool_field] = all_formatted_tools

                                logger.info(f"Updated {tool_field} with all tools identified from the full transcript")
                    else:
                        logger.info("No tools identified in the full transcript, falling back to field-specific analysis")

                        # Fall back to analyzing each field individually
                        for tool_field in ["tools_used", "technology_and_tools"]:
                            if tool_field in attributes:
                                # Get the current tool value
                                current_tools = attributes[tool_field]
                                if isinstance(current_tools, dict) and "value" in current_tools:
                                    tool_value = current_tools["value"]
                                else:
                                    tool_value = str(current_tools)

                                # Skip if empty
                                if not tool_value or tool_value.lower() in ["unknown", "n/a", "none"]:
                                    continue

                                # Identify tools in the specific field value, with full text as context
                                field_tools = await self.tool_recognition_service.identify_tools_in_text(tool_value, text)

                                # Format the tools for the persona
                                if field_tools:
                                    # Format as bullet points
                                    formatted_tools = self.tool_recognition_service.format_tools_for_persona(
                                        field_tools, "bullet"
                                    )

                                    # Update the attribute
                                    if isinstance(attributes[tool_field], dict):
                                        attributes[tool_field]["value"] = formatted_tools
                                    else:
                                        attributes[tool_field] = formatted_tools

                                    logger.info(f"Updated {tool_field} with field-specific tool identification")
                except Exception as e:
                    logger.error(f"Error using AdaptiveToolRecognitionService: {str(e)}", exc_info=True)
                    # Continue without tool recognition if it fails

                # NOW convert to nested structures for PersonaBuilder
                attributes = self._clean_persona_attributes(attributes)

                logger.info(f"Successfully extracted and enhanced attributes for {role}")
                return attributes
            else:
                logger.warning(f"Failed to extract attributes for {role}, returning fallback attributes")
                return self._create_fallback_attributes(role)

        except Exception as e:
            logger.error(f"Error extracting attributes for {role}: {str(e)}", exc_info=True)
            return self._create_fallback_attributes(role)

    def _parse_llm_json_response(self, response: Any, context: str = "") -> Dict[str, Any]:
        """
        Parse JSON response from LLM.

        Args:
            response: LLM response (can be a string or a dictionary)
            context: Context for error logging

        Returns:
            Parsed JSON as dictionary
        """
        if not response:
            logger.warning(f"Empty response from LLM in {context}")
            return {}

        # If response is already a dictionary, return it directly
        if isinstance(response, dict):
            logger.info(f"Response is already a dictionary in {context}")
            return response

        # Otherwise, try to parse it as a JSON string
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
        logger.info(f"Attributes before cleaning: {json.dumps(attributes, indent=2)}")

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
            # Check if the field is key_quotes and is a list
            if field in attributes and field == "key_quotes" and isinstance(attributes[field], list) and attributes[field]:
                # Convert list of quotes to structured trait
                quotes_list = attributes[field]
                quotes_value = "\n".join([f"• {quote}" for quote in quotes_list])
                attributes[field] = {
                    "value": quotes_value,
                    "confidence": 0.9,
                    "evidence": quotes_list
                }
                logger.info(f"Converted list of quotes to structured trait for {field}")
            # Check if the field exists as a string value
            elif field in attributes and isinstance(attributes[field], str) and attributes[field]:
                # Convert string value to structured trait
                string_value = attributes[field]
                attributes[field] = {
                    "value": string_value,
                    "confidence": 0.7,
                    "evidence": [f"Extracted from text: {string_value[:100]}..."]
                }
                logger.info(f"Converted string value to structured trait for {field}")
            # Check if the field doesn't exist or isn't a dict
            elif field not in attributes or not isinstance(attributes[field], dict):
                attributes[field] = {
                    "value": "",
                    "confidence": 0.5,
                    "evidence": []
                }
            else:
                # Ensure trait has all required fields
                trait = attributes[field]
                if "value" not in trait or not trait["value"]:
                    # Set default value based on field name
                    default_values = {
                        "demographics": f"Information about {attributes.get('name', 'the persona')}",
                        "goals_and_motivations": "Primary objectives and driving factors",
                        "skills_and_expertise": "Technical and soft skills, knowledge areas",
                        "workflow_and_environment": "Work processes and environment",
                        "challenges_and_frustrations": "Pain points and obstacles",
                        "needs_and_desires": "Specific needs and desires",
                        "technology_and_tools": "Software, hardware, and tools used",
                        "attitude_towards_research": "Views on research and data",
                        "attitude_towards_ai": "Perspective on AI and automation",
                        "key_quotes": "Representative quotes from the text",
                        "role_context": "Primary job function and work environment",
                        "key_responsibilities": "Main tasks and responsibilities",
                        "tools_used": "Specific tools or methods used",
                        "collaboration_style": "How they work with others",
                        "analysis_approach": "How they approach problems/analysis",
                        "pain_points": "Specific challenges mentioned"
                    }
                    default_value = default_values.get(field, f"Information about {field}")
                    logger.info(f"Setting default value for {field}: {default_value}")
                    trait["value"] = default_value

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

                # If evidence is still empty, add a default evidence item
                if not trait["evidence"]:
                    # Add default evidence based on the field
                    default_evidence = {
                        "demographics": ["Inferred from the overall context of the conversation"],
                        "goals_and_motivations": ["Based on statements about objectives and priorities"],
                        "skills_and_expertise": ["Derived from mentions of capabilities and knowledge areas"],
                        "workflow_and_environment": ["Inferred from descriptions of work processes"],
                        "challenges_and_frustrations": ["Based on mentions of difficulties and pain points"],
                        "needs_and_desires": ["Derived from expressions of wants and requirements"],
                        "technology_and_tools": ["Inferred from mentions of software, hardware, and tools"],
                        "attitude_towards_research": ["Based on statements about research and data"],
                        "attitude_towards_ai": ["Derived from mentions of AI and automation"],
                        "key_quotes": ["Representative statements from the text"],
                        "role_context": ["Inferred from descriptions of job function and environment"],
                        "key_responsibilities": ["Based on mentions of tasks and duties"],
                        "tools_used": ["Derived from mentions of specific tools and methods"],
                        "collaboration_style": ["Inferred from descriptions of interactions with others"],
                        "analysis_approach": ["Based on statements about problem-solving methods"],
                        "pain_points": ["Derived from mentions of specific challenges"]
                    }

                    trait["evidence"] = default_evidence.get(field, [f"No specific evidence found in the text for {field}"])

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

        logger.info(f"Attributes after cleaning: {json.dumps(attributes, indent=2)}")
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

    async def _enhance_tool_identification(self, attributes: Dict[str, Any], text: str) -> Dict[str, Any]:
        """
        Enhance tool identification in persona attributes using industry-aware approach.

        Args:
            attributes: Persona attributes
            text: Original text

        Returns:
            Enhanced persona attributes
        """
        logger.info("Enhancing tool identification with industry-aware approach")

        # Tool-related fields
        tool_fields = ["technology_and_tools", "tools_used"]

        for field in tool_fields:
            if field in attributes and isinstance(attributes[field], dict):
                # Get the current value
                current_value = attributes[field].get("value", "")

                # Identify tools with industry context
                identified_tools = await self.tool_recognition_service.identify_tools_in_text(
                    current_value or text,  # Use current value if available, otherwise full text
                    surrounding_context=text  # Always provide full text as context
                )

                # Format tools for persona
                if identified_tools:
                    formatted_tools = self.tool_recognition_service.format_tools_for_persona(identified_tools, "bullet")
                    attributes[field]["value"] = formatted_tools

                    # Add evidence from original mentions
                    tool_evidence = []
                    for tool in identified_tools:
                        if tool.get("confidence", 0) >= 0.8:
                            evidence = f"Identified '{tool['tool_name']}' from '{tool['original_mention']}'"
                            if tool.get("is_misspelling"):
                                evidence += f" (corrected from possible transcription error)"
                            tool_evidence.append(evidence)

                    if tool_evidence:
                        attributes[field]["evidence"] = tool_evidence
                        attributes[field]["confidence"] = 0.9  # High confidence for tool identification

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
        # Use the simplified persona formation prompts
        from backend.services.llm.prompts.tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts

        # Create a data dictionary for the prompt generator
        data = {
            "text": text,
            "role": role
        }

        # Get the simplified prompt
        logger.info(f"Using simplified persona formation prompt for {role}")
        return SimplifiedPersonaFormationPrompts.get_prompt(data)

# These methods have been removed as they are no longer needed.
# The _create_enhanced_persona_prompt method now handles all persona formation prompts.
