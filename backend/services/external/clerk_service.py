"""
Service for interacting with the Clerk API.
"""

from typing import Dict, Any
import os
import logging
import requests
from functools import wraps
from fastapi import HTTPException, Request

# Configure logging
logger = logging.getLogger(__name__)

class ClerkService:
    def __init__(self):
        """
        Initializes the ClerkService.  TEMPORARILY HARDCODING KEYS FOR TESTING.
        """
        # TEMPORARY - DO NOT COMMIT THESE KEYS!  FOR LOCAL TESTING ONLY!
        self.publishable_key = "pk_REDACTED"
        self.REDACTED_SECRET_KEY = "sk_REDACTED"
        
        logger.warning("Clerk keys are HARDCODED.  This is for local testing ONLY.")
        
        # Use a more plausible endpoint URL based on common API patterns
        self.clerk_verify_url = "https://api.clerk.com/v1/sessions/verify"

    def authenticate_request(self, request: Request) -> Dict[str, Any]:
        """
        Authenticates a request using Clerk.

        Args:
            request: The incoming FastAPI request.

        Returns:
            User information if authentication is successful.

        Raises:
            HTTPException: If authentication fails.
        """
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            logger.warning("Authorization header missing.")
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            token_type, token = auth_header.split(" ", 1)
            if token_type.lower() != "bearer":
                logger.warning(f"Invalid token type: {token_type}")
                raise HTTPException(status_code=401, detail="Invalid token type")

            if not token:
                logger.warning("Token is empty.")
                raise HTTPException(status_code=401, detail="Invalid token")

            # Implement token verification with Clerk's API
            response = requests.post(
                self.clerk_verify_url,
                headers={"Authorization": f"Bearer {self.REDACTED_SECRET_KEY}"},
                json={"token": token},
            )

            if response.status_code == 200:
                data = response.json()
                user_info = {
                    "user_id": data.get("user_id"),
                    "email": data.get("email"),
                }
                if not user_info["user_id"] or not user_info["email"]:
                    logger.warning("Clerk API response is missing user_id or email.")
                    raise HTTPException(status_code=500, detail="Incomplete user information from Clerk API.")
                return user_info

            # Handle different potential error codes from Clerk
            elif response.status_code == 400:
                logger.warning(f"Clerk API returned 400 Bad Request: {response.text}")
                raise HTTPException(status_code=400, detail="Bad request to Clerk API")
            elif response.status_code == 401:
                logger.warning(f"Clerk token verification failed (401 Unauthorized): {response.text}")
                raise HTTPException(status_code=401, detail="Invalid Clerk token")
            elif response.status_code == 403:
                logger.warning(f"Clerk API returned 403 Forbidden: {response.text}")
                raise HTTPException(status_code=403, detail="Forbidden: Check Clerk API key permissions")
            elif response.status_code == 404:
                logger.warning(f"Clerk API endpoint not found (404): {response.text}")
                raise HTTPException(status_code=404, detail="Clerk API endpoint not found")
            else:
                logger.error(f"Clerk API error: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail=f"Clerk API error: {response.status_code}")

        except ValueError:
            logger.warning("Invalid authorization header format.")
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        except requests.RequestException as e:
            logger.error(f"Error communicating with Clerk API: {e}")
            raise HTTPException(status_code=500, detail="Error communicating with Clerk API")

    def require_auth(self, func):
        """
        Decorator for FastAPI endpoints to require authentication.
        """
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            user_info = self.authenticate_request(request)
            kwargs['user_info'] = user_info  # Add user_info to kwargs
            return await func(request, *args, **kwargs)
        return wrapper