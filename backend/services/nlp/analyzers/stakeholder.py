"""
Stakeholder detection utilities.

This module provides utilities for detecting stakeholder-segmented
interview structures in raw text.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class StakeholderDetector:
    """Detector for stakeholder-segmented interview structures."""

    def detect(self, raw_text: str) -> Optional[Dict[str, Any]]:
        """
        Detect if the raw text contains stakeholder-segmented interview structure.

        Args:
            raw_text: Raw interview text to analyze

        Returns:
            Dictionary of stakeholder segments if detected, None otherwise
        """
        if not raw_text or not raw_text.strip():
            return None

        try:
            # Import the stakeholder-aware transcript processor
            from backend.services.processing.pipeline.stakeholder_aware_transcript_processor import (
                StakeholderAwareTranscriptProcessor,
            )

            # Create a temporary processor instance
            processor = StakeholderAwareTranscriptProcessor()

            # Try to parse stakeholder sections
            stakeholder_segments = processor._parse_stakeholder_sections(raw_text)

            if stakeholder_segments and len(stakeholder_segments) > 0:
                logger.info(
                    f"[STAKEHOLDER_DETECTION] Found {len(stakeholder_segments)} stakeholder categories"
                )

                # Convert to the format expected by persona formation service
                formatted_segments = self._format_segments(stakeholder_segments)
                return formatted_segments
            else:
                logger.info("[STAKEHOLDER_DETECTION] No stakeholder structure detected")
                return None

        except ImportError:
            logger.warning("[STAKEHOLDER_DETECTION] StakeholderAwareTranscriptProcessor not available")
            return None
        except Exception as e:
            logger.error(f"[STAKEHOLDER_DETECTION] Error detecting stakeholder structure: {str(e)}")
            return None

    def _format_segments(
        self, stakeholder_segments: Dict[str, List[str]]
    ) -> Dict[str, Any]:
        """
        Format stakeholder segments for persona formation service.

        Args:
            stakeholder_segments: Raw stakeholder segments from parser

        Returns:
            Formatted segments dictionary
        """
        formatted_segments = {}
        for category, interviews in stakeholder_segments.items():
            segments = []
            for i, interview_text in enumerate(interviews):
                segments.append({
                    "text": interview_text,
                    "speaker": f"Interviewee_{i+1}",
                    "role": "Interviewee",
                    "stakeholder_category": category,
                })

            formatted_segments[category] = {
                "segments": segments,
                "interview_count": len(interviews),
                "content_info": {"type": "stakeholder_interview"},
            }

        return formatted_segments


# Module-level function for convenience
def detect_stakeholder_structure(raw_text: str) -> Optional[Dict[str, Any]]:
    """Detect stakeholder structure in raw text."""
    detector = StakeholderDetector()
    return detector.detect(raw_text)

