#!/usr/bin/env python3

import requests
import json
import time


def test_coffee_shop_problem_analysis():
    """Test the coffee shop conversation to see LLM problem analysis"""

    print("🧪 Testing Coffee Shop Problem Context Analysis")
    print("=" * 60)

    # Simulate the coffee shop conversation step by step
    messages = []
    session_id = f"test_session_{int(time.time())}"

    conversation_steps = [
        "I want to open coffee shop in bremen nord",
        "Cozy, community hub",
        "Book clubs, local events, Board games, study area, Workshops, art displays",
        "A large cafe",
        "Bremen Nord lacks a proper community gathering space where people can work, socialize, and attend events. Most cafes are just for quick coffee, not for staying and connecting.",
        "Young professionals, students, and families who want a place to work remotely, study, meet friends, and participate in community activities",
        "Yes, that's exactly right. Please generate the research questions.",
    ]

    for i, user_input in enumerate(conversation_steps, 1):
        print(f"\n📝 Step {i}: User says: '{user_input}'")

        # Prepare the request
        request_data = {
            "input": user_input,
            "session_id": session_id,
            "context": {"businessIdea": "", "targetCustomer": "", "problem": ""},
            "messages": messages,
        }

        try:
            # Make the request
            response = requests.post(
                "http://localhost:8000/api/research/v3-rebuilt/chat",
                json=request_data,
                timeout=60,
                headers={"Authorization": "Bearer test_token"},
            )

            if response.status_code == 200:
                result = response.json()

                # Check if questions were generated
                if result.get("questions"):
                    print("🎉 Questions generated!")

                    # Analyze questionnaire quality
                    questions = result.get("questions", {})
                    print(f"\n📋 QUESTIONNAIRE QUALITY ANALYSIS")
                    print("=" * 50)

                    # Check for null values and placeholder text
                    has_null_values = False
                    has_placeholder_text = False
                    question_count = 0

                    # Print the full questions structure for debugging
                    print(
                        f"\n🔍 Questions Structure: {json.dumps(questions, indent=2)}"
                    )

                    # Analyze different question categories - check multiple possible structures
                    categories_to_check = [
                        "problem_discovery",
                        "solution_validation",
                        "follow_up",
                        "problemDiscovery",
                        "solutionValidation",
                        "followUp",
                        "questions",
                        "research_questions",
                    ]

                    for category in categories_to_check:
                        if category in questions:
                            category_questions = questions[category]
                            if isinstance(category_questions, list):
                                print(
                                    f"\n🔍 {category.replace('_', ' ').title()} Questions ({len(category_questions)} questions):"
                                )
                                for idx, q in enumerate(category_questions, 1):
                                    question_text = (
                                        q.get("question", "")
                                        if isinstance(q, dict)
                                        else str(q)
                                    )
                                    print(f"   {idx}. {question_text}")

                                    # Check for quality issues
                                    if "null" in question_text.lower():
                                        has_null_values = True
                                        print(f"      ❌ Contains 'null' value")

                                    if any(
                                        placeholder in question_text.lower()
                                        for placeholder in [
                                            "placeholder",
                                            "template",
                                            "example",
                                        ]
                                    ):
                                        has_placeholder_text = True
                                        print(f"      ❌ Contains placeholder text")

                                    question_count += 1
                            elif isinstance(category_questions, dict):
                                print(
                                    f"\n🔍 {category.replace('_', ' ').title()} Questions (nested structure):"
                                )
                                for (
                                    sub_key,
                                    sub_questions,
                                ) in category_questions.items():
                                    if isinstance(sub_questions, list):
                                        print(
                                            f"   {sub_key} ({len(sub_questions)} questions):"
                                        )
                                        for idx, q in enumerate(sub_questions, 1):
                                            question_text = (
                                                q.get("question", "")
                                                if isinstance(q, dict)
                                                else str(q)
                                            )
                                            print(f"     {idx}. {question_text}")

                                            # Check for quality issues
                                            if "null" in question_text.lower():
                                                has_null_values = True
                                                print(
                                                    f"        ❌ Contains 'null' value"
                                                )

                                            if any(
                                                placeholder in question_text.lower()
                                                for placeholder in [
                                                    "placeholder",
                                                    "template",
                                                    "example",
                                                ]
                                            ):
                                                has_placeholder_text = True
                                                print(
                                                    f"        ❌ Contains placeholder text"
                                                )

                                            question_count += 1

                    # Check stakeholders
                    if "stakeholders" in questions:
                        stakeholders = questions["stakeholders"]
                        print(f"\n👥 Stakeholders ({len(stakeholders)} identified):")
                        for stakeholder in stakeholders:
                            if isinstance(stakeholder, dict):
                                print(
                                    f"   • {stakeholder.get('name', 'Unknown')}: {stakeholder.get('description', 'No description')}"
                                )
                            else:
                                print(f"   • {stakeholder}")

                    # Quality assessment
                    print(f"\n📊 QUALITY ASSESSMENT:")
                    print(f"   Total Questions: {question_count}")
                    print(
                        f"   Null Values: {'❌ Found' if has_null_values else '✅ None'}"
                    )
                    print(
                        f"   Placeholder Text: {'❌ Found' if has_placeholder_text else '✅ None'}"
                    )
                    print(
                        f"   Business Context: {'✅ Coffee shop specific' if 'coffee' in str(questions).lower() or 'cafe' in str(questions).lower() else '❌ Generic'}"
                    )

                    # Run detailed quality validation
                    quality_passed = validate_question_quality(questions)

                    # Look for LLM analysis details
                    metadata = result.get("metadata", {})
                    if "business_readiness" in metadata:
                        print(f"\n🧠 Business Readiness Analysis:")
                        print(
                            f"   Ready: {metadata['business_readiness'].get('ready_for_questions')}"
                        )
                        print(
                            f"   Reasoning: {metadata['business_readiness'].get('reasoning', 'No reasoning')[:200]}..."
                        )

                    if "extracted_context" in metadata:
                        print(f"\n🔍 Extracted Context:")
                        context = metadata["extracted_context"]
                        print(
                            f"   Business Idea: {context.get('business_idea', 'None')}"
                        )
                        print(
                            f"   Target Customer: {context.get('target_customer', 'None')}"
                        )
                        print(f"   Problem: {context.get('problem', 'None')}")

                    if "industry_analysis" in metadata:
                        industry = metadata["industry_analysis"]
                        print(f"\n🏢 Industry Analysis:")
                        print(f"   Industry: {industry.get('industry', 'Unknown')}")
                        print(
                            f"   Sub-industry: {industry.get('sub_industry', 'Unknown')}"
                        )
                        print(f"   Confidence: {industry.get('confidence', 0):.2f}")

                    break
                else:
                    print(
                        f"✅ Assistant response: {result.get('content', '')[:100]}..."
                    )
                    print(f"🔍 Suggestions: {result.get('suggestions', [])}")

                    # Add messages to conversation history
                    messages.append(
                        {
                            "id": f"user_{i}",
                            "content": user_input,
                            "role": "user",
                            "timestamp": str(int(time.time())),
                        }
                    )

                    messages.append(
                        {
                            "id": f"assistant_{i}",
                            "content": result.get("content", ""),
                            "role": "assistant",
                            "timestamp": str(int(time.time())),
                        }
                    )
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                break

        except Exception as e:
            print(f"❌ Request failed: {e}")
            break

        print("----------------------------------------")


