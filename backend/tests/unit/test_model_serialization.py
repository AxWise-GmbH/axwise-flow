#!/usr/bin/env python3
"""
Test script to verify model serialization is working correctly.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.api.routes.customer_research import ResearchQuestions
import json

def test_model_serialization():
    """Test that ResearchQuestions model preserves stakeholder questions."""
    
    print("🧪 Testing ResearchQuestions model serialization...")
    
    # Create test data with stakeholder questions
    test_stakeholder_data = {
        "primary": [
            {
                "name": "Test Primary Stakeholder",
                "description": "A test primary stakeholder",
                "questions": {
                    "problemDiscovery": ["Question 1", "Question 2"],
                    "solutionValidation": ["Question 3", "Question 4"],
                    "followUp": ["Question 5"]
                }
            }
        ],
        "secondary": [
            {
                "name": "Test Secondary Stakeholder", 
                "description": "A test secondary stakeholder",
                "questions": {
                    "problemDiscovery": ["Question 6", "Question 7"],
                    "solutionValidation": ["Question 8", "Question 9"],
                    "followUp": ["Question 10"]
                }
            }
        ]
    }
    
    test_time_data = {
        "totalQuestions": 10,
        "min": 20,
        "max": 40
    }
    
    # Create ResearchQuestions object
    research_questions = ResearchQuestions(
        problemDiscovery=["General Q1", "General Q2"],
        solutionValidation=["General Q3", "General Q4"],
        followUp=["General Q5"],
        stakeholders=test_stakeholder_data,
        estimatedTime=test_time_data
    )
    
    print("✅ ResearchQuestions object created successfully")
    
    # Test model_dump()
    try:
        dumped_data = research_questions.model_dump()
        print("✅ model_dump() successful")
        
        print(f"\n📋 Dumped data structure:")
        print(f"   Keys: {list(dumped_data.keys())}")
        
        # Check stakeholders
        if 'stakeholders' in dumped_data:
            stakeholders = dumped_data['stakeholders']
            print(f"   Stakeholders type: {type(stakeholders)}")
            
            if isinstance(stakeholders, dict):
                print(f"   Primary stakeholders: {len(stakeholders.get('primary', []))}")
                print(f"   Secondary stakeholders: {len(stakeholders.get('secondary', []))}")
                
                # Check if questions are preserved
                for i, stakeholder in enumerate(stakeholders.get('primary', [])):
                    print(f"   Primary {i+1}: {stakeholder.get('name', 'Unknown')}")
                    if 'questions' in stakeholder:
                        questions = stakeholder['questions']
                        print(f"      ✅ Has questions: {type(questions)}")
                        print(f"      Problem Discovery: {len(questions.get('problemDiscovery', []))}")
                        print(f"      Solution Validation: {len(questions.get('solutionValidation', []))}")
                        print(f"      Follow-up: {len(questions.get('followUp', []))}")
                    else:
                        print(f"      ❌ No questions found")
        else:
            print("   ❌ No stakeholders in dumped data")
        
        # Test JSON serialization
        try:
            json_str = json.dumps(dumped_data, indent=2)
            print("✅ JSON serialization successful")
            
            # Test JSON deserialization
            parsed_data = json.loads(json_str)
            print("✅ JSON deserialization successful")
            
            # Verify questions are still there after JSON round-trip
            if 'stakeholders' in parsed_data:
                stakeholders = parsed_data['stakeholders']
                primary_stakeholder = stakeholders.get('primary', [{}])[0]
                if 'questions' in primary_stakeholder:
                    questions = primary_stakeholder['questions']
                    print(f"✅ Questions preserved after JSON round-trip: {len(questions.get('problemDiscovery', []))} problem discovery questions")
                else:
                    print("❌ Questions lost after JSON round-trip")
            
            print(f"\n📄 JSON output (first 1000 chars):")
            print(json_str[:1000] + "..." if len(json_str) > 1000 else json_str)
            
        except Exception as e:
            print(f"❌ JSON serialization failed: {e}")
        
    except Exception as e:
        print(f"❌ model_dump() failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_model_serialization()
