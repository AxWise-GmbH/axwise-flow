"""
Tests for the simplified persona formation process.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.llm.prompts.tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts
from backend.services.processing.persona_builder import PersonaBuilder, persona_to_dict


class TestSimplifiedPersonaFormation:
    """Tests for the simplified persona formation process."""

    @pytest.fixture
    def mock_llm_service(self):
        """Create a mock LLM service."""
        mock_service = AsyncMock()
        mock_service.analyze = AsyncMock()
        return mock_service

    @pytest.fixture
    def persona_builder(self):
        """Create a PersonaBuilder instance."""
        return PersonaBuilder()

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

    @pytest.mark.asyncio
    async def test_persona_builder_with_simplified_attributes(self, persona_builder):
        """Test building a persona from simplified attributes."""
        # Create simplified attributes
        simplified_attributes = {
            "name": "Product Manager",
            "description": "A product manager focused on user experience.",
            "role_context": "Works in a cross-functional team.",
            "key_responsibilities": "Defining product requirements.",
            "tools_used": "JIRA, Figma, Google Analytics",
            "collaboration_style": "Collaborative and inclusive.",
            "analysis_approach": "Data-driven decision making.",
            "pain_points": "Lack of developer resources.",
            "archetype": "Product Leader",
            "demographics": "35-45 years old, 10+ years experience",
            "goals_and_motivations": "Creating impactful products.",
            "skills_and_expertise": "Product strategy, user research",
            "workflow_and_environment": "Agile methodology.",
            "challenges_and_frustrations": "Balancing stakeholder needs.",
            "needs_and_desires": "Better analytics tools.",
            "technology_and_tools": "Project management software.",
            "attitude_towards_research": "Values user research highly.",
            "attitude_towards_ai": "Sees AI as an opportunity.",
            "key_quotes": ["User experience is paramount.", "We need to focus on metrics."],
            "overall_confidence_score": 0.85
        }
        
        # Build persona
        persona = persona_builder.build_persona_from_attributes(simplified_attributes, role="Interviewee")
        
        # Convert to dict for easier assertions
        persona_dict = persona_to_dict(persona)
        
        # Verify the persona
        assert persona_dict["name"] == "Product Manager"
        assert persona_dict["description"] == "A product manager focused on user experience."
        assert persona_dict["role_context"]["value"] == "Works in a cross-functional team."
        assert persona_dict["key_responsibilities"]["value"] == "Defining product requirements."
        assert persona_dict["tools_used"]["value"] == "JIRA, Figma, Google Analytics"
        assert persona_dict["archetype"] == "Product Leader"
        assert persona_dict["role_in_interview"] == "Interviewee"
        assert persona_dict["overall_confidence"] > 0.8  # Should be close to the overall_confidence_score
        
        # Verify that key_quotes are used as evidence
        assert len(persona_dict["key_quotes"]["evidence"]) == 2
        assert "User experience is paramount." in persona_dict["key_quotes"]["evidence"]
        assert "We need to focus on metrics." in persona_dict["key_quotes"]["evidence"]
