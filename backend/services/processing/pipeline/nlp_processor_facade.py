"""
NLP processor facade for backward compatibility.

This module provides a facade for the new processing pipeline that maintains
backward compatibility with the original NLPProcessor interface.
"""

import logging
import warnings
from typing import Any, Dict, List, Optional, Union

from backend.models.pattern import Pattern, PatternResponse
from backend.services.processing.pipeline.factory import PipelineFactory
from backend.services.processing.pattern_service import PatternService

logger = logging.getLogger(__name__)

class NLPProcessorFacade:
    """
    Facade for the new processing pipeline.

    This class provides a facade that maintains backward compatibility with the
    original NLPProcessor interface while using the new processing pipeline
    internally.
    """

    def __init__(self, llm_service):
        """
        Initialize the facade.

        Args:
            llm_service: LLM service to use for processing
        """
        self.llm_service = llm_service
        self.pipeline_factory = PipelineFactory()

        # Show deprecation warning
        warnings.warn(
            "NLPProcessorFacade is deprecated and will be removed in a future version. "
            "Use the processing pipeline directly instead.",
            DeprecationWarning,
            stacklevel=2
        )

        logger.info("Initialized NLPProcessorFacade")

    async def process_interview_data(self, data: Any, progress_callback=None) -> Dict[str, Any]:
        """
        Process interview data.

        This method maintains backward compatibility with the original
        NLPProcessor.process_interview_data method.

        Args:
            data: Interview data to process
            progress_callback: Optional callback for progress updates

        Returns:
            Dictionary with processing results
        """
        # Create a progress tracker if a callback is provided
        progress_tracker = None
        if progress_callback:
            from backend.services.processing.progress_tracker import ProgressTracker
            progress_tracker = ProgressTracker(progress_callback)

        # Create the pipeline
        pipeline = self.pipeline_factory.create_default_pipeline(
            self.llm_service,
            progress_tracker
        )

        # Process the data
        context = {}
        result = await pipeline.process(data, context)

        # Convert the result to the expected format
        return self._convert_to_legacy_format(result, context)

    async def structure_transcript(self, raw_text: str, filename: str = None) -> List[Dict[str, str]]:
        """
        Structure a raw interview transcript.

        This method maintains backward compatibility with the original
        NLPProcessor.structure_transcript method.

        Args:
            raw_text: Raw interview transcript text
            filename: Optional filename

        Returns:
            List of structured transcript segments
        """
        # Create a transcript-only pipeline
        pipeline = self.pipeline_factory.create_transcript_only_pipeline(
            self.llm_service
        )

        # Process the data
        context = {"filename": filename}
        result = await pipeline.process(raw_text, context)

        # Extract the segments
        if isinstance(result, dict) and "segments" in result:
            return result["segments"]
        elif isinstance(result, list):
            return result
        else:
            logger.warning(f"Unexpected result format: {type(result)}")
            return []

    async def extract_themes(self, transcript: List[Dict[str, str]], industry: str = None) -> Dict[str, Any]:
        """
        Extract themes from a structured transcript.

        This method maintains backward compatibility with the original
        NLPProcessor.extract_themes method.

        Args:
            transcript: Structured transcript
            industry: Optional industry context

        Returns:
            Dictionary with extracted themes
        """
        # TODO: Implement this method when ThemeAnalyzer is available
        logger.warning("extract_themes not yet implemented in the new pipeline")
        return {"themes": []}

    async def extract_patterns(self, transcript: List[Dict[str, str]], themes: List[Dict[str, Any]],
                              industry: str = None) -> Dict[str, Any]:
        """
        Extract patterns from a structured transcript and themes.

        This method maintains backward compatibility with the original
        NLPProcessor.extract_patterns method.

        Args:
            transcript: Structured transcript
            themes: Extracted themes
            industry: Optional industry context

        Returns:
            Dictionary with extracted patterns
        """
        from backend.services.processing.pattern_service import PatternService

        # Create pattern service
        pattern_service = PatternService()

        # Extract text from transcript
        text = self._extract_text_from_transcript(transcript)

        # Generate patterns
        pattern_response = await pattern_service.generate_patterns(
            text=text,
            industry=industry,
            themes=themes
        )

        # Convert to dictionary format for backward compatibility
        patterns_dict = {"patterns": []}

        for pattern in pattern_response.patterns:
            patterns_dict["patterns"].append({
                "name": pattern.name,
                "category": pattern.category,
                "description": pattern.description,
                "frequency": pattern.frequency,
                "sentiment": pattern.sentiment,
                "evidence": pattern.evidence,
                "impact": pattern.impact,
                "suggested_actions": pattern.suggested_actions
            })

        logger.info(f"Extracted {len(patterns_dict['patterns'])} patterns")
        return patterns_dict

    async def extract_insights(self, transcript: List[Dict[str, str]], themes: List[Dict[str, Any]],
                              patterns: List[Dict[str, Any]], industry: str = None) -> Dict[str, Any]:
        """
        Extract insights from a structured transcript, themes, and patterns.

        This method maintains backward compatibility with the original
        NLPProcessor.extract_insights method.

        Args:
            transcript: Structured transcript
            themes: Extracted themes
            patterns: Extracted patterns
            industry: Optional industry context

        Returns:
            Dictionary with extracted insights
        """
        # TODO: Implement this method when InsightGenerator is available
        logger.warning("extract_insights not yet implemented in the new pipeline")
        return {"insights": []}

    async def generate_personas(self, transcript: List[Dict[str, str]], themes: List[Dict[str, Any]],
                               patterns: List[Dict[str, Any]], industry: str = None) -> List[Dict[str, Any]]:
        """
        Generate personas from a structured transcript, themes, and patterns.

        This method maintains backward compatibility with the original
        NLPProcessor.generate_personas method.

        Args:
            transcript: Structured transcript
            themes: Extracted themes
            patterns: Extracted patterns
            industry: Optional industry context

        Returns:
            List of generated personas
        """
        # TODO: Implement this method when PersonaGenerator is available
        logger.warning("generate_personas not yet implemented in the new pipeline")
        return []

    def _convert_to_legacy_format(self, result: Any, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert the pipeline result to the legacy format expected by clients.

        Args:
            result: Result from the pipeline
            context: Context information

        Returns:
            Dictionary in the legacy format
        """
        legacy_result = {
            "transcript": [],
            "themes": [],
            "patterns": [],
            "insights": [],
            "personas": []
        }

        # Extract transcript segments
        if isinstance(result, dict) and "segments" in result:
            legacy_result["transcript"] = result["segments"]
        elif isinstance(result, list):
            legacy_result["transcript"] = result

        # Extract other results from context
        if "themes" in context:
            legacy_result["themes"] = context["themes"]

        if "patterns" in context:
            legacy_result["patterns"] = context["patterns"]

        if "insights" in context:
            legacy_result["insights"] = context["insights"]

        if "personas" in context:
            legacy_result["personas"] = context["personas"]

        return legacy_result

    def _extract_text_from_transcript(self, transcript: List[Dict[str, str]]) -> str:
        """
        Extract text from a structured transcript.

        Args:
            transcript: Structured transcript

        Returns:
            Extracted text
        """
        # Extract dialogue from transcript
        dialogue_parts = []

        for segment in transcript:
            if "dialogue" in segment and segment["dialogue"]:
                # Add speaker prefix if available
                if "speaker_id" in segment and segment["speaker_id"]:
                    dialogue_parts.append(f"{segment['speaker_id']}: {segment['dialogue']}")
                else:
                    dialogue_parts.append(segment["dialogue"])

        # Join dialogue parts with newlines
        return "\n".join(dialogue_parts)
