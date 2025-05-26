"""
Clerk authentication service for validating JWTs and authenticating users.
"""

import logging
import os
import json
import time
from typing import Dict, Any, Optional, Tuple
import requests
from jose import jwt, JWTError
from jose.backends import RSAKey
from jose.constants import ALGORITHMS

# Configure logging
logger = logging.getLogger(__name__)

class ClerkService:
    """Service for validating Clerk JWTs and managing user authentication."""

    def __init__(self):
        """Initialize the Clerk service."""
        # Use environment-specific JWKS URL (dev: distinct-rattler-76, prod: clerk.axwise.de)
        self.jwks_url = os.getenv("CLERK_JWKS_URL", "https://distinct-rattler-76.clerk.accounts.dev/.well-known/jwks.json")
        self.CLERK_...=***REMOVED***"CLERK_API_URL", "https://api.clerk.com")
        self.CLERK_...=***REMOVED***"CLERK_SECRET_KEY", "")
        self.jwks = None
        self.jwks_last_updated = 0
        self.jwks_cache_ttl = 3600  # 1 hour in seconds

        # Validate configuration
        if not self.clerk_secret:
            logger.warning("CLERK_SECRET_KEY not configured - authentication will fail in production")

        logger.info(f"Clerk service initialized with JWKS URL: {self.jwks_url}")

        # Load JWKS on initialization
        self._load_jwks()

    def _load_jwks(self) -> None:
        """Load the JSON Web Key Set (JWKS) from Clerk."""
        try:
            logger.info(f"Loading JWKS from {self.jwks_url}")
            response = requests.get(self.jwks_url)
            response.raise_for_status()
            self.jwks = response.json()
            self.jwks_last_updated = time.time()
            logger.info("JWKS loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load JWKS: {str(e)}")
            raise

    def _refresh_jwks_if_needed(self) -> None:
        """Refresh the JWKS if it's older than the cache TTL."""
        if time.time() - self.jwks_last_updated > self.jwks_cache_ttl:
            self._load_jwks()

    def _get_key_from_jwks(self, kid: str) -> Optional[RSAKey]:
        """Get the key with the matching key ID from the JWKS."""
        self._refresh_jwks_if_needed()

        if not self.jwks or 'keys' not in self.jwks:
            logger.error("JWKS is not properly loaded")
            return None

        for key in self.jwks['keys']:
            if key.get('kid') == kid:
                try:
                    # Convert JWK to RSA key
                    rsa_key = RSAKey(key, ALGORITHMS.RS256)
                    # Return the RSA key object directly for jose.jwt.decode
                    return rsa_key
                except Exception as e:
                    logger.error(f"Error converting JWK to RSA key: {str(e)}")
                    return None

        logger.error(f"Key with ID {kid} not found in JWKS")
        return None

    def validate_token(self, token: str) -> Tuple[bool, Optional[Dict[Any, Any]]]:
        """
        Validate a JWT token and return the decoded payload if valid.

        Args:
            token: JWT token string

        Returns:
            Tuple containing:
                - Boolean indicating if the token is valid
                - Dictionary containing the decoded payload if valid, None otherwise
        """
        try:
            # Get the unverified headers to extract the key ID
            headers = jwt.get_unverified_header(token)
            kid = headers.get('kid')

            if not kid:
                logger.error("No key ID found in token header")
                return False, None

            # Get the key from JWKS
            key = self._get_key_from_jwks(kid)
            if not key:
                return False, None

            # Verify the token
            payload = jwt.decode(
                token,
                key,
                algorithms=[ALGORITHMS.RS256],
                options={"verify_aud": False}  # Skipping audience verification for now
            )

            # Verify expiration
            if 'exp' in payload and payload['exp'] < time.time():
                logger.error("Token has expired")
                return False, None

            return True, payload

        except JWTError as e:
            logger.error(f"JWT validation error: {str(e)}")
            return False, None
        except Exception as e:
            logger.error(f"Unexpected error during token validation: {str(e)}")
            return False, None

    def get_user_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user information from Clerk API.

        Args:
            user_id: Clerk user ID

        Returns:
            Dictionary with user information or None if not found
        """
        if not self.clerk_secret:
            logger.error("Clerk secret key not configured")
            return None

        try:
            headers = {
                "Authorization": f"Bearer {self.clerk_secret}",
                "Content-Type": "application/json"
            }

            url = f"{self.clerk_api_url}/v1/users/{user_id}"
            response = requests.get(url, headers=headers)
            response.raise_for_status()

            return response.json()

        except Exception as e:
            logger.error(f"Error fetching user info: {str(e)}")
            return None

    async def update_user_metadata(self, user_id: str, metadata: Dict[str, Any]) -> bool:
        """
        Update a user's metadata in Clerk.

        Args:
            user_id: The Clerk user ID
            metadata: The metadata to update (e.g., {"publicMetadata": {"subscription": {"status": "active"}}})

        Returns:
            bool: True if successful, False otherwise
        """
        if not self.clerk_secret:
            logger.error("Cannot update user metadata: CLERK_SECRET_KEY not configured")
            return False

        try:
            headers = {
                "Authorization": f"Bearer {self.clerk_secret}",
                "Content-Type": "application/json"
            }

            url = f"{self.clerk_api_url}/v1/users/{user_id}"
            response = requests.patch(url, headers=headers, json=metadata)

            if response.status_code != 200:
                logger.error(f"Error updating Clerk metadata: {response.status_code} {response.text}")
                return False

            logger.info(f"Updated metadata for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error updating Clerk metadata: {str(e)}")
            return False
