"""
Input validation and sanitization middleware for the FastAPI application.

Last Updated: 2025-05-20
"""

from fastapi import Request, Response
from fastapi.responses import JSONResponse
import logging
import re
import json
from typing import Callable, Dict, Any, Optional, List, Union
import html

# Configure logging
logger = logging.getLogger(__name__)

# Common validation patterns
PATTERNS = {
    "email": re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
    "alphanumeric": re.compile(r"^[a-zA-Z0-9_-]+$"),
    "numeric": re.compile(r"^[0-9]+$"),
    "uuid": re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    ),
}

# SQL Injection patterns to detect
SQL_INJECTION_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|UNION|CREATE|WHERE)\b)",
    r"(--.*$)",
    r"(\/\*.*\*\/)",
    r"(;.*$)",
]

# XSS attack patterns to detect
XSS_PATTERNS = [
    r"(<script.*?>)",
    r"(javascript:)",
    r"(onerror=)",
    r"(onload=)",
    r"(eval\()",
    r"(document\.cookie)",
]


def sanitize_string(value: str) -> str:
    """
    Sanitize a string value to prevent XSS attacks.

    Args:
        value: The string to sanitize

    Returns:
        Sanitized string
    """
    if not isinstance(value, str):
        return value

    # HTML escape the string
    return html.escape(value)


def sanitize_json_data(data: Any) -> Any:
    """
    Recursively sanitize all string values in a JSON-like data structure.

    Args:
        data: The data to sanitize (dict, list, or primitive)

    Returns:
        Sanitized data structure
    """
    if isinstance(data, dict):
        return {k: sanitize_json_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_json_data(item) for item in data]
    elif isinstance(data, str):
        return sanitize_string(data)
    else:
        return data


def detect_sql_injection(value: str) -> bool:
    """
    Detect potential SQL injection patterns in a string.

    Args:
        value: The string to check

    Returns:
        True if SQL injection is detected, False otherwise
    """
    if not isinstance(value, str):
        return False

    # Check for SQL injection patterns
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            return True

    return False


def detect_xss(value: str) -> bool:
    """
    Detect potential XSS attack patterns in a string.

    Args:
        value: The string to check

    Returns:
        True if XSS is detected, False otherwise
    """
    if not isinstance(value, str):
        return False

    # Check for XSS patterns
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            return True

    return False


def validate_request_data(request_data: Dict[str, Any]) -> List[str]:
    """
    Validate request data for security issues.

    Args:
        request_data: The request data to validate

    Returns:
        List of validation error messages (empty if no issues)
    """
    errors = []

    # Recursively check all string values
    def check_values(data, path=""):
        if isinstance(data, dict):
            for key, value in data.items():
                new_path = f"{path}.{key}" if path else key
                check_values(value, new_path)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                new_path = f"{path}[{i}]"
                check_values(item, new_path)
        elif isinstance(data, str):
            # Check for SQL injection
            if detect_sql_injection(data):
                errors.append(f"Potential SQL injection detected in {path}")

            # Check for XSS
            if detect_xss(data):
                errors.append(f"Potential XSS attack detected in {path}")

    check_values(request_data)
    return errors


async def parse_request_body(request: Request) -> Optional[Dict[str, Any]]:
    """
    Parse and validate the request body.

    Args:
        request: The FastAPI request object

    Returns:
        Parsed request body or None if invalid
    """
    content_type = request.headers.get("content-type", "")

    try:
        if "application/json" in content_type:
            body = await request.json()
            return body
        elif "application/x-www-form-urlencoded" in content_type:
            form_data = await request.form()
            return {key: value for key, value in form_data.items()}
        elif "multipart/form-data" in content_type:
            # For multipart/form-data, we completely bypass validation
            # File uploads are handled directly by the route handler
            logger.info("Bypassing input validation for multipart/form-data request")
            return {}
        else:
            # For other content types, try to read as text
            body_text = await request.body()
            if body_text:
                try:
                    return json.loads(body_text)
                except json.JSONDecodeError:
                    return {"raw_body": body_text.decode("utf-8", errors="replace")}
            return {}
    except Exception as e:
        logger.error(f"Error parsing request body: {str(e)}")
        return None


def configure_input_validation(app):
    """
    Configure input validation middleware for the FastAPI application.

    Args:
        app: The FastAPI application instance
    """

    @app.middleware("http")
    async def input_validation_middleware(request: Request, call_next: Callable):
        """Validate and sanitize input data"""
        # Skip validation for certain paths
        path = request.url.path
        if (
            path.startswith(("/docs", "/redoc", "/openapi.json", "/static"))
            or path == "/api/data"
            or path.startswith("/api/research")
            or path.startswith("/api/debug")
            or path.startswith("/api/axpersona")
        ):  # Skip validation for research, debug, and AxPersona endpoints
            logger.info(f"Skipping input validation for path: {path}")
            return await call_next(request)

        # Only validate POST, PUT, PATCH requests
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        # Parse request body
        request_data = await parse_request_body(request)

        if request_data:
            # Validate request data
            validation_errors = validate_request_data(request_data)

            if validation_errors:
                logger.warning(f"Input validation failed: {validation_errors}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "detail": "Invalid input data",
                        "errors": validation_errors,
                    },
                )

            # Store sanitized data in request state for handlers to use
            sanitized_data = sanitize_json_data(request_data)
            request.state.sanitized_data = sanitized_data

        # Continue processing the request
        return await call_next(request)
