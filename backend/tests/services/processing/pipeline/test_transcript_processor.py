"""
Tests for the transcript processor.

This module contains tests for the transcript processor to ensure it correctly
processes raw transcript data into a structured format.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

from backend.services.processing.pipeline.transcript_processor import TranscriptProcessor

# Sample transcript data
SAMPLE_TRANSCRIPT = """
Interviewer: Good morning. Can you tell me about your experience with our product?

Participant: I've been using it for about 3 months now. Overall, it's been positive.

Interviewer: What features do you use most frequently?

Participant: Definitely the reporting tools and the dashboard. I check those daily.

Interviewer: Have you encountered any difficulties?

Participant: Sometimes the reports take a long time to generate, especially when I'm pulling data for the entire quarter.
"""

SAMPLE_PROBLEM_TRANSCRIPT = """
Interviewer: What are the main challenges you face when using the software?

User: The biggest problem is definitely the navigation. It's really confusing to find what I need.

Interviewer: Can you elaborate on what makes the navigation difficult?

User: There are too many menus and submenus. I often get lost trying to find specific features. Another frustration is that the labels aren't intuitive - they use technical terms that don't make sense to me.

Interviewer: How does this impact your workflow?

User: It slows me down significantly. What should take seconds ends up taking minutes because I'm constantly searching for the right option. Sometimes I give up and use workarounds instead.

Interviewer: Are there any other issues that cause problems for you?

User: Yes, the system crashes quite frequently when I'm trying to export large files. It's really frustrating because I lose my work and have to start over. This has been an ongoing issue for months.
"""

SAMPLE_TIMESTAMPED_TRANSCRIPT = """
[00:01:23] Interviewer: Good morning. Can you tell me about your experience with our product?

[00:01:45] Participant: I've been using it for about 3 months now. Overall, it's been positive.

[00:02:10] Interviewer: What features do you use most frequently?

[00:02:18] Participant: Definitely the reporting tools and the dashboard. I check those daily.

[00:03:05] Interviewer: Have you encountered any difficulties?

[00:03:12] Participant: Sometimes the reports take a long time to generate, especially when I'm pulling data for the entire quarter.
"""

@pytest.fixture
def mock_llm_service():
    """Create a mock LLM service."""
    mock_service = AsyncMock()
    mock_service.analyze = AsyncMock(return_value="""[
        {
            "speaker_id": "Interviewer",
            "role": "Interviewer",
            "dialogue": "Good morning. Can you tell me about your experience with our product?"
        },
        {
            "speaker_id": "Participant",
            "role": "Interviewee",
            "dialogue": "I've been using it for about 3 months now. Overall, it's been positive."
        },
        {
            "speaker_id": "Interviewer",
            "role": "Interviewer",
            "dialogue": "What features do you use most frequently?"
        },
        {
            "speaker_id": "Participant",
            "role": "Interviewee",
            "dialogue": "Definitely the reporting tools and the dashboard. I check those daily."
        },
        {
            "speaker_id": "Interviewer",
            "role": "Interviewer",
            "dialogue": "Have you encountered any difficulties?"
        },
        {
            "speaker_id": "Participant",
            "role": "Interviewee",
            "dialogue": "Sometimes the reports take a long time to generate, especially when I'm pulling data for the entire quarter."
        }
    ]""")
    return mock_service

@pytest.mark.asyncio
async def test_transcript_processor_with_llm(mock_llm_service):
    """Test the transcript processor with a mock LLM service."""
    # Arrange
    processor = TranscriptProcessor(mock_llm_service)
    
    # Act
    result = await processor.process(SAMPLE_TRANSCRIPT, {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert len(result["segments"]) == 6
    assert result["segments"][0]["speaker_id"] == "Interviewer"
    assert result["segments"][0]["role"] == "Interviewer"
    assert result["segments"][1]["speaker_id"] == "Participant"
    assert result["segments"][1]["role"] == "Interviewee"

@pytest.mark.asyncio
async def test_transcript_processor_without_llm():
    """Test the transcript processor without an LLM service."""
    # Arrange
    processor = TranscriptProcessor()
    
    # Act
    result = await processor.process(SAMPLE_TRANSCRIPT, {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert len(result["segments"]) > 0
    # Check that we have at least some segments with the expected speakers
    speaker_ids = [segment["speaker_id"] for segment in result["segments"]]
    assert "Interviewer" in speaker_ids
    assert "Participant" in speaker_ids

@pytest.mark.asyncio
async def test_transcript_processor_with_problem_transcript(mock_llm_service):
    """Test the transcript processor with a problem-focused transcript."""
    # Arrange
    processor = TranscriptProcessor(mock_llm_service)
    
    # Act
    result = await processor.process(SAMPLE_PROBLEM_TRANSCRIPT, {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert result["metadata"]["content_type"]["is_problem_focused"] == True

@pytest.mark.asyncio
async def test_transcript_processor_with_timestamped_transcript(mock_llm_service):
    """Test the transcript processor with a timestamped transcript."""
    # Arrange
    processor = TranscriptProcessor(mock_llm_service)
    
    # Act
    result = await processor.process(SAMPLE_TIMESTAMPED_TRANSCRIPT, {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert result["metadata"]["content_type"]["has_timestamps"] == True

@pytest.mark.asyncio
async def test_transcript_processor_with_dict_input(mock_llm_service):
    """Test the transcript processor with a dictionary input."""
    # Arrange
    processor = TranscriptProcessor(mock_llm_service)
    input_data = {
        "text": SAMPLE_TRANSCRIPT,
        "filename": "test.txt"
    }
    
    # Act
    result = await processor.process(input_data, {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert result["metadata"]["filename"] == "test.txt"
    assert len(result["segments"]) > 0

@pytest.mark.asyncio
async def test_transcript_processor_with_empty_input(mock_llm_service):
    """Test the transcript processor with empty input."""
    # Arrange
    processor = TranscriptProcessor(mock_llm_service)
    
    # Act
    result = await processor.process("", {})
    
    # Assert
    assert "segments" in result
    assert "metadata" in result
    assert len(result["segments"]) == 0

@pytest.mark.asyncio
async def test_detect_content_type():
    """Test the content type detection."""
    # Arrange
    processor = TranscriptProcessor()
    
    # Act
    result1 = processor._detect_content_type(SAMPLE_TRANSCRIPT)
    result2 = processor._detect_content_type(SAMPLE_PROBLEM_TRANSCRIPT)
    result3 = processor._detect_content_type(SAMPLE_TIMESTAMPED_TRANSCRIPT)
    
    # Assert
    assert result1["is_problem_focused"] == False
    assert result1["has_timestamps"] == False
    assert result1["has_speaker_labels"] == True
    
    assert result2["is_problem_focused"] == True
    assert result2["has_timestamps"] == False
    assert result2["has_speaker_labels"] == True
    
    assert result3["is_problem_focused"] == False
    assert result3["has_timestamps"] == True
    assert result3["has_speaker_labels"] == True
