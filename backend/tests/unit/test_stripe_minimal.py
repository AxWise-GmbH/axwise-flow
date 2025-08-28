#!/usr/bin/env python3
"""
Minimal test to isolate the Stripe service issue
"""
import os
import sys

# Add the backend directory to the Python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

print("Testing minimal Stripe service...")

# Test basic imports
try:
    import stripe
    from sqlalchemy.orm import Session
    print("✅ Basic imports successful")
except Exception as e:
    print(f"❌ Import error: {str(e)}")
    exit(1)

# Test Stripe API key setup
try:
    api_key = os.getenv("STRIPE_SECRET_KEY")
    if api_key:
        stripe.api_key = api_key
        print(f"✅ Stripe API key set: {api_key[:20]}...")
    else:
        print("❌ STRIPE_SECRET_KEY not found")
        exit(1)
except Exception as e:
    print(f"❌ Error setting Stripe API key: {str(e)}")
    exit(1)

# Test ClerkService import (this might be the issue)
try:
    from backend.services.external.clerk_service import ClerkService
    print("✅ ClerkService imported successfully")
    
    # Try to initialize ClerkService (this might hang)
    print("Initializing ClerkService...")
    CLERK_...=***REMOVED***
    print("✅ ClerkService initialized successfully")
    
except Exception as e:
    print(f"❌ ClerkService error: {str(e)}")
    import traceback
    traceback.print_exc()

print("✅ All tests completed!")
