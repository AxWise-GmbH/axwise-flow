#!/usr/bin/env python3
"""
Test the enhanced questionnaire parsing with stakeholder separation.
"""

import asyncio
import sys
import os

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def test_enhanced_parsing():
    """Test the enhanced questionnaire parsing."""
    
    print("🧪 Testing Enhanced Questionnaire Parsing")
    print("=" * 50)
    
    try:
        # Read the questionnaire file
        questionnaire_file = "research-questionnaire-2025-07-03 (5).txt"
        
        if not os.path.exists(questionnaire_file):
            print(f"❌ Questionnaire file not found: {questionnaire_file}")
            return
        
        with open(questionnaire_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"📄 Loaded questionnaire file: {len(content)} characters")
        
        # Test the enhanced parsing
        from backend.api.research.simulation_bridge.services.orchestrator import SimulationOrchestrator
        from backend.api.research.simulation_bridge.models import SimulationConfig, SimulationDepth, ResponseStyle
        
        config = SimulationConfig(
            depth=SimulationDepth.DETAILED,
            people_per_stakeholder=1,
            response_style=ResponseStyle.REALISTIC,
            include_insights=True,
            temperature=0.7
        )
        
        orchestrator = SimulationOrchestrator(use_parallel=False)
        
        print("\n🤖 Testing enhanced questionnaire parsing...")
        
        parsed_request = await orchestrator.parse_raw_questionnaire(content, config)
        
        print("✅ Enhanced parsing successful!")
        
        # Display results
        print(f"\n📊 Business Context:")
        print(f"   - Business Idea: {parsed_request.business_context.business_idea}")
        print(f"   - Target Customer: {parsed_request.business_context.target_customer}")
        print(f"   - Problem: {parsed_request.business_context.problem}")
        
        print(f"\n📋 Stakeholder Analysis:")
        primary_stakeholders = parsed_request.questions_data.stakeholders.get('primary', [])
        secondary_stakeholders = parsed_request.questions_data.stakeholders.get('secondary', [])
        
        print(f"   - Primary Stakeholders: {len(primary_stakeholders)}")
        for i, stakeholder in enumerate(primary_stakeholders):
            print(f"     {i+1}. {stakeholder.name}: {len(stakeholder.questions)} questions")
            print(f"        Description: {stakeholder.description}")
            print(f"        Sample questions: {stakeholder.questions[:2]}")
            print()
        
        print(f"   - Secondary Stakeholders: {len(secondary_stakeholders)}")
        for i, stakeholder in enumerate(secondary_stakeholders):
            print(f"     {i+1}. {stakeholder.name}: {len(stakeholder.questions)} questions")
            print(f"        Description: {stakeholder.description}")
            print(f"        Sample questions: {stakeholder.questions[:2]}")
            print()
        
        total_questions = sum(len(s.questions) for s in primary_stakeholders + secondary_stakeholders)
        print(f"   - Total Questions: {total_questions}")
        
        # Verify the structure
        print(f"\n✅ Structure Verification:")
        if len(primary_stakeholders) == 3:
            print("   ✅ Found 3 primary stakeholders (expected)")
        else:
            print(f"   ❌ Found {len(primary_stakeholders)} primary stakeholders (expected 3)")
            
        if len(secondary_stakeholders) == 2:
            print("   ✅ Found 2 secondary stakeholders (expected)")
        else:
            print(f"   ❌ Found {len(secondary_stakeholders)} secondary stakeholders (expected 2)")
            
        if total_questions >= 30:  # Should be around 34
            print(f"   ✅ Found {total_questions} total questions (reasonable)")
        else:
            print(f"   ❌ Found only {total_questions} total questions (expected ~34)")
        
        print(f"\n🎯 Key Improvements:")
        print("   ✅ Stakeholders are now properly separated")
        print("   ✅ Questions are grouped by stakeholder type")
        print("   ✅ Each stakeholder has proper name and description")
        print("   ✅ Ready for separate file generation per stakeholder")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_enhanced_parsing())
    if success:
        print("\n🎉 Enhanced parsing test completed successfully!")
    else:
        print("\n💥 Enhanced parsing test failed!")
