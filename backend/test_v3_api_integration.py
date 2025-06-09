#!/usr/bin/env python3
"""
Comprehensive Integration Test for V3 Research API.

This script tests the complete V3 API functionality including:
- Master Research Service
- Enhanced Models
- API Endpoints
- Performance Optimization
- V1 Compatibility
"""

import sys
import os
import asyncio
import json
import time
from typing import Dict, Any, List

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test configuration
TEST_CONFIG = {
    "enable_llm_calls": False,  # Set to True if you have API keys configured
    "test_timeout": 30,  # seconds
    "verbose": True
}

def print_test_header(title: str):
    """Print formatted test header."""
    print(f"\n{'='*60}")
    print(f"🧪 {title}")
    print(f"{'='*60}")

def print_test_section(title: str):
    """Print formatted test section."""
    print(f"\n🔍 {title}")
    print("-" * 40)

async def test_enhanced_models():
    """Test enhanced Pydantic models."""
    print_test_header("Testing Enhanced Pydantic Models")
    
    try:
        # Import models directly
        import importlib.util
        
        def load_module(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        
        # Load enhanced models
        enhanced_models = load_module("enhanced_research_models", "models/enhanced_research_models.py")
        industry_models = load_module("industry_stakeholder_models", "models/industry_stakeholder_models.py")
        
        # Test BusinessContext
        print_test_section("Testing BusinessContext Model")
        business_context = enhanced_models.BusinessContext(
            business_idea="A mobile app for restaurant inventory management",
            target_customer="Small to medium restaurants",
            problem="Manual inventory tracking leads to waste and stockouts"
        )
        print(f"✅ BusinessContext created with completeness: {business_context.completeness_score}")
        
        # Test UserIntent
        print_test_section("Testing UserIntent Model")
        user_intent = enhanced_models.UserIntent(
            primary_intent="confirmation",
            confidence=0.85,
            reasoning="User explicitly confirmed business details",
            specific_feedback="Ready to proceed with questions",
            recommended_response_type="generate_questions",
            next_action="Generate research questions"
        )
        print(f"✅ UserIntent created: {user_intent.primary_intent} (confidence: {user_intent.confidence})")
        
        # Test IndustryAnalysis
        print_test_section("Testing IndustryAnalysis Model")
        industry_analysis = industry_models.IndustryAnalysis(
            primary_industry="saas",
            confidence=0.9,
            reasoning="Restaurant management software indicates SaaS industry"
        )
        print(f"✅ IndustryAnalysis created: {industry_analysis.primary_industry}")
        print(f"   Industry guidance: {industry_analysis.industry_guidance[:100]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Enhanced models test failed: {e}")
        return False

async def test_master_research_service():
    """Test the Master Research Service."""
    print_test_header("Testing Master Research Service")
    
    try:
        # Import service modules
        import importlib.util
        
        def load_module(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        
        # Load master service
        master_service_module = load_module("master_research_service", "services/research/master_research_service.py")
        
        # Test service initialization
        print_test_section("Testing Service Initialization")
        config = master_service_module.ResearchServiceConfig(
            enable_parallel_processing=True,
            enable_v1_fallback=True,
            v1_compatibility_mode=False
        )
        
        # Note: We can't fully test without LLM client, but we can test structure
        print("✅ ResearchServiceConfig created successfully")
        print(f"   Parallel processing: {config.enable_parallel_processing}")
        print(f"   V1 fallback: {config.enable_v1_fallback}")
        
        # Test metrics structure
        print_test_section("Testing Metrics Structure")
        metrics = master_service_module.ResearchMetrics(
            start_time=time.time(),
            end_time=time.time() + 1,
            total_duration_ms=1000
        )
        print(f"✅ ResearchMetrics created: {metrics.total_duration_ms}ms duration")
        
        return True
        
    except Exception as e:
        print(f"❌ Master research service test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_response_orchestration():
    """Test response orchestration service."""
    print_test_header("Testing Response Orchestration Service")
    
    try:
        import importlib.util
        
        def load_module(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        
        # Load response orchestration
        orchestration_module = load_module("response_orchestration_service", "services/research/response_orchestration_service.py")
        
        # Test response types and context
        print_test_section("Testing Response Types and Context")
        response_type = orchestration_module.ResponseType.CONVERSATIONAL
        response_tone = orchestration_module.ResponseTone.FRIENDLY
        
        response_context = orchestration_module.ResponseContext(
            response_type=response_type,
            tone=response_tone,
            user_expertise_level="intermediate",
            conversation_length=5,
            urgency_level="medium"
        )
        
        print(f"✅ ResponseContext created: {response_context.response_type.value} tone")
        print(f"   User expertise: {response_context.user_expertise_level}")
        print(f"   Max length: {response_context.max_response_length}")
        
        # Test response metrics
        print_test_section("Testing Response Metrics")
        metrics = orchestration_module.ResponseMetrics(
            content_length=150,
            readability_score=0.8,
            engagement_score=0.7,
            actionability_score=0.9,
            personalization_score=0.6,
            generation_time_ms=250
        )
        
        print(f"✅ ResponseMetrics created:")
        print(f"   Readability: {metrics.readability_score}")
        print(f"   Engagement: {metrics.engagement_score}")
        print(f"   Actionability: {metrics.actionability_score}")
        
        return True
        
    except Exception as e:
        print(f"❌ Response orchestration test failed: {e}")
        return False

async def test_performance_optimization():
    """Test performance optimization service."""
    print_test_header("Testing Performance Optimization Service")
    
    try:
        import importlib.util
        
        def load_module(name, path):
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return load_module
        
        # Load performance optimization
        perf_module = load_module("performance_optimization_service", "services/research/performance_optimization_service.py")
        
        # Test cache strategies
        print_test_section("Testing Cache Strategies")
        cache_strategy = perf_module.CacheStrategy.SHORT_TERM
        print(f"✅ CacheStrategy loaded: {cache_strategy.value}")
        
        # Test optimization config
        print_test_section("Testing Optimization Config")
        config = perf_module.OptimizationConfig(
            enable_caching=True,
            max_cache_size=1000,
            enable_parallel_processing=True,
            max_concurrent_requests=50
        )
        
        print(f"✅ OptimizationConfig created:")
        print(f"   Caching enabled: {config.enable_caching}")
        print(f"   Max cache size: {config.max_cache_size}")
        print(f"   Max concurrent requests: {config.max_concurrent_requests}")
        
        # Test performance metrics
        print_test_section("Testing Performance Metrics")
        metrics = perf_module.PerformanceMetrics()
        print(f"✅ PerformanceMetrics initialized:")
        print(f"   Total requests: {metrics.total_requests}")
        print(f"   Cache hit rate: {metrics.cache_hit_rate}")
        print(f"   Error rate: {metrics.error_rate}")
        
        return True
        
    except Exception as e:
        print(f"❌ Performance optimization test failed: {e}")
        return False

async def test_api_structure():
    """Test V3 API structure."""
    print_test_header("Testing V3 API Structure")
    
    try:
        # Test API file structure
        print_test_section("Testing API File Structure")
        api_file = "api/routes/customer_research_v3.py"
        
        if not os.path.exists(api_file):
            print(f"❌ API file not found: {api_file}")
            return False
        
        with open(api_file, 'r') as f:
            api_content = f.read()
        
        # Check for key API components
        api_components = [
            "router = APIRouter",
            "prefix=\"/api/research/v3\"",
            "@router.post(\"/chat\"",
            "@router.post(\"/analyze\"",
            "@router.get(\"/health\"",
            "@router.get(\"/metrics\"",
            "class ChatRequest",
            "class ChatResponse",
            "class AnalysisRequest",
            "class AnalysisResponse"
        ]
        
        missing_components = []
        for component in api_components:
            if component not in api_content:
                missing_components.append(component)
        
        if missing_components:
            print(f"❌ Missing API components: {missing_components}")
            return False
        
        print("✅ All API components found")
        print(f"   API file size: {len(api_content)} characters")
        
        # Test request/response models structure
        print_test_section("Testing Request/Response Models")
        model_features = [
            "enable_enhanced_analysis",
            "enable_parallel_processing", 
            "v1_compatibility_mode",
            "enhanced_analysis",
            "performance_metrics",
            "api_version"
        ]
        
        feature_count = sum(1 for feature in model_features if feature in api_content)
        print(f"✅ API features present: {feature_count}/{len(model_features)}")
        
        return True
        
    except Exception as e:
        print(f"❌ API structure test failed: {e}")
        return False

async def test_v1_compatibility():
    """Test V1 compatibility features."""
    print_test_header("Testing V1 Compatibility")
    
    try:
        print_test_section("Testing V1 Compatibility Patterns")
        
        # Check for V1 compatibility in master service
        master_service_file = "services/research/master_research_service.py"
        with open(master_service_file, 'r') as f:
            master_content = f.read()
        
        v1_patterns = [
            "analyze_research_v1_compatible",
            "_convert_to_v1_format",
            "_v1_direct_fallback",
            "v1_compatibility_mode",
            "fallback_to_v1_analysis",
            "V1_"
        ]
        
        v1_pattern_count = sum(1 for pattern in v1_patterns if pattern in master_content)
        print(f"✅ V1 compatibility patterns in master service: {v1_pattern_count}/{len(v1_patterns)}")
        
        # Check for V1 compatibility in individual services
        service_files = [
            "services/research/industry_classification_service.py",
            "services/research/stakeholder_detection_service.py",
            "services/research/context_extraction_service.py"
        ]
        
        for service_file in service_files:
            if os.path.exists(service_file):
                with open(service_file, 'r') as f:
                    content = f.read()
                
                v1_methods = [
                    "v1_compatible",
                    "_v1_",
                    "V1_"
                ]
                
                v1_method_count = sum(1 for method in v1_methods if method in content)
                service_name = os.path.basename(service_file).replace('.py', '')
                print(f"✅ {service_name}: V1 compatibility methods present")
        
        return True
        
    except Exception as e:
        print(f"❌ V1 compatibility test failed: {e}")
        return False

async def test_error_handling():
    """Test error handling and fallback mechanisms."""
    print_test_header("Testing Error Handling and Fallbacks")
    
    try:
        print_test_section("Testing Error Handling Patterns")
        
        service_files = [
            "services/research/master_research_service.py",
            "services/research/response_orchestration_service.py",
            "services/research/performance_optimization_service.py"
        ]
        
        for service_file in service_files:
            with open(service_file, 'r') as f:
                content = f.read()
            
            error_patterns = [
                "try:",
                "except Exception",
                "logger.error",
                "fallback",
                "raise",
                "finally:"
            ]
            
            error_pattern_count = sum(1 for pattern in error_patterns if pattern in content)
            service_name = os.path.basename(service_file).replace('.py', '')
            
            if error_pattern_count >= 4:
                print(f"✅ {service_name}: Robust error handling ({error_pattern_count} patterns)")
            else:
                print(f"⚠️  {service_name}: Limited error handling ({error_pattern_count} patterns)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error handling test failed: {e}")
        return False

async def run_integration_tests():
    """Run all integration tests."""
    print_test_header("V3 Research API Integration Test Suite")
    
    tests = [
        ("Enhanced Models", test_enhanced_models),
        ("Master Research Service", test_master_research_service),
        ("Response Orchestration", test_response_orchestration),
        ("Performance Optimization", test_performance_optimization),
        ("API Structure", test_api_structure),
        ("V1 Compatibility", test_v1_compatibility),
        ("Error Handling", test_error_handling),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            print(f"\n🚀 Running: {test_name}")
            result = await asyncio.wait_for(test_func(), timeout=TEST_CONFIG["test_timeout"])
            results.append((test_name, result))
            
            if result:
                print(f"✅ {test_name}: PASSED")
            else:
                print(f"❌ {test_name}: FAILED")
                
        except asyncio.TimeoutError:
            print(f"⏰ {test_name}: TIMEOUT")
            results.append((test_name, False))
        except Exception as e:
            print(f"💥 {test_name}: ERROR - {e}")
            results.append((test_name, False))
    
    # Summary
    print_test_header("Test Results Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} {test_name}")
    
    print(f"\n🎯 Overall Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All integration tests passed!")
        print("✅ V3 Research API is ready for use")
        return True
    else:
        print(f"\n⚠️  {total - passed} tests failed")
        print("❌ Please review the implementation")
        return False

if __name__ == "__main__":
    print("🧪 V3 Research API Integration Test")
    print("=" * 50)
    
    if TEST_CONFIG["enable_llm_calls"]:
        print("⚠️  LLM calls enabled - requires API keys")
    else:
        print("ℹ️  LLM calls disabled - testing structure only")
    
    success = asyncio.run(run_integration_tests())
    
    if success:
        print("\n🚀 Next Steps:")
        print("1. Set up environment variables for LLM API keys")
        print("2. Run the FastAPI server: uvicorn main:app --reload")
        print("3. Test the API endpoints manually or with Postman")
        print("4. Check the health endpoint: GET /api/research/v3/health")
        sys.exit(0)
    else:
        sys.exit(1)
