#!/usr/bin/env python3
"""
Test script to verify the customer research validation fix works across different industries.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.api.routes.customer_research import validate_business_readiness_fallback


def test_validation_scenarios():
    """Test various business scenarios to ensure validation works correctly."""

    print("🧪 Testing Customer Research Validation Fix")
    print("=" * 60)

    # Test cases that should NOT trigger question generation (too early)
    not_ready_cases = [
        {
            "name": "Coffee Shop - Too Vague",
            "conversation": "User: I want to open coffee shop in Bremen\nAssistant: That's great! Can you tell me more about your target customers?\nUser: I'm not sure yet, can you give me examples?\nAssistant: Sure! Let me give you examples of customer types.\nUser: Yes, those sound like good starting points.",
            "latest_input": "Yes, those sound like good starting points.",
            "expected": False,
            "reason": "User is asking for examples, not providing specifics",
        },
        {
            "name": "Healthcare - Generic",
            "conversation": "User: I want to start a healthcare business\nAssistant: What type of healthcare service?\nUser: Something for patients\nAssistant: Can you be more specific?\nUser: I'm not sure, what do you think?",
            "latest_input": "I'm not sure, what do you think?",
            "expected": False,
            "reason": "User expressing uncertainty",
        },
        {
            "name": "Tech - No Problem Context",
            "conversation": "User: I want to build an app\nAssistant: What would the app do?\nUser: Help people\nAssistant: Help them with what specifically?\nUser: Just general help",
            "latest_input": "Just general help",
            "expected": False,
            "reason": "No specific problem or customer context",
        },
    ]

    # Test cases that SHOULD trigger question generation (sufficient detail)
    ready_cases = [
        {
            "name": "Healthcare - Telemedicine",
            "conversation": "User: I want to build a telemedicine platform for elderly patients in rural areas who struggle to access specialists because current healthcare requires long travel times and many can't afford to miss work for appointments. The platform would connect them with specialists via video calls and provide remote monitoring capabilities.",
            "latest_input": "The platform would connect them with specialists via video calls and provide remote monitoring capabilities.",
            "expected": True,
            "reason": "Specific business, customers, and problem clearly defined",
        },
        {
            "name": "Tech - Project Management",
            "conversation": "User: I'm developing a project management tool specifically for small marketing agencies who need better client collaboration because current tools like Asana and Monday are too complex and clients get confused by the interfaces. My tool would have a simplified client portal where clients can review work, provide feedback, and approve deliverables without needing training on complex project management features.",
            "latest_input": "My tool would have a simplified client portal where clients can review work, provide feedback, and approve deliverables without needing training on complex project management features.",
            "expected": True,
            "reason": "Specific business, target customers, and problem with current solutions",
        },
        {
            "name": "Food Service - Meal Delivery",
            "conversation": "User: I want to start a meal delivery service targeting busy working parents in suburban areas who struggle to prepare healthy meals during weekdays because they work long hours and don't have time to shop for ingredients or cook elaborate meals. Current meal kit services are too expensive and still require significant prep time.",
            "latest_input": "Current meal kit services are too expensive and still require significant prep time.",
            "expected": True,
            "reason": "Clear target market, specific problem, and context about existing solutions",
        },
        {
            "name": "B2B Tech - Legacy API Polling",
            "conversation": "User: I want to build a legacy API polling system for account managers at enterprise companies who need to sync data from old CRM systems because current integration methods require manual data entry and take weeks to implement custom solutions.",
            "latest_input": "current integration methods require manual data entry and take weeks to implement custom solutions.",
            "expected": True,
            "reason": "Specific B2B tech solution with clear customer and problem",
        },
        {
            "name": "Automotive - Service Cam",
            "conversation": "User: I'm developing a service cam application that allows mechanics to send real-time information about car repairs to vehicle owners because customers currently have no visibility into repair progress and often feel uncertain about what work is being done.",
            "latest_input": "customers currently have no visibility into repair progress and often feel uncertain about what work is being done.",
            "expected": True,
            "reason": "Specific automotive service with clear customer pain point",
        },
        {
            "name": "Politics - Voter Engagement",
            "conversation": "User: I want to create a voter engagement platform for local political candidates who struggle to connect with younger voters because traditional campaigning methods like door-to-door and phone calls don't reach millennials and gen z effectively.",
            "latest_input": "traditional campaigning methods like door-to-door and phone calls don't reach millennials and gen z effectively.",
            "expected": True,
            "reason": "Political platform with specific customer and problem",
        },
        {
            "name": "Agriculture - Farm Management",
            "conversation": "User: I'm building a farm management system for small organic farmers who need better crop rotation planning because current methods are manual and farmers often lose track of which fields were planted with what crops in previous seasons.",
            "latest_input": "current methods are manual and farmers often lose track of which fields were planted with what crops in previous seasons.",
            "expected": True,
            "reason": "Agricultural solution with specific customer and problem",
        },
    ]

    print("\n🚫 Testing cases that should NOT trigger question generation:")
    print("-" * 60)

    for case in not_ready_cases:
        result = validate_business_readiness_fallback(
            case["conversation"], case["latest_input"]
        )
        ready = result.get("ready_for_questions", False)

        status = "✅ PASS" if ready == case["expected"] else "❌ FAIL"
        print(f"{status} {case['name']}")
        print(f"   Expected: {case['expected']}, Got: {ready}")
        print(f"   Reason: {case['reason']}")
        if ready != case["expected"]:
            print(f"   Validation reasoning: {result.get('reasoning', 'No reasoning')}")
        print()

    print("\n✅ Testing cases that SHOULD trigger question generation:")
    print("-" * 60)

    for case in ready_cases:
        result = validate_business_readiness_fallback(
            case["conversation"], case["latest_input"]
        )
        ready = result.get("ready_for_questions", False)

        status = "✅ PASS" if ready == case["expected"] else "❌ FAIL"
        print(f"{status} {case['name']}")
        print(f"   Expected: {case['expected']}, Got: {ready}")
        print(f"   Reason: {case['reason']}")
        if ready != case["expected"]:
            print(f"   Validation reasoning: {result.get('reasoning', 'No reasoning')}")
            print(f"   Missing elements: {result.get('missing_elements', [])}")
        print()

    # Summary
    all_cases = not_ready_cases + ready_cases
    passed = sum(
        1
        for case in all_cases
        if validate_business_readiness_fallback(
            case["conversation"], case["latest_input"]
        ).get("ready_for_questions", False)
        == case["expected"]
    )

    print("=" * 60)
    print(f"📊 SUMMARY: {passed}/{len(all_cases)} tests passed")

    if passed == len(all_cases):
        print("🎉 All tests passed! The validation fix is working correctly.")
        return True
    else:
        print("⚠️  Some tests failed. The validation logic may need further adjustment.")
        return False


if __name__ == "__main__":
    success = test_validation_scenarios()
    sys.exit(0 if success else 1)
