#!/usr/bin/env python3
"""
Test script to validate enhanced keyword highlighting improvements.
Tests the updated ContextAwareKeywordHighlighter with real examples from Result ID 176.
"""

import sys
import os
import re
from typing import List, Dict, Any

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from services.processing.keyword_highlighter import ContextAwareKeywordHighlighter, HighlightingContext

def extract_highlighted_keywords(text: str) -> List[str]:
    """Extract keywords that are highlighted with **bold** formatting."""
    if not text:
        return []
    
    # Find all text between ** markers
    highlighted = re.findall(r'\*\*(.*?)\*\*', text)
    return [keyword.strip() for keyword in highlighted if keyword.strip()]

def test_keyword_highlighting_improvements():
    """Test the enhanced keyword highlighting with real examples from Result ID 176."""
    
    print("🔧 Testing Enhanced Keyword Highlighting Algorithm")
    print("=" * 70)
    
    # Initialize the enhanced highlighter
    highlighter = ContextAwareKeywordHighlighter()
    
    # Test cases from Result ID 176 with problematic highlighting
    test_cases = [
        {
            "name": "Generic Pronoun Overuse Test",
            "original_quote": "My **audience**, **they**'ve invested in Apple's ecosystem for a reason—**they** appreciate the security, the **design**, the overall user experience",
            "raw_quote": "My audience, they've invested in Apple's ecosystem for a reason—they appreciate the security, the design, the overall user experience",
            "trait": "demographics",
            "expected_improvements": ["Apple's ecosystem", "security", "design"],
            "should_avoid": ["they", "audience"]
        },
        {
            "name": "Filler Word Test",
            "original_quote": "Not by a ton, usually, but sometimes enough to be annoying – **like** $20, $30 difference on a domestic flight",
            "raw_quote": "Not by a ton, usually, but sometimes enough to be annoying – like $20, $30 difference on a domestic flight",
            "trait": "challenges_and_frustrations",
            "expected_improvements": ["$20", "$30", "flight", "annoying"],
            "should_avoid": ["like"]
        },
        {
            "name": "Price Discrimination Core Terms Test",
            "original_quote": "It feels super manipulative, **like** **they**'re trying to extract an 'Apple tax' because **they** assume I'm willing to pay more just because I own an iPhone or a Mac",
            "raw_quote": "It feels super manipulative, like they're trying to extract an 'Apple tax' because they assume I'm willing to pay more just because I own an iPhone or a Mac",
            "trait": "challenges_and_frustrations",
            "expected_improvements": ["manipulative", "Apple tax", "iPhone", "Mac"],
            "should_avoid": ["like", "they"]
        },
        {
            "name": "Technical Terms Test",
            "original_quote": "I'll open up an incognito browser window, or I'll use a different device entirely",
            "raw_quote": "I'll open up an incognito browser window, or I'll use a different device entirely",
            "trait": "technology_and_tools",
            "expected_improvements": ["incognito", "browser", "device"],
            "should_avoid": ["I'll", "up", "or"]
        }
    ]
    
    print(f"📊 Testing {len(test_cases)} keyword highlighting scenarios:")
    print()
    
    for i, test_case in enumerate(test_cases):
        print(f"🔸 Test {i+1}: {test_case['name']}")
        print(f"   Original quote: \"{test_case['raw_quote'][:80]}...\"")
        print(f"   Previous highlighting: {extract_highlighted_keywords(test_case['original_quote'])}")
        
        # Create highlighting context
        context = HighlightingContext(
            trait_name=test_case['trait'],
            trait_description=f"Testing {test_case['trait']} trait",
            priority_keywords=set(),
            domain_keywords=set()
        )
        
        # Test the enhanced highlighting
        try:
            highlighted_quote = highlighter.highlight_keywords_in_quote(
                test_case['raw_quote'], 
                context
            )
            
            new_keywords = extract_highlighted_keywords(highlighted_quote)
            print(f"   Enhanced highlighting: {new_keywords}")
            
            # Analyze improvements
            improvements = []
            issues = []
            
            for expected in test_case['expected_improvements']:
                if any(expected.lower() in kw.lower() for kw in new_keywords):
                    improvements.append(f"✅ Now highlights '{expected}'")
                else:
                    issues.append(f"❌ Still missing '{expected}'")
            
            for avoid in test_case['should_avoid']:
                if any(avoid.lower() == kw.lower() for kw in new_keywords):
                    issues.append(f"❌ Still highlighting '{avoid}'")
                else:
                    improvements.append(f"✅ No longer highlights '{avoid}'")
            
            if improvements:
                print(f"   Improvements:")
                for improvement in improvements:
                    print(f"      {improvement}")
            
            if issues:
                print(f"   Remaining issues:")
                for issue in issues:
                    print(f"      {issue}")
            
            if not issues:
                print(f"   🎉 Perfect! All improvements achieved.")
            
        except Exception as e:
            print(f"   ❌ Error testing highlighting: {str(e)}")
        
        print()
    
    print("=" * 70)
    print("🎯 SUMMARY")
    print("=" * 70)
    
    print("Enhanced Algorithm Features:")
    print("✅ Added price discrimination core terms with 1.2x priority")
    print("✅ Expanded generic words blacklist (they, like, audience, experience)")
    print("✅ Updated domain keywords for price discrimination context")
    print("✅ Enhanced LLM prompts with domain-specific instructions")
    
    print("\nExpected Improvements:")
    print("• Reduced generic keyword highlighting from 45-82% to <30%")
    print("• Increased domain-specific highlighting from 0-54% to >60%")
    print("• Better focus on Apple, iOS, price, discrimination, device terms")
    print("• Elimination of 'they', 'like', 'that' overuse")

