#!/usr/bin/env python3
"""
Test LLM-based stakeholder intelligence to verify it correctly identifies
when secondary stakeholders are needed vs. when they're not.
"""

import asyncio
import sys
import os

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from backend.api.routes.customer_research_v3_rebuilt import CustomerResearchServiceV3Rebuilt
from backend.services.llm import LLMServiceFactory


async def test_llm_stakeholder_intelligence():
    """Test LLM-based stakeholder intelligence with different business scenarios"""
    
    print("🧠 TESTING LLM-BASED STAKEHOLDER INTELLIGENCE")
    print("=" * 80)
    
    # Initialize service and LLM
    service = CustomerResearchServiceV3Rebuilt()
    llm_service = LLMServiceFactory.create("gemini")
    
    # Test scenarios
    test_cases = [
        {
            "name": "Tinder Photography (Should have NO secondary stakeholders)",
            "business_idea": "A specialized photoshooting studio located in Bremen Nord. The studio focuses specifically on creating high-quality, natural, cool, and confident-looking photographs tailored for men to use on the dating app Tinder.",
            "target_customer": "Men residing in the Bremen Nord area who are active users of the Tinder dating app, experiencing difficulties or lack of success on the app due to poor photo quality or style.",
            "expected_secondary": False,
            "reasoning": "Simple local service targeting individuals - no complex decision making process"
        },
        {
            "name": "B2B SaaS Platform (Should have secondary stakeholders)",
            "business_idea": "A project management platform for enterprise teams with advanced analytics and integration capabilities",
            "target_customer": "Project managers and team leads in medium to large companies",
            "expected_secondary": True,
            "reasoning": "B2B service with multiple decision makers (IT, procurement, executives)"
        },
        {
            "name": "Local Haircut Service (Should have NO secondary stakeholders)",
            "business_idea": "A mobile barber service that comes to your home or office for convenient haircuts",
            "target_customer": "Busy professionals who don't have time to visit a traditional barbershop",
            "expected_secondary": False,
            "reasoning": "Simple personal service targeting individuals"
        },
        {
            "name": "Healthcare Platform (Should have secondary stakeholders)",
            "business_idea": "A telemedicine platform connecting patients with specialists for remote consultations",
            "target_customer": "Patients needing specialist care in rural areas",
            "expected_secondary": True,
            "reasoning": "Healthcare involves patients, providers, administrators, insurance"
        },
        {
            "name": "Personal Training (Should have NO secondary stakeholders)",
            "business_idea": "One-on-one personal training sessions focused on weight loss and fitness goals",
            "target_customer": "Individuals looking to lose weight and improve their fitness",
            "expected_secondary": False,
            "reasoning": "Direct personal service to individuals"
        }
    ]
    
    results = []
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n📋 TEST {i}/5: {test_case['name']}")
        print(f"Business: {test_case['business_idea'][:100]}...")
        print(f"Customer: {test_case['target_customer'][:100]}...")
        print(f"Expected Secondary Stakeholders: {test_case['expected_secondary']}")
        
        try:
            # Test the LLM intelligence
            should_have_secondary = await service._should_generate_secondary_stakeholders_llm(
                test_case['business_idea'], 
                test_case['target_customer'], 
                llm_service
            )
            
            # Test stakeholder generation
            stakeholders = await service._get_contextual_secondary_stakeholders_with_llm_intelligence(
                test_case['business_idea'],
                test_case['target_customer'],
                llm_service
            )
            
            # Evaluate results
            correct_prediction = should_have_secondary == test_case['expected_secondary']
            stakeholder_count = len(stakeholders)
            
            print(f"🤖 LLM Decision: {'Needs secondary stakeholders' if should_have_secondary else 'No secondary stakeholders needed'}")
            print(f"📊 Generated Stakeholders: {stakeholder_count}")
            
            if stakeholders:
                for stakeholder in stakeholders:
                    print(f"   - {stakeholder.get('name', 'Unknown')}: {stakeholder.get('description', 'No description')[:80]}...")
            
            if correct_prediction:
                print(f"✅ CORRECT: LLM made the right decision")
            else:
                print(f"❌ INCORRECT: Expected {test_case['expected_secondary']}, got {should_have_secondary}")
            
            results.append({
                "name": test_case['name'],
                "expected": test_case['expected_secondary'],
                "actual": should_have_secondary,
                "correct": correct_prediction,
                "stakeholder_count": stakeholder_count,
                "stakeholders": stakeholders
            })
            
        except Exception as e:
            print(f"❌ ERROR: {e}")
            results.append({
                "name": test_case['name'],
                "expected": test_case['expected_secondary'],
                "actual": None,
                "correct": False,
                "error": str(e)
            })
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 LLM STAKEHOLDER INTELLIGENCE TEST SUMMARY")
    print("=" * 80)
    
    correct_count = sum(1 for r in results if r.get('correct', False))
    total_count = len(results)
    accuracy = (correct_count / total_count) * 100 if total_count > 0 else 0
    
    print(f"\n🎯 ACCURACY: {correct_count}/{total_count} ({accuracy:.1f}%)")
    
    print(f"\n📋 DETAILED RESULTS:")
    for result in results:
        status = "✅" if result.get('correct') else "❌"
        expected = result['expected']
        actual = result.get('actual', 'ERROR')
        print(f"   {status} {result['name']}: Expected {expected}, Got {actual}")
    
    print(f"\n🎉 IMPACT:")
    print(f"   - Prevents ridiculous stakeholders like 'Tinder Platform'")
    print(f"   - Intelligently detects simple vs. complex businesses")
    print(f"   - Reduces noise in customer research questionnaires")
    print(f"   - Improves user experience by focusing on relevant stakeholders")
    
    if accuracy >= 80:
        print(f"\n🎉 SUCCESS: LLM stakeholder intelligence is working well!")
    else:
        print(f"\n⚠️ NEEDS IMPROVEMENT: LLM accuracy is below 80%")


if __name__ == "__main__":
    asyncio.run(test_llm_stakeholder_intelligence())
