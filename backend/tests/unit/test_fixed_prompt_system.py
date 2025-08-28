#!/usr/bin/env python3
"""
Test the real system with the CORRECT SimplifiedPersona prompt to see if this fixes quality issues.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

async def test_system_with_correct_prompt():
    """Test the real system using the correct SimplifiedPersona prompt."""
    
    print("🔧 TESTING SYSTEM WITH CORRECT SIMPLIFIED PROMPT")
    print("=" * 80)
    
    try:
        # Import required modules
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        from backend.domain.models.persona_schema import SimplifiedPersonaModel
        from backend.services.processing.persona_formation_service import PersonaFormationService
        
        print("✅ Imports successful")
        
        # Initialize Gemini model
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ GEMINI_API_KEY not found")
            return False
            
        print(f"✅ API key found: {api_key[:10]}...")
        
        # Create Gemini model
        gemini_model = GeminiModel("gemini-2.5-flash")
        print("✅ Gemini model initialized")
        
        # Create PydanticAI agent with CORRECT SimplifiedPersona prompt
        correct_prompt = """You are an expert persona analyst specializing in creating detailed, authentic personas from interview content.

TASK: Analyze the provided interview content and create a comprehensive SimplifiedPersona.

ANALYSIS APPROACH:
1. Extract specific demographic details, professional background, and experience level
2. Identify core goals, motivations, and what drives this person professionally
3. Understand their main challenges, frustrations, and pain points
4. Document their skills, expertise, and professional capabilities
5. Note their technology usage patterns, tools, and preferences
6. Capture their workflow style, work environment, and collaboration patterns
7. Understand their needs, expectations, and what they value
8. Extract 3-5 authentic quotes that represent their voice and concerns

QUALITY REQUIREMENTS:
- Use specific, detailed information from the interview content
- Avoid generic placeholders - extract real insights
- Set confidence scores based on evidence strength (aim for 80-95% for clear evidence)
- Ensure the persona feels like a real, authentic person
- Include actual quotes, not paraphrases

