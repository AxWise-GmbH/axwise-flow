"""
Research Error Handling Utilities
Provides robust error handling and retry logic for customer research operations.
"""

import asyncio
import logging
import time
from typing import Any, Callable, Dict, Optional, Tuple, TypeVar, Union
from functools import wraps
from backend.config.research_config import RESEARCH_CONFIG, ERROR_CONFIG

logger = logging.getLogger(__name__)

T = TypeVar('T')

class ResearchError(Exception):
    """Base exception for research-related errors"""
    def __init__(self, message: str, error_code: str = "research_error", retry_after: Optional[int] = None):
        self.message = message
        self.error_code = error_code
        self.retry_after = retry_after
        super().__init__(self.message)

class APITimeoutError(ResearchError):
    """Exception for API timeout errors"""
    def __init__(self, message: str = None):
        super().__init__(
            message or ERROR_CONFIG.ERROR_MESSAGES["api_timeout"],
            "api_timeout",
            retry_after=5
        )

class APIError(ResearchError):
    """Exception for general API errors"""
    def __init__(self, message: str = None):
        super().__init__(
            message or ERROR_CONFIG.ERROR_MESSAGES["api_error"],
            "api_error",
            retry_after=3
        )

class RateLimitError(ResearchError):
    """Exception for rate limiting errors"""
    def __init__(self, message: str = None, retry_after: int = 60):
        super().__init__(
            message or ERROR_CONFIG.ERROR_MESSAGES["rate_limit"],
            "rate_limit",
            retry_after=retry_after
        )

class ServiceUnavailableError(ResearchError):
    """Exception for service unavailable errors"""
    def __init__(self, message: str = None):
        super().__init__(
            message or ERROR_CONFIG.ERROR_MESSAGES["service_unavailable"],
            "service_unavailable",
            retry_after=30
        )

class ErrorHandler:
    """Centralized error handling for research operations"""
    
    @staticmethod
    def get_fallback_response(stage: str = "general") -> str:
        """Get a fallback response for the given stage"""
        return ERROR_CONFIG.FALLBACK_RESPONSES.get(stage, ERROR_CONFIG.FALLBACK_RESPONSES["general"])
    
    @staticmethod
    def handle_llm_error(error: Exception, context: Dict[str, Any] = None) -> Tuple[str, str]:
        """
        Handle LLM service errors and return appropriate response
        
        Args:
            error: The exception that occurred
            context: Additional context about the error
            
        Returns:
            Tuple of (response_message, error_code)
        """
        context = context or {}
        stage = context.get('stage', 'general')
        
        if isinstance(error, asyncio.TimeoutError):
            logger.warning(f"LLM timeout error: {error}")
            return ERROR_CONFIG.ERROR_MESSAGES["api_timeout"], "api_timeout"
        
        elif "rate limit" in str(error).lower():
            logger.warning(f"LLM rate limit error: {error}")
            return ERROR_CONFIG.ERROR_MESSAGES["rate_limit"], "rate_limit"
        
        elif "service unavailable" in str(error).lower() or "503" in str(error):
            logger.error(f"LLM service unavailable: {error}")
            return ERROR_CONFIG.ERROR_MESSAGES["service_unavailable"], "service_unavailable"
        
        else:
            logger.error(f"LLM general error: {error}")
            # Return a fallback response based on conversation stage
            fallback = ErrorHandler.get_fallback_response(stage)
            return fallback, "api_error"
    
    @staticmethod
    def handle_validation_error(error: Exception) -> Tuple[str, str]:
        """Handle validation errors"""
        logger.warning(f"Validation error: {error}")
        return ERROR_CONFIG.ERROR_MESSAGES["validation_error"], "validation_error"
    
    @staticmethod
    def handle_session_error(error: Exception) -> Tuple[str, str]:
        """Handle session-related errors"""
        logger.warning(f"Session error: {error}")
        return ERROR_CONFIG.ERROR_MESSAGES["session_expired"], "session_expired"

def with_retry(
    max_retries: int = None,
    delay: float = None,
    exponential_backoff: bool = None,
    exceptions: Tuple[Exception, ...] = (Exception,)
):
    """
    Decorator to add retry logic to functions
    
    Args:
        max_retries: Maximum number of retries (defaults to config)
        delay: Initial delay between retries (defaults to config)
        exponential_backoff: Whether to use exponential backoff (defaults to config)
        exceptions: Tuple of exceptions to retry on
    """
    if max_retries is None:
        max_retries = RESEARCH_CONFIG.MAX_RETRIES
    if delay is None:
        delay = RESEARCH_CONFIG.RETRY_DELAY_SECONDS
    if exponential_backoff is None:
        exponential_backoff = ERROR_CONFIG.EXPONENTIAL_BACKOFF
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            last_exception = None
            current_delay = delay
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(f"Function {func.__name__} failed after {max_retries} retries: {e}")
                        raise e
                    
                    logger.warning(f"Function {func.__name__} failed (attempt {attempt + 1}/{max_retries + 1}): {e}")
                    
                    if current_delay > 0:
                        await asyncio.sleep(current_delay)
                    
                    if exponential_backoff:
                        current_delay = min(current_delay * 2, ERROR_CONFIG.MAX_BACKOFF_SECONDS)
            
            # This should never be reached, but just in case
            raise last_exception
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            last_exception = None
            current_delay = delay
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(f"Function {func.__name__} failed after {max_retries} retries: {e}")
                        raise e
                    
                    logger.warning(f"Function {func.__name__} failed (attempt {attempt + 1}/{max_retries + 1}): {e}")
                    
                    if current_delay > 0:
                        time.sleep(current_delay)
                    
                    if exponential_backoff:
                        current_delay = min(current_delay * 2, ERROR_CONFIG.MAX_BACKOFF_SECONDS)
            
            # This should never be reached, but just in case
            raise last_exception
        
        # Return appropriate wrapper based on whether function is async
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

def with_timeout(timeout_seconds: int = None):
    """
    Decorator to add timeout to async functions
    
    Args:
        timeout_seconds: Timeout in seconds (defaults to config)
    """
    if timeout_seconds is None:
        timeout_seconds = RESEARCH_CONFIG.REQUEST_TIMEOUT_SECONDS
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                logger.error(f"Function {func.__name__} timed out after {timeout_seconds} seconds")
                raise APITimeoutError()
        
        return wrapper
    
    return decorator

def safe_execute(func: Callable[..., T], *args, fallback_value: T = None, **kwargs) -> T:
    """
    Safely execute a function with error handling
    
    Args:
        func: Function to execute
        *args: Arguments for the function
        fallback_value: Value to return if function fails
        **kwargs: Keyword arguments for the function
        
    Returns:
        Function result or fallback value
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        logger.error(f"Safe execution failed for {func.__name__}: {e}")
        return fallback_value
