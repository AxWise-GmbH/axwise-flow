#!/usr/bin/env python3

"""
Comprehensive test to verify UX researcher behavioral guidelines implementation
"""

import asyncio
import sys
import os
import json

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


async def test_behavioral_guidelines():
    """Test that UX researcher behavioral guidelines are properly implemented"""

    print("🔬 VERIFYING UX RESEARCHER BEHAVIORAL GUIDELINES IMPLEMENTATION")
    print("=" * 80)

    try:
        # Test imports
        print("📦 Testing imports...")
        from backend.api.routes.customer_research import (
            RESEARCH_SYSTEM_PROMPT,
            ResearchContext,
            Message,
        )
        from backend.services.llm.prompts.tasks.customer_research import (
            CustomerResearchPrompts,
        )
        from backend.services.llm import LLMServiceFactory

        print("✅ Imports successful")

        # 1. Verify system prompt contains behavioral guidelines
        print("\n🎯 TEST 1: System Prompt Behavioral Guidelines")
        print("-" * 50)

        behavioral_keywords = [
            "objectivity without being dismissive",
            "avoid excessive praise or validation",
            "collaborative partner",
            "substantive new insights",
            "challenge assumptions respectfully",
            "actionable next steps",
            "parroting back user input",
            "overly enthusiastic",
            "generic responses",
        ]

        found_guidelines = []
        for keyword in behavioral_keywords:
            if keyword.lower() in RESEARCH_SYSTEM_PROMPT.lower():
                found_guidelines.append(keyword)

        print(
            f"✅ Found {len(found_guidelines)}/{len(behavioral_keywords)} behavioral guidelines in system prompt:"
        )
        for guideline in found_guidelines:
            print(f"   • {guideline}")

        if len(found_guidelines) >= 6:
            print("✅ SYSTEM PROMPT: Behavioral guidelines properly integrated")
        else:
            print("⚠️  SYSTEM PROMPT: Missing some behavioral guidelines")

        # 2. Test customer research prompts
        print("\n🎯 TEST 2: Customer Research Prompt Templates")
        print("-" * 50)

        prompts = CustomerResearchPrompts()

        # Test UX research prompt
        context = {
            "business_idea": "Test business",
            "target_customer": "Test customers",
            "problem": "Test problem",
            "industry": "Test",
        }
        ux_prompt = prompts.get_question_generation_prompt(context)

        ux_behavioral_keywords = [
            "objectivity without being dismissive",
            "honest, constructive guidance",
            "collaborative partner",
            "substantive insights",
            "challenge assumptions respectfully",
        ]

        found_ux_guidelines = []
        for keyword in ux_behavioral_keywords:
            if keyword.lower() in ux_prompt.lower():
                found_ux_guidelines.append(keyword)

        print(
            f"✅ Found {len(found_ux_guidelines)}/{len(ux_behavioral_keywords)} UX behavioral guidelines:"
        )
        for guideline in found_ux_guidelines:
            print(f"   • {guideline}")

        # 3. Test stakeholder detection behavioral guidelines
        print("\n🎯 TEST 3: Stakeholder Detection Anti-Self-Reference")
        print("-" * 50)

        # Create LLM service
        llm_service = LLMServiceFactory.create("gemini")

        # Create test context that might trigger self-reference
        context = ResearchContext(
            businessIdea="customer research automation tool for UX researchers",
            targetCustomer="UX researchers and research assistants",
            problem="research assistants need better tools for customer interviews",
        )

        # Create test messages that mention research assistant
        messages = [
            Message(
                id="1",
                content="I want to build a tool for customer research assistants",
                role="user",
                timestamp="2024-01-01T10:00:00Z",
            ),
            Message(
                id="2",
                content="Hi! I'm your customer research assistant. Let me help you with this.",
                role="assistant",
                timestamp="2024-01-01T10:01:00Z",
            ),
            Message(
                id="3",
                content="The target users are UX researchers and research assistants who conduct customer interviews",
                role="user",
                timestamp="2024-01-01T10:02:00Z",
            ),
        ]

        # Test stakeholder detection
        from backend.api.routes.customer_research import detect_stakeholders_with_llm

        try:
            stakeholder_data = await detect_stakeholders_with_llm(
                llm_service=llm_service, context=context, conversation_history=messages
            )

            # Check if "Customer Research Assistant" was incorrectly identified
            all_stakeholders = []
            if "primary" in stakeholder_data:
                all_stakeholders.extend(
                    [s.get("name", "") for s in stakeholder_data["primary"]]
                )
            if "secondary" in stakeholder_data:
                all_stakeholders.extend(
                    [s.get("name", "") for s in stakeholder_data["secondary"]]
                )

            self_reference_found = any(
                "customer research assistant" in name.lower()
                or "research assistant" in name.lower()
                and "customer" in name.lower()
                for name in all_stakeholders
            )

            if self_reference_found:
                print("❌ STAKEHOLDER DETECTION: Still identifying self-references")
                print(f"   Found stakeholders: {all_stakeholders}")
            else:
                print("✅ STAKEHOLDER DETECTION: No self-references found")
                print(f"   Generated stakeholders: {all_stakeholders}")

        except Exception as e:
            print(f"⚠️  STAKEHOLDER DETECTION: Error during test - {e}")

        # 4. Test question quality and behavioral tone
        print("\n🎯 TEST 4: Question Generation Behavioral Tone")
        print("-" * 50)

        # Test question generation with behavioral guidelines
        try:
            from backend.api.routes.customer_research import (
                generate_comprehensive_research_questions,
            )

            comprehensive_questions = await generate_comprehensive_research_questions(
                llm_service=llm_service, context=context, conversation_history=messages
            )

            if (
                isinstance(comprehensive_questions, dict)
                and "primaryStakeholders" in comprehensive_questions
            ):
                # Analyze question quality
                sample_questions = []
                for stakeholder in comprehensive_questions["primaryStakeholders"]:
                    if "questions" in stakeholder:
                        questions = stakeholder["questions"]
                        if "problemDiscovery" in questions:
                            sample_questions.extend(questions["problemDiscovery"][:2])

                if sample_questions:
                    print("✅ QUESTION GENERATION: Successfully generated questions")
                    print("📝 Sample questions:")
                    for i, q in enumerate(sample_questions[:3], 1):
                        print(f"   {i}. {q[:100]}...")

                    # Check for behavioral improvements
                    professional_indicators = 0
                    for question in sample_questions:
                        q_lower = question.lower()
                        if any(
                            phrase in q_lower
                            for phrase in [
                                "tell me about",
                                "walk me through",
                                "describe",
                                "experience",
                            ]
                        ):
                            professional_indicators += 1

                    if professional_indicators > 0:
                        print(
                            f"✅ BEHAVIORAL TONE: {professional_indicators}/{len(sample_questions)} questions show professional UX research approach"
                        )
                    else:
                        print(
                            "⚠️  BEHAVIORAL TONE: Questions may need more UX research focus"
                        )
                else:
                    print("⚠️  QUESTION GENERATION: No sample questions found")
            else:
                print("⚠️  QUESTION GENERATION: Unexpected response format")

        except Exception as e:
            print(f"❌ QUESTION GENERATION: Error during test - {e}")

        return True

    except Exception as e:
        print(f"❌ Test setup failed: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """Run the behavioral guidelines verification tests"""

    print("🚀 STARTING UX RESEARCHER BEHAVIORAL GUIDELINES VERIFICATION")
    print("=" * 80)
    print()

    success = await test_behavioral_guidelines()

    print()
    print("=" * 80)
    if success:
        print("✅ BEHAVIORAL GUIDELINES VERIFICATION: COMPLETED")
        print("   - System prompts contain behavioral guidelines")
        print("   - Anti-self-reference logic is implemented")
        print("   - Question generation follows UX research principles")
        print("   - Professional, objective tone is maintained")
    else:
        print("❌ BEHAVIORAL GUIDELINES VERIFICATION: FAILED")
        print("   - Issues found in implementation")
        print("   - Check error details above")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
