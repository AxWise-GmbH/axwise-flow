"""
Configuration for V3 Simplified Customer Research Implementation.

This configuration provides all the settings needed for the V3 Simplified implementation,
designed to be production-ready with proper defaults and environment-based overrides.
"""

import os
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
from backend.services.external.secure_env import secure_env


@dataclass
class V3SimpleConfig:
    """
    Comprehensive configuration for V3 Simplified implementation.
    
    This configuration combines:
    - Feature flags for enabling/disabling capabilities
    - Performance settings for optimization
    - Quality settings for analysis accuracy
    - Fallback settings for error resilience
    - Memory management for stability
    """
    
    # === Feature Flags ===
    enable_industry_analysis: bool = True
    enable_stakeholder_detection: bool = True
    enable_enhanced_context: bool = True
    enable_conversation_flow: bool = True
    enable_thinking_process: bool = True
    enable_smart_caching: bool = True
    enable_performance_monitoring: bool = True
    
    # === Performance Settings ===
    request_timeout_seconds: int = 30
    max_concurrent_requests: int = 5
    cache_ttl_seconds: int = 300  # 5 minutes
    enable_request_batching: bool = False  # Disabled for simplicity
    
    # === Quality Settings ===
    min_confidence_threshold: float = 0.6
    enable_quality_checks: bool = True
    enable_response_validation: bool = True
    
    # === Fallback Settings ===
    enable_v1_fallback: bool = True
    max_retries: int = 2
    fallback_timeout_seconds: int = 15
    
    # === Memory Management ===
    max_thinking_steps: int = 20
    max_metrics_history: int = 100
    max_cache_entries: int = 1000
    enable_memory_cleanup: bool = True
    
    # === LLM Settings ===
    llm_model_name: str = "gemini-2.0-flash-exp"
    llm_temperature: float = 0.0
    llm_max_tokens: int = 8192
    llm_timeout_seconds: int = 20
    
    # === Monitoring Settings ===
    enable_detailed_logging: bool = False
    enable_metrics_export: bool = True
    metrics_export_interval_seconds: int = 60
    
    @classmethod
    def from_environment(cls) -> 'V3SimpleConfig':
        """Create configuration from environment variables with sensible defaults."""
        
        # Determine environment
        environment = secure_env.get("ENVIRONMENT", "development").lower()
        is_production = environment == "production"
        is_development = environment == "development"
        
        return cls(
            # Feature flags (can be disabled in production for stability)
            enable_industry_analysis=secure_env.get("V3_ENABLE_INDUSTRY_ANALYSIS", "true").lower() == "true",
            enable_stakeholder_detection=secure_env.get("V3_ENABLE_STAKEHOLDER_DETECTION", "true").lower() == "true",
            enable_enhanced_context=secure_env.get("V3_ENABLE_ENHANCED_CONTEXT", "true").lower() == "true",
            enable_conversation_flow=secure_env.get("V3_ENABLE_CONVERSATION_FLOW", "true").lower() == "true",
            enable_thinking_process=secure_env.get("V3_ENABLE_THINKING_PROCESS", "true").lower() == "true",
            enable_smart_caching=secure_env.get("V3_ENABLE_SMART_CACHING", "true").lower() == "true",
            enable_performance_monitoring=secure_env.get("V3_ENABLE_PERFORMANCE_MONITORING", "true").lower() == "true",
            
            # Performance settings (more conservative in production)
            request_timeout_seconds=int(secure_env.get("V3_REQUEST_TIMEOUT_SECONDS", "20" if is_production else "30")),
            max_concurrent_requests=int(secure_env.get("V3_MAX_CONCURRENT_REQUESTS", "3" if is_production else "5")),
            cache_ttl_seconds=int(secure_env.get("V3_CACHE_TTL_SECONDS", "600" if is_production else "300")),
            
            # Quality settings
            min_confidence_threshold=float(secure_env.get("V3_MIN_CONFIDENCE_THRESHOLD", "0.7" if is_production else "0.6")),
            enable_quality_checks=secure_env.get("V3_ENABLE_QUALITY_CHECKS", "true").lower() == "true",
            enable_response_validation=secure_env.get("V3_ENABLE_RESPONSE_VALIDATION", "true").lower() == "true",
            
            # Fallback settings (always enabled for stability)
            enable_v1_fallback=secure_env.get("V3_ENABLE_V1_FALLBACK", "true").lower() == "true",
            max_retries=int(secure_env.get("V3_MAX_RETRIES", "1" if is_production else "2")),
            fallback_timeout_seconds=int(secure_env.get("V3_FALLBACK_TIMEOUT_SECONDS", "10" if is_production else "15")),
            
            # Memory management (more aggressive in production)
            max_thinking_steps=int(secure_env.get("V3_MAX_THINKING_STEPS", "15" if is_production else "20")),
            max_metrics_history=int(secure_env.get("V3_MAX_METRICS_HISTORY", "50" if is_production else "100")),
            max_cache_entries=int(secure_env.get("V3_MAX_CACHE_ENTRIES", "500" if is_production else "1000")),
            enable_memory_cleanup=secure_env.get("V3_ENABLE_MEMORY_CLEANUP", "true").lower() == "true",
            
            # LLM settings
            llm_model_name=secure_env.get("V3_LLM_MODEL_NAME", "gemini-2.0-flash-exp"),
            llm_temperature=float(secure_env.get("V3_LLM_TEMPERATURE", "0.0")),
            llm_max_tokens=int(secure_env.get("V3_LLM_MAX_TOKENS", "8192")),
            llm_timeout_seconds=int(secure_env.get("V3_LLM_TIMEOUT_SECONDS", "15" if is_production else "20")),
            
            # Monitoring settings
            enable_detailed_logging=secure_env.get("V3_ENABLE_DETAILED_LOGGING", "false" if is_production else "true").lower() == "true",
            enable_metrics_export=secure_env.get("V3_ENABLE_METRICS_EXPORT", "true").lower() == "true",
            metrics_export_interval_seconds=int(secure_env.get("V3_METRICS_EXPORT_INTERVAL_SECONDS", "300" if is_production else "60"))
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "feature_flags": {
                "enable_industry_analysis": self.enable_industry_analysis,
                "enable_stakeholder_detection": self.enable_stakeholder_detection,
                "enable_enhanced_context": self.enable_enhanced_context,
                "enable_conversation_flow": self.enable_conversation_flow,
                "enable_thinking_process": self.enable_thinking_process,
                "enable_smart_caching": self.enable_smart_caching,
                "enable_performance_monitoring": self.enable_performance_monitoring
            },
            "performance": {
                "request_timeout_seconds": self.request_timeout_seconds,
                "max_concurrent_requests": self.max_concurrent_requests,
                "cache_ttl_seconds": self.cache_ttl_seconds
            },
            "quality": {
                "min_confidence_threshold": self.min_confidence_threshold,
                "enable_quality_checks": self.enable_quality_checks,
                "enable_response_validation": self.enable_response_validation
            },
            "fallback": {
                "enable_v1_fallback": self.enable_v1_fallback,
                "max_retries": self.max_retries,
                "fallback_timeout_seconds": self.fallback_timeout_seconds
            },
            "memory": {
                "max_thinking_steps": self.max_thinking_steps,
                "max_metrics_history": self.max_metrics_history,
                "max_cache_entries": self.max_cache_entries,
                "enable_memory_cleanup": self.enable_memory_cleanup
            },
            "llm": {
                "model_name": self.llm_model_name,
                "temperature": self.llm_temperature,
                "max_tokens": self.llm_max_tokens,
                "timeout_seconds": self.llm_timeout_seconds
            },
            "monitoring": {
                "enable_detailed_logging": self.enable_detailed_logging,
                "enable_metrics_export": self.enable_metrics_export,
                "metrics_export_interval_seconds": self.metrics_export_interval_seconds
            }
        }
    
    def validate(self) -> List[str]:
        """Validate configuration and return list of issues."""
        issues = []
        
        # Validate timeouts
        if self.request_timeout_seconds <= 0:
            issues.append("request_timeout_seconds must be positive")
        
        if self.llm_timeout_seconds >= self.request_timeout_seconds:
            issues.append("llm_timeout_seconds should be less than request_timeout_seconds")
        
        # Validate thresholds
        if not 0.0 <= self.min_confidence_threshold <= 1.0:
            issues.append("min_confidence_threshold must be between 0.0 and 1.0")
        
        # Validate memory limits
        if self.max_thinking_steps <= 0:
            issues.append("max_thinking_steps must be positive")
        
        if self.max_cache_entries <= 0:
            issues.append("max_cache_entries must be positive")
        
        # Validate LLM settings
        if self.llm_max_tokens <= 0:
            issues.append("llm_max_tokens must be positive")
        
        if not 0.0 <= self.llm_temperature <= 2.0:
            issues.append("llm_temperature must be between 0.0 and 2.0")
        
        return issues
    
    def get_feature_summary(self) -> Dict[str, bool]:
        """Get a summary of enabled features."""
        return {
            "industry_analysis": self.enable_industry_analysis,
            "stakeholder_detection": self.enable_stakeholder_detection,
            "enhanced_context": self.enable_enhanced_context,
            "conversation_flow": self.enable_conversation_flow,
            "thinking_process": self.enable_thinking_process,
            "smart_caching": self.enable_smart_caching,
            "performance_monitoring": self.enable_performance_monitoring,
            "v1_fallback": self.enable_v1_fallback,
            "quality_checks": self.enable_quality_checks,
            "response_validation": self.enable_response_validation
        }


