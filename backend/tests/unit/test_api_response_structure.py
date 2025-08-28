#!/usr/bin/env python3
"""
Test script to verify the actual API response structure from the backend.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.api.routes.customer_research import (
    generate_research_questions,
    ResearchContext,
    Message
)
from backend.services.llm import LLMServiceFactory
import asyncio
import json

async def test_api_response_structure():
    """Test the actual API response structure."""
    
    print("🧪 Testing API response structure...")
    
    # Create test context
    context = ResearchContext(
        businessIdea="laundromat network in Bremen",
        targetCustomer="Grannies in Bremen Nord, apartment residents, students", 
        problem="lack of nearby laundromats, difficulty with large items like duvets and blankets, heavy loads"
    )
    
    # Create test conversation history
    conversation_history = [
        Message(
            id="1",
            content="I want to open laundromat network",
            role="user",
            timestamp="2024-01-01T00:00:00Z"
        ),
        Message(
            id="2", 
            content="Apartment residents and students, Both individuals and businesses, Primarily apartment dwellers - but mainly Grannies in Bremen",
            role="user",
            timestamp="2024-01-01T00:01:00Z"
        )
    ]
    
    try:
        # Create LLM service (this will likely fail, but we want to see the fallback)
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        
        print("📤 Calling generate_research_questions...")
        
        # Call the function
        result = await generate_research_questions(
            llm_service=llm_service,
            context=context,
            conversation_history=conversation_history
        )
        
        print("✅ Questions generated successfully!")
        
        # Convert to dict to see the structure
        if hasattr(result, 'model_dump'):
            result_dict = result.model_dump()
        elif hasattr(result, 'dict'):
            result_dict = result.dict()
        else:
            result_dict = result.__dict__
        
        print(f"\n📋 Response structure:")
        print(f"   Type: {type(result)}")
        print(f"   Keys: {list(result_dict.keys())}")
        
        # Check basic questions
        print(f"\n🔍 Basic Questions:")
        print(f"   Problem Discovery: {len(result_dict.get('problemDiscovery', []))} questions")
        print(f"   Solution Validation: {len(result_dict.get('solutionValidation', []))} questions")
        print(f"   Follow-up: {len(result_dict.get('followUp', []))} questions")
        
        # Check stakeholder data
        if 'stakeholders' in result_dict:
            stakeholders = result_dict['stakeholders']
            print(f"\n👥 Stakeholders:")
            print(f"   Type: {type(stakeholders)}")
            if isinstance(stakeholders, dict):
                print(f"   Primary: {len(stakeholders.get('primary', []))} stakeholders")
                print(f"   Secondary: {len(stakeholders.get('secondary', []))} stakeholders")
                
                # Check if primary stakeholders have questions
                for i, stakeholder in enumerate(stakeholders.get('primary', [])):
                    print(f"   Primary {i+1}: {stakeholder.get('name', 'Unknown')}")
                    if 'questions' in stakeholder:
                        questions = stakeholder['questions']
                        print(f"      Questions: {len(questions.get('problemDiscovery', []))} + {len(questions.get('solutionValidation', []))} + {len(questions.get('followUp', []))}")
                    else:
                        print(f"      ❌ No questions found in stakeholder object")
        else:
            print("❌ No stakeholders found in response")
        
        # Check time estimation
        if 'estimatedTime' in result_dict:
            time_est = result_dict['estimatedTime']
            print(f"\n⏱️ Time Estimation:")
            print(f"   Type: {type(time_est)}")
            print(f"   Total questions: {time_est.get('totalQuestions', 0)}")
            print(f"   Min time: {time_est.get('min', 0)}")
            print(f"   Max time: {time_est.get('max', 0)}")
        else:
            print("❌ No time estimation found in response")
        
        # Print full structure (truncated)
        print(f"\n📄 Full response structure (first 2000 chars):")
        full_json = json.dumps(result_dict, indent=2)
        print(full_json[:2000] + "..." if len(full_json) > 2000 else full_json)
        
        return result_dict
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    asyncio.run(test_api_response_structure())
