#!/usr/bin/env python3
"""
Test script to verify automatic interview cleaning integration.
"""

import asyncio
import sys
import os

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.utils.interview_cleaner import InterviewCleaner, clean_interview_content


def test_detection():
    """Test synthetic interview format detection."""
    print("🧪 Testing synthetic interview format detection...")
    
    # Test with synthetic interview content
    synthetic_content = """
    SYNTHETIC INTERVIEW SIMULATION RESULTS
    ==================================================
    
    INTERVIEW DIALOGUE
    ------------------
    
    [11:09] Researcher: How do you manage your tasks?
    [11:10] Interviewee: Well, it's quite challenging...
    
    💡 Key Insights: Time management is crucial.
    """
    
    is_synthetic = InterviewCleaner.detect_synthetic_interview_format(synthetic_content)
    print(f"✅ Synthetic format detected: {is_synthetic}")
    
    # Test with regular content
    regular_content = """
    This is just regular interview content.
    No special formatting here.
    """
    
    is_regular = InterviewCleaner.detect_synthetic_interview_format(regular_content)
    print(f"✅ Regular format detected as synthetic: {is_regular}")
    
    return is_synthetic and not is_regular


def test_cleaning():
    """Test the cleaning functionality."""
    print("\n🧪 Testing interview cleaning functionality...")
    
    # Read the actual test file
    test_file = "/Users/admin/Documents/DesignThinkingAgentAI/enhanced_interviews_3c50047c_2025-08-22.txt"
    
    if not os.path.exists(test_file):
        print(f"❌ Test file not found: {test_file}")
        return False
    
    with open(test_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"📄 Original content size: {len(content)} characters")
    
    # Test automatic cleaning
    cleaned_content, metadata = clean_interview_content(content, "test_file.txt")
    
    if metadata:
        print(f"✅ Cleaning applied successfully!")
        print(f"   - Interviews processed: {metadata['interviews_processed']}")
        print(f"   - Dialogue lines extracted: {metadata['dialogue_lines_extracted']}")
        print(f"   - Stakeholder categories: {len(metadata['stakeholder_categories'])}")
        print(f"   - Cleaned content size: {len(cleaned_content)} characters")
        print(f"   - Size reduction: {((len(content) - len(cleaned_content)) / len(content) * 100):.1f}%")
        
        # Check if timestamps are preserved
        if "[11:" in cleaned_content:
            print("✅ Timestamps preserved in cleaned content")
        else:
            print("❌ Timestamps missing in cleaned content")
            
        return True
    else:
        print("❌ No cleaning metadata returned")
        return False


def test_integration():
    """Test the integration with data service logic."""
    print("\n🧪 Testing integration logic...")
    
    # Simulate the data service workflow
    test_content = """
    SYNTHETIC INTERVIEW SIMULATION RESULTS
    ==================================================
    
    INTERVIEW 1 OF 25
    ==============================
    
    INTERVIEW DIALOGUE
    ------------------
    
    [11:09] Researcher: Test question?
    [11:10] Interviewee: Test response with detailed information.
    
    💡 Key Insights: This is a test insight.
    
    ==================================================
    """
    
    # Test the cleaning function
    cleaned_content, cleaning_metadata = clean_interview_content(test_content, "test_integration.txt")
    
    if cleaning_metadata:
        print("✅ Integration test successful!")
        print(f"   - Detected synthetic format: True")
        print(f"   - Applied cleaning: True")
        print(f"   - Interviews processed: {cleaning_metadata['interviews_processed']}")
        print(f"   - Dialogue lines: {cleaning_metadata['dialogue_lines_extracted']}")
        
        # Verify cleaned content structure
        if "--- INTERVIEW 1 ---" in cleaned_content and "[11:09] Researcher:" in cleaned_content:
            print("✅ Cleaned content has correct structure")
            return True
        else:
            print("❌ Cleaned content structure incorrect")
            return False
    else:
        print("❌ Integration test failed - no cleaning applied")
        return False


def main():
    """Run all tests."""
    print("🚀 Starting automatic interview cleaning tests...\n")
    
    tests = [
        ("Format Detection", test_detection),
        ("Cleaning Functionality", test_cleaning),
        ("Integration Logic", test_integration)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
            print(f"{'✅' if result else '❌'} {test_name}: {'PASSED' if result else 'FAILED'}")
        except Exception as e:
            print(f"❌ {test_name}: ERROR - {str(e)}")
            results.append((test_name, False))
    
    print(f"\n📊 Test Results Summary:")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"   - Passed: {passed}/{total}")
    print(f"   - Success Rate: {(passed/total*100):.1f}%")
    
    if passed == total:
        print("\n🎉 All tests passed! Automatic interview cleaning is ready!")
    else:
        print(f"\n⚠️  {total-passed} test(s) failed. Please check the implementation.")


if __name__ == "__main__":
    main()
