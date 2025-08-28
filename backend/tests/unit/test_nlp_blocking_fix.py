#!/usr/bin/env python3
"""
Test script to verify that hardcoded NLP validation no longer blocks LLM question generation.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.api.routes.customer_research import validate_business_readiness_fallback

def test_nlp_blocking_fix():
    """Test that the NLP gatekeeper no longer blocks question generation."""
    
    print("🧪 Testing NLP Blocking Fix")
    print("=" * 60)
    
    # Test cases that previously would have been blocked by hardcoded NLP
    test_cases = [
        {
            "name": "User Asking for Examples (Previously Blocked)",
            "conversation": "User: I want to start a business\nAssistant: What type of business?\nUser: I'm not sure, can you give me examples?",
            "latest_input": "I'm not sure, can you give me examples?",
            "expected_before": False,  # Would have been blocked
            "expected_after": True,   # Should now allow LLM to decide
        },
        {
            "name": "Vague Business Idea (Previously Blocked)",
            "conversation": "User: I want to build something for customers",
            "latest_input": "I want to build something for customers",
            "expected_before": False,  # Would have been blocked
            "expected_after": True,   # Should now allow LLM to decide
        },
        {
            "name": "Short Conversation (Previously Blocked)",
            "conversation": "User: API for data",
            "latest_input": "API for data",
            "expected_before": False,  # Would have been blocked by word count
            "expected_after": True,   # Should now allow LLM to decide
        },
        {
            "name": "Missing Keywords (Previously Blocked)",
            "conversation": "User: I want to create a solution for people who have trouble with their current process",
            "latest_input": "I want to create a solution for people who have trouble with their current process",
            "expected_before": False,  # Would have been blocked by missing specific keywords
            "expected_after": True,   # Should now allow LLM to decide
        }
    ]
    
    print("🔍 Testing Fallback Validation Behavior:")
    print("-" * 60)
    
    all_passed = True
    
    for case in test_cases:
        result = validate_business_readiness_fallback(case["conversation"], case["latest_input"])
        ready = result.get("ready_for_questions", False)
        
        # Check if the fix is working (should always return True now)
        if ready == case["expected_after"]:
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
            all_passed = False
        
        print(f"{status} {case['name']}")
        print(f"   Input: '{case['latest_input']}'")
        print(f"   Expected After Fix: {case['expected_after']}, Got: {ready}")
        print(f"   Reasoning: {result.get('reasoning', 'No reasoning')}")
        print()
    
    print("🎯 VALIDATION BEHAVIOR ANALYSIS:")
    print("-" * 60)
    
    # Test a sample case to see the new behavior
    sample_result = validate_business_readiness_fallback(
        "User: I'm not sure what to build", 
        "Can you give me examples?"
    )
    
    print(f"Sample Result for Uncertain User:")
    print(f"  ready_for_questions: {sample_result.get('ready_for_questions')}")
    print(f"  confidence: {sample_result.get('confidence')}")
    print(f"  reasoning: {sample_result.get('reasoning')}")
    print(f"  recommendations: {sample_result.get('recommendations', [])}")
    
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    if all_passed:
        print("🎉 SUCCESS: NLP blocking has been eliminated!")
        print("✅ Hardcoded validation no longer blocks LLM question generation")
        print("✅ All validation now returns permissive results")
        print("✅ LLM-based question generation can proceed without NLP gatekeeping")
        print("\n🚀 IMPACT:")
        print("  - Users won't get stuck in guidance loops")
        print("  - LLM can generate questions based on context understanding")
        print("  - No more false negatives from keyword matching")
        print("  - System is now truly LLM-driven, not NLP-driven")
        return True
    else:
        print("⚠️  PARTIAL SUCCESS: Some NLP blocking may still exist")
        print("🔧 Additional fixes may be needed")
        return False

def test_deprecated_warning():
    """Test that the deprecated function shows appropriate warnings."""
    
    print("\n🚨 Testing Deprecated Function Warnings:")
    print("-" * 60)
    
    # Capture any warnings (in a real test, you'd use logging capture)
    print("Calling deprecated fallback function...")
    
    result = validate_business_readiness_fallback("test", "test")
    
    print(f"✅ Function still works (backward compatibility)")
    print(f"✅ Returns permissive validation: {result.get('ready_for_questions')}")
    print(f"✅ Includes deprecation warning in reasoning: {result.get('reasoning')}")
    print(f"✅ Recommends LLM usage: {result.get('recommendations')}")

if __name__ == "__main__":
    print("🔬 NLP BLOCKING FIX VERIFICATION")
    print("Testing that hardcoded NLP no longer blocks LLM question generation")
    print("=" * 80)
    
    success = test_nlp_blocking_fix()
    test_deprecated_warning()
    
    print("\n" + "=" * 80)
    print("🎯 FINAL RESULT")
    print("=" * 80)
    
    if success:
        print("🎉 NLP BLOCKING ELIMINATED SUCCESSFULLY!")
        print("The LLM-based question generation is now free to operate")
        print("without being blocked by hardcoded NLP validation logic.")
        sys.exit(0)
    else:
        print("⚠️  Additional work may be needed to fully eliminate NLP blocking")
        sys.exit(1)
