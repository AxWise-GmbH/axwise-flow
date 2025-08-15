"""
Gemini-specific optimizations to reduce MALFORMED_FUNCTION_CALL errors.
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class GeminiOptimizer:
    """Optimizations specifically for Gemini models to reduce errors."""
    
    @staticmethod
    def get_optimized_model_settings(
        temperature: float = 0.0,
        max_tokens: Optional[int] = None,
        top_p: float = 0.95,
        top_k: int = 40,
    ) -> Dict[str, Any]:
        """
        Get optimized model settings for Gemini to reduce MALFORMED_FUNCTION_CALL errors.
        
        Based on research and community findings:
        - Temperature 0 for structured output
        - Conservative top_p and top_k values
        - Reasonable max_tokens to prevent truncation
        
        Args:
            temperature: Randomness control (0.0 for deterministic)
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Returns:
            Optimized model settings dictionary
        """
        settings = {
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
        }
        
        if max_tokens is not None:
            settings["max_tokens"] = max_tokens
        
        logger.debug(f"[GEMINI_OPTIMIZER] Using optimized settings: {settings}")
        return settings
    
    @staticmethod
    def optimize_prompt_for_structured_output(prompt: str) -> str:
        """
        Optimize prompt for better structured output generation with Gemini.
        
        Args:
            prompt: Original prompt
            
        Returns:
            Optimized prompt
        """
        # Add explicit instructions for JSON formatting
        optimization_suffix = """

IMPORTANT FORMATTING INSTRUCTIONS:
- Respond with valid JSON only
- Ensure all JSON keys are properly quoted
- Use double quotes for strings
- Do not include any text outside the JSON structure
- Ensure the JSON is complete and properly closed
- If uncertain about a field, use null instead of omitting it"""
        
        optimized_prompt = prompt + optimization_suffix
        
        logger.debug("[GEMINI_OPTIMIZER] Added structured output optimization to prompt")
        return optimized_prompt
    
    @staticmethod
    def validate_prompt_length(prompt: str, max_length: int = 30000) -> str:
        """
        Validate and potentially truncate prompt to prevent token limit issues.
        
        Args:
            prompt: Input prompt
            max_length: Maximum character length
            
        Returns:
            Validated/truncated prompt
        """
        if len(prompt) <= max_length:
            return prompt
        
        logger.warning(
            f"[GEMINI_OPTIMIZER] Prompt too long ({len(prompt)} chars), truncating to {max_length}"
        )
        
        # Truncate but try to preserve the end (which often contains instructions)
        truncated = prompt[:max_length-500] + "\n\n[CONTENT TRUNCATED]\n\n" + prompt[-500:]
        
        return truncated
    
    @staticmethod
    def create_robust_system_prompt() -> str:
        """
        Create a robust system prompt that reduces MALFORMED_FUNCTION_CALL errors.
        
        Returns:
            Optimized system prompt
        """
        return """You are a precise data analyst that generates structured JSON responses.

CRITICAL REQUIREMENTS:
1. Always respond with valid, complete JSON
2. Never include text outside the JSON structure
3. Use proper JSON formatting with double quotes
4. If a field value is unknown, use null instead of omitting the field
5. Ensure all JSON objects and arrays are properly closed
6. Double-check your JSON syntax before responding

Your responses must be parseable by standard JSON parsers. Any malformed JSON will cause system errors."""
    
    @staticmethod
    def get_conservative_retry_settings() -> Dict[str, Any]:
        """
        Get conservative settings for retry scenarios.
        
        Returns:
            Conservative model settings
        """
        return {
            "temperature": 0.0,  # Maximum determinism
            "top_p": 0.9,        # More conservative sampling
            "top_k": 20,         # Reduced options
            "max_tokens": 4000,  # Reasonable limit
        }
    
    @staticmethod
    def analyze_error_for_optimization(error: Exception) -> Dict[str, Any]:
        """
        Analyze error to suggest optimizations for next attempt.
        
        Args:
            error: Exception that occurred
            
        Returns:
            Optimization suggestions
        """
        error_str = str(error)
        suggestions = {
            "reduce_temperature": False,
            "reduce_max_tokens": False,
            "simplify_prompt": False,
            "add_format_instructions": False,
        }
        
        if "MALFORMED_FUNCTION_CALL" in error_str:
            suggestions["reduce_temperature"] = True
            suggestions["add_format_instructions"] = True
            logger.info("[GEMINI_OPTIMIZER] Suggesting temperature reduction and format instructions")
        
        if "MAX_TOKENS" in error_str:
            suggestions["reduce_max_tokens"] = True
            logger.info("[GEMINI_OPTIMIZER] Suggesting token limit reduction")
        
        if "content" in error_str and "Field required" in error_str:
            suggestions["simplify_prompt"] = True
            suggestions["add_format_instructions"] = True
            logger.info("[GEMINI_OPTIMIZER] Suggesting prompt simplification")
        
        return suggestions


def apply_gemini_optimizations(
    prompt: str,
    model_settings: Optional[Dict[str, Any]] = None,
    is_retry: bool = False,
) -> tuple[str, Dict[str, Any]]:
    """
    Apply comprehensive Gemini optimizations to prompt and settings.
    
    Args:
        prompt: Original prompt
        model_settings: Original model settings
        is_retry: Whether this is a retry attempt
        
    Returns:
        Tuple of (optimized_prompt, optimized_settings)
    """
    optimizer = GeminiOptimizer()
    
    # Optimize prompt
    optimized_prompt = optimizer.validate_prompt_length(prompt)
    optimized_prompt = optimizer.optimize_prompt_for_structured_output(optimized_prompt)
    
    # Optimize settings
    if is_retry:
        optimized_settings = optimizer.get_conservative_retry_settings()
    else:
        optimized_settings = optimizer.get_optimized_model_settings()
    
    # Merge with provided settings
    if model_settings:
        optimized_settings.update(model_settings)
    
    logger.info(
        f"[GEMINI_OPTIMIZER] Applied optimizations - "
        f"prompt length: {len(optimized_prompt)}, "
        f"settings: {optimized_settings}"
    )
    
    return optimized_prompt, optimized_settings
