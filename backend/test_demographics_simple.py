#!/usr/bin/env python3
"""
Simple test script for demographics validation analysis.
Tests the enhanced validation logic with real examples from analysis 175.
"""

import re
from typing import List, Dict, Any

def analyze_demographics_alignment(description: str, evidence_quotes: List[str]) -> Dict[str, Any]:
    """
    Simplified version of the demographics alignment validation.
    """
    # Demographics-specific indicators
    demographic_indicators = {
        'age': ['old', 'young', 'senior', 'retired', 'student', 'college', 'years', 'age'],
        'profession': ['business', 'owner', 'consultant', 'developer', 'professor', 'work', 'job'],
        'experience': ['experienced', 'expert', 'beginner', 'savvy', 'proficient', 'skilled'],
        'location': ['francisco', 'california', 'city', 'area', 'location'],
        'income': ['fixed', 'income', 'budget', 'money', 'dollar', 'financial', 'afford'],
        'family': ['family', 'husband', 'wife', 'kids', 'children', 'niece', 'nephew'],
        'technology': ['tech', 'apple', 'android', 'iphone', 'ipad', 'mac', 'device']
    }
    
    evidence_text = ' '.join(evidence_quotes).lower()
    description_lower = description.lower()
    
    # Count demographic indicators present in evidence
    evidence_indicators = 0
    total_possible = 0
    category_analysis = {}
    
    for category, indicators in demographic_indicators.items():
        # Check if description mentions this category
        category_in_description = any(indicator in description_lower for indicator in indicators)
        if category_in_description:
            total_possible += 1
            # Check if evidence supports this category
            evidence_support = any(indicator in evidence_text for indicator in indicators)
            if evidence_support:
                evidence_indicators += 1
            
            category_analysis[category] = {
                'claimed_in_description': category_in_description,
                'supported_by_evidence': evidence_support,
                'description_indicators': [ind for ind in indicators if ind in description_lower],
                'evidence_indicators': [ind for ind in indicators if ind in evidence_text]
            }
    
    # Calculate alignment score
    if total_possible == 0:
        alignment_score = 0.8  # Neutral score for generic demographics
    else:
        alignment_score = evidence_indicators / total_possible
    
    return {
        'alignment_score': alignment_score,
        'evidence_indicators': evidence_indicators,
        'total_possible': total_possible,
        'category_analysis': category_analysis
    }

def test_demographics_cases():
    """Test cases from analysis 175."""
    test_cases = [
        {
            "name": "Alex, The Algorithmic Auditor",
            "description": "Experience Level: Entry-level • Career Stage: Student • Industry: Tech • Location: San Francisco • Work Experience: A tech-savvy professional, likely in their 20s or 30s.",
            "evidence": [
                "It's a tech solution to a tech problem, which I appreciate",
                "It feels super manipulative, like they're trying to extract an 'Apple tax' because they assume I'm willing to pay more just because I own an iPhone or a Mac"
            ]
        },
        {
            "name": "Chloe, The Credible Consumer Advocate", 
            "description": "Career Stage: Mid career • Industry: Tech • Age Range: 45-54.",
            "evidence": [
                "My audience, they've invested in Apple's ecosystem for a reason—they appreciate the security, the design, the overall user experience",
                "This is, in fact, one of the most persistent and frankly, vexing issues that my audience, particularly the more discerning iOS users, bring to my attention"
            ]
        },
        {
            "name": "Eleanor, The Value-Seeking iPhone User",
            "description": "Profile: An older individual on a fixed income, primarily an Apple user (iPhone, iPad).",
            "evidence": [
                "I always wonder if they're trying to, you know, get more money out of me because I'm older, or maybe because I don't know all the tricks",
                "And when you're on a fixed income, every dollar really counts, so you want to make sure you're getting the best deal possible",
                "But I do always feel like prices online can be a bit"
            ]
        },
        {
            "name": "Alex, The Vigilant Bookseller",
            "description": "Industry: Tech • Education: Bachelor • Profile: A small business owner who runs a bookstore, operating with thin margins.",
            "evidence": [
                "But sometimes I'll be looking at, say, a flight or a subscription service for some business software, and I'll see a price",
                "I run a bookstore, and margins are, well, they're thin",
                "As a small business owner, every single dollar counts"
            ]
        }
    ]
    
    print("🔍 Demographics Validation Analysis for Result ID 175")
    print("=" * 70)
    
    for test_case in test_cases:
        print(f"\n📊 {test_case['name']}")
        print(f"Description: {test_case['description']}")
        print(f"Evidence: {len(test_case['evidence'])} quotes")
        
        result = analyze_demographics_alignment(
            test_case['description'], 
            test_case['evidence']
        )
        
        print(f"\n✅ Alignment Score: {result['alignment_score']:.3f}")
        print(f"✅ Evidence Support: {result['evidence_indicators']}/{result['total_possible']} categories")
        
        print(f"\n📋 Category Analysis:")
        for category, analysis in result['category_analysis'].items():
            status = "✅" if analysis['supported_by_evidence'] else "❌"
            print(f"  {status} {category.title()}:")
            print(f"    - Description: {analysis['description_indicators']}")
            print(f"    - Evidence: {analysis['evidence_indicators']}")
        
        print("-" * 50)

if __name__ == "__main__":
    test_demographics_cases()
