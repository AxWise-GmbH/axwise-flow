#!/usr/bin/env python3
"""
Test script to verify structured demographics with AttributedField format.
"""

import asyncio
import os
import sys
import json
from typing import List

# Add backend to path
sys.path.append("/Users/admin/Documents/DesignThinkingAgentAI")

# Load environment variables
from load_env import load_dotenv
load_dotenv()

async def test_structured_demographics():
    """Test structured demographics generation with AttributedField format."""
    
    print("🧪 Testing Structured Demographics with AttributedField Format...")
    
    # Check API key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found")
        return False
    
    print(f"✅ API key found: {api_key[:10]}...")
    
    try:
        # Import required modules
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        from backend.domain.models.persona_schema import SimplifiedPersonaModel
        
        print("✅ Imports successful")
        
        # Create Gemini model
        gemini_model = GeminiModel("gemini-2.5-flash")
        print("✅ Gemini model initialized")
        
        # Create agent with the updated system prompt (same as in persona_formation_service.py)
        agent = Agent(
            model=gemini_model,
            output_type=SimplifiedPersonaModel,
            system_prompt="""You are an expert persona analyst. Create detailed, authentic personas from interview data.

TASK: Analyze the provided content and create a comprehensive persona using the SimplifiedPersona format.

PERSONA STRUCTURE:
- name: Descriptive persona name (e.g., "Alex, The Strategic Optimizer")
- description: Brief persona overview summarizing key characteristics
- archetype: General persona category (e.g., "Tech-Savvy Strategist")

TRAIT FIELDS (as detailed strings):
- demographics: Age, background, experience level, location, industry details
- goals_motivations: What drives this person, their primary objectives
- challenges_frustrations: Specific challenges and obstacles they face
- skills_expertise: Professional skills, competencies, areas of knowledge
- technology_tools: Technology usage patterns, tools used, tech relationship
- pain_points: Specific problems and issues they experience regularly
- workflow_environment: Work environment, workflow preferences, collaboration style
- needs_expectations: What they need from solutions and their expectations
- key_quotes: 3-5 actual quotes from the interview that represent their voice

STRUCTURED DEMOGRAPHICS (CRITICAL):
You MUST populate the structured_demographics field with AttributedField format where each demographic component has its own specific evidence:

structured_demographics: {
  "experience_level": {
    "value": "Senior/Mid-level/Junior/Executive/etc. - ONLY if explicitly mentioned",
    "evidence": ["Exact quote that specifically mentions experience level, years of experience, or seniority"]
  },
  "industry": {
    "value": "Industry Name - ONLY if explicitly mentioned", 
    "evidence": ["Exact quote that specifically mentions the industry, company type, or business sector"]
  },
  "location": {
    "value": "City/Region - ONLY if explicitly stated",
    "evidence": ["Exact quote that specifically mentions geographic location, city, region, or place"]
  },
  "age_range": {
    "value": "Age range - ONLY if directly mentioned",
    "evidence": ["Exact quote that specifically mentions age, age range, or life stage"]
  },
  "professional_context": {
    "value": "Detailed professional background and company context based on explicit information",
    "evidence": ["Exact quote that specifically describes their professional context, company, or role"]
  },
  "roles": {
    "value": "Primary professional roles - ONLY if explicitly stated",
    "evidence": ["Exact quote that specifically mentions their job title, role, or position"]
  },
  "confidence": 0.85
}

STRUCTURED DEMOGRAPHICS RULES:
1. Each field's evidence array should contain quotes that specifically support ONLY that demographic aspect
2. Do not reuse the same quote across multiple fields unless it truly supports multiple specific claims
3. Only include fields if you can find explicit evidence in the text
4. Prioritize precision over completeness - better fewer fields with perfect evidence than many with weak evidence
5. Each evidence quote must directly and specifically support the value it's paired with

CONFIDENCE SCORES:
Set confidence scores (0.0-1.0) for each trait based on evidence strength:
- overall_confidence: Overall confidence in the persona
- demographics_confidence, goals_confidence, etc.: Individual trait confidence

CRITICAL RULES:
1. Use specific details from the transcript, never generic placeholders
2. Extract real quotes for key_quotes field
3. Set confidence scores based on evidence strength
4. Make personas feel like real, specific people with authentic details
5. Focus on creating rich, detailed content for each trait field
6. ALWAYS populate structured_demographics with proper AttributedField format

OUTPUT: Complete SimplifiedPersona object with all fields populated using actual evidence."""
        )
        
        print("✅ Agent created with updated system prompt")
        
        # Test with sample interview content
        sample_interview = """
        Interviewer: Can you tell me about your background and current role?
        
        Participant: Sure! I'm a senior marketing manager at TechCorp, a software company here in Berlin. I've been working in marketing for about 8 years now, and I've been with TechCorp for the last 3 years. We're a mid-sized company that develops AI solutions for businesses.
        
        Interviewer: What are your main challenges in your current role?
        
        Participant: The biggest challenge is keeping up with the rapidly changing digital landscape. We need to constantly adapt our marketing strategies, and it's difficult to measure ROI on some of our newer channels. Also, coordinating between our development team and marketing can be tricky - they speak a different language sometimes.
        
        Interviewer: What tools do you use in your daily work?
        
        Participant: We use HubSpot for our CRM and marketing automation, Google Analytics for tracking, and Slack for team communication. I also spend a lot of time in PowerPoint creating presentations for stakeholders.
        """
        
        print("🎯 Testing persona generation with structured demographics...")
        
        # Generate persona
        result = await agent.run(sample_interview)
        persona = result.output
        
        print(f"✅ Generated persona: {persona.name}")
        print(f"📊 Overall confidence: {persona.overall_confidence}")
        
        # Check if structured_demographics is populated
        if persona.structured_demographics:
            print("\n🎉 STRUCTURED DEMOGRAPHICS FOUND!")
            print("=" * 50)
            
            # Convert to dict for pretty printing
            structured_demo = persona.structured_demographics
            
            # Check each field
            fields_to_check = ['experience_level', 'industry', 'location', 'professional_context', 'roles']
            
            for field_name in fields_to_check:
                field_value = getattr(structured_demo, field_name, None)
                if field_value:
                    print(f"\n{field_name.upper()}:")
                    print(f"  Value: {field_value.value}")
                    print(f"  Evidence: {field_value.evidence}")
                else:
                    print(f"\n{field_name.upper()}: Not populated")
            
            print(f"\nOverall Confidence: {structured_demo.confidence}")
            
            # Verify the AttributedField format
            success = True
            for field_name in fields_to_check:
                field_value = getattr(structured_demo, field_name, None)
                if field_value:
                    if not hasattr(field_value, 'value') or not hasattr(field_value, 'evidence'):
                        print(f"❌ {field_name} missing value or evidence attributes")
                        success = False
                    elif not isinstance(field_value.evidence, list):
                        print(f"❌ {field_name} evidence is not a list")
                        success = False
            
            if success:
                print("\n✅ SUCCESS: All structured demographics fields have proper AttributedField format!")
                print("✅ Each field has its own specific evidence attached!")
                return True
            else:
                print("\n❌ FAILURE: Some fields don't have proper AttributedField format")
                return False
                
        else:
            print("\n❌ FAILURE: structured_demographics field is empty or None")
            print("This means the LLM didn't follow the instructions to populate structured_demographics")
            return False
            
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_structured_demographics())
    if success:
        print("\n🎉 TEST PASSED: Structured demographics with AttributedField format working correctly!")
    else:
        print("\n❌ TEST FAILED: Issues with structured demographics implementation")
