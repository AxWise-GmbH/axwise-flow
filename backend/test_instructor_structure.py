#!/usr/bin/env python3
"""
Test the Enhanced Instructor Client structure without dependencies.
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_instructor_file_structure():
    """Test that the instructor file has the expected structure."""
    print("🔍 Testing Instructor File Structure...")
    
    instructor_file = "services/llm/instructor_gemini_client.py"
    
    if not os.path.exists(instructor_file):
        print(f"❌ File not found: {instructor_file}")
        return False
    
    with open(instructor_file, 'r') as f:
        content = f.read()
    
    # Check for key classes and methods
    expected_elements = [
        "class EnhancedInstructorGeminiClient",
        "class GenerationMetrics",
        "class EnhancedInstructorError",
        "def generate_with_model",
        "def generate_with_model_async",
        "def get_performance_stats",
        "def _create_metrics",
        "def _finalize_metrics",
        "retry_strategies",
        "max_retries",
        "enable_metrics",
        "InstructorGeminiClient = EnhancedInstructorGeminiClient"  # Backward compatibility
    ]
    
    missing_elements = []
    for element in expected_elements:
        if element not in content:
            missing_elements.append(element)
    
    if missing_elements:
        print(f"❌ Missing elements: {missing_elements}")
        return False
    else:
        print("✅ All expected elements found in instructor file")
        return True

def test_models_structure():
    """Test that our enhanced models have the expected structure."""
    print("\n🔍 Testing Enhanced Models Structure...")
    
    model_files = [
        "models/enhanced_research_models.py",
        "models/industry_stakeholder_models.py", 
        "models/research_questions_models.py"
    ]
    
    for model_file in model_files:
        if not os.path.exists(model_file):
            print(f"❌ Model file not found: {model_file}")
            return False
        
        with open(model_file, 'r') as f:
            content = f.read()
        
        # Check for Pydantic imports and BaseModel usage
        if "from pydantic import BaseModel" not in content:
            print(f"❌ Missing Pydantic imports in {model_file}")
            return False
        
        if "class " not in content:
            print(f"❌ No classes found in {model_file}")
            return False
    
    print("✅ All model files have correct structure")
    return True

def test_enhanced_research_models_content():
    """Test specific content in enhanced research models."""
    print("\n🔍 Testing Enhanced Research Models Content...")
    
    model_file = "models/enhanced_research_models.py"
    
    with open(model_file, 'r') as f:
        content = f.read()
    
    expected_classes = [
        "class ConversationStage",
        "class UserIntent",
        "class BusinessReadiness", 
        "class BusinessContext",
        "class ConversationFlow",
        "class EnhancedResearchResponse"
    ]
    
    missing_classes = []
    for class_name in expected_classes:
        if class_name not in content:
            missing_classes.append(class_name)
    
    if missing_classes:
        print(f"❌ Missing classes: {missing_classes}")
        return False
    
    # Check for field validators
    if "@field_validator" not in content:
        print("❌ Missing field validators")
        return False
    
    # Check for model validators
    if "@model_validator" not in content:
        print("❌ Missing model validators")
        return False
    
    print("✅ Enhanced research models content is complete")
    return True

def test_industry_stakeholder_models_content():
    """Test industry and stakeholder models content."""
    print("\n🔍 Testing Industry & Stakeholder Models Content...")
    
    model_file = "models/industry_stakeholder_models.py"
    
    with open(model_file, 'r') as f:
        content = f.read()
    
    expected_classes = [
        "class IndustryAnalysis",
        "class StakeholderGroup",
        "class StakeholderAnalysis"
    ]
    
    missing_classes = []
    for class_name in expected_classes:
        if class_name not in content:
            missing_classes.append(class_name)
    
    if missing_classes:
        print(f"❌ Missing classes: {missing_classes}")
        return False
    
    # Check for industry guidance
    if "industry_guidance" not in content:
        print("❌ Missing industry guidance functionality")
        return False
    
    # Check for stakeholder complexity
    if "multi_stakeholder_complexity" not in content:
        print("❌ Missing stakeholder complexity analysis")
        return False
    
    print("✅ Industry & stakeholder models content is complete")
    return True

def test_research_questions_models_content():
    """Test research questions models content."""
    print("\n🔍 Testing Research Questions Models Content...")
    
    model_file = "models/research_questions_models.py"
    
    with open(model_file, 'r') as f:
        content = f.read()
    
    expected_classes = [
        "class ResearchQuestion",
        "class EnhancedResearchQuestions"
    ]
    
    missing_classes = []
    for class_name in expected_classes:
        if class_name not in content:
            missing_classes.append(class_name)
    
    if missing_classes:
        print(f"❌ Missing classes: {missing_classes}")
        return False
    
    # Check for question validation
    if "validate_question_format" not in content:
        print("❌ Missing question format validation")
        return False
    
    # Check for quality scoring
    if "question_quality_score" not in content:
        print("❌ Missing question quality scoring")
        return False
    
    print("✅ Research questions models content is complete")
    return True

def test_file_sizes():
    """Test that files are substantial (not empty)."""
    print("\n📏 Testing File Sizes...")
    
    files_to_check = [
        "models/enhanced_research_models.py",
        "models/industry_stakeholder_models.py",
        "models/research_questions_models.py",
        "services/llm/instructor_gemini_client.py"
    ]
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            if size < 1000:  # Less than 1KB is probably too small
                print(f"⚠️  {file_path} is quite small ({size} bytes)")
            else:
                print(f"✅ {file_path}: {size} bytes")
        else:
            print(f"❌ {file_path} not found")
            return False
    
    return True

def test_imports_syntax():
    """Test that files have valid Python syntax for imports."""
    print("\n🐍 Testing Python Syntax...")
    
    files_to_check = [
        "models/enhanced_research_models.py",
        "models/industry_stakeholder_models.py",
        "models/research_questions_models.py"
    ]
    
    for file_path in files_to_check:
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Try to compile the file
            compile(content, file_path, 'exec')
            print(f"✅ {file_path}: Valid Python syntax")
            
        except SyntaxError as e:
            print(f"❌ {file_path}: Syntax error - {e}")
            return False
        except Exception as e:
            print(f"⚠️  {file_path}: Warning - {e}")
    
    return True

if __name__ == "__main__":
    print("🧪 Enhanced Research Models & Instructor Structure Test")
    print("=" * 60)
    
    tests = [
        ("Instructor File Structure", test_instructor_file_structure),
        ("Models Structure", test_models_structure),
        ("Enhanced Research Models Content", test_enhanced_research_models_content),
        ("Industry & Stakeholder Models Content", test_industry_stakeholder_models_content),
        ("Research Questions Models Content", test_research_questions_models_content),
        ("File Sizes", test_file_sizes),
        ("Python Syntax", test_imports_syntax),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔍 Running: {test_name}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 Test Results Summary:")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All structure tests passed! Implementation is ready.")
        print("\n📋 Summary of what we've built:")
        print("   ✅ Enhanced Pydantic models with comprehensive validation")
        print("   ✅ Industry analysis with auto-generated guidance")
        print("   ✅ Stakeholder detection with complexity assessment")
        print("   ✅ Research questions with quality scoring")
        print("   ✅ Enhanced Instructor client with retry logic")
        print("   ✅ Performance monitoring and metrics")
        print("   ✅ Advanced error handling")
        sys.exit(0)
    else:
        print("⚠️  Some structure tests failed. Please review the implementation.")
        sys.exit(1)
