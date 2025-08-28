#!/usr/bin/env python3
"""
Test REAL LLM-generated SimplifiedPersona using PydanticAI + Gemini to see actual content quality.
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

async def test_real_llm_persona_generation():
    """Test actual LLM-generated SimplifiedPersona using the real system."""
    
    print("🤖 TESTING REAL LLM PERSONA GENERATION")
    print("=" * 80)
    
    try:
        # Import required modules
        from pydantic_ai import Agent
        from pydantic_ai.models.gemini import GeminiModel
        from backend.domain.models.persona_schema import SimplifiedPersonaModel
        
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
        
        # Create PydanticAI agent with SimplifiedPersona (same as real system)
        agent = Agent(
            model=gemini_model,
            output_type=SimplifiedPersonaModel,
            system_prompt="""You are an expert persona analyst specializing in creating detailed, authentic personas from interview content.

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
        )
        print("✅ PydanticAI agent created")
        
        # Real interview content (similar to what the system processes)
        interview_content = """
        Interview with Sarah, Product Manager at a SaaS startup:
        
        "I've been working in product management for about 6 years now, mostly in B2B SaaS. Started as a business analyst right out of college, then moved into product roles. I'm 29, based in Austin, and I love the startup environment - the pace, the impact you can have."
        
        "My biggest challenge right now is balancing feature requests from sales with what our engineering team can actually deliver. Sales promises the world to close deals, then engineering comes back saying it'll take 6 months. I'm constantly playing mediator."
        
        "I use Jira religiously for tracking everything, Figma for wireframes, and I live in Slack. We do two-week sprints, and I spend probably 30% of my time in meetings - standups, planning, retrospectives. Sometimes I feel like I'm in meetings about meetings."
        
        "What I really need is better visibility into our technical debt. Engineering keeps saying they need to refactor, but I can't prioritize that against new features without understanding the real impact. I wish we had better metrics around code quality and technical health."
        
        "The thing that drives me crazy is when stakeholders change requirements mid-sprint. Like, we agreed on this two weeks ago, now you want something completely different? It kills team morale and makes planning impossible."
        
        "I love working with designers though. When we get the user research right and create something that actually solves a real problem, that's the best feeling. Seeing usage metrics go up after a feature launch - that's what keeps me going."
        
        "My goal is to eventually move into a VP of Product role, maybe at a Series B company. I want to build and lead a product team, not just manage features. But I need to get better at the strategic stuff - market analysis, competitive positioning, that kind of thing."
        
        "The startup life is intense. I work probably 50-55 hours a week, but I love the ownership and autonomy. In my last corporate job, everything took forever to get approved. Here, if I have a good idea, we can test it next sprint."
        """
        
        print("🎯 Generating persona with real LLM...")
        print(f"📝 Interview content length: {len(interview_content)} characters")
        
        # Generate persona using PydanticAI (same as real system)
        result = await agent.run(interview_content)
        
        print("✅ LLM generation completed successfully!")
        print(f"🔍 Result type: {type(result.output)}")
        
        # Display the LLM-generated persona
        persona = result.output
        print("\n🤖 REAL LLM-GENERATED SIMPLIFIED PERSONA:")
        print("=" * 80)
        print(f"Name: {persona.name}")
        print(f"Description: {persona.description}")
        print(f"Archetype: {persona.archetype}")
        print(f"Overall Confidence: {persona.overall_confidence:.1%}")
        
        print(f"\n📊 DETAILED FIELDS:")
        print("-" * 60)
        print(f"Demographics ({persona.demographics_confidence:.1%}):")
        print(f"  {persona.demographics}")
        
        print(f"\nGoals & Motivations ({persona.goals_confidence:.1%}):")
        print(f"  {persona.goals_motivations}")
        
        print(f"\nChallenges & Frustrations ({persona.challenges_confidence:.1%}):")
        print(f"  {persona.challenges_frustrations}")
        
        print(f"\nSkills & Expertise ({persona.skills_confidence:.1%}):")
        print(f"  {persona.skills_expertise}")
        
        print(f"\nTechnology & Tools ({persona.technology_confidence:.1%}):")
        print(f"  {persona.technology_tools}")
        
        print(f"\nPain Points ({persona.pain_points_confidence:.1%}):")
        print(f"  {persona.pain_points}")
        
        print(f"\nWorkflow & Environment ({persona.overall_confidence:.1%}):")
        print(f"  {persona.workflow_environment}")
        
        print(f"\nNeeds & Expectations ({persona.overall_confidence:.1%}):")
        print(f"  {persona.needs_expectations}")
        
        print(f"\nKey Quotes ({len(persona.key_quotes)} quotes):")
        for i, quote in enumerate(persona.key_quotes, 1):
            print(f"  {i}. \"{quote}\"")
        
        # Analyze content quality
        print(f"\n📈 CONTENT QUALITY ANALYSIS:")
        print("-" * 60)
        
        fields_to_check = [
            ("demographics", persona.demographics, persona.demographics_confidence),
            ("goals_motivations", persona.goals_motivations, persona.goals_confidence),
            ("challenges_frustrations", persona.challenges_frustrations, persona.challenges_confidence),
            ("skills_expertise", persona.skills_expertise, persona.skills_confidence),
            ("technology_tools", persona.technology_tools, persona.technology_confidence),
            ("pain_points", persona.pain_points, persona.pain_points_confidence),
            ("workflow_environment", persona.workflow_environment, persona.overall_confidence),
            ("needs_expectations", persona.needs_expectations, persona.overall_confidence),
        ]
        
        high_quality_count = 0
        total_fields = len(fields_to_check)
        
        for field_name, content, confidence in fields_to_check:
            # Check if content is rich (specific, detailed, not generic)
            is_rich = len(content) > 50 and confidence >= 0.8
            is_specific = any(keyword in content.lower() for keyword in [
                'jira', 'figma', 'slack', 'austin', 'saas', 'startup', 'sprint', 'years', 'months'
            ])
            
            quality = "✅ HIGH" if (is_rich and is_specific) else "⚠️ BASIC"
            if is_rich and is_specific:
                high_quality_count += 1
                
            print(f"{quality} {field_name}: {len(content)} chars, {confidence:.1%} confidence")
        
        quality_percentage = (high_quality_count / total_fields) * 100
        print(f"\n🎯 OVERALL QUALITY: {high_quality_count}/{total_fields} fields ({quality_percentage:.1f}%) are high-quality")
        
        # Success criteria
        success = quality_percentage >= 70 and persona.overall_confidence >= 0.8
        
        if success:
            print("\n🎉 REAL LLM PERSONA GENERATION TEST PASSED!")
            print("✅ LLM generated high-quality, specific content with good confidence scores!")
        else:
            print("\n⚠️ REAL LLM PERSONA GENERATION NEEDS IMPROVEMENT")
            print("❌ Some fields may have generic content or low confidence scores")
        
        return success
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_real_llm_persona_generation())
    sys.exit(0 if success else 1)
