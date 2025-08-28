#!/usr/bin/env python3
"""
Test script to verify that the evidence duplication fix is working correctly.
"""

import sys
import os
import asyncio
import json
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

from services.processing.persona_formation_service import PersonaFormationService
from services.llm.gemini_service import GeminiService

# Sample interview text for testing
SAMPLE_INTERVIEW = """
Q: Can you tell me about your experience with price discrimination?
A: It's incredibly frustrating because it feels like we're being penalized just for choosing Apple devices. I've noticed that when I'm shopping for flights or hotels on my iPhone, the prices are often higher than when I check the same thing on my old Windows laptop.

Q: How do you currently deal with this?
A: I've developed this tedious routine where I have to check prices across multiple devices. It's effective enough to confirm the bias, but not efficient enough to be a go-to strategy for every purchase. It costs me a lot of time, especially when you're self-employed.

Q: What would an ideal solution look like?
A: Something that could automatically handle this device switching for me, but it would need to be secure and privacy-focused. I'm hyper-aware of data footprints and potential vulnerabilities as someone in digital marketing.
"""

async def test_evidence_distribution():
    """Test that evidence is properly distributed without duplication."""
    print("🧪 Testing Evidence Distribution Fix...")
    
    try:
        # Create LLM service
        llm_config = {
            "api_key": os.getenv("GEMINI_API_KEY"),
            "model": "gemini-2.5-flash",
        }
        
        if not llm_config["api_key"]:
            print("❌ GEMINI_API_KEY not found in environment variables")
            return False
            
        llm_service = GeminiService(llm_config)
        
        # Create PersonaFormationService
        persona_service = PersonaFormationService(None, llm_service)
        
        # Generate persona from sample text
        print("📝 Generating persona from sample interview...")
        personas = await persona_service.generate_persona_from_text(SAMPLE_INTERVIEW)
        
        if not personas or len(personas) == 0:
            print("❌ No personas generated")
            return False
            
        persona = personas[0]
        print(f"✅ Generated persona: {persona.get('name', 'Unknown')}")
        
        # Check evidence distribution
        print("\n🔍 Checking Evidence Distribution:")
        
        # Check if pain_points and collaboration_style have different evidence
        pain_points_evidence = persona.get('pain_points', {}).get('evidence', [])
        collaboration_evidence = persona.get('collaboration_style', {}).get('evidence', [])
        
        print(f"Pain Points Evidence ({len(pain_points_evidence)} items):")
        for i, evidence in enumerate(pain_points_evidence[:3]):
            print(f"  {i+1}. {evidence[:100]}...")
            
        print(f"\nCollaboration Style Evidence ({len(collaboration_evidence)} items):")
        for i, evidence in enumerate(collaboration_evidence[:3]):
            print(f"  {i+1}. {evidence[:100]}...")
        
        # Check for duplication
        pain_points_set = set(pain_points_evidence)
        collaboration_set = set(collaboration_evidence)
        overlap = pain_points_set.intersection(collaboration_set)
        
        if overlap:
            print(f"\n❌ Found {len(overlap)} duplicate evidence items:")
            for dup in list(overlap)[:2]:
                print(f"  - {dup[:100]}...")
            return False
        else:
            print(f"\n✅ No evidence duplication found!")
            
        # Check for generic phrases
        all_evidence = pain_points_evidence + collaboration_evidence
        generic_phrases = [
            "Inferred from interview data",
            "Inferred from interview data for",
        ]
        
        generic_found = []
        for evidence in all_evidence:
            for phrase in generic_phrases:
                if phrase in evidence:
                    generic_found.append(evidence)
                    
        if generic_found:
            print(f"\n❌ Found {len(generic_found)} generic evidence phrases:")
            for generic in generic_found[:2]:
                print(f"  - {generic}")
            return False
        else:
            print(f"\n✅ No generic evidence phrases found!")
            
        # Check confidence scores
        pain_points_confidence = persona.get('pain_points', {}).get('confidence', 0)
        collaboration_confidence = persona.get('collaboration_style', {}).get('confidence', 0)
        
        print(f"\n📊 Confidence Scores:")
        print(f"  Pain Points: {pain_points_confidence:.1%}")
        print(f"  Collaboration Style: {collaboration_confidence:.1%}")
        
        if pain_points_confidence >= 0.9 and collaboration_confidence >= 0.9:
            print("✅ High confidence scores achieved!")
        else:
            print("⚠️  Confidence scores could be higher")
            
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function."""
    print("🚀 Starting Evidence Distribution Test\n")
    
    success = await test_evidence_distribution()
    
    if success:
        print("\n🎉 All tests passed! Evidence duplication fix is working correctly.")
    else:
        print("\n💥 Tests failed. Evidence duplication fix needs more work.")
        
    return success

if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(0 if result else 1)
