"""
Performance Optimization Service for Research API V3.

This service provides performance monitoring, optimization, and caching
for the V3 research API to ensure optimal response times and resource usage.
"""

import logging
import time
import asyncio
from typing import Dict, List, Optional, Any, Callable, TypeVar, Generic
from dataclasses import dataclass, field
from enum import Enum
import hashlib
import json
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CacheStrategy(Enum):
    """Cache strategies for different types of data."""
    NO_CACHE = "no_cache"
    SHORT_TERM = "short_term"  # 5 minutes
    MEDIUM_TERM = "medium_term"  # 30 minutes
    LONG_TERM = "long_term"  # 2 hours
    SESSION_BASED = "session_based"  # Until session ends


@dataclass
class CacheEntry(Generic[T]):
    """Cache entry with metadata."""
    
    data: T
    created_at: float
    expires_at: float
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    cache_key: str = ""
    strategy: CacheStrategy = CacheStrategy.SHORT_TERM


@dataclass
class PerformanceMetrics:
    """Performance metrics for monitoring."""
    
    # Timing metrics
    total_requests: int = 0
    avg_response_time_ms: float = 0.0
    p95_response_time_ms: float = 0.0
    p99_response_time_ms: float = 0.0
    
    # Cache metrics
    cache_hit_rate: float = 0.0
    cache_miss_rate: float = 0.0
    cache_size: int = 0
    
    # Component metrics
    context_extraction_avg_ms: float = 0.0
    industry_classification_avg_ms: float = 0.0
    stakeholder_detection_avg_ms: float = 0.0
    conversation_flow_avg_ms: float = 0.0
    response_generation_avg_ms: float = 0.0
    
    # Error metrics
    error_rate: float = 0.0
    timeout_rate: float = 0.0
    fallback_usage_rate: float = 0.0
    
    # Resource metrics
    memory_usage_mb: float = 0.0
    concurrent_requests: int = 0


@dataclass
class OptimizationConfig:
    """Configuration for performance optimization."""
    
    # Cache settings
    enable_caching: bool = True
    max_cache_size: int = 1000
    cache_cleanup_interval: int = 300  # 5 minutes
    
    # Performance settings
    enable_parallel_processing: bool = True
    max_concurrent_requests: int = 50
    request_timeout_seconds: int = 30
    
    # Optimization settings
    enable_response_compression: bool = True
    enable_request_batching: bool = False
    batch_size: int = 5
    batch_timeout_ms: int = 100
    
    # Monitoring settings
    enable_metrics_collection: bool = True
    metrics_retention_hours: int = 24
    performance_alert_threshold: float = 2000.0  # 2 seconds