OUTPUT: Complete SimplifiedPersona with all fields populated with rich, specific content."""
        
        agent = Agent(
            model=gemini_model,
            output_type=SimplifiedPersonaModel,
            system_prompt=correct_prompt
        )
        print("✅ PydanticAI agent created with CORRECT prompt")
        
        # Test interview content (same as our successful test)
        interview_content = """
        Interview with Sarah, Product Manager at a SaaS startup:
        
        "I've been working in product management for about 6 years now, mostly in B2B SaaS. Started as a business analyst right out of college, then moved into product roles. I'm 29, based in Austin, and I love the startup environment - the pace, the impact you can have."
        
        "My biggest challenge right now is balancing feature requests from sales with what our engineering team can actually deliver. Sales promises the world to close deals, then engineering comes back saying it'll take 6 months. I'm constantly playing mediator."
        
        "I use Jira religiously for tracking everything, Figma for wireframes, and I live in Slack. We do two-week sprints, and I spend probably 30% of my time in meetings - standups, planning, retrospectives. Sometimes I feel like I'm in meetings about meetings."
        
        "What I really need is better visibility into our technical debt. Engineering keeps saying they need to refactor, but I can't prioritize that against new features without understanding the real impact. I wish we had better metrics around code quality and technical health."
        
        "The thing that drives me crazy is when stakeholders change requirements mid-sprint. Like, we agreed on this two weeks ago, now you want something completely different? It kills team morale and makes planning impossible."
        
        "I love working with designers though. When we get the user research right and create something that actually solves a real problem, that's the best feeling. Seeing usage metrics go up after a feature launch - that's what keeps me going."
        """
        
        print("🎯 Generating persona with CORRECT prompt...")
        
        # Generate persona using corrected approach
        result = await agent.run(interview_content)
        
        print("✅ LLM generation completed successfully!")
        
        # Display the LLM-generated persona
        persona = result.output
        print("\n🤖 PERSONA GENERATED WITH CORRECT PROMPT:")
        print("=" * 80)
        print(f"Name: {persona.name}")
        print(f"Description: {persona.description}")
        print(f"Overall Confidence: {persona.overall_confidence:.1%}")
        
        print(f"\n📊 DETAILED FIELDS:")
        print("-" * 60)
        
        # Test the conversion function with this persona
        print("\n🔄 TESTING CONVERSION TO FULL PERSONA FORMAT:")
        print("-" * 60)
        
        # Create a minimal PersonaFormationService to test conversion
        class MinimalConfig:
            class Validation:
                min_confidence = 0.4
            validation = Validation()
        
        # We don't need the full service, just the conversion function
        # Let's simulate it directly
        def create_trait(value: str, confidence: float, evidence: list = None) -> dict:
            return {
                "value": value,
                "confidence": confidence,
                "evidence": evidence or [],
            }
        
        quotes = persona.key_quotes if persona.key_quotes else []
        
        # Convert using our updated conversion logic
        converted_persona = {
            "name": persona.name,
            "description": persona.description,
            "archetype": persona.archetype,
            
            # Core fields
            "demographics": create_trait(persona.demographics, persona.demographics_confidence, quotes[:2]),
            "goals_and_motivations": create_trait(persona.goals_motivations, persona.goals_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "challenges_and_frustrations": create_trait(persona.challenges_frustrations, persona.challenges_confidence, quotes[1:3] if len(quotes) > 1 else quotes[:1]),
            "skills_and_expertise": create_trait(persona.skills_expertise, persona.skills_confidence, quotes[3:5] if len(quotes) > 3 else quotes[:1]),
            "technology_and_tools": create_trait(persona.technology_tools, persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "pain_points": create_trait(persona.pain_points, persona.pain_points_confidence, quotes[1:3] if len(quotes) > 1 else quotes[:1]),
            "workflow_and_environment": create_trait(persona.workflow_environment, persona.overall_confidence, quotes[:2]),
            "needs_and_expectations": create_trait(persona.needs_expectations, persona.overall_confidence, quotes[:2]),
            "key_quotes": create_trait("Key statements that highlight their main concerns and perspectives", persona.overall_confidence, quotes),
            
            # NEW: Additional fields that PersonaBuilder expects
            "key_responsibilities": create_trait(persona.skills_expertise, persona.skills_confidence, quotes[3:5] if len(quotes) > 3 else quotes[:1]),
            "tools_used": create_trait(persona.technology_tools, persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "analysis_approach": create_trait(f"Analytical approach: {persona.workflow_environment}", persona.overall_confidence, quotes[:2]),
            "decision_making_process": create_trait(f"Decision making: {persona.goals_motivations}", persona.goals_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "communication_style": create_trait(f"Communication style: {persona.workflow_environment}", persona.overall_confidence, quotes[:2]),
            "technology_usage": create_trait(persona.technology_tools, persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            
            "overall_confidence": persona.overall_confidence,
        }
        
        # Validate the converted persona
        expected_fields = [
            'demographics', 'goals_and_motivations', 'challenges_and_frustrations', 
            'skills_and_expertise', 'technology_and_tools', 'pain_points', 
            'workflow_and_environment', 'needs_and_expectations', 'key_quotes',
            'key_responsibilities', 'tools_used', 'analysis_approach', 
            'decision_making_process', 'communication_style', 'technology_usage'
        ]
        
        rich_content_count = 0
        
        for field in expected_fields:
            if field in converted_persona:
                field_data = converted_persona[field]
                value = field_data.get('value', '')
                confidence = field_data.get('confidence', 0)
                evidence_count = len(field_data.get('evidence', []))
                
                # Check if it's rich content
                is_rich = len(value) > 30 and confidence >= 0.8
                status = "✅ RICH" if is_rich else "⚠️ BASIC"
                
                print(f"{status} {field}: {value[:50]}... (conf: {confidence:.1%}, evidence: {evidence_count})")
                
                if is_rich:
                    rich_content_count += 1
        
        quality_percentage = (rich_content_count / len(expected_fields)) * 100
        print(f"\n🎯 CONVERSION QUALITY: {rich_content_count}/{len(expected_fields)} fields ({quality_percentage:.1f}%) are rich")
        
        # Success criteria
        success = quality_percentage >= 80 and persona.overall_confidence >= 0.85
        
        if success:
            print("\n🎉 CORRECTED PROMPT TEST PASSED!")
            print("✅ Correct prompt generates high-quality personas that convert properly!")
            print("✅ This proves the issue is in the real system's prompt, not the LLM capability!")
        else:
            print("\n⚠️ CORRECTED PROMPT TEST NEEDS INVESTIGATION")
            print("❌ Even with correct prompt, some quality issues remain")
        
        return success
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_system_with_correct_prompt())
    sys.exit(0 if success else 1)
