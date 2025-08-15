"""
Pattern processor factory module.

This module provides a factory for creating and configuring pattern processors.
"""

import logging
from typing import Optional

from backend.services.processing.pattern_processor import PatternProcessor

logger = logging.getLogger(__name__)


class PatternProcessorFactory:
    """
    Factory for creating and configuring pattern processors.

    This factory provides methods for creating pattern processors with
    different configurations.
    """

    @staticmethod
    def create_processor(llm_service=None) -> PatternProcessor:
        """
        Create a pattern processor.

        Args:
            llm_service: Optional LLM service instance (for compatibility)

        Returns:
            Configured PatternProcessor instance
        """
        # Create and return the processor with PydanticAI
        logger.info("Creating PatternProcessor with PydanticAI")
        return PatternProcessor(llm_service=llm_service)
