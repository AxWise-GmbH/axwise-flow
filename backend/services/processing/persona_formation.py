"""Enhanced persona formation service with comprehensive attribute analysis"""

from typing import List, Dict, Any, Optional, Union, Tuple  # Corrected duplicate Union import
from dataclasses import dataclass, asdict, field
import asyncio
import json
import logging
from datetime import datetime
import re
from pydantic import ValidationError

# Import enhanced role identification
try:
    from backend.services.processing.identify_roles import identify_roles
except ImportError:
    try:
        from services.processing.identify_roles import identify_roles
    except ImportError:
        # If import fails, we'll use the built-in method
        logger = logging.getLogger(__name__)
        logger.warning("Could not import enhanced identify_roles, will use built-in method")

# Import Pydantic schema for validation
try:
    from backend.schemas import Persona as PersonaSchema
except ImportError:
    try:
        from schemas import Persona as PersonaSchema
    except ImportError:
        logger = logging.getLogger(__name__)
        logger.warning("Could not import PersonaSchema, validation will be limited")
        # We'll define a minimal schema later if needed

# Import LLM interface
try:
    # Try to import from backend structure
    from backend.domain.interfaces.llm import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from domain.interfaces.llm import ILLMService
    except ImportError:
        # Create a minimal interface if both fail
        logger = logging.getLogger(__name__)
        logger.warning(
            "Could not import ILLMService interface, using minimal definition"
        )

        class ILLMService:
            """Minimal LLM service interface"""

            async def generate_response(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")


# Add error handling for event imports
try:
    from backend.infrastructure.events.event_manager import event_manager, EventType

    logger = logging.getLogger(__name__)
    logger.info(
        "Successfully imported event_manager from backend.infrastructure.events"
    )
except ImportError:
    try:
        from infrastructure.events.event_manager import event_manager, EventType

        logger = logging.getLogger(__name__)
        logger.info("Successfully imported event_manager from infrastructure.events")
    except ImportError:
        # Use the fallback events implementation
        try:
            from backend.infrastructure.state.events import event_manager, EventType

            logger = logging.getLogger(__name__)
            logger.info(
                "Using fallback event_manager from backend.infrastructure.state.events"
            )
        except ImportError:
            try:
                from infrastructure.state.events import event_manager, EventType

                logger = logging.getLogger(__name__)
                logger.info(
                    "Using fallback event_manager from infrastructure.state.events"
                )
            except ImportError:
                # Create minimal event system if all imports fail
                logger.error(
                    "Failed to import events system, using minimal event logging"
                )
                from enum import Enum

                class EventType(Enum):
                    """Minimal event types for error handling"""

                    PROCESSING_STATUS = "PROCESSING_STATUS"
                    PROCESSING_ERROR = "PROCESSING_ERROR"
                    PROCESSING_STEP = "PROCESSING_STEP"
                    PROCESSING_COMPLETED = "PROCESSING_COMPLETED"

                class MinimalEventManager:
                    """Minimal event manager for logging only"""

                    async def emit(self, event_type, payload=None):
                        logger.info(f"Event: {event_type}, Payload: {payload}")

                    async def emit_error(self, error, context=None):
                        logger.error(f"Error: {str(error)}, Context: {context}")

                event_manager = MinimalEventManager()

try:
    from backend.infrastructure.data.config import SystemConfig
except ImportError:
    try:
        from infrastructure.data.config import SystemConfig
    except ImportError:
        logger.warning("Could not import SystemConfig, using minimal definition")

        class SystemConfig:
            """Minimal system config"""

            def __init__(self):
                self.llm = type(
                    "obj",
                    (object,),
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "temperature": 0.3,
                        "max_tokens": 2000,
                    },
                )
                self.processing = type(
                    "obj", (object,), {"batch_size": 10, "max_tokens": 2000}
                )
                self.validation = type("obj", (object,), {"min_confidence": 0.4})


logger = logging.getLogger(__name__)


@dataclass
class PersonaTrait:
    """A trait or attribute of a persona with confidence and supporting evidence"""

    value: Union[str, dict, list]  # Allow value to be complex type
    confidence: float = 0.7  # Default confidence
    evidence: List[str] = field(default_factory=list)  # Default empty list


@dataclass
class Persona:
    """A user persona derived from interview data"""

    name: str
    description: str
    role_context: PersonaTrait
    key_responsibilities: PersonaTrait
    tools_used: PersonaTrait
    collaboration_style: PersonaTrait
    analysis_approach: PersonaTrait
    pain_points: PersonaTrait
    patterns: List[str] = field(default_factory=list)
    confidence: float = 0.7  # Default confidence
    evidence: List[str] = field(default_factory=list)
    persona_metadata: Optional[Dict[str, Any]] = None  # Changed from metadata
    role_in_interview: str = "Participant"  # Default role in the interview (Interviewee, Interviewer, etc.)


def persona_to_dict(persona: Persona) -> Dict[str, Any]:
    """Convert a Persona object to a dictionary for JSON serialization"""
    result = asdict(persona)
    # Ensure all confidence values are Python float
    result["role_context"]["confidence"] = float(result["role_context"]["confidence"])
    result["key_responsibilities"]["confidence"] = float(
        result["key_responsibilities"]["confidence"]
    )
    result["tools_used"]["confidence"] = float(result["tools_used"]["confidence"])
    result["collaboration_style"]["confidence"] = float(
        result["collaboration_style"]["confidence"]
    )
    result["analysis_approach"]["confidence"] = float(
        result["analysis_approach"]["confidence"]
    )
    result["pain_points"]["confidence"] = float(result["pain_points"]["confidence"])
    result["confidence"] = float(result["confidence"])
    return result


