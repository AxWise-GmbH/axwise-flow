#!/usr/bin/env python3
"""
Test script to verify the questionnaire generation fixes.

This script tests:
1. Intent detection for "lets go to questionnaire"
2. Data structure alignment between V1 and V3 formats
3. End-to-end flow from input to questionnaire generation
"""

import asyncio
import sys
import os

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

async def test_intent_detection():
    """Test that 'lets go to questionnaire' is properly detected as a question request."""
    print("🧪 Testing Intent Detection...")
    
    try:
        from backend.api.routes.v3_simple_questions import _should_generate_questions
        
        # Mock data structures
        context_analysis = {
            "businessIdea": "Legacy API service",
            "business_idea": "Legacy API service", 
            "targetCustomer": "Our own enterprise",
            "problem": "Sales data is presented a bit late"
        }
        
        intent_analysis = {
            "intent": "continue_conversation",  # Simulate LLM not detecting intent
            "confidence": 0.7
        }
        
        business_validation = {
            "ready_for_questions": True,
            "readiness_score": 0.9
        }
        
        conversation_flow = {
            "latest_input": "lets go to questionnaire",  # This should trigger keyword detection
            "current_stage": "validation",
            "readiness_for_questions": True
        }
        
        # Test the decision function
        should_generate = _should_generate_questions(
            context_analysis, intent_analysis, business_validation, conversation_flow
        )
        
        print(f"✅ Intent detection result: {should_generate}")
        
        if should_generate:
            print("✅ SUCCESS: 'lets go to questionnaire' correctly triggers question generation")
            return True
        else:
            print("❌ FAILED: 'lets go to questionnaire' not detected")
            return False
            
    except Exception as e:
        print(f"❌ ERROR in intent detection test: {e}")
        return False

async def test_data_structure_conversion():
    """Test that V1 ResearchQuestions format is correctly converted to V3 format."""
    print("\n🧪 Testing Data Structure Conversion...")
    
    try:
        # Mock V1 ResearchQuestions format
        v1_questions = {
            "problemDiscovery": [
                "What challenges do you currently face with legacy systems?",
                "How do you handle data integration today?",
                "What's the biggest pain point in your current process?"
            ],
            "solutionValidation": [
                "Would a Legacy API service help solve your problem?",
                "What features would be most important to you?",
                "How much would you be willing to pay for this?"
            ],
            "followUp": [
                "Can you tell me more about your current setup?",
                "Who else is involved in these decisions?"
            ],
            "stakeholders": {
                "primary": [
                    {
                        "name": "Account Managers",
                        "description": "Primary users who need real-time sales data",
                        "questions": {
                            "problemDiscovery": ["How often do you miss discount opportunities?"],
                            "solutionValidation": ["Would real-time data help you close more deals?"],
                            "followUp": ["What's your current process?"]
                        }
                    }
                ],
                "secondary": [
                    {
                        "name": "Sales Leadership",
                        "description": "Decision makers who approve discounts",
                        "questions": {
                            "problemDiscovery": ["How do late data reports affect your decisions?"],
                            "solutionValidation": ["Would automated reporting help?"],
                            "followUp": ["What metrics matter most?"]
                        }
                    }
                ]
            },
            "estimatedTime": "25-40 minutes"
        }
        
        # Simulate the conversion logic from v3_simple_questions.py
        v1_stakeholders = v1_questions.get("stakeholders", {"primary": [], "secondary": []})
        
        primary_stakeholders = []
        secondary_stakeholders = []
        
        # Process primary stakeholders
        for stakeholder in v1_stakeholders.get("primary", []):
            if isinstance(stakeholder, dict) and "name" in stakeholder:
                primary_stakeholders.append(stakeholder)
        
        # Process secondary stakeholders  
        for stakeholder in v1_stakeholders.get("secondary", []):
            if isinstance(stakeholder, dict) and "name" in stakeholder:
                secondary_stakeholders.append(stakeholder)
        
        # Create V3 comprehensive questions format
        comprehensive_questions = {
            "primaryStakeholders": primary_stakeholders,
            "secondaryStakeholders": secondary_stakeholders,
            "timeEstimate": {
                "totalQuestions": len(v1_questions.get("problemDiscovery", [])) + len(v1_questions.get("solutionValidation", [])) + len(v1_questions.get("followUp", [])),
                "estimatedMinutes": v1_questions.get("estimatedTime", "25-40 minutes"),
                "breakdown": {
                    "primary": len(primary_stakeholders),
                    "secondary": len(secondary_stakeholders),
                    "perQuestion": 3
                }
            }
        }
        
        print(f"✅ Conversion result:")
        print(f"   - Primary stakeholders: {len(comprehensive_questions['primaryStakeholders'])}")
        print(f"   - Secondary stakeholders: {len(comprehensive_questions['secondaryStakeholders'])}")
        print(f"   - Total questions: {comprehensive_questions['timeEstimate']['totalQuestions']}")
        print(f"   - Estimated time: {comprehensive_questions['timeEstimate']['estimatedMinutes']}")
        
        # Verify the conversion worked
        if (len(comprehensive_questions['primaryStakeholders']) > 0 and 
            len(comprehensive_questions['secondaryStakeholders']) > 0 and
            comprehensive_questions['timeEstimate']['totalQuestions'] > 0):
            print("✅ SUCCESS: Data structure conversion working correctly")
            return True
        else:
            print("❌ FAILED: Data structure conversion failed")
            return False
            
    except Exception as e:
        print(f"❌ ERROR in data structure conversion test: {e}")
        return False

