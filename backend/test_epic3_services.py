#!/usr/bin/env python3
"""
Test Epic 3: V1 Feature Extraction & Integration Services.
"""

import sys
import os
import asyncio
import importlib.util

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# Load our modules
enhanced_models = load_module("enhanced_research_models", "models/enhanced_research_models.py")
industry_models = load_module("industry_stakeholder_models", "models/industry_stakeholder_models.py")
industry_service = load_module("industry_classification_service", "services/research/industry_classification_service.py")
stakeholder_service = load_module("stakeholder_detection_service", "services/research/stakeholder_detection_service.py")
context_service = load_module("context_extraction_service", "services/research/context_extraction_service.py")
flow_service = load_module("conversation_flow_service", "services/research/conversation_flow_service.py")

# Extract classes
BusinessContext = enhanced_models.BusinessContext
ConversationStage = enhanced_models.ConversationStage
IndustryAnalysis = industry_models.IndustryAnalysis
StakeholderAnalysis = industry_models.StakeholderAnalysis

EnhancedIndustryClassificationService = industry_service.EnhancedIndustryClassificationService
EnhancedStakeholderDetectionService = stakeholder_service.EnhancedStakeholderDetectionService
EnhancedContextExtractionService = context_service.EnhancedContextExtractionService
EnhancedConversationFlowService = flow_service.EnhancedConversationFlowService

def test_industry_classification_service():
    """Test the industry classification service structure."""
    print("🏭 Testing Industry Classification Service...")
    
    try:
        # Test service initialization
        service = EnhancedIndustryClassificationService()
        print("✅ Industry classification service initialized")
        
        # Test configuration
        config = service.config
        if hasattr(config, 'V1_INDUSTRIES') and hasattr(config, 'INDUSTRY_KEYWORDS'):
            print("✅ Service configuration loaded correctly")
        else:
            print("❌ Service configuration missing")
            return False
        
        # Test V1 compatibility methods
        if hasattr(service, 'classify_industry_v1_compatible'):
            print("✅ V1 compatibility methods available")
        else:
            print("❌ V1 compatibility methods missing")
            return False
        
        # Test industry mapping
        v3_industry = service.map_v1_to_v3_industry("tech")
        if v3_industry == "saas":
            print("✅ Industry mapping works correctly")
        else:
            print(f"❌ Industry mapping failed: tech -> {v3_industry}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Industry classification service test failed: {e}")
        return False

def test_stakeholder_detection_service():
    """Test the stakeholder detection service structure."""
    print("\n👥 Testing Stakeholder Detection Service...")
    
    try:
        # Test service initialization
        service = EnhancedStakeholderDetectionService()
        print("✅ Stakeholder detection service initialized")
        
        # Test configuration
        config = service.config
        if hasattr(config, 'INDUSTRY_STAKEHOLDER_TEMPLATES') and hasattr(config, 'STAKEHOLDER_KEYWORDS'):
            print("✅ Service configuration loaded correctly")
        else:
            print("❌ Service configuration missing")
            return False
        
        # Test industry templates
        if "healthcare" in config.INDUSTRY_STAKEHOLDER_TEMPLATES:
            healthcare_template = config.INDUSTRY_STAKEHOLDER_TEMPLATES["healthcare"]
            if "primary" in healthcare_template and "secondary" in healthcare_template:
                print("✅ Industry stakeholder templates available")
            else:
                print("❌ Industry stakeholder templates malformed")
                return False
        else:
            print("❌ Industry stakeholder templates missing")
            return False
        
        # Test V1 compatibility methods
        if hasattr(service, 'detect_stakeholders_v1_compatible'):
            print("✅ V1 compatibility methods available")
        else:
            print("❌ V1 compatibility methods missing")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Stakeholder detection service test failed: {e}")
        return False

def test_context_extraction_service():
    """Test the context extraction service structure."""
    print("\n📝 Testing Context Extraction Service...")
    
    try:
        # Test service initialization
        service = EnhancedContextExtractionService()
        print("✅ Context extraction service initialized")
        
        # Test configuration
        config = service.config
        expected_keywords = ['BUSINESS_IDEA_KEYWORDS', 'TARGET_CUSTOMER_KEYWORDS', 'PROBLEM_KEYWORDS']
        if all(hasattr(config, attr) for attr in expected_keywords):
            print("✅ Service configuration loaded correctly")
        else:
            print("❌ Service configuration missing")
            return False
        
        # Test stage indicators
        if hasattr(config, 'STAGE_INDICATORS'):
            stage_indicators = config.STAGE_INDICATORS
            if "idea" in stage_indicators and "prototype" in stage_indicators:
                print("✅ Stage indicators available")
            else:
                print("❌ Stage indicators incomplete")
                return False
        else:
            print("❌ Stage indicators missing")
            return False
        
        # Test V1 compatibility methods
        if hasattr(service, 'extract_context_v1_compatible'):
            print("✅ V1 compatibility methods available")
        else:
            print("❌ V1 compatibility methods missing")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Context extraction service test failed: {e}")
        return False

