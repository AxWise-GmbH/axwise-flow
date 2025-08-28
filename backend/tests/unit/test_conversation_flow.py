#!/usr/bin/env python3
"""
Test script to reproduce the conversation flow issue in V3 Rebuilt Customer Research
"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

def test_conversation_flow():
    """Test the conversation flow that's showing repetitive questions"""

    print("🧪 Testing V3 Rebuilt Customer Research - Coffee Shop Example")
    print("=" * 60)

    # Simulate the conversation from the transcript
    messages = []
    session_id = f"test_session_{int(time.time())}"

    # Test the coffee shop conversation that was problematic
    conversation_steps = [
        "I want to open coffee shop in bremen nord",
        "Cozy, community hub",
        "Book clubs, local events, Board games, study area, Workshops, art displays",
        "A large cafe",
        "Yes, that's correct"  # Add explicit confirmation
    ]

    for i, user_input in enumerate(conversation_steps):
        print(f"\n📝 Step {i+1}: User says: '{user_input}'")

        # Prepare request
        request_data = {
            "input": user_input,
            "messages": messages,
            "context": {
                "businessIdea": "",
                "targetCustomer": "",
                "problem": "",
                "questionsGenerated": False,
                "multiStakeholderConsidered": False
            },
            "session_id": session_id,
            "user_id": "test_user_123"
        }

        try:
            # Send request to V3 Rebuilt endpoint
            response = requests.post(
                f"{API_BASE}/api/research/v3-rebuilt/chat",
                json=request_data,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()

                print(f"✅ Assistant response: {result.get('content', 'No content')[:100]}...")
                print(f"🔍 Suggestions: {result.get('suggestions', [])}")

                # Check for UX methodology enhancements
                metadata = result.get('metadata', {})
                if 'v3_enhancements' in result:
                    print(f"🎯 V3 Enhancements applied: {result['v3_enhancements']}")

                # Add messages to conversation history
                from datetime import datetime
                timestamp = datetime.now().isoformat()

                messages.append({
                    "id": f"user_{i}",
                    "content": user_input,
                    "role": "user",
                    "timestamp": timestamp
                })

                messages.append({
                    "id": f"assistant_{i}",
                    "content": result.get('content', ''),
                    "role": "assistant",
                    "timestamp": timestamp
                })

                # Check if questions were generated
                if result.get('questions'):
                    print("🎉 Questions generated!")
                    break

            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                break

        except Exception as e:
            print(f"❌ Request failed: {e}")
            break

        print("-" * 40)
        time.sleep(1)  # Brief pause between requests

if __name__ == "__main__":
    test_conversation_flow()
