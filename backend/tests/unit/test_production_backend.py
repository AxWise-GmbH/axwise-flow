#!/usr/bin/env python3
"""
Test the deployed production backend to verify NLP blocking fix is working.
"""

import requests
import json
import time

# Production backend URL
BACKEND_URL = "https://axwise-backend-oicbg7twja-ez.a.run.app"

def test_production_backend():
    """Test the production backend with the NLP blocking fix."""
    
    print("🚀 TESTING PRODUCTION BACKEND")
    print("=" * 60)
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    # Test data that would have been blocked by NLP before our fix
    test_data = {
        "input": "I'm not sure what to build, can you give me examples?",
        "session_id": "production_test_nlp_fix",
        "context": {
            "businessIdea": "something for customers",
            "targetCustomer": "people who need help",
            "problem": "they have trouble with current solutions",
        },
        "messages": [
            {
                "id": "1",
                "content": "I'm not sure what to build, can you give me examples?",
                "role": "user",
                "timestamp": "2024-01-01T10:00:00Z",
            }
        ],
    }
    
    try:
        print("📤 Testing case that was previously blocked by NLP...")
        print(f"Input: '{test_data['input']}'")
        print("⏳ Sending request to production backend...")
        
        response = requests.post(
            f"{BACKEND_URL}/api/research/v3-rebuilt/chat",
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer test_token",
            },
            json=test_data,
            timeout=60,
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            print("✅ SUCCESS: Backend is responding!")
            print(f"📝 Content Length: {len(data.get('content', ''))}")
            print(f"💡 Suggestions: {len(data.get('suggestions', []))}")
            print(f"❓ Questions Generated: {bool(data.get('questions'))}")
            
            # Check metadata for business readiness
            metadata = data.get('metadata', {})
            business_readiness = metadata.get('business_readiness', {})
            ready_for_questions = business_readiness.get('ready_for_questions', False)
            
            print(f"🎯 Business Readiness: {ready_for_questions}")
            print(f"⚡ Processing Time: {metadata.get('processing_time_ms', 'N/A')}ms")
            
            # Check if this would have been blocked before
            if ready_for_questions:
                print("\n🎉 NLP BLOCKING FIX CONFIRMED!")
                print("✅ This request would have been blocked by hardcoded NLP before")
                print("✅ Now it's allowed through to LLM-based question generation")
                print("✅ The fix is working in production!")
                return True
            else:
                print("\n⚠️  Unexpected: Business readiness is False")
                print("This might indicate the fix didn't deploy properly")
                return False
                
        elif response.status_code == 404:
            print("❌ ERROR: Endpoint not found")
            print("The backend might not be fully deployed yet")
            return False
            
        elif response.status_code == 500:
            print("❌ ERROR: Internal server error")
            print("There might be an issue with the backend deployment")
            print(f"Response: {response.text[:200]}...")
            return False
            
        else:
            print(f"❌ ERROR: Unexpected status code {response.status_code}")
            print(f"Response: {response.text[:200]}...")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ ERROR: Request timed out")
        print("The backend might be starting up or overloaded")
        return False
        
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Connection failed")
        print("The backend URL might be incorrect or the service is down")
        return False
        
    except Exception as e:
        print(f"❌ ERROR: Unexpected error: {str(e)}")
        return False

def test_health_endpoint():
    """Test the health endpoint to verify backend is running."""
    
    print("\n🏥 TESTING HEALTH ENDPOINT")
    print("-" * 40)
    
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=30)
        
        if response.status_code == 200:
            print("✅ Health endpoint responding")
            return True
        else:
            print(f"⚠️  Health endpoint returned {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Health endpoint failed: {str(e)}")
        return False

def main():
    """Run production backend tests."""
    
    print("🎯 PRODUCTION BACKEND TEST")
    print("Testing NLP blocking fix deployment")
    print("=" * 80)
    
    # Test health first
    health_ok = test_health_endpoint()
    
    # Test main functionality
    nlp_fix_ok = test_production_backend()
    
    print("\n" + "=" * 80)
    print("🎯 PRODUCTION TEST SUMMARY")
    print("=" * 80)
    
    if health_ok and nlp_fix_ok:
        print("🎉 COMPLETE SUCCESS!")
        print("✅ Backend is deployed and running")
        print("✅ NLP blocking fix is working in production")
        print("✅ LLM-based question generation is unblocked")
        print("\n🚀 READY FOR USERS!")
        print("Users can now get questions generated without NLP interference")
        
    elif health_ok and not nlp_fix_ok:
        print("⚠️  PARTIAL SUCCESS")
        print("✅ Backend is running")
        print("❌ NLP blocking fix needs verification")
        print("The backend is deployed but the fix might need more testing")
        
    elif not health_ok:
        print("❌ DEPLOYMENT ISSUE")
        print("❌ Backend health check failed")
        print("The backend might still be starting up or there's a deployment issue")
        
    else:
        print("❌ UNKNOWN STATE")
        print("Please check the backend deployment manually")

if __name__ == "__main__":
    main()