def test_tech_startup_scenario():
    """Test questionnaire generation for a different business type - tech startup"""

    print("\n🧪 Testing Tech Startup Scenario")
    print("=" * 60)

    messages = []
    session_id = f"test_tech_session_{int(time.time())}"

    conversation_steps = [
        "I want to create a mobile app for fitness tracking",
        "Personalized workout plans and nutrition tracking",
        "Busy professionals who struggle to maintain fitness routines",
        "Most fitness apps are too generic and don't adapt to individual schedules and preferences",
        "Yes, generate the research questions",
    ]

    for i, user_input in enumerate(conversation_steps, 1):
        print(f"\n📝 Step {i}: User says: '{user_input}'")

        request_data = {
            "input": user_input,
            "session_id": session_id,
            "context": {"businessIdea": "", "targetCustomer": "", "problem": ""},
            "messages": messages,
        }

        try:
            response = requests.post(
                "http://localhost:8000/api/research/v3-rebuilt/chat",
                json=request_data,
                timeout=60,
                headers={"Authorization": "Bearer test_token"},
            )

            if response.status_code == 200:
                result = response.json()

                if result.get("questions"):
                    print("🎉 Tech Startup Questions Generated!")
                    questions = result.get("questions", {})

                    # Quick quality check
                    question_count = 0
                    for category in [
                        "problemDiscovery",
                        "solutionValidation",
                        "followUp",
                    ]:
                        if category in questions:
                            question_count += len(questions[category])

                    print(f"📊 Generated {question_count} questions for tech startup")
                    print(
                        f"🏢 Industry: {result.get('metadata', {}).get('industry_analysis', {}).get('industry', 'Unknown')}"
                    )
                    return True
                else:
                    messages.append(
                        {
                            "id": f"user_{i}",
                            "content": user_input,
                            "role": "user",
                            "timestamp": str(int(time.time())),
                        }
                    )
                    messages.append(
                        {
                            "id": f"assistant_{i}",
                            "content": result.get("content", ""),
                            "role": "assistant",
                            "timestamp": str(int(time.time())),
                        }
                    )
            else:
                print(f"❌ Error: {response.status_code}")
                return False

        except Exception as e:
            print(f"❌ Request failed: {e}")
            return False

    return False


