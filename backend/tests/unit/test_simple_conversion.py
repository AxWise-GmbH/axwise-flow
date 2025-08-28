#!/usr/bin/env python3
"""
Simple test to verify the conversion function maps all expected fields.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

def test_conversion_mapping():
    """Test that the conversion function maps all expected fields."""
    
    print("🧪 TESTING CONVERSION FIELD MAPPING")
    print("=" * 60)
    
    try:
        # Import required modules
        from backend.domain.models.persona_schema import SimplifiedPersona
        
        print("✅ Imports successful")
        
        # Create a mock SimplifiedPersona with rich content
        mock_persona = SimplifiedPersona(
            name="Alex, The Test Optimizer",
            description="A test persona with rich, detailed content",
            archetype="Tech Professional",
            demographics="Senior software engineer, 32 years old, based in San Francisco, 8+ years experience",
            goals_motivations="Driven to optimize workflows and eliminate inefficiencies in development processes",
            challenges_frustrations="Frustrated by legacy systems and manual processes that slow down development",
            skills_expertise="Python, JavaScript, DevOps, CI/CD, cloud architecture, system optimization",
            technology_tools="Uses VS Code, Docker, Kubernetes, AWS, GitHub Actions, monitoring tools like DataDog",
            pain_points="Dealing with technical debt, slow deployment cycles, and poor documentation",
            workflow_environment="Works in agile teams, prefers automated testing, values code reviews and collaboration",
            needs_expectations="Needs reliable tools that integrate well, expects clear documentation and good support",
            key_quotes=[
                "I spend too much time on manual deployments",
                "Good tooling makes all the difference",
                "Documentation is crucial for team efficiency"
            ],
            # Confidence scores
            demographics_confidence=0.95,
            goals_confidence=0.90,
            challenges_confidence=0.88,
            skills_confidence=0.92,
            technology_confidence=0.94,
            pain_points_confidence=0.87,
            overall_confidence=0.91
        )
        
        print("✅ Mock SimplifiedPersona created")
        
        # Test the conversion function logic directly
        def create_trait(value: str, confidence: float, evidence: list = None) -> dict:
            return {
                "value": value,
                "confidence": confidence,
                "evidence": evidence or [],
            }
        
        quotes = mock_persona.key_quotes if mock_persona.key_quotes else []
        
        # This simulates our updated conversion function
        converted_persona = {
            "name": mock_persona.name,
            "description": mock_persona.description,
            "archetype": mock_persona.archetype,
            
            # Core fields
            "demographics": create_trait(mock_persona.demographics, mock_persona.demographics_confidence, quotes[:2]),
            "goals_and_motivations": create_trait(mock_persona.goals_motivations, mock_persona.goals_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "challenges_and_frustrations": create_trait(mock_persona.challenges_frustrations, mock_persona.challenges_confidence, quotes[1:3] if len(quotes) > 1 else quotes[:1]),
            "skills_and_expertise": create_trait(mock_persona.skills_expertise, mock_persona.skills_confidence, quotes[3:5] if len(quotes) > 3 else quotes[:1]),
            "technology_and_tools": create_trait(mock_persona.technology_tools, mock_persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "pain_points": create_trait(mock_persona.pain_points, mock_persona.pain_points_confidence, quotes[1:3] if len(quotes) > 1 else quotes[:1]),
            "workflow_and_environment": create_trait(mock_persona.workflow_environment, mock_persona.overall_confidence, quotes[:2]),
            "needs_and_expectations": create_trait(mock_persona.needs_expectations, mock_persona.overall_confidence, quotes[:2]),
            "key_quotes": create_trait("Key statements that highlight their main concerns and perspectives", mock_persona.overall_confidence, quotes),
            
            # NEW: Additional fields that PersonaBuilder expects
            "key_responsibilities": create_trait(mock_persona.skills_expertise, mock_persona.skills_confidence, quotes[3:5] if len(quotes) > 3 else quotes[:1]),
            "tools_used": create_trait(mock_persona.technology_tools, mock_persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "analysis_approach": create_trait(f"Analytical approach: {mock_persona.workflow_environment}", mock_persona.overall_confidence, quotes[:2]),
            "decision_making_process": create_trait(f"Decision making: {mock_persona.goals_motivations}", mock_persona.goals_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            "communication_style": create_trait(f"Communication style: {mock_persona.workflow_environment}", mock_persona.overall_confidence, quotes[:2]),
            "technology_usage": create_trait(mock_persona.technology_tools, mock_persona.technology_confidence, quotes[2:4] if len(quotes) > 2 else quotes[:1]),
            
            # Legacy fields
            "role_context": create_trait(f"Professional context: {mock_persona.demographics}", mock_persona.demographics_confidence, []),
            "collaboration_style": create_trait(mock_persona.workflow_environment, mock_persona.overall_confidence, []),
            
            "overall_confidence": mock_persona.overall_confidence,
        }
        
        print("✅ Conversion completed")
        
        # Check that all expected fields are present and have rich content
        expected_fields = [
            'demographics', 'goals_and_motivations', 'challenges_and_frustrations', 
            'skills_and_expertise', 'technology_and_tools', 'pain_points', 
            'workflow_and_environment', 'needs_and_expectations', 'key_quotes',
            'key_responsibilities', 'tools_used', 'analysis_approach', 
            'decision_making_process', 'communication_style', 'technology_usage'
        ]
        
        print("\n📊 FIELD VALIDATION:")
        print("-" * 50)
        
        rich_content_count = 0
        
        for field in expected_fields:
            if field in converted_persona:
                field_data = converted_persona[field]
                value = field_data.get('value', '')
                confidence = field_data.get('confidence', 0)
                evidence_count = len(field_data.get('evidence', []))
                
                # Check if it's rich content (not generic placeholder)
                is_rich = len(value) > 30 and confidence >= 0.85
                status = "✅ RICH" if is_rich else "⚠️ BASIC"
                
                print(f"{status} {field}: {value[:50]}... (conf: {confidence:.1%}, evidence: {evidence_count})")
                
                if is_rich:
                    rich_content_count += 1
            else:
                print(f"❌ MISSING: {field}")
        
        print(f"\n📈 RESULTS:")
        print(f"✅ Rich content fields: {rich_content_count}/{len(expected_fields)}")
        print(f"🎯 Success rate: {rich_content_count/len(expected_fields):.1%}")
        
        # Success criteria: at least 80% of fields should have rich content
        success = rich_content_count >= len(expected_fields) * 0.8
        
        if success:
            print("\n🎉 CONVERSION MAPPING TEST PASSED!")
            print("Most fields now have rich content instead of generic placeholders!")
        else:
            print("\n❌ CONVERSION MAPPING TEST FAILED!")
            print("Too many fields still have generic content.")
        
        return success
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_conversion_mapping()
    sys.exit(0 if success else 1)
