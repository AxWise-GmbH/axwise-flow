#!/usr/bin/env python3
"""
Test specifically for planning patterns extraction.
"""

import sys
import os
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.utils.persona.persona_analyzer import PersonaAnalyzer


def test_planning_patterns():
    print("🧪 Testing Planning Patterns Extraction")
    print("=" * 50)

    # Test data with rich behavioral content
    test_data = [
        {
            "persona_type": "UX Researcher",
            "respondents": [
                {
                    "answers": [
                        {
                            "question": "How do you handle team communication?",
                            "answer": "We engage in asynchronous communication, particularly for questions, which often results in significant delays as responses are received hours or even a full day later due to time zone differences, impacting workflow continuity.",
                        },
                        {
                            "question": "How do you measure team effectiveness?",
                            "answer": "Team leads measure team effectiveness by combining quantitative metrics like sprint velocity and bug rates with qualitative feedback gathered through regular one-on-ones and team retrospectives, then manually attempt to synthesize these disparate data points.",
                        },
                        {
                            "question": "How do you handle missing information?",
                            "answer": "Team members and leads repeatedly engage in the behavior of actively seeking out and pursuing missing or siloed information across various communication channels and documentation platforms, often as a direct response to process friction or lack of clarity.",
                        },
                    ]
                }
            ],
        }
    ]

    try:
        analyzer = PersonaAnalyzer(test_data[0])

        # Test the core attributes extraction
        core_attributes = analyzer.extract_core_attributes()

        print(f"📊 Core attributes extracted:")
        print(f"   Tools: {len(core_attributes.get('tools_used', []))}")
        print(
            f"   Planning patterns: {len(core_attributes.get('planning_patterns', []))}"
        )
        print(
            f"   Responsibilities: {len(core_attributes.get('key_responsibilities', []))}"
        )

        planning_patterns = core_attributes.get("planning_patterns", [])

        if planning_patterns:
            print(f"\n✅ Planning patterns found: {len(planning_patterns)}")
            for i, pattern in enumerate(planning_patterns):
                print(
                    f"   {i+1}. {pattern.get('pattern', 'Unknown')} (freq: {pattern.get('frequency', 0)})"
                )
        else:
            print("\n❌ No planning patterns found!")

        # Save results for inspection
        with open("planning_patterns_test.json", "w") as f:
            json.dump(core_attributes, f, indent=2)
        print(f"\n💾 Results saved to planning_patterns_test.json")

        return len(planning_patterns) > 0

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_planning_patterns()
    print("\n" + "=" * 50)
    if success:
        print("🎉 Planning patterns test PASSED!")
    else:
        print("💥 Planning patterns test FAILED!")
