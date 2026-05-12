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


ENABLE_CLERK_VALIDATION = os.getenv("ENABLE_CLERK_VALIDATION", "false").lower() == "true"
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"
logger.info(f"Auth middleware initialized - Clerk validation: {ENABLE_CLERK_VALIDATION}")

# Development token prefix for easier identification - only used in development
DEV_TOKEN_PREFIX = "dev_test_token_"


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
    from backend.services.external.clerk_service import ClerkService
    
    token = credentials.credentials

    if not token:
        logger.warning("Authentication failed: Empty token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In production with Clerk enabled, strictly validate the token
    if ENABLE_CLERK_VALIDATION:
        logger.info("Verifying token with ClerkService...")
        clerk_service = ClerkService()
        is_valid, token_data = clerk_service.validate_token(token)

        if not is_valid or not token_data or "sub" not in token_data:
            logger.error("Authentication failed: Invalid Clerk token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = token_data["sub"]
        logger.info(f"Clerk verification successful. User ID: {user_id}")
    else:
        # Development mode logic
        if token.startswith(DEV_TOKEN_PREFIX):
            user_id = token[len(DEV_TOKEN_PREFIX):] or "testuser123"
            logger.info(f"Development token used with user_id: {user_id}")
        elif token == "DEV_TOKEN_REDACTED":
            user_id = "testuser123"
            logger.info(f"Legacy dev token used; user_id: {user_id}")
        else:
            user_id = "testuser123"
            logger.info("Using default user_id since Clerk is disabled")

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
