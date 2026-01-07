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
import os
import asyncio
from pydantic import BaseModel, Field, ValidationError


# Pydantic models for structured persona extraction
class PersonaTrait(BaseModel):
    """A persona trait with value, confidence, and evidence."""
    value: str = Field(default="", description="The trait value")
    confidence: float = Field(default=0.7, description="Confidence score 0-1")
    evidence: List[str] = Field(default_factory=list, description="Supporting quotes from transcript")


class ExtractedPersonaAttributes(BaseModel):
    """Structured persona attributes extracted from transcript."""
    name: str = Field(default="", description="Speaker's name from transcript")
    description: str = Field(default="", description="Brief persona description")
    archetype: str = Field(default="Unknown", description="Persona archetype/role title")
    demographics: PersonaTrait = Field(default_factory=PersonaTrait, description="Demographics: role, industry, experience")
    goals_and_motivations: PersonaTrait = Field(default_factory=PersonaTrait, description="Primary goals and motivations")
    challenges_and_frustrations: PersonaTrait = Field(default_factory=PersonaTrait, description="Key challenges and frustrations")
    skills_and_expertise: PersonaTrait = Field(default_factory=PersonaTrait, description="Skills and expertise")
    technology_and_tools: PersonaTrait = Field(default_factory=PersonaTrait, description="Tools and technologies used")
    workflow_and_environment: PersonaTrait = Field(default_factory=PersonaTrait, description="Workflow and work environment")
    pain_points: PersonaTrait = Field(default_factory=PersonaTrait, description="Pain points and frustrations")
    key_quotes: PersonaTrait = Field(default_factory=PersonaTrait, description="Key verbatim quotes from transcript")
    role_context: PersonaTrait = Field(default_factory=PersonaTrait, description="Role context and responsibilities")

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
    from backend.services.processing.evidence_linking_service import (
        EvidenceLinkingService,
    )
    from backend.services.processing.trait_formatting_service import (
        TraitFormattingService,
    )
    from backend.services.processing.adaptive_tool_recognition_service import (
        AdaptiveToolRecognitionService,
    )
