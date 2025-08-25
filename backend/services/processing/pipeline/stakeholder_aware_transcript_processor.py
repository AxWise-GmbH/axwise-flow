"""
Stakeholder-aware transcript processor implementation.

This module extends the base transcript processor to handle stakeholder-segmented
interview content, preserving stakeholder boundaries during processing.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from backend.services.processing.pipeline.transcript_processor import (
    TranscriptProcessor,
)
from backend.domain.models.transcript import TranscriptSegment, TranscriptMetadata

logger = logging.getLogger(__name__)


class StakeholderAwareTranscriptProcessor(TranscriptProcessor):
    """
    Stakeholder-aware transcript processor that maintains stakeholder boundaries.

    This processor extends the base TranscriptProcessor to:
    1. Parse stakeholder category headers from cleaned interview content
    2. Group interviews by stakeholder category
    3. Maintain stakeholder context through processing pipeline
    4. Enable stakeholder-specific persona generation
    """

    def __init__(self, llm_service=None):
        """Initialize the stakeholder-aware processor."""
        super().__init__(llm_service)
        self.name = "StakeholderAwareTranscriptProcessor"
        self.description = (
            "Processes transcript data with stakeholder boundary awareness"
        )

    async def _process_impl(self, data: Any, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process input data with stakeholder awareness.

        Args:
            data: The input data to process
            context: Context information for processing

        Returns:
            Dictionary with stakeholder-segmented transcript data
        """
        # Extract raw text from input data
        raw_text, filename = self._extract_text_and_filename(data)

        if not raw_text or not raw_text.strip():
            logger.warning("Empty or whitespace-only transcript provided")
            return {
                "segments": [],
                "metadata": {"filename": filename},
                "stakeholder_segments": {},
            }

        # Detect if this is stakeholder-segmented content
        stakeholder_segments = self._parse_stakeholder_sections(raw_text)

        if stakeholder_segments:
            logger.info(
                f"Detected {len(stakeholder_segments)} stakeholder categories in transcript"
            )

            # Process each stakeholder segment separately
            processed_segments = {}
            all_segments = []

            for stakeholder_category, interviews in stakeholder_segments.items():
                logger.info(
                    f"Processing {len(interviews)} interviews for stakeholder: {stakeholder_category}"
                )

                # Combine interviews for this stakeholder
                stakeholder_text = "\n\n".join(interviews)

                # Detect content type for this stakeholder group
                content_info = self._detect_content_type(stakeholder_text)

                # Structure transcript for this stakeholder
                structured_segments = await self._structure_transcript(
                    stakeholder_text, filename, content_info
                )

                # Add stakeholder context to each segment
                for segment in structured_segments:
                    if hasattr(segment, "__dict__"):
                        segment.stakeholder_category = stakeholder_category
                    elif isinstance(segment, dict):
                        segment["stakeholder_category"] = stakeholder_category

                processed_segments[stakeholder_category] = {
                    "segments": structured_segments,
                    "interview_count": len(interviews),
                    "content_info": content_info,
                }
                all_segments.extend(structured_segments)

            # Create enhanced metadata with stakeholder information
            metadata = self._create_stakeholder_metadata(
                filename, stakeholder_segments, context
            )

            return {
                "segments": all_segments,
                "metadata": metadata,
                "stakeholder_segments": processed_segments,
                "stakeholder_categories": list(stakeholder_segments.keys()),
            }
        else:
            # Fall back to standard processing if no stakeholder structure detected
            logger.info(
                "No stakeholder structure detected, using standard transcript processing"
            )
            return await super()._process_impl(data, context)

    def _parse_stakeholder_sections(self, raw_text: str) -> Dict[str, List[str]]:
        """
        Parse stakeholder sections from cleaned interview content.

        Args:
            raw_text: Raw interview text with stakeholder headers

        Returns:
            Dictionary mapping stakeholder categories to their interview texts
        """
        stakeholder_segments = {}

        # Look for stakeholder headers in the format: "Stakeholder: Category Name"
        stakeholder_pattern = (
            r"--- INTERVIEW \d+ ---\s*\nStakeholder: ([^\n]+)\s*\nSpeaker: ([^\n]+)"
        )

        # Split text into interview sections
        interview_sections = re.split(r"--- INTERVIEW \d+ ---", raw_text)

        # Process each section
        for i, section in enumerate(interview_sections):
            if not section.strip():
                continue

            # Look for stakeholder header in this section
            stakeholder_match = re.search(r"Stakeholder: ([^\n]+)", section)

            if stakeholder_match:
                stakeholder_category = stakeholder_match.group(1).strip()

                # Extract the interview content (everything after the headers)
                lines = section.strip().split("\n")
                interview_content_lines = []

                # Skip header lines and collect interview content
                header_passed = False
                for line in lines:
                    if line.startswith("Speaker:"):
                        header_passed = True
                        continue
                    if header_passed and line.strip():
                        interview_content_lines.append(line)

                if interview_content_lines:
                    interview_content = "\n".join(interview_content_lines)

                    if stakeholder_category not in stakeholder_segments:
                        stakeholder_segments[stakeholder_category] = []

                    stakeholder_segments[stakeholder_category].append(interview_content)

                    logger.debug(
                        f"Parsed interview for stakeholder '{stakeholder_category}': {len(interview_content)} chars"
                    )

        logger.info(
            f"Parsed {len(stakeholder_segments)} stakeholder categories: {list(stakeholder_segments.keys())}"
        )

        # Log interview counts per stakeholder
        for category, interviews in stakeholder_segments.items():
            logger.info(f"  - {category}: {len(interviews)} interviews")

        return stakeholder_segments

    def _create_stakeholder_metadata(
        self,
        filename: Optional[str],
        stakeholder_segments: Dict[str, List[str]],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create enhanced metadata with stakeholder information.

        Args:
            filename: Source filename
            stakeholder_segments: Parsed stakeholder segments
            context: Processing context

        Returns:
            Enhanced metadata dictionary
        """
        total_interviews = sum(
            len(interviews) for interviews in stakeholder_segments.values()
        )

        stakeholder_summary = {}
        for category, interviews in stakeholder_segments.items():
            stakeholder_summary[category] = {
                "interview_count": len(interviews),
                "total_content_length": sum(len(interview) for interview in interviews),
            }

        metadata = {
            "filename": filename,
            "processing_type": "stakeholder_aware",
            "total_interviews": total_interviews,
            "stakeholder_categories": list(stakeholder_segments.keys()),
            "stakeholder_summary": stakeholder_summary,
            "stakeholder_aware": True,
        }

        # Add context information if available
        if "content_info" in context:
            metadata["content_info"] = context["content_info"]

        return metadata

    def get_stakeholder_segments(
        self, processed_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract stakeholder segments from processed data.

        Args:
            processed_data: Result from _process_impl

        Returns:
            Dictionary of stakeholder segments
        """
        return processed_data.get("stakeholder_segments", {})

    def get_stakeholder_categories(self, processed_data: Dict[str, Any]) -> List[str]:
        """
        Extract stakeholder categories from processed data.

        Args:
            processed_data: Result from _process_impl

        Returns:
            List of stakeholder category names
        """
        return processed_data.get("stakeholder_categories", [])
