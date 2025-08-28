#!/usr/bin/env python3
"""
Test script to verify demographic extraction fixes
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.processing.demographic_extractor import DemographicExtractor

def test_demographic_extraction():
    """Test the demographic extraction with the problematic evidence"""
    
    extractor = DemographicExtractor()
    
    # Test evidence from the user's example
    test_evidence = [
        "When I travel for work or want somewhere to meet clients",
        "ask friends in the design community", 
        "In Italy, we have such a strong coffee tradition"
    ]
    
    # Combine evidence into text
    all_text = " ".join(test_evidence)
    
    print("=== TESTING DEMOGRAPHIC EXTRACTION ===")
    print(f"Input text: {all_text}")
    print()
    
    # Test individual extraction methods
    print("=== INDIVIDUAL EXTRACTIONS ===")
    
    # Test gender extraction
    gender = extractor._extract_gender_carefully(all_text.lower())
    print(f"Gender: '{gender}' (should be empty)")
    
    # Test industry extraction  
    industry = extractor._extract_pattern(all_text.lower(), extractor.industry_patterns)
    print(f"Industry: '{industry}' (should be 'Design')")
    
    # Test location extraction
    location = extractor._extract_location(all_text)
    print(f"Location: '{location}' (should be 'Italy')")
    
    print()
    print("=== FULL DEMOGRAPHIC EXTRACTION ===")
    
    # Test full extraction
    text_data = {
        "value": "Professional who travels for work and meets clients",
        "evidence": test_evidence,
        "confidence": 0.8
    }
    
    result = extractor.extract_demographics(text_data, test_evidence)
    
    print("Result:")
    print(f"Value: {result['value']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Evidence: {result['evidence']}")
    
    print()
    print("=== ANALYSIS ===")
    
    # Check if the issues are fixed
    value_lower = result['value'].lower()
    
    issues_found = []
    fixes_confirmed = []
    
    if 'non-binary' in value_lower or 'gender:' in value_lower:
        issues_found.append("❌ Still extracting gender without evidence")
    else:
        fixes_confirmed.append("✅ No longer hallucinating gender")
        
    if 'tech' in value_lower and 'design' not in value_lower:
        issues_found.append("❌ Still misidentifying industry as Tech")
    elif 'design' in value_lower:
        fixes_confirmed.append("✅ Correctly identified Design industry")
    else:
        issues_found.append("⚠️  Industry not detected")
        
    if 'italy' not in value_lower and 'italian' not in value_lower:
        issues_found.append("⚠️  Location (Italy) not detected")
    else:
        fixes_confirmed.append("✅ Correctly identified Italy/Italian")
    
    print("FIXES CONFIRMED:")
    for fix in fixes_confirmed:
        print(f"  {fix}")
        
    print("\nISSUES REMAINING:")
    for issue in issues_found:
        print(f"  {issue}")
        
    if not issues_found:
        print("\n🎉 ALL ISSUES FIXED!")
    else:
        print(f"\n⚠️  {len(issues_found)} issues still need attention")

if __name__ == "__main__":
    test_demographic_extraction()
