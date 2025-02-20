"""
Authentication middleware and dependencies for the FastAPI application.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import logging
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize security scheme
security = HTTPBearer(
    scheme_name="Bearer",
    description="Enter your bearer token",
    auto_error=True
)

class AuthError(Exception):
    """Custom exception for authentication errors."""
    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

class AuthService:
    """
    Service for handling authentication.
    For Phase 1/2, this implements a simple bearer token authentication
    where any non-empty token is accepted and used as the user_id.
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    async def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
    ) -> Optional[User]:
        """
        Validate the auth token and return the current user.
        For testing purposes, this will create a user if they don't exist.

        Args:
            credentials: The bearer token credentials from the request
            db: Database session

        Returns:
            User: The authenticated user object

        Raises:
            HTTPException: If authentication fails
        """
        try:
            # Extract token
            token = credentials.credentials
            
            # Basic validation
            if not token or token.isspace():
                raise AuthError("Invalid authentication token")

            # Use token as user_id for testing
            user_id = token

            # Get or create user in database
            user = db.query(User).filter(User.user_id == user_id).first()
            if not user:
                # For testing purposes, create a new user if they don't exist
                user = User(
                    user_id=user_id,
                    email=f"{user_id}@example.com"  # Generate a dummy email
                )
                db.add(user)
                try:
                    db.commit()
                    self.logger.info(f"Created new user with ID: {user_id}")
                except Exception as db_error:
                    db.rollback()
                    self.logger.error(f"Database error creating user: {str(db_error)}")
                    raise AuthError(
                        "Error creating user record",
                        status_code=500
                    )

            return user

        except AuthError as ae:
            raise HTTPException(
                status_code=ae.status_code,
                detail=ae.message,
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            self.logger.error(f"Authentication error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

# Singleton instance
auth_service = AuthService()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency that returns the current authenticated user.
    Use this as a dependency in protected routes.

    Args:
        credentials: The bearer token credentials from the request
        db: Database session

    Returns:
        User: The authenticated user object

    Raises:
        HTTPException: If authentication fails
    """
    return await auth_service.get_current_user(credentials, db)