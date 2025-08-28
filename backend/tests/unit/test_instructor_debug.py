#!/usr/bin/env python3
"""
Debug test for Instructor integration to see what's actually being returned.
"""

import os
import sys
import asyncio
import json
from pydantic import BaseModel
from typing import List, Dict, Any

# Add the project root to the path
sys.path.append('/Users/admin/Documents/DesignThinkingAgentAI')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
from backend.models.comprehensive_questions import ComprehensiveQuestions

async def test_instructor_debug():
    """Test what Instructor is actually returning."""
    
    print("🧪 DEBUGGING INSTRUCTOR INTEGRATION")
    print("=" * 60)
    
    try:
        # Initialize the client
        print("1. Initializing Instructor client...")
        client = InstructorGeminiClient()
        print("✅ Client initialized successfully")
        
        # Simple test prompt
        prompt = """Generate comprehensive customer research questions for this business:

BUSINESS CONTEXT:
- Business Idea: Community hub cafe in Bremen Nord with cozy atmosphere, book clubs, local events, board games, study area, workshops, and art displays
- Target Customer: Young professionals, students, and families who want a place to work remotely, study, meet friends, and participate in community activities
- Problem: Bremen Nord lacks a proper community gathering space where people can work, socialize, and attend events. Most cafes are just for quick coffee, not for staying and connecting.
- Industry: hospitality

You must create a structured response with the following format:

PRIMARY STAKEHOLDERS (create exactly 3 stakeholder objects):
- Young Professionals: Create a stakeholder object with name "Young Professionals", a detailed description of their role/relationship to the business, and specific questions
- Students: Create a stakeholder object with name "Students", a detailed description of their role/relationship to the business, and specific questions
- Families: Create a stakeholder object with name "Families", a detailed description of their role/relationship to the business, and specific questions

SECONDARY STAKEHOLDERS (create exactly 2 stakeholder objects):
- Local Business Owners: Create a stakeholder object with name "Local Business Owners", a detailed description of their role/relationship to the business, and specific questions
- Community Organizations: Create a stakeholder object with name "Community Organizations", a detailed description of their role/relationship to the business, and specific questions

For EACH stakeholder, you must provide:
1. name: The exact stakeholder name (e.g., "Young Professionals")
2. description: A detailed description of this stakeholder's role and relationship to the business (50-150 words)
3. questions: An object containing three arrays:
   - problemDiscovery: 5 specific questions to understand their current challenges
   - solutionValidation: 5 specific questions to validate the solution with them
   - followUp: 3 specific questions for additional insights

CRITICAL REQUIREMENTS:
- Each stakeholder MUST have a non-empty "name" field
- Each stakeholder MUST have a detailed "description" field explaining their role
- Each stakeholder MUST have a "questions" object with all three question arrays
- Questions must be specific to each stakeholder's perspective and role
- Use the exact business context: Community hub cafe for Young professionals, students, and families solving Bremen Nord lacks a proper community gathering space
- Make questions actionable and specific to this business situation
- Avoid generic questions - tailor them to each stakeholder's unique perspective

The response must be a valid JSON structure matching the ComprehensiveQuestions schema with primaryStakeholders, secondaryStakeholders, and timeEstimate fields."""
        
        print("2. Testing comprehensive question generation...")
        print(f"📝 Prompt length: {len(prompt)} characters")
        
        # Test the generation
        result = await client.generate_with_model_async(
            prompt=prompt,
            model_class=ComprehensiveQuestions,
            system_instruction="You are an expert customer research consultant. You must generate a complete ComprehensiveQuestions object with properly structured stakeholder objects. Each stakeholder must have a name, description, and questions object with problemDiscovery, solutionValidation, and followUp arrays. Never return empty objects or null values.",
            temperature=0.1
        )
        
        print("✅ Question generation successful!")
        print(f"📊 Result type: {type(result)}")
        print(f"📊 Primary stakeholders: {len(result.primaryStakeholders)}")
        print(f"📊 Secondary stakeholders: {len(result.secondaryStakeholders)}")
        
        # Convert to dict and print the structure
        result_dict = result.dict()
        print("\n🔍 DETAILED RESULT ANALYSIS:")
        print("=" * 40)
        
        print(f"\n📋 Primary Stakeholders ({len(result_dict.get('primaryStakeholders', []))}):")
        for i, stakeholder in enumerate(result_dict.get('primaryStakeholders', []), 1):
            print(f"   {i}. Name: '{stakeholder.get('name', 'MISSING')}'")
            print(f"      Description: '{stakeholder.get('description', 'MISSING')[:100]}...'")
            questions = stakeholder.get('questions', {})
            print(f"      Problem Discovery: {len(questions.get('problemDiscovery', []))} questions")
            print(f"      Solution Validation: {len(questions.get('solutionValidation', []))} questions")
            print(f"      Follow-up: {len(questions.get('followUp', []))} questions")
            
            # Show first question from each category
            if questions.get('problemDiscovery'):
                print(f"      Sample Problem Q: '{questions['problemDiscovery'][0][:80]}...'")
            if questions.get('solutionValidation'):
                print(f"      Sample Solution Q: '{questions['solutionValidation'][0][:80]}...'")
            print()
        
        print(f"\n📋 Secondary Stakeholders ({len(result_dict.get('secondaryStakeholders', []))}):")
        for i, stakeholder in enumerate(result_dict.get('secondaryStakeholders', []), 1):
            print(f"   {i}. Name: '{stakeholder.get('name', 'MISSING')}'")
            print(f"      Description: '{stakeholder.get('description', 'MISSING')[:100]}...'")
            questions = stakeholder.get('questions', {})
            print(f"      Problem Discovery: {len(questions.get('problemDiscovery', []))} questions")
            print(f"      Solution Validation: {len(questions.get('solutionValidation', []))} questions")
            print(f"      Follow-up: {len(questions.get('followUp', []))} questions")
            print()
        
        # Time estimate
        time_estimate = result_dict.get('timeEstimate', {})
        print(f"📊 Time Estimate:")
        print(f"   Total Questions: {time_estimate.get('totalQuestions', 'MISSING')}")
        print(f"   Estimated Minutes: {time_estimate.get('estimatedMinutes', 'MISSING')}")
        
        # Save full result to file for inspection
        with open('instructor_debug_result.json', 'w') as f:
            json.dump(result_dict, f, indent=2)
        print(f"\n💾 Full result saved to instructor_debug_result.json")
        
        return result
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print(f"❌ Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    asyncio.run(test_instructor_debug())
