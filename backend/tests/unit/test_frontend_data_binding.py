#!/usr/bin/env python3
"""
Test script to verify frontend data binding with a mock API response.
"""

import requests
import json
import time


def test_frontend_data_binding():
    """Test the frontend with a properly structured API response."""

    base_url = "http://localhost:8000"

    # Test conversation that should trigger question generation
    messages = [
        {
            "id": "1",
            "content": "Hi! I'm your customer research assistant. I'll help you create targeted research questions for your business idea. Let's start - what's your business idea?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:00:00Z",
        },
        {
            "id": "2",
            "content": "I want to open laundromat network",
            "role": "user",
            "timestamp": "2024-01-01T00:01:00Z",
        },
        {
            "id": "3",
            "content": "That's exciting! To understand your market better, who specifically do you envision using your laundromats?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:02:00Z",
        },
        {
            "id": "4",
            "content": "Apartment residents and students, Both individuals and businesses, Primarily apartment dwellers - but mainly Grannies in Bremen",
            "role": "user",
            "timestamp": "2024-01-01T00:03:00Z",
        },
        {
            "id": "5",
            "content": "That's a really interesting focus, especially on Grannies in Bremen! What specific challenges or frustrations do you see them facing with their current laundry options?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:04:00Z",
        },
        {
            "id": "6",
            "content": "Main reason is that we have very few in Bremen, for example you need to ride 20 minutes from bremen nord to mitte",
            "role": "user",
            "timestamp": "2024-01-01T00:05:00Z",
        },
        {
            "id": "7",
            "content": "That example really highlights the inconvenience! Thinking about specific needs, beyond just regular weekly loads, are there particular items like large duvets or blankets that are especially difficult for apartment dwellers or Grannies to wash with the current lack of nearby options?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:06:00Z",
        },
        {
            "id": "8",
            "content": "Yes, large duvets., Big blankets too., Heavy loads are hard.",
            "role": "user",
            "timestamp": "2024-01-01T00:07:00Z",
        },
    ]

    # Test confirmation trigger
    payload = {
        "messages": messages,
        "input": "Yes, that's correct",
        "context": {
            "businessIdea": "laundromat network in Bremen",
            "targetCustomer": "Grannies in Bremen Nord, apartment residents, students",
            "problem": "lack of nearby laundromats, difficulty with large items like duvets and blankets, heavy loads",
            "questionsGenerated": False,
        },
        "session_id": f"local_test_session_{int(time.time())}",
    }

    print("🧪 Testing frontend data binding with customer research API...")
    print(f"📤 Sending request to {base_url}/api/research/chat")

    try:
        response = requests.post(
            f"{base_url}/api/research/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60,  # Increased timeout
        )

        print(f"📥 Response status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print("✅ Request successful!")

            # Check if questions were generated
            if data.get("questions"):
                questions = data["questions"]
                print(f"\n📋 Questions structure:")
                print(
                    f"   Problem Discovery: {len(questions.get('problemDiscovery', []))} questions"
                )
                print(
                    f"   Solution Validation: {len(questions.get('solutionValidation', []))} questions"
                )
                print(f"   Follow-up: {len(questions.get('followUp', []))} questions")

                # Check stakeholder data structure for frontend
                if questions.get("stakeholders"):
                    stakeholders = questions["stakeholders"]
                    print(f"\n👥 Stakeholder structure for frontend:")
                    print(
                        f"   Primary stakeholders: {len(stakeholders.get('primary', []))}"
                    )
                    print(
                        f"   Secondary stakeholders: {len(stakeholders.get('secondary', []))}"
                    )

                    # Verify each primary stakeholder has questions
                    for i, stakeholder in enumerate(stakeholders.get("primary", [])):
                        name = stakeholder.get("name", "Unknown")
                        print(f"\n   Primary {i+1}: {name}")
                        print(
                            f"      Description: {stakeholder.get('description', 'No description')[:100]}..."
                        )

                        if "questions" in stakeholder:
                            questions_obj = stakeholder["questions"]
                            problem_count = len(
                                questions_obj.get("problemDiscovery", [])
                            )
                            solution_count = len(
                                questions_obj.get("solutionValidation", [])
                            )
                            followup_count = len(questions_obj.get("followUp", []))
                            total_questions = (
                                problem_count + solution_count + followup_count
                            )

                            print(
                                f"      ✅ Questions: {problem_count} + {solution_count} + {followup_count} = {total_questions}"
                            )

                            # Show sample questions
                            if questions_obj.get("problemDiscovery"):
                                print(
                                    f"      Sample Problem Q: {questions_obj['problemDiscovery'][0][:80]}..."
                                )
                            if questions_obj.get("solutionValidation"):
                                print(
                                    f"      Sample Solution Q: {questions_obj['solutionValidation'][0][:80]}..."
                                )
                        else:
                            print(f"      ❌ No questions found!")

                    # Check secondary stakeholders too
                    for i, stakeholder in enumerate(stakeholders.get("secondary", [])):
                        name = stakeholder.get("name", "Unknown")
                        print(f"\n   Secondary {i+1}: {name}")
                        if "questions" in stakeholder:
                            questions_obj = stakeholder["questions"]
                            total_questions = (
                                len(questions_obj.get("problemDiscovery", []))
                                + len(questions_obj.get("solutionValidation", []))
                                + len(questions_obj.get("followUp", []))
                            )
                            print(f"      ✅ Questions: {total_questions}")
                        else:
                            print(f"      ❌ No questions found!")

                else:
                    print("❌ No stakeholder data found in response")

                # Check time estimation
                if questions.get("estimatedTime"):
                    time_est = questions["estimatedTime"]
                    print(f"\n⏱️ Time estimation for frontend:")
                    print(f"   Total questions: {time_est.get('totalQuestions', 0)}")
                    print(
                        f"   Time range: {time_est.get('min', 0)}-{time_est.get('max', 0)} minutes"
                    )

                    # This is what the frontend expects
                    frontend_format = {
                        "totalQuestions": time_est.get("totalQuestions", 0),
                        "estimatedMinutes": f"{time_est.get('min', 0)}-{time_est.get('max', 0)}",
                    }
                    print(f"   Frontend format: {frontend_format}")
                else:
                    print("❌ No time estimation found")

                print(f"\n🎯 Frontend compatibility check:")
                print(
                    f"   ✅ Has questions.stakeholders: {'stakeholders' in questions}"
                )
                print(
                    f"   ✅ Has questions.estimatedTime: {'estimatedTime' in questions}"
                )

                # Check if this matches what the frontend chat handler expects
                if questions.get("stakeholders") and questions.get("estimatedTime"):
                    print(f"   ✅ Response format matches frontend expectations!")
                    print(
                        f"   📱 Frontend should display comprehensive questions component"
                    )
                else:
                    print(f"   ❌ Response format may not match frontend expectations")

            else:
                print("❌ No questions generated in response")

        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")

    except requests.exceptions.Timeout:
        print("❌ Request timed out - this is expected if LLM calls are slow")
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


if __name__ == "__main__":
    test_frontend_data_binding()
