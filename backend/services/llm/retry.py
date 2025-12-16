"""
Shared retry logic for LLM services.

This module provides retry decorators and utilities that can be used
across all LLM providers for consistent error handling and retry behavior.
"""

import asyncio
import functools
import logging
import random
from dataclasses import dataclass
from typing import Callable, Optional, Tuple, Type, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,)
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for a given attempt number."""
        delay = min(
            self.base_delay * (self.exponential_base ** attempt),
            self.max_delay
        )
        if self.jitter:
            delay = delay * (0.5 + random.random())
        return delay


# Default retry configurations for different scenarios
CONSERVATIVE_RETRY_CONFIG = RetryConfig(
    max_retries=2,
    base_delay=2.0,
    max_delay=30.0,
)

AGGRESSIVE_RETRY_CONFIG = RetryConfig(
    max_retries=5,
    base_delay=0.5,
    max_delay=60.0,
)

DEFAULT_RETRY_CONFIG = RetryConfig()


def get_conservative_retry_config() -> RetryConfig:
    """Get conservative retry configuration."""
    return CONSERVATIVE_RETRY_CONFIG


def get_aggressive_retry_config() -> RetryConfig:
    """Get aggressive retry configuration."""
    return AGGRESSIVE_RETRY_CONFIG


def with_retry(
    config: Optional[RetryConfig] = None,
    retryable_exceptions: Optional[Tuple[Type[Exception], ...]] = None,
):
    """
    Decorator that adds retry logic to async functions.
    
    Args:
        config: Retry configuration (uses DEFAULT_RETRY_CONFIG if None)
        retryable_exceptions: Override exceptions to retry on
        
    Returns:
        Decorated function with retry logic
    """
    retry_config = config or DEFAULT_RETRY_CONFIG
    exceptions = retryable_exceptions or retry_config.retryable_exceptions
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(retry_config.max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt < retry_config.max_retries:
                        delay = retry_config.get_delay(attempt)
                        logger.warning(
                            f"Attempt {attempt + 1}/{retry_config.max_retries + 1} "
                            f"failed for {func.__name__}: {e}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.error(
                            f"All {retry_config.max_retries + 1} attempts failed "
                            f"for {func.__name__}: {e}"
                        )
            
            raise last_exception
        
        return wrapper
    
    return decorator


async def retry_async(
    func: Callable[..., T],
    *args,
    config: Optional[RetryConfig] = None,
    **kwargs
) -> T:
    """
    Execute an async function with retry logic.
    
    Args:
        func: Async function to execute
        *args: Positional arguments for the function
        config: Retry configuration
        **kwargs: Keyword arguments for the function
        
    Returns:
        Result of the function
    """
    retry_config = config or DEFAULT_RETRY_CONFIG
    
    @with_retry(config=retry_config)
    async def _execute():
        return await func(*args, **kwargs)
    
    return await _execute()


def is_rate_limit_error(error: Exception) -> bool:
    """Check if an error is a rate limit error."""
    error_str = str(error).lower()
    return any(indicator in error_str for indicator in [
        "rate limit",
        "rate_limit",
        "429",
        "too many requests",
        "quota exceeded",
    ])


def is_transient_error(error: Exception) -> bool:
    """Check if an error is transient and should be retried."""
    error_str = str(error).lower()
    return any(indicator in error_str for indicator in [
        "timeout",
        "connection",
        "temporary",
        "503",
        "502",
        "500",
        "internal server error",
    ])

