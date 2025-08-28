#!/usr/bin/env python3
"""
Test script to check Stripe environment variables
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

print("Testing Stripe environment variables...")
print(f"STRIPE_...=***REMOVED***'STRIPE_SECRET_KEY', 'NOT SET')[:20]}...")
print(f"STRIPE_...=***REMOVED***'STRIPE_PUBLISHABLE_KEY', 'NOT SET')[:20]}...")
print(f"STRIPE_WEBHOOK_SECRET: {os.getenv('STRIPE_WEBHOOK_SECRET', 'NOT SET')[:20]}...")

# Test Stripe service initialization
try:
    from backend.services.payment.stripe_service import StripeService
    from backend.database import get_db
    
    # Get a database session
    db = next(get_db())
    
    # Try to initialize the service without a user (should work for testing)
    stripe_service = StripeService(db, None)
    print("✅ StripeService initialized successfully!")
    
except Exception as e:
    print(f"❌ Error initializing StripeService: {str(e)}")
    import traceback
    traceback.print_exc()