except ImportError:
    # Try to import from regular structure
    from services.processing.evidence_linking_service import EvidenceLinkingService
    from services.processing.trait_formatting_service import TraitFormattingService
    from services.processing.adaptive_tool_recognition_service import (
        AdaptiveToolRecognitionService,
    )

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
            llm_service=llm_service, similarity_threshold=0.75, learning_enabled=True
        )

        # Log the number of predefined corrections
        correction_count = len(self.tool_recognition_service.learned_corrections)
        logger.info(
            f"Initialized AdaptiveToolRecognitionService with {correction_count} predefined corrections"
        )

        # Log some key corrections for debugging
        if "mirrorboards" in self.tool_recognition_service.learned_corrections:
            miro_correction = self.tool_recognition_service.learned_corrections[
                "mirrorboards"
            ]
            logger.info(
                f"Miro correction loaded: 'mirrorboards' → '{miro_correction['tool_name']}' (confidence: {miro_correction['confidence']})"
            )

        logger.info(
            f"Initialized AttributeExtractor with {llm_service.__class__.__name__}"
        )

    async def extract_attributes_from_text(
        self,
        text: str,
        role: str = "Participant",
        industry: Optional[str] = None,
        scope_meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Extract persona attributes from text using LLM.

        Args:
            text: Text to extract attributes from
            role: Role of the person in the text (Interviewer, Interviewee, Participant)
            industry: Optional industry context
            scope_meta: Optional metadata including speaker name

        Returns:
            Dictionary of persona attributes
        """
        # Extract speaker name from scope_meta if available
        speaker_name = None
        if scope_meta and isinstance(scope_meta, dict):
            speaker_name = scope_meta.get("speaker", "").strip() or None

        logger.info(f"Extracting attributes for {role} (speaker: {speaker_name}) from {len(text)} chars of text")

        # DEBUG: Log sample of input text to diagnose empty content issues
        if len(text) < 100:
            logger.warning(f"🔍 [ATTR_EXTRACTOR] ⚠️ VERY SHORT INPUT TEXT for {speaker_name}: '{text}'")
        else:
            logger.info(f"🔍 [ATTR_EXTRACTOR] Input text sample (first 500 chars): {text[:500]}...")

        try:
            # Create prompt based on role and speaker name
            prompt = self._create_enhanced_persona_prompt(text, role, industry, speaker_name=speaker_name)
            logger.info(f"🔍 [ATTR_EXTRACTOR] Created prompt for {role}, prompt length: {len(prompt)}")

            # Use more text for analysis with Gemini 3 Flash's 1M context window
            # Increased limit from 16k to 100k to preserve more speaker content
            text_to_analyze = text
            if len(text) > 100000:  # If text is very long, use a reasonable chunk
                logger.info(
                    f"Text is very long ({len(text)} chars), using first 100000 chars"
                )
                text_to_analyze = text[:100000]

            # Call LLM to extract attributes - Use Gemini with Pydantic via InstructorGeminiClient
            logger.info(f"🔍 [ATTR_EXTRACTOR] Starting LLM call for {role} with {len(text_to_analyze)} chars...")
            import time
            _llm_start = time.time()
            
            # Retry logic for reliability - up to 3 attempts
            llm_response = None
            max_retries = 3
            last_error = None
            
            # Get the underlying GeminiService to access instructor_client
            service = getattr(self.llm_service, 'service', self.llm_service)
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"🔍 [ATTR_EXTRACTOR] Attempt {attempt+1}: Using InstructorGeminiClient with ExtractedPersonaAttributes schema")
                    
                    # Build the prompt for structured extraction
                    structured_prompt = f"""You are an expert qualitative researcher analyzing an interview transcript.

TASK: Extract persona attributes for the speaker "{speaker_name or role}" from this transcript.

IMPORTANT: Extract detailed information for each attribute. Do NOT leave fields empty.

TRANSCRIPT:
{text_to_analyze}

For each attribute field, provide:
- value: A detailed description based on the transcript
- confidence: Your confidence level from 0.0 to 1.0
- evidence: List of verbatim quotes from the transcript supporting this attribute

Be thorough and extract all relevant information. Use exact quotes from the transcript as evidence."""
                    
                    # Use the instructor_client directly with ExtractedPersonaAttributes schema
                    instructor_client = service.instructor_client
                    
                    result = await instructor_client.generate_with_model_async(
                        prompt=structured_prompt,
                        model_class=ExtractedPersonaAttributes,
                        temperature=0.0,
                        max_output_tokens=65536,
                    )
                    
                    # Convert Pydantic model to dict
                    if hasattr(result, 'model_dump'):
                        llm_response = result.model_dump()
                    elif hasattr(result, 'dict'):
                        llm_response = result.dict()
                    else:
                        llm_response = dict(result)
                    
                    logger.info(f"🔍 [ATTR_EXTRACTOR] Got structured response with keys: {list(llm_response.keys())}")
                    
                    # Validate response has actual content
                    if isinstance(llm_response, dict):
                        # Check if we got real data (not empty/default values)
                        has_content = False
                        for key in ['goals_and_motivations', 'challenges_and_frustrations', 'demographics']:
                            val = llm_response.get(key)
                            if isinstance(val, dict) and val.get('value') and len(str(val.get('value', ''))) > 20:
                                has_content = True
                                break
                        
                        if has_content:
                            logger.info(f"🔍 [ATTR_EXTRACTOR] Attempt {attempt+1}: Got valid response with content")
                            break
                        else:
                            logger.warning(f"🔍 [ATTR_EXTRACTOR] Attempt {attempt+1}: Response has no content, retrying...")
                            if attempt < max_retries - 1:
                                continue
                    elif llm_response:
                        logger.info(f"🔍 [ATTR_EXTRACTOR] Attempt {attempt+1}: Got response type {type(llm_response)}")
                        break
                        
                except Exception as e:
                    last_error = e
                    logger.warning(f"🔍 [ATTR_EXTRACTOR] Attempt {attempt+1} failed: {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)  # Brief delay before retry
                        continue
                    raise
            
            if llm_response is None and last_error:
                raise last_error
            # Log raw LLM response for debugging
            logger.info(f"🔍 [ATTR_EXTRACTOR] Raw LLM response type: {type(llm_response)}")
            if isinstance(llm_response, dict):
                logger.info(f"🔍 [ATTR_EXTRACTOR] LLM response keys: {list(llm_response.keys())[:20]}")
                # Log a few key fields
                for key in ['name', 'description', 'archetype', 'role_context', 'key_quotes'][:5]:
                    if key in llm_response:
                        val = llm_response[key]



            # DEBUG: Log raw response to file for investigation
            try:
                import datetime
                with open("/tmp/axwise_llm_debug.log", "a") as f:
                    f.write(f"\n\n--- {datetime.datetime.now()} ---\n")
                    f.write(f"Speaker: {role}\n")
                    f.write(f"Raw Response: {json.dumps(llm_response, default=str)}\n")
            except Exception as e:
                logger.error(f"Failed to log debug info: {e}")

            # Parse response
            attributes = self._parse_llm_json_response(
                llm_response, f"extract_attributes_from_text for {role}"
            )

            # Log parsed attributes
            if attributes:
                logger.info(f"🔍 [ATTR_EXTRACTOR] Parsed attributes keys: {list(attributes.keys())[:15]}")

            # Process attributes
            if attributes:
                # Use the new evidence linking service for enhanced evidence
                # This should be done BEFORE converting to nested structures
                try:
                    logger.info("Using EvidenceLinkingService to find relevant quotes")
                    logger.info(f"[TRACE_DEMO] Before linking: {attributes.get('demographics', 'MISSING')}")
                    if getattr(self.evidence_linking_service, "enable_v2", False):
                        # Build richer scope metadata: prefer real speaker_id if provided
                        meta = {"speaker": role}
                        if scope_meta:
                            try:
                                meta.update(scope_meta)
                                if scope_meta.get("speaker_id"):
                                    meta["speaker"] = scope_meta["speaker_id"]
                            except Exception:
                                pass

                        if os.getenv("EVIDENCE_LINKING_V2", "true").lower() != "false":
                            enhanced, _evidence_map = (
                                self.evidence_linking_service.link_evidence_to_attributes_v2(
                                    attributes,
                                    scoped_text=text,
                                    scope_meta=meta,
                                    protect_key_quotes=True,
                                )
                            )
                            attributes = enhanced
                            logger.info(f"[TRACE_DEMO] After linking v2: {attributes.get('demographics', 'MISSING')}")
                        else:
                            # Fallback or skip
                             attributes = await self.evidence_linking_service.link_evidence_to_attributes(
                                attributes, text
                            )
                    else:
                        attributes = await self.evidence_linking_service.link_evidence_to_attributes(
                            attributes, text
                        )
                except Exception as e:
                    logger.error(
                        f"Error using EvidenceLinkingService: {str(e)}", exc_info=True
                    )
                    # Fall back to basic evidence enhancement if the service fails
                    attributes = self._enhance_evidence_fields(attributes, text)

                # Use the new trait formatting service for improved formatting
                # This should be done BEFORE converting to nested structures
                # os is already imported at module level
                if os.getenv("PERSONA_TRAIT_FORMATTING", "false").lower() in ("true", "1", "yes", "on"):
                    try:
                        logger.info(
                            "Using TraitFormattingService to improve trait value formatting"
                        )
                        attributes = (
                            await self.trait_formatting_service.format_trait_values(
                                attributes
                            )
                        )
                    except Exception as e:
                        logger.error(
                            f"Error using TraitFormattingService: {str(e)}", exc_info=True
                        )
                        # Fall back to basic formatting if the service fails
                        attributes = self._fix_trait_value_formatting(attributes)
                else:
                    attributes = self._fix_trait_value_formatting(attributes)

                # SOLUTION 1: Analyze the full transcript for tools first, then update the attributes
                try:
                    logger.info(
                        "Using AdaptiveToolRecognitionService to improve tool identification"
                    )

                    # First, identify all tools in the full transcript
                    logger.info("Identifying all tools in the full transcript")
                    import asyncio
                    try:
                        all_identified_tools = await asyncio.wait_for(
                            self.tool_recognition_service.identify_tools_in_text(
                                text,  # Use the full transcript as the primary text to analyze
                                "",  # No additional context needed since we're using the full text
                            ),
                            timeout=60.0  # 60 second timeout for tool identification
                        )
                    except asyncio.TimeoutError:
                        logger.warning("Tool identification timed out after 60 seconds, skipping")
                        all_identified_tools = []

                    if all_identified_tools:
                        logger.info(
                            f"Identified {len(all_identified_tools)} tools in the full transcript"
                        )

                        # Format all identified tools
                        all_formatted_tools = (
                            self.tool_recognition_service.format_tools_for_persona(
                                all_identified_tools, "bullet"
                            )
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
                                    attributes[tool_field][
                                        "value"
                                    ] = all_formatted_tools
                                    if tool_evidence:
                                        attributes[tool_field][
                                            "evidence"
                                        ] = tool_evidence
                                        attributes[tool_field][
                                            "confidence"
                                        ] = 0.9  # High confidence
                                else:
                                    attributes[tool_field] = all_formatted_tools

                                logger.info(
                                    f"Updated {tool_field} with all tools identified from the full transcript"
                                )
                    else:
                        logger.info(
                            "No tools identified in the full transcript, falling back to field-specific analysis"
                        )

                        # Fall back to analyzing each field individually
                        for tool_field in ["tools_used", "technology_and_tools"]:
                            if tool_field in attributes:
                                # Get the current tool value
                                current_tools = attributes[tool_field]
                                if (
                                    isinstance(current_tools, dict)
                                    and "value" in current_tools
                                ):
                                    tool_value = current_tools["value"]
                                else:
                                    tool_value = str(current_tools)

                                # Skip if empty
                                if not tool_value or tool_value.lower() in [
                                    "unknown",
                                    "n/a",
                                    "none",
                                ]:
                                    continue

                                # Identify tools in the specific field value, with full text as context
                                try:
                                    field_tools = await asyncio.wait_for(
                                        self.tool_recognition_service.identify_tools_in_text(
                                            tool_value, text
                                        ),
                                        timeout=30.0  # 30 second timeout for field-specific tool identification
                                    )
                                except asyncio.TimeoutError:
                                    logger.warning(f"Tool identification for {tool_field} timed out, skipping")
                                    field_tools = []

                                # Format the tools for the persona
                                if field_tools:
                                    # Format as bullet points
                                    formatted_tools = self.tool_recognition_service.format_tools_for_persona(
                                        field_tools, "bullet"
                                    )

                                    # Update the attribute
                                    if isinstance(attributes[tool_field], dict):
                                        attributes[tool_field][
                                            "value"
                                        ] = formatted_tools
                                    else:
                                        attributes[tool_field] = formatted_tools

                                    logger.info(
                                        f"Updated {tool_field} with field-specific tool identification"
                                    )
                except Exception as e:
                    logger.error(
                        f"Error using AdaptiveToolRecognitionService: {str(e)}",
                        exc_info=True,
                    )
                    # Continue without tool recognition if it fails

                # NOW convert to nested structures for PersonaBuilder
                attributes = self._clean_persona_attributes(attributes)

                logger.info(
                    f"Successfully extracted and enhanced attributes for {role}"
                )
                return attributes
            else:
                logger.warning(
                    f"Failed to extract attributes for {role}, returning fallback attributes"
                )
                return self._create_fallback_attributes(role, text)

        except Exception as e:
            logger.error(
                f"Error extracting attributes for {role}: {str(e)}", exc_info=True
            )
            return self._create_fallback_attributes(role, text)

    def _parse_llm_json_response(
        self, response: Any, context: str = ""
    ) -> Dict[str, Any]:
        """
        Parse JSON response from LLM.

        Args:
            response: LLM response (can be a string, dictionary, or list)
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

        # If response is a list (e.g., LLM returned [{...}]), extract first item
        if isinstance(response, list):
            logger.info(f"Response is a list with {len(response)} items in {context}")
            if len(response) > 0 and isinstance(response[0], dict):
                logger.info(f"Extracting first dictionary from list in {context}")
                return response[0]
            elif len(response) == 0:
                logger.warning(f"Empty list response from LLM in {context}")
                return {}
            else:
                logger.warning(f"List contains non-dict items in {context}: {type(response[0])}")
                return {}

        # Otherwise, try to parse it as a JSON string
        try:
            # Try to parse as JSON directly
            logger.info(f"raw_response from LLM for {context}: {response[:500]}...")
            parsed = json.loads(response)
            # Handle case where parsed result is a list
            if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                logger.info(f"Parsed JSON is a list, extracting first item in {context}")
                return parsed[0]
            return parsed
        except json.JSONDecodeError:
            # If direct parsing fails, try to extract JSON from the response
            try:
                # Look for JSON object in the response
                json_match = re.search(r"({[\s\S]*})", response)
                if json_match:
                    json_str = json_match.group(1)
                    return json.loads(json_str)
                else:
                    logger.warning(f"No JSON object found in response: {context}")
                    return {}
            except Exception as e:
                logger.error(
                    f"Error parsing JSON from LLM response in {context}: {str(e)}"
                )
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
        logger.info(f"[TRACE_DEMO] Cleaning: {attributes.get('demographics', 'MISSING')}")

        if "Marcus" in str(attributes.get("description", "")):
            logger.warning(f"🚨 [HALLUCINATION DETECTED] 'Marcus' found in description! Attributes: {json.dumps(attributes, indent=2)}")

        # Normalize field names from LLM response to expected format
        # The LLM might return shortened field names without "_and_"
        field_name_mapping = {
            "goals_motivations": "goals_and_motivations",
            "challenges_frustrations": "challenges_and_frustrations",
            "skills_expertise": "skills_and_expertise",
            "technology_tools": "technology_and_tools",
            "workflow_environment": "workflow_and_environment",
            "needs_expectations": "needs_and_expectations",
            "needs_desires": "needs_and_desires",
        }

        for old_name, new_name in field_name_mapping.items():
            if old_name in attributes and new_name not in attributes:
                attributes[new_name] = attributes.pop(old_name)
                logger.info(f"Normalized field name: {old_name} -> {new_name}")

        # Ensure all required fields are present
        required_fields = ["name", "description", "archetype"]

        for field in required_fields:
            if field not in attributes:
                attributes[field] = "" if field != "archetype" else "Unknown"

        # Ensure all trait fields are present and properly structured
        trait_fields = [
            "demographics",
            "goals_and_motivations",
            "skills_and_expertise",
            "workflow_and_environment",
            "challenges_and_frustrations",
            "needs_and_desires",
            "technology_and_tools",
            "attitude_towards_research",
            "attitude_towards_ai",
            "key_quotes",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
        ]

        for field in trait_fields:
            # Check if the field is key_quotes and is a list
            if (
                field in attributes
                and field == "key_quotes"
                and isinstance(attributes[field], list)
                and attributes[field]
            ):
                # Convert list of quotes to structured trait
                quotes_list = attributes[field]
                quotes_value = "\n".join([f"• {quote}" for quote in quotes_list])
                attributes[field] = {
                    "value": quotes_value,
                    "confidence": 0.9,
                    "evidence": quotes_list,
                }
                logger.info(f"Converted list of quotes to structured trait for {field}")
            # Check if the field exists as a string value
            elif (
                field in attributes
                and isinstance(attributes[field], str)
                and attributes[field]
            ):
                # Convert string value to structured trait
                string_value = attributes[field]
                attributes[field] = {
                    "value": string_value,
                    "confidence": 0.7,
                    "evidence": [],  # avoid generic placeholder evidence
                }
                logger.info(f"Converted string value to structured trait for {field}")
            # Check if the field doesn't exist or isn't a dict
            elif field not in attributes or not isinstance(attributes[field], dict):
                attributes[field] = {"value": "", "confidence": 0.5, "evidence": []}
            else:
                # Ensure trait has all required fields
                trait = attributes[field]
                if "value" not in trait:
                    # Do not inject generic placeholder values; leave empty to avoid contamination
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

                # Do not inject default evidence; keep empty if we have no linked quotes
                # trait['evidence'] stays [] unless evidence linking finds concrete quotes

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

    def _enhance_evidence_fields(
        self, attributes: Dict[str, Any], text: str
    ) -> Dict[str, Any]:
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
            "demographics",
            "goals_and_motivations",
            "skills_and_expertise",
            "workflow_and_environment",
            "challenges_and_frustrations",
            "needs_and_desires",
            "technology_and_tools",
            "attitude_towards_research",
            "attitude_towards_ai",
            "key_quotes",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
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
                        key_terms = [term.strip() for term in value.split(",")]
                        key_terms.extend([term.strip() for term in value.split(".")])
                        key_terms = [term for term in key_terms if len(term) > 5]

                        # Find sentences in the text that contain these key terms
                        new_evidence = []
                        sentences = re.split(r"[.!?]", text)
                        for term in key_terms:
                            for sentence in sentences:
                                if (
                                    term.lower() in sentence.lower()
                                    and len(sentence.strip()) > 10
                                ):
                                    new_evidence.append(sentence.strip())
                                    if (
                                        len(new_evidence) >= 3
                                    ):  # Limit to 3 pieces of evidence
                                        break
                            if len(new_evidence) >= 3:
                                break

                        # Update evidence if we found any
                        if new_evidence:
                            attributes[field]["evidence"] = new_evidence
                            attributes[field]["confidence"] = min(
                                attributes[field].get("confidence", 0.5) + 0.1, 1.0
                            )

        return attributes

    async def _enhance_tool_identification(
        self, attributes: Dict[str, Any], text: str
    ) -> Dict[str, Any]:
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
                identified_tools = (
                    await self.tool_recognition_service.identify_tools_in_text(
                        current_value
                        or text,  # Use current value if available, otherwise full text
                        surrounding_context=text,  # Always provide full text as context
                    )
                )

                # Format tools for persona
                if identified_tools:
                    formatted_tools = (
                        self.tool_recognition_service.format_tools_for_persona(
                            identified_tools, "bullet"
                        )
                    )
                    attributes[field]["value"] = formatted_tools

                    # Add evidence from original mentions
                    tool_evidence = []
                    for tool in identified_tools:
                        if tool.get("confidence", 0) >= 0.8:
                            evidence = f"Identified '{tool['tool_name']}' from '{tool['original_mention']}'"
                            if tool.get("is_misspelling"):
                                evidence += (
                                    f" (corrected from possible transcription error)"
                                )
                            tool_evidence.append(evidence)

                    if tool_evidence:
                        attributes[field]["evidence"] = tool_evidence
                        attributes[field][
                            "confidence"
                        ] = 0.9  # High confidence for tool identification

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
            "demographics",
            "goals_and_motivations",
            "skills_and_expertise",
            "workflow_and_environment",
            "challenges_and_frustrations",
            "needs_and_desires",
            "technology_and_tools",
            "attitude_towards_research",
            "attitude_towards_ai",
            "key_quotes",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
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
                    attributes[field]["value"] = ", ".join(
                        f"{k}: {v}" for k, v in value.items() if v
                    )

                # Remove any markdown formatting
                value = attributes[field].get("value", "")
                value = re.sub(r"[*_#]", "", value)
                attributes[field]["value"] = value

        return attributes

    def _create_fallback_attributes(
        self, role: str, text: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create fallback attributes when extraction fails, without generic placeholders.
        Prefer returning an empty-but-valid structure and extract a few representative
        participant quotes heuristically so downstream stages still have evidence
        to link while avoiding contamination.

        Args:
            role: Role of the person (Interviewer, Interviewee, Participant)
            text: Optional scoped text to mine for quotes

        Returns:
            Fallback attributes
        """
        logger.info(f"Creating fallback attributes for {role}")

        # Heuristically extract up to 5 long, declarative lines as quotes
        quotes: list[str] = []
        try:
            src = (text or "").splitlines()
            # Keep non-empty lines that are likely statements (not questions/headers)
            candidates = [
                ln.strip()
                for ln in src
                if ln and len(ln.strip()) >= 30 and not ln.strip().endswith("?")
            ]
            # De-duplicate while preserving order
            seen = set()
            unique = []
            for c in candidates:
                lc = c.lower()
                if lc not in seen:
                    seen.add(lc)
                    unique.append(c)
            quotes = unique[:5]
        except Exception:
            quotes = []

        def empty_trait():
            return {"value": "", "confidence": 0.3, "evidence": []}

        attrs = {
            "name": f"{role}",
            "description": "",
            "archetype": "",
            # Detailed attributes (leave empty; no placeholders)
            "demographics": empty_trait(),
            "goals_and_motivations": empty_trait(),
            "skills_and_expertise": empty_trait(),
            "workflow_and_environment": empty_trait(),
            "challenges_and_frustrations": empty_trait(),
            "needs_and_desires": empty_trait(),
            "technology_and_tools": empty_trait(),
            "attitude_towards_research": empty_trait(),
            "attitude_towards_ai": empty_trait(),
            "key_quotes": {"value": "", "confidence": 0.3, "evidence": quotes},
            # Legacy fields
            "role_context": empty_trait(),
            "key_responsibilities": empty_trait(),
            "tools_used": empty_trait(),
            "collaboration_style": empty_trait(),
            "analysis_approach": empty_trait(),
            "pain_points": empty_trait(),
            # Overall persona information
            "patterns": [],
            "confidence": 0.3,
            "evidence": [],
        }
        return attrs

    def _create_enhanced_persona_prompt(
        self, text: str, role: str, industry: Optional[str] = None, speaker_name: Optional[str] = None
    ) -> str:
        """
        Create an enhanced prompt for persona formation.

        Args:
            text: Text to analyze
            role: Role of the person (e.g., "Account Manager", "Participant")
            industry: Optional industry context
            speaker_name: Optional actual name of the speaker (e.g., "Alex", "Jordan")

        Returns:
            Enhanced prompt string
        """
        # Use the simplified persona formation prompts
        from backend.services.llm.prompts.tasks.simplified_persona_formation import (
            SimplifiedPersonaFormationPrompts,
        )

        # Prepare prompt data
        # CLEAN THE ROLE: Strip any prefix like "I1|" from the role name
        # The system sometimes prefixes the speaker name with "I1|" (Interview 1) or similar.
        # We must pass the CLEAN name to the LLM so it can find it in the text.
        clean_role = role
        if "|" in role:
            clean_role = role.split("|")[-1].strip()
            logger.info(f"Cleaned role for prompt: '{role}' -> '{clean_role}'")

        # Also clean speaker name if it has the I{block}| prefix
        clean_speaker_name = speaker_name
        if speaker_name and "|" in speaker_name:
            clean_speaker_name = speaker_name.split("|")[-1].strip()
            logger.info(f"Cleaned speaker name for prompt: '{speaker_name}' -> '{clean_speaker_name}'")

        prompt_data = {
            "text": text,
            "role": clean_role,
            "industry": industry,
            "speaker_name": clean_speaker_name,
        }

        # Get the simplified prompt
        logger.info(f"Using simplified persona formation prompt for {clean_role} (speaker: {clean_speaker_name}, original role: {role})")
        result = SimplifiedPersonaFormationPrompts.get_prompt(prompt_data)
        return result


# These methods have been removed as they are no longer needed.
# The _create_enhanced_persona_prompt method now handles all persona formation prompts.
