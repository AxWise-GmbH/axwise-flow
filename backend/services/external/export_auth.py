"""
Authentication utilities for export routes.
"""

from fastapi import Depends, HTTPException, status, Request, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging
import os
from typing import Optional

from backend.database import get_db
from backend.models import User
from backend.services.external.auth_middleware import get_current_user

# Configure logging
logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(
    scheme_name="Bearer Authentication",
    description="Enter your bearer token",
    auto_error=False,  # Don't auto-error to allow form-based auth
)


async def get_export_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    auth_token: Optional[str] = Form(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Authentication for export routes that can handle both Bearer tokens and form data.

    Args:
        request: The FastAPI request
        credentials: The HTTP Authorization credentials (optional)
        auth_token: Auth token from form data (optional)
        db: Database session

    Returns:
        User: The authenticated user

    Raises:
        HTTPException: If authentication fails
    """
    # Try to get token from Authorization header first
    token = credentials.credentials if credentials else None

    # If no token in header, try to get from form data
    if not token and auth_token:
        token = auth_token

    # If still no token, try to get from query parameters
    if not token:
        token = request.query_params.get("auth_token")

    # For development, use a default token if none provided
    if not token and os.getenv("ENABLE_CLERK_VALIDATION", "false").lower() != "true":
        token = "DEV_TOKEN_REDACTED"  # This matches the token used in apiClient.ts

    if not token:
        logger.warning("Export authentication failed: No token provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create fake credentials to pass to get_current_user
    fake_credentials = type("obj", (object,), {"credentials": token})

    try:
        # Use the standard authentication function
        return await get_current_user(credentials=fake_credentials, db=db)
    except HTTPException as e:
        logger.warning(f"Export authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
