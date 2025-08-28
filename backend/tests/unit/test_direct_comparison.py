#!/usr/bin/env python3
"""
Test script to directly compare comprehensive result vs final API response.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.api.routes.customer_research import (
    generate_comprehensive_research_questions,
    generate_research_questions,
    ResearchContext,
    Message
)
from backend.services.llm import LLMServiceFactory
import asyncio
import json

async def test_direct_comparison():
    """Test both functions directly and compare results."""
    
    print("🔍 DIRECT COMPARISON TEST")
    print("=" * 60)
    
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
        # Create LLM service
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        
        print("📤 Step 1: Testing comprehensive question generation...")
        
        # Call comprehensive function directly
        comprehensive_result = await generate_comprehensive_research_questions(
            llm_service=llm_service,
            context=context,
            conversation_history=conversation_history,
        )
        
        print("✅ Comprehensive result generated!")
        
        # Analyze comprehensive result
        primary_stakeholders = comprehensive_result.get("primaryStakeholders", [])
        print(f"\n📋 COMPREHENSIVE RESULT:")
        print(f"   Primary stakeholders: {len(primary_stakeholders)}")
        
        comprehensive_has_questions = True
        for i, stakeholder in enumerate(primary_stakeholders):
            name = stakeholder.get('name', 'Unknown')
            has_questions = 'questions' in stakeholder
            print(f"   {i+1}. {name}: {'✅ HAS questions' if has_questions else '❌ NO questions'}")
            if has_questions:
                questions = stakeholder['questions']
                total = len(questions.get('problemDiscovery', [])) + len(questions.get('solutionValidation', [])) + len(questions.get('followUp', []))
                print(f"      Total questions: {total}")
            else:
                comprehensive_has_questions = False
        
        print(f"\n📤 Step 2: Testing research questions wrapper...")
        
        # Call wrapper function
        research_questions = await generate_research_questions(
            llm_service=llm_service,
            context=context,
            conversation_history=conversation_history,
        )
        
        print("✅ Research questions generated!")
        
        # Analyze research questions result
        if hasattr(research_questions, 'model_dump'):
            result_dict = research_questions.model_dump()
        elif hasattr(research_questions, 'dict'):
            result_dict = research_questions.dict()
        else:
            result_dict = research_questions.__dict__
        
        print(f"\n📋 RESEARCH QUESTIONS RESULT:")
        print(f"   Keys: {list(result_dict.keys())}")
        
        if 'stakeholders' in result_dict:
            stakeholders = result_dict['stakeholders']
            primary_stakeholders_final = stakeholders.get('primary', [])
            print(f"   Primary stakeholders: {len(primary_stakeholders_final)}")
            
            final_has_questions = True
            for i, stakeholder in enumerate(primary_stakeholders_final):
                name = stakeholder.get('name', 'Unknown')
                has_questions = 'questions' in stakeholder
                print(f"   {i+1}. {name}: {'✅ HAS questions' if has_questions else '❌ NO questions'}")
                if has_questions:
                    questions = stakeholder['questions']
                    total = len(questions.get('problemDiscovery', [])) + len(questions.get('solutionValidation', [])) + len(questions.get('followUp', []))
                    print(f"      Total questions: {total}")
                else:
                    final_has_questions = False
        else:
            print("   ❌ No stakeholders found in final result")
            final_has_questions = False
        
        print(f"\n🔍 COMPARISON SUMMARY:")
        print(f"   Comprehensive result has questions: {'✅ YES' if comprehensive_has_questions else '❌ NO'}")
        print(f"   Final result has questions: {'✅ YES' if final_has_questions else '❌ NO'}")
        
        if comprehensive_has_questions and not final_has_questions:
            print(f"   🚨 ISSUE IDENTIFIED: Questions lost in wrapper function!")
        elif comprehensive_has_questions and final_has_questions:
            print(f"   ✅ SUCCESS: Questions preserved correctly!")
        elif not comprehensive_has_questions:
            print(f"   ⚠️  ROOT CAUSE: Comprehensive function not generating questions")
        
        # Show sample data from both
        print(f"\n📄 SAMPLE DATA COMPARISON:")
        if primary_stakeholders and 'questions' in primary_stakeholders[0]:
            comp_questions = primary_stakeholders[0]['questions']
            print(f"   Comprehensive sample: {comp_questions.get('problemDiscovery', ['None'])[0][:80]}...")
        
        if 'stakeholders' in result_dict and result_dict['stakeholders'].get('primary'):
            final_stakeholder = result_dict['stakeholders']['primary'][0]
            if 'questions' in final_stakeholder:
                final_questions = final_stakeholder['questions']
                print(f"   Final sample: {final_questions.get('problemDiscovery', ['None'])[0][:80]}...")
            else:
                print(f"   Final sample: NO QUESTIONS FOUND")
        
        return {
            'comprehensive_has_questions': comprehensive_has_questions,
            'final_has_questions': final_has_questions,
            'comprehensive_result': comprehensive_result,
            'final_result': result_dict
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    asyncio.run(test_direct_comparison())
