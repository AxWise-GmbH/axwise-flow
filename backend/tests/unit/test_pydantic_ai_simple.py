#!/usr/bin/env python3
"""
Simple test to verify PydanticAI is working with Gemini.
"""

import asyncio
import os
import sys
from typing import List
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Load environment variables
from dotenv import load_dotenv

load_dotenv()


class SimplePersona(BaseModel):
    name: str
    age: int
    background: str
    motivation: str


async def test_pydantic_ai():
    """Test basic PydanticAI functionality."""

    print("🧪 Testing PydanticAI with Gemini...")

    # Check API key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found")
        return False

    print(f"✅ API key found: {api_key[:10]}...")

    try:
        # Initialize GoogleModel
        print("🔧 Initializing GoogleModel...")
        provider = GoogleProvider(api_key=api_key)
        model = GoogleModel("models/gemini-3.8-flash", provider=provider)
        print("✅ GoogleModel initialized successfully")

        # Create agent
        print("🤖 Creating PydanticAI agent...")
        agent = Agent(
            model=model,
            output_type=List[SimplePersona],
            system_prompt="You are a persona generator. Create realistic customer personas.",
        )
        print("✅ Agent created")

        # Test generation
        print("🎯 Testing persona generation...")
        prompt = """
        Create 2 simple personas for a coffee shop business:
        - One regular customer
        - One occasional customer

        Each persona should have name, age, background, and motivation.
        """

        result = await agent.run(prompt)
        print(f"✅ Generation completed: {result}")

        # Use result.output (result.data is deprecated)
        print(f"🔍 result.output: {result.output}")
        print(f"🔍 result.output type: {type(result.output)}")

        personas = result.output
        print(f"📊 Generated {len(personas)} personas:")

        for i, persona in enumerate(personas, 1):
            print(f"  {i}. {persona.name} ({persona.age}) - {persona.background}")
            print(f"     Motivation: {persona.motivation}")

        return len(personas) > 0

    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_pydantic_ai())
    if success:
        print("\n🎉 PydanticAI test PASSED!")
    else:
        print("\n💥 PydanticAI test FAILED!")
        sys.exit(1)
