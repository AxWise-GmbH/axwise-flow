"""
NLP Generators module.

This module contains generators for creating enriched content:
- Pattern descriptions
- Recommendations
- Impact statements
"""

from .pattern_enrichment import PatternEnricher
from .recommendations import RecommendationGenerator

__all__ = [
    "PatternEnricher",
    "RecommendationGenerator",
]

