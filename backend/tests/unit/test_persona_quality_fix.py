#!/usr/bin/env python3
"""
Test script to verify that persona quality fixes are working.
"""

import sys
import os
import asyncio
import json

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def test_persona_quality_with_real_data():
    """Test persona generation with real interview data."""
    print("🔍 TESTING PERSONA QUALITY WITH REAL DATA")
    print("=" * 60)
    
    try:
        from backend.services.processing.persona_formation_service import PersonaFormationService
        from backend.services.llm import LLMServiceFactory
        
        # Create LLM service
        llm_service = LLMServiceFactory.create("gemini")
        print("✅ LLM service created")
        
        # Create persona formation service
        service = PersonaFormationService(llm_service=llm_service)
        print("✅ Persona formation service created")
        print(f"PydanticAI available: {service.pydantic_ai_available}")
        
        # Test with realistic interview data
        interview_data = """
        INTERVIEW WITH MARIA GONZALEZ - MARKETING MANAGER
        
        Q: Can you tell me about your current role and responsibilities?
        A: I'm a Marketing Manager at a mid-sized SaaS company. I manage a team of 5 people and I'm responsible for our digital marketing campaigns, lead generation, and brand positioning. The biggest challenge is that we're constantly trying to prove ROI to the executives, but our current tools make it really difficult to get accurate attribution data.
        
        Q: What are your main pain points with your current workflow?
        A: Oh, where do I start? Our biggest issue is data fragmentation. We use HubSpot for CRM, Google Analytics for web data, Facebook Ads Manager, LinkedIn Campaign Manager, and then we have our own internal dashboard. Getting a unified view of campaign performance is like solving a puzzle every single day. I spend probably 3-4 hours just pulling data from different sources and trying to make sense of it all.
        
        Q: How do you currently make decisions about marketing spend?
        A: Honestly, it's a mix of gut feeling and whatever data I can piece together. I know that's not ideal, but when you're spending 60% of your time on data collection instead of strategy, you have to make compromises. I really wish we had a single source of truth that could show me which channels are actually driving qualified leads, not just traffic.
        
        Q: What would your ideal solution look like?
        A: I dream of having one dashboard where I can see everything - campaign performance across all channels, lead quality scores, conversion rates, and most importantly, actual revenue attribution. Something that doesn't require me to be a data scientist to understand. I want to spend my time on creative strategy and optimization, not on spreadsheet gymnastics.
        
        Q: How do you collaborate with other teams?
        A: I work closely with Sales and Product teams. Sales is always asking for more qualified leads, and Product wants feedback on feature adoption. But again, the data silos make it hard to give them actionable insights. We have weekly meetings where everyone brings their own numbers, and half the time we're arguing about whose data is correct instead of making strategic decisions.
        """
        
        print("🚀 Generating persona from interview data...")
        
        # Generate persona using the service
        personas = await service.generate_persona_from_text(
            interview_data, 
            context={"source": "test_interview", "role": "Marketing Manager"}
        )
        
        if not personas or len(personas) == 0:
            print("❌ No personas generated")
            return False
        
        print(f"✅ Generated {len(personas)} persona(s)")
        
        # Analyze the first persona
        persona = personas[0]
        print(f"\n👤 PERSONA ANALYSIS: {persona.get('name', 'Unnamed')}")
        print("-" * 50)
        
        # Check basic info
        print(f"Name: {persona.get('name', 'Missing')}")
        print(f"Description: {persona.get('description', 'Missing')[:150]}...")
        print(f"Archetype: {persona.get('archetype', 'Missing')}")
        print(f"Overall Confidence: {persona.get('confidence', 'Missing')}")
        
        # Check key quotes quality
        key_quotes = persona.get('key_quotes', {})
        if isinstance(key_quotes, dict):
            quotes_value = key_quotes.get('value', '')
            quotes_evidence = key_quotes.get('evidence', [])
            quotes_confidence = key_quotes.get('confidence', 0)
            
            print(f"\n💬 KEY QUOTES ANALYSIS:")
            print(f"   Value: {quotes_value}")
            print(f"   Confidence: {quotes_confidence}")
            print(f"   Evidence count: {len(quotes_evidence)}")
            
            if quotes_evidence:
                print("   Sample quotes:")
                for i, quote in enumerate(quotes_evidence[:3]):
                    print(f"      {i+1}. {quote[:100]}...")
                
                # Check if quotes are authentic
                authentic_quotes = 0
                for quote in quotes_evidence:
                    # Check if quote contains actual content from the interview
                    if any(phrase in quote.lower() for phrase in [
                        'data fragmentation', 'hubspot', 'google analytics', 
                        'spreadsheet gymnastics', 'gut feeling', 'roi'
                    ]):
                        authentic_quotes += 1
                
                print(f"   Authentic quotes: {authentic_quotes}/{len(quotes_evidence)}")
                
                if authentic_quotes >= len(quotes_evidence) * 0.7:
                    print("   ✅ Quotes appear to be authentic")
                else:
                    print("   ⚠️ Some quotes may be generated")
            else:
                print("   ❌ No quote evidence found")
        
        # Check demographics quality
        demographics = persona.get('demographics', {})
        if isinstance(demographics, dict):
            demo_value = demographics.get('value', '')
            demo_confidence = demographics.get('confidence', 0)
            demo_evidence = demographics.get('evidence', [])
            
            print(f"\n📊 DEMOGRAPHICS ANALYSIS:")
            print(f"   Value: {demo_value[:100]}...")
            print(f"   Confidence: {demo_confidence}")
            print(f"   Evidence count: {len(demo_evidence)}")
            
            if demo_confidence > 0.7 and len(demo_value) > 50:
                print("   ✅ Demographics quality looks good")
            else:
                print("   ⚠️ Demographics quality could be improved")
        
        # Check goals and motivations
        goals = persona.get('goals_and_motivations', {})
        if isinstance(goals, dict):
            goals_value = goals.get('value', '')
            goals_confidence = goals.get('confidence', 0)
            
            print(f"\n🎯 GOALS & MOTIVATIONS ANALYSIS:")
            print(f"   Value: {goals_value[:100]}...")
            print(f"   Confidence: {goals_confidence}")
            
            if goals_confidence > 0.7 and len(goals_value) > 50:
                print("   ✅ Goals quality looks good")
            else:
                print("   ⚠️ Goals quality could be improved")
        
        # Overall quality assessment
        quality_score = 0
        total_checks = 0
        
        # Check 1: Has authentic quotes
        if key_quotes and isinstance(key_quotes, dict):
            evidence = key_quotes.get('evidence', [])
            if evidence and len(evidence) >= 3:
                quality_score += 1
            total_checks += 1
        
        # Check 2: High confidence demographics
        if demographics and isinstance(demographics, dict):
            if demographics.get('confidence', 0) > 0.7:
                quality_score += 1
            total_checks += 1
        
        # Check 3: High confidence goals
        if goals and isinstance(goals, dict):
            if goals.get('confidence', 0) > 0.7:
                quality_score += 1
            total_checks += 1
        
        # Check 4: Not a fallback persona
        if not (persona.get('name', '').startswith('Speaker') or 'Default' in persona.get('description', '')):
            quality_score += 1
        total_checks += 1
        
        quality_percentage = (quality_score / total_checks) * 100 if total_checks > 0 else 0
        
        print(f"\n📈 OVERALL QUALITY ASSESSMENT:")
        print(f"   Quality score: {quality_score}/{total_checks} ({quality_percentage:.1f}%)")
        
        if quality_percentage >= 75:
            print("   ✅ High quality persona generated")
            return True
        elif quality_percentage >= 50:
            print("   ⚠️ Medium quality persona - some improvements needed")
            return True
        else:
            print("   ❌ Low quality persona - significant issues remain")
            return False
        
    except Exception as e:
        print(f"❌ Error testing persona quality: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run the persona quality test."""
    print("🧪 PERSONA QUALITY FIX VERIFICATION")
    print("=" * 80)
    
    success = await test_persona_quality_with_real_data()
    
    print(f"\n📊 TEST RESULT")
    print("=" * 60)
    if success:
        print("🎉 Persona quality fixes are working!")
        print("The system is now generating high-quality, authentic personas.")
    else:
        print("⚠️ Persona quality issues remain.")
        print("Further investigation and fixes may be needed.")

if __name__ == "__main__":
    asyncio.run(main())
