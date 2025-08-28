#!/usr/bin/env python3
"""
Test script to fix Typhanie's missing persona issue using the new smart routing system.
"""

import json
import sys
import os
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.utils.persona.persona_router import PersonaRouter
from backend.utils.persona.customer_persona_analyzer import CustomerPersonaAnalyzer
from backend.utils.data.data_transformer import transform_interview_data, validate_interview_data


def create_typhanie_data_structure():
    """
    Convert Typhanie's persona.txt into the expected interview data structure.
    """
    # Read the original file
    with open('persona.txt', 'r') as f:
        content = f.read()
    
    # Parse the content into structured interview data
    # This simulates what would happen if the data was properly structured
    typhanie_data = {
        "persona_type": "Coffee Shop Customer",
        "respondents": [
            {
                "name": "Giulia",
                "demographic": "32, Milan, Digital Marketing, Strong coffee culture background",
                "answers": [
                    {
                        "question": "Tell me about your experience looking for unique, local coffee spots.",
                        "answer": "In Italy, we have such a strong coffee tradition that finding truly special places is actually quite difficult. Most bars serve decent espresso, but they lack personality - it's very functional. When I travel for work or want somewhere to meet clients, I look for places that respect coffee culture but offer something more than just standing at the counter for 2 minutes."
                    },
                    {
                        "question": "What are your biggest frustrations finding authentic local places?",
                        "answer": "The biggest problem is that many new specialty coffee places are trying to copy American or Australian coffee culture, which feels forced here. They serve huge cappuccinos at 3pm or try to make coffee 'trendy' in ways that ignore our traditions. I want innovation that respects our heritage, not replaces it."
                    },
                    {
                        "question": "What's your usual approach to finding unique coffee experiences?",
                        "answer": "I follow local food bloggers on Instagram, ask friends in the design community, and sometimes just explore neighborhoods on foot. But honestly, I'm quite critical - I need excellent espresso as the foundation, then I look for atmosphere and service that adds something special."
                    },
                    {
                        "question": "What would make a coffee shop feel genuinely authentic and unique?",
                        "answer": "Perfect espresso - non-negotiable. Then, local art or design elements that reflect the neighborhood's character. Maybe Italian beans but roasted with a unique approach. Staff who understand coffee but aren't pretentious about it. And please, respect our coffee timing - no cappuccino after 11am!"
                    },
                    {
                        "question": "How appealing is a physical loyalty token not tied to personal data?",
                        "answer": "Very appealing! We're quite privacy-conscious here, especially after GDPR. A physical token feels more... how do you say... authentic? Like the old tessera del bar system but modernized. It's personal without being invasive. Much better than another app."
                    }
                ]
            }
        ]
    }
    
    return [typhanie_data]


def test_data_type_detection():
    """Test the data type detection logic."""
    print("🔍 Testing data type detection...")
    
    typhanie_data = create_typhanie_data_structure()
    
    # Test the routing logic
    router = PersonaRouter(use_instructor=False)  # Use legacy mode for testing
    analysis_type, confidence = router.analyze_data_type(typhanie_data)
    
    print(f"📊 Analysis Type: {analysis_type}")
    print(f"📊 Confidence: {confidence:.2f}")
    
    return analysis_type, confidence


def test_customer_persona_analyzer():
    """Test the customer persona analyzer directly."""
    print("\n🎯 Testing Customer Persona Analyzer...")
    
    typhanie_data = create_typhanie_data_structure()[0]
    
    try:
        analyzer = CustomerPersonaAnalyzer(
            typhanie_data['respondents'], 
            typhanie_data['persona_type']
        )
        
        persona = analyzer.generate_customer_persona_profile()
        
        print("✅ Customer persona generated successfully!")
        print(f"📝 Persona Type: {persona.get('persona_type')}")
        print(f"📝 Behaviors: {len(persona.get('customer_attributes', {}).get('behaviors', []))}")
        print(f"📝 Frustrations: {len(persona.get('pain_points', {}).get('key_frustrations', []))}")
        print(f"📝 Preferences: {len(persona.get('customer_attributes', {}).get('preferences', []))}")
        
        return persona
        
    except Exception as e:
        print(f"❌ Customer analyzer failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_smart_routing():
    """Test the smart routing system."""
    print("\n🚀 Testing Smart Routing...")
    
    typhanie_data = create_typhanie_data_structure()
    
    try:
        router = PersonaRouter(use_instructor=False)  # Use legacy mode for testing
        personas = router.route_to_analyzer(typhanie_data)
        
        if personas:
            print("✅ Smart routing generated personas successfully!")
            for i, persona in enumerate(personas):
                print(f"📝 Persona {i+1}: {persona.get('persona_type')}")
                print(f"📝 Analyzer Used: {persona.get('routing_metadata', {}).get('analyzer_used')}")
                print(f"📝 Analysis Type: {persona.get('routing_metadata', {}).get('analysis_type')}")
        else:
            print("❌ No personas generated by smart routing")
            
        return personas
        
    except Exception as e:
        print(f"❌ Smart routing failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_hybrid_analysis():
    """Test the hybrid analysis system."""
    print("\n🔄 Testing Hybrid Analysis...")
    
    typhanie_data = create_typhanie_data_structure()
    
    try:
        router = PersonaRouter(use_instructor=False)  # Use legacy mode for testing
        personas = router.create_hybrid_analyzer(typhanie_data)
        
        if personas:
            print("✅ Hybrid analysis generated personas successfully!")
            for i, persona in enumerate(personas):
                print(f"📝 Persona {i+1}: {persona.get('persona_type')}")
                print(f"📝 Analysis Type: {persona.get('routing_metadata', {}).get('analysis_type')}")
                
                # Check what attributes were generated
                if 'business_attributes' in persona:
                    print(f"📝 Has Business Attributes: Yes")
                if 'customer_attributes' in persona:
                    print(f"📝 Has Customer Attributes: Yes")
        else:
            print("❌ No personas generated by hybrid analysis")
            
        return personas
        
    except Exception as e:
        print(f"❌ Hybrid analysis failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def save_results(personas, filename):
    """Save the generated personas to a file."""
    if personas:
        with open(filename, 'w') as f:
            json.dump(personas, f, indent=2, default=str)
        print(f"💾 Results saved to {filename}")


def main():
    """Main test function."""
    print("🧪 Testing Typhanie's Persona Fix")
    print("=" * 50)
    
    # Test 1: Data type detection
    analysis_type, confidence = test_data_type_detection()
    
    # Test 2: Customer persona analyzer
    customer_persona = test_customer_persona_analyzer()
    if customer_persona:
        save_results([customer_persona], 'typhanie_customer_persona.json')
    
    # Test 3: Smart routing
    smart_personas = test_smart_routing()
    if smart_personas:
        save_results(smart_personas, 'typhanie_smart_routing.json')
    
    # Test 4: Hybrid analysis
    hybrid_personas = test_hybrid_analysis()
    if hybrid_personas:
        save_results(hybrid_personas, 'typhanie_hybrid_analysis.json')
    
    print("\n" + "=" * 50)
    print("🎉 Testing Complete!")
    
    # Summary
    print(f"📊 Data Type Detected: {analysis_type} (confidence: {confidence:.2f})")
    print(f"✅ Customer Analyzer: {'Success' if customer_persona else 'Failed'}")
    print(f"✅ Smart Routing: {'Success' if smart_personas else 'Failed'}")
    print(f"✅ Hybrid Analysis: {'Success' if hybrid_personas else 'Failed'}")


if __name__ == "__main__":
    main()
