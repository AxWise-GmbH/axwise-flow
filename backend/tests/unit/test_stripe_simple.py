#!/usr/bin/env python3
"""
Simple test script to check Stripe service initialization
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

print("Testing Stripe service initialization...")

# Test basic Stripe import
try:
    import stripe
    print("✅ Stripe library imported successfully")
except Exception as e:
    print(f"❌ Error importing Stripe: {str(e)}")
    exit(1)

# Test setting API key
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

# Test basic Stripe API call
try:
    # Try to list customers (should work even if empty)
    customers = stripe.Customer.list(limit=1)
    print(f"✅ Stripe API call successful. Found {len(customers.data)} customers")
except Exception as e:
    print(f"❌ Error calling Stripe API: {str(e)}")
    exit(1)

print("✅ All Stripe tests passed!")
