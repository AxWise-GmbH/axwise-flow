"""
Tests for the pattern processor.

This module contains tests for the pattern processor.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.models.pattern import Pattern, PatternResponse
from backend.services.processing.pattern_processor import PatternProcessor
from backend.services.processing.pattern_service import PatternService


@pytest.fixture
def mock_instructor_client():
    """Create a mock instructor client."""
    mock_client = AsyncMock()
    mock_client.generate_with_model_async = AsyncMock()
    return mock_client


@pytest.fixture
def pattern_processor(mock_instructor_client):
    """Create a pattern processor with a mock instructor client."""
    return PatternProcessor(instructor_client=mock_instructor_client)


@pytest.fixture
def pattern_service(mock_instructor_client):
    """Create a pattern service with a mock pattern processor."""
    with patch('backend.services.processing.pattern_processor_factory.PatternProcessorFactory.create_processor') as mock_factory:
        processor = PatternProcessor(instructor_client=mock_instructor_client)
        mock_factory.return_value = processor
        service = PatternService()
        return service


@pytest.fixture
def sample_patterns():
    """Create sample patterns for testing."""
    return [
        Pattern(
            name="Multi-source Validation",
            category="Decision Process",
            description="Users consistently seek validation from multiple sources before making decisions",
            frequency=0.65,
            sentiment=-0.3,
            evidence=[
                "I always check with three different team members before finalizing a design decision",
                "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
            ],
            impact="Slows down decision-making process but increases confidence in final decisions",
            suggested_actions=[
                "Create a centralized knowledge base of best practices",
                "Develop a streamlined validation checklist"
            ]
        ),
        Pattern(
            name="Workaround Development",
            category="Coping Strategy",
            description="Users develop workarounds when standard processes are too slow or cumbersome",
            frequency=0.8,
            sentiment=-0.5,
            evidence=[
                "I've created my own spreadsheet to track tasks because the official system is too slow",
                "We use Slack for quick approvals instead of waiting for the formal review process"
            ],
            impact="Reduces friction but creates inconsistency and potential compliance issues",
            suggested_actions=[
                "Identify common workarounds and integrate them into official processes",
                "Streamline existing processes to reduce the need for workarounds"
            ]
        )
    ]


@pytest.mark.asyncio
async def test_pattern_processor_process(pattern_processor, mock_instructor_client, sample_patterns):
    """Test the pattern processor process method."""
    # Arrange
    mock_instructor_client.generate_with_model_async.return_value = PatternResponse(patterns=sample_patterns)
    
    # Act
    result = await pattern_processor.process("Sample text for pattern analysis")
    
    # Assert
    assert isinstance(result, PatternResponse)
    assert len(result.patterns) == 2
    assert result.patterns[0].name == "Multi-source Validation"
    assert result.patterns[1].category == "Coping Strategy"
    mock_instructor_client.generate_with_model_async.assert_called_once()


@pytest.mark.asyncio
async def test_pattern_processor_fallback_to_themes(pattern_processor, mock_instructor_client, sample_patterns):
    """Test the pattern processor fallback to themes."""
    # Arrange
    mock_instructor_client.generate_with_model_async.side_effect = Exception("JSON parsing error")
    themes = [
        {
            "name": "Validation Process",
            "definition": "Users have specific validation processes for decisions",
            "statements": ["I always check with others before deciding"],
            "frequency": 0.7,
            "sentiment": 0.2
        }
    ]
    
    # Act
    result = await pattern_processor.process("Sample text", {"themes": themes})
    
    # Assert
    assert isinstance(result, PatternResponse)
    assert len(result.patterns) == 1
    assert "Validation Process" in result.patterns[0].name
    assert mock_instructor_client.generate_with_model_async.call_count == 1


@pytest.mark.asyncio
async def test_pattern_service_generate_patterns(pattern_service, mock_instructor_client, sample_patterns):
    """Test the pattern service generate_patterns method."""
    # Arrange
    mock_instructor_client.generate_with_model_async.return_value = PatternResponse(patterns=sample_patterns)
    
    # Act
    result = await pattern_service.generate_patterns("Sample text", industry="Technology")
    
    # Assert
    assert isinstance(result, PatternResponse)
    assert len(result.patterns) == 2
    assert result.patterns[0].name == "Multi-source Validation"
    assert result.patterns[1].category == "Coping Strategy"
    mock_instructor_client.generate_with_model_async.assert_called_once()


@pytest.mark.asyncio
async def test_pattern_service_categorize_patterns(pattern_service, sample_patterns):
    """Test the pattern service categorize_patterns method."""
    # Act
    result = await pattern_service.categorize_patterns(sample_patterns)
    
    # Assert
    assert isinstance(result, dict)
    assert "Decision Process" in result
    assert "Coping Strategy" in result
    assert len(result["Decision Process"]) == 1
    assert len(result["Coping Strategy"]) == 1
    assert result["Decision Process"][0].name == "Multi-source Validation"
    assert result["Coping Strategy"][0].name == "Workaround Development"
