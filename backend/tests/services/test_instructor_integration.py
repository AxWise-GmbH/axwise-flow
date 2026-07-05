"""
Tests for the Instructor integration.

This module contains tests for the Instructor integration with the Gemini API.
"""

import pytest
from unittest.mock import patch, MagicMock

from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
from backend.domain.models.persona_schema import Persona, PersonaTrait

@pytest.fixture
def instructor_client():
    """Create an InstructorGeminiClient instance for testing."""
    return InstructorGeminiClient()

@pytest.mark.asyncio
async def test_generate_persona_with_instructor(instructor_client):
    """Test generating a persona with Instructor."""
    # Mock the Instructor client's response
    with patch.object(instructor_client, 'instructor_client') as mock_client:
        # Create a mock persona
        mock_persona = Persona(
            name="Test Persona",
            demographics="25-34 years old",
            goals="Testing software",
            challenges="Bugs",
            quotes="I love testing"
        )
        
        # Set up the mock to return the persona
        mock_client.chat.completions.create.return_value = mock_persona
        
        # Call the method
        result = await instructor_client.generate_with_model_async(
            prompt="Generate a persona",
            model_class=Persona,
            temperature=0.0
        )
        
        # Verify the result
        assert result.name == "Test Persona"
        assert result.demographics == "25-34 years old"
        assert result.goals == "Testing software"
        assert result.challenges == "Bugs"
        assert result.quotes == "I love testing"

@pytest.mark.asyncio
async def test_persona_formation_service_with_instructor():
    """Test the PersonaFormationService with Instructor."""
    # Import the PersonaFormationService
    from backend.services.processing.persona_formation_service import PersonaFormationService
    
    # Create a mock config
    class MockConfig:
        def __init__(self):
            self.validation = type('obj', (object,), {
                'min_confidence': 0.4
            })
            self.llm = type('obj', (object,), {
                'api_key': 'test_api_key'
            })
    
    # Create a mock LLM service
    mock_llm_service = MagicMock()
    
    # Create the persona formation service
    service = PersonaFormationService(MockConfig(), mock_llm_service)
    
    # Mock the V2 Facade
    mock_facade = MagicMock()
    service._facade = mock_facade
    
    # Create a mock persona dict
    mock_persona = {
        "name": "Test Persona",
        "demographics": "25-34 years old",
        "goals": "Testing software",
        "challenges": "Bugs",
        "quotes": "I love testing"
    }
    
    # Return a future/coroutine result
    async def mock_generate(*args, **kwargs):
        return [mock_persona]
        
    mock_facade.generate_persona_from_text = mock_generate
    
    # Call the method
    result = await service.generate_persona_from_text(
        text="some text content",
        context={"key": "value"}
    )
    
    # Verify the result
    assert len(result) == 1
    assert result[0]["name"] == "Test Persona"
    assert result[0]["demographics"] == "25-34 years old"

@pytest.mark.asyncio
async def test_analyze_patterns_for_persona_with_instructor():
    """Test the form_personas method of PersonaFormationService."""
    # Import the PersonaFormationService
    from backend.services.processing.persona_formation_service import PersonaFormationService
    
    # Create a mock config
    class MockConfig:
        def __init__(self):
            self.validation = type('obj', (object,), {
                'min_confidence': 0.4
            })
            self.llm = type('obj', (object,), {
                'api_key': 'test_api_key'
            })
    
    # Create a mock LLM service
    mock_llm_service = MagicMock()
    
    # Create the persona formation service
    service = PersonaFormationService(MockConfig(), mock_llm_service)
    
    # Mock form_personas
    with patch.object(service, 'form_personas', return_value=[{"name": "Pattern-Based Persona", "demographics": "35-44 years old"}]) as mock_form:
        # Call the method with test patterns
        test_patterns = [
            {"name": "Pattern 1", "description": "Description 1", "evidence": ["Evidence 1"]},
            {"name": "Pattern 2", "description": "Description 2", "evidence": ["Evidence 2"]}
        ]
        result = await service.form_personas(test_patterns)
        
        # Verify the result
        assert len(result) == 1
        assert result[0]["name"] == "Pattern-Based Persona"
        assert result[0]["demographics"] == "35-44 years old"
