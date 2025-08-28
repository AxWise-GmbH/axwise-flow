#!/usr/bin/env python3
"""
Test the enhanced questionnaire parsing.
"""

import requests
import json

def test_parsing():
    """Test the enhanced questionnaire parsing."""
    
    print("🧪 Testing Enhanced Questionnaire Parsing")
    print("=" * 50)
    
    # Simple test content
    test_content = """
# Business Research Questionnaire

**Business Idea:** API service for legacy source systems
**Target Customer:** Account managers  
**Problem:** Fragmented data leading to unfulfilled discounts

## PRIMARY STAKEHOLDERS

### 1. Account Manager
The direct user of the proposed API service.

#### Problem Discovery Questions
1. Can you describe your current process for tracking discounts?
2. How often do you encounter discount issues?

#### Solution Validation Questions  
1. If you had an API service, how would it change your workflow?
2. What data points would be critical?

### 2. Head of Account Management
The leader responsible for account management performance.

#### Problem Discovery Questions
1. What is the financial impact of unfulfilled discounts?
2. What are the biggest operational challenges?

#### Solution Validation Questions
1. How would real-time data improve revenue?
2. What are your requirements?

## SECONDARY STAKEHOLDERS

### 1. IT Systems Administrator
The technical gatekeeper for API integration.

#### Problem Discovery Questions
1. What are the biggest technical hurdles?
2. How do current methods impact performance?

#### Solution Validation Questions
1. What are your technical requirements?
2. What are your concerns?
"""
    
    try:
        print("📄 Testing with simple questionnaire content...")
        
        # Test the parsing
        response = requests.post(
            'http://localhost:3000/api/research/simulation-bridge/parse-questionnaire',
            json={
                'content': test_content,
                'config': {
                    'depth': 'detailed',
                    'people_per_stakeholder': 1
                }
            },
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            
            print("✅ Enhanced parsing successful!")
            
            # Check the structure
            questions_data = data.get('questions_data', {})
            stakeholders = questions_data.get('stakeholders', {})
            
            primary = stakeholders.get('primary', [])
            secondary = stakeholders.get('secondary', [])
            
            print(f"\n📊 Parsing Results:")
            print(f"   - Primary stakeholders: {len(primary)}")
            print(f"   - Secondary stakeholders: {len(secondary)}")
            
            total_questions = 0
            
            print(f"\n📋 PRIMARY STAKEHOLDERS:")
            for i, stakeholder in enumerate(primary):
                questions_count = len(stakeholder.get('questions', []))
                total_questions += questions_count
                print(f"   {i+1}. {stakeholder.get('name', 'Unknown')}: {questions_count} questions")
                print(f"      Description: {stakeholder.get('description', 'N/A')}")
                
            print(f"\n📋 SECONDARY STAKEHOLDERS:")
            for i, stakeholder in enumerate(secondary):
                questions_count = len(stakeholder.get('questions', []))
                total_questions += questions_count
                print(f"   {i+1}. {stakeholder.get('name', 'Unknown')}: {questions_count} questions")
                print(f"      Description: {stakeholder.get('description', 'N/A')}")
            
            print(f"\n📊 Summary:")
            print(f"   - Total questions: {total_questions}")
            print(f"   - Total stakeholders: {len(primary) + len(secondary)}")
            
            # Verify structure
            if len(primary) >= 2 and len(secondary) >= 1:
                print("\n✅ Structure looks good for enhanced simulation!")
                return True
            else:
                print("\n❌ Structure needs improvement")
                return False
                
        else:
            print(f"❌ Parsing failed: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_parsing()
    if success:
        print("\n🎉 Enhanced parsing test completed successfully!")
    else:
        print("\n💥 Enhanced parsing test failed!")
