#!/usr/bin/env python3
"""
Test script to verify the new LLM-based contextual quick reply suggestion system
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


async def test_contextual_quick_replies():
    """Test the new LLM-based contextual quick reply suggestion system"""

    print("🧪 TESTING LLM-BASED CONTEXTUAL QUICK REPLY SUGGESTIONS")
    print("=" * 80)

    # Initialize service
    service = CustomerResearchServiceV3Rebuilt()

    # Test different business scenarios
    test_scenarios = [
        {
            "name": "Gaming Cafe Discovery",
            "business_context": {
                "business_idea": "D&D coffee shop",
                "target_customer": "D&D players",
                "problem": "",
            },
            "conversation_stage": "discovery",
            "messages": [
                TestMessage(
                    id="1", content="I want to start a D&D coffee shop", role="user"
                ),
                TestMessage(
                    id="2",
                    content="That's an interesting concept! Can you tell me more about who you're targeting with this D&D coffee shop?",
                    role="assistant",
                ),
            ],
            "user_input": "D&D players who need a place to play",
            "assistant_response": "Great! D&D players are a passionate community. What specific challenges do D&D players face when looking for places to play their games?",
            "expected_themes": [
                "gaming community",
                "space challenges",
                "equipment needs",
                "scheduling",
            ],
        },
        {
            "name": "Healthcare App Clarification",
            "business_context": {
                "business_idea": "Patient communication app",
                "target_customer": "Healthcare providers",
                "problem": "Poor patient communication",
            },
            "conversation_stage": "clarification",
            "messages": [
                TestMessage(
                    id="1",
                    content="Healthcare communication app for doctors",
                    role="user",
                ),
                TestMessage(
                    id="2",
                    content="Tell me more about the communication problems",
                    role="assistant",
                ),
                TestMessage(
                    id="3",
                    content="Doctors struggle to keep patients informed",
                    role="user",
                ),
            ],
            "user_input": "Patients miss appointments and don't follow treatment plans",
            "assistant_response": "I see, so the core issue is patient engagement and adherence. Can you elaborate on how this affects the healthcare providers' workflow?",
            "expected_themes": [
                "workflow impact",
                "patient outcomes",
                "compliance",
                "efficiency",
            ],
        },
        {
            "name": "E-commerce Validation",
            "business_context": {
                "business_idea": "Sustainable fashion marketplace",
                "target_customer": "Eco-conscious consumers",
                "problem": "Hard to find sustainable fashion",
            },
            "conversation_stage": "validation",
            "messages": [
                TestMessage(
                    id="1", content="Sustainable fashion marketplace", role="user"
                ),
                TestMessage(
                    id="2",
                    content="What's the main problem with current options?",
                    role="assistant",
                ),
                TestMessage(
                    id="3",
                    content="Hard to verify if brands are truly sustainable",
                    role="user",
                ),
            ],
            "user_input": "Consumers want transparency but brands greenwash",
            "assistant_response": "That's a significant trust issue in the market. How would customers discover and trust your marketplace over existing options?",
            "expected_themes": [
                "trust building",
                "verification",
                "customer acquisition",
                "competitive advantage",
            ],
        },
        {
            "name": "Confirmation Stage - Assistant Asking for Confirmation",
            "business_context": {
                "business_idea": "AI-powered fitness app",
                "target_customer": "Busy professionals",
                "problem": "No time for gym",
            },
            "conversation_stage": "confirmation",
            "messages": [
                TestMessage(
                    id="1", content="AI fitness app for busy professionals", role="user"
                ),
                TestMessage(
                    id="2",
                    content="So you want to create an AI-powered fitness app specifically for busy professionals who struggle to find time for traditional gym workouts. Is this correct?",
                    role="assistant",
                ),
            ],
            "user_input": "Yes, that's exactly right",
            "assistant_response": "Perfect! I have enough context about your business idea. Would you like me to generate specific research questions for your AI-powered fitness app?",
            "expected_themes": ["yes", "generate", "proceed", "correct"],
        },
        {
            "name": "Confirmation Stage - User Responding to Summary",
            "business_context": {
                "business_idea": "D&D coffee shop",
                "target_customer": "D&D players",
                "problem": "Need a place to play",
            },
            "conversation_stage": "confirmation",
            "messages": [
                TestMessage(id="1", content="D&D coffee shop", role="user"),
                TestMessage(
                    id="2",
                    content="Let me summarize: You want to create a D&D coffee shop for D&D players who need a place to play. Does this capture your business idea correctly?",
                    role="assistant",
                ),
            ],
            "user_input": "Yes, that's right",
            "assistant_response": "Great! Would you like me to generate research questions for your D&D coffee shop?",
            "expected_themes": ["yes", "generate", "proceed", "correct"],
        },
    ]

    print("🔧 Testing LLM-Based Contextual Quick Replies")
    print("-" * 60)

    for i, scenario in enumerate(test_scenarios, 1):
        name = scenario["name"]
        business_context = scenario["business_context"]
        conversation_stage = scenario["conversation_stage"]
        messages = scenario["messages"]
        user_input = scenario["user_input"]
        assistant_response = scenario["assistant_response"]
        expected_themes = scenario["expected_themes"]

        print(f"\n{i}. Testing {name}:")
        print(f"   Business: {business_context['business_idea']}")
        print(f"   Stage: {conversation_stage}")
        print(f"   User input: '{user_input}'")

        # Create request
        request = TestChatRequest(input=user_input, messages=messages, context=None)

        try:
            # Process the chat request to get LLM-enhanced suggestions
            response = await service.process_chat(request)
            suggestions = response.get("suggestions", [])

            print(f"   Generated suggestions: {suggestions}")

            # Check suggestion quality
            has_generic = any(
                s in suggestions for s in ["Okay", "Sounds good", "Go ahead"]
            )
            has_business_specific = any(
                any(theme in s.lower() for theme in expected_themes)
                for s in suggestions
            )
            has_natural_language = all(
                len(s) > 10 for s in suggestions
            )  # Not too short
            has_appropriate_count = 3 <= len(suggestions) <= 6

            # Check for "All of the above" handling
            has_all_of_above = any("all of the above" in s.lower() for s in suggestions)

            print(f"   Quality Assessment:")
            print(f"     ✅ No generic suggestions: {not has_generic}")
            print(f"     ✅ Business-specific content: {has_business_specific}")
            print(f"     ✅ Natural language: {has_natural_language}")
            print(f"     ✅ Appropriate count (3-6): {has_appropriate_count}")
            print(f"     ✅ 'All of the above' present: {has_all_of_above}")

            # Overall assessment
            quality_score = sum(
                [
                    not has_generic,
                    has_business_specific,
                    has_natural_language,
                    has_appropriate_count,
                ]
            )

            if quality_score >= 3:
                print(f"   🎉 {name}: EXCELLENT QUALITY ({quality_score}/4)")
            elif quality_score >= 2:
                print(f"   ✅ {name}: GOOD QUALITY ({quality_score}/4)")
            else:
                print(f"   ⚠️ {name}: NEEDS IMPROVEMENT ({quality_score}/4)")

            # Check for expected business themes
            found_themes = []
            for suggestion in suggestions:
                for theme in expected_themes:
                    if theme in suggestion.lower():
                        found_themes.append(theme)

            if found_themes:
                print(f"   🎯 Found expected themes: {found_themes}")
            else:
                print(f"   ⚠️ Missing expected themes: {expected_themes}")

        except Exception as e:
            print(f"   ❌ Error testing {name}: {e}")

    print("\n" + "=" * 80)
    print("📊 LLM-BASED CONTEXTUAL QUICK REPLIES TEST SUMMARY")
    print("=" * 80)

    print("\n🎯 EXPECTED IMPROVEMENTS:")
    print("✅ Business-Aware Content: Suggestions tailored to specific business types")
    print(
        "✅ Conversation Stage Awareness: Different suggestions for discovery vs validation"
    )
    print("✅ Natural Language: Professional, conversational tone")
    print("✅ Progressive Information Gathering: Guides users to provide more details")
    print(
        "✅ Context-Specific: No more generic 'Okay', 'Sounds good' unless appropriate"
    )
    print("✅ Smart 'All of the Above': Only added when suggestions are complementary")

    print("\n💡 BUSINESS-AWARE EXAMPLES:")
    print("🎮 Gaming Businesses: Focus on community, engagement, space needs")
    print("🏥 Healthcare Businesses: Focus on compliance, patient outcomes, workflows")
    print("🛒 E-commerce Businesses: Focus on customer acquisition, conversion, trust")
    print("💻 SaaS Businesses: Focus on user adoption, integration, scalability")

    print("\n🎉 IMPACT:")
    print("   - Users get contextually relevant quick reply options")
    print("   - Suggestions help guide natural conversation progression")
    print("   - Business-specific content improves information gathering")
    print("   - LLM analysis ensures suggestions match conversation context")
    print("   - Fallback system ensures reliability")


if __name__ == "__main__":
    asyncio.run(test_contextual_quick_replies())
