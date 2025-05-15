#!/usr/bin/env python
"""
Test script for validating the TranscriptStructuringService in isolation.

This script initializes the TranscriptStructuringService with a Gemini LLM service
and tests it with various sample transcripts to validate its output.

Usage:
    python backend/tests/manual/test_transcript_structuring.py

The script will process each sample transcript and display the structured output
for manual verification.
"""

import os
import sys
import json
import asyncio
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import the required modules
from backend.services.processing.transcript_structuring_service import TranscriptStructuringService
from backend.services.llm.gemini_service import GeminiService

def load_sample_transcripts():
    """Load sample transcripts from files."""
    import os

    sample_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "sample-data")
    transcripts = []

    # List of transcript files to test
    transcript_files = [
        "interview_transcript.txt",
        "fakeCallTeams.txt",
        "Interview __ Zuzanna - Vitalijs - 2025_03_21 12_59 CET - Transcript.txt"
    ]

    for filename in transcript_files:
        file_path = os.path.join(sample_dir, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # Remove markdown code block markers if present
                content = content.replace("```plaintext", "").replace("```", "")
                transcripts.append({
                    "name": filename,
                    "content": content
                })
                logger.info(f"Loaded transcript from {filename}")
        except Exception as e:
            logger.error(f"Error loading transcript from {filename}: {str(e)}")

    return transcripts

# Load sample transcripts from files
SAMPLE_TRANSCRIPTS = load_sample_transcripts()

async def test_transcript_structuring():
    """Test the TranscriptStructuringService with sample transcripts."""
    # Load environment variables
    load_dotenv()

    # Initialize the LLM service
    llm_service = GeminiService({"temperature": 0.0})

    # Initialize the TranscriptStructuringService
    transcript_service = TranscriptStructuringService(llm_service)

    # Process each sample transcript
    for i, transcript_data in enumerate(SAMPLE_TRANSCRIPTS):
        transcript_name = transcript_data["name"]
        transcript_content = transcript_data["content"]

        logger.info(f"\n\n{'='*80}\nProcessing Sample Transcript #{i+1}: {transcript_name}\n{'='*80}")

        # Log a sample of the transcript (first 500 chars)
        sample_text = transcript_content[:500] + "..." if len(transcript_content) > 500 else transcript_content
        logger.info(f"Raw Transcript (sample):\n{sample_text}\n")

        try:
            # Process the transcript
            structured_transcript = await transcript_service.structure_transcript(transcript_content)

            # Save the structured transcript to a file for easier analysis
            output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts", "output")
            os.makedirs(output_dir, exist_ok=True)

            output_file = os.path.join(output_dir, f"structured_{os.path.splitext(transcript_name)[0]}.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(structured_transcript, f, indent=2)

            logger.info(f"Saved structured transcript to {output_file}")

            # Display summary statistics
            logger.info(f"\nSummary:")
            logger.info(f"- Number of segments: {len(structured_transcript)}")

            # Count unique speakers and roles
            speakers = set(segment['speaker_id'] for segment in structured_transcript)
            roles = set(segment['role'] for segment in structured_transcript)

            logger.info(f"- Unique speakers: {len(speakers)} {list(speakers)}")
            logger.info(f"- Unique roles: {len(roles)} {list(roles)}")

            # Display a sample of the structured transcript (first 3 segments)
            sample_segments = structured_transcript[:3] if len(structured_transcript) > 3 else structured_transcript
            logger.info(f"\nSample Segments:")
            logger.info(json.dumps(sample_segments, indent=2))

            # Validation checks
            logger.info(f"\nValidation Checks:")

            # Check if all required fields are present
            all_fields_present = all(
                all(field in segment for field in ['speaker_id', 'role', 'dialogue'])
                for segment in structured_transcript
            )
            logger.info(f"- All required fields present: {'✅' if all_fields_present else '❌'}")

            # Check if roles are valid
            valid_roles = all(
                segment['role'] in ['Interviewer', 'Interviewee', 'Participant']
                for segment in structured_transcript
            )
            logger.info(f"- All roles are valid: {'✅' if valid_roles else '❌'}")

            # Check if all segments have non-empty dialogue
            non_empty_dialogue = all(
                segment['dialogue'].strip() != ''
                for segment in structured_transcript
            )
            logger.info(f"- All dialogues are non-empty: {'✅' if non_empty_dialogue else '❌'}")

            # Check for consistent speaker role assignment
            speaker_roles = {}
            for segment in structured_transcript:
                speaker = segment['speaker_id']
                role = segment['role']
                if speaker in speaker_roles and speaker_roles[speaker] != role:
                    logger.warning(f"Inconsistent role assignment for speaker '{speaker}': {speaker_roles[speaker]} vs {role}")
                speaker_roles[speaker] = role

            logger.info(f"- Consistent speaker role assignment: {'✅' if len(speaker_roles) == len(speakers) else '❌'}")

            # Manual verification prompt
            logger.info(f"\nManual Verification (check {output_file}):")
            logger.info(f"- Are all speaker turns captured correctly? (Check manually)")
            logger.info(f"- Are speaker_ids consistent for the same speaker? (Check manually)")
            logger.info(f"- Are roles reasonably inferred? (Check manually)")
            logger.info(f"- Are timestamps and artifacts handled correctly? (Check manually)")

        except Exception as e:
            logger.error(f"Error processing transcript {transcript_name}: {str(e)}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(test_transcript_structuring())