class PerformanceOptimizationService:
    """
    Service for performance optimization and monitoring.
    
    This service provides:
    - Intelligent caching with multiple strategies
    - Performance monitoring and metrics collection
    - Request optimization and batching
    - Resource usage monitoring
    - Automatic performance tuning
    """
    
    def __init__(self, config: Optional[OptimizationConfig] = None):
        """Initialize the performance optimization service."""
        
        self.config = config or OptimizationConfig()
        
        # Cache storage
        self.cache: Dict[str, CacheEntry] = {}
        self.cache_stats = {"hits": 0, "misses": 0}
        
        # Performance tracking
        self.response_times: deque = deque(maxlen=1000)  # Last 1000 requests
        self.component_times: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        self.error_counts: Dict[str, int] = defaultdict(int)
        
        # Request tracking
        self.active_requests: Dict[str, float] = {}
        self.request_queue: List[Dict[str, Any]] = []
        
        # Optimization state
        self.optimization_enabled = True
        self.last_cleanup = time.time()
        
        logger.info("Performance Optimization Service initialized")
    
    async def with_caching(
        self,
        cache_key: str,
        cache_strategy: CacheStrategy,
        operation: Callable[[], Any],
        **kwargs
    ) -> Any:
        """Execute operation with caching support."""
        
        if not self.config.enable_caching or cache_strategy == CacheStrategy.NO_CACHE:
            return await operation()
        
        # Check cache
        cached_result = self._get_from_cache(cache_key)
        if cached_result is not None:
            self.cache_stats["hits"] += 1
            logger.debug(f"Cache hit for key: {cache_key}")
            return cached_result
        
        # Cache miss - execute operation
        self.cache_stats["misses"] += 1
        logger.debug(f"Cache miss for key: {cache_key}")
        
        result = await operation()
        
        # Store in cache
        self._store_in_cache(cache_key, result, cache_strategy)
        
        return result
    
    async def with_performance_monitoring(
        self,
        operation_name: str,
        operation: Callable[[], Any],
        **kwargs
    ) -> Any:
        """Execute operation with performance monitoring."""
        
        request_id = f"{operation_name}_{int(time.time() * 1000)}"
        start_time = time.time()
        
        # Track active request
        self.active_requests[request_id] = start_time
        
        try:
            # Execute operation with timeout
            if self.config.request_timeout_seconds > 0:
                result = await asyncio.wait_for(
                    operation(),
                    timeout=self.config.request_timeout_seconds
                )
            else:
                result = await operation()
            
            # Record success metrics
            duration_ms = (time.time() - start_time) * 1000
            self.response_times.append(duration_ms)
            self.component_times[operation_name].append(duration_ms)
            
            logger.debug(f"Operation {operation_name} completed in {duration_ms:.2f}ms")
            
            return result
            
        except asyncio.TimeoutError:
            self.error_counts["timeout"] += 1
            logger.warning(f"Operation {operation_name} timed out after {self.config.request_timeout_seconds}s")
            raise
            
        except Exception as e:
            self.error_counts["error"] += 1
            logger.error(f"Operation {operation_name} failed: {e}")
            raise
            
        finally:
            # Clean up active request tracking
            self.active_requests.pop(request_id, None)
            
            # Periodic cleanup
            if time.time() - self.last_cleanup > self.config.cache_cleanup_interval:
                await self._cleanup_cache()
    
    async def optimize_parallel_execution(
        self,
        operations: List[Callable[[], Any]],
        operation_names: List[str]
    ) -> List[Any]:
        """Execute operations in parallel with optimization."""
        
        if not self.config.enable_parallel_processing or len(operations) <= 1:
            # Sequential execution
            results = []
            for i, operation in enumerate(operations):
                result = await self.with_performance_monitoring(
                    operation_names[i], operation
                )
                results.append(result)
            return results
        
        # Parallel execution
        tasks = []
        for i, operation in enumerate(operations):
            task = self.with_performance_monitoring(
                operation_names[i], operation
            )
            tasks.append(task)
        
        # Execute with concurrency limit
        if len(tasks) > self.config.max_concurrent_requests:
            # Batch execution
            results = []
            for i in range(0, len(tasks), self.config.max_concurrent_requests):
                batch = tasks[i:i + self.config.max_concurrent_requests]
                batch_results = await asyncio.gather(*batch, return_exceptions=True)
                results.extend(batch_results)
            return results
        else:
            # Execute all at once
            return await asyncio.gather(*tasks, return_exceptions=True)
    
    def generate_cache_key(self, *args, **kwargs) -> str:
        """Generate cache key from arguments."""
        
        # Create deterministic hash from arguments
        key_data = {
            "args": args,
            "kwargs": sorted(kwargs.items()) if kwargs else {}
        }
        
        key_string = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def get_performance_metrics(self) -> PerformanceMetrics:
        """Get current performance metrics."""
        
        metrics = PerformanceMetrics()
        
        # Basic metrics
        metrics.total_requests = len(self.response_times)
        metrics.cache_size = len(self.cache)
        metrics.concurrent_requests = len(self.active_requests)
        
        if self.response_times:
            # Response time metrics
            sorted_times = sorted(self.response_times)
            metrics.avg_response_time_ms = sum(sorted_times) / len(sorted_times)
            
            if len(sorted_times) >= 20:  # Need reasonable sample size
                p95_index = int(len(sorted_times) * 0.95)
                p99_index = int(len(sorted_times) * 0.99)
                metrics.p95_response_time_ms = sorted_times[p95_index]
                metrics.p99_response_time_ms = sorted_times[p99_index]
        
        # Cache metrics
        total_cache_requests = self.cache_stats["hits"] + self.cache_stats["misses"]
        if total_cache_requests > 0:
            metrics.cache_hit_rate = self.cache_stats["hits"] / total_cache_requests
            metrics.cache_miss_rate = self.cache_stats["misses"] / total_cache_requests
        
        # Component metrics
        for component, times in self.component_times.items():
            if times:
                avg_time = sum(times) / len(times)
                if component == "context_extraction":
                    metrics.context_extraction_avg_ms = avg_time
                elif component == "industry_classification":
                    metrics.industry_classification_avg_ms = avg_time
                elif component == "stakeholder_detection":
                    metrics.stakeholder_detection_avg_ms = avg_time
                elif component == "conversation_flow":
                    metrics.conversation_flow_avg_ms = avg_time
                elif component == "response_generation":
                    metrics.response_generation_avg_ms = avg_time
        
        # Error metrics
        total_requests = max(metrics.total_requests, 1)
        metrics.error_rate = self.error_counts.get("error", 0) / total_requests
        metrics.timeout_rate = self.error_counts.get("timeout", 0) / total_requests
        metrics.fallback_usage_rate = self.error_counts.get("fallback", 0) / total_requests
        
        # Memory usage (simplified)
        metrics.memory_usage_mb = len(self.cache) * 0.1  # Rough estimate
        
        return metrics
    
    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        """Get item from cache if valid."""
        
        if cache_key not in self.cache:
            return None
        
        entry = self.cache[cache_key]
        
        # Check expiration
        if time.time() > entry.expires_at:
            del self.cache[cache_key]
            return None
        
        # Update access stats
        entry.access_count += 1
        entry.last_accessed = time.time()
        
        return entry.data
    
    def _store_in_cache(self, cache_key: str, data: Any, strategy: CacheStrategy):
        """Store item in cache with appropriate TTL."""
        
        # Determine TTL based on strategy
        ttl_seconds = {
            CacheStrategy.SHORT_TERM: 300,    # 5 minutes
            CacheStrategy.MEDIUM_TERM: 1800,  # 30 minutes
            CacheStrategy.LONG_TERM: 7200,    # 2 hours
            CacheStrategy.SESSION_BASED: 3600 # 1 hour default
        }.get(strategy, 300)
        
        # Create cache entry
        entry = CacheEntry(
            data=data,
            created_at=time.time(),
            expires_at=time.time() + ttl_seconds,
            cache_key=cache_key,
            strategy=strategy
        )
        
        # Store in cache
        self.cache[cache_key] = entry
        
        # Enforce cache size limit
        if len(self.cache) > self.config.max_cache_size:
            self._evict_cache_entries()
    
    def _evict_cache_entries(self):
        """Evict cache entries using LRU strategy."""
        
        # Sort by last accessed time
        sorted_entries = sorted(
            self.cache.items(),
            key=lambda x: x[1].last_accessed
        )
        
        # Remove oldest entries
        entries_to_remove = len(self.cache) - self.config.max_cache_size + 10
        for i in range(entries_to_remove):
            if i < len(sorted_entries):
                cache_key = sorted_entries[i][0]
                del self.cache[cache_key]
        
        logger.info(f"Evicted {entries_to_remove} cache entries")
    
    async def _cleanup_cache(self):
        """Clean up expired cache entries."""
        
        current_time = time.time()
        expired_keys = []
        
        for cache_key, entry in self.cache.items():
            if current_time > entry.expires_at:
                expired_keys.append(cache_key)
        
        for key in expired_keys:
            del self.cache[key]
        
        self.last_cleanup = current_time
        
        if expired_keys:
            logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    def clear_cache(self, pattern: Optional[str] = None):
        """Clear cache entries, optionally matching a pattern."""
        
        if pattern is None:
            # Clear all cache
            cleared_count = len(self.cache)
            self.cache.clear()
            logger.info(f"Cleared all {cleared_count} cache entries")
        else:
            # Clear matching entries
            keys_to_remove = [key for key in self.cache.keys() if pattern in key]
            for key in keys_to_remove:
                del self.cache[key]
            logger.info(f"Cleared {len(keys_to_remove)} cache entries matching '{pattern}'")
    
    def reset_metrics(self):
        """Reset all performance metrics."""
        
        self.response_times.clear()
        self.component_times.clear()
        self.error_counts.clear()
        self.cache_stats = {"hits": 0, "misses": 0}
        
        logger.info("Performance metrics reset")
    
    def is_performance_healthy(self) -> bool:
        """Check if performance is within healthy thresholds."""
        
        metrics = self.get_performance_metrics()
        
        # Check response time
        if metrics.avg_response_time_ms > self.config.performance_alert_threshold:
            return False
        
        # Check error rate
        if metrics.error_rate > 0.05:  # 5% error rate threshold
            return False
        
        # Check timeout rate
        if metrics.timeout_rate > 0.02:  # 2% timeout rate threshold
            return False
        
        return True
