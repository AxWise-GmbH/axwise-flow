"""
Retry utilities for PydanticAI to handle MALFORMED_FUNCTION_CALL errors.
"""

import asyncio
import logging
from typing import Any, Callable, Dict, Optional, TypeVar, Union
import time

logger = logging.getLogger(__name__)

T = TypeVar('T')


class PydanticAIRetryConfig:
    """Configuration for PydanticAI retry logic."""
    
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 10.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter


async def retry_pydantic_ai_call(
    agent_call: Callable[[], Any],
    config: Optional[PydanticAIRetryConfig] = None,
    context: str = "PydanticAI call",
) -> Any:
    """
    Retry PydanticAI agent calls with exponential backoff for MALFORMED_FUNCTION_CALL errors.
    
    Args:
        agent_call: Async function that makes the PydanticAI agent call
        config: Retry configuration
        context: Context description for logging
        
    Returns:
        Result from successful agent call
        
    Raises:
        Exception: If all retries are exhausted
    """
    if config is None:
        config = PydanticAIRetryConfig()
    
    last_exception = None
    
    for attempt in range(config.max_retries + 1):
        try:
            logger.info(f"[RETRY] {context} - Attempt {attempt + 1}/{config.max_retries + 1}")
            
            result = await agent_call()
            
            if attempt > 0:
                logger.info(f"[RETRY] ✅ {context} succeeded on attempt {attempt + 1}")
            
            return result
            
        except Exception as e:
            last_exception = e
            error_str = str(e)
            
            # Check if this is a MALFORMED_FUNCTION_CALL error
            is_malformed_error = (
                "MALFORMED_FUNCTION_CALL" in error_str or
                "finishReason" in error_str and "literal_error" in error_str or
                "Field required" in error_str and "content" in error_str
            )
            
            if is_malformed_error:
                logger.warning(
                    f"[RETRY] 🔄 {context} failed with MALFORMED_FUNCTION_CALL on attempt {attempt + 1}: {error_str}"
                )
                
                # If this is the last attempt, don't wait
                if attempt < config.max_retries:
                    delay = calculate_retry_delay(attempt, config)
                    logger.info(f"[RETRY] ⏳ Waiting {delay:.2f}s before retry...")
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"[RETRY] ❌ {context} exhausted all retries with MALFORMED_FUNCTION_CALL")
                    break
            else:
                # For non-MALFORMED_FUNCTION_CALL errors, fail immediately
                logger.error(f"[RETRY] ❌ {context} failed with non-retryable error: {error_str}")
                break
    
    # If we get here, all retries failed
    logger.error(f"[RETRY] ❌ {context} failed after {config.max_retries + 1} attempts")
    raise last_exception


def calculate_retry_delay(attempt: int, config: PydanticAIRetryConfig) -> float:
    """Calculate delay for retry attempt with exponential backoff and jitter."""
    delay = config.base_delay * (config.exponential_base ** attempt)
    delay = min(delay, config.max_delay)
    
    if config.jitter:
        # Add random jitter (±25%)
        import random
        jitter_factor = 0.75 + (random.random() * 0.5)  # 0.75 to 1.25
        delay *= jitter_factor
    
    return delay


async def safe_pydantic_ai_call(
    agent: Any,
    prompt: str,
    context: str = "PydanticAI agent call",
    retry_config: Optional[PydanticAIRetryConfig] = None,
) -> Any:
    """
    Safe wrapper for PydanticAI agent calls with automatic retry logic.
    
    Args:
        agent: PydanticAI agent instance
        prompt: Prompt to send to the agent
        context: Context description for logging
        retry_config: Optional retry configuration
        
    Returns:
        Agent response
    """
    async def make_call():
        result = await agent.run(prompt)
        
        # Extract output if it's wrapped
        if hasattr(result, "output"):
            return result.output
        return result
    
    return await retry_pydantic_ai_call(
        make_call,
        config=retry_config,
        context=context
    )


class PydanticAIFallbackHandler:
    """Handler for creating fallback responses when PydanticAI calls fail."""
    
    @staticmethod
    def create_fallback_theme_attribution(theme: Any, stakeholder_map: Dict[str, Any]) -> Dict[str, Any]:
        """Create fallback theme attribution when PydanticAI fails."""
        theme_name = getattr(theme, 'name', 'Unknown Theme')
        stakeholder_ids = list(stakeholder_map.keys())
        
        return {
            "stakeholder_contributions": [
                {
                    "stakeholder_id": stakeholder_id,
                    "contribution_level": 0.5,
                    "evidence_count": 1,
                    "key_quotes": [f"Fallback attribution for {theme_name}"]
                }
                for stakeholder_id in stakeholder_ids[:3]  # Limit to first 3
            ],
            "dominant_stakeholder": stakeholder_ids[0] if stakeholder_ids else "unknown",
            "theme_consensus_level": 0.6,
            "attribution_method": "fallback_due_to_malformed_function_call"
        }
    
    @staticmethod
    def create_fallback_consensus_analysis(stakeholders: list) -> Dict[str, Any]:
        """Create fallback consensus analysis when PydanticAI fails."""
        return {
            "consensus_areas": [
                {
                    "topic": "General Agreement",
                    "agreement_level": 0.7,
                    "stakeholder_count": len(stakeholders),
                    "description": "Fallback consensus due to analysis failure"
                }
            ],
            "analysis_method": "fallback_due_to_malformed_function_call"
        }
    
    @staticmethod
    def create_fallback_conflict_analysis(stakeholders: list) -> Dict[str, Any]:
        """Create fallback conflict analysis when PydanticAI fails."""
        return {
            "conflict_areas": [
                {
                    "topic": "Implementation Approach",
                    "disagreement_level": 0.4,
                    "stakeholder_count": len(stakeholders),
                    "description": "Fallback conflict analysis due to analysis failure"
                }
            ],
            "analysis_method": "fallback_due_to_malformed_function_call"
        }
    
    @staticmethod
    def create_fallback_influence_analysis(stakeholders: list) -> Dict[str, Any]:
        """Create fallback influence analysis when PydanticAI fails."""
        return {
            "influence_networks": [
                {
                    "network_type": "decision_making",
                    "participants": stakeholders[:3] if len(stakeholders) >= 3 else stakeholders,
                    "influence_strength": 0.6,
                    "description": "Fallback influence network due to analysis failure"
                }
            ],
            "analysis_method": "fallback_due_to_malformed_function_call"
        }


# Convenience function for common retry configurations
def get_conservative_retry_config() -> PydanticAIRetryConfig:
    """Get conservative retry configuration for production use."""
    return PydanticAIRetryConfig(
        max_retries=2,
        base_delay=2.0,
        max_delay=8.0,
        exponential_base=2.0,
        jitter=True
    )


def get_aggressive_retry_config() -> PydanticAIRetryConfig:
    """Get aggressive retry configuration for development/testing."""
    return PydanticAIRetryConfig(
        max_retries=4,
        base_delay=1.0,
        max_delay=15.0,
        exponential_base=2.0,
        jitter=True
    )
