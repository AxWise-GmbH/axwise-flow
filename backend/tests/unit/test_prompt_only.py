#!/usr/bin/env python3
"""
Test just the prompt generator to see what prompts it creates.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Load environment variables
from dotenv import load_dotenv

load_dotenv()


def test_prompt_generator():
    """Test what the prompt generator creates."""

    print("🔍 TESTING PROMPT GENERATOR")
    print("=" * 80)

    try:
        # Import the prompt generator directly
        from backend.services.processing.prompts import PromptGenerator

        print("✅ Imports successful")

        # Create prompt generator
        prompt_generator = PromptGenerator()
        print("✅ PromptGenerator created")

        # Test interview content (same as our successful test)
        interview_content = """
        Interview with Sarah, Product Manager at a SaaS startup:

        "I've been working in product management for about 6 years now, mostly in B2B SaaS. Started as a business analyst right out of college, then moved into product roles. I'm 29, based in Austin, and I love the startup environment - the pace, the impact you can have."

        "My biggest challenge right now is balancing feature requests from sales with what our engineering team can actually deliver. Sales promises the world to close deals, then engineering comes back saying it'll take 6 months. I'm constantly playing mediator."

        "I use Jira religiously for tracking everything, Figma for wireframes, and I live in Slack. We do two-week sprints, and I spend probably 30% of my time in meetings - standups, planning, retrospectives. Sometimes I feel like I'm in meetings about meetings."
        """

        # Test the prompt generator
        role = "Product Manager"

        # Generate the real prompt
        real_prompt = prompt_generator.create_simplified_persona_prompt(
            interview_content, role
        )

        print(f"✅ Real prompt generated (length: {len(real_prompt)} chars)")

        # Display the real prompt
        print("\n📝 REAL SYSTEM PROMPT:")
        print("=" * 80)
        print(real_prompt)
        print("=" * 80)

        # Compare with our test prompt
        our_test_prompt = """You are an expert persona analyst specializing in creating detailed, authentic personas from interview content.

TASK: Analyze the provided interview content and create a comprehensive SimplifiedPersona.

ANALYSIS APPROACH:
1. Extract specific demographic details, professional background, and experience level
2. Identify core goals, motivations, and what drives this person professionally
3. Understand their main challenges, frustrations, and pain points
4. Document their skills, expertise, and professional capabilities
5. Note their technology usage patterns, tools, and preferences
6. Capture their workflow style, work environment, and collaboration patterns
7. Understand their needs, expectations, and what they value
8. Extract 3-5 authentic quotes that represent their voice and concerns

QUALITY REQUIREMENTS:
- Use specific, detailed information from the interview content
- Avoid generic placeholders - extract real insights
- Set confidence scores based on evidence strength (aim for 80-95% for clear evidence)
- Ensure the persona feels like a real, authentic person
- Include actual quotes, not paraphrases

OUTPUT: Complete SimplifiedPersona with all fields populated with rich, specific content."""

        print(f"\n📝 OUR TEST PROMPT (length: {len(our_test_prompt)} chars):")
        print("=" * 80)
        print(our_test_prompt)
        print("=" * 80)

        # Analysis
        print(f"\n📊 PROMPT COMPARISON:")
        print("-" * 50)
        print(f"Real prompt length: {len(real_prompt)} chars")
        print(f"Test prompt length: {len(our_test_prompt)} chars")

        # Check for key quality indicators
        quality_keywords = [
            "specific",
            "detailed",
            "authentic",
            "evidence",
            "confidence",
            "real",
            "actual quotes",
            "avoid generic",
            "placeholders",
        ]

        real_quality_score = sum(
            1 for keyword in quality_keywords if keyword.lower() in real_prompt.lower()
        )
        test_quality_score = sum(
            1
            for keyword in quality_keywords
            if keyword.lower() in our_test_prompt.lower()
        )

        print(
            f"Real prompt quality keywords: {real_quality_score}/{len(quality_keywords)}"
        )
        print(
            f"Test prompt quality keywords: {test_quality_score}/{len(quality_keywords)}"
        )

        # Check if real prompt contains interview content
        if interview_content.strip() in real_prompt:
            print("✅ Real prompt includes the interview content")
        else:
            print("⚠️ Real prompt may not include full interview content")

        if real_quality_score >= test_quality_score * 0.8:
            print("✅ Real prompt has good quality indicators")
            quality_assessment = "GOOD"
        else:
            print("⚠️ Real prompt may lack quality emphasis")
            quality_assessment = "NEEDS_IMPROVEMENT"

        print(f"\n🎯 ASSESSMENT: {quality_assessment}")

        return quality_assessment == "GOOD"

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_prompt_generator()
    sys.exit(0 if success else 1)
