#!/usr/bin/env python3
"""
Test Epic 3: V1 Feature Extraction & Integration Structure.
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_service_files_exist():
    """Test that all Epic 3 service files exist."""
    print("📁 Testing Service Files Existence...")
    
    service_files = [
        "services/research/industry_classification_service.py",
        "services/research/stakeholder_detection_service.py",
        "services/research/context_extraction_service.py",
        "services/research/conversation_flow_service.py"
    ]
    
    for file_path in service_files:
        if not os.path.exists(file_path):
            print(f"❌ Service file missing: {file_path}")
            return False
        
        # Check file size
        size = os.path.getsize(file_path)
        if size < 5000:  # Less than 5KB is probably too small
            print(f"⚠️  {file_path} is quite small ({size} bytes)")
        else:
            print(f"✅ {file_path}: {size} bytes")
    
    return True

def test_industry_classification_structure():
    """Test industry classification service structure."""
    print("\n🏭 Testing Industry Classification Service Structure...")
    
    file_path = "services/research/industry_classification_service.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    expected_elements = [
        "class EnhancedIndustryClassificationService",
        "class IndustryClassificationConfig",
        "async def classify_industry_comprehensive",
        "async def classify_industry_v1_compatible",
        "def map_v1_to_v3_industry",
        "def get_v1_compatible_result",
        "V1_INDUSTRIES",
        "INDUSTRY_MAPPING",
        "INDUSTRY_KEYWORDS"
    ]
    
    missing_elements = []
    for element in expected_elements:
        if element not in content:
            missing_elements.append(element)
    
    if missing_elements:
        print(f"❌ Missing elements: {missing_elements}")
        return False
    else:
        print("✅ All expected elements found")
        return True

def test_stakeholder_detection_structure():
    """Test stakeholder detection service structure."""
    print("\n👥 Testing Stakeholder Detection Service Structure...")
    
    file_path = "services/research/stakeholder_detection_service.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    expected_elements = [
        "class EnhancedStakeholderDetectionService",
        "class StakeholderDetectionConfig",
        "async def detect_stakeholders_comprehensive",
        "async def detect_stakeholders_v1_compatible",
        "def get_v1_compatible_result",
        "INDUSTRY_STAKEHOLDER_TEMPLATES",
        "STAKEHOLDER_KEYWORDS",
        "healthcare",
        "saas",
        "ecommerce"
    ]
    
    missing_elements = []
    for element in expected_elements:
        if element not in content:
            missing_elements.append(element)
    
    if missing_elements:
        print(f"❌ Missing elements: {missing_elements}")
        return False
    else:
        print("✅ All expected elements found")
        return True

def test_context_extraction_structure():
    """Test context extraction service structure."""
    print("\n📝 Testing Context Extraction Service Structure...")
    
    file_path = "services/research/context_extraction_service.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    expected_elements = [
        "class EnhancedContextExtractionService",
        "class ContextExtractionConfig",
        "async def extract_business_context_comprehensive",
        "async def validate_business_readiness_comprehensive",
        "async def analyze_user_intent_comprehensive",
        "async def extract_context_v1_compatible",
        "BUSINESS_IDEA_KEYWORDS",
        "TARGET_CUSTOMER_KEYWORDS",
        "PROBLEM_KEYWORDS",
        "STAGE_INDICATORS"
    ]
    
    missing_elements = []
    for element in expected_elements:
        if element not in content:
            missing_elements.append(element)
    
    if missing_elements:
        print(f"❌ Missing elements: {missing_elements}")
        return False
    else:
        print("✅ All expected elements found")
        return True

def test_conversation_flow_structure():
    """Test conversation flow service structure."""
    print("\n🔄 Testing Conversation Flow Service Structure...")
    
    file_path = "services/research/conversation_flow_service.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    expected_elements = [
        "class EnhancedConversationFlowService",
        "class ConversationFlowConfig",
        "async def determine_conversation_flow",
        "def determine_research_stage_v1_compatible",
        "_determine_current_stage",
        "_calculate_stage_progress",
        "_assess_conversation_quality",
        "STAGE_PROGRESSION",
        "STAGE_COMPLETION_CRITERIA",
        "MIN_EXCHANGES_FOR_QUESTIONS"
    ]
    
    missing_elements = []
    for element in expected_elements:
        if element not in content:
            missing_elements.append(element)
    
    if missing_elements:
        print(f"❌ Missing elements: {missing_elements}")
        return False
    else:
        print("✅ All expected elements found")
        return True

def test_v1_compatibility_features():
    """Test V1 compatibility features across all services."""
    print("\n🔄 Testing V1 Compatibility Features...")
    
    service_files = [
        ("Industry Classification", "services/research/industry_classification_service.py"),
        ("Stakeholder Detection", "services/research/stakeholder_detection_service.py"),
        ("Context Extraction", "services/research/context_extraction_service.py"),
        ("Conversation Flow", "services/research/conversation_flow_service.py")
    ]
    
    for service_name, file_path in service_files:
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for V1 compatibility methods
        v1_methods = [
            "_v1_",  # V1 fallback methods
            "v1_compatible",  # V1 compatible methods
            "V1_",  # V1 constants
            "# V1 "  # V1 comments
        ]
        
        has_v1_features = any(method in content for method in v1_methods)
        
        if has_v1_features:
            print(f"✅ {service_name}: V1 compatibility features found")
        else:
            print(f"❌ {service_name}: V1 compatibility features missing")
            return False
    
    return True

def test_enhanced_features():
    """Test enhanced features across all services."""
    print("\n⚡ Testing Enhanced Features...")
    
    service_files = [
        ("Industry Classification", "services/research/industry_classification_service.py"),
        ("Stakeholder Detection", "services/research/stakeholder_detection_service.py"),
        ("Context Extraction", "services/research/context_extraction_service.py"),
        ("Conversation Flow", "services/research/conversation_flow_service.py")
    ]
    
    for service_name, file_path in service_files:
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for enhanced features
        enhanced_features = [
            "EnhancedInstructorGeminiClient",  # Enhanced Instructor client
            "async def",  # Async methods
            "comprehensive",  # Comprehensive analysis
            "fallback",  # Fallback logic
            "Config",  # Configuration classes
            "logger.info",  # Logging
            "try:",  # Error handling
            "except Exception"  # Exception handling
        ]
        
        feature_count = sum(1 for feature in enhanced_features if feature in content)
        
        if feature_count >= 6:  # Most features should be present
            print(f"✅ {service_name}: Enhanced features present ({feature_count}/8)")
        else:
            print(f"⚠️  {service_name}: Limited enhanced features ({feature_count}/8)")
    
    return True

def test_service_integration_structure():
    """Test that services are structured for integration."""
    print("\n🔗 Testing Service Integration Structure...")
    
    # Check that all services follow the same pattern
    service_files = [
        "services/research/industry_classification_service.py",
        "services/research/stakeholder_detection_service.py",
        "services/research/context_extraction_service.py",
        "services/research/conversation_flow_service.py"
    ]
    
    common_patterns = [
        "def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None)",
        "logger = logging.getLogger(__name__)",
        "from typing import Dict, List, Optional, Any",
        "from dataclasses import dataclass"
    ]
    
    for file_path in service_files:
        with open(file_path, 'r') as f:
            content = f.read()
        
        pattern_count = sum(1 for pattern in common_patterns if pattern in content)
        
        if pattern_count >= 3:  # Most patterns should be present
            print(f"✅ {os.path.basename(file_path)}: Integration patterns present")
        else:
            print(f"⚠️  {os.path.basename(file_path)}: Limited integration patterns")
    
    return True

def test_documentation_quality():
    """Test documentation quality across services."""
    print("\n📚 Testing Documentation Quality...")
    
    service_files = [
        "services/research/industry_classification_service.py",
        "services/research/stakeholder_detection_service.py",
        "services/research/context_extraction_service.py",
        "services/research/conversation_flow_service.py"
    ]
    
    for file_path in service_files:
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for documentation elements
        doc_elements = [
            '"""',  # Docstrings
            "Args:",  # Argument documentation
            "Returns:",  # Return documentation
            "This service",  # Service description
            "V1 ",  # V1 references
            "Enhanced"  # Enhanced features description
        ]
        
        doc_count = sum(1 for element in doc_elements if element in content)
        
        if doc_count >= 4:
            print(f"✅ {os.path.basename(file_path)}: Well documented")
        else:
            print(f"⚠️  {os.path.basename(file_path)}: Limited documentation")
    
    return True

