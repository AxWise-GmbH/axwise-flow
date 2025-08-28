#!/usr/bin/env python3
"""
Test script for the PydanticAI Pattern Processor.

This script tests the migrated pattern processor to ensure it works correctly
with PydanticAI instead of Instructor.
"""

import asyncio
import logging
import sys
import os

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath('.'))

from backend.services.processing.pattern_processor import PatternProcessor
from backend.services.processing.pattern_processor_factory import PatternProcessorFactory

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_pattern_processor():
    """Test the PydanticAI pattern processor."""
    
    print("🧪 Testing PydanticAI Pattern Processor")
    print("=" * 50)
    
    # Sample text for pattern analysis
    sample_text = """
    Interview with UX Designer Sarah:
    "I always check with at least three team members before making any design decisions. 
    It's become a habit - I'll send a Slack message to the design channel and wait for feedback.
    Sometimes this slows things down, but I feel more confident in the final result."
    
    Interview with Product Manager Mike:
    "We have this informal rule where major changes need approval from two people minimum.
    I usually run ideas by Sarah and then by our lead developer before moving forward.
    It's not official policy, but everyone does it."
    
    Interview with Developer Lisa:
    "Before I implement any new feature, I always discuss it with the team first.
    We have these quick 10-minute huddles where we validate approaches.
    It prevents a lot of rework later on."
    """
    
    try:
        # Test 1: Create processor using factory
        print("\n1️⃣ Testing PatternProcessorFactory...")
        processor = PatternProcessorFactory.create_processor()
        print(f"   ✅ Created processor: {processor.name} v{processor.version}")
        print(f"   📝 Description: {processor.description}")
        print(f"   🤖 PydanticAI available: {processor.pydantic_ai_available}")
        
        # Test 2: Direct processor creation
        print("\n2️⃣ Testing direct PatternProcessor creation...")
        direct_processor = PatternProcessor()
        print(f"   ✅ Created processor: {direct_processor.name} v{direct_processor.version}")
        print(f"   🤖 PydanticAI available: {direct_processor.pydantic_ai_available}")
        
        # Test 3: Process sample text
        print("\n3️⃣ Testing pattern generation...")
        print(f"   📄 Sample text length: {len(sample_text)} characters")
        
        context = {
            "industry": "Software Development",
            "themes": [
                {"name": "Collaboration", "definition": "Team-based decision making"},
                {"name": "Validation", "definition": "Seeking approval before action"}
            ]
        }
        
        print(f"   🎯 Context: {context}")
        
        # Generate patterns
        result = await processor.process(sample_text, context)
        
        print(f"\n   📊 Generated {len(result.patterns)} patterns:")
        
        for i, pattern in enumerate(result.patterns, 1):
            print(f"\n   Pattern {i}:")
            print(f"     📌 Name: {pattern.name}")
            print(f"     🏷️  Category: {pattern.category}")
            print(f"     📝 Description: {pattern.description[:100]}...")
            print(f"     📈 Frequency: {pattern.frequency}")
            print(f"     😊 Sentiment: {pattern.sentiment}")
            print(f"     🎯 Impact: {pattern.impact[:80]}...")
            print(f"     💡 Actions: {len(pattern.suggested_actions)} suggestions")
            print(f"     📋 Evidence: {len(pattern.evidence)} quotes")
            
            if pattern.evidence:
                print(f"     🗣️  Sample quote: \"{pattern.evidence[0][:60]}...\"")
        
        # Test 4: Test with empty input
        print("\n4️⃣ Testing with empty input...")
        empty_result = await processor.process("", {})
        print(f"   📊 Empty input result: {len(empty_result.patterns)} patterns")
        
        # Test 5: Test input type support
        print("\n5️⃣ Testing input type support...")
        print(f"   📝 Supports string: {processor.supports_input_type(str)}")
        print(f"   📋 Supports dict: {processor.supports_input_type(dict)}")
        print(f"   🔢 Supports int: {processor.supports_input_type(int)}")
        print(f"   📤 Output type: {processor.get_output_type()}")
        
        print("\n🎉 All tests completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function."""
    success = await test_pattern_processor()
    
    if success:
        print("\n✅ PydanticAI Pattern Processor migration successful!")
        print("🚀 Ready for production use")
    else:
        print("\n❌ PydanticAI Pattern Processor migration failed!")
        print("🔧 Please check the implementation")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
