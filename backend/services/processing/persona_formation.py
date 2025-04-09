"""Enhanced persona formation service with comprehensive attribute analysis"""

from typing import List, Dict, Any, Optional, Union  # Corrected duplicate Union import
from dataclasses import dataclass, asdict, field
import asyncio
import json
import logging
from datetime import datetime
import re
from pydantic import ValidationError

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
                    return [self._create_minimal_fallback_persona()]

            logger.warning(
                "Failed to create default persona from context - persona_data was invalid or missing after parsing."
            )
            return [self._create_minimal_fallback_persona()]  # Return minimal fallback

        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}", exc_info=True)
            return [self._create_minimal_fallback_persona()]  # Return minimal fallback

    def _create_minimal_fallback_persona(self) -> Persona:
        """Creates a very basic Persona object as a last resort."""
        logger.warning("Creating minimal fallback persona.")

        # Create a minimal PersonaTrait
        minimal_trait = PersonaTrait(value="Unknown", confidence=0.1, evidence=[])

        return Persona(
            name="Fallback Participant",
            description="Minimal persona created due to errors.",
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
            },
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

    def _get_direct_persona_prompt(self, text: str) -> str:
        """Helper method to generate the refined prompt for direct text analysis."""
        # Simplified prompt - DEPRECATED, use _get_direct_persona_prompt_nested
        logger.warning(
            "_get_direct_persona_prompt is deprecated, use _get_direct_persona_prompt_nested"
        )
        return self._get_direct_persona_prompt_nested(text)  # Call the correct one

    def _get_direct_persona_prompt_nested(self, text: str) -> str:
        """Generates the prompt asking for the NESTED PersonaTrait structure."""
        return f"""
            Analyze the following interview text excerpt and create a comprehensive, detailed user persona profile with specific, concrete details.

            INTERVIEW TEXT (excerpt):
            {text[:4000]}

            Extract the following details to build a rich, detailed persona. Be specific and concrete, avoiding vague generalizations. Use direct quotes and evidence from the text whenever possible.

            BASIC INFORMATION:
            1. name: A descriptive role-based name that captures their specific role (e.g., "Enterprise DevOps Automation Specialist" rather than just "Developer")
            2. archetype: A specific category this persona falls into (e.g., "Technical Decision Maker", "UX Research Specialist", "Operations Efficiency Expert")
            3. description: A detailed 2-3 sentence overview of the persona that captures their unique characteristics

            DETAILED ATTRIBUTES (each with specific value, confidence score 0.0-1.0, and direct supporting evidence from the text):
            4. demographics: Specific age range, career stage, education level, years of experience, industry background, and other demographic information
            5. goals_and_motivations: Concrete objectives, specific aspirations, and explicit driving factors mentioned in the text
            6. skills_and_expertise: Specific technical and soft skills, knowledge areas, and expertise levels with examples
            7. workflow_and_environment: Detailed work processes, specific tools in their workflow, physical/digital environment details
            8. challenges_and_frustrations: Specific pain points, concrete obstacles, and explicit sources of frustration mentioned
            9. needs_and_desires: Particular needs, specific wants, and explicit desires related to their work
            10. technology_and_tools: Named software applications, specific hardware, and other tools mentioned by name
            11. attitude_towards_research: Specific views on research methodologies, data usage, and evidence-based approaches
            12. attitude_towards_ai: Detailed perspective on AI tools, automation preferences, and technological change attitudes
            13. key_quotes: Exact quotes from the text that capture the persona's authentic voice and perspective

            LEGACY ATTRIBUTES (for backward compatibility, each with specific value, confidence score 0.0-1.0, and direct supporting evidence):
            14. role_context: Detailed job function, specific work environment, and organizational context
            15. key_responsibilities: Comprehensive list of specific tasks and responsibilities mentioned
            16. tools_used: Named tools, specific methods, and explicit technologies mentioned
            17. collaboration_style: Detailed description of how they work with others, communication preferences, team dynamics
            18. analysis_approach: Specific methods for approaching problems, decision-making processes, analytical techniques
            19. pain_points: Concrete challenges, specific frustrations, and explicit problems mentioned

            OVERALL PERSONA INFORMATION:
            20. patterns: List of specific behavioral patterns with concrete examples from the text
            21. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
            22. supporting_evidence_summary: Key evidence supporting the overall persona characterization

            GUIDELINES FOR HIGH-QUALITY PERSONA CREATION:
            - Be specific and concrete rather than vague or general
            - Use direct quotes from the text as evidence whenever possible
            - Avoid assumptions not supported by the text
            - Ensure all attributes have meaningful, detailed content
            - Maintain high standards for evidence quality
            - Assign appropriate confidence scores based on evidence strength
            - Focus on capturing the unique characteristics of this specific individual

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
              "name": "Specific Role-Based Name",
              "archetype": "Specific Persona Category",
              "description": "Detailed overview of the persona with specific characteristics",
              "demographics": {{
                "value": "Specific age range, experience level, education, etc.",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "goals_and_motivations": {{
                "value": "Specific objectives and concrete aspirations",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "skills_and_expertise": {{
                "value": "Specific technical and soft skills with examples",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "workflow_and_environment": {{
                "value": "Specific work processes and detailed context",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "challenges_and_frustrations": {{
                "value": "Specific pain points and concrete obstacles",
                "confidence": 0.9,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "needs_and_desires": {{
                "value": "Specific needs and concrete wants",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "technology_and_tools": {{
                "value": "Named software and specific hardware used",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "attitude_towards_research": {{
                "value": "Specific views on research methodologies and data",
                "confidence": 0.6,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "attitude_towards_ai": {{
                "value": "Specific perspective on AI tools and automation",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "key_quotes": {{
                "value": "Exact representative quotes from the text",
                "confidence": 0.9,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "role_context": {{
                "value": "Specific job function and detailed environment",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "key_responsibilities": {{
                "value": "Comprehensive list of specific tasks mentioned",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "tools_used": {{
                "value": "Named tools and specific technologies mentioned",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "collaboration_style": {{
                "value": "Specific description of how they work with others",
                "confidence": 0.7,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "analysis_approach": {{
                "value": "Specific methods for approaching problems",
                "confidence": 0.6,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "pain_points": {{
                "value": "Concrete challenges and specific frustrations",
                "confidence": 0.8,
                "evidence": ["Direct quote 1", "Direct quote 2"]
              }},
              "patterns": ["Specific pattern 1 with example", "Specific pattern 2 with example", "Specific pattern 3 with example"],
              "overall_confidence": 0.75,
              "supporting_evidence_summary": ["Key evidence 1", "Key evidence 2"]
            }}

            IMPORTANT: Ensure all attributes are included with proper structure, with specific, detailed content and direct quotes as evidence.

             Return ONLY a valid JSON object. Do NOT include markdown formatting (like ```json) or any explanatory text before or after the JSON.
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

    async def generate_persona_from_text(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Generate persona directly from raw interview text using enhanced LLM schema-based analysis.

        This method provides an alternative persona generation approach that works with raw text data
        rather than requiring pre-extracted patterns. This is especially useful for transcript formats
        like Teams chat exports.

        Args:
            text: Raw interview transcript text
            context: Optional additional context information

        Returns:
            List of persona dictionaries ready for frontend display
        """
        try:
            logger.info(f"Generating persona directly from text ({len(text)} chars)")
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
            prompt = self._get_direct_persona_prompt_nested(text)  # Use nested prompt

            # Try different methods to generate persona
            attributes = None
            llm_response = None  # Variable to store raw LLM response

            # Method 1: Use standard analyze method (preferred)
            try:
                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": text[
                            :4000
                        ],  # Pass original text snippet for context if needed by analyze
                        "prompt": prompt,
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
