"""
Test script for enhanced evidence validation and keyword highlighting.

This script tests the new validation services to ensure they properly:
1. Identify poor keyword highlighting (generic words)
2. Validate semantic alignment between evidence and descriptions
3. Provide meaningful improvement suggestions
4. Test demographics-specific validation improvements
"""

import sys
import os
import logging

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.processing.evidence_validator import EvidenceValidator, ValidationResult
from services.processing.keyword_highlighter import ContextAwareKeywordHighlighter

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_demographics_validation():
    """Test the enhanced demographics validation with real examples from analysis 175."""
    validator = EvidenceValidator()

    # Test cases from the actual analysis
    test_cases = [
        {
            "name": "Alex, The Algorithmic Auditor",
            "description": "Experience Level: Entry-level • Career Stage: Student • Industry: Tech • Location: San Francisco • Work Experience: A tech-savvy professional, likely in their 20s or 30s.",
            "evidence": [
                '"It\'s a **tech** solution to a **tech** problem, which I appreciate"',
                "\"It feels super manipulative, like **they**'re trying to extract an 'Apple tax' because **they** assume I'm willing to pay more just because I own an iPhone or a Mac\"",
            ],
            "expected_issues": ["Demographics claims not supported by evidence"],
        },
        {
            "name": "Chloe, The Credible Consumer Advocate",
            "description": "Career Stage: Mid career • Industry: Tech • Age Range: 45-54.",
            "evidence": [
                "\"My **audience**, they've invested in Apple's ecosystem for a reason—they appreciate the security, the **design**, the overall user experience\"",
                '"This is, in fact, one of the most persistent and frankly, vexing issues that my **audience**, particularly the more discerning iOS users, bring to my attention"',
            ],
            "expected_issues": ["Demographics claims not supported by evidence"],
        },
        {
            "name": "Eleanor, The Value-Seeking iPhone User",
            "description": "Profile: An older individual on a fixed income, primarily an Apple user (iPhone, iPad).",
            "evidence": [
                "\"I always wonder if they're trying to, you know, get more money out of me because I'm **older**, or maybe because I don't know all the tricks\"",
                "\"And when you're on a **fixed** income, every dollar really counts, so you want to make sure you're getting the best deal possible\"",
                '"But I *do* always feel like prices **online** can be a bit"',
            ],
            "expected_score_range": (0.6, 1.0),  # Should score well
        },
        {
            "name": "Alex, The Vigilant Bookseller",
            "description": "Industry: Tech • Education: Bachelor • Profile: A small business owner who runs a bookstore, operating with thin margins.",
            "evidence": [
                "\"But sometimes I'll be looking at, say, a flight or a subscription service for some **business** software, and I'll see a price\"",
                '"I run a bookstore, and margins are, well, **they**\'re thin"',
                '"As a **small** **business** **owner**, every single dollar counts"',
            ],
            "expected_score_range": (0.7, 1.0),  # Should score very well
        },
    ]

    print("\n🔍 Testing Enhanced Demographics Validation")
    print("=" * 60)

    for test_case in test_cases:
        print(f"\n📊 Testing: {test_case['name']}")
        print(f"Description: {test_case['description'][:100]}...")

        result = validator.validate_trait_evidence(
            trait_name="demographics",
            trait_description=test_case["description"],
            evidence_quotes=test_case["evidence"],
            confidence=0.9,
        )

        print(f"✅ Validation Score: {result.confidence_score:.3f}")
        print(f"✅ Semantic Alignment: {result.semantic_alignment_score:.3f}")
        print(f"✅ Keyword Relevance: {result.keyword_relevance_score:.3f}")

        if result.issues:
            print(f"⚠️  Issues: {', '.join(result.issues)}")
        if result.suggestions:
            print(f"💡 Suggestions: {', '.join(result.suggestions)}")

        # Check expected results
        if "expected_score_range" in test_case:
            min_score, max_score = test_case["expected_score_range"]
            if min_score <= result.semantic_alignment_score <= max_score:
                print(f"✅ Score within expected range [{min_score}-{max_score}]")
            else:
                print(
                    f"❌ Score {result.semantic_alignment_score:.3f} outside expected range [{min_score}-{max_score}]"
                )

        if "expected_issues" in test_case:
            found_expected = any(
                expected in " ".join(result.issues)
                for expected in test_case["expected_issues"]
            )
            if found_expected:
                print(f"✅ Found expected validation issues")
            else:
                print(f"❌ Expected issues not found: {test_case['expected_issues']}")

        print("-" * 40)


if __name__ == "__main__":
    test_demographics_validation()


