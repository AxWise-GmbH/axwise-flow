#!/usr/bin/env python3
"""
Test script to verify the persona enhancement fix
"""

import asyncio
import sys
import os
import json
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.services.stakeholder_analysis_service import StakeholderAnalysisService
from backend.services.llm_service import LLMService
from backend.models.analysis_models import DetailedAnalysisResult


async def test_persona_enhancement():
    """Test the enhanced persona generation"""
    
    print("🔍 Testing Enhanced Persona Generation...")
    
    # Initialize services
    llm_service = LLMService()
    stakeholder_service = StakeholderAnalysisService(llm_service)
    
    # Load test file
    test_file_path = "sample-data/enhanced_interviews_4048d612_2025-08-04.txt"
    
    if not os.path.exists(test_file_path):
        print(f"❌ Test file not found: {test_file_path}")
        return
    
    print(f"📁 Loading test file: {test_file_path}")
    
    # Create a mock file object
    class MockFile:
        def __init__(self, path):
            self.path = path
            with open(path, 'r', encoding='utf-8') as f:
                self.content = f.read()
        
        def read(self):
            return self.content
    
    files = [MockFile(test_file_path)]
    
    # Create a minimal base analysis for testing
    base_analysis = DetailedAnalysisResult(
        status="completed",
        result_id="test_persona_fix",
        analysis_date="2025-08-10T12:00:00",
        themes=[],
        personas=[{
            "name": "Test Persona",
            "description": "Initial test persona",
            "archetype": "Test User"
        }],
        patterns=[],
        insights=[]
    )
    
    print("🚀 Starting stakeholder analysis with persona enhancement...")
    
    try:
        # Run the enhanced analysis
        enhanced_analysis = await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
            files, base_analysis
        )
        
        print("✅ Analysis completed successfully!")
        
        # Check results
        stakeholder_intelligence = enhanced_analysis.stakeholder_intelligence
        enhanced_personas = enhanced_analysis.enhanced_personas
        
        print(f"\n📊 RESULTS:")
        print(f"   Detected Stakeholders: {len(stakeholder_intelligence.detected_stakeholders) if stakeholder_intelligence else 0}")
        print(f"   Enhanced Personas: {len(enhanced_personas) if enhanced_personas else 0}")
        
        if stakeholder_intelligence:
            print(f"\n🎯 DETECTED STAKEHOLDERS:")
            for i, stakeholder in enumerate(stakeholder_intelligence.detected_stakeholders):
                print(f"   {i+1}. {stakeholder.stakeholder_id} ({stakeholder.stakeholder_type})")
        
        if enhanced_personas:
            print(f"\n👥 ENHANCED PERSONAS:")
            for i, persona in enumerate(enhanced_personas):
                persona_name = persona.get('name', f'Persona {i+1}')
                persona_type = persona.get('stakeholder_type', 'Unknown')
                has_mapping = 'stakeholder_mapping' in persona
                print(f"   {i+1}. {persona_name} ({persona_type}) - Mapping: {'✅' if has_mapping else '❌'}")
        
        # Success metrics
        success = True
        if not stakeholder_intelligence or len(stakeholder_intelligence.detected_stakeholders) < 5:
            print("⚠️  Warning: Expected at least 5 detected stakeholders")
            success = False
            
        if not enhanced_personas or len(enhanced_personas) < 5:
            print("⚠️  Warning: Expected at least 5 enhanced personas")
            success = False
            
        if success:
            print("\n🎉 SUCCESS: Persona enhancement is working correctly!")
        else:
            print("\n❌ ISSUE: Persona enhancement needs further investigation")
            
    except Exception as e:
        print(f"❌ Error during analysis: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_persona_enhancement())
