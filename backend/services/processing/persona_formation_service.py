"""
Persona formation service that orchestrates the persona generation process.

This service coordinates the following steps:
1. Parsing and structuring raw transcripts
2. Extracting attributes from text
3. Building personas from attributes
4. Handling error cases and creating fallback personas
"""

from typing import List, Dict, Any, Optional, Union, Tuple
import asyncio
import json
import logging
from datetime import datetime
import re

# Import enhanced JSON parsing
from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair
from backend.services.processing.persona_formation_service_enhanced import parse_llm_json_response_enhanced
from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
from domain.models.persona_schema import Persona as PersonaModel
# Import new Instructor-based parser
from backend.utils.json.instructor_parser import parse_llm_json_response_with_instructor

# Import our modules
from .transcript_structuring_service import TranscriptStructuringService
from .attribute_extractor import AttributeExtractor
from .persona_builder import PersonaBuilder, persona_to_dict, Persona
from .prompts import PromptGenerator
from .evidence_linking_service import EvidenceLinkingService
from .trait_formatting_service import TraitFormattingService

# Import LLM interface
try:
    # Try to import from backend structure
    from backend.domain.interfaces.llm_unified import ILLMService
except ImportError:
    try:
        # Try to import from regular structure
        from domain.interfaces.llm_unified import ILLMService
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
    logger.info("Successfully imported event_manager from backend.infrastructure.events")
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
            logger.info("Using fallback event_manager from backend.infrastructure.state.events")
        except ImportError:
            try:
                from infrastructure.state.events import event_manager, EventType
                logger = logging.getLogger(__name__)
                logger.info("Using fallback event_manager from infrastructure.state.events")
            except ImportError:
                # Create minimal event system if all imports fail
                logger = logging.getLogger(__name__)
                logger.error("Failed to import events system, using minimal event logging")
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

# Configure logging
logger = logging.getLogger(__name__)


