#!/usr/bin/env python3
"""
Quick test script to verify database persistence is working.
"""

import asyncio
import json
import requests
import time

# Test questionnaire content
TEST_QUESTIONNAIRE = """
Business Idea: AI-powered fitness app for busy professionals
Target Customer: Working professionals aged 25-45 who struggle to maintain fitness routines
Problem: Lack of time and motivation to exercise regularly

Primary Stakeholders:
1. Busy Professional (End User)
   - How do you currently manage your fitness routine?
   - What are your biggest challenges with staying active?
   - What would motivate you to use a fitness app daily?

Secondary Stakeholders:
2. Fitness Trainer (Content Creator)
   - How would you design workouts for time-constrained individuals?
   - What features would help you create engaging content?
"""


def test_simulation_api():
    """Test the simulation API endpoint."""
    print("🧪 Testing Database Persistence Fix")
    print("=" * 50)

    # Prepare the request
    url = "http://localhost:8000/api/research/simulation-bridge/simulate"

    payload = {
        "raw_questionnaire_content": TEST_QUESTIONNAIRE,
        "config": {
            "depth": "detailed",
            "response_style": "realistic",
            "max_personas_per_stakeholder": 2,
        },
    }

    print(f"📤 Sending simulation request to: {url}")
    print(f"📋 Questionnaire length: {len(TEST_QUESTIONNAIRE)} characters")

    try:
        # Send the request
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=300)  # 5 minute timeout
        duration = time.time() - start_time

        print(f"⏱️  Request completed in {duration:.2f} seconds")
        print(f"📊 Response status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print("✅ Simulation completed successfully!")
            print(f"   - Simulation ID: {result.get('simulation_id', 'N/A')}")
            print(f"   - Success: {result.get('success', False)}")
            print(f"   - Message: {result.get('message', 'N/A')}")

            # Check if we have personas and interviews
            personas = result.get("personas", [])
            interviews = result.get("interviews", [])

            print(f"   - Personas generated: {len(personas)}")
            print(f"   - Interviews completed: {len(interviews)}")

            if personas:
                print("   - Sample persona names:")
                for i, persona in enumerate(personas[:3]):  # Show first 3
                    name = persona.get("name", "Unknown")
                    role = persona.get("stakeholder_type", "Unknown")
                    print(f"     {i+1}. {name} ({role})")

            return result.get("simulation_id")

        else:
            print(f"❌ Simulation failed with status {response.status_code}")
            print(f"   Response: {response.text}")
            return None

    except requests.exceptions.Timeout:
        print("⏰ Request timed out after 5 minutes")
        return None
    except requests.exceptions.RequestException as e:
        print(f"🔌 Request failed: {str(e)}")
        return None
    except Exception as e:
        print(f"💥 Unexpected error: {str(e)}")
        return None


def test_simulation_retrieval(simulation_id):
    """Test retrieving the simulation from the completed endpoint."""
    if not simulation_id:
        print("⏭️  Skipping retrieval test (no simulation ID)")
        return

    print(f"\n🔍 Testing Simulation Retrieval")
    print("-" * 30)

    url = f"http://localhost:8000/api/research/simulation-bridge/completed"

    try:
        response = requests.get(url, timeout=30)
        print(f"📊 Response status: {response.status_code}")

        if response.status_code == 200:
            completed_sims = response.json()
            print(f"✅ Found {len(completed_sims)} completed simulations")

            # Check if our simulation is in the list
            found_our_sim = False
            for sim_id, sim_data in completed_sims.items():
                if sim_id == simulation_id:
                    found_our_sim = True
                    print(f"🎯 Found our simulation: {sim_id}")
                    print(f"   - Personas: {len(sim_data.get('personas', []))}")
                    print(f"   - Interviews: {len(sim_data.get('interviews', []))}")
                    break

            if not found_our_sim:
                print(f"⚠️  Our simulation {simulation_id} not found in completed list")
                print("   This might indicate a database persistence issue")

        else:
            print(
                f"❌ Failed to retrieve completed simulations: {response.status_code}"
            )
            print(f"   Response: {response.text}")

    except Exception as e:
        print(f"💥 Error retrieving simulations: {str(e)}")


def main():
    """Run the database persistence test."""
    print("🚀 Starting Database Persistence Test")
    print("This will test if simulations are properly saved to the database")
    print()

    # Test 1: Run a simulation
    simulation_id = test_simulation_api()

    # Test 2: Try to retrieve it
    test_simulation_retrieval(simulation_id)

    print("\n" + "=" * 50)
    if simulation_id:
        print("🎉 Test completed! Check the logs above for any issues.")
        print(f"💾 Simulation ID for reference: {simulation_id}")
    else:
        print("❌ Test failed - simulation did not complete successfully")
    print("=" * 50)


if __name__ == "__main__":
    main()
