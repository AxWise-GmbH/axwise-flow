"""
Persona formation service

Provides persona generation from interview transcripts and text, including:
- Direct text to persona generation
- Structured transcript to persona generation
- Pattern-based persona formation
- Stakeholder-aware persona formation

This is a thin wrapper that delegates to the modular V2 facade.
"""

from typing import List, Dict, Any, Optional, Union
import logging

from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade
from backend.domain.interfaces.llm_unified import ILLMService

logger = logging.getLogger(__name__)


class PersonaFormationService:
    """
    Service for forming personas from analysis patterns or raw text.

    This is a thin wrapper that delegates all work to the modular V2 facade.
    The V2 facade orchestrates:
    - TranscriptStructuringService: Structures raw text into speaker segments
    - AttributeExtractor: Extracts persona attributes from text
    - PersonaAssembler: Assembles attributes into personas
    - PersonaValidation: Validates output against Golden Schema
    - EvidenceLinkingService: Links evidence quotes to attributes
    """

    def __init__(self, config=None, llm_service: ILLMService = None):
        """
        Initialize the persona formation service.

        Args:
            config: System configuration object (optional, ignored for V2)
            llm_service: Initialized LLM service
        """
        # Handle flexible constructor for backward compatibility
        if config is None and llm_service is None:
            raise ValueError("At least llm_service must be provided")

        # If only one argument is provided, assume it's llm_service
        if config is not None and llm_service is None and hasattr(config, "analyze"):
            llm_service = config
            config = None

        self.config = config
        self.llm_service = llm_service
        self._facade = PersonaFormationFacade(llm_service)
        logger.info("Initialized PersonaFormationService with V2 facade")

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
        logger.info(
            f"Starting persona generation from text ({len(str(text))} chars)"
        )

        try:
            result = await self._facade.generate_persona_from_text(text, context=context)
            logger.info(f"Persona generation completed: {len(result)} personas")
            return result
        except Exception as e:
            logger.error(f"Persona generation failed: {e}", exc_info=True)
            return []

    async def form_personas_from_transcript(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
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
        logger.info(
            f"Starting persona formation from transcript ({len(transcript)} segments)"
        )

        try:
            result = await self._facade.form_personas_from_transcript(
                transcript, participants, context
            )
            logger.info(f"Persona formation completed: {len(result)} personas")
            return result
        except Exception as e:
            logger.error(f"Persona formation failed: {e}", exc_info=True)
            return []

    async def form_personas(
        self, patterns: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Form personas from identified patterns.

        Note: This method uses V1 orchestrator for backward compatibility.
        Pattern-based persona formation is less common than text-based.

        Args:
            patterns: List of identified patterns from analysis
            context: Optional additional context

        Returns:
            List of persona dictionaries
        """
        logger.info(f"Starting pattern-based persona formation ({len(patterns)} patterns)")

        try:
            from backend.services.processing.persona_formation_v1.orchestrators import (
                pattern_persona_orchestrator,
            )
            from backend.services.processing.persona_formation_v1.legacy_service import (
                PersonaFormationService as LegacyService,
            )

            # Create legacy service instance for orchestrator dependencies
            legacy_svc = LegacyService(self.config, self.llm_service)
            result = await pattern_persona_orchestrator.form_personas(
                legacy_svc, patterns, context
            )
            logger.info(f"Pattern-based persona formation completed: {len(result)} personas")
            return result
        except Exception as e:
            logger.error(f"Pattern-based persona formation failed: {e}", exc_info=True)
            return []

    async def form_personas_by_stakeholder(
        self,
        stakeholder_segments: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from stakeholder-segmented transcript data.

        Note: This method uses V1 orchestrator for backward compatibility.

        Args:
            stakeholder_segments: Dict mapping stakeholder categories to segment data
            context: Optional context information

        Returns:
            List of persona dictionaries with stakeholder_mapping
        """
        logger.info(
            f"Starting stakeholder-aware persona formation ({len(stakeholder_segments)} categories)"
        )

        try:
            from backend.services.processing.persona_formation_v1.orchestrators import (
                stakeholder_persona_orchestrator,
            )
            from backend.services.processing.persona_formation_v1.legacy_service import (
                PersonaFormationService as LegacyService,
            )

            # Create legacy service instance for orchestrator dependencies
            legacy_svc = LegacyService(self.config, self.llm_service)
            result = await stakeholder_persona_orchestrator.form_personas_by_stakeholder(
                legacy_svc, stakeholder_segments, context
            )
            logger.info(
                f"Stakeholder-aware persona formation completed: {len(result)} personas"
            )
            return result
        except Exception as e:
            logger.error(
                f"Stakeholder-aware persona formation failed: {e}", exc_info=True
            )
            # Fall back to flattened processing
            all_segments = []
            try:
                for segment_data in stakeholder_segments.values():
                    all_segments.extend(segment_data.get("segments", []))
            except Exception:
                pass
            return await self.form_personas_from_transcript(all_segments, context=context)

