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
    with patch.object(instructor_client, 'async_instructor_client') as mock_client:
        # Create a mock persona
        mock_persona = Persona(
            name="Test Persona",
            description="A test persona",
            archetype="Tester",
            demographics=PersonaTrait(
                value="25-34 years old", 
                confidence=0.8,
                evidence=["Evidence 1", "Evidence 2"]
            ),
            goals_and_motivations=PersonaTrait(
                value="Testing software", 
                confidence=0.9,
                evidence=["Evidence 3"]
            )
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
        assert result.description == "A test persona"
        assert result.archetype == "Tester"
        assert result.demographics.value == "25-34 years old"
        assert result.demographics.confidence == 0.8
        assert result.demographics.evidence == ["Evidence 1", "Evidence 2"]
        assert result.goals_and_motivations.value == "Testing software"
        assert result.goals_and_motivations.confidence == 0.9
        assert result.goals_and_motivations.evidence == ["Evidence 3"]

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
    
    # Mock the Instructor client
    mock_instructor_client = MagicMock()
    service._instructor_client = mock_instructor_client
    
    # Create a mock persona
    mock_persona = Persona(
        name="Test Persona",
        description="A test persona",
        archetype="Tester",
        demographics=PersonaTrait(
            value="25-34 years old", 
            confidence=0.8,
            evidence=["Evidence 1", "Evidence 2"]
        )
    )
    mock_instructor_client.generate_with_model_async.return_value = mock_persona
    
    # Call the method
    result = await service._generate_persona_from_attributes_with_instructor(
        attributes={"key": "value"},
        transcript_id="test-transcript"
    )
    
    # Verify the result
    assert result["name"] == "Test Persona"
    assert result["description"] == "A test persona"
    assert result["archetype"] == "Tester"
    assert result["demographics"]["value"] == "25-34 years old"
    assert result["demographics"]["confidence"] == 0.8
    assert result["demographics"]["evidence"] == ["Evidence 1", "Evidence 2"]

@pytest.mark.asyncio
async def test_analyze_patterns_for_persona_with_instructor():
    """Test the _analyze_patterns_for_persona method with Instructor."""
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
    
    # Mock the Instructor client
    mock_instructor_client = MagicMock()
    service._instructor_client = mock_instructor_client
    
    # Create a mock persona
    mock_persona = Persona(
        name="Pattern-Based Persona",
        description="A persona based on patterns",
        archetype="Pattern User",
        demographics=PersonaTrait(
            value="35-44 years old", 
            confidence=0.7,
            evidence=["Pattern Evidence 1"]
        )
    )
    mock_instructor_client.generate_with_model_async.return_value = mock_persona
    
    # Mock the prompt generator
    service.prompt_generator = MagicMock()
    service.prompt_generator.create_pattern_prompt.return_value = "Test prompt"
    
    # Call the method with test patterns
    test_patterns = [
        {"name": "Pattern 1", "description": "Description 1", "evidence": ["Evidence 1"]},
        {"name": "Pattern 2", "description": "Description 2", "evidence": ["Evidence 2"]}
    ]
    result = await service._analyze_patterns_for_persona(test_patterns)
    
    # Verify the result
    assert result["name"] == "Pattern-Based Persona"
    assert result["description"] == "A persona based on patterns"
    assert result["archetype"] == "Pattern User"
    assert result["demographics"]["value"] == "35-44 years old"
    assert result["demographics"]["confidence"] == 0.7
    assert result["demographics"]["evidence"] == ["Pattern Evidence 1"]
