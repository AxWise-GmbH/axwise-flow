#!/usr/bin/env python3
"""
Test script to verify customer research question generation is working correctly.
"""

import requests
import json
import time

# Test the customer research chat endpoint
def test_question_generation():
    base_url = "http://localhost:8000"
    
    # Test conversation that should trigger question generation
    messages = [
        {
            "id": "1",
            "content": "Hi! I'm your customer research assistant. I'll help you create targeted research questions for your business idea. Let's start - what's your business idea?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:00:00Z"
        },
        {
            "id": "2", 
            "content": "I want to open laundromat network",
            "role": "user",
            "timestamp": "2024-01-01T00:01:00Z"
        },
        {
            "id": "3",
            "content": "That's exciting! To understand your market better, who specifically do you envision using your laundromats?",
            "role": "assistant", 
            "timestamp": "2024-01-01T00:02:00Z"
        },
        {
            "id": "4",
            "content": "Apartment residents and students, Both individuals and businesses, Primarily apartment dwellers - but mainly Grannies in Bremen",
            "role": "user",
            "timestamp": "2024-01-01T00:03:00Z"
        },
        {
            "id": "5",
            "content": "That's a really interesting focus, especially on Grannies in Bremen! What specific challenges or frustrations do you see them facing with their current laundry options?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:04:00Z"
        },
        {
            "id": "6",
            "content": "Main reason is that we have very few in Bremen, for example you need to ride 20 minutes from bremen nord to mitte",
            "role": "user",
            "timestamp": "2024-01-01T00:05:00Z"
        },
        {
            "id": "7",
            "content": "That example really highlights the inconvenience! Thinking about specific needs, beyond just regular weekly loads, are there particular items like large duvets or blankets that are especially difficult for apartment dwellers or Grannies to wash with the current lack of nearby options?",
            "role": "assistant",
            "timestamp": "2024-01-01T00:06:00Z"
        },
        {
            "id": "8",
            "content": "Yes, large duvets., Big blankets too., Heavy loads are hard.",
            "role": "user",
            "timestamp": "2024-01-01T00:07:00Z"
        }
    ]
    
    # Test confirmation trigger
    payload = {
        "messages": messages,
        "input": "Yes, that's correct",
        "context": {
            "businessIdea": "laundromat network in Bremen",
            "targetCustomer": "Grannies in Bremen Nord, apartment residents, students",
            "problem": "lack of nearby laundromats, difficulty with large items like duvets and blankets, heavy loads",
            "questionsGenerated": False
        },
        "session_id": "local_test_session_123"
    }
    
    print("🧪 Testing customer research question generation...")
    print(f"📤 Sending request to {base_url}/api/research/chat")
    
    try:
        response = requests.post(
            f"{base_url}/api/research/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"📥 Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Request successful!")
            
            # Check if questions were generated
            if data.get("questions"):
                questions = data["questions"]
                print(f"\n📋 Questions generated:")
                print(f"   Problem Discovery: {len(questions.get('problemDiscovery', []))} questions")
                print(f"   Solution Validation: {len(questions.get('solutionValidation', []))} questions") 
                print(f"   Follow-up: {len(questions.get('followUp', []))} questions")
                
                # Check stakeholder data
                if questions.get("stakeholders"):
                    stakeholders = questions["stakeholders"]
                    print(f"\n👥 Stakeholders detected:")
                    print(f"   Primary: {len(stakeholders.get('primary', []))} stakeholders")
                    print(f"   Secondary: {len(stakeholders.get('secondary', []))} stakeholders")
                    
                    # Print stakeholder details
                    for i, stakeholder in enumerate(stakeholders.get('primary', [])):
                        print(f"   Primary {i+1}: {stakeholder.get('name', 'Unknown')}")
                    for i, stakeholder in enumerate(stakeholders.get('secondary', [])):
                        print(f"   Secondary {i+1}: {stakeholder.get('name', 'Unknown')}")
                else:
                    print("❌ No stakeholder data found in response")
                
                # Check time estimation
                if questions.get("estimatedTime"):
                    time_est = questions["estimatedTime"]
                    print(f"\n⏱️ Time estimation:")
                    print(f"   Total questions: {time_est.get('totalQuestions', 0)}")
                    print(f"   Estimated time: {time_est.get('min', 0)}-{time_est.get('max', 0)} minutes")
                else:
                    print("❌ No time estimation found in response")
                    
            else:
                print("❌ No questions generated in response")
                
            print(f"\n📄 Full response structure:")
            print(json.dumps(data, indent=2)[:1000] + "..." if len(json.dumps(data, indent=2)) > 1000 else json.dumps(data, indent=2))
            
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_question_generation()
