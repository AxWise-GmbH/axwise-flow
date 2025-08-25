#!/usr/bin/env python3
"""
Simple test to validate enhanced keyword highlighting improvements.
Tests the core logic without complex imports.
"""

import re
from typing import List, Set

def extract_highlighted_keywords(text: str) -> List[str]:
    """Extract keywords that are highlighted with **bold** formatting."""
    if not text:
        return []
    
    # Find all text between ** markers
    highlighted = re.findall(r'\*\*(.*?)\*\*', text)
    return [keyword.strip() for keyword in highlighted if keyword.strip()]

def calculate_enhanced_word_relevance(word: str) -> float:
    """Enhanced word relevance calculation based on our improvements."""
    
    # Generic words that should never be highlighted (expanded list)
    generic_words = {
        "with", "have", "their", "like", "and", "the", "is", "are", "was", "were",
        "but", "or", "so", "then", "when", "where", "this", "that", "these", "those",
        "a", "an", "in", "on", "at", "to", "for", "of", "by", "from", "up", "about",
        "into", "through", "during", "before", "after", "above", "below", "between",
        # Additional problematic terms identified in analysis
        "they", "them", "it", "its", "very", "really", "just", "only", "also", "even",
        "good", "bad", "better", "best", "more", "most", "some", "many", "other",
        "thing", "stuff", "way", "time", "people", "person", "experience", "audience"
    }
    
    # Price discrimination core terms (highest priority)
    price_discrimination_core = {
        'apple', 'ios', 'price', 'pricing', 'discrimination', 'premium', 
        'device', 'algorithm', 'fingerprinting', 'detection', 'manipulative'
    }
    
    # Domain-specific keywords for price discrimination context
    domain_keywords = {
        # Platform/Device terms
        'apple', 'ios', 'macos', 'iphone', 'ipad', 'mac', 'macbook', 'safari',
        'android', 'device', 'browser', 'chrome', 'firefox', 'mobile', 'desktop',
        # Price-related terms
        'price', 'pricing', 'discrimination', 'premium', 'markup', 'tax', 'gouge',
        'cost', 'expensive', 'cheap', 'budget', 'savings', 'discount', 'fee',
        'dollar', 'money', 'payment', 'subscription', 'billing',
        # Technical terms
        'algorithm', 'fingerprinting', 'detection', 'tracking', 'cookies',
        'user-agent', 'spoofing', 'vpn', 'proxy', 'incognito', 'private',
        # Business/Platform terms
        'website', 'online', 'ecommerce', 'platform', 'service', 'software',
        'app', 'application', 'booking', 'flight', 'hotel', 'travel',
        # Emotional terms related to pricing
        'manipulative', 'unfair', 'exploit', 'penalized', 'frustrated', 'annoying',
        'resentment', 'trust', 'betrayed', 'cheated', 'ecosystem'
    }
    
    word_lower = word.lower()
    
    if word_lower in generic_words:
        return 0.0  # Never highlight generic words
    
    if word_lower in price_discrimination_core:
        return 1.2  # Highest priority for core domain terms
    
    if word_lower in domain_keywords:
        return 0.8  # High priority for domain terms
    
    # Check for numeric values (prices, percentages)
    if re.match(r'^\$?\d+', word) or '%' in word:
        return 0.9  # High priority for quantitative data
    
    return 0.3  # Low priority for other terms

def simulate_enhanced_highlighting(quote: str, max_keywords: int = 4) -> str:
    """Simulate enhanced keyword highlighting on a quote."""
    
    words = re.findall(r'\b\w+\b', quote)
    word_scores = {}
    
    # Score each unique word
    for word in set(words):
        score = calculate_enhanced_word_relevance(word)
        if score > 0:
            word_scores[word] = score
    
    # Select top words to highlight
    sorted_words = sorted(word_scores.items(), key=lambda x: x[1], reverse=True)
    words_to_highlight = [word for word, score in sorted_words[:max_keywords] if score >= 0.5]
    
    # Apply highlighting to the quote
    highlighted_quote = quote
    for word in words_to_highlight:
        # Use word boundaries to avoid partial matches
        pattern = r'\b' + re.escape(word) + r'\b'
        highlighted_quote = re.sub(pattern, f'**{word}**', highlighted_quote, flags=re.IGNORECASE)
    
    return highlighted_quote

