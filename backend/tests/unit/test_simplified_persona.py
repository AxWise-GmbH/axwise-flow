#!/usr/bin/env python3
"""
Test SimplifiedPersona with PydanticAI to verify it works without MALFORMED_FUNCTION_CALL errors.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Load environment variables
from dotenv import load_dotenv

load_dotenv()


async def test_simplified_persona():
    """Test SimplifiedPersona generation with PydanticAI."""

    print("🧪 TESTING SIMPLIFIED PERSONA WITH PYDANTIC AI")
    print("=" * 80)

    try:
        # Import required modules
        from pydantic_ai import Agent
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider
        from backend.models.enhanced_persona_models import SimplifiedPersonaModel

        print("✅ Imports successful")

        # Initialize Gemini model
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ GEMINI_API_KEY not found")
            return

        print(f"✅ API key found: {api_key[:10]}...")

        # Create Gemini model
        provider = GoogleProvider(api_key=api_key)
        gemini_model = GoogleModel("models/gemini-3.5-flash", provider=provider)
        print("✅ Gemini model initialized")

        # Create PydanticAI agent with SimplifiedPersona
        agent = Agent(
            model=gemini_model,
            output_type=SimplifiedPersonaModel,
            system_prompt="""You are an expert persona analyst. Create a detailed persona from the provided interview content.

TASK: Analyze the content and create a comprehensive SimplifiedPersona.

FIELDS TO POPULATE:
- name: Descriptive persona name
- description: Brief persona overview
- archetype: Persona category
- demographics: Age, background, experience
- goals_motivations: What drives them
- challenges_frustrations: Main challenges
- skills_expertise: Professional skills
- technology_tools: Tech usage patterns
- pain_points: Specific problems
- workflow_environment: Work style
- needs_expectations: What they need
- key_quotes: 3-5 actual quotes
- Confidence scores for each field

RULES:
1. Use specific details, not generic text
2. Extract real quotes
3. Set realistic confidence scores
4. Make it feel like a real person

OUTPUT: Complete SimplifiedPersona object.""",
        )
        print("✅ PydanticAI agent created")

        # Test content
        test_content = """
        Interview with Alex, a software engineer:

        "I'm really frustrated with how these pricing algorithms work. It feels like they're constantly trying to trick me based on what device I'm using. I spend way too much time manually checking prices on different browsers just to make sure I'm not getting ripped off."

        "As a junior engineer in San Francisco, every dollar counts. I've developed some pretty sophisticated methods for detecting price discrimination, but it's exhausting. I wish there was a tool that could do this automatically."

        "I love sharing these tricks with my colleagues. There's something satisfying about outsmarting these exploitative systems. But honestly, I'd rather spend my time on actual engineering work instead of playing these games."

        "The worst part is never knowing if you can trust the price you're seeing. Are they showing me the real price, or are they inflating it because they think I can afford more? It makes every online purchase feel like a negotiation."

        "I work remotely most of the time, so I'm always online shopping. Having a reliable way to ensure fair pricing would be a game-changer for my workflow and peace of mind."
        """

        print("🎯 Testing persona generation...")

        # Generate persona
        result = await agent.run(test_content)

        print("✅ Generation completed successfully!")
        print(f"🔍 Result type: {type(result.output)}")

        # Display the generated persona
        persona = result.output
        print("\n📊 GENERATED SIMPLIFIED PERSONA:")
        print("-" * 50)
        print(f"Name: {persona.name}")
        print(f"Description: {persona.description}")
        print(f"Archetype: {persona.archetype}")
        print(f"Overall Confidence: {persona.overall_confidence:.1%}")
        print(
            f"\nDemographics ({persona.demographics_confidence:.1%}): {persona.demographics}"
        )
        print(
            f"\nGoals & Motivations ({persona.goals_confidence:.1%}): {persona.goals}"
        )
        print(
            f"\nChallenges ({persona.challenges_confidence:.1%}): {persona.challenges}"
        )
        print(f"\nKey Quotes: {persona.key_quotes.value}")

        print("\n🎉 SIMPLIFIED PERSONA TEST PASSED!")
        return True

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_simplified_persona())
    sys.exit(0 if success else 1)
