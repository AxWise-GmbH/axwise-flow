#!/usr/bin/env python3
"""
Test script to debug PydanticAI persona generation issues.
"""

import sys
import os
import asyncio
import json

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))


async def test_pydantic_ai_import():
    """Test if PydanticAI can be imported and initialized."""
    print("🔍 TESTING PYDANTIC AI IMPORT AND INITIALIZATION")
    print("=" * 60)

    try:
        # Test PydanticAI import
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel

        print("✅ PydanticAI imports successful")

        # Test Persona schema import
        from backend.domain.models.persona_schema import Persona as PersonaModel

        print("✅ Persona schema import successful")

        # Test Gemini model initialization
        gemini_model = GeminiModel("gemini-2.5-flash")
        print("✅ Gemini model initialization successful")

        # Test agent creation
        agent = Agent(
            model=gemini_model,
            output_type=PersonaModel,
            system_prompt="You are a test agent.",
        )
        print("✅ PydanticAI agent creation successful")

        return True

    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Initialization error: {e}")
        import traceback

        traceback.print_exc()
        return False


async def test_persona_formation_service():
    """Test the persona formation service initialization."""
    print("\n🔍 TESTING PERSONA FORMATION SERVICE")
    print("=" * 60)

    try:
        from backend.services.processing.persona_formation_service import (
            PersonaFormationService,
        )
        from backend.services.llm import LLMServiceFactory

        # Create LLM service
        llm_service = LLMServiceFactory.create("gemini")
        print("✅ LLM service created")

        # Create persona formation service
        service = PersonaFormationService(llm_service)
        print("✅ Persona formation service created")

        # Check if PydanticAI is available
        print(f"PydanticAI available: {service.pydantic_ai_available}")
        print(f"Persona agent: {service.persona_agent}")

        if not service.pydantic_ai_available:
            print("❌ PydanticAI is not available in the service")
            return False

        return True

    except Exception as e:
        print(f"❌ Service initialization error: {e}")
        import traceback

        traceback.print_exc()
        return False


async def test_simple_persona_generation():
    """Test simple persona generation with PydanticAI."""
    print("\n🔍 TESTING SIMPLE PERSONA GENERATION")
    print("=" * 60)

    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        from backend.domain.models.persona_schema import Persona as PersonaModel

        # Create agent
        gemini_model = GeminiModel("gemini-2.5-flash")
        agent = Agent(
            model=gemini_model,
            output_type=PersonaModel,
            system_prompt="""You are an expert persona analyst. Create a detailed persona from the provided text.

CRITICAL REQUIREMENTS:
1. Extract specific, detailed information from the text
2. Use actual quotes as evidence for each trait
3. Set confidence based on evidence strength
4. Create personas that feel like real, specific people
5. NEVER use generic defaults like "Professional goals and motivations"

Each PersonaTrait must have:
- value: Detailed, specific description based on evidence
- confidence: 0.0-1.0 based on strength of evidence
- evidence: List of actual quotes/statements supporting this trait""",
        )

        # Test with sample text
        test_text = """
        INTERVIEW WITH SARAH JOHNSON

        Q: What are your main challenges in your role?
        A: As a product manager, I'm constantly juggling multiple priorities. The biggest challenge is getting reliable data to make decisions. Our current analytics tools are fragmented, and I spend way too much time just trying to understand what's happening with our users.

        Q: What would an ideal solution look like?
        A: I need a unified dashboard that gives me real-time insights into user behavior, feature adoption, and business metrics. Something that doesn't require me to be a data scientist to understand.

        Q: How do you currently make product decisions?
        A: Honestly, it's a mix of gut feeling and whatever data I can cobble together from different sources. I'd love to be more data-driven, but the tools make it so difficult.
        """

        prompt = f"""
        Analyze this interview transcript and create a comprehensive persona:

        {test_text}

        Focus on extracting specific details about this person's role, challenges, goals, and needs based on their actual statements.
        """

        print("🚀 Calling PydanticAI agent...")
        result = await agent.run(prompt, model_settings={"temperature": 0.0})

        print("✅ PydanticAI call successful!")
        print(f"Result type: {type(result)}")
        print(f"Output type: {type(result.output)}")

        # Extract persona data
        persona_data = result.output
        print(f"Persona name: {persona_data.name}")
        print(f"Persona description: {persona_data.description[:100]}...")

        # Check key fields
        if persona_data.demographics:
            print(f"Demographics value: {persona_data.demographics.value[:100]}...")
            print(f"Demographics confidence: {persona_data.demographics.confidence}")
            print(
                f"Demographics evidence count: {len(persona_data.demographics.evidence)}"
            )

        if persona_data.key_quotes:
            print(f"Key quotes value: {persona_data.key_quotes.value[:100]}...")
            print(f"Key quotes evidence count: {len(persona_data.key_quotes.evidence)}")
            if persona_data.key_quotes.evidence:
                print(f"Sample quote: {persona_data.key_quotes.evidence[0][:100]}...")

        # Convert to dict
        persona_dict = persona_data.model_dump()
        print(f"Dictionary keys: {list(persona_dict.keys())}")

        return True

    except Exception as e:
        print(f"❌ Persona generation error: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("🧪 PYDANTIC AI PERSONA GENERATION DEBUG")
    print("=" * 80)

    # Test 1: Import and initialization
    import_success = await test_pydantic_ai_import()

    # Test 2: Service initialization
    service_success = await test_persona_formation_service()

    # Test 3: Simple generation
    generation_success = await test_simple_persona_generation()

    print(f"\n📊 TEST RESULTS")
    print("=" * 60)
    print(f"Import/Initialization: {'✅ PASS' if import_success else '❌ FAIL'}")
    print(f"Service Initialization: {'✅ PASS' if service_success else '❌ FAIL'}")
    print(f"Persona Generation: {'✅ PASS' if generation_success else '❌ FAIL'}")

    if all([import_success, service_success, generation_success]):
        print("\n🎉 All tests passed! PydanticAI should be working.")
    else:
        print("\n⚠️ Some tests failed. PydanticAI has issues that need fixing.")


if __name__ == "__main__":
    asyncio.run(main())
