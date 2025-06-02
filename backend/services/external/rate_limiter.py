"""
Rate limiting middleware for the FastAPI application.

This module provides rate limiting functionality for the FastAPI application using slowapi.
It implements both middleware-based rate limiting and decorator-based rate limiting.

Usage:
1. Middleware-based rate limiting (applied automatically):
   - All requests are rate-limited based on the endpoint path
   - Limits are defined in the ENDPOINT_LIMITS dictionary

2. Decorator-based rate limiting (applied manually):
   - Use the get_endpoint_limiter function to get a decorator for a specific endpoint
   - Example:
     @app.post("/api/data")
     @get_endpoint_limiter("/api/data")
     async def upload_data(...):
         ...

Last Updated: 2025-05-20
"""

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging
import os
from typing import Callable, Dict, Optional

# Configure logging
logger = logging.getLogger(__name__)

# Environment detection
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

# Rate limit settings
DEFAULT_RATE_LIMIT = "60/minute" if IS_PRODUCTION else "200/minute"
AUTH_RATE_LIMIT = "30/minute" if IS_PRODUCTION else "100/minute"
UPLOAD_RATE_LIMIT = "10/minute" if IS_PRODUCTION else "50/minute"
ANALYSIS_RATE_LIMIT = "5/minute" if IS_PRODUCTION else "20/minute"

def get_user_identifier(request: Request) -> str:
    """
    Get a unique identifier for the user making the request.

    In order of preference:
    1. User ID from authentication (most secure)
    2. Client IP address (fallback)

    Args:
        request: The FastAPI request object

    Returns:
        A string identifier for rate limiting
    """
    # Try to get user ID from request state (set by auth middleware)
    if hasattr(request.state, "user_id"):
        return f"user:{request.state.user_id}"

    # Fallback to IP address
    return f"ip:{get_remote_address(request)}"

# Create limiter instance
# Note: The parameter name is 'key_func' (without underscore) but the attribute is '_key_func' (with underscore)
limiter = Limiter(
    key_func=get_user_identifier,  # Use our custom key function
    default_limits=[DEFAULT_RATE_LIMIT],
    strategy="fixed-window",  # or "moving-window" for more accuracy but higher resource usage
)

# Verify that the key function is set correctly
if getattr(limiter, '_key_func', None) != get_user_identifier:
    logger.warning("Key function not set correctly during initialization, setting it manually")
    limiter._key_func = get_user_identifier

# Endpoint-specific rate limits
ENDPOINT_LIMITS: Dict[str, str] = {
    # Authentication endpoints
    "/api/auth/login": AUTH_RATE_LIMIT,
    "/api/auth/register": "5/minute",  # Stricter limit for registration

    # Data management endpoints
    "/api/data": UPLOAD_RATE_LIMIT,

    # Analysis endpoints
    "/api/analyze": ANALYSIS_RATE_LIMIT,
    "/api/generate-persona": ANALYSIS_RATE_LIMIT,

    # Results endpoints - less strict as these are read-only
    "/api/results": "30/minute",
    "/api/analyses": "30/minute",

    # Health check - very permissive
    "/health": "120/minute",
    "/api/health": "120/minute",

    # Customer research endpoints - more lenient limits for development
    "/api/research/chat": "100/minute" if not IS_PRODUCTION else "30/minute",
    "/api/research/generate-questions": "50/minute" if not IS_PRODUCTION else "20/minute",
}

def get_path_key(request: Request) -> str:
    """
    Get a normalized path for rate limiting.

    Removes path parameters to group similar endpoints.

    Args:
        request: The FastAPI request object

    Returns:
        A normalized path string
    """
    path = request.url.path

    # Normalize paths with IDs
    if path.startswith("/api/results/"):
        return "/api/results"
    if path.startswith("/api/analysis/"):
        return "/api/analysis"

    return path

def get_limit_for_endpoint(path: str) -> Optional[str]:
    """
    Get the rate limit for a specific endpoint.

    Args:
        path: The normalized API path

    Returns:
        Rate limit string or None to use default
    """
    return ENDPOINT_LIMITS.get(path)

def get_endpoint_limiter(endpoint_path: str):
    """
    Get a rate limiter decorator for a specific endpoint.

    This can be used as a decorator on FastAPI route handlers:

    @app.post("/api/data")
    @get_endpoint_limiter("/api/data")
    async def upload_data(...):
        ...

    Args:
        endpoint_path: The API endpoint path

    Returns:
        A decorator function that applies the appropriate rate limit
    """
    try:
        limit = get_limit_for_endpoint(endpoint_path) or DEFAULT_RATE_LIMIT
        logger.debug(f"Creating endpoint limiter for {endpoint_path} with limit {limit}")

        # Ensure the limiter has the correct key function
        if hasattr(limiter, '_key_func') and limiter._key_func != get_user_identifier:
            logger.warning("Updating limiter key function before creating endpoint limiter")
            limiter._key_func = get_user_identifier

        return limiter.limit(limit)
    except Exception as e:
        logger.error(f"Error creating endpoint limiter: {str(e)}")
        # Return a dummy decorator in case of error
        def dummy_decorator(func):
            return func
        return dummy_decorator