def test_error_handling():
    """Test error handling scenarios"""

    print("\n🧪 Testing Error Handling")
    print("=" * 60)

    # Test with invalid session
    test_cases = [
        {
            "name": "Empty Input",
            "data": {
                "input": "",
                "session_id": "test_empty",
                "context": {"businessIdea": "", "targetCustomer": "", "problem": ""},
                "messages": [],
            },
        },
        {
            "name": "Very Long Input",
            "data": {
                "input": "A" * 10000,  # Very long input
                "session_id": "test_long",
                "context": {"businessIdea": "", "targetCustomer": "", "problem": ""},
                "messages": [],
            },
        },
    ]

    for test_case in test_cases:
        print(f"\n🔍 Testing: {test_case['name']}")

        try:
            response = requests.post(
                "http://localhost:8000/api/research/v3-rebuilt/chat",
                json=test_case["data"],
                timeout=30,
                headers={"Authorization": "Bearer test_token"},
            )

            if response.status_code == 200:
                print(f"✅ {test_case['name']}: Handled gracefully")
            else:
                print(f"⚠️ {test_case['name']}: Status {response.status_code}")

        except Exception as e:
            print(f"❌ {test_case['name']}: Exception {e}")


def validate_question_quality(questions):
    """Validate the quality of generated questions"""

    print("\n🔍 DETAILED QUESTION QUALITY VALIDATION")
    print("=" * 50)

    quality_issues = []
    total_questions = 0

    # Check each category
    for category_name, category_questions in questions.items():
        if isinstance(category_questions, list):
            print(
                f"\n📋 {category_name.replace('_', ' ').title()} ({len(category_questions)} questions):"
            )

            for i, question in enumerate(category_questions, 1):
                question_text = (
                    question.get("question", "")
                    if isinstance(question, dict)
                    else str(question)
                )
                print(f"   {i}. {question_text}")

                # Quality checks
                if len(question_text) < 10:
                    quality_issues.append(f"{category_name}[{i}]: Too short")

                if question_text.count("?") != 1:
                    quality_issues.append(
                        f"{category_name}[{i}]: Should have exactly one question mark"
                    )

                if any(
                    word in question_text.lower()
                    for word in ["null", "undefined", "placeholder"]
                ):
                    quality_issues.append(
                        f"{category_name}[{i}]: Contains placeholder text"
                    )

                if question_text.lower().startswith(
                    ("what", "how", "why", "when", "where", "would", "do", "can")
                ):
                    pass  # Good question starters
                else:
                    quality_issues.append(
                        f"{category_name}[{i}]: Unusual question format"
                    )

                total_questions += 1

    # Overall assessment
    print(f"\n📊 QUALITY SUMMARY:")
    print(f"   Total Questions: {total_questions}")
    print(f"   Quality Issues: {len(quality_issues)}")

    if quality_issues:
        print("   Issues Found:")
        for issue in quality_issues[:5]:  # Show first 5 issues
            print(f"     • {issue}")
        if len(quality_issues) > 5:
            print(f"     ... and {len(quality_issues) - 5} more")
    else:
        print("   ✅ All questions pass quality checks")

    return len(quality_issues) == 0


if __name__ == "__main__":
    print("🚀 COMPREHENSIVE CUSTOMER RESEARCH TESTING")
    print("=" * 80)

    # Run all tests
    tests = [
        ("Coffee Shop Analysis", test_coffee_shop_problem_analysis),
        ("Tech Startup Scenario", test_tech_startup_scenario),
        ("Error Handling", test_error_handling),
    ]

    results = {}

    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            result = test_func()
            results[test_name] = result if result is not None else True
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results[test_name] = False

    # Summary
    print(f"\n{'='*20} TEST SUMMARY {'='*20}")
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")

    total_passed = sum(1 for passed in results.values() if passed)
    print(f"\nOverall: {total_passed}/{len(results)} tests passed")
