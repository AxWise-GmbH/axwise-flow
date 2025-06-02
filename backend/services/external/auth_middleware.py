"""
Authentication middleware for the FastAPI application.

Last Updated: 2025-03-25
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging
import os

from backend.database import get_db
from backend.models import User
from backend.services.external.clerk_service import ClerkService

# Configure logging
logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(
    scheme_name="Bearer Authentication",
    description="Enter your bearer token",
    auto_error=True,
)

# Initialize Clerk service
CLERK_...=***REMOVED***

# Enable/disable Clerk JWT validation based on environment
ENABLE_CLERK_...=***REMOVED***
    os.getenv("ENABLE_CLERK_VALIDATION", "false").lower() == "true"
)

# Check if we're in production environment
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

logger.info(f"Auth middleware initialized - Clerk validation: {ENABLE_CLERK_VALIDATION}, Production: {IS_PRODUCTION}")

# Development token prefix for easier identification - only used in development
DEV_TOKEN_PREFIX = "dev_test_token_"

# Environment detection
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

# Force validation in production regardless of ENABLE_CLERK_VALIDATION setting
if IS_PRODUCTION:
    ENABLE_CLERK_...=***REMOVED***
    logger.info("Production environment detected: Forcing Clerk JWT validation")
else:
    logger.warning(
        f"Development environment detected: Clerk validation is {'enabled' if ENABLE_CLERK_VALIDATION else 'disabled'}"
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency to get the current authenticated user.

    When ENABLE_CLERK_VALIDATION is True, validates the JWT token using Clerk.
    When using a development token (starts with dev_test_token_), extracts user_id from the token.
    Otherwise, uses "testuser123" for development.

    Args:
        credentials: The HTTP Authorization credentials
        db: Database session

    Returns:
        User: The authenticated user

    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

    if not token:
        logger.warning("Authentication failed: Empty token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In production, always validate tokens with Clerk
    if IS_PRODUCTION:
        # Validate JWT token with Clerk
        is_valid, payload = clerk_service.validate_token(token)

        if not is_valid or not payload:
            logger.warning("Authentication failed: Invalid token in production environment")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract user ID from JWT claim
        user_id = payload.get("sub")

        if not user_id:
            logger.warning("Authentication failed: Token missing subject claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user identifier",
                headers={"WWW-Authenticate": "Bearer"},
            )
    # Handle development token case - only in development
    elif (
        token.startswith(DEV_TOKEN_PREFIX) or token == "DEV_TOKEN_REDACTED"
    ) and not ENABLE_CLERK_VALIDATION:
        # Extract user_id from the development token or use default
        if token == "DEV_TOKEN_REDACTED":
            user_id = "testuser123"
            logger.info(f"Development token used with default user_id: {user_id}")
        else:
            user_id = token[len(DEV_TOKEN_PREFIX) :]
            logger.info(f"Development token used with user_id: {user_id}")
    # IMPORTANT: Use email-based user ID for development if not using dev token
    elif not ENABLE_CLERK_VALIDATION:
        # For development, use email-based user ID (default to vitalijs@axwise.de)
        # This allows webhook to work properly with actual email addresses
        dev_email = "vitalijs@axwise.de"  # Default development email
        user_id = dev_email.replace("@", "_").replace(".", "_")
        logger.info(f"Development mode: Using email-based user_id: {user_id} for email: {dev_email}")
    else:
        # Validate JWT token with Clerk
        is_valid, payload = clerk_service.validate_token(token)

        if not is_valid or not payload:
            logger.warning("Authentication failed: Invalid token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract user ID from JWT claim
        user_id = payload.get("sub")

        if not user_id:
            logger.warning("Authentication failed: Token missing subject claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user identifier",
                headers={"WWW-Authenticate": "Bearer"},
            )

    logger.info(f"🔍 Authentication successful for user_id: {user_id}, ENABLE_CLERK_...=***REMOVED*** IS_PRODUCTION: {IS_PRODUCTION}")

    # Get or create user
    try:
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            # If using Clerk validation and we have a real JWT, try to get user info
            if ENABLE_CLERK_VALIDATION:
                user_info = clerk_service.get_user_info(user_id)

                # Create a new user record with Clerk data if available
                new_user = User(
                    user_id=user_id,
                    email=(
                        user_info.get("email_addresses", [{}])[0].get("email_address")
                        if user_info
                        else None
                    ),
                    first_name=user_info.get("first_name") if user_info else None,
                    last_name=user_info.get("last_name") if user_info else None,
                    usage_data={
                        "subscription": {
                            "tier": "free",
                            "status": "active"
                        },
                        "usage": {}
                    }
                )
            else:
                # For non-validated tokens, create a user record with proper email
                # Convert user_id back to email format if it's email-based
                if "_" in user_id and not user_id.startswith("testuser"):
                    # This is likely an email-based user_id, convert back to email
                    email = user_id.replace("_", "@", 1).replace("_", ".", 1)
                    first_name = email.split("@")[0].title()
                else:
                    # Fallback for other user IDs
                    email = f"{user_id}@example.com"
                    first_name = "Test"

                new_user = User(
                    user_id=user_id,
                    email=email,
                    first_name=first_name,
                    last_name="Dev",
                    usage_data={
                        "subscription": {
                            "tier": "free",
                            "status": "active"
                        },
                        "usage": {}
                    }
                )

            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            user = new_user
            logger.info(f"Created new user with ID: {user_id}")
    except Exception as e:
        # Handle database errors (like missing tables)
        logger.warning(f"Database error when getting/creating user: {str(e)}")
        # Create a temporary user object without database persistence
        user = User(
            user_id=user_id,
            email=f"{user_id}@example.com",
            first_name="Temporary",
            last_name="User",
            usage_data={
                "subscription": {
                    "tier": "free",
                    "status": "active"
                },
                "usage": {}
            }
        )
        logger.info(f"Created temporary user object: {user_id}")

    return user