class PersonaFormationService:
    """
    Service for forming personas from analysis patterns or raw text.

    This service orchestrates the entire persona formation process, delegating
    specific tasks to specialized modules.
    """

    def __init__(self, config, llm_service: ILLMService):
        """
        Initialize the persona formation service.

        Args:
            config: System configuration object
            llm_service: Initialized LLM service
        """
        self.config = config
        self.llm_service = llm_service
        self.min_confidence = getattr(config.validation, "min_confidence", 0.4)
        self.validation_threshold = self.min_confidence

        # Initialize our helper modules
        self.transcript_structuring_service = TranscriptStructuringService(llm_service)
        self.attribute_extractor = AttributeExtractor(llm_service)
        self.persona_builder = PersonaBuilder()
        self.prompt_generator = PromptGenerator()

        # Initialize our new services
        self.evidence_linking_service = EvidenceLinkingService(llm_service)
        self.trait_formatting_service = TraitFormattingService(llm_service)

        # Initialize the Instructor client (lazy loading - will be created when needed)
        self._instructor_client = None

        # No longer using TranscriptProcessor - all functionality is now in TranscriptStructuringService
        logger.info("Using TranscriptStructuringService for transcript processing")
        logger.info("Using EvidenceLinkingService for enhanced evidence linking")
        logger.info("Using TraitFormattingService for improved trait value formatting")
        logger.info("Using Instructor for structured outputs from LLMs")

        logger.info(f"Initialized PersonaFormationService with {llm_service.__class__.__name__}")

    async def form_personas(self, patterns: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Form personas from identified patterns.

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
            logger.info(f"Grouped patterns into {len(grouped_patterns)} potential personas")

            # Form a persona from each group
            personas = []

            for i, group in enumerate(grouped_patterns):
                try:
                    # Convert the group to a persona
                    attributes = await self._analyze_patterns_for_persona(group)
                    logger.debug(f"[form_personas] Attributes received from LLM for group {i}: {attributes}")

                    if attributes and isinstance(attributes, dict) and attributes.get("confidence", 0) >= self.validation_threshold:
                        try:
                            # Build persona from attributes
                            persona = self.persona_builder.build_persona_from_attributes(attributes)
                            personas.append(persona)
                            logger.info(f"Created persona: {persona.name} with confidence {persona.confidence}")
                        except Exception as persona_creation_error:
                            logger.error(f"Error creating Persona object for group {i}: {persona_creation_error}", exc_info=True)
                    else:
                        logger.warning(
                            f"Skipping persona creation for group {i} - confidence {attributes.get('confidence', 0)} "
                            f"below threshold {self.validation_threshold} or attributes invalid."
                        )
                except Exception as attr_error:
                    logger.error(f"Error analyzing persona attributes for group {i}: {str(attr_error)}", exc_info=True)

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
                    logger.warning(f"Could not emit processing step event: {str(event_error)}")

            # If no personas were created, try to create a default one
            if not personas:
                logger.warning("No personas created from patterns, creating default persona")
                personas = await self._create_default_persona(context)

            logger.info(f"[form_personas] Returning {len(personas)} personas.")
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

    async def generate_persona_from_text(
        self, text: Union[str, List[Dict[str, Any]]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate persona directly from raw interview text.

        Args:
            text: Raw interview transcript text or structured transcript data
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Generating persona from text of type {type(text)}")

            # Check if text is empty or too short
            if isinstance(text, str) and (not text or len(text.strip()) < 10):
                logger.warning("Text is empty or too short for persona generation")
                # Return a fallback persona
                fallback_persona = self.persona_builder.create_fallback_persona("Participant")
                return [persona_to_dict(fallback_persona)]
            elif isinstance(text, list) and (not text or len(text) == 0):
                logger.warning("Structured transcript is empty")
                # Return a fallback persona
                fallback_persona = self.persona_builder.create_fallback_persona("Participant")
                return [persona_to_dict(fallback_persona)]

            # Log the length of the text for debugging
            if isinstance(text, str):
                logger.info(f"Text length: {len(text)} characters")
            elif isinstance(text, list):
                logger.info(f"Structured transcript with {len(text)} entries")

            # Check if text is already a structured transcript
            is_structured_transcript = False
            if isinstance(text, list) and len(text) > 0:
                # Check if it has the expected structure
                if all(isinstance(item, dict) and "speaker" in item and "text" in item for item in text):
                    is_structured_transcript = True
                    logger.info("Input is already a structured transcript")
                    # Log a sample of the structured transcript
                    logger.info(f"Sample entry: {text[0]}")

            # If we have a structured transcript, use it directly
            if is_structured_transcript:
                return await self.form_personas_from_transcript(text, context=context)

            # If we still don't have a structured transcript, use our LLM-powered transcript structuring
            if isinstance(text, str) and not is_structured_transcript:
                logger.info("No structured format detected, using LLM-powered transcript structuring")

                # Log a sample of the text for debugging
                logger.info(f"Text sample: {text[:200]}...")

                # Use the new TranscriptStructuringService to structure the transcript
                # Pass filename if available in context
                filename = None
                if context and "filename" in context:
                    filename = context.get("filename")
                    logger.info(f"Using filename from context for transcript structuring: {filename}")

                structured_transcript = await self.transcript_structuring_service.structure_transcript(text, filename=filename)

                if structured_transcript and len(structured_transcript) > 0:
                    logger.info(f"Successfully structured transcript using LLM: {len(structured_transcript)} segments")
                    # Log a sample of the structured transcript
                    logger.info(f"Sample segment: {structured_transcript[0]}")
                    return await self.form_personas_from_transcript(structured_transcript, context=context)

            # If LLM structuring fails, we will now rely on robust error handling
            # or return empty/fallback personas rather than using regex.
            logger.warning("LLM-based transcript structuring failed or returned empty. No regex fallback implemented.")
            # Consider what to return here: an empty list, a specific error, or a generic fallback persona.
            # For now, let's return an empty list, which will propagate up.
            # A fallback persona could also be generated here if desired.
            # fallback_persona = self.persona_builder.create_fallback_persona("Participant", "Transcript structuring failed")
            # return [persona_to_dict(fallback_persona)]
            return [] # Returning empty list if structuring fails

        except Exception as e:
            logger.error(f"Error in generate_persona_from_text: {str(e)}", exc_info=True)
            # Consider emitting an error event here if you have an event system
            # from backend.services.event_manager import event_manager
            # try:
            #     await event_manager.emit_error(e, {"stage": "generate_persona_from_text"})
            # except Exception as event_error:
            #     logger.warning(f"Could not emit error event: {str(event_error)}")
            return [] # Return empty list to prevent analysis failure

    async def form_personas_from_transcript(
        self, transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from a structured transcript with speaker identification.

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(f"Forming personas from transcript with {len(transcript)} entries")

            # Log a sample of the transcript for debugging
            if transcript and len(transcript) > 0:
                logger.info(f"Sample transcript entry: {transcript[0]}")

            # Consolidate text per speaker and extract roles
            speaker_dialogues = {}
            speaker_roles_map = {}

            # Handle both old and new transcript formats
            for turn in transcript:
                # Extract speaker ID (handle both old and new formats)
                speaker_id = turn.get("speaker_id", turn.get("speaker", "Unknown Speaker"))

                # Extract dialogue/text (handle both old and new formats)
                dialogue = turn.get("dialogue", turn.get("text", ""))

                # Extract role (handle both old and new formats, with fallback to participants if provided)
                role = turn.get("role", "Participant")

                # Initialize speaker entry if not exists
                if speaker_id not in speaker_dialogues:
                    speaker_dialogues[speaker_id] = []
                    speaker_roles_map[speaker_id] = role  # Store the first inferred role

                # Add this dialogue to the speaker's collection
                speaker_dialogues[speaker_id].append(dialogue)

            # Consolidate dialogues into a single text per speaker
            speaker_texts = {
                speaker: " ".join(dialogues)
                for speaker, dialogues in speaker_dialogues.items()
            }

            logger.info(f"Consolidated text for {len(speaker_texts)} speakers")

            # Log the speakers and text lengths for debugging
            for speaker, text in speaker_texts.items():
                logger.info(f"Speaker: {speaker}, Role: {speaker_roles_map.get(speaker, 'Unknown')}, Text length: {len(text)} chars")

            # Override with provided participant roles if available
            if participants and isinstance(participants, list):
                for participant in participants:
                    if "name" in participant and "role" in participant:
                        speaker_name = participant["name"]
                        if speaker_name in speaker_roles_map:
                            speaker_roles_map[speaker_name] = participant["role"]
                            logger.info(f"Overriding role for {speaker_name} to {participant['role']}")

                logger.info(f"Applied {len(participants)} provided participant roles")

            # Generate a persona for each speaker
            personas = []

            # Process speakers in order of text length (most text first)
            sorted_speakers = sorted(
                speaker_texts.items(),
                key=lambda x: len(x[1]),
                reverse=True
            )

            for i, (speaker, text) in enumerate(sorted_speakers):
                try:
                    # Get the role for this speaker from our consolidated role mapping
                    role = speaker_roles_map.get(speaker, "Participant")
                    logger.info(f"Generating persona for {speaker} with role {role}, text length: {len(text)} chars")

                    # Skip if text is too short (likely noise)
                    if len(text) < 100:
                        logger.warning(f"Skipping persona generation for {speaker} - text too short ({len(text)} chars)")
                        continue

                    # Create a context object for this speaker
                    speaker_context = {
                        "speaker": speaker,
                        "role": role,
                        **(context or {})
                    }

                    # Create a prompt based on the role using simplified format
                    prompt = self.prompt_generator.create_simplified_persona_prompt(text, role)

                    # Log the prompt length for debugging
                    logger.info(f"Created simplified prompt for {speaker} with length: {len(prompt)} chars")

                    # Call LLM to generate persona
                    # Use the full text for analysis with Gemini 2.5 Flash's large context window
                    text_to_analyze = text  # Use the full text without truncation
                    logger.info(f"Using full text of {len(text_to_analyze)} chars for {speaker}")

                    # Add more context to the request
                    request_data = {
                        "task": "persona_formation",
                        "text": text_to_analyze,
                        "prompt": prompt,
                        "enforce_json": True,  # Flag to enforce JSON output using response_mime_type
                        "response_mime_type": "application/json",  # Explicitly request JSON response
                        "speaker": speaker,
                        "role": role
                    }

                    # Call LLM to generate persona
                    llm_response = await self.llm_service.analyze(request_data)

                    # --- ADD DETAILED LOGGING HERE ---
                    logger.info(f"[PersonaFormationService] Raw LLM response for persona_formation (first 500 chars): {str(llm_response)[:500]}")
                    # If it's a string, log the full string for debugging if it's not too long
                    if isinstance(llm_response, str) and len(llm_response) < 2000:
                        logger.debug(f"[PersonaFormationService] Full raw LLM response string: {llm_response}")
                    # --- END DETAILED LOGGING ---

                    # Parse the response
                    persona_data = self._parse_llm_json_response(llm_response, f"form_personas_from_transcript for {speaker}")

                    # Log the persona data keys for debugging
                    if persona_data and isinstance(persona_data, dict):
                        logger.info(f"Persona data keys for {speaker}: {list(persona_data.keys())}")
                    else:
                        logger.warning(f"No valid persona data for {speaker}")

                    if persona_data and isinstance(persona_data, dict):
                        # Use the speaker ID from the transcript as the default/override name
                        name_override = speaker
                        logger.info(f"Using speaker ID from transcript as name_override: {name_override}")

                        # If the persona data doesn't have a name, use the speaker name (which is now name_override)
                        if "name" not in persona_data or not persona_data["name"]:
                            persona_data["name"] = name_override
                            logger.info(f"Using speaker name as persona name: {name_override}")
                        elif name_override and name_override != persona_data.get("name"):
                            # This case might be if we want to enforce the transcript speaker_id as the primary name
                            # For now, let's log if the LLM provided a different name than the speaker_id
                            logger.info(f"LLM provided name '{persona_data.get('name')}' differs from transcript speaker_id '{name_override}'. Using LLM name for now.")

                        # Build persona from attributes
                        # The 'role' here is the role determined earlier for this speaker
                        persona = self.persona_builder.build_persona_from_attributes(persona_data, persona_data.get("name", name_override), role)
                        personas.append(persona_to_dict(persona))
                        logger.info(f"Successfully created persona for {speaker}: {persona.name}")
                    else:
                        logger.warning(f"Failed to generate valid persona data for {speaker}")
                        # Create a minimal persona for this speaker
                        minimal_persona = self.persona_builder.create_fallback_persona(role, speaker)
                        personas.append(persona_to_dict(minimal_persona))
                        logger.info(f"Created fallback persona for {speaker}")

                except Exception as e:
                    logger.error(f"Error generating persona for speaker {speaker}: {str(e)}", exc_info=True)
                    # Create a minimal persona for this speaker with speaker and role information
                    # Use speaker_roles_map which is defined in this scope
                    role_for_fallback = speaker_roles_map.get(speaker, "Participant")
                    minimal_persona = self.persona_builder.create_fallback_persona(role_for_fallback, speaker)
                    personas.append(persona_to_dict(minimal_persona))
                    logger.info(f"Created error fallback persona for {speaker}")

                # Emit progress event
                try:
                    await event_manager.emit(
                        EventType.PROCESSING_STEP,
                        {
                            "stage": "persona_formation_from_transcript",
                            "progress": (i + 1) / len(sorted_speakers),
                            "data": {
                                "personas_found": len(personas),
                                "speakers_processed": i + 1,
                            },
                        },
                    )
                except Exception as event_error:
                    logger.warning(f"Could not emit processing step event: {str(event_error)}")

            logger.info(f"Returning {len(personas)} personas from transcript")
            return personas

        except Exception as e:
            logger.error(f"Error forming personas from transcript: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(e, {"stage": "form_personas_from_transcript"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    async def _analyze_patterns_for_persona(self, patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze patterns to extract persona attributes.

        Args:
            patterns: List of patterns to analyze

        Returns:
            Dictionary of persona attributes
        """
        try:
            logger.info(f"Analyzing {len(patterns)} patterns for persona attributes")

            # Convert patterns to a string representation for the prompt
            pattern_descriptions = "\n".join([
                f"Pattern {i+1}: {p.get('name', 'Unnamed')} - {p.get('description', 'No description')} "
                f"(Evidence: {', '.join(p.get('evidence', [])[:3])})"
                for i, p in enumerate(patterns)
            ])

            # Create a prompt for pattern-based persona formation
            prompt = self.prompt_generator.create_pattern_prompt(pattern_descriptions)

            # Try using Instructor first
            try:
                logger.info("Using Instructor for pattern-based persona formation")

                # Add specific instructions for JSON formatting
                system_instruction = """
                You are an expert in creating user personas based on pattern analysis.
                Create a detailed, evidence-based persona that captures the key characteristics,
                goals, challenges, and behaviors based on the identified patterns.
                """

                # Generate with Instructor
                try:
                    persona_response = await self.instructor_client.generate_with_model_async(
                        prompt=prompt,
                        model_class=PersonaModel,
                        temperature=0.0,  # Use deterministic output for structured data
                        system_instruction=system_instruction,
                        max_output_tokens=65536,  # Use large token limit for detailed personas
                        response_mime_type="application/json"  # Force JSON output
                    )
                except Exception as e:
                    logger.error(f"Error using Instructor for pattern-based persona formation: {str(e)}", exc_info=True)
                    # Try one more time with even more strict settings
                    persona_response = await self.instructor_client.generate_with_model_async(
                        prompt=prompt,
                        model_class=PersonaModel,
                        temperature=0.0,
                        system_instruction=system_instruction + "\nYou MUST output valid JSON that conforms to the schema.",
                        max_output_tokens=65536,
                        response_mime_type="application/json",
                        top_p=1.0,
                        top_k=1
                    )

                logger.info("Received structured persona response from Instructor")

                # Convert Pydantic model to dictionary
                attributes = persona_response.model_dump()

                logger.info(f"Successfully generated persona '{attributes.get('name', 'Unnamed')}' from patterns using Instructor")
                return attributes
            except Exception as instructor_error:
                logger.error(f"Error using Instructor for pattern-based persona formation: {str(instructor_error)}", exc_info=True)
                logger.info("Falling back to original method for pattern-based persona formation")

                # Fall back to original implementation
                # Import Pydantic model for response schema
                from backend.domain.models.persona_schema import Persona

                # Create a response schema for structured output
                response_schema = {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "archetype": {"type": "string"},
                        "demographics": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        }
                    },
                    "required": ["name", "description"]
                }

                # Call LLM to analyze patterns
                llm_response = await self.llm_service.analyze({
                    "task": "persona_formation",
                    "text": pattern_descriptions,
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.0,
                    "response_mime_type": "application/json",
                    "response_schema": response_schema
                })

                # --- ADD DETAILED LOGGING HERE ---
                logger.info(f"[_analyze_patterns_for_persona] Raw LLM response (first 500 chars): {str(llm_response)[:500]}")
                # If it's a string, log the full string for debugging if it's not too long
                if isinstance(llm_response, str) and len(llm_response) < 2000:
                    logger.debug(f"[_analyze_patterns_for_persona] Full raw LLM response string: {llm_response}")
                # --- END DETAILED LOGGING ---

                # Parse the response
                attributes = self._parse_llm_json_response(llm_response, "_analyze_patterns_for_persona")

                if attributes and isinstance(attributes, dict):
                    logger.info(f"Successfully parsed persona attributes from patterns.")
                    return attributes
                else:
                    logger.warning("Failed to parse valid JSON attributes from LLM for pattern analysis.")
                    return self._create_fallback_attributes(patterns)

        except Exception as e:
            logger.error(f"Error analyzing patterns for persona: {str(e)}", exc_info=True)
            return self._create_fallback_attributes(patterns)

    async def _convert_free_text_to_structured_transcript(
        self, text: str, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Convert free-text transcript to structured JSON format with speaker and text fields.

        Args:
            text: Raw interview transcript text
            context: Optional additional context information

        Returns:
            List of dictionaries with speaker and text fields
        """
        try:
            logger.info("Converting free-text to structured transcript format")

            # Check if text is empty or too short
            if not text or len(text.strip()) < 10:
                logger.warning("Text is empty or too short for transcript structuring")
                return []

            # Create a prompt for transcript structuring
            prompt = self.prompt_generator.create_transcript_structuring_prompt(text)

            # Import constants for LLM configuration
            from infrastructure.constants.llm_constants import PERSONA_FORMATION_TEMPERATURE

            # Create a response schema for structured output
            response_schema = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "speaker": {"type": "string"},
                        "text": {"type": "string"},
                        "role": {"type": "string"}
                    },
                    "required": ["speaker", "text"]
                }
            }

            # Call LLM to convert text to structured format
            llm_response = await self.llm_service.analyze({
                "task": "persona_formation",
                "prompt": prompt,
                "is_json_task": True,
                "temperature": PERSONA_FORMATION_TEMPERATURE,
                "response_mime_type": "application/json",
                "response_schema": response_schema
            })

            # Parse the response
            structured_data = self._parse_llm_json_response(llm_response, "convert_free_text_to_structured_transcript")

            if structured_data and isinstance(structured_data, list):
                logger.info(f"Successfully converted free-text to structured format with {len(structured_data)} speakers")
                return structured_data
            else:
                logger.warning("Failed to convert free-text to structured format")
                return []

        except Exception as e:
            logger.error(f"Error converting free-text to structured transcript: {str(e)}", exc_info=True)
            return []

    async def _create_default_persona(self, context: Optional[Dict[str, Any]] = None) -> List[Persona]:
        """
        Create a default persona when no patterns are available.

        Args:
            context: Optional additional context information

        Returns:
            List containing a single default Persona
        """
        try:
            logger.info("Creating default persona")

            # Check if we have original text in the context
            original_text = ""
            if context and "original_text" in context:
                original_text = context["original_text"]
                if isinstance(original_text, list):
                    # If it's a structured transcript, convert to text
                    original_text = "\n".join([
                        f"{entry.get('speaker', 'Unknown')}: {entry.get('text', '')}"
                        for entry in original_text
                    ])

                logger.info(f"Using original text from context ({len(original_text)} chars)")

                # Check if text is empty or too short
                if not original_text or len(original_text.strip()) < 10:
                    logger.warning("Original text is empty or too short for persona creation")
                    return [self.persona_builder.create_fallback_persona()]

                # Create a prompt for persona formation
                prompt = self.prompt_generator.create_participant_prompt(original_text)

                # Import Pydantic model for response schema
                from backend.domain.models.persona_schema import Persona

                # Create a response schema for structured output
                response_schema = {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "archetype": {"type": "string"},
                        "demographics": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {"type": "array", "items": {"type": "string"}}
                            }
                        }
                    },
                    "required": ["name", "description"]
                }

                # Call LLM for persona creation
                llm_response = await self.llm_service.analyze({
                    "task": "persona_formation",
                    "text": original_text,
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.0,
                    "response_mime_type": "application/json",
                    "response_schema": response_schema
                })

                # Parse the response
                persona_data = self._parse_llm_json_response(llm_response, "_create_default_persona")

                if persona_data and isinstance(persona_data, dict):
                    # Build persona from attributes
                    persona = self.persona_builder.build_persona_from_attributes(persona_data)
                    return [persona]

            # If we don't have original text or persona creation failed, create a fallback persona
            logger.info("Creating fallback persona")
            return [self.persona_builder.create_fallback_persona()]

        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}", exc_info=True)
            return [self.persona_builder.create_fallback_persona()]

    def _create_fallback_attributes(self, patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create fallback attributes when pattern analysis fails.

        Args:
            patterns: List of patterns

        Returns:
            Dictionary of fallback attributes
        """
        logger.info("Creating fallback attributes from patterns")

        # Create a default trait
        default_trait = {
            "value": "Unknown",
            "confidence": 0.3,
            "evidence": ["Fallback due to analysis error"]
        }

        # Extract pattern descriptions for evidence
        pattern_descriptions = [
            p.get("description", "Unknown pattern")
            for p in patterns
            if p.get("description")
        ]

        # Return structure that can be processed by Persona constructor
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
            "patterns": pattern_descriptions[:5],
            "confidence": 0.3,
            "evidence": ["Fallback due to analysis error"]
        }

    @property
    def instructor_client(self) -> InstructorGeminiClient:
        """
        Get the Instructor-patched Gemini client.

        Returns:
            InstructorGeminiClient: The Instructor-patched Gemini client
        """
        if self._instructor_client is None:
            # Try to get API key from config or environment
            api_key = None
            if hasattr(self.config, "llm") and hasattr(self.config.llm, "api_key"):
                api_key = self.config.llm.api_key

            self._instructor_client = InstructorGeminiClient(api_key=api_key)
            logger.info(f"Initialized InstructorGeminiClient")
        return self._instructor_client

    async def _generate_persona_from_attributes_with_instructor(self, attributes: Dict[str, Any], transcript_id: str) -> Dict[str, Any]:
        """
        Generate a persona from extracted attributes using Instructor.

        Args:
            attributes: Dictionary of extracted attributes
            transcript_id: ID of the transcript

        Returns:
            Persona dictionary
        """
        logger.info(f"Generating persona from attributes using Instructor for transcript {transcript_id}")

        # Prepare the prompt for persona formation
        prompt = self._prepare_persona_formation_prompt(attributes)

        # Generate the persona using Instructor
        try:
            logger.info(f"Calling Instructor for persona formation for transcript {transcript_id}")

            # Add specific instructions for JSON formatting
            system_instruction = """
            You are an expert in creating user personas based on interview data.
            Create a detailed, evidence-based persona that captures the key characteristics,
            goals, challenges, and behaviors of the interview subject.
            """

            # Generate with Instructor
            try:
                persona_response = await self.instructor_client.generate_with_model_async(
                    prompt=prompt,
                    model_class=PersonaModel,
                    temperature=0.0,  # Use deterministic output for structured data
                    system_instruction=system_instruction,
                    max_output_tokens=65536,  # Use large token limit for detailed personas
                    response_mime_type="application/json"  # Force JSON output
                )
            except Exception as e:
                logger.error(f"Error using Instructor for persona formation: {str(e)}", exc_info=True)
                # Try one more time with even more strict settings
                persona_response = await self.instructor_client.generate_with_model_async(
                    prompt=prompt,
                    model_class=PersonaModel,
                    temperature=0.0,
                    system_instruction=system_instruction + "\nYou MUST output valid JSON that conforms to the schema.",
                    max_output_tokens=65536,
                    response_mime_type="application/json",
                    top_p=1.0,
                    top_k=1
                )

            logger.info(f"Received structured persona response for transcript {transcript_id}")

            # Convert Pydantic model to dictionary
            persona = persona_response.model_dump()

            logger.info(f"Successfully generated persona '{persona.get('name', 'Unnamed')}' for transcript {transcript_id}")
            return persona
        except Exception as e:
            logger.error(f"Error generating persona with Instructor for transcript {transcript_id}: {str(e)}", exc_info=True)

            # Fall back to the original method
            logger.info(f"Falling back to original method for transcript {transcript_id}")
            return await self._generate_persona_from_attributes_original(attributes, transcript_id)

    async def _generate_persona_from_attributes_original(self, attributes: Dict[str, Any], transcript_id: str) -> Dict[str, Any]:
        """
        Original implementation of persona generation for fallback.

        Args:
            attributes: Dictionary of extracted attributes
            transcript_id: ID of the transcript

        Returns:
            Persona dictionary
        """
        # Prepare the prompt for persona formation
        prompt = self._prepare_persona_formation_prompt(attributes)

        # Call LLM to generate persona
        try:
            logger.info(f"Calling LLM for persona formation for transcript {transcript_id}")

            # Call LLM for persona formation
            llm_response = await self.llm_service.analyze({
                "task": "persona_formation",
                "prompt": prompt,
                "is_json_task": True,
                "temperature": 0.0,
                "response_mime_type": "application/json"
            })

            # Parse the response
            persona_data = self._parse_llm_json_response(llm_response, f"persona_formation_{transcript_id}")

            if persona_data and isinstance(persona_data, dict):
                logger.info(f"Successfully generated persona for transcript {transcript_id}")
                return persona_data
            else:
                logger.warning(f"Failed to generate valid persona data for transcript {transcript_id}")
                return self._create_fallback_persona(transcript_id)
        except Exception as e:
            logger.error(f"Error generating persona for transcript {transcript_id}: {str(e)}", exc_info=True)
            return self._create_fallback_persona(transcript_id)

    def _parse_llm_json_response(self, response: Union[str, Dict[str, Any]], context: str = "") -> Dict[str, Any]:
        """
        Parse JSON response from LLM with enhanced error recovery.

        Args:
            response: LLM response (string or dictionary)
            context: Context for error logging

        Returns:
            Parsed JSON as dictionary
        """
        # First try the new Instructor-based parser
        try:
            # Use the Instructor-based parser with task-specific handling
            result = parse_llm_json_response_with_instructor(
                response,
                context=context,
                task="persona_formation"
            )

            # If we got a valid result, return it
            if result and isinstance(result, dict) and len(result) > 0:
                logger.info(f"Successfully parsed JSON with Instructor in {context}")
                return result

        except Exception as e:
            logger.warning(f"Instructor-based parsing failed in {context}: {e}")

        # Fall back to the enhanced JSON parsing implementation
        logger.info(f"Falling back to enhanced JSON parsing in {context}")
        return parse_llm_json_response_enhanced(response, context)

    def _group_patterns(self, patterns: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """
        Group patterns by similarity.

        Args:
            patterns: List of patterns from analysis

        Returns:
            List of pattern groups
        """
        # Simple grouping by pattern type
        grouped = {}
        for pattern in patterns:
            pattern_type = pattern.get("type", "unknown")  # Use 'type' if available, else 'category'
            if not pattern_type or pattern_type == "unknown":
                pattern_type = pattern.get("category", "unknown")

            if pattern_type not in grouped:
                grouped[pattern_type] = []
            grouped[pattern_type].append(pattern)

        # Convert to list of groups
        return list(grouped.values())
