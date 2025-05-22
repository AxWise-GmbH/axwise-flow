"""
LLM request cache for caching LLM responses.

This module provides a caching mechanism for LLM requests to improve
performance and reduce costs.
"""

import json
import logging
import hashlib
import time
from typing import Dict, Any, Optional, Callable
from functools import lru_cache

logger = logging.getLogger(__name__)

class LLMRequestCache:
    """
    Cache for LLM requests.
    
    This class provides a caching mechanism for LLM requests to improve
    performance and reduce costs. It caches responses based on the request
    parameters and provides methods for retrieving and storing responses.
    """
    
    # In-memory cache
    _cache: Dict[str, Dict[str, Any]] = {}
    
    # Cache configuration
    _max_cache_size = 100
    _cache_ttl = 3600  # 1 hour in seconds
    
    @classmethod
    async def get_or_compute(cls, request_data: Dict[str, Any], llm_service) -> Any:
        """
        Get a response from the cache or compute it if not cached.
        
        Args:
            request_data: Request data for the LLM service
            llm_service: LLM service to use if the response is not cached
            
        Returns:
            Response from the cache or the LLM service
        """
        # Create a cache key from the request data
        cache_key = cls._create_cache_key(request_data)
        
        # Check if the result is in the cache and not expired
        cached_result = cls._get_from_cache(cache_key)
        if cached_result is not None:
            logger.info(f"Cache hit for request: {request_data.get('task')}")
            return cached_result
        
        # If not in cache or expired, compute the result
        logger.info(f"Cache miss for request: {request_data.get('task')}")
        result = await llm_service.analyze(request_data)
        
        # Store in cache
        cls._store_in_cache(cache_key, result)
        
        return result
    
    @classmethod
    def _create_cache_key(cls, request_data: Dict[str, Any]) -> str:
        """
        Create a cache key from the request data.
        
        Args:
            request_data: Request data for the LLM service
            
        Returns:
            Cache key as a string
        """
        # Create a copy of the request data to avoid modifying the original
        request_copy = request_data.copy()
        
        # Remove non-deterministic or irrelevant fields
        request_copy.pop('timestamp', None)
        request_copy.pop('request_id', None)
        
        # Sort the dictionary to ensure deterministic serialization
        serialized = json.dumps(request_copy, sort_keys=True)
        
        # Create a hash of the serialized data
        return hashlib.md5(serialized.encode()).hexdigest()
    
    @classmethod
    def _get_from_cache(cls, cache_key: str) -> Optional[Any]:
        """
        Get a response from the cache.
        
        Args:
            cache_key: Cache key to look up
            
        Returns:
            Cached response, or None if not found or expired
        """
        if cache_key not in cls._cache:
            return None
        
        cache_entry = cls._cache[cache_key]
        
        # Check if the entry has expired
        if time.time() - cache_entry['timestamp'] > cls._cache_ttl:
            # Remove expired entry
            del cls._cache[cache_key]
            return None
        
        return cache_entry['result']
    
    @classmethod
    def _store_in_cache(cls, cache_key: str, result: Any) -> None:
        """
        Store a response in the cache.
        
        Args:
            cache_key: Cache key to store under
            result: Response to cache
        """
        # Create a cache entry with the result and timestamp
        cache_entry = {
            'result': result,
            'timestamp': time.time()
        }
        
        # Store in cache
        cls._cache[cache_key] = cache_entry
        
        # If the cache is too large, remove the oldest entries
        if len(cls._cache) > cls._max_cache_size:
            cls._prune_cache()
    
    @classmethod
    def _prune_cache(cls) -> None:
        """
        Prune the cache by removing the oldest entries.
        """
        # Sort entries by timestamp
        sorted_entries = sorted(
            cls._cache.items(),
            key=lambda x: x[1]['timestamp']
        )
        
        # Remove the oldest entries to bring the cache size down to 75% of max
        entries_to_remove = int(cls._max_cache_size * 0.25)
        for i in range(entries_to_remove):
            if i < len(sorted_entries):
                key = sorted_entries[i][0]
                del cls._cache[key]
    
    @classmethod
    def clear_cache(cls) -> None:
        """
        Clear the cache.
        """
        cls._cache.clear()
        logger.info("LLM request cache cleared")
    
    @classmethod
    def set_cache_config(cls, max_size: int = None, ttl: int = None) -> None:
        """
        Set the cache configuration.
        
        Args:
            max_size: Maximum number of entries in the cache
            ttl: Time-to-live for cache entries in seconds
        """
        if max_size is not None:
            cls._max_cache_size = max_size
        
        if ttl is not None:
            cls._cache_ttl = ttl
        
        logger.info(f"LLM request cache config updated: max_size={cls._max_cache_size}, ttl={cls._cache_ttl}")
    
    @classmethod
    def get_cache_stats(cls) -> Dict[str, Any]:
        """
        Get statistics about the cache.
        
        Returns:
            Dictionary with cache statistics
        """
        return {
            'size': len(cls._cache),
            'max_size': cls._max_cache_size,
            'ttl': cls._cache_ttl,
            'keys': list(cls._cache.keys())
        }
