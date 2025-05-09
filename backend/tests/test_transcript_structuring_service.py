"""
Tests for the TranscriptStructuringService.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.processing.transcript_structuring_service import TranscriptStructuringService


class TestTranscriptStructuringService:
    """Tests for the TranscriptStructuringService."""

    @pytest.fixture
    def mock_llm_service(self):
        """Create a mock LLM service."""
        mock_service = AsyncMock()
        mock_service.analyze = AsyncMock()
        return mock_service

    @pytest.fixture
    def service(self, mock_llm_service):
        """Create a TranscriptStructuringService with a mock LLM service."""
        return TranscriptStructuringService(mock_llm_service)

    @pytest.mark.asyncio
    async def test_structure_transcript_empty_text(self, service):
        """Test structuring an empty transcript."""
        result = await service.structure_transcript("")
        assert result == []

        result = await service.structure_transcript(None)
        assert result == []

        result = await service.structure_transcript("   ")
        assert result == []

    @pytest.mark.asyncio
    async def test_structure_transcript_success(self, service, mock_llm_service):
        """Test successful transcript structuring."""
        # Mock LLM response
        mock_response = [
            {
                "speaker_id": "Interviewer",
                "role": "Interviewer",
                "dialogue": "Tell me about your experience with our product."
            },
            {
                "speaker_id": "John",
                "role": "Interviewee",
                "dialogue": "I've been using it for about six months now."
            }
        ]
        mock_llm_service.analyze.return_value = mock_response

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the result
        assert result == mock_response
        mock_llm_service.analyze.assert_called_once()
        call_args = mock_llm_service.analyze.call_args[0][0]
        assert call_args["task"] == "transcript_structuring"
        assert call_args["text"] == "Sample transcript text"
        assert call_args["enforce_json"] is True
        assert call_args["temperature"] == 0.0

    @pytest.mark.asyncio
    async def test_structure_transcript_string_response(self, service, mock_llm_service):
        """Test handling a string JSON response from the LLM."""
        # Mock LLM response as a JSON string
        mock_response_str = json.dumps([
            {
                "speaker_id": "Interviewer",
                "role": "Interviewer",
                "dialogue": "Tell me about your experience with our product."
            },
            {
                "speaker_id": "John",
                "role": "Interviewee",
                "dialogue": "I've been using it for about six months now."
            }
        ])
        mock_llm_service.analyze.return_value = mock_response_str

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the result
        assert len(result) == 2
        assert result[0]["speaker_id"] == "Interviewer"
        assert result[1]["speaker_id"] == "John"

    @pytest.mark.asyncio
    async def test_structure_transcript_invalid_response(self, service, mock_llm_service):
        """Test handling an invalid response from the LLM."""
        # Mock LLM response with invalid structure
        mock_llm_service.analyze.return_value = {"not_a_list": "This is not a list"}

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the result is empty due to invalid response
        assert result == []

    @pytest.mark.asyncio
    async def test_structure_transcript_malformed_items(self, service, mock_llm_service):
        """Test handling malformed items in the LLM response."""
        # Mock LLM response with some malformed items
        mock_llm_service.analyze.return_value = [
            {
                "speaker_id": "Interviewer",
                "role": "Interviewer",
                "dialogue": "Tell me about your experience with our product."
            },
            {
                "speaker": "John",  # Wrong key
                "role": "Interviewee",
                "text": "I've been using it for about six months now."  # Wrong key
            },
            {
                "speaker_id": "Interviewer",
                "role": "InvalidRole",  # Invalid role
                "dialogue": "What features do you use most?"
            }
        ]

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the result only includes valid items
        assert len(result) == 1
        assert result[0]["speaker_id"] == "Interviewer"
        assert result[0]["dialogue"] == "Tell me about your experience with our product."

    @pytest.mark.asyncio
    async def test_structure_transcript_repair_attempt(self, service, mock_llm_service):
        """Test the repair attempt for malformed data."""
        # Mock LLM response with repairable data
        mock_llm_service.analyze.return_value = [
            {
                "speaker": "Interviewer",  # Wrong key
                "type": "Interviewer",  # Wrong key
                "message": "Tell me about your experience with our product."  # Wrong key
            },
            {
                "name": "John",  # Wrong key
                "speaker_type": "Interviewee",  # Wrong key
                "content": "I've been using it for about six months now."  # Wrong key
            }
        ]

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the repair attempt worked
        assert len(result) == 2
        assert result[0]["speaker_id"] == "Interviewer"
        assert result[0]["role"] == "Interviewer"
        assert result[0]["dialogue"] == "Tell me about your experience with our product."
        assert result[1]["speaker_id"] == "John"
        assert result[1]["role"] == "Interviewee"
        assert result[1]["dialogue"] == "I've been using it for about six months now."

    @pytest.mark.asyncio
    async def test_structure_transcript_exception(self, service, mock_llm_service):
        """Test handling exceptions during transcript structuring."""
        # Mock LLM service to raise an exception
        mock_llm_service.analyze.side_effect = Exception("Test exception")

        # Call the service
        result = await service.structure_transcript("Sample transcript text")

        # Verify the result is empty due to the exception
        assert result == []

    @pytest.mark.asyncio
    async def test_extract_json_from_text(self, service):
        """Test extracting JSON from text with markdown formatting."""
        # Create a text with JSON in a markdown code block
        text = """
        Here's the structured transcript:
        
        ```json
        [
            {
                "speaker_id": "Interviewer",
                "role": "Interviewer",
                "dialogue": "Tell me about your experience with our product."
            },
            {
                "speaker_id": "John",
                "role": "Interviewee",
                "dialogue": "I've been using it for about six months now."
            }
        ]
        ```
        
        I hope this helps!
        """
        
        # Call the extract method
        result = service._extract_json_from_text(text)
        
        # Verify the result
        assert len(result) == 2
        assert result[0]["speaker_id"] == "Interviewer"
        assert result[1]["speaker_id"] == "John"
