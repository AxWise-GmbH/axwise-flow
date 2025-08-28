"""NLP processor interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List


class INLPProcessor(ABC):
    """Interface for NLP processing services"""
    
    @abstractmethod
    def process_text(self, text: str) -> Dict[str, Any]:
        """Process text and return analysis results"""
        pass
    
    @abstractmethod
    def extract_patterns(self, texts: List[str]) -> List[Dict[str, Any]]:
        """Extract patterns from multiple texts"""
        pass
