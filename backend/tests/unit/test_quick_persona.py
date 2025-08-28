#!/usr/bin/env python3
"""
Quick test to verify persona generation is working with the new model.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.utils.persona.persona_router import PersonaRouter

def test_quick_persona():
    print("🧪 Quick Persona Generation Test")
    print("=" * 50)
    
    # Simple test data
    test_data = [{
        "persona_type": "UX Researcher",
        "respondents": [{
            "answers": [
                {
                    "question": "What tools do you use for research?",
                    "answer": "I use Figma for prototyping, Miro for collaboration, and Dovetail for analysis."
                },
                {
                    "question": "What are your biggest challenges?",
                    "answer": "Time management and synthesizing qualitative data are my main challenges."
                }
            ]
        }]
    }]
    
    try:
        router = PersonaRouter()
        personas = router.route_to_analyzer(test_data)
        
        if personas:
            persona = personas[0]
            print(f"✅ Persona generated successfully!")
            print(f"📝 Type: {persona.get('persona_type', 'Unknown')}")
            
            # Check if we have meaningful data
            core_attrs = persona.get('core_attributes', {})
            tools = core_attrs.get('tools_used', [])
            pain_points = persona.get('pain_points', {})
            challenges = pain_points.get('key_challenges', [])
            
            print(f"🛠️ Tools found: {len(tools)}")
            print(f"🎯 Challenges found: {len(challenges)}")
            
            if tools:
                print(f"📋 First tool pattern: {tools[0].get('pattern', 'N/A')}")
            if challenges:
                print(f"📋 First challenge: {challenges[0].get('keyword', 'N/A')}")
                
            return True
        else:
            print("❌ No personas generated")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_quick_persona()
    print("\n" + "=" * 50)
    if success:
        print("🎉 Quick test PASSED!")
    else:
        print("💥 Quick test FAILED!")
