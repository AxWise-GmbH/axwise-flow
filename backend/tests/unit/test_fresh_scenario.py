#!/usr/bin/env python3

import requests
import json
import time
import uuid

def test_fresh_business_scenario():
    """Test with a completely new business scenario to avoid cache and validate real performance"""
    
    print("🧪 FRESH BUSINESS SCENARIO TEST")
    print("=" * 80)
    print("Testing performance and UX with a unique business idea to avoid cache")
    print()
    
    # Use completely unique session and business idea
    unique_id = uuid.uuid4().hex[:8]
    session_id = f"fresh_test_{unique_id}_{int(time.time())}"
    
    # Unique business scenario that shouldn't be cached
    conversation_steps = [
        f"I want to create a virtual reality meditation studio for stressed executives in {unique_id} city",
        f"The target customers are C-level executives aged 40-55 who work in high-stress environments in {unique_id} financial district",
        f"Let me add more details - these executives work 70+ hour weeks and have no time for traditional wellness programs",
        f"The main problem is that executives suffer from chronic stress and burnout but can't find convenient, time-efficient stress relief solutions that fit their busy schedules",
        f"We would offer 15-minute VR meditation sessions that can be done during lunch breaks or between meetings",
        f"The sessions would be scientifically designed to reduce cortisol levels and improve focus within a short timeframe",
        "Yes, that's exactly right. Please generate the research questions."
    ]
    
    messages = []
    performance_data = []
    
    for i, user_input in enumerate(conversation_steps, 1):
        print(f"\n📝 Step {i}: '{user_input[:80]}{'...' if len(user_input) > 80 else ''}'")
        print("-" * 60)
        
        request_data = {
            "input": user_input,
            "session_id": session_id,
            "context": {
                "businessIdea": "",
                "targetCustomer": "",
                "problem": ""
            },
            "messages": messages
        }
        
        # Measure performance
        start_time = time.time()
        
        try:
            response = requests.post(
                "http://localhost:8000/api/research/v3-rebuilt/chat",
                json=request_data,
                timeout=60,
                headers={"Authorization": "Bearer test_token"}
            )
            
            end_time = time.time()
            response_time_ms = (end_time - start_time) * 1000
            
            if response.status_code == 200:
                result = response.json()
                
                # Extract performance data
                server_processing_time = result.get('metadata', {}).get('processing_time_ms', 0)
                analysis_time = result.get('metadata', {}).get('analysis_time_ms', 0)
                
                performance_data.append({
                    'step': i,
                    'total_time_ms': response_time_ms,
                    'server_time_ms': server_processing_time,
                    'analysis_time_ms': analysis_time,
                    'network_time_ms': response_time_ms - server_processing_time
                })
                
                # Extract business readiness data
                metadata = result.get('metadata', {})
                business_readiness = metadata.get('business_readiness', {})
                
                print(f"⏱️ Total Time: {response_time_ms:.2f}ms")
                print(f"⏱️ Server Processing: {server_processing_time}ms")
                print(f"⏱️ Analysis Time: {analysis_time}ms")
                print(f"📊 Ready for Questions: {business_readiness.get('ready_for_questions', False)}")
                print(f"📊 Conversation Quality: {business_readiness.get('conversation_quality', 'unknown')}")
                print(f"📊 Problem Context Sufficient: {business_readiness.get('problem_context_sufficient', False)}")
                
                # Check if from cache
                if result.get('from_cache'):
                    print("💾 Response served from cache")
                
                # Check if questions were generated
                if result.get('questions'):
                    print("🎉 QUESTIONNAIRE GENERATED!")
                    questions = result.get('questions', {})
                    total_questions = sum(len(questions.get(cat, [])) for cat in ['problemDiscovery', 'solutionValidation', 'followUp'])
                    print(f"📋 Total Questions: {total_questions}")
                    
                    # Show sample questions
                    if 'problemDiscovery' in questions and questions['problemDiscovery']:
                        print(f"🔍 Sample Problem Discovery: {questions['problemDiscovery'][0][:100]}...")
                else:
                    content = result.get('content', '')
                    print(f"💬 Assistant Response: {content[:100]}{'...' if len(content) > 100 else ''}")
                
                # Add to conversation history
                messages.append({
                    "id": f"user_{i}",
                    "content": user_input,
                    "role": "user",
                    "timestamp": str(int(time.time()))
                })
                
                messages.append({
                    "id": f"assistant_{i}",
                    "content": result.get('content', ''),
                    "role": "assistant",
                    "timestamp": str(int(time.time()))
                })
                
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                break
                
        except Exception as e:
            print(f"❌ Request failed: {e}")
            break
    
    # Performance Analysis
    print(f"\n{'='*20} PERFORMANCE ANALYSIS {'='*20}")
    if performance_data:
        # Overall metrics
        avg_total = sum(p['total_time_ms'] for p in performance_data) / len(performance_data)
        avg_server = sum(p['server_time_ms'] for p in performance_data) / len(performance_data)
        avg_analysis = sum(p['analysis_time_ms'] for p in performance_data) / len(performance_data)
        max_total = max(p['total_time_ms'] for p in performance_data)
        
        print(f"📊 Average Total Time: {avg_total:.2f}ms ({avg_total/1000:.2f}s)")
        print(f"📊 Average Server Time: {avg_server:.2f}ms ({avg_server/1000:.2f}s)")
        print(f"📊 Average Analysis Time: {avg_analysis:.2f}ms ({avg_analysis/1000:.2f}s)")
        print(f"📊 Maximum Total Time: {max_total:.2f}ms ({max_total/1000:.2f}s)")
        
        # Performance assessment
        if avg_total > 20000:  # 20 seconds
            print("🔴 PERFORMANCE ISSUE: Still exceeding 20 seconds")
            print(f"   Target: 15-20 seconds, Actual: {avg_total/1000:.1f} seconds")
        elif avg_total > 15000:  # 15 seconds
            print("🟡 PERFORMANCE WARNING: Approaching upper limit")
            print(f"   Target: 15-20 seconds, Actual: {avg_total/1000:.1f} seconds")
        else:
            print("✅ PERFORMANCE EXCELLENT: Well within acceptable range")
            print(f"   Target: 15-20 seconds, Actual: {avg_total/1000:.1f} seconds")
        
        # Check if comprehensive analysis is working
        if avg_analysis > 0:
            print(f"✅ OPTIMIZATION ACTIVE: Comprehensive analysis running ({avg_analysis:.1f}ms avg)")
        else:
            print("⚠️ OPTIMIZATION UNCLEAR: Analysis time not reported or using cache")
        
        # Detailed breakdown
        print(f"\n📋 STEP-BY-STEP BREAKDOWN:")
        for p in performance_data:
            print(f"   Step {p['step']}: {p['total_time_ms']:.0f}ms total "
                  f"(Server: {p['server_time_ms']}ms, Analysis: {p['analysis_time_ms']}ms)")
    
    # UX Assessment
    print(f"\n{'='*20} UX ASSESSMENT {'='*20}")
    
    # Find when questions were first generated
    first_questions_step = None
    for i, p in enumerate(performance_data, 1):
        # Check if this step generated questions (we'd need to track this in the loop above)
        pass  # This would need to be tracked during the conversation
    
    print("📋 UX evaluation would require tracking question generation timing during conversation")
    
    print(f"\n🎯 FRESH SCENARIO TEST COMPLETE")
    return performance_data

if __name__ == "__main__":
    test_fresh_business_scenario()
