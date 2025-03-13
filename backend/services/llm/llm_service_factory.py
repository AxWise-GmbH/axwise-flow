"""
LLM service factory module - re-exports the LLMServiceFactory for compatibility
"""

from backend.services.llm import LLMServiceFactory

# Re-export the factory class
__all__ = ['LLMServiceFactory'] 