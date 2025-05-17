"""
Exception types for LLM services.

This module defines specialized exception types for different categories of errors
that can occur when interacting with LLM services.
"""

from typing import Optional, Dict, Any


class LLMServiceError(Exception):
    """Base exception for all LLM service errors."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        """
        Initialize the exception.

        Args:
            message: Error message
            details: Additional error details
        """
        self.message = message
        self.details = details or {}
        super().__init__(message)


class LLMAPIError(LLMServiceError):
    """Exception raised when there's an error calling the LLM API."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            status_code: HTTP status code if applicable
            response: Raw API response if available
            details: Additional error details
        """
        self.status_code = status_code
        self.response = response
        super().__init__(message, details)


class LLMResponseParseError(LLMServiceError):
    """Exception raised when there's an error parsing the LLM response."""

    def __init__(
        self,
        message: str,
        response_text: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            response_text: Raw response text if available
            details: Additional error details
        """
        self.response_text = response_text
        super().__init__(message, details)


class LLMProcessingError(LLMServiceError):
    """Exception raised when there's an error processing the LLM request or response."""

    def __init__(
        self,
        message: str,
        task: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            task: Task being processed when the error occurred
            details: Additional error details
        """
        self.task = task
        super().__init__(message, details)


class LLMConfigurationError(LLMServiceError):
    """Exception raised when there's an error in the LLM configuration."""

    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            config_key: Configuration key that caused the error
            details: Additional error details
        """
        self.config_key = config_key
        super().__init__(message, details)


class LLMRateLimitError(LLMAPIError):
    """Exception raised when the LLM API rate limit is exceeded."""

    def __init__(
        self,
        message: str,
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            retry_after: Seconds to wait before retrying
            details: Additional error details
        """
        self.retry_after = retry_after
        super().__init__(message, status_code=429, details=details)


class LLMAuthenticationError(LLMAPIError):
    """Exception raised when there's an authentication error with the LLM API."""

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message, status_code=401, details=details)


class LLMTimeoutError(LLMAPIError):
    """Exception raised when the LLM API request times out."""

    def __init__(
        self,
        message: str,
        timeout: Optional[float] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the exception.

        Args:
            message: Error message
            timeout: Timeout value in seconds
            details: Additional error details
        """
        self.timeout = timeout
        super().__init__(message, status_code=408, details=details)
