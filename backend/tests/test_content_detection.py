"""
Test script for the content type detection functionality.

This script tests the content type detection functionality in the transcript structuring service
with various input formats and validates the detection results.
"""

import asyncio
import os
import sys
import logging
from typing import Dict, Any

# Add the parent directory to the path so we can import the backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.processing.transcript_structuring_service import TranscriptStructuringService
from backend.services.llm.gemini_service import GeminiService
from backend.services.llm.gemini_llm_service import GeminiLLMService

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Sample problem-focused transcript
PROBLEM_FOCUSED_TRANSCRIPT = """
Interviewer: What are the main challenges you face when using the software?

User: The biggest problem is definitely the navigation. It's really confusing to find what I need.

Interviewer: Can you elaborate on what makes the navigation difficult?

User: There are too many menus and submenus. I often get lost trying to find specific features. Another frustration is that the labels aren't intuitive - they use technical terms that don't make sense to me.

Interviewer: How does this impact your workflow?

User: It slows me down significantly. What should take seconds ends up taking minutes because I'm constantly searching for the right option. Sometimes I give up and use workarounds instead.

Interviewer: Are there any other issues that cause problems for you?

User: Yes, the system crashes quite frequently when I'm trying to export large files. It's really frustrating because I lose my work and have to start over. This has been an ongoing issue for months.
"""

# Sample transcript with timestamps
TIMESTAMPED_TRANSCRIPT = """
[00:01:23] Interviewer: Good morning. Can you tell me about your experience with our product?

[00:01:45] Participant: I've been using it for about 3 months now. Overall, it's been positive.

[00:02:10] Interviewer: What features do you use most frequently?

[00:02:18] Participant: Definitely the reporting tools and the dashboard. I check those daily.

[00:03:05] Interviewer: Have you encountered any difficulties?

[00:03:12] Participant: Sometimes the reports take a long time to generate, especially when I'm pulling data for the entire quarter.
"""

# Sample high complexity transcript
HIGH_COMPLEXITY_TRANSCRIPT = """
Moderator: Welcome everyone to our focus group on enterprise software integration. Today we'll be discussing your experiences with cross-platform data synchronization. Let's start by going around and introducing ourselves and sharing a bit about your role and the systems you work with.

Participant 1: I'm Alex, I work as a systems architect at a financial services company. We're currently managing integrations between our legacy mainframe systems, a mid-tier Java application layer, and several cloud-based microservices. The biggest challenge we face is maintaining data consistency across these disparate systems, especially when dealing with real-time transaction processing.

Participant 2: Hi, I'm Sarah. I'm a DevOps lead at a healthcare provider. We're dealing with integration between our electronic health record system, various departmental systems like radiology and pharmacy, plus external systems for insurance verification and billing. HIPAA compliance adds another layer of complexity to everything we do.

Participant 3: I'm Miguel, working as a data integration specialist at a retail company. We're trying to create a unified view of customer data across our point-of-sale systems, e-commerce platform, loyalty program, and marketing automation tools. The volume of data and the need for real-time analytics makes this particularly challenging.

Moderator: Thank you all. Let's dive deeper into specific integration challenges. What approaches have you tried for maintaining data consistency across systems, and what has or hasn't worked?

Participant 1: We initially tried a hub-and-spoke ETL approach, but the batch processing created too much latency. We've since moved to an event-driven architecture using Kafka as a backbone, which has improved things significantly. However, we still struggle with schema evolution and backward compatibility when services need to change.

Participant 2: Our approach has been to implement a service bus architecture with an API gateway that standardizes access to our various systems. This works well for new integrations, but we have a lot of legacy point-to-point interfaces that are difficult to migrate to this model. We've had to develop a hybrid approach where some systems communicate through the service bus while maintaining direct connections for others.

Participant 3: We've implemented a data lake approach where all systems push data to a central repository, and then we use stream processing to transform and route that data as needed. The challenge has been maintaining data quality and governance - when you have so many sources feeding into one place, inconsistencies become very apparent.
"""

# Sample structured (JSON) transcript
STRUCTURED_TRANSCRIPT = """
[
  {
    "speaker_id": "Interviewer",
    "role": "Interviewer",
    "dialogue": "Can you tell me about your experience with our product?"
  },
  {
    "speaker_id": "User",
    "role": "Interviewee",
    "dialogue": "I've been using it for about 6 months now. It's generally good but has some issues with the user interface."
  },
  {
    "speaker_id": "Interviewer",
    "role": "Interviewer",
    "dialogue": "What specific UI issues have you encountered?"
  },
  {
    "speaker_id": "User",
    "role": "Interviewee",
    "dialogue": "The navigation is confusing, especially in the settings menu. And sometimes the app crashes when I try to export data."
  }
]
"""

async def test_content_detection():
    """Test the content type detection functionality."""
    try:
        # Initialize the Gemini service
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            return

        gemini_config = {
            "api_key": api_key,
            "model": "models/gemini-2.5-flash-preview-05-20",
            "temperature": 0.0,
            "max_tokens": 65536,
            "top_p": 0.95,
        }

        gemini_service = GeminiService(gemini_config)
        llm_service = GeminiLLMService(gemini_service)

        # Initialize the transcript structuring service
        transcript_service = TranscriptStructuringService(llm_service)

        # Test content type detection for problem-focused transcript
        logger.info("Testing content type detection for problem-focused transcript...")
        problem_content_info = transcript_service._detect_content_type(PROBLEM_FOCUSED_TRANSCRIPT)
        logger.info(f"Problem-focused content detection result: {problem_content_info}")
        assert problem_content_info["is_problem_focused"] == True, "Failed to detect problem-focused content"

        # Test content type detection for timestamped transcript
        logger.info("Testing content type detection for timestamped transcript...")
        timestamped_content_info = transcript_service._detect_content_type(TIMESTAMPED_TRANSCRIPT)
        logger.info(f"Timestamped content detection result: {timestamped_content_info}")
        assert timestamped_content_info["has_timestamps"] == True, "Failed to detect timestamps in content"

        # Test content type detection for high complexity transcript
        logger.info("Testing content type detection for high complexity transcript...")
        complex_content_info = transcript_service._detect_content_type(HIGH_COMPLEXITY_TRANSCRIPT)
        logger.info(f"High complexity content detection result: {complex_content_info}")
        assert complex_content_info["content_complexity"] == "high", "Failed to detect high complexity content"

        # Test content type detection for structured transcript
        logger.info("Testing content type detection for structured transcript...")
        structured_content_info = transcript_service._detect_content_type(STRUCTURED_TRANSCRIPT)
        logger.info(f"Structured content detection result: {structured_content_info}")
        assert structured_content_info["is_structured"] == True, "Failed to detect structured content"

        logger.info("All content type detection tests completed successfully!")

    except Exception as e:
        logger.error(f"Error in test: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(test_content_detection())
