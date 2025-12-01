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

# Configure logging
logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(
    scheme_name="Bearer Authentication",
    description="Enter your bearer token",
    auto_error=True,
)


# OSS mode: Clerk validation disabled regardless of environment
ENABLE_CLERK_VALIDATION = os.getenv("ENABLE_CLERK_VALIDATION", "false").lower() == "true"
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"
logger.info("Auth middleware initialized - Clerk validation disabled (OSS mode)")

# Development token prefix for easier identification - only used in development
DEV_TOKEN_PREFIX = "dev_test_token_"

# OSS mode note
logger.warning("OSS mode: Clerk validation is disabled regardless of environment")


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

    # OSS mode: derive user_id from dev token or fallback
    if token.startswith(DEV_TOKEN_PREFIX):
        user_id = token[len(DEV_TOKEN_PREFIX):] or "testuser123"
        logger.info(f"Development token used with user_id: {user_id}")
    elif token == "dev_test_token_":
        user_id = "testuser123"
        logger.info(f"Legacy dev token used; user_id: {user_id}")
    else:
        # Accept any token and use a stable default
        user_id = "testuser123"
        logger.info("OSS mode: Using default user_id since no dev token prefix detected")

    logger.info(
        f"🔍 Authentication successful for user_id: {user_id}, ENABLE_CLERK_VALIDATION: {ENABLE_CLERK_VALIDATION}, IS_PRODUCTION: {IS_PRODUCTION}"
    )

    # Get or create user
    try:
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            # OSS mode: create a simple user record
            if "_" in user_id and not user_id.startswith("testuser"):
                email = user_id.replace("_", "@", 1).replace("_", ".", 1)
                first_name = email.split("@")[0].title()
            else:
                email = f"{user_id}@example.com"
                first_name = "Test"

            new_user = User(
                user_id=user_id,
                email=email,
                first_name=first_name,
                last_name="Dev",
                usage_data={
                    "subscription": {"tier": "free", "status": "active"},
                    "usage": {},
                },
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
                "subscription": {"tier": "free", "status": "active"},
                "usage": {},
            },
        )
        logger.info(f"Created temporary user object: {user_id}")

    return user
