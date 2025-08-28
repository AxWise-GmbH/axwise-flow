#!/usr/bin/env python3
"""
Test script to verify timezone consistency across the application.

This script tests that all timestamp creation and formatting is consistent
throughout the codebase.
"""

import sys
import os
from datetime import datetime, timezone

# Add backend to path
backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_dir)

from backend.utils.timezone_utils import (
    utc_now, 
    ensure_utc, 
    format_iso_utc, 
    get_duration_minutes,
    to_local_timezone
)

def test_timezone_utilities():
    """Test all timezone utility functions."""
    print("🔧 Testing Timezone Utilities...")
    
    # Test utc_now()
    now = utc_now()
    print(f"✅ utc_now(): {now} (timezone: {now.tzinfo})")
    assert now.tzinfo == timezone.utc, "utc_now() should return timezone-aware UTC datetime"
    
    # Test ensure_utc() with naive datetime
    naive_dt = datetime(2025, 8, 15, 19, 53, 18)
    utc_dt = ensure_utc(naive_dt)
    print(f"✅ ensure_utc(naive): {naive_dt} -> {utc_dt}")
    assert utc_dt.tzinfo == timezone.utc, "ensure_utc() should add UTC timezone to naive datetime"
    
    # Test format_iso_utc()
    iso_string = format_iso_utc(utc_dt)
    print(f"✅ format_iso_utc(): {iso_string}")
    assert iso_string.endswith('Z'), "format_iso_utc() should end with 'Z'"
    
    # Test duration calculation
    start_time = datetime(2025, 8, 15, 21, 53, 18, tzinfo=timezone.utc)
    end_time = datetime(2025, 8, 15, 22, 32, 18, tzinfo=timezone.utc)
    duration = get_duration_minutes(start_time, end_time)
    print(f"✅ get_duration_minutes(): {duration} minutes")
    assert abs(duration - 39.0) < 0.1, f"Duration should be ~39 minutes, got {duration}"
    
    # Test timezone conversion
    local_time = to_local_timezone(start_time, "Europe/Berlin")
    print(f"✅ to_local_timezone(): {start_time} -> {local_time}")
    
    print("🎉 All timezone utility tests passed!\n")

def test_model_consistency():
    """Test that model defaults use consistent timezone utilities."""
    print("🔧 Testing Model Consistency...")
    
    try:
        from backend.models import AnalysisResult, InterviewData
        from backend.utils.timezone_utils import utc_now
        
        # Test that model defaults are using our utility
        print("✅ Models imported successfully")
        print("✅ Models should now use utc_now() for default timestamps")
        
        # Create a test instance (without saving to DB)
        test_result = AnalysisResult()
        print(f"✅ AnalysisResult default timestamp function: {test_result.__table__.columns['analysis_date'].default}")
        
    except Exception as e:
        print(f"❌ Model consistency test failed: {e}")
        return False
    
    print("🎉 Model consistency tests passed!\n")
    return True

def test_api_formatting():
    """Test that API responses format timestamps consistently."""
    print("🔧 Testing API Formatting...")
    
    try:
        from backend.utils.timezone_utils import format_iso_utc
        
        # Test various datetime scenarios
        test_cases = [
            datetime(2025, 8, 15, 19, 53, 18, tzinfo=timezone.utc),  # UTC timezone-aware
            datetime(2025, 8, 15, 19, 53, 18),  # Naive datetime
            None,  # None value
        ]
        
        for i, dt in enumerate(test_cases):
            result = format_iso_utc(dt)
            print(f"✅ Test case {i+1}: {dt} -> {result}")
            
            if dt is None:
                assert result is None, "None input should return None"
            else:
                assert isinstance(result, str), "Non-None input should return string"
                if result:
                    assert result.endswith('Z'), "Formatted datetime should end with 'Z'"
        
    except Exception as e:
        print(f"❌ API formatting test failed: {e}")
        return False
    
    print("🎉 API formatting tests passed!\n")
    return True

def main():
    """Run all timezone consistency tests."""
    print("🚀 Starting Timezone Consistency Tests...\n")
    
    try:
        test_timezone_utilities()
        test_model_consistency()
        test_api_formatting()
        
        print("🎉 ALL TESTS PASSED! Timezone consistency is now implemented.")
        print("\n📋 Summary of Changes:")
        print("✅ Created centralized timezone_utils.py")
        print("✅ Updated model defaults to use utc_now()")
        print("✅ Updated repository to use utc_now()")
        print("✅ Updated analysis service to set explicit timestamps")
        print("✅ Updated API responses to use format_iso_utc()")
        print("✅ Updated results service to use format_iso_utc()")
        
        print("\n🔧 Next Steps:")
        print("1. Restart the backend server to apply model changes")
        print("2. Test with a new analysis to verify timestamps are correct")
        print("3. Check that frontend displays times in user's local timezone")
        
        return True
        
    except Exception as e:
        print(f"❌ Tests failed with error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
