"""
Test the refactored persona formation service.
"""

import sys
import os
import logging
import json
import asyncio
import pytest
from typing import Dict, Any, List

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add the parent directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import the refactored modules
from services.processing.persona_formation_service import PersonaFormationService
from services.processing.transcript_structuring_service import TranscriptStructuringService
from services.processing.attribute_extractor import AttributeExtractor
from services.processing.persona_builder import PersonaBuilder
from services.processing.prompts import PromptGenerator


class MockLLMService:
    """Mock LLM service for testing."""

    async def analyze(self, data: Dict[str, Any]) -> str:
        """Mock analyze method that returns a predefined response."""
        logger.info(f"MockLLMService.analyze called with task: {data.get('task')}")

        if data.get("task") == "transcript_structuring":
            # Return a structured transcript
            return json.dumps([
                {
                    "speaker_id": "Interviewer",
                    "role": "Interviewer",
                    "dialogue": "Tell me about your role."
                },
                {
                    "speaker_id": "Interviewee",
                    "role": "Interviewee",
                    "dialogue": "I'm a software developer working on web applications."
                },
                {
                    "speaker_id": "Interviewer",
                    "role": "Interviewer",
                    "dialogue": "What technologies do you use?"
                },
                {
                    "speaker_id": "Interviewee",
                    "role": "Interviewee",
                    "dialogue": "I primarily use Python, JavaScript, and React."
                }
            ])

        # Return a mock persona JSON
        return json.dumps({
            "name": "Test Persona",
            "description": "A test persona for unit testing",
            "archetype": "Test Subject",
            "demographics": {
                "value": "Test demographics",
                "confidence": 0.8,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "goals_and_motivations": {
                "value": "Test goals",
                "confidence": 0.7,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "skills_and_expertise": {
                "value": "Test skills",
                "confidence": 0.9,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "role_context": {
                "value": "Test role context",
                "confidence": 0.8,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "key_responsibilities": {
                "value": "Test responsibilities",
                "confidence": 0.7,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "tools_used": {
                "value": "Test tools",
                "confidence": 0.6,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "collaboration_style": {
                "value": "Test collaboration",
                "confidence": 0.7,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "analysis_approach": {
                "value": "Test approach",
                "confidence": 0.8,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "pain_points": {
                "value": "Test pain points",
                "confidence": 0.7,
                "evidence": ["Evidence 1", "Evidence 2"]
            },
            "patterns": ["Pattern 1", "Pattern 2"],
            "confidence": 0.8,
            "evidence": ["Overall evidence 1", "Overall evidence 2"]
        })


class MockConfig:
    """Mock configuration for testing."""

    def __init__(self):
        self.validation = type("obj", (object,), {"min_confidence": 0.4})
        self.llm = type("obj", (object,), {"provider": "test", "model": "test-model"})


@pytest.mark.asyncio
async def test_persona_formation_service():
    """Test the PersonaFormationService."""
    # Create mock objects
    config = MockConfig()
    llm_service = MockLLMService()

    # Create the service
    service = PersonaFormationService(config, llm_service)

    # Test generating a persona from text
    text = """
    Interviewer: Tell me about your role.
    Interviewee: I'm a software developer working on web applications.
    Interviewer: What technologies do you use?
    Interviewee: I primarily use Python, JavaScript, and React.
    Interviewer: What challenges do you face?
    Interviewee: The biggest challenge is dealing with legacy code that's poorly documented.
    """

    personas = await service.generate_persona_from_text(text)

    # Check the result
    assert personas is not None
    assert len(personas) > 0
    assert "name" in personas[0]
    assert personas[0]["name"] == "Test Persona"


@pytest.mark.asyncio
async def test_transcript_structuring_service():
    """Test the TranscriptStructuringService."""
    # Create the service with a mock LLM service
    llm_service = MockLLMService()
    service = TranscriptStructuringService(llm_service)

    # Test structuring a transcript
    text = """
    Interviewer: Tell me about your role.
    Interviewee: I'm a software developer working on web applications.
    Interviewer: What technologies do you use?
    Interviewee: I primarily use Python, JavaScript, and React.
    """

    structured_transcript = await service.structure_transcript(text)

    # Check the result
    assert structured_transcript is not None
    assert len(structured_transcript) > 0
    assert "speaker_id" in structured_transcript[0]
    assert "role" in structured_transcript[0]
    assert "dialogue" in structured_transcript[0]


if __name__ == "__main__":
    # Run the tests directly
    pytest.main(["-v", __file__])