def test_evidence_validator():
    """Test the evidence validator with good and bad examples."""
    print("\n🔍 Testing Evidence Validator...")

    validator = EvidenceValidator()

    # Test case 1: Good evidence with domain-specific highlighting
    good_persona = {
        "name": "Klaus, The Legacy Homeowner",
        "demographics": {
            "value": "Elderly retired homeowner with 40+ years of experience maintaining his property",
            "confidence": 0.95,
            "evidence": [
                "It's been our **home** for over **forty years**, you know",
                "I'm getting **older** and the **physical** work is getting harder",
                "My **wife** and I have been **maintaining** this place ourselves",
            ],
        },
        "challenges_and_frustrations": {
            "value": "Physical limitations make roof and gutter maintenance dangerous",
            "confidence": 0.9,
            "evidence": [
                "The **roof** is quite **high** with those **gables**",
                "**Climbing** the **ladder** is getting **dangerous** at my age",
                "The **physical strain** of **pressure washing** is overwhelming",
            ],
        },
    }

    # Test case 2: Bad evidence with generic highlighting
    bad_persona = {
        "name": "Generic User",
        "demographics": {
            "value": "A person who uses services",
            "confidence": 0.5,
            "evidence": [
                "I **have** been **with** this **and** that",
                "**The** service **is** good **but** **they** need improvement",
                "**When** I **was** using **their** platform **it** worked",
            ],
        },
        "challenges_and_frustrations": {
            "value": "Some difficulties with things",
            "confidence": 0.3,
            "evidence": [
                "**This** **is** **a** problem **that** **we** **have**",
                "**It** **was** difficult **to** **do** **the** thing",
            ],
        },
    }

    # Validate good persona
    print("\n✅ Testing GOOD persona:")
    good_results = validator.validate_persona_evidence(good_persona)
    for trait, result in good_results.items():
        print(
            f"  {trait}: Valid={result.is_valid}, Confidence={result.confidence_score:.2f}"
        )
        if result.issues:
            print(f"    Issues: {result.issues}")

    # Validate bad persona
    print("\n❌ Testing BAD persona:")
    bad_results = validator.validate_persona_evidence(bad_persona)
    for trait, result in bad_results.items():
        print(
            f"  {trait}: Valid={result.is_valid}, Confidence={result.confidence_score:.2f}"
        )
        if result.issues:
            print(f"    Issues: {result.issues}")
        if result.suggestions:
            print(f"    Suggestions: {result.suggestions}")


def test_keyword_highlighter():
    """Test the context-aware keyword highlighter."""
    print("\n🎯 Testing Context-Aware Keyword Highlighter...")

    highlighter = ContextAwareKeywordHighlighter()

    # Test case: Evidence with poor highlighting
    poor_evidence = [
        "I **have** been **with** this service **and** **they** are good",
        "**The** maintenance **is** important **but** **it** **was** expensive",
        "**When** **we** needed **roof** cleaning **they** **were** reliable",
    ]

    print("\n❌ Original evidence (poor highlighting):")
    for quote in poor_evidence:
        print(f"  '{quote}'")

    # Enhance the highlighting
    enhanced_evidence = highlighter.enhance_evidence_highlighting(
        poor_evidence,
        "challenges_and_frustrations",
        "Physical limitations and safety concerns with roof and gutter maintenance",
    )

    print("\n✅ Enhanced evidence (improved highlighting):")
    for quote in enhanced_evidence:
        print(f"  '{quote}'")

    # Validate highlighting quality
    original_quality = highlighter.validate_highlighting_quality(poor_evidence)
    enhanced_quality = highlighter.validate_highlighting_quality(enhanced_evidence)

    print(f"\n📊 Highlighting Quality Comparison:")
    print(
        f"  Original - Overall: {original_quality['overall_score']:.2f}, Generic: {original_quality['generic_ratio']:.1%}, Domain: {original_quality['domain_ratio']:.1%}"
    )
    print(
        f"  Enhanced - Overall: {enhanced_quality['overall_score']:.2f}, Generic: {enhanced_quality['generic_ratio']:.1%}, Domain: {enhanced_quality['domain_ratio']:.1%}"
    )


def test_integration():
    """Test the integration of both services."""
    print("\n🔗 Testing Integration...")

    # Create a persona with mixed quality evidence
    test_persona = {
        "name": "Test Integration Persona",
        "demographics": {
            "value": "Middle-aged professional with family responsibilities",
            "confidence": 0.8,
            "evidence": [
                "I **have** **been** working **in** **the** tech industry",
                "My **family** **and** I live **in** Bremen Nord",
                "**With** **my** demanding **job** **and** **kids** schedules",
            ],
        },
        "goals_and_motivations": {
            "value": "Wants reliable home maintenance services to save time",
            "confidence": 0.85,
            "evidence": [
                "I need **reliable** **professional** **service** providers",
                "**Time** **is** **my** biggest constraint **with** work **and** family",
                "**Quality** **maintenance** **is** important for **home** **value**",
            ],
        },
    }

    # Validate with evidence validator
    validator = EvidenceValidator()
    results = validator.validate_persona_evidence(test_persona)

    print("\n📋 Validation Results:")
    for trait, result in results.items():
        print(f"  {trait}:")
        print(f"    Valid: {result.is_valid}")
        print(f"    Confidence: {result.confidence_score:.2f}")
        print(f"    Semantic Alignment: {result.semantic_alignment_score:.2f}")
        print(f"    Keyword Relevance: {result.keyword_relevance_score:.2f}")
        if result.issues:
            print(f"    Issues: {result.issues}")
        if result.suggestions:
            print(f"    Suggestions: {result.suggestions}")

    # Get improvement suggestions
    suggestions = validator.get_improvement_suggestions(results)
    if suggestions:
        print(f"\n💡 Overall Improvement Suggestions:")
        for suggestion in suggestions:
            print(f"  • {suggestion}")


def main():
    """Run all tests."""
    print("🚀 Starting Enhanced Validation Tests...")

    try:
        test_evidence_validator()
        test_keyword_highlighter()
        test_integration()

        print("\n✅ All tests completed successfully!")

    except Exception as e:
        print(f"\n❌ Test failed with error: {str(e)}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