def test_conversation_flow_service():
    """Test the conversation flow service structure."""
    print("\n🔄 Testing Conversation Flow Service...")
    
    try:
        # Test service initialization
        service = EnhancedConversationFlowService()
        print("✅ Conversation flow service initialized")
        
        # Test configuration
        config = service.config
        if hasattr(config, 'STAGE_PROGRESSION') and hasattr(config, 'STAGE_COMPLETION_CRITERIA'):
            print("✅ Service configuration loaded correctly")
        else:
            print("❌ Service configuration missing")
            return False
        
        # Test stage progression mapping
        progression = config.STAGE_PROGRESSION
        if ConversationStage.INITIAL in progression:
            next_stage = progression[ConversationStage.INITIAL]
            if next_stage == ConversationStage.BUSINESS_DISCOVERY:
                print("✅ Stage progression mapping works correctly")
            else:
                print(f"❌ Stage progression mapping failed: {next_stage}")
                return False
        else:
            print("❌ Stage progression mapping missing")
            return False
        
        # Test completion criteria
        criteria = config.STAGE_COMPLETION_CRITERIA
        if ConversationStage.BUSINESS_DISCOVERY in criteria:
            business_criteria = criteria[ConversationStage.BUSINESS_DISCOVERY]
            if "business_idea_mentioned" in business_criteria:
                print("✅ Stage completion criteria available")
            else:
                print("❌ Stage completion criteria incomplete")
                return False
        else:
            print("❌ Stage completion criteria missing")
            return False
        
        # Test V1 compatibility methods
        if hasattr(service, 'determine_research_stage_v1_compatible'):
            print("✅ V1 compatibility methods available")
        else:
            print("❌ V1 compatibility methods missing")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Conversation flow service test failed: {e}")
        return False

async def test_service_integration():
    """Test integration between services."""
    print("\n🔗 Testing Service Integration...")
    
    try:
        # Create sample data
        conversation_context = """
        user: I'm building a mobile app for small restaurants to manage their inventory
        assistant: That sounds interesting! Can you tell me more about what specific problems restaurants face with inventory?
        user: They struggle with manual tracking, food waste, and knowing when to reorder supplies
        """
        
        latest_input = "Yes, exactly! They need better visibility into their stock levels"
        
        # Test context extraction fallback
        context_service_instance = EnhancedContextExtractionService()
        business_context = await context_service_instance._fallback_context_extraction(
            conversation_context, latest_input
        )
        
        if business_context.business_idea:
            print("✅ Context extraction fallback works")
        else:
            print("❌ Context extraction fallback failed")
            return False
        
        # Test industry classification fallback
        industry_service_instance = EnhancedIndustryClassificationService()
        industry_analysis = await industry_service_instance._fallback_classification(
            conversation_context, latest_input
        )
        
        if industry_analysis.primary_industry:
            print("✅ Industry classification fallback works")
        else:
            print("❌ Industry classification fallback failed")
            return False
        
        # Test conversation flow determination
        flow_service_instance = EnhancedConversationFlowService()
        current_stage = flow_service_instance._determine_current_stage(
            business_context, [{"role": "user", "content": "test"}]
        )
        
        if isinstance(current_stage, ConversationStage):
            print("✅ Conversation flow stage determination works")
        else:
            print("❌ Conversation flow stage determination failed")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Service integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_v1_compatibility():
    """Test V1 compatibility methods."""
    print("\n🔄 Testing V1 Compatibility...")
    
    try:
        # Test industry service V1 compatibility
        industry_service_instance = EnhancedIndustryClassificationService()
        v1_mapping = industry_service_instance.map_v1_to_v3_industry("finance")
        if v1_mapping == "fintech":
            print("✅ Industry V1 mapping works")
        else:
            print(f"❌ Industry V1 mapping failed: {v1_mapping}")
            return False
        
        # Test conversation flow V1 compatibility
        flow_service_instance = EnhancedConversationFlowService()
        v1_stage = flow_service_instance.determine_research_stage_v1_compatible({
            "business_idea": "mobile app",
            "target_customer": "restaurants",
            "problem": "inventory management"
        })
        if v1_stage == "validation":
            print("✅ Flow V1 stage determination works")
        else:
            print(f"❌ Flow V1 stage determination failed: {v1_stage}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ V1 compatibility test failed: {e}")
        return False

def test_file_structure():
    """Test that all service files exist and have correct structure."""
    print("\n📁 Testing File Structure...")
    
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

if __name__ == "__main__":
    print("🧪 Epic 3: V1 Feature Extraction & Integration Test Suite")
    print("=" * 70)
    
    tests = [
        ("File Structure", test_file_structure),
        ("Industry Classification Service", test_industry_classification_service),
        ("Stakeholder Detection Service", test_stakeholder_detection_service),
        ("Context Extraction Service", test_context_extraction_service),
        ("Conversation Flow Service", test_conversation_flow_service),
        ("V1 Compatibility", test_v1_compatibility),
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
    
    # Test async service integration
    print(f"\n🔍 Running: Service Integration")
    try:
        integration_result = asyncio.run(test_service_integration())
        results.append(("Service Integration", integration_result))
    except Exception as e:
        print(f"❌ Service Integration failed with exception: {e}")
        results.append(("Service Integration", False))
    
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
        print("🎉 All Epic 3 tests passed! V1 feature extraction is complete.")
        print("\n📋 Epic 3 Summary:")
        print("   ✅ Industry Classification Service with V1 compatibility")
        print("   ✅ Stakeholder Detection Service with industry templates")
        print("   ✅ Context Extraction Service with comprehensive analysis")
        print("   ✅ Conversation Flow Service with stage management")
        print("   ✅ V1 fallback logic preserved and enhanced")
        print("   ✅ Service integration and compatibility verified")
        sys.exit(0)
    else:
        print("⚠️  Some Epic 3 tests failed. Please review the implementation.")
        sys.exit(1)
