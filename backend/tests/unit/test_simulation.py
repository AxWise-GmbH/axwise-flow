#!/usr/bin/env python3
"""
Test the enhanced simulation with stakeholder separation.
"""

import requests
import json
import time

def test_enhanced_simulation():
    """Test the enhanced simulation with your questionnaire."""
    
    print("🧪 Testing Enhanced Simulation with Stakeholder Separation")
    print("=" * 60)
    
    try:
        # Read the questionnaire file
        questionnaire_file = "research-questionnaire-2025-07-03 (5).txt"
        
        with open(questionnaire_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"📄 Loaded questionnaire: {len(content)} characters")
        
        # Test simulation request
        simulation_data = {
            "questionnaire_content": content,
            "business_context": {
                "business_idea": "API service for legacy source systems",
                "target_customer": "Account managers",
                "problem": "Fragmented data leading to unfulfilled discounts",
                "industry": "general"
            },
            "config": {
                "depth": "detailed",
                "people_per_stakeholder": 1,
                "response_style": "realistic",
                "include_insights": True,
                "temperature": 0.7
            }
        }
        
        print("\n🚀 Starting enhanced simulation...")
        
        # Start simulation
        response = requests.post(
            'http://localhost:3000/api/research/simulation-bridge/simulate-from-questionnaire',
            json=simulation_data,
            timeout=300  # 5 minutes
        )
        
        if response.status_code == 200:
            result = response.json()
            
            print("✅ Enhanced simulation completed!")
            
            # Check metadata
            metadata = result.get('metadata', {})
            stakeholder_files = metadata.get('stakeholder_files', {})
            stakeholders_processed = metadata.get('stakeholders_processed', [])
            
            print(f"\n📊 Results Summary:")
            print(f"   - Total Personas: {metadata.get('total_personas', 0)}")
            print(f"   - Total Interviews: {metadata.get('total_interviews', 0)}")
            print(f"   - Stakeholders Processed: {len(stakeholders_processed)}")
            print(f"   - Stakeholder Files Created: {len(stakeholder_files)}")
            
            print(f"\n📁 Stakeholder Files:")
            for stakeholder, file_path in stakeholder_files.items():
                print(f"   - {stakeholder}: {file_path}")
            
            # Check if we have proper stakeholder separation
            interviews = result.get('interviews', [])
            stakeholder_types = set()
            for interview in interviews:
                stakeholder_types.add(interview.get('stakeholder_type', 'Unknown'))
            
            print(f"\n🎯 Stakeholder Types Found:")
            for stakeholder_type in sorted(stakeholder_types):
                count = sum(1 for i in interviews if i.get('stakeholder_type') == stakeholder_type)
                print(f"   - {stakeholder_type}: {count} interviews")
            
            # Verify improvements
            print(f"\n✅ Key Improvements Verified:")
            if len(stakeholders_processed) > 1:
                print("   ✅ Multiple stakeholders processed separately")
            else:
                print("   ❌ Only one stakeholder processed")
                
            if len(stakeholder_files) > 1:
                print("   ✅ Separate files created for each stakeholder")
            else:
                print("   ❌ Only one file created")
                
            if len(stakeholder_types) > 1:
                print("   ✅ Different stakeholder types in interviews")
            else:
                print("   ❌ All interviews have same stakeholder type")
            
            return True
            
        else:
            print(f"❌ Simulation failed: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_enhanced_simulation()
    if success:
        print("\n🎉 Enhanced simulation test completed successfully!")
    else:
        print("\n💥 Enhanced simulation test failed!")
