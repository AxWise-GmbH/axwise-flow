"""
Tests for the adaptive tool recognition service.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.processing.adaptive_tool_recognition_service import AdaptiveToolRecognitionService


@pytest.fixture
def mock_llm_service():
    """Create a mock LLM service."""
    mock_service = AsyncMock()
    mock_service.analyze = AsyncMock()
    return mock_service


@pytest.fixture
def service(mock_llm_service):
    """Create an adaptive tool recognition service with a mock LLM service."""
    return AdaptiveToolRecognitionService(mock_llm_service)


@pytest.fixture
def sample_text():
    """Create sample text for testing."""
    return """
    I've been working as a UX researcher for about 5 years now. I use a variety of tools in my work.

    For collaborative work, we use Mirrorboards a lot. It's great for brainstorming sessions.

    I also use Figma for creating wireframes and prototypes. Sometimes I'll use Sketch as well,
    but I've mostly transitioned to Figma.

    For user testing, I rely on UserTesting.com and sometimes Lookback. We also use SurveyMonkey
    for gathering quantitative data.

    Our team tracks work in Jira, and we use Confluence for documentation. For presentations,
    I typically use Google Slides or sometimes PowerPoint.
    """


@pytest.mark.asyncio
async def test_identify_industry(service, mock_llm_service, sample_text):
    """Test identifying industry from text."""
    # Mock LLM response
    mock_llm_service.analyze.return_value = {
        "industry": "Technology",
        "confidence": 0.85,
        "reasoning": "The text discusses UX research, design tools, and software development processes."
    }

    # Call the service
    result = await service.identify_industry(sample_text)

    # Verify the result
    assert result["industry"] == "Technology"
    assert result["confidence"] == 0.85

    # Verify LLM was called
    mock_llm_service.analyze.assert_called_once()

    # Call again to test caching
    result2 = await service.identify_industry(sample_text)

    # Verify the result is the same
    assert result2["industry"] == "Technology"

    # Verify LLM was not called again (cache hit)
    assert mock_llm_service.analyze.call_count == 1


@pytest.mark.asyncio
async def test_get_industry_tools(service, mock_llm_service):
    """Test getting industry tools."""
    # Mock LLM response
    mock_llm_service.analyze.return_value = {
        "tools": [
            {
                "name": "Figma",
                "variations": ["Figma", "Figma Design", "FigmaDev"],
                "functions": ["UI design", "prototyping", "collaboration"],
                "industry_terms": ["frames", "components", "auto-layout"]
            },
            {
                "name": "Miro",
                "variations": ["Miro", "Miro Board", "Miroboard", "Mirro"],
                "functions": ["whiteboarding", "collaboration", "brainstorming"],
                "industry_terms": ["sticky notes", "voting", "templates"]
            }
        ]
    }

    # Call the service
    result = await service.get_industry_tools("Technology")

    # Verify the result
    assert "figma" in result
    assert "miro" in result
    assert "miroboard" in result["miro"]["variations"]

    # Verify LLM was called
    mock_llm_service.analyze.assert_called_once()

    # Call again to test caching
    result2 = await service.get_industry_tools("Technology")

    # Verify the result is the same
    assert "figma" in result2

    # Verify LLM was not called again (cache hit)
    assert mock_llm_service.analyze.call_count == 1


@pytest.mark.asyncio
async def test_identify_tools_in_text(service, mock_llm_service, sample_text):
    """Test identifying tools in text."""
    # Mock industry detection
    service.identify_industry = AsyncMock(return_value={"industry": "Technology", "confidence": 0.9})

    # Mock industry tools
    service.get_industry_tools = AsyncMock(return_value={
        "figma": {
            "variations": ["figma", "figma design", "figmadesign"],
            "functions": ["design", "prototype"],
            "industry_terms": []
        },
        "miro": {
            "variations": ["miro", "miro board", "miroboard", "mirrorboard"],
            "functions": ["collaboration", "whiteboard"],
            "industry_terms": []
        }
    })

    # Mock LLM response for tool identification
    mock_llm_service.analyze.return_value = {
        "identified_tools": [
            {
                "tool_name": "Figma",
                "original_mention": "Figma",
                "confidence": 0.95,
                "is_misspelling": False
            },
            {
                "tool_name": "Miro",
                "original_mention": "Mirrorboards",
                "confidence": 0.85,
                "is_misspelling": True,
                "correction_note": "Common transcription error for 'Miro boards'"
            },
            {
                "tool_name": "Sketch",
                "original_mention": "Sketch",
                "confidence": 0.9,
                "is_misspelling": False
            }
        ]
    }

    # Call the service
    result = await service.identify_tools_in_text(sample_text)

    # Verify the result
    assert len(result) == 3

    # Check Figma
    figma_tool = next((t for t in result if t["tool_name"] == "Figma"), None)
    assert figma_tool is not None
    assert figma_tool["confidence"] == 0.95

    # Check Miro (corrected from Mirrorboards)
    miro_tool = next((t for t in result if t["tool_name"] == "Miro"), None)
    assert miro_tool is not None
    assert miro_tool["original_mention"] == "Mirrorboards"
    assert miro_tool["is_misspelling"] is True

    # Verify LLM was called
    mock_llm_service.analyze.assert_called_once()


@pytest.mark.asyncio
async def test_format_tools_for_persona(service):
    """Test formatting tools for persona."""
    # Sample identified tools
    identified_tools = [
        {
            "tool_name": "Figma",
            "original_mention": "Figma",
            "confidence": 0.95,
            "is_misspelling": False
        },
        {
            "tool_name": "Miro",
            "original_mention": "Mirrorboards",
            "confidence": 0.85,
            "is_misspelling": True
        },
        {
            "tool_name": "Sketch",
            "original_mention": "Sketch",
            "confidence": 0.9,
            "is_misspelling": False
        },
        {
            "tool_name": "Unknown Tool",
            "original_mention": "something",
            "confidence": 0.3,  # Below threshold
            "is_misspelling": False
        }
    ]

    # Test bullet format
    bullet_result = service.format_tools_for_persona(identified_tools, "bullet")
    assert "• Figma" in bullet_result
    assert "• Miro" in bullet_result
    assert "• Sketch" in bullet_result
    assert "• Unknown Tool" not in bullet_result  # Below threshold

    # Test comma format
    comma_result = service.format_tools_for_persona(identified_tools, "comma")
    assert "Figma, Miro, Sketch" == comma_result

    # Test JSON format
    json_result = service.format_tools_for_persona(identified_tools, "json")
    assert isinstance(json_result, dict)
    assert "tools" in json_result
    assert len(json_result["tools"]) == 3
    assert "Figma" in json_result["tools"]


def test_calculate_similarity(service):
    """Test calculating string similarity."""
    # Test exact match
    assert service._calculate_similarity("miro", "miro") == 1.0

    # Test close match
    assert service._calculate_similarity("miro", "miroboard") > 0.6

    # Test misspelling
    assert service._calculate_similarity("miro", "mirro") > 0.8

    # Test very different strings
    assert service._calculate_similarity("figma", "sketch") < 0.5


def test_apply_learned_corrections(service):
    """Test applying learned corrections."""
    # Add some learned corrections
    service.learned_corrections = {
        "mirrorboard": {
            "tool_name": "Miro",
            "confidence": 0.9
        }
    }

    # Sample identified tools
    identified_tools = [
        {
            "tool_name": "Unknown",
            "original_mention": "mirrorboard",
            "confidence": 0.5
        }
    ]

    # Apply corrections
    result = service._apply_learned_corrections(identified_tools, "Technology")

    # Verify the result
    assert result[0]["tool_name"] == "Miro"
    assert result[0]["confidence"] == 0.9
    assert result[0]["is_misspelling"] is True


def test_enhance_with_fuzzy_matching(service):
    """Test enhancing with fuzzy matching."""
    # Sample industry tools
    industry_tools = {
        "miro": {
            "variations": ["miro", "miro board", "miroboard"],
            "functions": ["collaboration"],
            "industry_terms": []
        }
    }

    # Sample identified tools with low confidence
    identified_tools = [
        {
            "tool_name": "Unknown",
            "original_mention": "mirro",
            "confidence": 0.5
        }
    ]

    # Apply fuzzy matching
    result = service._enhance_with_fuzzy_matching(identified_tools, industry_tools)

    # Verify the result
    assert result[0]["tool_name"] == "miro"
    assert result[0]["confidence"] > 0.8
    assert result[0]["is_misspelling"] is True