class PersonaFormationService:
    """Service for forming personas from analysis patterns"""

    def __init__(self, config, llm_service):
        """Initialize with system config and LLM service

        Args:
            config: System configuration object
            llm_service: Initialized LLM service
        """
        self.config = config
        self.llm_service = llm_service
        self.min_confidence = getattr(config.validation, "min_confidence", 0.4)
        self.validation_threshold = self.min_confidence
        logger.info(
            f"Initialized PersonaFormationService with {llm_service.__class__.__name__}"
        )

    def _clean_evidence_list(self, evidence_list: List[Any]) -> List[str]:
        """Attempts to parse JSON strings within an evidence list and extract nested evidence."""
        if not isinstance(evidence_list, list):
            logger.warning(
                f"Evidence provided is not a list: {type(evidence_list)}. Returning empty list."
            )
            return []

        cleaned_list = []
        for item in evidence_list:
            if isinstance(item, str):
                # Attempt to parse if it looks like a JSON object string containing 'evidence' key
                # Check for both '{' and '}' and the evidence key to be more specific
                if (
                    item.strip().startswith("{")
                    and item.strip().endswith("}")
                    and '"evidence":' in item
                ):
                    try:
                        # Basic handling for single quotes often used by LLMs
                        # Replace single quotes only if they are likely delimiters, not apostrophes
                        # Handle potential escaped quotes within the JSON string itself
                        temp_str = item.replace(
                            "\\'", "'"
                        )  # Unescape escaped single quotes first
                        valid_json_string = re.sub(
                            r"(?<!\\)'", '"', temp_str
                        )  # Replace remaining single quotes

                        parsed_obj = json.loads(valid_json_string)
                        if (
                            isinstance(parsed_obj, dict)
                            and "evidence" in parsed_obj
                            and isinstance(parsed_obj["evidence"], str)
                        ):
                            cleaned_list.append(parsed_obj["evidence"])
                            continue  # Successfully parsed and extracted
                        else:
                            logger.warning(
                                f"Parsed JSON object lacks 'evidence' string: {item[:100]}..."
                            )
                    except json.JSONDecodeError:
                        logger.warning(
                            f"Could not parse evidence item as JSON, keeping original: {item[:100]}..."
                        )
                # If not JSON or parsing failed, add the original string (potentially with prefix removed if desired)
                # Let's keep the prefix for now if it wasn't parsed JSON
                cleaned_list.append(item)
            # Optionally handle non-string items if necessary, otherwise ignore
            elif (
                item is not None
            ):  # Handle cases where evidence might contain non-strings
                cleaned_list.append(str(item))

        return cleaned_list

    async def form_personas(self, patterns, context=None):
        """Form personas from identified patterns

        Args:
            patterns: List of identified patterns from analysis
            context: Optional additional context

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Forming personas from {len(patterns)} patterns")

            # Skip if no patterns
            if not patterns or len(patterns) == 0:
                logger.warning("No patterns provided for persona formation")
                return []

            # Group patterns by similarity
            grouped_patterns = self._group_patterns(patterns)
            logger.info(
                f"Grouped patterns into {len(grouped_patterns)} potential personas"
            )

            # Form a persona from each group
            personas = []

            for i, group in enumerate(grouped_patterns):
                try:
                    # Convert the group to a persona
                    attributes = await self._analyze_patterns_for_persona(group)
                    logger.debug(
                        f"[form_personas] Attributes received from LLM for group {i}: {attributes}"
                    )  # DEBUG LOG

                    if (
                        attributes
                        and isinstance(attributes, dict)
                        and attributes.get("confidence", 0) >= self.validation_threshold
                    ):
                        try:
                            # Extract nested trait data, providing default dict if key missing
                            role_context_data = attributes.get("role_context", {})
                            key_responsibilities_data = attributes.get(
                                "key_responsibilities", {}
                            )  # Corrected key name
                            tools_used_data = attributes.get("tools_used", {})
                            collaboration_style_data = attributes.get(
                                "collaboration_style", {}
                            )
                            analysis_approach_data = attributes.get(
                                "analysis_approach", {}
                            )
                            pain_points_data = attributes.get("pain_points", {})

                            # Create Persona object using defaults for missing confidence/evidence
                            persona = Persona(
                                name=attributes.get("name", "Unknown Persona"),
                                description=attributes.get(
                                    "description", "No description provided."
                                ),
                                # Create PersonaTrait instances from nested data
                                role_context=PersonaTrait(
                                    value=role_context_data.get("value", ""),
                                    confidence=float(
                                        role_context_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        role_context_data.get("evidence", [])
                                    ),
                                ),
                                key_responsibilities=PersonaTrait(
                                    value=key_responsibilities_data.get("value", ""),
                                    confidence=float(
                                        key_responsibilities_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        key_responsibilities_data.get("evidence", [])
                                    ),
                                ),
                                tools_used=PersonaTrait(
                                    value=tools_used_data.get("value", ""),
                                    confidence=float(
                                        tools_used_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        tools_used_data.get("evidence", [])
                                    ),
                                ),
                                collaboration_style=PersonaTrait(
                                    value=collaboration_style_data.get("value", ""),
                                    confidence=float(
                                        collaboration_style_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        collaboration_style_data.get("evidence", [])
                                    ),
                                ),
                                analysis_approach=PersonaTrait(
                                    value=analysis_approach_data.get("value", ""),
                                    confidence=float(
                                        analysis_approach_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        analysis_approach_data.get("evidence", [])
                                    ),
                                ),
                                pain_points=PersonaTrait(
                                    value=pain_points_data.get("value", ""),
                                    confidence=float(
                                        pain_points_data.get("confidence", 0.7)
                                    ),
                                    evidence=self._clean_evidence_list(
                                        pain_points_data.get("evidence", [])
                                    ),
                                ),
                                patterns=attributes.get(
                                    "patterns",
                                    [
                                        p.get("description", "")
                                        for p in group
                                        if p.get("description")
                                    ],
                                ),  # Default to group descriptions
                                confidence=float(
                                    attributes.get("confidence", 0.7)
                                ),  # Use default if missing and ensure float
                                evidence=self._clean_evidence_list(
                                    attributes.get("evidence", [])
                                ),  # Clean overall evidence too
                                persona_metadata=self._get_metadata(
                                    group
                                ),  # Use persona_metadata
                            )
                            logger.debug(
                                f"[form_personas] Created Persona object for group {i}: {persona}"
                            )  # DEBUG LOG
                            personas.append(persona)

                            logger.info(
                                f"Created persona: {persona.name} with confidence {persona.confidence}"
                            )
                        except Exception as persona_creation_error:
                            logger.error(
                                f"Error creating Persona object for group {i}: {persona_creation_error}",
                                exc_info=True,
                            )  # DEBUG LOG with traceback
                    else:
                        logger.warning(
                            f"Skipping persona creation for group {i} - confidence {attributes.get('confidence', 0)} "
                            f"below threshold {self.validation_threshold} or attributes invalid."
                        )
                except Exception as attr_error:
                    logger.error(
                        f"Error analyzing persona attributes for group {i}: {str(attr_error)}",
                        exc_info=True,
                    )

                # Emit event for tracking
                try:
                    await event_manager.emit(
                        EventType.PROCESSING_STEP,
                        {
                            "stage": "persona_formation",
                            "progress": (i + 1) / len(grouped_patterns),
                            "data": {
                                "personas_found": len(personas),
                                "groups_processed": i + 1,
                            },
                        },
                    )
                except Exception as event_error:
                    logger.warning(
                        f"Could not emit processing step event: {str(event_error)}"
                    )

            # If no personas were created, try to create a default one
            if not personas:
                logger.warning(
                    "No personas created from patterns, creating default persona"
                )
                personas = await self._create_default_persona(context)

            logger.info(
                f"[form_personas] Returning {len(personas)} personas."
            )  # DEBUG LOG
            # Convert Persona objects to dictionaries before returning
            return [persona_to_dict(p) for p in personas]

        except Exception as e:
            logger.error(f"Error creating personas: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(e, {"stage": "persona_formation"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    def _group_patterns(self, patterns):
        """Group patterns by similarity

        Args:
            patterns: List of patterns from analysis

        Returns:
            List of pattern groups
        """
        # Simple grouping by pattern type
        grouped = {}
        for pattern in patterns:
            pattern_type = pattern.get(
                "type", "unknown"
            )  # Use 'type' if available, else 'category'
            if not pattern_type or pattern_type == "unknown":
                pattern_type = pattern.get("category", "unknown")

            if pattern_type not in grouped:
                grouped[pattern_type] = []
            grouped[pattern_type].append(pattern)

        # Convert to list of groups
        return list(grouped.values())

    def _get_metadata(self, pattern_group):
        """Generate metadata for a persona based on pattern group

        Args:
            pattern_group: Group of patterns used to form persona

        Returns:
            Metadata dictionary
        """
        # Calculate confidence and evidence metrics
        pattern_confidence = sum(p.get("confidence", 0) for p in pattern_group) / max(
            len(pattern_group), 1
        )
        evidence_count = sum(len(p.get("evidence", [])) for p in pattern_group)

        # Create validation metrics
        validation_metrics = {
            "pattern_confidence": pattern_confidence,
            "evidence_count": evidence_count,
            "attribute_coverage": {
                "role": 0.6,  # Estimated coverage based on pattern types
                "responsibilities": 0.7,
                "tools": 0.5,
                "collaboration": 0.4,
                "analysis": 0.6,
                "pain_points": 0.8,
            },
        }

        return {
            "timestamp": datetime.now().isoformat(),
            "sample_size": len(pattern_group),
            "validation_metrics": validation_metrics,
            "source": "pattern_group_analysis",  # Add source info
        }

    def _calculate_pattern_confidence(self, group: List[Dict[str, Any]]) -> float:
        """Calculate confidence score for pattern matching"""
        if not group:
            return 0.0

        confidences = [p.get("confidence", 0) for p in group]
        return sum(confidences) / len(confidences)

    def _calculate_attribute_coverage(
        self, group: List[Dict[str, Any]]
    ) -> Dict[str, float]:
        """Calculate coverage ratio for each attribute"""
        required_attributes = [
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "pain_points",
        ]

        coverage = {}
        for attr in required_attributes:
            present = sum(1 for p in group if p.get(attr))
            coverage[attr] = present / len(group) if group else 0.0

        return coverage

    async def _analyze_patterns_for_persona(
        self, patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze patterns to extract persona attributes

        Args:
            patterns: List of patterns to analyze

        Returns:
            Dictionary of persona attributes
        """
        # Prepare prompt with pattern descriptions
        pattern_descriptions = "\n".join(
            f"- {p.get('description', '')}" for p in patterns if p.get("description")
        )
        # Use the prompt that requests the nested structure
        prompt = self._get_direct_persona_prompt_nested(
            pattern_descriptions
        )  # Reusing direct text prompt structure

        try:
            logger.debug(
                f"[_analyze_patterns_for_persona] Sending prompt to LLM:\n{prompt}"
            )
            # Call LLM to analyze patterns
            llm_response = None
            # Assuming llm_service.analyze handles the persona_formation task correctly now
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "text": pattern_descriptions,  # Pass pattern descriptions as text
                    "prompt": prompt,  # Pass the specific prompt asking for nested structure
                }
            )

            logger.debug(
                f"[_analyze_patterns_for_persona] Raw LLM response: {llm_response}"
            )

            # Attempt to parse the response
            attributes = self._parse_llm_json_response(
                llm_response, "_analyze_patterns_for_persona"
            )

            if attributes and isinstance(attributes, dict):
                logger.info(f"Successfully parsed persona attributes from patterns.")
                # Ensure the structure matches what Persona expects (nested traits)
                # The parsing logic in form_personas will handle creating PersonaTrait objects
                return attributes
            else:
                logger.warning(
                    "Failed to parse valid JSON attributes from LLM for pattern analysis."
                )
                return self._create_fallback_persona_attributes(
                    patterns
                )  # Return fallback dict

        except Exception as e:
            logger.error(
                f"Error analyzing patterns for persona: {str(e)}", exc_info=True
            )
            return self._create_fallback_persona_attributes(
                patterns
            )  # Return fallback dict

    def _create_fallback_persona_attributes(self, patterns=None):
        """Creates a fallback dictionary for persona attributes."""
        logger.warning(
            "Creating fallback persona attributes due to error or low confidence."
        )

        # Create a default PersonaTrait structure
        default_trait = {"value": "", "confidence": 0.5, "evidence": []}

        # Return structure that can be processed by Persona constructor with both new and legacy fields
        return {
            # Basic information
            "name": "Default Persona",
            "archetype": "Unknown",
            "description": "Default persona due to analysis error or low confidence",
            # Detailed attributes (new fields)
            "demographics": default_trait,
            "goals_and_motivations": default_trait,
            "skills_and_expertise": default_trait,
            "workflow_and_environment": default_trait,
            "challenges_and_frustrations": default_trait,
            "needs_and_desires": default_trait,
            "technology_and_tools": default_trait,
            "attitude_towards_research": default_trait,
            "attitude_towards_ai": default_trait,
            "key_quotes": default_trait,
            # Legacy fields
            "role_context": default_trait,
            "key_responsibilities": default_trait,
            "tools_used": default_trait,
            "collaboration_style": default_trait,
            "analysis_approach": default_trait,
            "pain_points": default_trait,
            # Overall persona information
            "patterns": (
                [p.get("description", "") for p in patterns] if patterns else []
            ),
            "confidence": 0.5,
            "evidence": ["Fallback due to error"],
            "overall_confidence": 0.5,
            "supporting_evidence_summary": ["Fallback due to error"],
        }

    async def _create_default_persona(
        self, context: Optional[Dict[str, Any]] = None
    ) -> List[Persona]:
        """Create a default persona when no patterns are found or direct text analysis is needed."""
        try:
            logger.info("Starting _create_default_persona")
            original_text = ""
            if context and "original_text" in context:
                original_text = context["original_text"]
                logger.info(
                    f"Found original_text in context, length: {len(original_text)}"
                )
            elif context:
                for key, value in context.items():
                    if isinstance(value, str) and len(value) > 100:
                        original_text = value
                        logger.info(
                            f"Using '{key}' as original_text, length: {len(value)}"
                        )
                        break

            if not original_text:
                logger.warning(
                    "No original text found in context to create default persona"
                )
                return []

            # Use the prompt asking for nested structure
            prompt = self._get_direct_persona_prompt_nested(
                original_text
            )  # Use new prompt helper

            # Call LLM directly for persona creation
            logger.info("Calling LLM service for default persona creation")
            llm_response = None  # Initialize response
            # Assuming llm_service.analyze handles the persona_formation task correctly now
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "text": original_text[:4000],  # Use limited text for analysis call
                    "prompt": prompt,
                }
            )

            logger.debug(f"[_create_default_persona] Raw LLM response: {llm_response}")

            # Try to extract persona data using the robust parser
            persona_data = self._parse_llm_json_response(
                llm_response, "_create_default_persona"
            )

            if persona_data and isinstance(
                persona_data, dict
            ):  # Check if we have valid data
                logger.debug(
                    f"[_create_default_persona] Parsed/Extracted persona_data: {persona_data}"
                )
                try:
                    # Extract nested trait data, providing default dict if key missing
                    role_context_data = persona_data.get("role_context", {})
                    key_responsibilities_data = persona_data.get(
                        "key_responsibilities", {}
                    )
                    tools_used_data = persona_data.get("tools_used", {})
                    collaboration_style_data = persona_data.get(
                        "collaboration_style", {}
                    )
                    analysis_approach_data = persona_data.get("analysis_approach", {})
                    pain_points_data = persona_data.get("pain_points", {})

                    # Create a persona object from the extracted data
                    persona = Persona(
                        name=persona_data.get("name", "Default Persona"),
                        description=persona_data.get(
                            "description", "Generated from interview data"
                        ),
                        # Create PersonaTrait instances from nested data
                        role_context=PersonaTrait(
                            value=role_context_data.get("value", ""),
                            confidence=float(role_context_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                role_context_data.get("evidence", [])
                            ),
                        ),
                        key_responsibilities=PersonaTrait(
                            value=key_responsibilities_data.get("value", ""),
                            confidence=float(
                                key_responsibilities_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                key_responsibilities_data.get("evidence", [])
                            ),
                        ),
                        tools_used=PersonaTrait(
                            value=tools_used_data.get("value", ""),
                            confidence=float(tools_used_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                tools_used_data.get("evidence", [])
                            ),
                        ),
                        collaboration_style=PersonaTrait(
                            value=collaboration_style_data.get("value", ""),
                            confidence=float(
                                collaboration_style_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                collaboration_style_data.get("evidence", [])
                            ),
                        ),
                        analysis_approach=PersonaTrait(
                            value=analysis_approach_data.get("value", ""),
                            confidence=float(
                                analysis_approach_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                analysis_approach_data.get("evidence", [])
                            ),
                        ),
                        pain_points=PersonaTrait(
                            value=pain_points_data.get("value", ""),
                            confidence=float(pain_points_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                pain_points_data.get("evidence", [])
                            ),
                        ),
                        patterns=persona_data.get("patterns", []),
                        confidence=float(persona_data.get("confidence", 0.7)),
                        evidence=self._clean_evidence_list(
                            persona_data.get("evidence", [])
                        ),
                        persona_metadata=self._get_text_metadata(
                            original_text, context
                        ),
                    )

                    logger.info(f"Created default persona: {persona.name}")
                    logger.debug(
                        f"[_create_default_persona] Final Persona object: {persona}"
                    )
                    return [persona]
                except Exception as persona_error:
                    logger.error(
                        f"Error creating Persona object from parsed data: {str(persona_error)}",
                        exc_info=True,
                    )
                    # Fallback to minimal persona if object creation fails
                    # Extract speaker and role from context if available
                    speaker = context.get("speaker", None) if context else None
                    role = context.get("role_in_interview", None) if context else None
                    return [self._create_minimal_fallback_persona(speaker=speaker, role=role)]

            logger.warning(
                "Failed to create default persona from context - persona_data was invalid or missing after parsing."
            )
            # Extract speaker and role from context if available
            speaker = context.get("speaker", None) if context else None
            role = context.get("role_in_interview", None) if context else None
            return [self._create_minimal_fallback_persona(speaker=speaker, role=role)]  # Return minimal fallback with context

        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}", exc_info=True)
            # Extract speaker and role from context if available
            speaker = context.get("speaker", None) if context else None
            role = context.get("role_in_interview", None) if context else None
            return [self._create_minimal_fallback_persona(speaker=speaker, role=role)]  # Return minimal fallback with context

    async def _convert_free_text_to_structured_transcript(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Convert free-text transcript to structured JSON format with speaker and text fields.

        This method first tries to parse the transcript using pattern matching.
        If that fails, it falls back to using the LLM to identify speakers and their text.

        Args:
            text: Raw interview transcript text
            context: Optional additional context information

        Returns:
            List of dictionaries with speaker and text fields
        """
        logger.info("Converting free-text transcript to structured format")

        # First try to parse the transcript using pattern matching
        structured_data = self._parse_raw_transcript_to_structured(text)

        if structured_data and len(structured_data) > 0:
            logger.info(f"Successfully parsed transcript using pattern matching: {len(structured_data)} speakers")
            return structured_data

        # If pattern matching fails, fall back to LLM-based conversion
        logger.info("Pattern matching failed, falling back to LLM-based conversion")

        # Create a prompt specifically for transcript structuring
        prompt = f"""
        Analyze the following interview transcript and convert it to a structured JSON format.

        INTERVIEW TRANSCRIPT:


        Identify all distinct speakers in the conversation and extract their dialogue.

        FORMAT YOUR RESPONSE AS JSON with the following structure:
        [
            {{
                "speaker": "Name of first speaker",
                "text": "All text spoken by this speaker concatenated together"
            }},
            {{
                "speaker": "Name of second speaker",
                "text": "All text spoken by this speaker concatenated together"
            }},
            ...
        ]

        IMPORTANT INSTRUCTIONS:
        1. Identify ALL speakers in the transcript
        2. For each speaker, extract ALL of their dialogue and combine it into a single "text" field
        3. Make sure to preserve the exact speaker names as they appear in the transcript
        4. If the transcript has a header or metadata section, do not include it in any speaker's text
        5. Return ONLY valid JSON with NO MARKDOWN formatting
        6. Make sure each speaker appears only ONCE in the output, with all their text combined
        7. If you can't identify distinct speakers, create entries for "Interviewer" and "Interviewee"
        8. Set temperature=0 to ensure deterministic output
        """

        try:
            # Call LLM to convert text to structured format
            llm_response = await self.llm_service.analyze({
                "task": "persona_formation",  # Reuse the persona_formation task
                "prompt": prompt,
                "is_json_task": True,  # Explicitly mark as JSON task to ensure temperature=0
                "temperature": 0  # Explicitly set temperature to 0
            })

            # Parse the response
            structured_data = self._parse_llm_json_response(
                llm_response, "convert_free_text_to_structured_transcript"
            )

            if structured_data and isinstance(structured_data, list) and len(structured_data) > 0:
                # Validate the structure
                valid_entries = []
                for entry in structured_data:
                    if isinstance(entry, dict) and "speaker" in entry and "text" in entry:
                        valid_entries.append(entry)
                    else:
                        logger.warning(f"Invalid entry in structured data: {entry}")

                if valid_entries:
                    logger.info(f"Successfully converted free-text to structured format with {len(valid_entries)} speakers")
                    return valid_entries

            logger.warning("Failed to convert free-text to structured format")
            return []

        except Exception as e:
            logger.error(f"Error converting free-text to structured format: {str(e)}", exc_info=True)
            return []

    def _create_minimal_fallback_persona(self, speaker: str = None, role: str = None) -> Persona:
        """Creates a very basic Persona object as a last resort.

        Args:
            speaker: Optional speaker identifier to include in the persona name
            role: Optional role (e.g., "Interviewee", "Interviewer") to include in the persona

        Returns:
            A minimal Persona object with basic information
        """
        logger.warning(f"Creating minimal fallback persona for speaker: {speaker}, role: {role}")

        # Create a minimal PersonaTrait
        minimal_trait = PersonaTrait(value="Unknown", confidence=0.1, evidence=[])

        # Create a more informative name if speaker/role are provided
        name = "Fallback Participant"
        if role and speaker:
            name = f"{role}: {speaker} (Fallback)"
        elif role:
            name = f"{role} (Fallback)"
        elif speaker:
            name = f"{speaker} (Fallback)"

        # Create a more informative description if role is provided
        description = "Minimal persona created due to errors."
        if role:
            description = f"Minimal {role.lower()} persona created due to processing errors."

        return Persona(
            name=name,
            description=description,
            # Legacy fields
            role_context=minimal_trait,
            key_responsibilities=minimal_trait,
            tools_used=minimal_trait,
            collaboration_style=minimal_trait,
            analysis_approach=minimal_trait,
            pain_points=minimal_trait,
            # New fields will be handled by the Pydantic model defaults
            patterns=[],
            confidence=0.1,
            evidence=["Fallback due to processing error"],
            persona_metadata={
                "source": "emergency_fallback_persona",
                "timestamp": datetime.now().isoformat(),
                "speaker": speaker,
                "role_in_interview": role
            },
            role_in_interview=role if role else "Participant"
        )

    async def save_personas(self, personas: List[Persona], output_path: str):
        """Save personas to JSON file"""
        try:
            with open(output_path, "w") as f:
                json.dump([asdict(p) for p in personas], f, indent=2)
            logger.info(f"Saved {len(personas)} personas to {output_path}")

            # Emit completion event
            try:
                await event_manager.emit(
                    EventType.PROCESSING_COMPLETED,
                    {
                        "stage": "persona_saving",
                        "data": {
                            "output_path": output_path,
                            "persona_count": len(personas),
                        },
                    },
                )
            except Exception as event_error:
                logger.warning(
                    f"Could not emit processing completed event: {str(event_error)}"
                )

        except Exception as e:
            logger.error(f"Error saving personas: {str(e)}")
            try:
                await event_manager.emit_error(e, {"stage": "persona_saving"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            raise

    def _parse_raw_transcript_to_structured(self, raw_text: str) -> List[Dict[str, str]]:
        """Parses raw text transcript into a list of {speaker, text} dictionaries.

        This method handles various transcript formats including:
        - Speaker: Text format
        - Speaker lines with continuation lines
        - Transcripts with timestamps

        Args:
            raw_text: Raw text transcript

        Returns:
            List of dictionaries with speaker and text fields, or empty list if parsing fails
        """
        logger.info("Parsing raw transcript to structured format")

        # Initialize variables
        structured_data = []
        speaker_texts = {}
        current_speaker = None

        # Split the text into lines
        lines = raw_text.split('\n')

        # First pass: Try to identify speaker lines using regex
        speaker_pattern = r"^([A-Za-z][A-Za-z0-9\s\.\-\_]{1,30}):\s*(.*)"
        timestamp_pattern = r"\d{2}:\d{2}:\d{2}|\d{2}:\d{2}"

        # Count how many lines match the speaker pattern
        speaker_line_count = sum(1 for line in lines if re.match(speaker_pattern, line.strip()))

        # If we have enough speaker lines, process the transcript
        if speaker_line_count >= 3:  # Require at least 3 speaker lines to consider it a transcript
            logger.info(f"Found {speaker_line_count} speaker lines in transcript")

            # Process each line
            for line in lines:
                line = line.strip()
                if not line:  # Skip empty lines
                    continue

                # Check if this is a speaker line
                match = re.match(speaker_pattern, line)
                if match:
                    speaker, content = match.groups()
                    speaker = speaker.strip()

                    # Remove timestamps from content if present
                    content = re.sub(timestamp_pattern, "", content).strip()

                    # If we have a new speaker, update current_speaker
                    if speaker != current_speaker:
                        current_speaker = speaker
                        if speaker not in speaker_texts:
                            speaker_texts[speaker] = []

                    # Add content to current speaker's text
                    if content:
                        speaker_texts[current_speaker].append(content)

                # If not a speaker line and we have a current speaker, treat as continuation
                elif current_speaker:
                    # Remove timestamps if present
                    line = re.sub(timestamp_pattern, "", line).strip()
                    if line:
                        speaker_texts[current_speaker].append(line)

            # Convert speaker_texts to structured format
            for speaker, texts in speaker_texts.items():
                if texts:  # Only include speakers with non-empty text
                    structured_data.append({
                        "speaker": speaker,
                        "text": " ".join(texts)
                    })

            if structured_data:
                logger.info(f"Successfully parsed transcript into {len(structured_data)} speakers")
                return structured_data

        # If we couldn't parse the transcript using the speaker pattern, try alternative approaches

        # Try to identify speakers based on indentation or other patterns
        # This is a simplified example - you might need more complex logic for specific formats
        if not structured_data:
            logger.info("Attempting alternative parsing approach")

            # Look for lines that might be speaker indicators (e.g., "Interviewer:", "Interviewee:")
            potential_speakers = set()
            for line in lines:
                if ":" in line and len(line.split(":")[0]) < 30:
                    potential_speaker = line.split(":")[0].strip()
                    if potential_speaker and not re.search(r'\d{2}:\d{2}', potential_speaker):  # Avoid timestamps
                        potential_speakers.add(potential_speaker)

            # If we found potential speakers, try to group text by speaker
            if potential_speakers:
                logger.info(f"Found {len(potential_speakers)} potential speakers using alternative approach")

                # Reset variables
                speaker_texts = {}
                current_speaker = None

                # Process each line again with the identified speakers
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue

                    # Check if this line starts with a potential speaker
                    speaker_match = False
                    for speaker in potential_speakers:
                        if line.startswith(f"{speaker}:"):
                            current_speaker = speaker
                            content = line[len(speaker)+1:].strip()

                            # Remove timestamps if present
                            content = re.sub(timestamp_pattern, "", content).strip()

                            if speaker not in speaker_texts:
                                speaker_texts[speaker] = []

                            if content:
                                speaker_texts[speaker].append(content)

                            speaker_match = True
                            break

                    # If not a speaker line and we have a current speaker, treat as continuation
                    if not speaker_match and current_speaker:
                        # Remove timestamps if present
                        line = re.sub(timestamp_pattern, "", line).strip()
                        if line:
                            speaker_texts[current_speaker].append(line)

                # Convert speaker_texts to structured format
                for speaker, texts in speaker_texts.items():
                    if texts:  # Only include speakers with non-empty text
                        structured_data.append({
                            "speaker": speaker,
                            "text": " ".join(texts)
                        })

                if structured_data:
                    logger.info(f"Successfully parsed transcript using alternative approach: {len(structured_data)} speakers")
                    return structured_data

        # If all parsing attempts fail, return empty list
        logger.warning("Failed to parse raw transcript to structured format")
        return []

    def _get_text_metadata(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate metadata for persona created from text

        Args:
            text: The interview text
            context: Optional additional context

        Returns:
            Metadata dictionary
        """
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "text_length": len(text),
            "source": "direct_text_analysis",
            "method": "llm_schema",
            "sample_size": 1,
        }

        # Include additional context if provided
        if context:
            metadata.update(context)

        return metadata

    def _group_text_by_speaker(self, transcript: List[Dict[str, Any]]) -> Dict[str, str]:
        """Group text by speaker from a structured transcript

        Args:
            transcript: List of transcript entries with speaker and text fields

        Returns:
            Dictionary mapping speaker names to their combined text
        """
        logger.info(f"Grouping text by speaker from {len(transcript)} transcript entries")

        speaker_texts = {}

        for entry in transcript:
            # Skip entries without speaker or text
            if not isinstance(entry, dict):
                continue

            speaker = entry.get("speaker", "")
            text = entry.get("text", "")

            # Skip if missing speaker or text
            if not speaker or not text:
                continue

            # Add text to existing speaker or create new entry
            if speaker in speaker_texts:
                speaker_texts[speaker] += f"\n{text}"
            else:
                speaker_texts[speaker] = text

        logger.info(f"Found {len(speaker_texts)} unique speakers in transcript")
        return speaker_texts

    def _identify_roles(self, speaker_texts: Dict[str, str],
                       participants: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
        """Identify the role of each speaker in the conversation

        Args:
            speaker_texts: Dictionary mapping speaker names to their combined text
            participants: Optional list of participant information with roles

        Returns:
            Dictionary mapping speaker names to their roles (Interviewee, Interviewer, Participant)
        """
        # Use the enhanced identify_roles function if available
        try:
            if 'identify_roles' in globals():
                logger.info("Using enhanced identify_roles implementation")
                return identify_roles(speaker_texts, participants)
        except Exception as e:
            logger.warning(f"Error using enhanced identify_roles: {str(e)}. Falling back to built-in method.")

        # Fallback to built-in implementation
        logger.info(f"Using built-in role identification for {len(speaker_texts)} speakers")

        # If participants with roles are provided, use them
        if participants:
            roles = {}
            for speaker in speaker_texts:
                # Find matching participant
                for participant in participants:
                    if participant.get("name", "") == speaker:
                        roles[speaker] = participant.get("role", "Participant")
                        break
                else:
                    # Default to Participant if no match found
                    roles[speaker] = "Participant"
            return roles

        # Otherwise, use heuristics to identify roles
        roles = {}

        # Check for explicit interviewer/interviewee indicators in speaker names
        for speaker, text in speaker_texts.items():
            speaker_lower = speaker.lower()
            if "interviewer" in speaker_lower or "moderator" in speaker_lower or "researcher" in speaker_lower:
                roles[speaker] = "Interviewer"
                logger.info(f"Identified {speaker} as Interviewer based on name")
            elif "interviewee" in speaker_lower or "participant" in speaker_lower or "subject" in speaker_lower:
                roles[speaker] = "Interviewee"
                logger.info(f"Identified {speaker} as Interviewee based on name")

        # If we've identified all speakers, return the roles
        if len(roles) == len(speaker_texts):
            return roles

        # If we've identified some but not all speakers, use heuristics for the rest
        unassigned_speakers = [s for s in speaker_texts if s not in roles]
        if roles and unassigned_speakers:
            # If we have identified interviewers but no interviewees, the unassigned are likely interviewees
            if "Interviewer" in roles.values() and "Interviewee" not in roles.values():
                for speaker in unassigned_speakers:
                    roles[speaker] = "Interviewee"
                    logger.info(f"Assigned {speaker} as Interviewee (complementary to identified Interviewers)")
            # If we have identified interviewees but no interviewers, the unassigned are likely interviewers
            elif "Interviewee" in roles.values() and "Interviewer" not in roles.values():
                for speaker in unassigned_speakers:
                    roles[speaker] = "Interviewer"
                    logger.info(f"Assigned {speaker} as Interviewer (complementary to identified Interviewees)")
            return roles

        # Heuristic: The speaker with the most text is likely the interviewee
        text_lengths = {speaker: len(text) for speaker, text in speaker_texts.items()}
        if text_lengths:
            primary_speaker = max(text_lengths, key=text_lengths.get)
            roles[primary_speaker] = "Interviewee"
            logger.info(f"Identified {primary_speaker} as Interviewee based on text length")

            # All others are likely interviewers
            for speaker in speaker_texts:
                if speaker != primary_speaker:
                    roles[speaker] = "Interviewer"
                    logger.info(f"Identified {speaker} as Interviewer (complementary to primary speaker)")

        # If no speakers found, return empty dict
        if not roles:
            logger.warning("No speakers identified for role assignment")

        return roles

    def _group_text_by_speaker(self, transcript: List[Dict[str, Any]]) -> Dict[str, str]:
        """Group text by speaker from a structured transcript

        Args:
            transcript: List of transcript entries with speaker and text fields

        Returns:
            Dictionary mapping speaker names to their combined text
        """
        logger.info(f"Grouping text by speaker from {len(transcript)} transcript entries")

        speaker_texts = {}

        for entry in transcript:
            # Skip entries without speaker or text
            if not isinstance(entry, dict):
                continue

            speaker = entry.get("speaker", "")
            text = entry.get("text", "")

            # Skip if missing speaker or text
            if not speaker or not text:
                continue

            # Add text to existing speaker or create new entry
            if speaker in speaker_texts:
                speaker_texts[speaker] += f"\n{text}"
            else:
                speaker_texts[speaker] = text

        logger.info(f"Found {len(speaker_texts)} unique speakers in transcript")
        return speaker_texts

    # This is a duplicate method that has been replaced by the implementation at line 1214
    def _identify_roles_duplicate(self, speaker_texts: Dict[str, str],
                       participants: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
        """Identify the role of each speaker in the conversation - DEPRECATED, use the implementation at line 1214

        This method is kept for backward compatibility but should not be used.
        """
        # Call the primary implementation
        return self._identify_roles(speaker_texts, participants)

    def _get_direct_persona_prompt(self, text: str) -> str:
        """Helper method to generate the refined prompt for direct text analysis."""
        # Simplified prompt - DEPRECATED, use _get_direct_persona_prompt_nested
        logger.warning(
            "_get_direct_persona_prompt is deprecated, use _get_direct_persona_prompt_nested"
        )
        return self._get_direct_persona_prompt_nested(text)  # Call the correct one

    def _get_interviewer_persona_prompt(self, text: str) -> str:
        """Generate a prompt for creating interviewer personas

        This prompt is simpler than the full persona prompt and focuses on
        the interviewer's role in the conversation.

        Args:
            text: The interviewer's text from the transcript

        Returns:
            Prompt for generating an interviewer persona
        """
        return f"""
            Analyze the following text from an interviewer in a conversation and create a focused persona profile.

            INTERVIEWER TEXT:
            {text[:4000]}

            Create a persona that captures this interviewer's style, approach, and interests.
            Focus on their questioning techniques, areas of interest, and interaction style.

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
              "name": "Descriptive Interviewer Role",
              "archetype": "Interviewer Type",
              "description": "Brief overview of the interviewer's approach",
              "role_context": {{
                "value": "Professional context and role",
                "confidence": 0.8,
                "evidence": ["Example question 1", "Example question 2"]
              }},
              "key_responsibilities": {{
                "value": "Main interviewing responsibilities",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "tools_used": {{
                "value": "Interview techniques and approaches",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "collaboration_style": {{
                "value": "How they interact with interviewees",
                "confidence": 0.8,
                "evidence": ["Example 1", "Example 2"]
              }},
              "analysis_approach": {{
                "value": "How they structure questions and follow-ups",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "pain_points": {{
                "value": "Challenges in their interviewing approach",
                "confidence": 0.6,
                "evidence": ["Example 1", "Example 2"]
              }},
              "overall_confidence": 0.7,
              "supporting_evidence_summary": ["Key evidence about their interview style"]
            }}

            Return ONLY a valid JSON object. Do NOT include markdown formatting or any explanatory text.
        """

    def _get_direct_persona_prompt_nested(self, text: str) -> str:
        """Generates the prompt asking for the NESTED PersonaTrait structure."""
        return f"""
            CRITICAL INSTRUCTION: Your ENTIRE response must be a single, valid JSON object. Start with '{{' and end with '}}'. DO NOT include ANY text, comments, or markdown formatting before or after the JSON.

            Analyze the following interview text excerpt and create a comprehensive, detailed user persona profile with specific, concrete details.

            INTERVIEW TEXT:
            {text}

            Extract the following details to build a rich, detailed persona. Be specific and concrete, avoiding vague generalizations. Use direct quotes and evidence from the text whenever possible.

            BASIC INFORMATION:
            1. name: A descriptive role-based name that captures their specific role (e.g., "Enterprise DevOps Automation Specialist" rather than just "Developer")
            2. archetype: A specific category this persona falls into (e.g., "Technical Decision Maker", "UX Research Specialist", "Operations Efficiency Expert")
            3. description: A detailed 2-3 sentence overview of the persona that captures their unique characteristics

            REQUIRED ATTRIBUTES (these MUST be included with proper structure):
            4. demographics: Age range, gender, education level, and professional background
            5. goals_and_motivations: Primary professional goals and what drives their decisions
            6. skills_and_expertise: Technical and soft skills they possess
            7. workflow_and_environment: How they work and their typical environment
            8. challenges_and_frustrations: Problems they face in their work
            9. needs_and_desires: What they need to be successful
            10. technology_and_tools: Specific technologies and tools they use
            11. attitude_towards_research: How they view and use research
            12. attitude_towards_ai: Their perspective on AI and automation
            13. key_quotes: Notable quotes that reveal their perspective
            14. role_context: Detailed job function, specific work environment, and organizational context
            15. key_responsibilities: Comprehensive list of specific tasks and responsibilities mentioned
            16. tools_used: Named tools, specific methods, and explicit technologies mentioned
            17. collaboration_style: Detailed description of how they work with others, communication preferences, team dynamics
            18. analysis_approach: Specific methods for approaching problems, decision-making processes, analytical techniques
            19. pain_points: Concrete challenges, specific frustrations, and explicit problems mentioned

            Each attribute MUST follow this structure:
            "attribute_name": {{
              "value": "Detailed description",
              "confidence": 0.8, // number between 0.0 and 1.0
              "evidence": ["Direct quote 1", "Direct quote 2"]
            }}

            EXAMPLE OF VALID RESPONSE FORMAT:
            {{
              "name": "Enterprise DevOps Specialist",
              "archetype": "Technical Infrastructure Expert",
              "description": "Experienced DevOps engineer focused on automation and CI/CD pipelines.",
              "demographics": {{
                "value": "Mid-30s professional with a computer science background and 8+ years of experience",
                "confidence": 0.7,
                "evidence": ["I've been in this field for over 8 years", "After getting my CS degree"]
              }},
              "goals_and_motivations": {{
                "value": "Aims to streamline deployment processes and reduce manual intervention",
                "confidence": 0.8,
                "evidence": ["My goal is to automate everything possible", "I want zero-touch deployments"]
              }},
              "skills_and_expertise": {{
                "value": "Cloud infrastructure, CI/CD pipelines, and infrastructure as code",
                "confidence": 0.9,
                "evidence": ["I specialize in AWS architecture", "I've implemented CI/CD for 5 teams"]
              }},
              "workflow_and_environment": {{
                "value": "Agile environment with daily standups and two-week sprints",
                "confidence": 0.8,
                "evidence": ["Our two-week sprint cycle", "Daily standups help us stay aligned"]
              }},
              "challenges_and_frustrations": {{
                "value": "Legacy system integration and inconsistent environments",
                "confidence": 0.8,
                "evidence": ["The legacy systems are hard to integrate", "Environment inconsistencies cause most bugs"]
              }},
              "needs_and_desires": {{
                "value": "Better documentation and more standardized processes",
                "confidence": 0.7,
                "evidence": ["We need better documentation", "Standardizing would solve many issues"]
              }},
              "technology_and_tools": {{
                "value": "AWS, Terraform, Jenkins, Docker, and Kubernetes",
                "confidence": 0.9,
                "evidence": ["Our AWS infrastructure", "We use Terraform for everything", "Jenkins pipelines"]
              }},
              "attitude_towards_research": {{
                "value": "Values data-driven decisions and thorough testing",
                "confidence": 0.7,
                "evidence": ["I always look at the metrics first", "Testing is non-negotiable"]
              }},
              "attitude_towards_ai": {{
                "value": "Enthusiastic about AI for automation but cautious about reliability",
                "confidence": 0.6,
                "evidence": ["AI could help automate more tasks", "But we need reliable systems first"]
              }},
              "key_quotes": {{
                "value": "Automate everything that can be automated, and document everything else.",
                "confidence": 0.8,
                "evidence": ["Automate everything that can be automated, and document everything else"]
              }},
              "role_context": {{
                "value": "Works in a cross-functional team managing cloud infrastructure",
                "confidence": 0.8,
                "evidence": ["I manage our AWS infrastructure", "I work with both dev and ops teams"]
              }},
              "key_responsibilities": {{
                "value": "Pipeline automation, infrastructure management, and deployment oversight",
                "confidence": 0.9,
                "evidence": ["I automate our CI/CD pipelines", "I'm responsible for production deployments"]
              }},
              "tools_used": {{
                "value": "Jenkins, Docker, Kubernetes, and Terraform",
                "confidence": 0.9,
                "evidence": ["We use Jenkins for our pipelines", "Our infrastructure is managed with Terraform"]
              }},
              "collaboration_style": {{
                "value": "Collaborative approach with regular cross-team communication",
                "confidence": 0.7,
                "evidence": ["I meet with developers daily", "We have weekly sync meetings with all teams"]
              }},
              "analysis_approach": {{
                "value": "Data-driven troubleshooting with systematic root cause analysis",
                "confidence": 0.8,
                "evidence": ["I always look at the metrics first", "We document all incidents and their solutions"]
              }},
              "pain_points": {{
                "value": "Legacy system integration and documentation gaps",
                "confidence": 0.8,
                "evidence": ["The legacy systems are hard to integrate", "Documentation is often outdated"]
              }},
              "overall_confidence": 0.85,
              "supporting_evidence_summary": ["Consistent mentions of automation tools", "Clear description of role responsibilities"]
            }}

            CRITICAL INSTRUCTIONS:
            1. Your response MUST be a single, valid JSON object
            2. Start with '{{' and end with '}}'
            3. Include ALL required fields, even with minimal data if necessary
            4. Do NOT include any text before or after the JSON object
            5. Do NOT use markdown formatting (like ```json)
            6. Ensure all JSON syntax is valid (quotes, commas, brackets)
            7. Ensure all nested objects have proper structure
            8. ONLY return the JSON object - nothing else
            """

    def _parse_llm_json_response(
        self, response: Union[str, Dict, Any], context_msg: str = ""
    ) -> Optional[Dict]:
        """Attempts to parse a JSON response from the LLM, handling various potential issues."""
        if isinstance(response, dict):
            # If it's already a dict (e.g., from OpenAI compatibility layer or direct SDK support)
            logger.debug(f"[{context_msg}] LLM response is already a dict.")
            # Check if it's an error structure from our service
            if "error" in response:
                logger.error(
                    f"[{context_msg}] LLM service returned an error: {response['error']}"
                )
                return None
            return response

        if not isinstance(response, str):
            logger.error(
                f"[{context_msg}] Unexpected LLM response type: {type(response)}. Expected string or dict."
            )
            return None

        response_text = response.strip()
        logger.debug(
            f"[{context_msg}] Attempting to parse JSON from raw response text (length {len(response_text)}):\n{response_text[:500]}..."
        )

        # 1. Try direct parsing
        try:
            # Attempt to fix common issues like trailing commas
            cleaned_text = re.sub(r",\s*([}\]])", r"\1", response_text)
            parsed_json = json.loads(cleaned_text)
            logger.debug(f"[{context_msg}] Successfully parsed JSON directly.")
            return parsed_json
        except json.JSONDecodeError as e1:
            logger.warning(
                f"[{context_msg}] Direct JSON parsing failed: {e1}. Trying markdown extraction..."
            )

            # 2. Try extracting from ```json ... ```
            match = re.search(
                r"```(?:json)?\s*({[\s\S]*?})\s*```", response_text, re.DOTALL
            )
            if not match:
                # Also try matching arrays if the expected root is a list
                match = re.search(
                    r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", response_text, re.DOTALL
                )

            if match:
                json_str = match.group(1)
                logger.debug(f"[{context_msg}] Found potential JSON in markdown block.")
                try:
                    # Clean potential trailing commas within the extracted block
                    cleaned_json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
                    parsed_json = json.loads(cleaned_json_str)
                    logger.debug(
                        f"[{context_msg}] Successfully parsed JSON from markdown block."
                    )
                    return parsed_json
                except json.JSONDecodeError as e2:
                    logger.error(
                        f"[{context_msg}] Failed to parse JSON extracted from markdown: {e2}"
                    )
                    # Continue to next method
            else:
                logger.warning(f"[{context_msg}] No JSON markdown block found.")

            # 3. Try finding the first '{' and last '}'
            try:
                start_index = response_text.find("{")
                end_index = response_text.rfind("}")
                if start_index != -1 and end_index != -1 and end_index > start_index:
                    json_str = response_text[start_index : end_index + 1]
                    logger.debug(
                        f"[{context_msg}] Found potential JSON between first '{{' and last '}}'."
                    )
                    # Clean potential trailing commas
                    cleaned_json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
                    parsed_json = json.loads(cleaned_json_str)
                    logger.debug(
                        f"[{context_msg}] Successfully parsed JSON using first/last brace method."
                    )
                    return parsed_json
                else:
                    logger.warning(f"[{context_msg}] Could not find matching braces.")
            except json.JSONDecodeError as e3:
                logger.error(
                    f"[{context_msg}] Failed to parse JSON using first/last brace method: {e3}"
                )
            except Exception as e_generic:
                logger.error(
                    f"[{context_msg}] Unexpected error during brace parsing: {e_generic}"
                )

            logger.error(f"[{context_msg}] All JSON parsing attempts failed.")
            return None

    async def form_personas_from_transcript(
        self, transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Generate personas from a structured transcript with speaker identification

        This method processes a structured transcript to generate personas for each speaker,
        identifying their roles in the conversation (interviewee vs interviewer).

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries with role identification
        """
        try:
            logger.info(f"Forming personas from structured transcript with {len(transcript)} entries")

            # Group text by speaker
            speaker_texts = self._group_text_by_speaker(transcript)
            if not speaker_texts:
                logger.warning("No speaker text found in transcript")
                return []

            # Identify speaker roles
            speaker_roles = self._identify_roles(speaker_texts, participants)

            # Generate personas for each speaker
            personas = []

            for i, (speaker, text) in enumerate(speaker_texts.items()):
                try:
                    # Get the role for this speaker
                    role = speaker_roles.get(speaker, "Participant")
                    logger.info(f"Generating persona for {speaker} with role {role}")

                    # Create context with speaker info
                    speaker_context = context.copy() if context else {}
                    speaker_context.update({
                        "speaker": speaker,
                        "role_in_interview": role,
                        "original_text": text
                    })

                    # Choose appropriate prompt based on role
                    if role == "Interviewee":
                        # Use the detailed persona prompt for interviewees
                        prompt = self._get_direct_persona_prompt_nested(text)
                        logger.info(f"Using detailed interviewee persona prompt for {speaker}")
                    elif role == "Interviewer":
                        # Use the interviewer-specific prompt for interviewers
                        prompt = self._get_interviewer_persona_prompt(text)
                        logger.info(f"Using interviewer-specific persona prompt for {speaker}")
                    else:
                        # Use a simpler prompt for other participants
                        prompt = self._get_interviewer_persona_prompt(text)
                        logger.info(f"Using generic participant persona prompt for {speaker} with role {role}")

                    # Call LLM to generate persona
                    # Use more text for analysis with Gemini 2.5 Pro's larger context window
                    text_to_analyze = text
                    if len(text) > 16000:  # If text is very long, use a reasonable chunk
                        logger.info(f"Text for {speaker} is very long ({len(text)} chars), using first 16000 chars")
                        text_to_analyze = text[:16000]

                    llm_response = await self.llm_service.analyze({
                        "task": "persona_formation",
                        "text": text_to_analyze,  # Use more text for analysis with Gemini 2.5 Pro
                        "prompt": prompt,
                        "enforce_json": True  # Flag to enforce JSON output using response_mime_type
                    })

                    # Parse the response
                    persona_data = self._parse_llm_json_response(
                        llm_response, f"form_personas_from_transcript for {speaker}"
                    )

                    # Extract the actual persona object from the response
                    actual_persona_obj = None

                    # Check if persona_data contains a 'personas' list (normalized format from GeminiService)
                    if isinstance(persona_data, dict) and "personas" in persona_data and isinstance(persona_data["personas"], list) and len(persona_data["personas"]) > 0:
                        actual_persona_obj = persona_data["personas"][0]
                        logger.info(f"Extracted persona object from 'personas' list for {speaker}")
                    # Check if persona_data is a direct dictionary with a name (direct format)
                    elif isinstance(persona_data, dict) and "name" in persona_data:
                        actual_persona_obj = persona_data
                        logger.info(f"Using direct dictionary as persona object for {speaker}")
                    else:
                        logger.warning(f"Could not extract persona object from response for {speaker}. Response structure: {type(persona_data)}")
                        if isinstance(persona_data, dict):
                            logger.debug(f"Keys in persona_data: {list(persona_data.keys())}")

                    # Check if we have a valid object to process
                    if actual_persona_obj and isinstance(actual_persona_obj, dict) and actual_persona_obj.get("name"):
                        # Add role information
                        actual_persona_obj["role_in_interview"] = role

                        # Try to validate with Pydantic schema
                        try:
                            logger.debug(f"Attempting to validate persona object: {actual_persona_obj.get('name')}")
                            validated_persona = PersonaSchema(**actual_persona_obj)
                            persona_dict = validated_persona.model_dump(by_alias=True)
                            persona_dict["metadata"] = self._get_text_metadata(text, speaker_context)
                            personas.append(persona_dict)
                            logger.info(f"Successfully created persona for {speaker}: {persona_dict.get('name', 'Unnamed')}")
                        except ValidationError as e:
                            logger.error(f"Pydantic validation failed for {speaker} persona: {str(e)}")
                            logger.debug(f"Persona data that failed validation: {actual_persona_obj}")

                            # Try to fall back to manual creation if we have enough data
                            try:
                                persona = self._create_persona_from_attributes(actual_persona_obj, text, speaker_context)
                                personas.append(persona_to_dict(persona))
                                logger.info(f"Successfully created fallback persona for {speaker} using _create_persona_from_attributes")
                            except Exception as attr_error:
                                logger.error(f"Error creating persona from attributes: {str(attr_error)}")
                                # Create a minimal fallback persona with speaker and role information
                                logger.warning(f"Creating minimal fallback persona for {speaker} due to attribute creation failure")
                                minimal_persona = self._create_minimal_fallback_persona(speaker=speaker, role=role)
                                personas.append(persona_to_dict(minimal_persona))
                        except Exception as create_err:
                            logger.error(f"Error creating persona object for {speaker}: {str(create_err)}", exc_info=True)
                            minimal_persona = self._create_minimal_fallback_persona(speaker=speaker, role=role)
                            personas.append(persona_to_dict(minimal_persona))
                    else:
                        # Log details if extraction failed
                        logger.warning(f"Failed to extract or validate persona object for {speaker}. Original persona_data: {str(persona_data)[:200]}...")
                        # Create a minimal persona for this speaker with speaker and role information
                        logger.info(f"Creating fallback persona for {speaker} due to invalid or empty persona data")
                        minimal_persona = self._create_minimal_fallback_persona(speaker=speaker, role=role)
                        personas.append(persona_to_dict(minimal_persona))

                except Exception as e:
                    logger.error(f"Error generating persona for speaker {speaker}: {str(e)}", exc_info=True)
                    # Create a minimal persona for this speaker with speaker and role information
                    role = speaker_roles.get(speaker, "Participant")
                    minimal_persona = self._create_minimal_fallback_persona(speaker=speaker, role=role)
                    personas.append(persona_to_dict(minimal_persona))

                # Emit progress event
                try:
                    await event_manager.emit(
                        EventType.PROCESSING_STEP,
                        {
                            "stage": "persona_formation_from_transcript",
                            "progress": (i + 1) / len(speaker_texts),
                            "data": {
                                "personas_found": len(personas),
                                "speakers_processed": i + 1,
                            },
                        },
                    )
                except Exception as event_error:
                    logger.warning(f"Could not emit processing step event: {str(event_error)}")

            logger.info(f"Generated {len(personas)} personas from transcript")
            return personas

        except Exception as e:
            logger.error(f"Error forming personas from transcript: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(e, {"stage": "persona_formation_from_transcript"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            return []

    def _get_interviewer_persona_prompt(self, text: str) -> str:
        """Generate a prompt for creating interviewer personas

        This prompt is simpler than the full persona prompt and focuses on
        the interviewer's role in the conversation.

        Args:
            text: The interviewer's text from the transcript

        Returns:
            Prompt for generating an interviewer persona
        """
        return f"""
            CRITICAL INSTRUCTION: Your ENTIRE response must be a single, valid JSON object. Start with '{{' and end with '}}'. DO NOT include ANY text, comments, or markdown formatting before or after the JSON.

            Analyze the following text from an interviewer in a conversation and create a focused persona profile.

            INTERVIEWER TEXT:
            {text}

            Create a persona that captures this interviewer's style, approach, and interests.
            Focus on their questioning techniques, areas of interest, and interaction style.

            REQUIRED ATTRIBUTES (these MUST be included with proper structure):
            1. name: A descriptive role-based name for the interviewer
            2. archetype: A specific category this interviewer falls into
            3. description: A brief overview of the interviewer's approach
            4. role_context: Professional context and role
            5. key_responsibilities: Main interviewing responsibilities
            6. tools_used: Interview techniques and approaches
            7. collaboration_style: How they interact with interviewees
            8. analysis_approach: How they structure questions and follow-ups
            9. pain_points: Challenges in their interviewing approach

            Each attribute MUST follow this structure:
            "attribute_name": {{
              "value": "Detailed description",
              "confidence": 0.8, // number between 0.0 and 1.0
              "evidence": ["Example question 1", "Example question 2"]
            }}

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
              "name": "Descriptive Interviewer Role",
              "archetype": "Interviewer Type",
              "description": "Brief overview of the interviewer's approach",
              "role_context": {{
                "value": "Professional context and role",
                "confidence": 0.8,
                "evidence": ["Example question 1", "Example question 2"]
              }},
              "key_responsibilities": {{
                "value": "Main interviewing responsibilities",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "tools_used": {{
                "value": "Interview techniques and approaches",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "collaboration_style": {{
                "value": "How they interact with interviewees",
                "confidence": 0.8,
                "evidence": ["Example 1", "Example 2"]
              }},
              "analysis_approach": {{
                "value": "How they structure questions and follow-ups",
                "confidence": 0.7,
                "evidence": ["Example 1", "Example 2"]
              }},
              "pain_points": {{
                "value": "Challenges in their interviewing approach",
                "confidence": 0.6,
                "evidence": ["Example 1", "Example 2"]
              }},
              "overall_confidence": 0.7,
              "supporting_evidence_summary": ["Key evidence about their interview style"]
            }}

            CRITICAL INSTRUCTIONS:
            1. Your response MUST be a single, valid JSON object
            2. Start with '{{' and end with '}}'
            3. Include ALL required fields, even with minimal data if necessary
            4. Do NOT include any text before or after the JSON object
            5. Do NOT use markdown formatting (like ```json)
            6. Ensure all JSON syntax is valid (quotes, commas, brackets)
            7. ONLY return the JSON object - nothing else
        """

    def _create_persona_from_attributes(self, attributes: Dict[str, Any],
                                       text: str,
                                       context: Optional[Dict[str, Any]] = None) -> Persona:
        """Create a Persona object from attribute dictionary

        Args:
            attributes: Dictionary of persona attributes
            text: Original text used to generate the persona
            context: Optional additional context

        Returns:
            Persona object
        """
        # Extract nested trait data, providing default dict if key missing
        role_context_data = attributes.get("role_context", {})
        key_responsibilities_data = attributes.get("key_responsibilities", {})
        tools_used_data = attributes.get("tools_used", {})
        collaboration_style_data = attributes.get("collaboration_style", {})
        analysis_approach_data = attributes.get("analysis_approach", {})
        pain_points_data = attributes.get("pain_points", {})

        # Create a persona object from the extracted data
        persona = Persona(
            name=attributes.get("name", "Unknown Persona"),
            description=attributes.get("description", "Generated from interview analysis"),
            # Create PersonaTrait instances from nested data
            role_context=PersonaTrait(
                value=role_context_data.get("value", ""),
                confidence=float(role_context_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(role_context_data.get("evidence", [])),
            ),
            key_responsibilities=PersonaTrait(
                value=key_responsibilities_data.get("value", ""),
                confidence=float(key_responsibilities_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(key_responsibilities_data.get("evidence", [])),
            ),
            tools_used=PersonaTrait(
                value=tools_used_data.get("value", ""),
                confidence=float(tools_used_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(tools_used_data.get("evidence", [])),
            ),
            collaboration_style=PersonaTrait(
                value=collaboration_style_data.get("value", ""),
                confidence=float(collaboration_style_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(collaboration_style_data.get("evidence", [])),
            ),
            analysis_approach=PersonaTrait(
                value=analysis_approach_data.get("value", ""),
                confidence=float(analysis_approach_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(analysis_approach_data.get("evidence", [])),
            ),
            pain_points=PersonaTrait(
                value=pain_points_data.get("value", ""),
                confidence=float(pain_points_data.get("confidence", 0.7)),
                evidence=self._clean_evidence_list(pain_points_data.get("evidence", [])),
            ),
            patterns=attributes.get("patterns", []),
            confidence=float(attributes.get("confidence", 0.7)),
            evidence=self._clean_evidence_list(attributes.get("evidence", [])),
            persona_metadata=self._get_text_metadata(text, context),
            role_in_interview=context.get("role_in_interview", "Participant") if context else "Participant",
        )

        return persona

    async def generate_persona_from_text(
        self, text: Union[str, List[Dict[str, Any]]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Generate persona directly from raw interview text using enhanced LLM schema-based analysis.

        This method provides an alternative persona generation approach that works with raw text data
        rather than requiring pre-extracted patterns. This is especially useful for transcript formats
        like Teams chat exports.

        Args:
            text: Raw interview transcript text or structured transcript data
            context: Optional additional context information

        Returns:
            List of persona dictionaries ready for frontend display
        """
        try:
            logger.info(f"Generating persona from input (type: {type(text)})")

            # Check if the input is a structured transcript
            is_structured_transcript = False
            transcript_data = None

            # CASE 1: Input is already a list of dictionaries (JSON format)
            if isinstance(text, list) and len(text) > 0:
                logger.info(f"Input is a list with {len(text)} items")

                # Check if it's a list of dictionaries
                if all(isinstance(entry, dict) for entry in text):
                    logger.info("Input is a list of dictionaries")

                    # Look for speaker/text fields with various possible names
                    speaker_keys = ['speaker', 'Speaker', 'name', 'Name']
                    text_keys = ['text', 'Text', 'content', 'Content', 'message', 'Message']

                    # Find which keys are present in the first entry
                    first_entry = text[0]
                    speaker_key = next((k for k in speaker_keys if k in first_entry), None)
                    text_key = next((k for k in text_keys if k in first_entry), None)

                    if speaker_key and text_key:
                        logger.info(f"Found structured JSON with speaker key '{speaker_key}' and text key '{text_key}'")

                        # Convert to standard format
                        structured_data = []
                        for entry in text:
                            if speaker_key in entry and text_key in entry:
                                structured_data.append({
                                    "speaker": entry[speaker_key],
                                    "text": entry[text_key]
                                })

                        if structured_data:
                            is_structured_transcript = True
                            transcript_data = structured_data
                            logger.info(f"Successfully converted JSON to structured format with {len(structured_data)} entries")

            # CASE 2: Input is a JSON string
            if isinstance(text, str) and not is_structured_transcript:
                try:
                    # Check if it's a JSON string
                    if text.strip().startswith(('[', '{')):
                        logger.info("Input appears to be a JSON string")
                        potential_transcript = json.loads(text)

                        # If it's a list of dictionaries
                        if isinstance(potential_transcript, list) and len(potential_transcript) > 0:
                            if all(isinstance(entry, dict) for entry in potential_transcript):
                                logger.info("JSON string contains a list of dictionaries")

                                # Look for speaker/text fields with various possible names
                                speaker_keys = ['speaker', 'Speaker', 'name', 'Name']
                                text_keys = ['text', 'Text', 'content', 'Content', 'message', 'Message']

                                # Find which keys are present in the first entry
                                first_entry = potential_transcript[0]
                                speaker_key = next((k for k in speaker_keys if k in first_entry), None)
                                text_key = next((k for k in text_keys if k in first_entry), None)

                                if speaker_key and text_key:
                                    logger.info(f"Found structured JSON with speaker key '{speaker_key}' and text key '{text_key}'")

                                    # Convert to standard format
                                    structured_data = []
                                    for entry in potential_transcript:
                                        if speaker_key in entry and text_key in entry:
                                            structured_data.append({
                                                "speaker": entry[speaker_key],
                                                "text": entry[text_key]
                                            })

                                    if structured_data:
                                        is_structured_transcript = True
                                        transcript_data = structured_data
                                        logger.info(f"Successfully converted JSON string to structured format with {len(structured_data)} entries")
                except json.JSONDecodeError:
                    # Not a valid JSON string, continue with regular text processing
                    logger.debug("Input is not valid JSON")

            # Check for Teams-like transcript format with speaker prefixes
            if isinstance(text, str) and not is_structured_transcript:
                speaker_pattern = r"^([A-Za-z\s]+):\s"
                lines = text.split("\n")
                speaker_line_count = 0

                for line in lines[:20]:  # Check first 20 lines
                    if re.match(speaker_pattern, line):
                        speaker_line_count += 1

                # If more than 30% of the first 20 lines match the speaker pattern, consider it a transcript
                if speaker_line_count >= 6:  # 30% of 20 lines
                    logger.info(f"Detected Teams-style transcript format with {speaker_line_count} speaker lines")
                    # Convert to structured format
                    structured_data = []
                    current_speaker = None
                    current_text = []

                    for line in lines:
                        match = re.match(speaker_pattern, line)
                        if match:
                            # Save previous speaker's text if any
                            if current_speaker and current_text:
                                structured_data.append({
                                    "speaker": current_speaker,
                                    "text": " ".join(current_text)
                                })
                                current_text = []

                            # Start new speaker
                            current_speaker = match.group(1).strip()
                            current_text.append(line[len(current_speaker)+2:].strip())
                        elif current_speaker:
                            # Continue with current speaker
                            current_text.append(line.strip())

                    # Add the last speaker's text
                    if current_speaker and current_text:
                        structured_data.append({
                            "speaker": current_speaker,
                            "text": " ".join(current_text)
                        })

                    if structured_data:
                        is_structured_transcript = True
                        transcript_data = structured_data
                        logger.info(f"Converted Teams-style transcript to structured format with {len(structured_data)} entries")

            # If it's a structured transcript, use the transcript processing method
            if is_structured_transcript and transcript_data:
                logger.info(f"Processing structured transcript with {len(transcript_data)} entries")
                return await self.form_personas_from_transcript(transcript_data, context=context)

            # If we still don't have a structured transcript, use our robust parsing and LLM conversion
            if isinstance(text, str) and not is_structured_transcript:
                logger.info("No structured format detected, using robust parsing and LLM conversion")

                # First try to parse the transcript using pattern matching
                structured_transcript = self._parse_raw_transcript_to_structured(text)

                if structured_transcript and len(structured_transcript) > 0:
                    logger.info(f"Successfully parsed transcript using pattern matching: {len(structured_transcript)} speakers")
                    return await self.form_personas_from_transcript(structured_transcript, context=context)

                # If pattern matching fails, use LLM to convert free-text to structured format
                logger.info("Pattern matching failed, using LLM to convert free-text to structured format")
                structured_transcript = await self._convert_free_text_to_structured_transcript(text, context)

                if structured_transcript and len(structured_transcript) > 0:
                    logger.info(f"Successfully converted free-text to structured format with {len(structured_transcript)} speakers")
                    return await self.form_personas_from_transcript(structured_transcript, context=context)

            # If it's a Teams-like transcript with timestamps and speakers
            if isinstance(text, str) and re.search(r'\[\d+:\d+ [AP]M\] \w+:', text):
                logger.info("Detected Teams-like transcript format")
                # Parse the Teams format into a structured transcript
                transcript_data = []
                for line in text.split('\n'):
                    match = re.match(r'\[(\d+:\d+ [AP]M)\] (\w+): (.*)', line)
                    if match:
                        timestamp, speaker, content = match.groups()
                        transcript_data.append({
                            'timestamp': timestamp,
                            'speaker': speaker,
                            'text': content
                        })

                if transcript_data:
                    logger.info(f"Parsed Teams transcript into {len(transcript_data)} entries")
                    return await self.form_personas_from_transcript(transcript_data, context=context)

            # If we get here, it's a regular text, so proceed with the standard approach
            try:
                # Try to emit event, but don't fail if it doesn't work
                await event_manager.emit(
                    EventType.PROCESSING_STATUS,
                    {"status": "Generating persona from text", "progress": 0.6},
                )
            except Exception as event_error:
                logger.warning(
                    f"Could not emit processing status event: {str(event_error)}"
                )

            # Create the refined prompt asking for nested structure
            prompt = self._get_direct_persona_prompt_nested(text if isinstance(text, str) else str(text))  # Use nested prompt

            # Try different methods to generate persona
            attributes = None
            llm_response = None  # Variable to store raw LLM response

            # Method 1: Use standard analyze method (preferred)
            try:
                text_to_analyze = text if isinstance(text, str) else str(text)

                # Use more text for analysis with Gemini 2.5 Pro's larger context window
                if len(text_to_analyze) > 16000:  # If text is very long, use a reasonable chunk
                    logger.info(f"Text is very long ({len(text_to_analyze)} chars), using first 16000 chars")
                    text_to_analyze = text_to_analyze[:16000]

                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": text_to_analyze,  # Use more text for analysis with Gemini 2.5 Pro
                        "prompt": prompt,
                        "enforce_json": True  # Flag to enforce JSON output using response_mime_type
                    }
                )
                attributes = self._parse_llm_json_response(
                    llm_response, "generate_persona_from_text via analyze"
                )
                if attributes:
                    logger.info("Successfully used analyze method")
            except Exception as e:
                logger.warning(f"Error using analyze method: {str(e)}")

            # Method 2: Use _make_request if available (fallback)
            if attributes is None and hasattr(self.llm_service, "_make_request"):
                try:
                    llm_response = await self.llm_service._make_request(prompt)
                    attributes = self._parse_llm_json_response(
                        llm_response, "generate_persona_from_text via _make_request"
                    )
                    if attributes:
                        logger.info(
                            "Successfully used _make_request method as fallback"
                        )
                except Exception as e:
                    logger.warning(f"Error using _make_request: {str(e)}")

            logger.debug(
                f"[generate_persona_from_text] Raw LLM response: {llm_response}"
            )  # DEBUG LOG
            logger.debug(
                f"[generate_persona_from_text] Parsed/Extracted attributes: {attributes}"
            )  # DEBUG LOG

            # If we have attributes, create a persona
            if attributes and isinstance(attributes, dict):
                try:
                    # Check if we have a personas array or a single persona object
                    if (
                        "personas" in attributes
                        and isinstance(attributes["personas"], list)
                        and len(attributes["personas"]) > 0
                    ):
                        # Use the first persona from the array
                        persona_data = attributes["personas"][0]
                        logger.info(
                            f"Using first persona from personas array: {persona_data.get('name', 'Unnamed')}"
                        )
                    else:
                        # Use the attributes directly as a single persona object
                        persona_data = attributes
                        logger.info(
                            f"Using attributes directly as persona: {persona_data.get('name', 'Unnamed')}"
                        )

                    # Try to validate with Pydantic schema - STRICT validation
                    try:
                        # Log the persona data for debugging
                        logger.debug(
                            f"Attempting to validate persona data: {persona_data}"
                        )

                        # Check for required fields in the persona data
                        required_fields = ["name", "description"]
                        missing_fields = [
                            field
                            for field in required_fields
                            if field not in persona_data
                        ]
                        if missing_fields:
                            logger.warning(
                                f"Missing required fields in persona data: {missing_fields}"
                            )
                            raise ValueError(
                                f"Missing required fields: {missing_fields}"
                            )

                        # Check for required trait fields
                        required_traits = [
                            "demographics",
                            "goals_and_motivations",
                            "skills_and_expertise",
                            "workflow_and_environment",
                            "challenges_and_frustrations",
                            "needs_and_desires",
                            "technology_and_tools",
                            "attitude_towards_research",
                            "attitude_towards_ai",
                        ]

                        # Log which traits are present
                        present_traits = [
                            trait for trait in required_traits if trait in persona_data
                        ]
                        logger.debug(f"Present traits: {present_traits}")

                        missing_traits = [
                            trait
                            for trait in required_traits
                            if trait not in persona_data
                        ]
                        if missing_traits:
                            logger.warning(
                                f"Missing required trait fields: {missing_traits}"
                            )
                            # Don't raise an error yet, we'll let Pydantic handle this

                        # Directly instantiate the Pydantic model with nested data
                        # Pydantic handles nested PersonaTrait validation automatically
                        validated_persona = PersonaSchema(**persona_data)
                        logger.info(
                            f"Successfully validated persona schema via Pydantic: {validated_persona.name}"
                        )

                        # Convert back to dict for return
                        persona_dict = validated_persona.model_dump(
                            by_alias=True
                        )  # Use by_alias=True to handle aliases

                        # Add metadata
                        persona_dict["metadata"] = self._get_text_metadata(
                            text, context
                        )

                        logger.debug(
                            f"[generate_persona_from_text] Returning validated persona dict: {persona_dict}"
                        )
                        return [persona_dict]  # Return as list

                    except ValidationError as e:
                        logger.error(
                            f"Pydantic validation failed for persona attributes: {e}",
                            exc_info=True,
                        )
                        logger.debug(
                            f"Attributes causing validation error: {persona_data}"
                        )
                        # Log the specific validation errors to help diagnose the issue
                        for error in e.errors():
                            logger.error(
                                f"Validation error: {error['loc']} - {error['msg']}"
                            )
                        # Continue to fallback approach below
                    except Exception as e:
                        logger.error(
                            f"Error during Pydantic validation: {str(e)}", exc_info=True
                        )
                        # Continue to fallback approach below

                    # Fallback to manual creation if validation fails
                    logger.info("Falling back to manual persona creation")

                    # Extract nested trait data, providing default dict if key missing
                    role_context_data = persona_data.get("role_context", {})
                    key_responsibilities_data = persona_data.get(
                        "key_responsibilities", {}
                    )
                    tools_used_data = persona_data.get("tools_used", {})
                    collaboration_style_data = persona_data.get(
                        "collaboration_style", {}
                    )
                    analysis_approach_data = persona_data.get("analysis_approach", {})
                    pain_points_data = persona_data.get("pain_points", {})

                    # Create a persona object from the extracted data
                    persona = Persona(
                        name=persona_data.get("name", "Unknown Persona"),
                        description=persona_data.get(
                            "description", "Generated from interview analysis"
                        ),
                        # Create PersonaTrait instances from nested data
                        role_context=PersonaTrait(
                            value=role_context_data.get("value", ""),
                            confidence=float(role_context_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                role_context_data.get("evidence", [])
                            ),
                        ),
                        key_responsibilities=PersonaTrait(
                            value=key_responsibilities_data.get("value", ""),
                            confidence=float(
                                key_responsibilities_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                key_responsibilities_data.get("evidence", [])
                            ),
                        ),
                        tools_used=PersonaTrait(
                            value=tools_used_data.get("value", ""),
                            confidence=float(tools_used_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                tools_used_data.get("evidence", [])
                            ),
                        ),
                        collaboration_style=PersonaTrait(
                            value=collaboration_style_data.get("value", ""),
                            confidence=float(
                                collaboration_style_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                collaboration_style_data.get("evidence", [])
                            ),
                        ),
                        analysis_approach=PersonaTrait(
                            value=analysis_approach_data.get("value", ""),
                            confidence=float(
                                analysis_approach_data.get("confidence", 0.7)
                            ),
                            evidence=self._clean_evidence_list(
                                analysis_approach_data.get("evidence", [])
                            ),
                        ),
                        pain_points=PersonaTrait(
                            value=pain_points_data.get("value", ""),
                            confidence=float(pain_points_data.get("confidence", 0.7)),
                            evidence=self._clean_evidence_list(
                                pain_points_data.get("evidence", [])
                            ),
                        ),
                        patterns=attributes.get(
                            "patterns", []
                        ),  # Use patterns if LLM provides them
                        confidence=float(
                            attributes.get("confidence", 0.7)
                        ),  # Use overall confidence from LLM
                        evidence=self._clean_evidence_list(
                            attributes.get(
                                "evidence", ["Generated from direct text analysis"]
                            )
                        ),  # Use evidence if provided
                        persona_metadata=self._get_text_metadata(
                            text, context
                        ),  # Use persona_metadata
                    )

                    logger.info(f"Created persona: {persona.name}")
                    logger.debug(
                        f"[generate_persona_from_text] Final Persona object: {persona}"
                    )  # DEBUG LOG
                    try:
                        await event_manager.emit(
                            EventType.PROCESSING_STATUS,
                            {
                                "status": "Persona generated successfully",
                                "progress": 0.9,
                            },
                        )
                    except Exception as event_error:
                        logger.warning(
                            f"Could not emit processing status event: {str(event_error)}"
                        )

                    # Convert to dictionary and return
                    try:
                        # Use the persona_to_dict function to convert the persona to a serializable dictionary
                        persona_dict = persona_to_dict(persona)
                        logger.debug(
                            f"[generate_persona_from_text] Returning persona dict: {persona_dict}"
                        )  # DEBUG LOG
                        return [persona_dict]
                    except Exception as dict_error:
                        logger.error(
                            f"Error converting persona to dictionary: {str(dict_error)}"
                        )
                        # Manual conversion as fallback
                        persona_dict = {
                            "name": persona.name,
                            "description": persona.description,
                            "role_context": {
                                "value": persona.role_context.value,
                                "confidence": float(persona.role_context.confidence),
                                "evidence": persona.role_context.evidence,
                            },
                            "key_responsibilities": {
                                "value": persona.key_responsibilities.value,
                                "confidence": float(
                                    persona.key_responsibilities.confidence
                                ),
                                "evidence": persona.key_responsibilities.evidence,
                            },
                            "tools_used": {
                                "value": persona.tools_used.value,
                                "confidence": float(persona.tools_used.confidence),
                                "evidence": persona.tools_used.evidence,
                            },
                            "collaboration_style": {
                                "value": persona.collaboration_style.value,
                                "confidence": float(
                                    persona.collaboration_style.confidence
                                ),
                                "evidence": persona.collaboration_style.evidence,
                            },
                            "analysis_approach": {
                                "value": persona.analysis_approach.value,
                                "confidence": float(
                                    persona.analysis_approach.confidence
                                ),
                                "evidence": persona.analysis_approach.evidence,
                            },
                            "pain_points": {
                                "value": persona.pain_points.value,
                                "confidence": float(persona.pain_points.confidence),
                                "evidence": persona.pain_points.evidence,
                            },
                            "patterns": persona.patterns,
                            "confidence": float(persona.confidence),
                            "evidence": persona.evidence,
                            "persona_metadata": persona.persona_metadata,  # Use persona_metadata
                        }
                        logger.debug(
                            f"[generate_persona_from_text] Returning fallback persona dict: {persona_dict}"
                        )  # DEBUG LOG
                        return [persona_dict]
                except Exception as e:
                    logger.error(
                        f"Error creating persona from attributes: {str(e)}",
                        exc_info=True,
                    )

            # Fallback to default persona creation if attributes are missing or invalid
            logger.warning(
                "Attributes missing or invalid after LLM call, falling back to default persona creation."
            )
            context_with_text = context or {}
            context_with_text["original_text"] = text
            personas = await self._create_default_persona(context_with_text)

            # Convert to dictionaries and return
            return [persona_to_dict(p) for p in personas]

        except Exception as e:
            logger.error(f"Error generating persona from text: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(
                    e, {"context": "generate_persona_from_text"}
                )
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")

            # Return a minimal persona as fallback
            return [persona_to_dict(self._create_minimal_fallback_persona())]
