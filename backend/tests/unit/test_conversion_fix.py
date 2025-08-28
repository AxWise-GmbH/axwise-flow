#!/usr/bin/env python3
"""
Test the updated conversion function to ensure all PersonaBuilder fields are populated.
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


def test_conversion_function():
    """Test that the conversion function maps all expected fields."""

    print("🧪 TESTING UPDATED CONVERSION FUNCTION")
    print("=" * 80)

    try:
        # Import required modules
        from backend.domain.models.persona_schema import SimplifiedPersona
        from backend.services.processing.persona_formation_service import (
            PersonaFormationService,
        )

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
                "Documentation is crucial for team efficiency",
            ],
            # Confidence scores
            demographics_confidence=0.95,
            goals_confidence=0.90,
            challenges_confidence=0.88,
            skills_confidence=0.92,
            technology_confidence=0.94,
            pain_points_confidence=0.87,
            overall_confidence=0.91,
        )

        print("✅ Mock SimplifiedPersona created")

        # Create PersonaFormationService instance
        service = PersonaFormationService(
            llm_service=None
        )  # We don't need LLM for this test

        # Test the conversion function
        converted_persona = service._convert_simplified_to_full_persona(mock_persona)

        print("✅ Conversion completed")
        print(f"🔍 Converted persona keys: {list(converted_persona.keys())}")

        # Check that all expected fields are present and have rich content
        expected_fields = [
            "name",
            "description",
            "archetype",
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "skills_and_expertise",
            "technology_and_tools",
            "pain_points",
            "workflow_and_environment",
            "needs_and_expectations",
            "key_quotes",
            "key_responsibilities",
            "tools_used",
            "analysis_approach",
            "decision_making_process",
            "communication_style",
            "technology_usage",
            "role_context",
            "collaboration_style",
            "overall_confidence",
        ]

        print("\n📊 FIELD VALIDATION:")
        print("-" * 50)

        missing_fields = []
        rich_content_fields = []

        for field in expected_fields:
            if field in converted_persona:
                if field == "overall_confidence":
                    print(f"✅ {field}: {converted_persona[field]}")
                elif isinstance(converted_persona[field], dict):
                    value = converted_persona[field].get("value", "")
                    confidence = converted_persona[field].get("confidence", 0)
                    evidence_count = len(converted_persona[field].get("evidence", []))

                    # Check if it's rich content (not generic placeholder)
                    is_rich = len(value) > 50 and confidence > 0.8
                    status = "✅ RICH" if is_rich else "⚠️ GENERIC"

                    print(
                        f"{status} {field}: {value[:60]}... (conf: {confidence:.1%}, evidence: {evidence_count})"
                    )

                    if is_rich:
                        rich_content_fields.append(field)
                else:
                    print(f"✅ {field}: {converted_persona[field]}")
            else:
                missing_fields.append(field)
                print(f"❌ MISSING: {field}")

        print(f"\n📈 RESULTS:")
        print(
            f"✅ Rich content fields: {len(rich_content_fields)}/{len(expected_fields)-1}"
        )  # -1 for overall_confidence
        print(f"❌ Missing fields: {len(missing_fields)}")
        print(f"🎯 Rich content fields: {rich_content_fields}")

        if missing_fields:
            print(f"⚠️ Missing fields: {missing_fields}")

        # Success criteria
        success = len(missing_fields) == 0 and len(rich_content_fields) >= 15

        if success:
            print("\n🎉 CONVERSION TEST PASSED!")
            print("All expected fields are present with rich content!")
        else:
            print("\n❌ CONVERSION TEST FAILED!")
            print("Some fields are missing or have generic content.")

        return success

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_conversion_function()
    sys.exit(0 if success else 1)
