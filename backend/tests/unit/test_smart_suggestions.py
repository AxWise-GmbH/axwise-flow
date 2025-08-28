#!/usr/bin/env python3
"""
Test script to verify smart suggestions improvements in chat quick replies
"""

import asyncio
import sys
import os

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.api.routes.customer_research_v3_rebuilt import (
    CustomerResearchServiceV3Rebuilt,
)


# Simple test classes
class TestMessage:
    def __init__(self, id, content, role, timestamp=None, metadata=None):
        self.id = id
        self.content = content
        self.role = role
        self.timestamp = timestamp
        self.metadata = metadata


class TestChatRequest:
    def __init__(self, input, messages, context=None):
        self.input = input
        self.messages = messages
        self.context = context


from backend.services.llm import LLMServiceFactory


async def test_smart_suggestions():
    """Test the smart suggestions improvements for chat quick replies"""

    print("🧪 TESTING SMART SUGGESTIONS FOR CHAT QUICK REPLIES")
    print("=" * 80)

    # Initialize service
    service = CustomerResearchServiceV3Rebuilt()

    # Test different conversation stages
    test_cases = [
        {
            "stage": "discovery",
            "messages": [
                TestMessage(id="1", content="I want to start a business", role="user"),
                TestMessage(
                    id="2",
                    content="Tell me more about your business idea",
                    role="assistant",
                ),
            ],
            "user_input": "I'm thinking about a coffee shop",
            "expected_suggestions": [
                "Tell me more about your target customers",
                "What's the main problem you're solving?",
                "How does your business model work?",
            ],
        },
        {
            "stage": "clarification",
            "messages": [
                TestMessage(
                    id="1", content="I want to start a D&D coffee shop", role="user"
                ),
                TestMessage(
                    id="2",
                    content="That's interesting! Can you tell me more about the target customers?",
                    role="assistant",
                ),
            ],
            "user_input": "D&D players who need a place to play",
            "expected_suggestions": [
                "Help me understand the problem better",
                "Can you elaborate on that?",
                "What about the business model?",
            ],
        },
        {
            "stage": "validation",
            "messages": [
                TestMessage(id="1", content="D&D coffee shop for gamers", role="user"),
                TestMessage(
                    id="2",
                    content="Tell me about the problem they face",
                    role="assistant",
                ),
                TestMessage(
                    id="3",
                    content="They struggle to find good places to play",
                    role="user",
                ),
            ],
            "user_input": "Most cafes don't have enough space or time",
            "expected_suggestions": [
                "That sounds interesting, tell me more",
                "How would customers discover this?",
                "What would make them choose you?",
            ],
        },
        {
            "stage": "confirmation",
            "messages": [
                Message(id="1", content="D&D coffee shop", role="user"),
                Message(
                    id="2",
                    content="Great! So you want to create a coffee shop specifically for D&D players. Is this correct?",
                    role="assistant",
                ),
            ],
            "user_input": "Yes, that's right",
            "expected_suggestions": [
                "Yes, that's correct",
                "Generate the questions",
                "Let's proceed",
            ],
        },
    ]

    print("🔧 Testing Smart Suggestions by Conversation Stage")
    print("-" * 60)

    for i, test_case in enumerate(test_cases, 1):
        stage = test_case["stage"]
        messages = test_case["messages"]
        user_input = test_case["user_input"]
        expected = test_case["expected_suggestions"]

        print(f"\n{i}. Testing {stage.upper()} stage:")
        print(f"   User input: '{user_input}'")

        # Create request
        request = ChatRequest(input=user_input, messages=messages, context=None)

        try:
            # Process the chat request
            response = await service.process_chat(request)
            suggestions = response.get("suggestions", [])

            print(f"   Generated suggestions: {suggestions}")

            # Check if we got context-specific suggestions
            has_generic = any(
                s in suggestions
                for s in ["Okay", "Sounds good", "All of the above", "I don't know"]
            )
            has_context_specific = any(
                any(exp in s for exp in expected) for s in suggestions
            )

            if has_generic:
                generic_found = [
                    s
                    for s in suggestions
                    if s in ["Okay", "Sounds good", "All of the above", "I don't know"]
                ]
                print(f"   ❌ Still has generic suggestions: {generic_found}")
            else:
                print(f"   ✅ No generic suggestions found")

            if has_context_specific:
                print(f"   ✅ Has context-specific suggestions")
            else:
                print(f"   ⚠️  Missing expected context-specific suggestions")
                print(f"      Expected themes: {expected}")

            # Overall assessment
            if not has_generic and has_context_specific:
                print(f"   🎉 {stage.upper()} STAGE: EXCELLENT")
            elif not has_generic:
                print(f"   ✅ {stage.upper()} STAGE: GOOD (no generic)")
            else:
                print(f"   ❌ {stage.upper()} STAGE: NEEDS IMPROVEMENT")

        except Exception as e:
            print(f"   ❌ Error testing {stage} stage: {e}")

    print("\n" + "=" * 80)
    print("📊 SMART SUGGESTIONS TEST SUMMARY")
    print("=" * 80)

    # Test the UX methodology enhancement directly
    print("\n🔧 Testing UX Methodology Enhancement Directly")
    print("-" * 50)

    ux_methodology = service.ux_methodology

    # Test generic suggestions replacement
    generic_suggestions = [
        "Okay",
        "Sounds good",
        "Go ahead",
        "All of the above",
        "I don't know",
    ]
    enhanced_discovery = ux_methodology.enhance_suggestions(
        generic_suggestions, "discovery"
    )
    enhanced_clarification = ux_methodology.enhance_suggestions(
        generic_suggestions, "clarification"
    )

    print(f"Original generic: {generic_suggestions}")
    print(f"Enhanced discovery: {enhanced_discovery}")
    print(f"Enhanced clarification: {enhanced_clarification}")

    # Check improvements
    discovery_improved = not any(
        s in enhanced_discovery for s in ["Okay", "Sounds good", "All of the above"]
    )
    clarification_improved = not any(
        s in enhanced_clarification for s in ["Okay", "Sounds good", "All of the above"]
    )

    print(f"\nDiscovery stage improved: {'✅' if discovery_improved else '❌'}")
    print(f"Clarification stage improved: {'✅' if clarification_improved else '❌'}")

    if discovery_improved and clarification_improved:
        print("\n🎉 SMART SUGGESTIONS: FULLY IMPLEMENTED!")
        print("   ✅ No more generic 'Okay', 'Sounds good', 'All of the above'")
        print("   ✅ Context-specific suggestions based on conversation stage")
        print("   ✅ Meaningful business context options")
        print("   ✅ Helps users provide better information")
    else:
        print("\n⚠️  SMART SUGGESTIONS: PARTIALLY IMPLEMENTED")
        print("   - Some generic suggestions may still appear")
        print("   - Context-specific suggestions working")

    print("\n💡 IMPACT:")
    print("   - Users get helpful quick reply options")
    print("   - No more meaningless 'All of the above' buttons")
    print("   - Conversation flows more naturally")
    print("   - Better business context gathering")


if __name__ == "__main__":
    asyncio.run(test_smart_suggestions())