# Global configuration instance
_global_config: Optional[V3SimpleConfig] = None


def get_v3_simple_config() -> V3SimpleConfig:
    """Get the global V3 Simple configuration instance."""
    global _global_config
    
    if _global_config is None:
        _global_config = V3SimpleConfig.from_environment()
        
        # Validate configuration
        issues = _global_config.validate()
        if issues:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Configuration validation issues: {issues}")
    
    return _global_config


def reset_v3_simple_config():
    """Reset the global configuration (useful for testing)."""
    global _global_config
    _global_config = None


# Environment-specific configurations
def get_development_config() -> V3SimpleConfig:
    """Get development-optimized configuration."""
    return V3SimpleConfig(
        # Enable all features for development
        enable_industry_analysis=True,
        enable_stakeholder_detection=True,
        enable_enhanced_context=True,
        enable_conversation_flow=True,
        enable_thinking_process=True,
        enable_smart_caching=True,
        enable_performance_monitoring=True,
        
        # Relaxed timeouts for development
        request_timeout_seconds=45,
        llm_timeout_seconds=30,
        
        # Detailed logging for development
        enable_detailed_logging=True,
        
        # Higher memory limits for development
        max_thinking_steps=25,
        max_metrics_history=200
    )


def get_production_config() -> V3SimpleConfig:
    """Get production-optimized configuration."""
    return V3SimpleConfig(
        # Conservative feature set for production
        enable_industry_analysis=True,
        enable_stakeholder_detection=True,
        enable_enhanced_context=True,
        enable_conversation_flow=True,
        enable_thinking_process=False,  # Disabled for performance
        enable_smart_caching=True,
        enable_performance_monitoring=True,
        
        # Strict timeouts for production
        request_timeout_seconds=20,
        llm_timeout_seconds=15,
        
        # Conservative quality settings
        min_confidence_threshold=0.7,
        max_retries=1,
        
        # Memory limits for production
        max_thinking_steps=10,
        max_metrics_history=50,
        max_cache_entries=500,
        
        # Minimal logging for production
        enable_detailed_logging=False
    )
