"""
Pattern service module.

This module provides a service for generating and managing patterns.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.models.pattern import Pattern, PatternResponse
from backend.services.processing.pattern_processor_factory import PatternProcessorFactory

logger = logging.getLogger(__name__)

class PatternService:
    """
    Service for generating and managing patterns.
    
    This service provides methods for generating patterns from text data
    and managing pattern data.
    """
    
    def __init__(self):
        """Initialize the pattern service."""
        self._processor = PatternProcessorFactory.create_processor()
        logger.info("Initialized PatternService")
    
    async def generate_patterns(
        self, 
        text: str, 
        industry: Optional[str] = None,
        themes: Optional[List[Dict[str, Any]]] = None
    ) -> PatternResponse:
        """
        Generate patterns from text data.
        
        Args:
            text: Text to analyze
            industry: Optional industry context
            themes: Optional themes to use for pattern generation
            
        Returns:
            PatternResponse object containing the generated patterns
        """
        logger.info(f"Generating patterns with industry={industry}, themes={len(themes) if themes else 0}")
        
        # Prepare context
        context = {}
        if industry:
            context["industry"] = industry
        if themes:
            context["themes"] = themes
        
        # Process the text to generate patterns
        patterns = await self._processor.process(text, context)
        
        logger.info(f"Generated {len(patterns.patterns)} patterns")
        return patterns
    
    async def enhance_patterns(
        self, 
        patterns: List[Pattern]
    ) -> List[Pattern]:
        """
        Enhance patterns with additional information.
        
        Args:
            patterns: List of patterns to enhance
            
        Returns:
            Enhanced patterns
        """
        logger.info(f"Enhancing {len(patterns)} patterns")
        
        # Currently just returns the patterns as-is
        # This method can be expanded to add additional information
        # such as related patterns, pattern clusters, etc.
        
        return patterns
    
    async def categorize_patterns(
        self, 
        patterns: List[Pattern]
    ) -> Dict[str, List[Pattern]]:
        """
        Categorize patterns by category.
        
        Args:
            patterns: List of patterns to categorize
            
        Returns:
            Dictionary mapping categories to lists of patterns
        """
        logger.info(f"Categorizing {len(patterns)} patterns")
        
        # Group patterns by category
        categorized = {}
        for pattern in patterns:
            category = pattern.category
            if category not in categorized:
                categorized[category] = []
            categorized[category].append(pattern)
        
        logger.info(f"Categorized patterns into {len(categorized)} categories")
        return categorized
