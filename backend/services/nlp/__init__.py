"""
NLP service initialization.

This module provides the NLP processing capabilities including:
- Parsers: Free text, Q/A format, transcript combination
- Analyzers: Sentiment, stakeholder, industry detection
- Generators: Pattern enrichment, recommendations
"""

import logging

logger = logging.getLogger(__name__)


def get_nlp_processor():
    """
    Get the NLP processor class.

    Returns:
        Type: The NLP processor class
    """
    from .processor import NLPProcessor

    return NLPProcessor


# Lazy imports for submodules
def get_parsers():
    """Get the parsers module."""
    from . import parsers

    return parsers


def get_analyzers():
    """Get the analyzers module."""
    from . import analyzers

    return analyzers


def get_generators():
    """Get the generators module."""
    from . import generators

    return generators


def get_data_extraction():
    """Get the data extraction module."""
    from . import data_extraction

    return data_extraction


def get_helpers():
    """Get the helpers module."""
    from . import helpers

    return helpers


__all__ = [
    "get_nlp_processor",
    "get_parsers",
    "get_analyzers",
    "get_generators",
    "get_data_extraction",
    "get_helpers",
]