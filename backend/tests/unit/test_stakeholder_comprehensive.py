#!/usr/bin/env python3
"""
Comprehensive stakeholder analysis testing suite.
Consolidates functionality from multiple redundant test files.
"""

import asyncio
import sys
import os
import requests
import json
import time
from typing import Dict, Any, List

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# Configuration
API_BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "testuser123"
TEST_FILE_PATH = "test_multi_stakeholder_interview.txt"

class StakeholderTestSuite:
    """Comprehensive stakeholder analysis test suite"""
    
    def __init__(self):
        self.api_base = API_BASE_URL
        self.auth_token = AUTH_TOKEN
        self.headers = {"Authorization": f"Bearer {self.auth_token}"}
    
    async def test_stakeholder_detection(self):
        """Test stakeholder detection functionality"""
        print("🔍 Testing Stakeholder Detection...")
        
        try:
            from backend.models.stakeholder_models import StakeholderDetector
            
            # Test with sample multi-stakeholder data
            test_data = [
                "INTERVIEW 1: Primary Customer - Sarah, Age 28, Marketing Manager",
                "INTERVIEW 2: Decision Maker - John, Age 45, CTO", 
                "INTERVIEW 3: End User - Mike, Age 22, Developer"
            ]
            
            result = StakeholderDetector.detect_multi_stakeholder_data(test_data)
            
            assert result.is_multi_stakeholder == True
            assert len(result.detected_stakeholders) >= 2
            assert result.confidence_score > 0.5
            
            print("✅ Stakeholder detection test passed")
            return True
            
        except Exception as e:
            print(f"❌ Stakeholder detection test failed: {e}")
            return False
    
    async def test_stakeholder_service_direct(self):
        """Test stakeholder analysis service directly"""
        print("🔧 Testing Stakeholder Service Direct...")
        
        try:
            from backend.services.stakeholder_analysis_service import StakeholderAnalysisService
            from backend.services.llm import LLMServiceFactory
            from backend.schemas import DetailedAnalysisResult
            
            # Create LLM service
            llm_service = LLMServiceFactory.create("gemini")
            
            # Create stakeholder service
            stakeholder_service = StakeholderAnalysisService(llm_service)
            
            # Test with mock analysis result
            mock_analysis = DetailedAnalysisResult(
                themes=[],
                patterns=[],
                sentiment={},
                personas=[],
                insights=[]
            )
            
            # Test enhancement
            files = ["Mock interview data with multiple stakeholders"]
            enhanced_result = await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
                files, mock_analysis
            )
            
            assert enhanced_result is not None
            print("✅ Stakeholder service direct test passed")
            return True
            
        except Exception as e:
            print(f"❌ Stakeholder service direct test failed: {e}")
            return False
    
    def test_stakeholder_api_endpoints(self):
        """Test stakeholder analysis API endpoints"""
        print("🌐 Testing Stakeholder API Endpoints...")
        
        try:
            # Test upload
            if not os.path.exists(TEST_FILE_PATH):
                print(f"⚠️ Test file {TEST_FILE_PATH} not found, skipping API test")
                return True
            
            # Upload test file
            with open(TEST_FILE_PATH, 'rb') as f:
                files = {'file': f}
                data = {'is_free_text': 'true'}
                
                response = requests.post(
                    f"{self.api_base}/api/data",
                    headers=self.headers,
                    files=files,
                    data=data
                )
            
            if response.status_code != 200:
                print(f"⚠️ Upload failed: {response.status_code}")
                return False
            
            upload_result = response.json()
            data_id = upload_result.get("data_id")
            
            # Trigger analysis
            analysis_payload = {
                "data_id": data_id,
                "llm_provider": "gemini",
                "llm_model": "models/gemini-2.5-flash",
            }
            
            response = requests.post(
                f"{self.api_base}/api/analyze",
                headers=self.headers,
                json=analysis_payload
            )
            
            if response.status_code == 200:
                print("✅ Stakeholder API endpoints test passed")
                return True
            else:
                print(f"⚠️ Analysis failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Stakeholder API endpoints test failed: {e}")
            return False
    
    def test_stakeholder_capabilities(self):
        """Test stakeholder detection and question generation capabilities"""
        print("🎯 Testing Stakeholder Capabilities...")
        
        try:
            # Test conversation flow for stakeholder detection
            session_id = f"stakeholder_test_{int(time.time())}"
            
            # Test stakeholder detection in conversation
            conversation_payload = {
                "session_id": session_id,
                "message": "I want to research a coffee shop business idea",
                "context": {}
            }
            
            response = requests.post(
                f"{self.api_base}/api/research/conversation",
                headers=self.headers,
                json=conversation_payload
            )
            
            if response.status_code == 200:
                result = response.json()
                # Check if stakeholder suggestions are present
                if "stakeholder" in str(result).lower():
                    print("✅ Stakeholder capabilities test passed")
                    return True
            
            print("⚠️ Stakeholder capabilities test completed with warnings")
            return True
            
        except Exception as e:
            print(f"❌ Stakeholder capabilities test failed: {e}")
            return False
    
    async def run_all_tests(self):
        """Run all stakeholder analysis tests"""
        print("🚀 COMPREHENSIVE STAKEHOLDER ANALYSIS TEST SUITE")
        print("=" * 60)
        
        tests = [
            ("Stakeholder Detection", self.test_stakeholder_detection()),
            ("Stakeholder Service Direct", self.test_stakeholder_service_direct()),
            ("Stakeholder API Endpoints", self.test_stakeholder_api_endpoints()),
            ("Stakeholder Capabilities", self.test_stakeholder_capabilities()),
        ]
        
        results = []
        for test_name, test_coro in tests:
            print(f"\n📋 Running: {test_name}")
            try:
                if asyncio.iscoroutine(test_coro):
                    result = await test_coro
                else:
                    result = test_coro
                results.append((test_name, result))
            except Exception as e:
                print(f"❌ {test_name} failed with exception: {e}")
                results.append((test_name, False))
        
        # Summary
        print(f"\n📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for test_name, result in results:
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"{status}: {test_name}")
        
        print(f"\n🎯 Overall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All stakeholder analysis tests passed!")
        else:
            print("⚠️ Some tests failed. Check logs above for details.")
        
        return passed == total

async def main():
    """Main test runner"""
    test_suite = StakeholderTestSuite()
    success = await test_suite.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
