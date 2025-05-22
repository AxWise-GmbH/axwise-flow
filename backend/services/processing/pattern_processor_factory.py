"""
Pattern processor factory module.

This module provides a factory for creating and configuring pattern processors.
"""

import logging
from typing import Optional

from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
from backend.services.processing.pattern_processor import PatternProcessor

logger = logging.getLogger(__name__)

class PatternProcessorFactory:
    """
    Factory for creating and configuring pattern processors.
    
    This factory provides methods for creating pattern processors with
    different configurations.
    """
    
    @staticmethod
    def create_processor(
        instructor_client: Optional[InstructorGeminiClient] = None
    ) -> PatternProcessor:
        """
        Create a pattern processor.
        
        Args:
            instructor_client: Optional InstructorGeminiClient instance
            
        Returns:
            Configured PatternProcessor instance
        """
        # Create instructor client if not provided
        if not instructor_client:
            logger.info("Creating new InstructorGeminiClient for PatternProcessor")
            instructor_client = InstructorGeminiClient()
        
        # Create and return the processor
        logger.info("Creating PatternProcessor")
        return PatternProcessor(instructor_client=instructor_client)
