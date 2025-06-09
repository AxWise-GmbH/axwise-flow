#!/usr/bin/env python3
"""
Practical API Endpoint Testing for V3 Research API.

This script tests the actual API endpoints with real requests.
Run this after starting the FastAPI server.
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any, List

# API Configuration
API_BASE_URL = "http://localhost:8000"  # Adjust if your server runs on different port
API_PREFIX = "/api/research/v3"

# Test data
SAMPLE_MESSAGES = [
    {
        "id": "msg_1",
        "content": "Hi, I'm working on a business idea",
        "role": "user",
        "timestamp": "2024-01-01T10:00:00Z"
    },
    {
        "id": "msg_2", 
        "content": "That's great! I'd love to help you with customer research. What kind of business are you thinking about?",
        "role": "assistant",
        "timestamp": "2024-01-01T10:00:01Z"
    }
]

SAMPLE_CONTEXT = {
    "businessIdea": "A mobile app for restaurant inventory management",
    "targetCustomer": "Small to medium restaurants",
    "problem": "Manual inventory tracking leads to waste and stockouts",
    "stage": "idea",
    "questionsGenerated": False
}

async def test_health_endpoint():
    """Test the health check endpoint."""
    print("🏥 Testing Health Endpoint...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/health"
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Health check passed")
                    print(f"   Status: {data.get('status')}")
                    print(f"   Version: {data.get('version')}")
                    print(f"   Features: {len(data.get('features', []))} available")
                    return True
                else:
                    print(f"❌ Health check failed: {response.status}")
                    return False
                    
    except Exception as e:
        print(f"❌ Health endpoint error: {e}")
        return False

async def test_chat_endpoint_basic():
    """Test basic chat endpoint functionality."""
    print("\n💬 Testing Chat Endpoint (Basic)...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/chat"
            
            payload = {
                "messages": SAMPLE_MESSAGES,
                "input": "I'm building a mobile app for restaurants to manage their inventory better",
                "context": SAMPLE_CONTEXT,
                "session_id": f"test_session_{int(time.time())}",
                "user_id": "test_user",
                "enable_enhanced_analysis": True,
                "enable_parallel_processing": True,
                "v1_compatibility_mode": False
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer test_token"  # You may need to adjust this
            }
            
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Chat endpoint responded successfully")
                    print(f"   Content length: {len(data.get('content', ''))}")
                    print(f"   API version: {data.get('api_version')}")
                    print(f"   Session ID: {data.get('session_id')}")
                    
                    if data.get('enhanced_analysis'):
                        print(f"   Enhanced analysis: Available")
                        analysis = data['enhanced_analysis']
                        if analysis.get('user_intent'):
                            print(f"   User intent: {analysis['user_intent'].get('primary_intent')}")
                        if analysis.get('business_readiness'):
                            print(f"   Business readiness: {analysis['business_readiness'].get('ready_for_questions')}")
                    
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Chat endpoint failed: {response.status}")
                    print(f"   Error: {error_text}")
                    return False
                    
    except Exception as e:
        print(f"❌ Chat endpoint error: {e}")
        return False

async def test_chat_endpoint_v1_compatibility():
    """Test chat endpoint with V1 compatibility mode."""
    print("\n🔄 Testing Chat Endpoint (V1 Compatibility)...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/chat"
            
            payload = {
                "messages": SAMPLE_MESSAGES,
                "input": "Yes, that's exactly right! Let's generate some research questions.",
                "context": SAMPLE_CONTEXT,
                "session_id": f"test_v1_session_{int(time.time())}",
                "user_id": "test_user",
                "enable_enhanced_analysis": False,
                "enable_parallel_processing": False,
                "v1_compatibility_mode": True
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer test_token"
            }
            
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ V1 compatibility mode responded successfully")
                    print(f"   API version: {data.get('api_version')}")
                    print(f"   Content: {data.get('content', '')[:100]}...")
                    
                    if data.get('metadata'):
                        print(f"   V1 metadata: Available")
                        metadata = data['metadata']
                        if metadata.get('extracted_context'):
                            print(f"   Context extracted: Yes")
                        if metadata.get('user_intent'):
                            print(f"   Intent: {metadata['user_intent'].get('intent')}")
                    
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ V1 compatibility failed: {response.status}")
                    print(f"   Error: {error_text}")
                    return False
                    
    except Exception as e:
        print(f"❌ V1 compatibility error: {e}")
        return False

async def test_analyze_endpoint():
    """Test the direct analysis endpoint."""
    print("\n🔍 Testing Analysis Endpoint...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/analyze"
            
            conversation_context = """
            user: Hi, I'm working on a business idea
            assistant: That's great! What kind of business are you thinking about?
            user: I'm building a mobile app for restaurants to manage their inventory better
            assistant: That sounds interesting! Can you tell me more about the specific problems restaurants face?
            user: They struggle with manual tracking, food waste, and knowing when to reorder supplies
            """
            
            payload = {
                "conversation_context": conversation_context,
                "latest_input": "Yes, exactly! They need better visibility into their stock levels",
                "messages": SAMPLE_MESSAGES,
                "existing_context": SAMPLE_CONTEXT,
                "session_metadata": {"test": True},
                "enable_industry_analysis": True,
                "enable_stakeholder_detection": True,
                "enable_enhanced_context": True,
                "enable_conversation_flow": True
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer test_token"
            }
            
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Analysis endpoint responded successfully")
                    print(f"   API version: {data.get('api_version')}")
                    
                    if data.get('analysis'):
                        analysis = data['analysis']
                        print(f"   Analysis content: {len(analysis.get('content', ''))}")
                        
                        if analysis.get('user_intent'):
                            intent = analysis['user_intent']
                            print(f"   User intent: {intent.get('primary_intent')} (confidence: {intent.get('confidence')})")
                        
                        if analysis.get('extracted_context'):
                            context = analysis['extracted_context']
                            print(f"   Business idea: {context.get('business_idea', 'Not specified')}")
                            print(f"   Completeness: {context.get('completeness_score', 0)}")
                        
                        if analysis.get('conversation_flow'):
                            flow = analysis['conversation_flow']
                            print(f"   Conversation stage: {flow.get('current_stage')}")
                            print(f"   Ready for questions: {flow.get('readiness_for_questions')}")
                    
                    if data.get('performance_metrics'):
                        metrics = data['performance_metrics']
                        print(f"   Performance: {metrics.get('avg_total_duration_ms', 0):.0f}ms avg")
                    
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Analysis endpoint failed: {response.status}")
                    print(f"   Error: {error_text}")
                    return False
                    
    except Exception as e:
        print(f"❌ Analysis endpoint error: {e}")
        return False

async def test_metrics_endpoint():
    """Test the metrics endpoint."""
    print("\n📊 Testing Metrics Endpoint...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/metrics"
            
            headers = {
                "Authorization": "Bearer test_token"
            }
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Metrics endpoint responded successfully")
                    
                    if data.get('master_service_metrics'):
                        master_metrics = data['master_service_metrics']
                        print(f"   Total requests: {master_metrics.get('total_requests', 0)}")
                        print(f"   Avg duration: {master_metrics.get('avg_total_duration_ms', 0):.0f}ms")
                        print(f"   Error rate: {master_metrics.get('error_rate', 0):.2%}")
                    
                    if data.get('instructor_client_metrics'):
                        client_metrics = data['instructor_client_metrics']
                        print(f"   Client requests: {client_metrics.get('total_requests', 0)}")
                        print(f"   Success rate: {client_metrics.get('success_rate', 0):.2%}")
                    
                    print(f"   Timestamp: {data.get('timestamp')}")
                    
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Metrics endpoint failed: {response.status}")
                    print(f"   Error: {error_text}")
                    return False
                    
    except Exception as e:
        print(f"❌ Metrics endpoint error: {e}")
        return False

async def test_error_handling():
    """Test error handling with invalid requests."""
    print("\n🛡️  Testing Error Handling...")
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_BASE_URL}{API_PREFIX}/chat"
            
            # Test with invalid payload
            invalid_payload = {
                "messages": "invalid_format",  # Should be array
                "input": "",  # Empty input
                "invalid_field": "test"
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer test_token"
            }
            
            async with session.post(url, json=invalid_payload, headers=headers) as response:
                if response.status >= 400:
                    print(f"✅ Error handling working: {response.status}")
                    error_data = await response.json()
                    print(f"   Error detail: {error_data.get('detail', 'No detail')}")
                    return True
                else:
                    print(f"⚠️  Expected error but got: {response.status}")
                    return False
                    
    except Exception as e:
        print(f"❌ Error handling test error: {e}")
        return False

async def run_api_tests():
    """Run all API endpoint tests."""
    print("🧪 V3 Research API Endpoint Tests")
    print("=" * 50)
    
    # Check if server is running
    print("🔍 Checking if server is running...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_BASE_URL}/docs") as response:
                if response.status == 200:
                    print("✅ FastAPI server is running")
                else:
                    print("❌ Server not responding correctly")
                    return False
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        print("💡 Make sure to start the server with: uvicorn main:app --reload")
        return False
    
    tests = [
        ("Health Endpoint", test_health_endpoint),
        ("Chat Endpoint (Basic)", test_chat_endpoint_basic),
        ("Chat Endpoint (V1 Compatibility)", test_chat_endpoint_v1_compatibility),
        ("Analysis Endpoint", test_analyze_endpoint),
        ("Metrics Endpoint", test_metrics_endpoint),
        ("Error Handling", test_error_handling),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"💥 {test_name}: ERROR - {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 50)
    print("📋 API Test Results Summary:")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} {test_name}")
    
    print(f"\n🎯 Overall Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All API tests passed!")
        print("✅ V3 Research API is working correctly")
        return True
    else:
        print(f"\n⚠️  {total - passed} tests failed")
        print("❌ Please check the server logs and implementation")
        return False

if __name__ == "__main__":
    print("🚀 Starting V3 API Endpoint Tests")
    print(f"📡 Testing against: {API_BASE_URL}{API_PREFIX}")
    print("=" * 50)
    
    success = asyncio.run(run_api_tests())
    
    if success:
        print("\n🎯 API is ready for production!")
        print("\n📖 API Documentation:")
        print(f"   Swagger UI: {API_BASE_URL}/docs")
        print(f"   ReDoc: {API_BASE_URL}/redoc")
        print(f"   Health Check: {API_BASE_URL}{API_PREFIX}/health")
    else:
        print("\n🔧 Troubleshooting:")
        print("1. Check if the FastAPI server is running")
        print("2. Verify environment variables are set")
        print("3. Check server logs for errors")
        print("4. Ensure all dependencies are installed")
    
    exit(0 if success else 1)
