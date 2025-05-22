"""
Tests for the improvements to the processing pipeline.

This module contains tests for the improvements to the processing pipeline,
including content type detection, request building, and LLM request caching.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.processing.content_type_detector import ContentTypeDetector
from backend.services.processing.request_builder import RequestBuilder
from backend.services.processing.llm_request_cache import LLMRequestCache
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

# Test ContentTypeDetector
def test_content_type_detector():
    """Test the ContentTypeDetector class."""
    # Detect content type
    content_info = ContentTypeDetector.detect(SAMPLE_TRANSCRIPT)
    
    # Verify results
    assert isinstance(content_info, dict)
    assert "is_problem_focused" in content_info
    assert "has_timestamps" in content_info
    assert "has_speaker_labels" in content_info
    assert "estimated_speakers" in content_info
    assert "content_complexity" in content_info
    
    # Verify specific values
    assert content_info["has_speaker_labels"] == True
    assert content_info["estimated_speakers"] == 2
    assert content_info["is_problem_focused"] == False

# Test RequestBuilder
def test_request_builder():
    """Test the RequestBuilder class."""
    # Build a transcript request
    request = RequestBuilder.build_transcript_request(
        text=SAMPLE_TRANSCRIPT,
        prompt="Structure this transcript",
        content_info={"has_timestamps": False},
        filename="test.txt"
    )
    
    # Verify request
    assert isinstance(request, dict)
    assert request["task"] == "transcript_structuring"
    assert request["text"] == SAMPLE_TRANSCRIPT
    assert request["prompt"] == "Structure this transcript"
    assert request["enforce_json"] == True
    assert request["content_info"] == {"has_timestamps": False}
    assert request["filename"] == "test.txt"

# Test LLMRequestCache
@pytest.mark.asyncio
async def test_llm_request_cache():
    """Test the LLMRequestCache class."""
    # Create a mock LLM service
    mock_llm_service = AsyncMock()
    mock_llm_service.analyze = AsyncMock(return_value="Test response")
    
    # Clear the cache
    LLMRequestCache.clear_cache()
    
    # First request (cache miss)
    request_data = {"task": "test", "text": "Test text"}
    response1 = await LLMRequestCache.get_or_compute(request_data, mock_llm_service)
    
    # Verify that the LLM service was called
    mock_llm_service.analyze.assert_called_once_with(request_data)
    assert response1 == "Test response"
    
    # Reset the mock
    mock_llm_service.analyze.reset_mock()
    
    # Second request with same data (cache hit)
    response2 = await LLMRequestCache.get_or_compute(request_data, mock_llm_service)
    
    # Verify that the LLM service was not called
    mock_llm_service.analyze.assert_not_called()
    assert response2 == "Test response"
    
    # Third request with different data (cache miss)
    request_data2 = {"task": "test", "text": "Different text"}
    response3 = await LLMRequestCache.get_or_compute(request_data2, mock_llm_service)
    
    # Verify that the LLM service was called
    mock_llm_service.analyze.assert_called_once_with(request_data2)
    assert response3 == "Test response"

# Test enhanced error handling
@pytest.mark.asyncio
async def test_enhanced_error_handling():
    """Test the enhanced error handling for LLM responses."""
    # Create a TranscriptProcessor
    processor = TranscriptProcessor()
    
    # Test with valid JSON response
    valid_json = '[{"speaker_id": "Interviewer", "role": "Interviewer", "dialogue": "Hello"}]'
    result1 = processor._parse_llm_response(valid_json)
    assert len(result1) == 1
    assert result1[0]["speaker_id"] == "Interviewer"
    
    # Test with malformed JSON response
    malformed_json = '[{"speaker_id": "Interviewer", "role": "Interviewer", "dialogue": "Hello"'
    result2 = processor._parse_llm_response(malformed_json)
    assert len(result2) == 0  # Should handle the error gracefully
    
    # Test with unexpected format
    unexpected_format = '{"result": "success"}'
    result3 = processor._parse_llm_response(unexpected_format)
    assert len(result3) == 0  # Should handle the unexpected format gracefully
    
    # Test with missing fields
    missing_fields = '[{"speaker_id": "Interviewer"}]'
    result4 = processor._parse_llm_response(missing_fields)
    assert len(result4) == 0  # Should skip segments without dialogue
    
    # Test with invalid roles
    invalid_roles = '[{"speaker_id": "Interviewer", "role": "Invalid", "dialogue": "Hello"}]'
    result5 = processor._parse_llm_response(invalid_roles)
    assert len(result5) == 1
    assert result5[0]["role"] == "Participant"  # Should fix invalid roles

# Test refactored _extract_transcript_manually
@pytest.mark.asyncio
async def test_refactored_extract_transcript_manually():
    """Test the refactored _extract_transcript_manually method."""
    # Create a TranscriptProcessor
    processor = TranscriptProcessor()
    
    # Extract transcript manually
    result = processor._extract_transcript_manually(SAMPLE_TRANSCRIPT)
    
    # Verify results
    assert isinstance(result, list)
    assert len(result) > 0
    
    # Check that we have the expected speakers
    speaker_ids = [segment["speaker_id"] for segment in result]
    assert "Interviewer" in speaker_ids
    assert "Participant" in speaker_ids
    
    # Check that roles are assigned correctly
    for segment in result:
        if segment["speaker_id"] == "Interviewer":
            assert segment["role"] == "Interviewer"
        elif segment["speaker_id"] == "Participant":
            assert segment["role"] in ["Interviewee", "Participant"]
