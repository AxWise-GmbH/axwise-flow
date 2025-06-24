"""
Test script for the transcript structuring service.

This script tests the transcript structuring service with various input formats
and validates the output against the expected structure.
"""

import asyncio
import json
import os
import sys
import logging
from typing import Dict, Any, List

# Add the parent directory to the path so we can import the backend modules
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from backend.services.processing.transcript_structuring_service import (
    TranscriptStructuringService,
)
from backend.services.llm.gemini_service import GeminiService
from backend.services.llm.gemini_llm_service import GeminiLLMService
from backend.models.transcript import TranscriptSegment, StructuredTranscript

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Sample transcript for testing
SAMPLE_TRANSCRIPT = """
Interviewer: Good morning. Thanks for coming in. Can you start by telling me about your experience with project management tools?

Sarah Miller: Certainly. [clears throat] I've used several tools over the past five years, primarily Jira and Asana. I find Jira very powerful for development tracking, but Asana is often better for less technical teams.

Interviewer: Interesting. What specific challenges have you faced with Jira?

Sarah Miller: The biggest challenge is the learning curve. New team members often struggle with the complexity. Also, the reporting features, while comprehensive, can be difficult to customize without deep knowledge of the system.

Interviewer: How do you typically onboard new team members to these tools?

Sarah Miller: We've developed a phased approach. First, we have them observe and use basic features. Then we pair them with experienced users for more complex tasks. We also created custom documentation with screenshots specific to our workflows.
"""

# Sample transcript with problematic formatting
PROBLEMATIC_TRANSCRIPT = """
Interview Transcript
Date: 2023-10-15
Attendees: John (Interviewer), Sarah (Participant)

[00:01:23] John: Can you tell me about your experience with the product?

[00:01:45] Sarah: I've been using it for about 6 months now. It's generally good but has some issues with the user interface.

John: What specific UI issues have you encountered?

Sarah: The navigation is confusing, especially in the settings menu. And sometimes the app crashes when I try to export data.

[00:03:12] John: Have you reported these issues to support?

Sarah: Yes, they were responsive but haven't fixed the problems yet.

End of Recording
"""


async def test_transcript_structuring():
    """Test the transcript structuring service."""
    try:
        # Initialize the Gemini service
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            return

        gemini_config = {
            "api_key": api_key,
            "model": "models/gemini-2.5-flash",
            "temperature": 0.0,
            "max_tokens": 65536,
            "top_p": 0.95,
        }

        gemini_service = GeminiService(gemini_config)
        llm_service = GeminiLLMService(gemini_service)

        # Initialize the transcript structuring service
        transcript_service = TranscriptStructuringService(llm_service)

        # Test with a clean transcript
        logger.info("Testing with clean transcript...")
        clean_result = await transcript_service.structure_transcript(
            SAMPLE_TRANSCRIPT, "test_transcript.txt"
        )

        # Validate the result
        validate_transcript_structure(clean_result)
        logger.info(f"Clean transcript test result: {len(clean_result)} segments")
        logger.info(f"First segment: {clean_result[0]}")

        # Test with a problematic transcript
        logger.info("Testing with problematic transcript...")
        problem_result = await transcript_service.structure_transcript(
            PROBLEMATIC_TRANSCRIPT, "test_Problem_demo.txt"
        )

        # Validate the result
        validate_transcript_structure(problem_result)
        logger.info(
            f"Problematic transcript test result: {len(problem_result)} segments"
        )
        logger.info(f"First segment: {problem_result[0]}")

        logger.info("All tests completed successfully!")

    except Exception as e:
        logger.error(f"Error in test: {e}", exc_info=True)


def validate_transcript_structure(transcript: List[Dict[str, str]]):
    """Validate the structure of the transcript."""
    if not transcript:
        raise ValueError("Transcript is empty")

    # Check that each segment has the required fields
    for i, segment in enumerate(transcript):
        if not isinstance(segment, dict):
            raise ValueError(f"Segment {i} is not a dictionary: {segment}")

        # Check required fields
        for field in ["speaker_id", "role", "dialogue"]:
            if field not in segment:
                raise ValueError(
                    f"Segment {i} is missing required field '{field}': {segment}"
                )

            # Check field types
            if not isinstance(segment[field], str):
                raise ValueError(
                    f"Segment {i} field '{field}' is not a string: {segment[field]}"
                )

        # Check role values
        if segment["role"] not in ["Interviewer", "Interviewee", "Participant"]:
            raise ValueError(
                f"Segment {i} has invalid role '{segment['role']}': {segment}"
            )

    # Try to validate with Pydantic models
    try:
        # Validate each segment
        for segment in transcript:
            TranscriptSegment(**segment)

        # Validate the whole transcript
        StructuredTranscript(segments=transcript)

        logger.info("Transcript validated successfully with Pydantic models")
    except Exception as e:
        logger.error(f"Pydantic validation error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(test_transcript_structuring())