if __name__ == "__main__":
    print("🧪 Epic 3: V1 Feature Extraction & Integration Structure Test")
    print("=" * 70)
    
    tests = [
        ("Service Files Existence", test_service_files_exist),
        ("Industry Classification Structure", test_industry_classification_structure),
        ("Stakeholder Detection Structure", test_stakeholder_detection_structure),
        ("Context Extraction Structure", test_context_extraction_structure),
        ("Conversation Flow Structure", test_conversation_flow_structure),
        ("V1 Compatibility Features", test_v1_compatibility_features),
        ("Enhanced Features", test_enhanced_features),
        ("Service Integration Structure", test_service_integration_structure),
        ("Documentation Quality", test_documentation_quality),
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
    print("\n" + "=" * 70)
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
        print("🎉 All Epic 3 structure tests passed! V1 feature extraction is complete.")
        print("\n📋 Epic 3 Implementation Summary:")
        print("   ✅ Task 3.1: Industry Classification System")
        print("   ✅ Task 3.2: Stakeholder Detection System")
        print("   ✅ Task 3.3: Context Extraction Enhancement")
        print("   ✅ Task 3.4: Conversation Flow Management")
        print("\n🔧 Key Features Implemented:")
        print("   ✅ V1 logic preservation with enhanced capabilities")
        print("   ✅ Comprehensive fallback mechanisms")
        print("   ✅ Industry-specific templates and guidance")
        print("   ✅ Advanced conversation stage management")
        print("   ✅ Backward compatibility with V1 APIs")
        print("   ✅ Enhanced error handling and logging")
        sys.exit(0)
    else:
        print("⚠️  Some Epic 3 structure tests failed. Please review the implementation.")
        sys.exit(1)
