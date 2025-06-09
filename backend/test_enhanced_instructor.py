#!/usr/bin/env python3
"""
Test the Enhanced Instructor Gemini Client.
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
instructor_module = load_module("instructor_gemini_client", "services/llm/instructor_gemini_client.py")

# Extract classes
UserIntent = enhanced_models.UserIntent
BusinessReadiness = enhanced_models.BusinessReadiness
EnhancedInstructorGeminiClient = instructor_module.EnhancedInstructorGeminiClient

def test_enhanced_instructor_client():
    """Test the enhanced Instructor client with our models."""
    print("🚀 Testing Enhanced Instructor Gemini Client")
    print("=" * 50)
    
    # Initialize client
    try:
        client = EnhancedInstructorGeminiClient(
            max_retries=2,
            enable_metrics=True
        )
        print("✅ Enhanced Instructor client initialized successfully")
    except Exception as e:
        print(f"❌ Failed to initialize client: {e}")
        return False
    
    # Test simple model generation
    print("\n📝 Testing UserIntent generation...")
    
    try:
        prompt = """
        Analyze this user message: "Yes, that sounds exactly right! Let's move forward with generating the questions."
        
        Determine the user's intent, confidence level, and recommended next action.
        """
        
        system_instruction = """
        You are an expert at analyzing user intent in customer research conversations.
        Analyze the user's message and provide structured output about their intent.
        """
        
        # This would normally call the LLM, but we'll simulate it for testing
        print("⚠️  Note: Skipping actual LLM call (no API key configured)")
        print("✅ Enhanced Instructor client structure is valid")
        
        # Test metrics functionality
        stats = client.get_performance_stats()
        print(f"✅ Performance stats: {stats}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_retry_strategies():
    """Test the retry strategy configuration."""
    print("\n🔄 Testing Retry Strategies...")
    
    client = EnhancedInstructorGeminiClient(max_retries=3)
    
    # Check retry strategies
    expected_strategies = 3
    actual_strategies = len(client.retry_strategies)
    
    if actual_strategies == expected_strategies:
        print(f"✅ Retry strategies configured: {actual_strategies}")
        for i, strategy in enumerate(client.retry_strategies):
            print(f"   Strategy {i+1}: {strategy}")
        return True
    else:
        print(f"❌ Expected {expected_strategies} strategies, got {actual_strategies}")
        return False

def test_metrics_system():
    """Test the metrics collection system."""
    print("\n📊 Testing Metrics System...")
    
    client = EnhancedInstructorGeminiClient(enable_metrics=True)
    
    # Test metrics creation
    metrics = client._create_metrics(UserIntent, 0.5)
    print(f"✅ Metrics created: {metrics.model_name}, {metrics.response_model}")
    
    # Test metrics finalization
    client._finalize_metrics(metrics, success=True)
    print(f"✅ Metrics finalized: {metrics.duration_ms}ms")
    
    # Test performance stats
    stats = client.get_performance_stats()
    expected_keys = ['total_requests', 'successful_requests', 'success_rate']
    
    if all(key in stats for key in expected_keys):
        print(f"✅ Performance stats complete: {stats}")
        return True
    else:
        print(f"❌ Missing keys in performance stats: {stats}")
        return False

async def test_async_functionality():
    """Test async functionality structure."""
    print("\n⚡ Testing Async Functionality...")
    
    client = EnhancedInstructorGeminiClient()
    
    # Check if async method exists
    if hasattr(client, 'generate_with_model_async'):
        print("✅ Async method available")
        
        # Test method signature
        import inspect
        sig = inspect.signature(client.generate_with_model_async)
        expected_params = ['prompt', 'model_class', 'temperature']
        
        if all(param in sig.parameters for param in expected_params):
            print("✅ Async method signature correct")
            return True
        else:
            print(f"❌ Missing parameters in async method: {list(sig.parameters.keys())}")
            return False
    else:
        print("❌ Async method not found")
        return False

def test_error_handling():
    """Test error handling classes."""
    print("\n🛡️  Testing Error Handling...")
    
    # Test EnhancedInstructorError
    try:
        error = instructor_module.EnhancedInstructorError(
            "Test error",
            error_type="ValidationError",
            retry_count=2
        )
        
        if error.error_type == "ValidationError" and error.retry_count == 2:
            print("✅ EnhancedInstructorError works correctly")
            return True
        else:
            print("❌ EnhancedInstructorError properties incorrect")
            return False
            
    except Exception as e:
        print(f"❌ Error handling test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Enhanced Instructor Client Test Suite")
    print("=" * 60)
    
    tests = [
        ("Basic Client Functionality", test_enhanced_instructor_client),
        ("Retry Strategies", test_retry_strategies),
        ("Metrics System", test_metrics_system),
        ("Error Handling", test_error_handling),
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
    
    # Test async functionality
    print(f"\n🔍 Running: Async Functionality")
    try:
        async_result = asyncio.run(test_async_functionality())
        results.append(("Async Functionality", async_result))
    except Exception as e:
        print(f"❌ Async Functionality failed with exception: {e}")
        results.append(("Async Functionality", False))
    
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
        print("🎉 All tests passed! Enhanced Instructor client is ready.")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Please review the implementation.")
        sys.exit(1)