def configure_rate_limiter(app):
    """
    Configure the rate limiter for the FastAPI application.

    Args:
        app: The FastAPI application instance
    """
    try:
        # Register rate limiter with the app
        app.state.limiter = limiter

        # Ensure the limiter is using our custom key function
        # The slowapi Limiter class uses _key_func (with underscore) as the attribute name
        if getattr(limiter, '_key_func', None) != get_user_identifier:
            logger.info("Setting custom key function for rate limiter")
            limiter._key_func = get_user_identifier

        logger.info("Rate limiter configured successfully")
    except Exception as e:
        logger.error(f"Error configuring rate limiter: {str(e)}")
        # In development, we'll continue without rate limiting
        if not IS_PRODUCTION:
            logger.warning("Continuing without rate limiting in development mode")
        else:
            # In production, we'll re-raise the error
            raise

    # Add rate limit exceeded handler
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        """Handle rate limit exceeded exceptions"""
        logger.warning(f"Rate limit exceeded: {get_remote_address(request)} - {request.url.path}")
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded. Please try again later.",
                "type": "rate_limit_exceeded",
            },
            headers={"Retry-After": str(exc.retry_after)},
        )

    # Add middleware to apply endpoint-specific limits
    @app.middleware("http")
    async def endpoint_rate_limit_middleware(request: Request, call_next: Callable):
        """Apply endpoint-specific rate limits"""
        try:
            path = get_path_key(request)
            limit = get_limit_for_endpoint(path)

            if limit:
                try:
                    # Define a standalone function for rate limiting
                    # The function must be defined outside the middleware to avoid closure issues
                    # Check if the limiter has a parse method, otherwise use a different approach
                    if hasattr(limiter._limiter, 'parse'):
                        endpoint_limit = limiter._limiter.parse(limit)
                    else:
                        # Alternative approach if parse method is not available
                        logger.warning("Rate limiter does not have 'parse' method, using default limits")
                        # Use the default limiter configuration
                        try:
                            # Try to access default_limits attribute
                            if hasattr(limiter, 'default_limits') and limiter.default_limits:
                                endpoint_limit = limiter.default_limits[0]
                            else:
                                # Fall back to the constant if default_limits is not available
                                logger.warning("Limiter does not have 'default_limits' attribute, using DEFAULT_RATE_LIMIT")
                                endpoint_limit = DEFAULT_RATE_LIMIT
                        except Exception as limits_err:
                            logger.warning(f"Error accessing default limits: {limits_err}. Using DEFAULT_RATE_LIMIT")
                            endpoint_limit = DEFAULT_RATE_LIMIT

                    # Check if endpoint_limit is an object or a string
                    if isinstance(endpoint_limit, str):
                        # If it's a string, skip rate limiting in development
                        if not IS_PRODUCTION:
                            logger.debug(f"Skipping rate limiting for {path} in development mode")
                        else:
                            logger.warning(f"Rate limit '{endpoint_limit}' is a string, not an object. Skipping rate limiting for this request.")
                    else:
                        # Get the key function from the endpoint limit
                        # Try multiple attribute names and fall back to our custom function
                        key_func = None
                        for attr_name in ['_key_func', 'key_func']:
                            if hasattr(endpoint_limit, attr_name):
                                key_func = getattr(endpoint_limit, attr_name)
                                break

                        # If we still don't have a key function, use our custom one
                        if key_func is None:
                            key_func = get_user_identifier
                            logger.warning(f"No key function found in endpoint_limit, using custom function")

                        # Apply the rate limit
                        try:
                            limiter._check_request_limit(
                                endpoint_limit,
                                request,
                                key_func(request),
                                getattr(endpoint_limit, 'scope', None),
                                getattr(endpoint_limit, 'per_method', False),
                                False,
                            )
                        except AttributeError as attr_err:
                            logger.error(f"AttributeError in rate limiting: {attr_err}. Endpoint limit may not have required attributes.")
                            # In development, we'll let the request through
                            if IS_PRODUCTION:
                                raise
                    logger.debug(f"Rate limit applied: {limit} for path {path}")
                except Exception as e:
                    # Log the error but don't block the request
                    logger.error(f"Error applying rate limit: {str(e)}")
                    # In production, you might want to still enforce rate limits
                    if IS_PRODUCTION:
                        raise
                    # In development, we'll let the request through
        except Exception as outer_e:
            # Catch any other errors in the middleware
            logger.error(f"Unexpected error in rate limiting middleware: {str(outer_e)}")
            if IS_PRODUCTION:
                raise

        # Continue processing the request
        response = await call_next(request)
        return response
