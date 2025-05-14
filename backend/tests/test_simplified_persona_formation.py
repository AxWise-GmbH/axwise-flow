"""
Tests for the simplified persona formation process.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.llm.prompts.tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts


class TestSimplifiedPersonaFormation:
    """Tests for the simplified persona formation process."""

    @pytest.fixture
    def mock_llm_service(self):
        """Create a mock LLM service."""
        mock_service = AsyncMock()
        mock_service.analyze = AsyncMock()
        return mock_service

    # The persona_builder fixture has been removed as it's no longer needed
    # and is now in the dedicated test files for PersonaBuilder

    def test_simplified_prompt_standard(self):
        """Test the standard simplified persona formation prompt."""
        # Test data
        text_sample = "This is a sample interview text."
        role = "Interviewer"

        # Get the prompt
        prompt = SimplifiedPersonaFormationPrompts.standard_prompt(text_sample, role)

        # Verify the prompt
        assert "CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON object" in prompt
        assert f"analyze the provided text from a {role.upper()}" in prompt
        assert text_sample in prompt
        assert "FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT" in prompt
        assert "overall_confidence_score" in prompt

    def test_simplified_prompt_industry_specific(self):
        """Test the industry-specific simplified persona formation prompt."""
        # Test data
        text_sample = "This is a sample interview text."
        role = "Interviewee"
        industry = "Healthcare"
        industry_guidance = "Focus on clinical workflows and patient care."

        # Get the prompt
        prompt = SimplifiedPersonaFormationPrompts.industry_specific_prompt(
            industry, industry_guidance, text_sample, role
        )

        # Verify the prompt
        assert "CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON object" in prompt
        assert f"analyze the provided text from a {role.upper()}" in prompt
        assert text_sample in prompt
        assert industry.upper() in prompt
        assert industry_guidance in prompt
        assert "FORMAT YOUR RESPONSE AS A SINGLE JSON OBJECT" in prompt
        assert "overall_confidence_score" in prompt

    def test_get_prompt_with_direct_prompt(self):
        """Test get_prompt with a direct prompt provided."""
        # Test data
        direct_prompt = "This is a direct prompt."
        data = {"prompt": direct_prompt}

        # Get the prompt
        prompt = SimplifiedPersonaFormationPrompts.get_prompt(data)

        # Verify the prompt is the direct prompt
        assert prompt == direct_prompt

    def test_get_prompt_with_industry(self):
        """Test get_prompt with industry provided."""
        # Test data
        data = {
            "industry": "Healthcare",
            "role": "Interviewer",
            "text": "This is a sample interview text."
        }

        # Mock the industry guidance
        with patch("backend.services.llm.prompts.industry_guidance.IndustryGuidance.get_persona_guidance") as mock_get_guidance:
            mock_get_guidance.return_value = "Focus on clinical workflows and patient care."

            # Get the prompt
            prompt = SimplifiedPersonaFormationPrompts.get_prompt(data)

            # Verify the prompt
            assert "HEALTHCARE" in prompt
            assert "Focus on clinical workflows and patient care." in prompt

    def test_get_prompt_standard(self):
        """Test get_prompt with standard data."""
        # Test data
        data = {
            "role": "Interviewee",
            "text": "This is a sample interview text."
        }

        # Get the prompt
        prompt = SimplifiedPersonaFormationPrompts.get_prompt(data)

        # Verify the prompt
        assert "INTERVIEWEE" in prompt
        assert "This is a sample interview text." in prompt

    # Note: The test_persona_builder_with_simplified_attributes method has been moved to
    # backend/test_persona_builder_manual.py and backend/test_persona_pipeline_integration.py
    # which provide more comprehensive testing of the PersonaBuilder with simplified attributes.
