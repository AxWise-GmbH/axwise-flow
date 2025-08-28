#!/usr/bin/env python3
"""
Simple test to verify Instructor integration with Google GenAI.
"""

import os
import sys
import asyncio
from pydantic import BaseModel
from typing import List

# Add the project root to the path
sys.path.append('/Users/admin/Documents/DesignThinkingAgentAI')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from backend.services.llm.instructor_gemini_client import InstructorGeminiClient

class SimpleStakeholder(BaseModel):
    name: str
    description: str

class SimpleStakeholderList(BaseModel):
    stakeholders: List[SimpleStakeholder]

async def test_instructor():
    """Test basic Instructor functionality."""

    print("🧪 Testing Instructor Integration with Google GenAI")
    print("=" * 60)

    try:
        # Initialize the client
        print("1. Initializing Instructor client...")
        client = InstructorGeminiClient()
        print("✅ Client initialized successfully")

        # Simple test prompt
        prompt = """
        For a coffee shop business, identify 3 key stakeholders.
        Return them as a list with names and descriptions.
        """

        print("2. Testing structured output generation...")

        # Test the generation (without extra parameters)
        result = await client.generate_with_model_async(
            prompt=prompt,
            model_class=SimpleStakeholderList,
            system_instruction="You are a business analyst."
        )

        print("✅ Generation successful!")
        print(f"📊 Result: {result}")
        print(f"📊 Type: {type(result)}")
        print(f"📊 Stakeholders count: {len(result.stakeholders)}")

        for i, stakeholder in enumerate(result.stakeholders, 1):
            print(f"   {i}. {stakeholder.name}: {stakeholder.description}")

        return True

    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_instructor())
    if success:
        print("\n🎉 Instructor integration test PASSED!")
    else:
        print("\n💥 Instructor integration test FAILED!")
        sys.exit(1)