def test_domain_keyword_prioritization():
    """Test that domain-specific keywords get proper priority."""
    
    print("\n🎯 Testing Domain Keyword Prioritization")
    print("=" * 50)
    
    highlighter = ContextAwareKeywordHighlighter()
    
    # Test quote with mix of generic and domain-specific terms
    test_quote = "I think Apple's pricing algorithm is manipulative when they detect my iPhone device"
    
    context = HighlightingContext(
        trait_name="challenges_and_frustrations",
        trait_description="Testing domain prioritization",
        priority_keywords=set(),
        domain_keywords=set()
    )
    
    # Test word relevance scoring
    words = ["think", "apple", "pricing", "algorithm", "manipulative", "they", "detect", "iphone", "device"]
    
    print("Word Relevance Scores:")
    for word in words:
        score = highlighter._calculate_word_relevance(word.lower(), context)
        priority = "🔥 CORE" if score >= 1.2 else "⭐ HIGH" if score >= 0.8 else "📍 MED" if score >= 0.5 else "❌ LOW"
        print(f"   {word:12} → {score:.1f} {priority}")
    
    # Test actual highlighting
    highlighted = highlighter.highlight_keywords_in_quote(test_quote, context)
    highlighted_words = extract_highlighted_keywords(highlighted)
    
    print(f"\nHighlighted Quote: {highlighted}")
    print(f"Keywords Selected: {highlighted_words}")
    
    # Check if core terms are prioritized
    core_terms = ['apple', 'pricing', 'algorithm', 'manipulative', 'iphone', 'device']
    generic_terms = ['think', 'they']
    
    core_highlighted = sum(1 for term in core_terms if any(term.lower() in kw.lower() for kw in highlighted_words))
    generic_highlighted = sum(1 for term in generic_terms if any(term.lower() == kw.lower() for kw in highlighted_words))
    
    print(f"\nPrioritization Results:")
    print(f"   Core terms highlighted: {core_highlighted}/{len(core_terms)} ({core_highlighted/len(core_terms)*100:.1f}%)")
    print(f"   Generic terms highlighted: {generic_highlighted}/{len(generic_terms)} ({generic_highlighted/len(generic_terms)*100:.1f}%)")
    
    if core_highlighted > generic_highlighted:
        print("   ✅ SUCCESS: Core terms prioritized over generic terms")
    else:
        print("   ❌ ISSUE: Generic terms still being prioritized")

if __name__ == "__main__":
    test_keyword_highlighting_improvements()
    test_domain_keyword_prioritization()
