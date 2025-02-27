"""
NLP service initialization.
"""

import logging
from typing import Type

logger = logging.getLogger(__name__)

def get_nlp_processor():
    """
    Get the NLP processor class.
    
    Returns:
        Type: The NLP processor class
    """
    from .processor import NLPProcessor
    return NLPProcessor