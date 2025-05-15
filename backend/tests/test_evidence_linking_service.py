"""
Tests for the evidence linking service.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.processing.evidence_linking_service import EvidenceLinkingService


@pytest.fixture
def mock_llm_service():
    """Create a mock LLM service."""
    mock_service = AsyncMock()
    mock_service.analyze = AsyncMock()
    return mock_service


@pytest.fixture
def service(mock_llm_service):
    """Create an evidence linking service with a mock LLM service."""
    return EvidenceLinkingService(mock_llm_service)


@pytest.fixture
def sample_attributes():
    """Create sample attributes for testing."""
    return {
        "name": "Product Designer",
        "description": "A product designer focused on user experience",
        "archetype": "Creative Problem-Solver",
        "demographics": {
            "value": "34-year-old female with 8 years of experience in UX/UI design",
            "confidence": 0.8,
            "evidence": []
        },
        "goals_and_motivations": {
            "value": "Creating intuitive interfaces that solve real user problems",
            "confidence": 0.7,
            "evidence": []
        },
        "skills_and_expertise": {
            "value": "Proficient in Figma, user research, and prototyping",
            "confidence": 0.9,
            "evidence": []
        }
    }


@pytest.fixture
def sample_text():
    """Create sample text for testing."""
    return """
    I've been working as a product designer for about 8 years now. I'm 34 years old and I specialize in UX/UI design.

    My main goal is to create interfaces that are intuitive and solve real problems for users. I believe that good design should be invisible - users shouldn't have to think about how to use a product.

    I'm really proficient in Figma, which is my primary design tool. I also do a lot of user research and prototyping to validate my designs before they go to development.

    One of the challenges I face is getting stakeholders to understand the importance of user testing. Sometimes they want to skip that step to save time, but it always ends up causing problems later.
    """


@pytest.mark.asyncio
async def test_link_evidence_to_attributes(service, mock_llm_service, sample_attributes, sample_text):
    """Test linking evidence to attributes."""
    # Mock LLM response with fixed quotes for all attributes
    mock_llm_service.analyze.return_value = [
        "I've been working as a product designer for about 8 years now. I'm 34 years old and I specialize in UX/UI design.",
        "My main goal is to create interfaces that are intuitive and solve real problems for users.",
        "I'm really proficient in Figma, which is my primary design tool. I also do a lot of user research and prototyping to validate my designs before they go to development."
    ]

    # Patch the _find_quotes_with_regex method to ensure it's not used
    with patch.object(service, '_find_quotes_with_regex') as mock_find_quotes:
        mock_find_quotes.return_value = []

        # Call the service
        result = await service.link_evidence_to_attributes(sample_attributes, sample_text)

        # Verify the result
        assert "demographics" in result
        assert len(result["demographics"]["evidence"]) > 0

        assert "goals_and_motivations" in result
        assert len(result["goals_and_motivations"]["evidence"]) > 0

        assert "skills_and_expertise" in result
        assert len(result["skills_and_expertise"]["evidence"]) > 0

        # Verify LLM was called
        assert mock_llm_service.analyze.call_count >= 3

        # Verify regex fallback was not used
        mock_find_quotes.assert_not_called()


@pytest.mark.asyncio
async def test_link_evidence_fallback_to_regex(service, mock_llm_service, sample_attributes, sample_text):
    """Test fallback to regex when LLM fails."""
    # Mock LLM response to fail
    mock_llm_service.analyze.return_value = None

    # Patch the _find_quotes_with_regex method to return test quotes
    with patch.object(service, '_find_quotes_with_regex') as mock_find_quotes:
        mock_find_quotes.side_effect = lambda trait_value, full_text: {
            "34-year-old female with 8 years of experience in UX/UI design": [
                "I've been working as a product designer for about 8 years now. I'm 34 years old and I specialize in UX/UI design."
            ],
            "Creating intuitive interfaces that solve real user problems": [
                "My main goal is to create interfaces that are intuitive and solve real problems for users."
            ],
            "Proficient in Figma, user research, and prototyping": [
                "I'm really proficient in Figma, which is my primary design tool. I also do a lot of user research and prototyping to validate my designs before they go to development."
            ]
        }.get(trait_value, [])

        # Call the service
        result = await service.link_evidence_to_attributes(sample_attributes, sample_text)

        # Verify the result
        assert "demographics" in result
        assert len(result["demographics"]["evidence"]) > 0
        assert "34" in result["demographics"]["evidence"][0]

        assert "goals_and_motivations" in result
        assert len(result["goals_and_motivations"]["evidence"]) > 0
        assert "intuitive" in result["goals_and_motivations"]["evidence"][0]

        assert "skills_and_expertise" in result
        assert len(result["skills_and_expertise"]["evidence"]) > 0
        assert "Figma" in result["skills_and_expertise"]["evidence"][0]

        # Verify regex fallback was called
        assert mock_find_quotes.call_count >= 3


@pytest.mark.asyncio
async def test_find_relevant_quotes(service, mock_llm_service, sample_text):
    """Test finding relevant quotes."""
    # Mock LLM response
    mock_llm_service.analyze.return_value = [
        "I've been working as a product designer for about 8 years now. I'm 34 years old and I specialize in UX/UI design."
    ]

    # Call the method
    quotes = await service._find_relevant_quotes("demographics", "34-year-old with 8 years of experience", sample_text)

    # Verify the result
    assert len(quotes) > 0
    assert "34" in quotes[0]
    assert "8 years" in quotes[0]


@pytest.mark.asyncio
async def test_parse_llm_response_list(service):
    """Test parsing LLM response as a list."""
    # Test with a list response
    response = ["Quote 1", "Quote 2"]
    result = service._parse_llm_response(response)
    assert result == ["Quote 1", "Quote 2"]


@pytest.mark.asyncio
async def test_parse_llm_response_json_string(service):
    """Test parsing LLM response as a JSON string."""
    # Test with a JSON string response
    response = json.dumps(["Quote 1", "Quote 2"])
    result = service._parse_llm_response(response)
    assert result == ["Quote 1", "Quote 2"]


@pytest.mark.asyncio
async def test_parse_llm_response_text(service):
    """Test parsing LLM response as text."""
    # Test with a text response containing quotes
    response = 'Here are some quotes: "Quote 1" and "Quote 2"'
    result = service._parse_llm_response(response)
    assert len(result) == 2
    assert "Quote 1" in result
    assert "Quote 2" in result


@pytest.mark.asyncio
async def test_find_quotes_with_regex(service, sample_text):
    """Test finding quotes with regex."""
    # Call the method with a term that definitely appears in the sample text
    quotes = service._find_quotes_with_regex("product designer", sample_text)

    # Verify the result
    assert len(quotes) > 0
    assert any("product designer" in quote.lower() for quote in quotes)
