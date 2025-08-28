#!/usr/bin/env python3
"""
Test script to verify that stakeholder analysis now uses existing personas
instead of creating new stakeholder groups from scratch.
"""

import asyncio
import sys
import os
import logging

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath("."))

from backend.services.stakeholder_analysis_service import StakeholderAnalysisService
from backend.schemas import DetailedAnalysisResult
from backend.services.llm.gemini_service import GeminiService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_persona_stakeholder_integration():
    """Test that stakeholder analysis uses existing personas"""

    print("🧪 Testing Persona → Stakeholder Analysis Integration")
    print("=" * 60)

    # Create simple mock personas (simulating what persona formation would create)
    mock_personas = [
        {
            "name": "The Expat Advocate",
            "description": "A professional working in global mobility, human resources, or expat support",
            "overall_confidence": 0.85,
        },
        {
            "name": "The Expat Experience Investigator",
            "description": "A researcher focused on understanding expat experiences",
            "overall_confidence": 0.80,
        },
        {
            "name": "The Discerning Influencer",
            "description": "A content creator focused on expat life and authentic recommendations",
            "overall_confidence": 0.75,
        },
    ]

    # Create a proper mock analysis object that mimics DetailedAnalysisResult
    class MockAnalysis:
        def __init__(self):
            self.personas = mock_personas
            self.id = "test-123"
            self.status = "completed"
            self.themes = []
            self.patterns = []
            self.insights = []
            self.stakeholder_intelligence = None
            self.enhanced_themes = None
            self.enhanced_patterns = None
            self.enhanced_personas = None
            self.enhanced_insights = None

        def model_copy(self):
            """Mock the Pydantic model_copy method"""
            new_instance = MockAnalysis()
            new_instance.personas = self.personas
            new_instance.id = self.id
            new_instance.status = self.status
            new_instance.themes = self.themes
            new_instance.patterns = self.patterns
            new_instance.insights = self.insights
            new_instance.stakeholder_intelligence = self.stakeholder_intelligence
            new_instance.enhanced_themes = self.enhanced_themes
            new_instance.enhanced_patterns = self.enhanced_patterns
            new_instance.enhanced_personas = self.enhanced_personas
            new_instance.enhanced_insights = self.enhanced_insights
            return new_instance

    mock_analysis = MockAnalysis()

    # Create mock files
    class MockFile:
        def __init__(self, content):
            self.content = content

        def read(self):
            return self.content

    mock_files = [
        MockFile(
            "Mock interview content about expat experiences and food delivery challenges"
        )
    ]

    # Initialize stakeholder analysis service
    try:
        # Try to create a real LLM service (optional for this test)
        llm_service = GeminiService()
        print("✅ Using real Gemini LLM service")
    except Exception as e:
        print(f"⚠️  Could not initialize real LLM service: {e}")
        print("📝 Using mock LLM service for testing")
        llm_service = None

    stakeholder_service = StakeholderAnalysisService(llm_service)

    print(f"\n🔍 Input Analysis:")
    print(f"   - Personas: {len(mock_analysis.personas)}")
    for i, persona in enumerate(mock_analysis.personas, 1):
        print(f"     {i}. {persona['name']}")

    print(f"\n🚀 Running stakeholder analysis...")

    try:
        # Run the stakeholder analysis
        enhanced_analysis = (
            await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
                mock_files, mock_analysis
            )
        )

        print(f"\n✅ Stakeholder Analysis Results:")

        if enhanced_analysis.stakeholder_intelligence:
            stakeholders = (
                enhanced_analysis.stakeholder_intelligence.detected_stakeholders
            )
            print(f"   - Detected Stakeholders: {len(stakeholders)}")

            for i, stakeholder in enumerate(stakeholders, 1):
                stakeholder_id = stakeholder.stakeholder_id
                stakeholder_type = stakeholder.stakeholder_type
                confidence = stakeholder.confidence_score
                print(
                    f"     {i}. {stakeholder_id} (type: {stakeholder_type}, confidence: {confidence:.2f})"
                )

            # Check if stakeholders came from personas (they won't have stakeholder_type="persona_based"
            # because we map them to valid types like "influencer", "primary_customer", etc.)
            # Instead, check the metadata for persona_based flag
            metadata = (
                enhanced_analysis.stakeholder_intelligence.processing_metadata or {}
            )
            is_persona_based = metadata.get("persona_based", False)

            if is_persona_based and len(stakeholders) > 0:
                print(
                    f"\n🎉 SUCCESS: Found {len(stakeholders)} stakeholders created from existing personas!"
                )
                print(
                    "✅ The fix is working - stakeholder analysis is using existing personas"
                )

                # Show the stakeholder type mapping
                persona_names = metadata.get("persona_names", [])
                if persona_names:
                    print(f"✅ Original personas: {persona_names}")

                # Check detection method
                if metadata.get("source") == "existing_personas_from_persona_formation":
                    print("✅ Source correctly identified as persona formation")
                else:
                    print("⚠️  Source not set correctly")

            else:
                print(f"\n❌ ISSUE: Stakeholders were not created from personas")
                print("❌ The fix may not be working correctly")

        else:
            print("❌ No stakeholder intelligence generated")

    except Exception as e:
        print(f"\n❌ Error during stakeholder analysis: {e}")
        import traceback

        traceback.print_exc()

    print(f"\n" + "=" * 60)
    print("🏁 Test completed")


if __name__ == "__main__":
    asyncio.run(test_persona_stakeholder_integration())
