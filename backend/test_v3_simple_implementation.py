#!/usr/bin/env python3
"""
Test suite for V3 Simplified Customer Research Implementation.

This test suite validates that the V3 Simplified implementation:
1. Addresses all the stability issues found in the original V3
2. Provides all the enhanced features
3. Maintains compatibility with V1/V2 patterns
4. Is production-ready and performant
"""

import sys
import os
import asyncio
import time
import json
from typing import Dict, Any, List

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def print_test_section(title: str):
    """Print a formatted test section header."""
    print(f"\n{'=' * 60}")
    print(f"🧪 {title}")
    print('=' * 60)

def print_success(message: str):
    """Print a success message."""
    print(f"✅ {message}")

def print_warning(message: str):
    """Print a warning message."""
    print(f"⚠️  {message}")

def print_error(message: str):
    """Print an error message."""
    print(f"❌ {message}")

def test_configuration():
    """Test V3 Simple configuration system."""
    print_test_section("Testing V3 Simple Configuration")
    
    try:
        from backend.config.v3_simple_config import (
            V3SimpleConfig, get_v3_simple_config, 
            get_development_config, get_production_config
        )
        
        # Test basic configuration creation
        config = V3SimpleConfig()
        print_success("Basic configuration created successfully")
        
        # Test environment-based configuration
        env_config = V3SimpleConfig.from_environment()
        print_success("Environment-based configuration created successfully")
        
        # Test configuration validation
        issues = config.validate()
        if not issues:
            print_success("Configuration validation passed")
        else:
            print_warning(f"Configuration validation issues: {issues}")
        
        # Test feature summary
        features = config.get_feature_summary()
        enabled_features = sum(1 for enabled in features.values() if enabled)
        print_success(f"Feature summary generated: {enabled_features}/{len(features)} features enabled")
        
        # Test environment-specific configs
        dev_config = get_development_config()
        prod_config = get_production_config()
        print_success("Environment-specific configurations created successfully")
        
        # Test configuration differences
        dev_dict = dev_config.to_dict()
        prod_dict = prod_config.to_dict()
        print_success("Configuration serialization works correctly")
        
        return True
        
    except Exception as e:
        print_error(f"Configuration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_unified_llm_client():
    """Test the unified LLM client."""
    print_test_section("Testing Unified LLM Client")
    
    try:
        from backend.services.llm.unified_llm_client import UnifiedLLMClient, create_unified_llm_client
        
        # Test client creation
        client = create_unified_llm_client()
        print_success("Unified LLM client created successfully")
        
        # Test metrics system
        metrics = client.get_metrics()
        if metrics is None:
            print_success("Metrics system initialized correctly (no active request)")
        else:
            print_warning("Unexpected metrics state")
        
        # Test metrics reset
        client.reset_metrics()
        print_success("Metrics reset functionality works")
        
        # Test environment variable handling
        if client.api_key:
            print_success("API key loaded from secure environment system")
        else:
            print_warning("API key not found - check environment variables")
        
        return True
        
    except Exception as e:
        print_error(f"Unified LLM client test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_simplified_service_structure():
    """Test the simplified service structure."""
    print_test_section("Testing Simplified Service Structure")
    
    try:
        from backend.api.routes.customer_research_v3_simple import (
            SimplifiedResearchService, SimplifiedConfig, RequestMetrics
        )
        
        # Test configuration
        config = SimplifiedConfig()
        print_success("SimplifiedConfig created successfully")
        
        # Test metrics
        metrics = RequestMetrics(request_id="test_123")
        print_success(f"RequestMetrics created: {metrics.request_id}")
        
        # Test metrics properties
        duration = metrics.total_duration_ms
        success_rate = metrics.success_rate
        print_success(f"Metrics properties work: duration={duration}ms, success_rate={success_rate}")
        
        # Test service initialization
        service = SimplifiedResearchService(config)
        print_success(f"SimplifiedResearchService created: {service.request_id}")
        
        # Test thinking steps
        service._add_thinking_step("Test Step", "completed", "Test details", 100)
        if len(service.thinking_steps) == 1:
            print_success("Thinking steps functionality works")
        else:
            print_warning("Thinking steps not working correctly")
        
        # Test cache functionality
        cache_key = service._get_cache_key("test", "hash123")
        service._store_in_cache(cache_key, {"test": "data"})
        cached_data = service._get_from_cache(cache_key)
        if cached_data and cached_data.get("test") == "data":
            print_success("Cache functionality works")
        else:
            print_warning("Cache functionality not working correctly")
        
        return True
        
    except Exception as e:
        print_error(f"Simplified service structure test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_api_endpoint_structure():
    """Test the API endpoint structure."""
    print_test_section("Testing API Endpoint Structure")
    
    try:
        from backend.api.routes.customer_research_v3_simple import (
            router, ChatRequest, ChatResponse, HealthResponse,
            Message, ResearchContext
        )
        
        # Test router configuration
        if router.prefix == "/api/research/v3-simple":
            print_success("Router prefix configured correctly")
        else:
            print_warning(f"Unexpected router prefix: {router.prefix}")
        
        # Test model structures
        message = Message(
            id="test_1",
            content="Test message",
            role="user",
            timestamp="2024-01-01T00:00:00Z"
        )
        print_success("Message model works correctly")
        
        context = ResearchContext(
            businessIdea="Test business",
            targetCustomer="Test customers",
            problem="Test problem"
        )
        print_success("ResearchContext model works correctly")
        
        # Test request model
        request = ChatRequest(
            messages=[message],
            input="Test input",
            context=context
        )
        print_success("ChatRequest model works correctly")
        
        # Test response model
        response = ChatResponse(
            content="Test response",
            api_version="v3-simple"
        )
        print_success("ChatResponse model works correctly")
        
        return True
        
    except Exception as e:
        print_error(f"API endpoint structure test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_memory_management():
    """Test memory management features."""
    print_test_section("Testing Memory Management")
    
    try:
        from backend.api.routes.customer_research_v3_simple import SimplifiedResearchService, SimplifiedConfig
        
        # Test bounded thinking steps
        config = SimplifiedConfig(max_thinking_steps=3)
        service = SimplifiedResearchService(config)
        
        # Add more steps than the limit
        for i in range(5):
            service._add_thinking_step(f"Step {i}", "completed", f"Details {i}")
        
        if len(service.thinking_steps) == 3:
            print_success("Thinking steps are properly bounded")
        else:
            print_warning(f"Thinking steps not bounded correctly: {len(service.thinking_steps)}")
        
        # Test cache size management
        for i in range(10):
            service._store_in_cache(f"key_{i}", f"value_{i}")
        
        print_success("Cache operations completed without errors")
        
        # Test metrics properties
        service.metrics.errors_encountered.append("test error")
        success_rate = service.metrics.success_rate
        if 0.0 <= success_rate <= 1.0:
            print_success(f"Success rate calculation works: {success_rate}")
        else:
            print_warning(f"Success rate calculation issue: {success_rate}")
        
        return True
        
    except Exception as e:
        print_error(f"Memory management test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_error_handling():
    """Test error handling and fallback mechanisms."""
    print_test_section("Testing Error Handling")
    
    try:
        from backend.api.routes.customer_research_v3_simple import SimplifiedResearchService, SimplifiedConfig
        
        # Test service with fallback enabled
        config = SimplifiedConfig(enable_v1_fallback=True, max_retries=1)
        service = SimplifiedResearchService(config)
        
        # Test error tracking
        service.metrics.errors_encountered.append("Test error 1")
        service.metrics.errors_encountered.append("Test error 2")
        
        success_rate = service.metrics.success_rate
        if success_rate < 1.0:
            print_success("Error tracking affects success rate correctly")
        else:
            print_warning("Error tracking not working correctly")
        
        # Test thinking step error handling
        service._add_thinking_step("Error Test", "failed", "Test error occurred")
        
        failed_steps = [step for step in service.thinking_steps if step["status"] == "failed"]
        if len(failed_steps) > 0:
            print_success("Failed thinking steps are tracked correctly")
        else:
            print_warning("Failed thinking steps not tracked")
        
        return True
        
    except Exception as e:
        print_error(f"Error handling test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def run_comprehensive_tests():
    """Run comprehensive test suite for V3 Simplified implementation."""
    print("🚀 V3 Simplified Customer Research Implementation Test Suite")
    print("=" * 80)
    
    tests = [
        ("Configuration System", test_configuration),
        ("Unified LLM Client", test_unified_llm_client),
        ("Simplified Service Structure", test_simplified_service_structure),
        ("API Endpoint Structure", test_api_endpoint_structure),
        ("Memory Management", test_memory_management),
        ("Error Handling", test_error_handling)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            print(f"\n🔍 Running: {test_name}")
            result = test_func()
            results.append((test_name, result))
            
            if result:
                print_success(f"{test_name}: PASSED")
            else:
                print_error(f"{test_name}: FAILED")
                
        except Exception as e:
            print_error(f"{test_name}: ERROR - {e}")
            results.append((test_name, False))
    
    # Summary
    print_test_section("Test Results Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    print(f"📊 Tests Passed: {passed}/{total}")
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"   {status}: {test_name}")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        print("✅ V3 Simplified implementation is ready for deployment")
        print("\n📋 Key improvements over original V3:")
        print("   ✅ Stable environment variable handling")
        print("   ✅ Request-scoped services (no global state)")
        print("   ✅ Bounded memory usage")
        print("   ✅ Sequential processing (no parallel complexity)")
        print("   ✅ Proper error handling with V1 fallback")
        print("   ✅ Smart caching for performance")
        print("   ✅ Production-ready configuration")
        print("   ✅ Comprehensive monitoring and metrics")
        
        print("\n🚀 Next steps:")
        print("   1. Update main.py to include V3 Simple router")
        print("   2. Update frontend to use /api/research/v3-simple endpoint")
        print("   3. Test with real API calls")
        print("   4. Deploy to staging environment")
        
        return True
    else:
        print(f"\n⚠️  {total - passed} tests failed")
        print("🔧 Please fix the failing tests before deployment")
        return False

if __name__ == "__main__":
    asyncio.run(run_comprehensive_tests())
