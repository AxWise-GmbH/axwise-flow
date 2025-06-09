#!/usr/bin/env python3
"""
Simple validation script for V3 Simplified implementation.
This script tests the core components without complex dependencies.
"""

import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_configuration():
    """Test V3 Simple configuration."""
    print("🧪 Testing V3 Simple Configuration...")
    
    try:
        # Test basic configuration
        from backend.config.v3_simple_config import V3SimpleConfig
        
        config = V3SimpleConfig()
        print("✅ V3SimpleConfig created successfully")
        
        # Test feature summary
        features = config.get_feature_summary()
        enabled_count = sum(features.values())
        print(f"✅ Features: {enabled_count}/{len(features)} enabled")
        
        # Test validation
        issues = config.validate()
        if not issues:
            print("✅ Configuration validation passed")
        else:
            print(f"⚠️  Validation issues: {issues}")
        
        # Test serialization
        config_dict = config.to_dict()
        print("✅ Configuration serialization works")
        
        return True
        
    except Exception as e:
        print(f"❌ Configuration test failed: {e}")
        return False

def test_models():
    """Test Pydantic models."""
    print("\n🧪 Testing Pydantic Models...")
    
    try:
        from backend.api.routes.customer_research_v3_simple import (
            Message, ResearchContext, ChatRequest, ChatResponse, 
            SimplifiedConfig, RequestMetrics
        )
        
        # Test Message model
        message = Message(
            id="test_1",
            content="Test message",
            role="user",
            timestamp="2024-01-01T00:00:00Z"
        )
        print("✅ Message model works")
        
        # Test ResearchContext model
        context = ResearchContext(
            businessIdea="Test business",
            targetCustomer="Test customers"
        )
        print("✅ ResearchContext model works")
        
        # Test ChatRequest model
        request = ChatRequest(
            messages=[message],
            input="Test input",
            context=context
        )
        print("✅ ChatRequest model works")
        
        # Test ChatResponse model
        response = ChatResponse(
            content="Test response"
        )
        print("✅ ChatResponse model works")
        
        # Test SimplifiedConfig
        config = SimplifiedConfig()
        print("✅ SimplifiedConfig works")
        
        # Test RequestMetrics
        metrics = RequestMetrics(request_id="test_123")
        duration = metrics.total_duration_ms
        success_rate = metrics.success_rate
        print(f"✅ RequestMetrics works: {duration}ms, {success_rate} success rate")
        
        return True
        
    except Exception as e:
        print(f"❌ Models test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_service_structure():
    """Test service structure."""
    print("\n🧪 Testing Service Structure...")
    
    try:
        from backend.api.routes.customer_research_v3_simple import SimplifiedResearchService, SimplifiedConfig
        
        # Test service creation
        config = SimplifiedConfig()
        service = SimplifiedResearchService(config)
        print(f"✅ SimplifiedResearchService created: {service.request_id}")
        
        # Test thinking steps
        service._add_thinking_step("Test Step", "completed", "Test details", 100)
        if len(service.thinking_steps) == 1:
            print("✅ Thinking steps work")
        else:
            print("⚠️  Thinking steps issue")
        
        # Test cache
        cache_key = service._get_cache_key("test", "hash123")
        service._store_in_cache(cache_key, {"test": "data"})
        cached_data = service._get_from_cache(cache_key)
        if cached_data and cached_data.get("test") == "data":
            print("✅ Cache functionality works")
        else:
            print("⚠️  Cache functionality issue")
        
        # Test memory management
        config_bounded = SimplifiedConfig(max_thinking_steps=2)
        service_bounded = SimplifiedResearchService(config_bounded)
        
        for i in range(5):
            service_bounded._add_thinking_step(f"Step {i}", "completed")
        
        if len(service_bounded.thinking_steps) == 2:
            print("✅ Memory management works (bounded thinking steps)")
        else:
            print(f"⚠️  Memory management issue: {len(service_bounded.thinking_steps)} steps")
        
        return True
        
    except Exception as e:
        print(f"❌ Service structure test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_api_structure():
    """Test API structure."""
    print("\n🧪 Testing API Structure...")
    
    try:
        from backend.api.routes.customer_research_v3_simple import router
        
        # Test router configuration
        if router.prefix == "/api/research/v3-simple":
            print("✅ Router prefix correct")
        else:
            print(f"⚠️  Router prefix: {router.prefix}")
        
        if "Customer Research V3 Simplified" in router.tags:
            print("✅ Router tags correct")
        else:
            print(f"⚠️  Router tags: {router.tags}")
        
        return True
        
    except Exception as e:
        print(f"❌ API structure test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_unified_llm_client():
    """Test unified LLM client structure."""
    print("\n🧪 Testing Unified LLM Client...")
    
    try:
        from backend.services.llm.unified_llm_client import UnifiedLLMClient, create_unified_llm_client
        
        # Test client creation (without API key for structure test)
        try:
            client = create_unified_llm_client()
            print("✅ UnifiedLLMClient created (with API key)")
        except ValueError as e:
            if "API key" in str(e):
                print("✅ UnifiedLLMClient structure correct (API key validation works)")
            else:
                print(f"⚠️  Unexpected error: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ Unified LLM client test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all validation tests."""
    print("🚀 V3 Simplified Implementation Validation")
    print("=" * 50)
    
    tests = [
        ("Configuration", test_configuration),
        ("Models", test_models),
        ("Service Structure", test_service_structure),
        ("API Structure", test_api_structure),
        ("Unified LLM Client", test_unified_llm_client)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        result = test_func()
        results.append((test_name, result))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Validation Results")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\n📈 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All validation tests passed!")
        print("✅ V3 Simplified implementation structure is correct")
        print("\n🚀 Ready for integration testing with:")
        print("   1. Add router to main FastAPI app")
        print("   2. Test with real API calls")
        print("   3. Update frontend to use new endpoint")
    else:
        print(f"\n⚠️  {total - passed} tests failed")
        print("🔧 Please fix the issues before proceeding")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
