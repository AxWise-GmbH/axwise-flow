"""
Authentication middleware for the FastAPI application.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging

from backend.database import get_db
from backend.models import User

# Configure logging
logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(
    scheme_name="Bearer Authentication",
    description="Enter your bearer token",
    auto_error=True
)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user.
    
    For Phase 1/2, this is a simplified implementation that accepts any non-empty token
    and creates a user record if one doesn't exist.
    
    In production, this would validate a JWT token and look up the user in the database.
    """
    token = credentials.credentials
    
    if not token:
        logger.warning("Authentication failed: Empty token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # For Phase 1/2, use the token as the user_id
    # In production, this would decode a JWT and extract the user_id
    user_id = token
    
    # Get or create user
    user = db.query(User).filter(User.user_id == user_id).first()
    
    if not user:
        # Create a new user record
        user = User(user_id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Created new user with ID: {user_id}")
    
    return user