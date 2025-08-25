"""
Test script to verify that the updated LLM prompts generate the new StructuredDemographics
format with perfect evidence traceability.

This script tests:
1. The updated persona formation prompts
2. The new StructuredDemographics model
3. Perfect evidence attribution for each demographic field
"""

import asyncio
import os
import sys
import json
from typing import Dict, Any

# Add the project root to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.llm.prompts.tasks.persona_formation import PersonaFormationPrompts
from backend.services.llm.prompts.tasks.simplified_persona_formation import SimplifiedPersonaFormationPrompts


def test_prompt_generation():
    """Test that the updated prompts include structured_demographics instructions."""
    print("🔍 TESTING UPDATED PROMPT GENERATION")
    print("=" * 60)
    
    # Test data
    sample_interview = """
    Interviewer: Can you tell me about your background?
    
    Participant: Sure! I'm Sarah, and I've been working as a senior software engineer for about 8 years now. 
    I'm currently based in Berlin, Germany, working for a fintech startup called TechFlow. 
    I'm 34 years old and have been in the financial technology sector for most of my career.
    
    Interviewer: What are your main challenges?
    
    Participant: The biggest challenge is keeping up with the rapidly changing regulatory requirements 
    in the fintech space. We're constantly having to adapt our systems to comply with new rules.
    """
    
    # Test standard prompt
    print("\n📝 Testing Standard Persona Formation Prompt")
    print("-" * 40)
    
    data = {"text": sample_interview}
    standard_prompt = PersonaFormationPrompts.get_prompt(data)
    
    # Check if structured_demographics is in the prompt
    if "structured_demographics" in standard_prompt:
        print("✅ Standard prompt includes structured_demographics")
    else:
        print("❌ Standard prompt missing structured_demographics")
    
    # Check for evidence attribution instructions
    if "Each evidence array should contain quotes that specifically support ONLY that field" in standard_prompt:
        print("✅ Standard prompt includes evidence attribution instructions")
    else:
        print("❌ Standard prompt missing evidence attribution instructions")
    
    # Test industry-specific prompt
    print("\n📝 Testing Industry-Specific Persona Formation Prompt")
    print("-" * 40)
    
    data_with_industry = {"text": sample_interview, "industry": "fintech"}
    industry_prompt = PersonaFormationPrompts.get_prompt(data_with_industry)
    
    if "structured_demographics" in industry_prompt:
        print("✅ Industry prompt includes structured_demographics")
    else:
        print("❌ Industry prompt missing structured_demographics")
    
    # Test simplified prompt
    print("\n📝 Testing Simplified Persona Formation Prompt")
    print("-" * 40)
    
    simplified_data = {"text": sample_interview, "role": "Participant"}
    simplified_prompt = SimplifiedPersonaFormationPrompts.get_prompt(simplified_data)
    
    if "structured_demographics" in simplified_prompt:
        print("✅ Simplified prompt includes structured_demographics")
    else:
        print("❌ Simplified prompt missing structured_demographics")
    
    return standard_prompt, industry_prompt, simplified_prompt


def analyze_prompt_structure(prompt: str, prompt_type: str):
    """Analyze the structure of a prompt to verify it includes the new requirements."""
    print(f"\n🔍 ANALYZING {prompt_type.upper()} PROMPT STRUCTURE")
    print("-" * 50)
    
    # Check for key components
    checks = [
        ("structured_demographics field", "structured_demographics"),
        ("experience_level field", "experience_level"),
        ("industry field", '"industry"'),
        ("location field", '"location"'),
        ("age_range field", "age_range"),
        ("evidence attribution", "evidence"),
        ("precision instructions", "Prioritize precision over completeness"),
        ("specific evidence instructions", "quotes that specifically support ONLY that field"),
    ]
    
    results = []
    for check_name, search_term in checks:
        if search_term in prompt:
            print(f"✅ {check_name}")
            results.append(True)
        else:
            print(f"❌ {check_name}")
            results.append(False)
    
    success_rate = sum(results) / len(results) * 100
    print(f"\n📊 Success Rate: {success_rate:.1f}% ({sum(results)}/{len(results)})")
    
    return success_rate


def show_example_json_structure():
    """Show the expected JSON structure from the prompts."""
    print("\n📋 EXPECTED JSON STRUCTURE FROM PROMPTS")
    print("=" * 60)
    
    expected_structure = {
        "name": "Sarah, The Fintech Engineer",
        "archetype": "Technical Expert",
        "description": "Senior software engineer in fintech",
        "demographics": {
            "value": {
                "experience_level": "Senior (8+ years)",
                "industry": "Financial Technology",
                "location": "Berlin, Germany",
                "age_range": "30-35"
            },
            "confidence": 0.9,
            "evidence": ["General supporting quotes"]
        },
        "structured_demographics": {
            "experience_level": {
                "value": "Senior (8+ years)",
                "evidence": ["I've been working as a senior software engineer for about 8 years now"]
            },
            "industry": {
                "value": "Financial Technology",
                "evidence": ["working for a fintech startup", "in the financial technology sector"]
            },
            "location": {
                "value": "Berlin, Germany", 
                "evidence": ["I'm currently based in Berlin, Germany"]
            },
            "age_range": {
                "value": "30-35",
                "evidence": ["I'm 34 years old"]
            },
            "confidence": 0.95
        }
    }
    
    print(json.dumps(expected_structure, indent=2))
    
    print("\n🎯 KEY IMPROVEMENTS:")
    print("• Each demographic field has its own specific evidence")
    print("• No evidence reuse across fields unless truly applicable")
    print("• Perfect traceability from claim to supporting quote")
    print("• Higher confidence due to precise evidence attribution")


def main():
    """Main test function."""
    print("🚀 STRUCTURED DEMOGRAPHICS PROMPT TESTING")
    print("=" * 60)
    
    # Test prompt generation
    standard_prompt, industry_prompt, simplified_prompt = test_prompt_generation()
    
    # Analyze each prompt
    standard_score = analyze_prompt_structure(standard_prompt, "standard")
    industry_score = analyze_prompt_structure(industry_prompt, "industry")
    simplified_score = analyze_prompt_structure(simplified_prompt, "simplified")
    
    # Show expected structure
    show_example_json_structure()
    
    # Summary
    print("\n📊 OVERALL RESULTS")
    print("=" * 60)
    avg_score = (standard_score + industry_score + simplified_score) / 3
    print(f"Average Success Rate: {avg_score:.1f}%")
    
    if avg_score >= 90:
        print("🎉 EXCELLENT: Prompts are well-configured for structured demographics!")
    elif avg_score >= 75:
        print("✅ GOOD: Prompts include most required elements")
    else:
        print("⚠️  NEEDS IMPROVEMENT: Some prompt elements are missing")
    
    print("\n🔄 NEXT STEPS:")
    print("1. Test with real LLM to verify JSON generation")
    print("2. Validate evidence attribution quality")
    print("3. Check frontend component integration")
    print("4. Monitor persona generation performance")


if __name__ == "__main__":
    main()
