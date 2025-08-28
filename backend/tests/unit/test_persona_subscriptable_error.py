#!/usr/bin/env python3
"""
Test script to isolate the 'Persona' object is not subscriptable error
"""

import sys
import os
import asyncio
import logging

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_persona_subscriptable_error():
    """Test to isolate the persona subscriptable error"""

    try:
        # Import required modules
        from backend.database import get_db
        from backend.models import AnalysisResult
        from backend.services.stakeholder_analysis_service import (
            StakeholderAnalysisService,
        )
        from backend.services.llm import LLMServiceFactory

        print("✅ Imports successful")

        # Get database session
        db = next(get_db())
        print("✅ Database connection successful")

        # Get analysis result 84
        analysis_result = (
            db.query(AnalysisResult).filter(AnalysisResult.result_id == 84).first()
        )
        if not analysis_result:
            print("❌ Analysis result 84 not found")
            return

        print(f"✅ Found analysis result 84")
        print(f"   - Status: {analysis_result.status}")
        print(
            f"   - Personas count: {len(analysis_result.personas) if analysis_result.personas else 0}"
        )

        if analysis_result.personas:
            for i, persona in enumerate(analysis_result.personas):
                print(f"   - Persona {i+1} type: {type(persona)}")
                print(f"   - Persona {i+1} repr: {repr(persona)[:100]}...")

                # Try to access the persona in different ways
                try:
                    if hasattr(persona, "name"):
                        print(
                            f"     - Has name attribute: {getattr(persona, 'name', 'N/A')}"
                        )
                    if isinstance(persona, dict):
                        print(f"     - Is dict, name: {persona.get('name', 'N/A')}")
                    else:
                        print(f"     - Not a dict, trying dict access...")
                        # This might be where the error occurs
                        test_access = persona[
                            "name"
                        ]  # This should fail if persona is not subscriptable
                        print(f"     - Dict access successful: {test_access}")
                except Exception as e:
                    print(f"     - ❌ Error accessing persona: {e}")
                    print(f"     - Error type: {type(e)}")

        # Test persona_to_dict function
        from backend.services.processing.persona_builder import persona_to_dict

        if analysis_result.personas:
            print("\\n=== TESTING PERSONA_TO_DICT ===")
            for i, persona in enumerate(analysis_result.personas):
                try:
                    print(f"Testing persona_to_dict on persona {i+1}...")
                    persona_dict = persona_to_dict(persona)
                    print(f"✅ persona_to_dict successful for persona {i+1}")
                    print(f"   - Name: {persona_dict.get('name', 'Unknown')}")
                    print(f"   - Type: {type(persona_dict)}")
                    print(f"   - Keys: {list(persona_dict.keys())[:5]}...")
                except Exception as conversion_error:
                    print(
                        f"❌ persona_to_dict failed for persona {i+1}: {conversion_error}"
                    )
                    import traceback

                    traceback.print_exc()

        # Try to create stakeholder service
        llm_service = LLMServiceFactory.create("gemini")
        stakeholder_service = StakeholderAnalysisService(llm_service)
        print("\\n✅ Stakeholder service created")

        # Try to access personas through the service
        try:
            existing_personas = (
                analysis_result.personas
                if hasattr(analysis_result, "personas") and analysis_result.personas
                else []
            )
            print(f"✅ Personas accessed through service: {len(existing_personas)}")

            # Try the exact same logic as in the stakeholder service
            if existing_personas:
                for i, persona in enumerate(existing_personas):
                    print(f"Processing persona {i+1}, type: {type(persona)}")
                    if isinstance(persona, dict):
                        persona_name = persona.get("name", f"Unnamed_Persona_{i+1}")
                        print(f"Dict access successful: {persona_name}")
                    else:
                        persona_name = getattr(
                            persona, "name", f"Unnamed_Persona_{i+1}"
                        )
                        print(f"Getattr access successful: {persona_name}")

        except Exception as e:
            print(f"❌ Error in service logic: {e}")
            print(f"Error type: {type(e)}")
            import traceback

            traceback.print_exc()

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_persona_subscriptable_error())