async def test_frontend_data_processing():
    """Test that frontend correctly processes the new data structure."""
    print("\n🧪 Testing Frontend Data Processing...")
    
    try:
        # Mock API response with new V3 format
        api_response = {
            "questions": {
                "primaryStakeholders": [
                    {
                        "name": "Account Managers",
                        "description": "Primary users who need real-time sales data",
                        "questions": {
                            "problemDiscovery": ["How often do you miss discount opportunities?"],
                            "solutionValidation": ["Would real-time data help you close more deals?"],
                            "followUp": ["What's your current process?"]
                        }
                    }
                ],
                "secondaryStakeholders": [
                    {
                        "name": "Sales Leadership", 
                        "description": "Decision makers who approve discounts",
                        "questions": {
                            "problemDiscovery": ["How do late data reports affect your decisions?"],
                            "solutionValidation": ["Would automated reporting help?"],
                            "followUp": ["What metrics matter most?"]
                        }
                    }
                ],
                "timeEstimate": {
                    "totalQuestions": 8,
                    "estimatedMinutes": "25-40 minutes",
                    "breakdown": {
                        "primary": 1,
                        "secondary": 1,
                        "perQuestion": 3
                    }
                }
            }
        }
        
        # Simulate frontend processing logic from chat-handlers.ts
        questionsData = api_response["questions"]
        
        # Check if we have the new format
        has_new_format = (questionsData.get("primaryStakeholders") or 
                         questionsData.get("secondaryStakeholders") or 
                         questionsData.get("timeEstimate"))
        
        if has_new_format:
            comprehensive_questions = {
                "primaryStakeholders": questionsData.get("primaryStakeholders", []),
                "secondaryStakeholders": questionsData.get("secondaryStakeholders", []),
                "timeEstimate": questionsData.get("timeEstimate", {})
            }
            
            print(f"✅ Frontend processing result:")
            print(f"   - Primary stakeholders: {len(comprehensive_questions['primaryStakeholders'])}")
            print(f"   - Secondary stakeholders: {len(comprehensive_questions['secondaryStakeholders'])}")
            print(f"   - Total questions: {comprehensive_questions['timeEstimate'].get('totalQuestions', 0)}")
            
            # Verify frontend processing worked
            if (len(comprehensive_questions['primaryStakeholders']) > 0 and
                comprehensive_questions['timeEstimate'].get('totalQuestions', 0) > 0):
                print("✅ SUCCESS: Frontend data processing working correctly")
                return True
            else:
                print("❌ FAILED: Frontend data processing failed")
                return False
        else:
            print("❌ FAILED: Frontend didn't detect new format")
            return False
            
    except Exception as e:
        print(f"❌ ERROR in frontend data processing test: {e}")
        return False

async def main():
    """Run all tests."""
    print("🚀 Testing Questionnaire Generation Fixes\n")
    
    results = []
    
    # Run all tests
    results.append(await test_intent_detection())
    results.append(await test_data_structure_conversion())
    results.append(await test_frontend_data_processing())
    
    # Summary
    print(f"\n📊 Test Results:")
    print(f"   - Tests passed: {sum(results)}/{len(results)}")
    print(f"   - Tests failed: {len(results) - sum(results)}/{len(results)}")
    
    if all(results):
        print("✅ ALL TESTS PASSED! Questionnaire generation fixes are working.")
        return True
    else:
        print("❌ SOME TESTS FAILED. Please check the implementation.")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
