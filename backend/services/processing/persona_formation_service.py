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
import time
from datetime import datetime
import re

# MIGRATION TO PYDANTICAI: Replace Instructor with PydanticAI
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel
from domain.models.persona_schema import Persona as PersonaModel

# Import enhanced JSON parsing (kept for fallback compatibility)
from backend.utils.json.enhanced_json_repair import EnhancedJSONRepair
from backend.services.processing.persona_formation_service_enhanced import (
    parse_llm_json_response_enhanced,
)

# Import our modules
from .transcript_structuring_service import TranscriptStructuringService
from .attribute_extractor import AttributeExtractor
from .persona_builder import PersonaBuilder, persona_to_dict, Persona
from .prompts import PromptGenerator
from .evidence_linking_service import EvidenceLinkingService
from .trait_formatting_service import TraitFormattingService
from backend.utils.content_deduplication import deduplicate_persona_list
from backend.utils.pydantic_ai_retry import (
    safe_pydantic_ai_call,
    get_conservative_retry_config,
)

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
                logger = logging.getLogger(__name__)
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

# Configure logging
logger = logging.getLogger(__name__)


class PersonaFormationService:
    """
    Service for forming personas from analysis patterns or raw text.

    This service orchestrates the entire persona formation process, delegating
    specific tasks to specialized modules.
    """

    def __init__(self, config=None, llm_service: ILLMService = None):
        """
        Initialize the persona formation service.

        Args:
            config: System configuration object (optional, will create minimal config if None)
            llm_service: Initialized LLM service
        """
        # Handle flexible constructor for backward compatibility
        if config is None and llm_service is None:
            raise ValueError("At least llm_service must be provided")

        # If only one argument is provided, assume it's llm_service
        if config is not None and llm_service is None and hasattr(config, "analyze"):
            llm_service = config
            config = None

        # Create minimal config if not provided
        if config is None:

            class MinimalConfig:
                class Validation:
                    min_confidence = 0.4

                validation = Validation()

            config = MinimalConfig()

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

        # MIGRATION TO PYDANTICAI: Initialize PydanticAI agent for persona generation
        self._initialize_pydantic_ai_agent()

        # No longer using TranscriptProcessor - all functionality is now in TranscriptStructuringService
        logger.info("Using TranscriptStructuringService for transcript processing")
        logger.info("Using EvidenceLinkingService for enhanced evidence linking")
        logger.info("Using TraitFormattingService for improved trait value formatting")
        logger.info(
            "Using PydanticAI for structured persona outputs (migrated from Instructor)"
        )

        logger.info(
            f"Initialized PersonaFormationService with {llm_service.__class__.__name__}"
        )

    def _initialize_pydantic_ai_agent(self):
        """
        MIGRATION TO PYDANTICAI: Initialize PydanticAI agent for persona generation.

        This replaces the Instructor-based approach with a modern PydanticAI agent
        while maintaining the same high-quality persona generation capabilities.
        """
        try:
            # Initialize Gemini model for PydanticAI
            gemini_model = GeminiModel("gemini-2.5-flash")
            logger.info(
                "[PYDANTIC_AI] Initialized Gemini 2.5 Flash model for persona generation"
            )

            # Create persona generation agent with detailed system prompt
            self.persona_agent = Agent(
                model=gemini_model,
                result_type=PersonaModel,
                system_prompt="""You are an expert persona analyst specializing in creating detailed, authentic user personas from interview transcripts and behavioral data.

Your task is to analyze speaker content and generate comprehensive personas with rich, detailed PersonaTrait objects for each field.

PERSONA TRAIT STRUCTURE:
Each persona trait (demographics, goals_and_motivations, etc.) must be a PersonaTrait object with:
- value: Detailed, specific description based on evidence (NOT generic defaults)
- confidence: 0.0-1.0 based on strength of evidence
- evidence: List of actual quotes/statements supporting this trait

REQUIRED FIELDS TO POPULATE:
Core Fields:
- demographics: Specific demographic details, background, experience level
- goals_and_motivations: Concrete goals and what drives this person
- challenges_and_frustrations: Specific challenges they face
- needs_and_expectations: What they need and expect from solutions
- decision_making_process: How they make decisions
- communication_style: How they communicate and collaborate
- technology_usage: Their relationship with technology
- pain_points: Specific pain points and problems they experience
- key_quotes: Most representative quotes that capture their voice

Legacy Fields (for compatibility):
- role_context: Professional role context and background
- key_responsibilities: Key professional responsibilities and duties
- tools_used: Professional tools and software used
- collaboration_style: Collaborative work approach and style
- analysis_approach: Analytical methodology and approach
- skills_and_expertise: Professional skills and areas of expertise
- workflow_and_environment: Work environment and workflow preferences
- technology_and_tools: Technology usage and tool preferences

CRITICAL REQUIREMENTS:
1. NEVER use generic defaults like "Professional goals and motivations"
2. Extract specific, detailed information from the transcript
3. Use actual quotes as evidence for each trait
4. Set confidence based on how much evidence supports each trait
5. Create personas that feel like real, specific people
6. If insufficient evidence exists for a trait, set confidence low but still provide specific insights

SPECIAL INSTRUCTIONS FOR KEY_QUOTES:
- The key_quotes field value should be a brief summary like "Key statements that highlight their main concerns"
- The key_quotes evidence array should contain the ACTUAL QUOTES from the transcript
- NEVER put generic text like "Representative quotes that capture..." in the evidence
- Extract real, verbatim quotes that best represent this person's voice and concerns
- Include 3-5 of the most impactful quotes that show their personality and challenges

OUTPUT FORMAT: Return a complete Persona object with ALL PersonaTrait fields properly populated with specific, evidence-based content.""",
            )

            logger.info(
                "[PYDANTIC_AI] Successfully initialized persona generation agent"
            )
            self.pydantic_ai_available = True

        except Exception as e:
            logger.error(f"[PYDANTIC_AI] Failed to initialize PydanticAI agent: {e}")
            logger.error("[PYDANTIC_AI] Full error traceback:", exc_info=True)

            # Check specific error types for better debugging
            error_str = str(e).lower()
            if "import" in error_str or "module" in error_str:
                logger.error(
                    "[PYDANTIC_AI] Import error - check if pydantic-ai is installed"
                )
            elif "api" in error_str or "key" in error_str:
                logger.error(
                    "[PYDANTIC_AI] API key error - check Gemini API configuration"
                )
            elif "model" in error_str:
                logger.error(
                    "[PYDANTIC_AI] Model error - check if gemini-2.5-flash is available"
                )

            self.persona_agent = None
            self.pydantic_ai_available = False
            logger.warning(
                "[PYDANTIC_AI] Falling back to legacy Instructor-based approach"
            )

    async def form_personas(
        self, patterns: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
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
                    )

                    if (
                        attributes
                        and isinstance(attributes, dict)
                        and attributes.get("confidence", 0) >= self.validation_threshold
                    ):
                        try:
                            # Build persona from attributes
                            persona = (
                                self.persona_builder.build_persona_from_attributes(
                                    attributes
                                )
                            )
                            personas.append(persona)
                            logger.info(
                                f"Created persona: {persona.name} with confidence {persona.confidence}"
                            )
                        except Exception as persona_creation_error:
                            logger.error(
                                f"Error creating Persona object for group {i}: {persona_creation_error}",
                                exc_info=True,
                            )
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

            logger.info(f"[form_personas] Returning {len(personas)} personas.")
            # Convert Persona objects to dictionaries before returning
            persona_dicts = [persona_to_dict(p) for p in personas]

            # CONTENT DEDUPLICATION: Remove repetitive patterns from persona content
            logger.info("[form_personas] 🧹 Deduplicating persona content...")
            deduplicated_personas = deduplicate_persona_list(persona_dicts)
            logger.info(f"[form_personas] ✅ Content deduplication completed")

            return deduplicated_personas

        except Exception as e:
            logger.error(f"Error creating personas: {str(e)}", exc_info=True)
            try:
                await event_manager.emit_error(e, {"stage": "persona_formation"})
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    async def generate_persona_from_text(
        self,
        text: Union[str, List[Dict[str, Any]]],
        context: Optional[Dict[str, Any]] = None,
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
                fallback_persona = self.persona_builder.create_fallback_persona(
                    "Participant"
                )
                return [persona_to_dict(fallback_persona)]
            elif isinstance(text, list) and (not text or len(text) == 0):
                logger.warning("Structured transcript is empty")
                # Return a fallback persona
                fallback_persona = self.persona_builder.create_fallback_persona(
                    "Participant"
                )
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
                if all(
                    isinstance(item, dict) and "speaker" in item and "text" in item
                    for item in text
                ):
                    is_structured_transcript = True
                    logger.info("Input is already a structured transcript")
                    # Log a sample of the structured transcript
                    logger.info(f"Sample entry: {text[0]}")

            # If we have a structured transcript, use it directly
            if is_structured_transcript:
                return await self.form_personas_from_transcript(text, context=context)

            # If we still don't have a structured transcript, use our LLM-powered transcript structuring
            if isinstance(text, str) and not is_structured_transcript:
                logger.info(
                    "No structured format detected, using LLM-powered transcript structuring"
                )

                # Log a sample of the text for debugging
                logger.info(f"Text sample: {text[:200]}...")

                # Use the new TranscriptStructuringService to structure the transcript
                # Pass filename if available in context
                filename = None
                if context and "filename" in context:
                    filename = context.get("filename")
                    logger.info(
                        f"Using filename from context for transcript structuring: {filename}"
                    )

                structured_transcript = (
                    await self.transcript_structuring_service.structure_transcript(
                        text, filename=filename
                    )
                )

                if structured_transcript and len(structured_transcript) > 0:
                    logger.info(
                        f"Successfully structured transcript using LLM: {len(structured_transcript)} segments"
                    )
                    # Log a sample of the structured transcript
                    logger.info(f"Sample segment: {structured_transcript[0]}")
                    return await self.form_personas_from_transcript(
                        structured_transcript, context=context
                    )

            # If LLM structuring fails, we will now rely on robust error handling
            # or return empty/fallback personas rather than using regex.
            logger.warning(
                "LLM-based transcript structuring failed or returned empty. No regex fallback implemented."
            )
            # Consider what to return here: an empty list, a specific error, or a generic fallback persona.
            # For now, let's return an empty list, which will propagate up.
            # A fallback persona could also be generated here if desired.
            # fallback_persona = self.persona_builder.create_fallback_persona("Participant", "Transcript structuring failed")
            # return [persona_to_dict(fallback_persona)]
            return []  # Returning empty list if structuring fails

        except Exception as e:
            logger.error(
                f"Error in generate_persona_from_text: {str(e)}", exc_info=True
            )
            # Consider emitting an error event here if you have an event system
            # from backend.services.event_manager import event_manager
            # try:
            #     await event_manager.emit_error(e, {"stage": "generate_persona_from_text"})
            # except Exception as event_error:
            #     logger.warning(f"Could not emit error event: {str(event_error)}")
            return []  # Return empty list to prevent analysis failure

    async def form_personas_from_transcript(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from a structured transcript with speaker identification.

        PERFORMANCE OPTIMIZATION: Uses parallel processing with semaphore-controlled concurrency
        instead of sequential processing with artificial delays for 6-10x performance improvement.

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        # Use the new parallel implementation
        return await self._form_personas_from_transcript_parallel(
            transcript, participants, context
        )

    async def _form_personas_from_transcript_parallel(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        PERFORMANCE OPTIMIZATION: Generate personas using parallel processing with semaphore-controlled concurrency.

        This replaces sequential processing (43 personas × 2-3 minutes = 86-129 minutes) with parallel processing
        using semaphore-controlled concurrency (43 personas ÷ 3 concurrent = ~15 batches × 2-3 minutes = 10-15 minutes)
        for 6-8x performance improvement while maintaining full persona quality.

        Args:
            transcript: List of transcript entries with speaker and text fields
            participants: Optional list of participant information with roles
            context: Optional additional context information

        Returns:
            List of persona dictionaries
        """
        try:
            logger.info(
                f"[PERSONA_FORMATION_DEBUG] Starting PARALLEL persona formation with {len(transcript)} entries"
            )
            start_time = time.time()

            # Log a sample of the transcript for debugging
            if transcript and len(transcript) > 0:
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Sample transcript entry: {transcript[0]}"
                )

            # Validate input
            if not transcript or len(transcript) == 0:
                logger.warning(
                    "[PERSONA_FORMATION_DEBUG] Empty transcript provided, returning empty list"
                )
                return []

            # Consolidate text per speaker and extract roles
            speaker_dialogues = {}
            speaker_roles_map = {}

            # Handle both old and new transcript formats
            for turn in transcript:
                # Extract speaker ID (handle both old and new formats)
                speaker_id = turn.get(
                    "speaker_id", turn.get("speaker", "Unknown Speaker")
                )

                # Extract dialogue/text (handle both old and new formats)
                dialogue = turn.get("dialogue", turn.get("text", ""))

                # Extract role (handle both old and new formats, with fallback to participants if provided)
                role = turn.get("role", "Participant")

                # Initialize speaker entry if not exists
                if speaker_id not in speaker_dialogues:
                    speaker_dialogues[speaker_id] = []
                    speaker_roles_map[speaker_id] = (
                        role  # Store the first inferred role
                    )

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
                logger.info(
                    f"Speaker: {speaker}, Role: {speaker_roles_map.get(speaker, 'Unknown')}, Text length: {len(text)} chars"
                )

            # Override with provided participant roles if available
            if participants and isinstance(participants, list):
                for participant in participants:
                    if "name" in participant and "role" in participant:
                        speaker_name = participant["name"]
                        if speaker_name in speaker_roles_map:
                            speaker_roles_map[speaker_name] = participant["role"]
                            logger.info(
                                f"Overriding role for {speaker_name} to {participant['role']}"
                            )

                logger.info(f"Applied {len(participants)} provided participant roles")

            # Generate personas for all speakers using parallel processing
            personas = []

            # Process speakers in order of text length (most text first)
            sorted_speakers = sorted(
                speaker_texts.items(), key=lambda x: len(x[1]), reverse=True
            )

            # PERFORMANCE OPTIMIZATION: Use parallel processing with semaphore-controlled concurrency
            logger.info(
                f"[PERFORMANCE] Starting parallel persona generation for {len(sorted_speakers)} speakers..."
            )

            # AGGRESSIVE CONCURRENCY: Use 15 concurrent LLM calls for paid API plan
            # This provides ~5x better performance than conservative 3-concurrent approach
            semaphore = asyncio.Semaphore(15)
            logger.info(
                "[PERFORMANCE] Created semaphore with max 15 concurrent persona generations (AGGRESSIVE OPTIMIZATION)"
            )

            # Create tasks for parallel persona generation
            persona_tasks = []
            for i, (speaker, text) in enumerate(sorted_speakers):
                # Get the role for this speaker from our consolidated role mapping
                role = speaker_roles_map.get(speaker, "Participant")

                # Skip if text is too short (likely noise)
                if len(text) < 100:
                    logger.warning(
                        f"[PERSONA_FORMATION_DEBUG] Skipping persona generation for {speaker} - text too short ({len(text)} chars)"
                    )
                    continue

                # Create task for parallel persona generation
                task = self._generate_single_persona_with_semaphore(
                    speaker, text, role, semaphore, i + 1, context
                )
                persona_tasks.append((i, speaker, task))

            # Execute all persona generation tasks in parallel with robust error handling
            logger.info(
                f"[PERFORMANCE] Executing {len(persona_tasks)} persona generation tasks in parallel..."
            )

            # Use asyncio.gather with return_exceptions=True to handle individual failures gracefully
            task_results = await asyncio.gather(
                *[task for _, _, task in persona_tasks], return_exceptions=True
            )

            # Process results and handle exceptions
            successful_personas = 0
            failed_personas = 0

            for (i, speaker, _), result in zip(persona_tasks, task_results):
                if isinstance(result, Exception):
                    logger.error(
                        f"[PERFORMANCE] Persona generation failed for {speaker}: {str(result)}",
                        exc_info=True,
                    )
                    failed_personas += 1

                    # Create fallback persona for failed generation
                    role = speaker_roles_map.get(speaker, "Participant")
                    minimal_persona = self.persona_builder.create_fallback_persona(
                        role, speaker
                    )
                    personas.append(persona_to_dict(minimal_persona))
                    logger.info(
                        f"[PERFORMANCE] Created fallback persona for failed generation: {speaker}"
                    )
                elif result and isinstance(result, dict):
                    personas.append(result)
                    successful_personas += 1
                    logger.info(
                        f"[PERFORMANCE] Successfully processed persona for {speaker}"
                    )
                else:
                    logger.warning(
                        f"[PERFORMANCE] Invalid result for {speaker}, creating fallback"
                    )
                    failed_personas += 1

                    # Create fallback persona for invalid result
                    role = speaker_roles_map.get(speaker, "Participant")
                    minimal_persona = self.persona_builder.create_fallback_persona(
                        role, speaker
                    )
                    personas.append(persona_to_dict(minimal_persona))

            # Enhanced performance logging with aggressive concurrency metrics
            total_time = time.time() - start_time
            requests_per_minute = (len(sorted_speakers) / total_time) * 60
            sequential_estimate = len(sorted_speakers) * 2.5  # minutes
            performance_improvement = sequential_estimate / max(total_time / 60, 0.1)

            logger.info(
                f"[PYDANTIC_AI] AGGRESSIVE PARALLEL persona generation completed in {total_time:.2f} seconds "
                f"({successful_personas} successful, {failed_personas} failed, concurrency=15)"
            )
            logger.info(
                f"[PYDANTIC_AI] Achieved {requests_per_minute:.1f} requests per minute with 15 concurrent PydanticAI agents"
            )
            logger.info(
                f"[PYDANTIC_AI] Performance improvement: ~{performance_improvement:.1f}x faster than sequential "
                f"(estimated {sequential_estimate:.1f} min → {total_time/60:.1f} min)"
            )

            # Rate limit monitoring with PydanticAI
            if failed_personas > 0:
                failure_rate = (failed_personas / len(sorted_speakers)) * 100
                logger.warning(
                    f"[PYDANTIC_AI] Failure rate: {failure_rate:.1f}% - Monitor for rate limit issues with PydanticAI agents"
                )
                if failure_rate > 20:
                    logger.error(
                        f"[PYDANTIC_AI] HIGH FAILURE RATE ({failure_rate:.1f}%) - Consider reducing concurrency"
                    )
            else:
                logger.info(
                    "[PYDANTIC_AI] ✅ Zero failures - Aggressive concurrency with PydanticAI working perfectly!"
                )

            # Emit final progress event
            try:
                await event_manager.emit(
                    EventType.PROCESSING_STEP,
                    {
                        "stage": "persona_formation_from_transcript",
                        "progress": 1.0,
                        "data": {
                            "personas_found": len(personas),
                            "speakers_processed": len(sorted_speakers),
                            "processing_time_seconds": total_time,
                            "concurrency_level": 15,
                            "requests_per_minute": requests_per_minute,
                            "performance_improvement": f"~{performance_improvement:.1f}x faster",
                            "failure_rate": (
                                (failed_personas / len(sorted_speakers)) * 100
                                if len(sorted_speakers) > 0
                                else 0
                            ),
                            "optimization_type": "AGGRESSIVE_PARALLEL",
                        },
                    },
                )
            except Exception as event_error:
                logger.warning(
                    f"Could not emit processing step event: {str(event_error)}"
                )

            logger.info(
                f"[PERSONA_FORMATION_DEBUG] 🎯 FINAL RESULT: Returning {len(personas)} personas from transcript with {len(sorted_speakers)} speakers"
            )

            # CONTENT DEDUPLICATION: Remove repetitive patterns from persona content
            logger.info("[PERSONA_FORMATION_DEBUG] 🧹 Deduplicating persona content...")
            deduplicated_personas = deduplicate_persona_list(personas)
            logger.info(f"[PERSONA_FORMATION_DEBUG] ✅ Content deduplication completed")

            # Log summary of generated personas
            if deduplicated_personas:
                persona_names = [
                    p.get("name", "Unknown") for p in deduplicated_personas
                ]
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Generated persona names: {persona_names}"
                )
            else:
                logger.warning(
                    f"[PERSONA_FORMATION_DEBUG] ⚠️ No personas were generated despite having {len(sorted_speakers)} speakers"
                )

            return deduplicated_personas

        except Exception as e:
            logger.error(
                f"[PERSONA_FORMATION_DEBUG] ❌ Error forming personas from transcript: {str(e)}",
                exc_info=True,
            )
            try:
                await event_manager.emit_error(
                    e, {"stage": "form_personas_from_transcript"}
                )
            except Exception as event_error:
                logger.warning(f"Could not emit error event: {str(event_error)}")
            # Return empty list instead of raising to prevent analysis failure
            return []

    async def _generate_single_persona_with_semaphore(
        self,
        speaker: str,
        text: str,
        role: str,
        semaphore: asyncio.Semaphore,
        persona_number: int,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        MIGRATION TO PYDANTICAI: Generate single persona with semaphore-controlled concurrency using PydanticAI.

        This uses PydanticAI agents instead of Instructor for structured persona generation,
        while maintaining the same aggressive 15-concurrent optimization and high-quality
        persona generation with full text analysis and detailed prompts.

        Args:
            speaker: Speaker identifier
            text: Full text content for the speaker
            role: Speaker role (Interviewee, Interviewer, etc.)
            semaphore: Asyncio semaphore for concurrency control
            persona_number: Persona number for logging
            context: Optional additional context

        Returns:
            Persona dictionary or raises exception on failure
        """
        async with semaphore:
            logger.info(
                f"[PYDANTIC_AI] Starting persona generation for {speaker} (persona {persona_number}, semaphore acquired)"
            )
            logger.info(
                f"[PERSONA_FORMATION_DEBUG] Processing speaker {persona_number}: {speaker} with role {role}, text length: {len(text)} chars"
            )

            try:
                # Check if PydanticAI is available
                if not self.pydantic_ai_available or not self.persona_agent:
                    logger.warning(
                        f"[PYDANTIC_AI] Agent not available for {speaker}, falling back to legacy method"
                    )
                    return await self._generate_persona_legacy_fallback(
                        speaker, text, role, context
                    )

                # Create a context object for this speaker
                speaker_context = {
                    "speaker": speaker,
                    "role": role,
                    **(context or {}),
                }

                # Create a prompt based on the role using simplified format
                # MAINTAIN HIGH QUALITY: Use the same detailed prompt generation as before
                prompt = self.prompt_generator.create_simplified_persona_prompt(
                    text, role
                )

                # Log the prompt length for debugging
                logger.info(
                    f"Created simplified prompt for {speaker} with length: {len(prompt)} chars"
                )

                # MAINTAIN HIGH QUALITY: Use the full text for analysis with Gemini 2.5 Flash's large context window
                text_to_analyze = text  # Use the full text without truncation
                logger.info(
                    f"Using full text of {len(text_to_analyze)} chars for {speaker}"
                )

                # MIGRATION TO PYDANTICAI: Create comprehensive analysis prompt
                analysis_prompt = f"""
SPEAKER ANALYSIS REQUEST:
Speaker: {speaker}
Role: {role}
Context: {speaker_context.get('industry', 'general')}

TRANSCRIPT CONTENT:
{text_to_analyze}

DETAILED PROMPT:
{prompt}

Please analyze this speaker's content and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine quotes, and realistic behavioral patterns."""

                # NO ARTIFICIAL DELAYS: Semaphore handles rate limiting
                # Call PydanticAI agent to generate persona with enhanced error handling
                # Log content size for timeout monitoring
                content_size = len(analysis_prompt)
                if content_size > 30000:
                    logger.warning(
                        f"[PYDANTIC_AI] Large content detected for {speaker}: {content_size:,} characters "
                        f"(May take longer to process, timeout extended to 15min)"
                    )

                logger.info(
                    f"[PYDANTIC_AI] Calling PydanticAI persona agent for {speaker} ({content_size:,} chars)"
                )

                # Use temperature 0 for consistent structured output with retry logic
                retry_config = get_conservative_retry_config()

                async def make_persona_call():
                    return await self.persona_agent.run(
                        analysis_prompt, model_settings={"temperature": 0.0}
                    )

                persona_result = await safe_pydantic_ai_call(
                    agent=self.persona_agent,
                    prompt=analysis_prompt,
                    context=f"Persona generation for {speaker} (#{persona_number})",
                    retry_config=retry_config,
                )

                logger.info(
                    f"[PYDANTIC_AI] PydanticAI agent returned response for {speaker} (type: {type(persona_result)})"
                )

                # Extract the Pydantic model from the result (using new API)
                # PydanticAI returns the model directly, not wrapped in .output
                persona_model = persona_result
                logger.info(
                    f"[PYDANTIC_AI] Extracted persona model for {speaker}: {persona_model.name}"
                )

                # Convert to dictionary format for compatibility
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Converting PydanticAI result to dictionary for {speaker}"
                )

                # Convert PydanticAI model to dictionary format
                persona_data = persona_model.model_dump()
                logger.info(
                    f"[PYDANTIC_AI] Successfully converted persona model to dictionary for {speaker}"
                )

                # DEBUG: Log the actual PersonaTrait field values to understand why they're empty
                logger.info(
                    f"[PERSONA_FORMATION_DEBUG] Persona data keys for {speaker}: {list(persona_data.keys())}"
                )

                # Check specific PersonaTrait fields
                trait_fields = [
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                    "needs_and_expectations",
                    "decision_making_process",
                    "communication_style",
                    "technology_usage",
                    "pain_points",
                    "key_quotes",
                ]

                for field in trait_fields:
                    field_value = persona_data.get(field)
                    if field_value is None:
                        logger.warning(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' is None for {speaker}"
                        )
                    elif isinstance(field_value, dict):
                        logger.info(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker}: {field_value.get('value', 'NO_VALUE')[:100]}..."
                        )
                    else:
                        logger.info(
                            f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker} (type {type(field_value)}): {str(field_value)[:100]}..."
                        )

                # Log the persona data keys for debugging
                if persona_data and isinstance(persona_data, dict):
                    logger.info(
                        f"[PERSONA_FORMATION_DEBUG] Persona data keys for {speaker}: {list(persona_data.keys())}"
                    )

                    # Use the speaker ID from the transcript as the default/override name
                    name_override = speaker
                    logger.info(
                        f"Using speaker ID from transcript as name_override: {name_override}"
                    )

                    # If the persona data doesn't have a name, use the speaker name
                    if "name" not in persona_data or not persona_data["name"]:
                        persona_data["name"] = name_override
                        logger.info(
                            f"Using speaker name as persona name: {name_override}"
                        )
                    elif name_override and name_override != persona_data.get("name"):
                        logger.info(
                            f"PydanticAI provided name '{persona_data.get('name')}' differs from transcript speaker_id '{name_override}'. Using PydanticAI name for now."
                        )

                    # MAINTAIN HIGH QUALITY: Build persona from attributes using the same detailed process
                    persona = self.persona_builder.build_persona_from_attributes(
                        persona_data, persona_data.get("name", name_override), role
                    )
                    result = persona_to_dict(persona)
                    logger.info(
                        f"[PYDANTIC_AI] ✅ Successfully created persona for {speaker}: {persona.name}"
                    )
                    return result
                else:
                    logger.warning(f"[PYDANTIC_AI] No valid persona data for {speaker}")
                    raise Exception(f"No valid persona data generated for {speaker}")

            except Exception as e:
                error_message = str(e).lower()

                # Enhanced error monitoring for rate limits and API issues with PydanticAI
                if (
                    "rate limit" in error_message
                    or "quota" in error_message
                    or "429" in error_message
                ):
                    logger.error(
                        f"[PYDANTIC_AI] ⚠️ RATE LIMIT ERROR for {speaker}: {str(e)} "
                        f"(Consider reducing concurrency from 15)",
                        exc_info=True,
                    )
                elif (
                    "timeout" in error_message
                    or "connection" in error_message
                    or "ReadTimeout" in str(e)
                ):
                    content_size = len(speaker_content.get(speaker, ""))
                    logger.error(
                        f"[PYDANTIC_AI] ⏱️ TIMEOUT ERROR for {speaker}: {str(e)} "
                        f"(Content size: {content_size:,} chars, Consider chunking large content)",
                        exc_info=True,
                    )
                elif "pydantic" in error_message or "validation" in error_message:
                    logger.error(
                        f"[PYDANTIC_AI] 📋 VALIDATION ERROR for {speaker}: {str(e)} "
                        f"(PydanticAI model validation failed)",
                        exc_info=True,
                    )
                elif (
                    "malformed_function_call" in error_message
                    or "finishreason" in error_message
                ):
                    logger.error(
                        f"[PYDANTIC_AI] 🔧 MALFORMED_FUNCTION_CALL ERROR for {speaker}: {str(e)} "
                        f"(Gemini API returned malformed function call response - retrying with fallback)",
                        exc_info=True,
                    )
                    # For MALFORMED_FUNCTION_CALL errors, we should try to continue with fallback
                    # instead of failing completely
                    logger.info(
                        f"[PYDANTIC_AI] Attempting fallback persona generation for {speaker}"
                    )
                    try:
                        # Create a basic fallback persona instead of failing
                        fallback_persona = {
                            "name": speaker,
                            "description": f"Fallback persona for {speaker} due to API error",
                            "confidence": 0.5,
                            "evidence": [
                                f"Generated as fallback due to MALFORMED_FUNCTION_CALL error"
                            ],
                            "role_context": {"value": role if role else "Participant"},
                            "archetype": {"value": "Unknown"},
                            "key_responsibilities": {
                                "value": "Not determined due to API error"
                            },
                            "tools_used": {"value": "Not determined"},
                            "collaboration_style": {"value": "Not determined"},
                            "analysis_approach": {"value": "Not determined"},
                            "pain_points": {"value": "Not determined"},
                            "patterns": [],
                            "overall_confidence": 0.5,
                            "supporting_evidence_summary": {
                                "value": "Fallback persona due to API error"
                            },
                        }
                        logger.info(
                            f"[PYDANTIC_AI] Created fallback persona for {speaker}"
                        )
                        return fallback_persona
                    except Exception as fallback_error:
                        logger.error(
                            f"[PYDANTIC_AI] Failed to create fallback persona: {fallback_error}"
                        )
                        # Re-raise original error if fallback fails
                        raise
                else:
                    logger.error(
                        f"[PYDANTIC_AI] ❌ GENERAL ERROR for {speaker}: {str(e)}",
                        exc_info=True,
                    )

                # Re-raise the exception to be handled by the calling method
                raise

    async def _generate_persona_legacy_fallback(
        self,
        speaker: str,
        text: str,
        role: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Legacy fallback method using the original Instructor-based approach.

        This method is used when PydanticAI is not available or fails to initialize.
        It maintains the same interface but uses the legacy implementation.
        """
        logger.info(
            f"[LEGACY_FALLBACK] Using legacy Instructor-based approach for {speaker}"
        )

        try:
            # Create a prompt based on the role using simplified format
            prompt = self.prompt_generator.create_simplified_persona_prompt(text, role)

            # Add more context to the request
            request_data = {
                "task": "persona_formation",
                "text": text,
                "prompt": prompt,
                "enforce_json": True,
                "response_mime_type": "application/json",
                "speaker": speaker,
                "role": role,
            }

            # Call LLM service using legacy approach
            llm_response = await self.llm_service.analyze(request_data)

            # Parse the response using legacy parsing
            persona_data = self._parse_llm_json_response(
                llm_response, f"legacy_fallback_for_{speaker}"
            )

            if persona_data and isinstance(persona_data, dict):
                # Use the speaker ID from the transcript as the default/override name
                name_override = speaker
                if "name" not in persona_data or not persona_data["name"]:
                    persona_data["name"] = name_override

                # Build persona from attributes using the same detailed process
                persona = self.persona_builder.build_persona_from_attributes(
                    persona_data, persona_data.get("name", name_override), role
                )
                result = persona_to_dict(persona)
                logger.info(
                    f"[LEGACY_FALLBACK] ✅ Successfully created persona for {speaker}: {persona.name}"
                )
                return result
            else:
                raise Exception(f"No valid persona data generated for {speaker}")

        except Exception as e:
            logger.error(
                f"[LEGACY_FALLBACK] Failed to generate persona for {speaker}: {str(e)}"
            )
            raise

    async def _analyze_patterns_for_persona(
        self, patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
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
            pattern_descriptions = "\n".join(
                [
                    f"Pattern {i+1}: {p.get('name', 'Unnamed')} - {p.get('description', 'No description')} "
                    f"(Evidence: {', '.join(p.get('evidence', [])[:3])})"
                    for i, p in enumerate(patterns)
                ]
            )

            # Create a prompt for pattern-based persona formation
            prompt = self.prompt_generator.create_pattern_prompt(pattern_descriptions)

            # Try using PydanticAI first (migrated from Instructor)
            if self.pydantic_ai_available and self.persona_agent:
                try:
                    logger.info(
                        "[PYDANTIC_AI] Using PydanticAI for pattern-based persona formation"
                    )

                    # Create comprehensive analysis prompt for patterns
                    analysis_prompt = f"""
PATTERN ANALYSIS REQUEST:
Analyze the following patterns to create a comprehensive persona.

PATTERNS TO ANALYZE:
{pattern_descriptions}

DETAILED PROMPT:
{prompt}

Please analyze these patterns and generate a comprehensive persona based on the evidence provided. Focus on authentic characteristics, genuine behavioral patterns, and realistic traits derived from the pattern analysis."""

                    # Use PydanticAI agent for pattern-based persona formation with retry logic
                    retry_config = get_conservative_retry_config()
                    persona_result = await safe_pydantic_ai_call(
                        agent=self.persona_agent,
                        prompt=analysis_prompt,
                        context=f"Pattern-based persona generation for {pattern.get('name', 'Unknown')}",
                        retry_config=retry_config,
                    )

                    logger.info(
                        "[PYDANTIC_AI] Received structured persona response from PydanticAI"
                    )

                    # Extract and convert PydanticAI model to dictionary (using new API)
                    persona_model = persona_result.output
                    attributes = persona_model.model_dump()

                    logger.info(
                        f"[PYDANTIC_AI] Successfully generated persona '{attributes.get('name', 'Unnamed')}' from patterns using PydanticAI"
                    )
                    return attributes
                except Exception as pydantic_ai_error:
                    logger.error(
                        f"[PYDANTIC_AI] Error using PydanticAI for pattern-based persona formation: {str(pydantic_ai_error)}",
                        exc_info=True,
                    )
                    logger.info(
                        "[PYDANTIC_AI] Falling back to legacy method for pattern-based persona formation"
                    )
            else:
                logger.warning(
                    "[PYDANTIC_AI] PydanticAI agent not available for pattern analysis, using legacy method"
                )

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
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["name", "description"],
                }

                # Call LLM to analyze patterns
                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": pattern_descriptions,
                        "prompt": prompt,
                        "enforce_json": True,
                        "temperature": 0.0,
                        "response_mime_type": "application/json",
                        "response_schema": response_schema,
                    }
                )

                # --- ADD DETAILED LOGGING HERE ---
                logger.info(
                    f"[_analyze_patterns_for_persona] Raw LLM response (first 500 chars): {str(llm_response)[:500]}"
                )
                # If it's a string, log the full string for debugging if it's not too long
                if isinstance(llm_response, str) and len(llm_response) < 2000:
                    logger.debug(
                        f"[_analyze_patterns_for_persona] Full raw LLM response string: {llm_response}"
                    )
                # --- END DETAILED LOGGING ---

                # Parse the response
                attributes = self._parse_llm_json_response(
                    llm_response, "_analyze_patterns_for_persona"
                )

                if attributes and isinstance(attributes, dict):
                    logger.info(
                        f"Successfully parsed persona attributes from patterns."
                    )
                    return attributes
                else:
                    logger.warning(
                        "Failed to parse valid JSON attributes from LLM for pattern analysis."
                    )
                    return self._create_fallback_attributes(patterns)

        except Exception as e:
            logger.error(
                f"Error analyzing patterns for persona: {str(e)}", exc_info=True
            )
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
            from infrastructure.constants.llm_constants import (
                PERSONA_FORMATION_TEMPERATURE,
            )

            # Create a response schema for structured output
            response_schema = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "speaker": {"type": "string"},
                        "text": {"type": "string"},
                        "role": {"type": "string"},
                    },
                    "required": ["speaker", "text"],
                },
            }

            # Call LLM to convert text to structured format
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "prompt": prompt,
                    "is_json_task": True,
                    "temperature": PERSONA_FORMATION_TEMPERATURE,
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                }
            )

            # Parse the response
            structured_data = self._parse_llm_json_response(
                llm_response, "convert_free_text_to_structured_transcript"
            )

            if structured_data and isinstance(structured_data, list):
                logger.info(
                    f"Successfully converted free-text to structured format with {len(structured_data)} speakers"
                )
                return structured_data
            else:
                logger.warning("Failed to convert free-text to structured format")
                return []

        except Exception as e:
            logger.error(
                f"Error converting free-text to structured transcript: {str(e)}",
                exc_info=True,
            )
            return []

    async def _create_default_persona(
        self, context: Optional[Dict[str, Any]] = None
    ) -> List[Persona]:
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
                    original_text = "\n".join(
                        [
                            f"{entry.get('speaker', 'Unknown')}: {entry.get('text', '')}"
                            for entry in original_text
                        ]
                    )

                logger.info(
                    f"Using original text from context ({len(original_text)} chars)"
                )

                # Check if text is empty or too short
                if not original_text or len(original_text.strip()) < 10:
                    logger.warning(
                        "Original text is empty or too short for persona creation"
                    )
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
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "goals_and_motivations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "challenges_and_frustrations": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["name", "description"],
                }

                # Call LLM for persona creation
                llm_response = await self.llm_service.analyze(
                    {
                        "task": "persona_formation",
                        "text": original_text,
                        "prompt": prompt,
                        "enforce_json": True,
                        "temperature": 0.0,
                        "response_mime_type": "application/json",
                        "response_schema": response_schema,
                    }
                )

                # Parse the response
                persona_data = self._parse_llm_json_response(
                    llm_response, "_create_default_persona"
                )

                if persona_data and isinstance(persona_data, dict):
                    # Build persona from attributes
                    persona = self.persona_builder.build_persona_from_attributes(
                        persona_data
                    )
                    return [persona]

            # If we don't have original text or persona creation failed, create a fallback persona
            logger.info("Creating fallback persona")
            return [self.persona_builder.create_fallback_persona()]

        except Exception as e:
            logger.error(f"Error creating default persona: {str(e)}", exc_info=True)
            return [self.persona_builder.create_fallback_persona()]

    def _create_fallback_attributes(
        self, patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
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
            "evidence": ["Fallback due to analysis error"],
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
            "technology_and_tools": default_trait,
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
            "evidence": ["Fallback due to analysis error"],
        }

    # MIGRATION TO PYDANTICAI: Removed instructor_client property
    # This has been replaced with PydanticAI agent initialization

    # MIGRATION TO PYDANTICAI: Removed _generate_persona_from_attributes_with_instructor method
    # This functionality has been replaced with PydanticAI agent-based persona generation

    async def _generate_persona_from_attributes_original(
        self, attributes: Dict[str, Any], transcript_id: str
    ) -> Dict[str, Any]:
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
            logger.info(
                f"Calling LLM for persona formation for transcript {transcript_id}"
            )

            # Call LLM for persona formation
            llm_response = await self.llm_service.analyze(
                {
                    "task": "persona_formation",
                    "prompt": prompt,
                    "is_json_task": True,
                    "temperature": 0.0,
                }
            )

            # Parse the response
            persona_data = self._parse_llm_json_response(
                llm_response, f"persona_formation_{transcript_id}"
            )

            if persona_data and isinstance(persona_data, dict):
                logger.info(
                    f"Successfully generated persona for transcript {transcript_id}"
                )
                return persona_data
            else:
                logger.warning(
                    f"Failed to generate valid persona data for transcript {transcript_id}"
                )
                return self._create_fallback_persona(transcript_id)
        except Exception as e:
            logger.error(
                f"Error generating persona for transcript {transcript_id}: {str(e)}",
                exc_info=True,
            )
            return self._create_fallback_persona(transcript_id)

    def _parse_llm_json_response(
        self, response: Union[str, Dict[str, Any]], context: str = ""
    ) -> Dict[str, Any]:
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
                response, context=context, task="persona_formation"
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

    def _group_patterns(
        self, patterns: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
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
