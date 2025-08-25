#!/usr/bin/env python3
"""
Automatic interview cleaner utility for the analysis pipeline.
Detects and cleans synthetic interview simulation files before analysis.
"""

import re
import logging
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)


class InterviewCleaner:
    """
    Utility class for automatically cleaning interview files before analysis.
    Detects synthetic interview simulation format and extracts clean verbatim dialogues.
    """

    @staticmethod
    def detect_synthetic_interview_format(content: str) -> bool:
        """
        Detect if the content is a synthetic interview simulation file.
        
        Args:
            content: Raw file content
            
        Returns:
            bool: True if synthetic interview format detected
        """
        # Check for synthetic interview markers
        synthetic_markers = [
            "SYNTHETIC INTERVIEW SIMULATION",
            "INTERVIEW DIALOGUE",
            "STAKEHOLDER BREAKDOWN",
            "💡 Key Insights:",
            "INTERVIEW METADATA"
        ]
        
        content_upper = content.upper()
        marker_count = sum(1 for marker in synthetic_markers if marker.upper() in content_upper)
        
        # If we find multiple markers, it's likely a synthetic interview file
        return marker_count >= 2

    @staticmethod
    def clean_synthetic_interviews(content: str) -> Tuple[str, Dict[str, Any]]:
        """
        Clean synthetic interview simulation content to extract verbatim dialogues.
        
        Args:
            content: Raw synthetic interview content
            
        Returns:
            Tuple of (cleaned_content, metadata)
        """
        logger.info("Cleaning synthetic interview simulation content")
        
        # Split content into sections
        sections = content.split("==================================================")
        
        all_interviews = []
        interview_count = 0
        total_dialogue_lines = 0
        stakeholder_categories = set()

        for section in sections:
            # Skip if this is not an interview section
            if "INTERVIEW DIALOGUE" not in section:
                continue

            interview_count += 1
            logger.debug(f"Processing Interview {interview_count}...")

            # Extract stakeholder category from metadata
            stakeholder_category = "Unknown"
            if "Stakeholder Category:" in section:
                for line in section.split("\n"):
                    if "Stakeholder Category:" in line:
                        stakeholder_category = line.split("Stakeholder Category:")[-1].strip()
                        stakeholder_categories.add(stakeholder_category)
                        break

            # Extract dialogue lines only
            lines = section.split("\n")
            current_interview = []
            current_speaker = None
            current_dialogue = ""

            dialogue_started = False
            for line in lines:
                line = line.strip()

                # Skip empty lines and metadata until we hit dialogue section
                if not line:
                    continue
                if line.startswith("INTERVIEW DIALOGUE"):
                    dialogue_started = True
                    continue
                if not dialogue_started:
                    continue
                if line.startswith("=================================================="):
                    break  # End of this interview

                # Skip section separators within dialogue
                if line.startswith("--") and len(line) > 10:
                    continue

                # Stop at key insights but continue to next dialogue section
                if line.startswith("💡 Key Insights:"):
                    continue

                # Check if this is a dialogue line (timestamp + speaker)
                timestamp_match = re.match(
                    r"\[(\d{2}:\d{2})\] (Researcher|Interviewee|.*?):", line
                )
                if timestamp_match:
                    # Save previous dialogue if exists
                    if current_speaker and current_dialogue.strip():
                        current_interview.append(
                            f"{current_speaker}: {current_dialogue.strip()}"
                        )
                        total_dialogue_lines += 1

                    # Start new dialogue
                    timestamp, speaker = timestamp_match.groups()
                    # Handle cases where speaker might be "Lena Schmidt" instead of "Interviewee"
                    if speaker not in ["Researcher", "Interviewee"]:
                        speaker = "Interviewee"
                    current_speaker = f"[{timestamp}] {speaker}"
                    current_dialogue = line.split(":", 2)[-1].strip()  # Get everything after "Speaker:"
                elif (
                    current_speaker
                    and not line.startswith("💡")
                    and not line.startswith("--")
                ):
                    # This is a continuation of the previous dialogue
                    current_dialogue += " " + line

            # Save the last dialogue
            if current_speaker and current_dialogue.strip():
                current_interview.append(f"{current_speaker}: {current_dialogue.strip()}")
                total_dialogue_lines += 1

            if current_interview:
                # Add interview header with speaker identification
                interview_header = f"\n--- INTERVIEW {interview_count} ---"
                interview_header += f"\nStakeholder: {stakeholder_category}"
                interview_header += f"\nSpeaker: Interviewee_{interview_count:02d}\n"

                all_interviews.append(interview_header)
                all_interviews.extend(current_interview)
                all_interviews.append("")  # Add blank line between interviews

        # Create cleaned content
        cleaned_content = "CLEANED INTERVIEW DIALOGUES - READY FOR ANALYSIS\n"
        cleaned_content += "=" * 60 + "\n\n"
        cleaned_content += f"Processed {interview_count} interviews with automatic cleaning.\n"
        cleaned_content += "✅ Removed all metadata, key insights, and summaries\n"
        cleaned_content += "✅ Preserved authentic dialogue content with timestamps\n"
        cleaned_content += "✅ Clear speaker identification for each interview\n\n"
        cleaned_content += "=" * 60 + "\n"

        for line in all_interviews:
            cleaned_content += line + "\n"

        # Create metadata
        metadata = {
            "cleaning_applied": True,
            "original_format": "synthetic_interview_simulation",
            "interviews_processed": interview_count,
            "dialogue_lines_extracted": total_dialogue_lines,
            "stakeholder_categories": list(stakeholder_categories),
            "cleaning_method": "automatic_verbatim_extraction"
        }

        logger.info(f"✅ Successfully cleaned {interview_count} interviews")
        logger.info(f"✅ Extracted {total_dialogue_lines} dialogue lines")
        logger.info(f"✅ Found {len(stakeholder_categories)} stakeholder categories")

        return cleaned_content, metadata

    @staticmethod
    def auto_clean_if_needed(content: str, filename: str = None) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Automatically detect and clean interview content if it's in synthetic format.
        
        Args:
            content: Raw file content
            filename: Optional filename for context
            
        Returns:
            Tuple of (processed_content, cleaning_metadata or None)
        """
        # Check if this is a synthetic interview file
        if InterviewCleaner.detect_synthetic_interview_format(content):
            logger.info(f"Detected synthetic interview format in {filename or 'uploaded file'}")
            logger.info("Applying automatic interview cleaning...")
            
            cleaned_content, metadata = InterviewCleaner.clean_synthetic_interviews(content)
            
            logger.info("✅ Automatic interview cleaning completed")
            return cleaned_content, metadata
        else:
            logger.debug(f"No synthetic interview format detected in {filename or 'uploaded file'}")
            return content, None


def clean_interview_content(content: str, filename: str = None) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Convenience function for cleaning interview content.
    
    Args:
        content: Raw file content
        filename: Optional filename for context
        
    Returns:
        Tuple of (processed_content, cleaning_metadata or None)
    """
    return InterviewCleaner.auto_clean_if_needed(content, filename)
