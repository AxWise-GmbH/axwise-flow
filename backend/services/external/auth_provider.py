"""
Defines interfaces and implementations for authentication providers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any
from fastapi import Request, HTTPException
import os
import requests
import logging
import streamlit as st

# Configure logging
logger = logging.getLogger(__name__)

class AuthProvider(ABC):
    """
    Abstract base class for authentication providers.
    """
    @abstractmethod
    async def authenticate(self, request: Request) -> Dict[str, Any]:
        """
        Authenticates the request and returns user information.

        Args:
            request: The incoming FastAPI request.

        Returns:
            User information if authentication is successful.

        Raises:
            HTTPException: If authentication fails.
        """
        pass


class ClerkAuthProvider(AuthProvider):
    """
    Implementation of AuthProvider for Clerk.
    """
    def __init__(self):
        # Load Clerk keys from Streamlit REDACTED_SECRETs first, then environment variables
        self.publishable_key = st.REDACTED_SECRETs.get("CLERK_PUBLISHABLE_KEY") or os.environ.get("CLERK_PUBLISHABLE_KEY")
        self.REDACTED_SECRET_KEY = st.REDACTED_SECRETs.get("REDACTED_CLERK_KEY") or os.environ.get("REDACTED_CLERK_KEY")

        if not self.publishable_key or not self.REDACTED_SECRET_KEY:
            logger.error("Clerk keys not found in environment variables or Streamlit REDACTED_SECRETs.")
            raise HTTPException(status_code=500, detail="Clerk authentication not configured.")

        # Use a more plausible endpoint URL based on common API patterns.
        # This is still a placeholder and needs to be verified with the Clerk documentation.
        self.clerk_verify_url = "https://api.clerk.com/v1/sessions/verify"


    async def authenticate(self, request: Request) -> Dict[str, Any]:
        """
        Authenticates the request using Clerk.

        Args:
            request: The incoming FastAPI request.

        Returns:
            User information if authentication is successful.

        Raises:
            HTTPException: If authentication fails.
        """
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            token_type, token = auth_header.split(" ", 1)
            if token_type.lower() != "bearer":
                raise HTTPException(status_code=401, detail="Invalid token type")

            if not token:
                raise HTTPException(status_code=401, detail="Invalid token")

            # Implement token verification with Clerk's API
            response = requests.post(
                self.clerk_verify_url,
                headers={"Authorization": f"Bearer {self.REDACTED_SECRET_KEY}"},
                json={"token": token},
            )

            if response.status_code == 200:
                # Assume the Clerk API returns user information in JSON format.
                # This needs to be verified and adjusted based on the actual Clerk API response.
                data = response.json()
                # Placeholder: Assuming Clerk returns user_id and email.  This MUST be verified.
                user_info = {
                    "user_id": data.get("user_id"),  # Use .get() to handle missing keys safely
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
                raise HTTPException(status_code=404, detail="Clerk API endpoint not found")  # Might indicate incorrect URL
            else:
                logger.error(f"Clerk API error: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail=f"Clerk API error: {response.status_code}")

        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        except requests.RequestException as e:
            logger.error(f"Error communicating with Clerk API: {e}")
            raise HTTPException(status_code=500, detail="Error communicating with Clerk API")