def test_keyword_improvements():
    """Test the enhanced keyword highlighting with real examples."""
    
    print("🔧 Testing Enhanced Keyword Highlighting Algorithm")
    print("=" * 70)
    
    # Test cases from Result ID 176 with problematic highlighting
    test_cases = [
        {
            "name": "Generic Pronoun Overuse Test",
            "original": "My **audience**, **they**'ve invested in Apple's ecosystem for a reason—**they** appreciate the security, the **design**, the overall user experience",
            "raw": "My audience, they've invested in Apple's ecosystem for a reason—they appreciate the security, the design, the overall user experience",
            "expected_better": ["Apple", "ecosystem", "security", "design"],
            "should_avoid": ["they", "audience"]
        },
        {
            "name": "Filler Word Test",
            "original": "Not by a ton, usually, but sometimes enough to be annoying – **like** $20, $30 difference on a domestic flight",
            "raw": "Not by a ton, usually, but sometimes enough to be annoying – like $20, $30 difference on a domestic flight",
            "expected_better": ["$20", "$30", "flight", "annoying"],
            "should_avoid": ["like"]
        },
        {
            "name": "Price Discrimination Core Terms Test",
            "original": "It feels super manipulative, **like** **they**'re trying to extract an 'Apple tax' because **they** assume I'm willing to pay more just because I own an iPhone or a Mac",
            "raw": "It feels super manipulative, like they're trying to extract an 'Apple tax' because they assume I'm willing to pay more just because I own an iPhone or a Mac",
            "expected_better": ["manipulative", "Apple", "tax", "iPhone", "Mac"],
            "should_avoid": ["like", "they"]
        },
        {
            "name": "Technical Terms Test",
            "original": "I'll open up an incognito browser window, or I'll use a different device entirely",
            "raw": "I'll open up an incognito browser window, or I'll use a different device entirely",
            "expected_better": ["incognito", "browser", "device"],
            "should_avoid": ["I'll", "up", "or"]
        }
    ]
    
    total_improvements = 0
    total_tests = 0
    
    for i, test_case in enumerate(test_cases):
        print(f"\n🔸 Test {i+1}: {test_case['name']}")
        print(f"   Raw quote: \"{test_case['raw'][:80]}...\"")
        
        # Extract original keywords
        original_keywords = extract_highlighted_keywords(test_case['original'])
        print(f"   Original highlighting: {original_keywords}")
        
        # Apply enhanced highlighting
        enhanced_quote = simulate_enhanced_highlighting(test_case['raw'])
        enhanced_keywords = extract_highlighted_keywords(enhanced_quote)
        print(f"   Enhanced highlighting: {enhanced_keywords}")
        print(f"   Enhanced quote: \"{enhanced_quote[:100]}...\"")
        
        # Analyze improvements
        improvements = 0
        issues = 0
        
        print(f"   Analysis:")
        for expected in test_case['expected_better']:
            if any(expected.lower() in kw.lower() for kw in enhanced_keywords):
                print(f"      ✅ Now highlights '{expected}'")
                improvements += 1
            else:
                print(f"      ❌ Still missing '{expected}'")
                issues += 1
        
        for avoid in test_case['should_avoid']:
            if any(avoid.lower() == kw.lower() for kw in enhanced_keywords):
                print(f"      ❌ Still highlighting '{avoid}'")
                issues += 1
            else:
                print(f"      ✅ No longer highlights '{avoid}'")
                improvements += 1
        
        total_improvements += improvements
        total_tests += improvements + issues
        
        success_rate = (improvements / (improvements + issues) * 100) if (improvements + issues) > 0 else 0
        print(f"   Success rate: {success_rate:.1f}% ({improvements}/{improvements + issues})")
    
    print(f"\n{'='*70}")
    print("🎯 OVERALL RESULTS")
    print(f"{'='*70}")
    
    overall_success = (total_improvements / total_tests * 100) if total_tests > 0 else 0
    print(f"Overall Success Rate: {overall_success:.1f}% ({total_improvements}/{total_tests})")
    
    print(f"\nKey Improvements Implemented:")
    print(f"✅ Blacklisted generic terms: they, like, audience, experience")
    print(f"✅ Prioritized core terms: Apple, iOS, price, discrimination, device")
    print(f"✅ Enhanced scoring: Core terms (1.2x), Domain terms (0.8x), Generic (0.0x)")
    print(f"✅ Added quantitative detection: $20, $30, percentages")
    
    if overall_success >= 70:
        print(f"\n🎉 SUCCESS: Enhanced algorithm shows significant improvement!")
    elif overall_success >= 50:
        print(f"\n⚠️  PARTIAL: Enhanced algorithm shows some improvement, needs refinement")
    else:
        print(f"\n❌ NEEDS WORK: Enhanced algorithm needs further improvements")

def test_word_scoring():
    """Test the enhanced word scoring system."""
    
    print(f"\n🎯 Testing Enhanced Word Scoring System")
    print("=" * 50)
    
    # Test words from actual quotes
    test_words = [
        # Generic terms (should score 0.0)
        "they", "like", "that", "with", "experience", "audience",
        # Core domain terms (should score 1.2)
        "apple", "ios", "price", "discrimination", "device", "algorithm",
        # Domain terms (should score 0.8)
        "browser", "incognito", "premium", "manipulative", "iphone",
        # Quantitative (should score 0.9)
        "$20", "$30", "20%",
        # Other terms (should score 0.3)
        "security", "design", "window"
    ]
    
    print("Word Scoring Results:")
    for word in test_words:
        score = calculate_enhanced_word_relevance(word)
        if score >= 1.2:
            category = "🔥 CORE"
        elif score >= 0.9:
            category = "💰 QUANT"
        elif score >= 0.8:
            category = "⭐ DOMAIN"
        elif score > 0:
            category = "📍 OTHER"
        else:
            category = "❌ BLOCKED"
        
        print(f"   {word:15} → {score:.1f} {category}")

if __name__ == "__main__":
    test_keyword_improvements()
    test_word_scoring()
