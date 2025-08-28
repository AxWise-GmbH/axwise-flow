"""Pipeline processor interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class IProcessor(ABC):
    """Interface for pipeline processors"""
    
    @abstractmethod
    async def process(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process data and return results"""
        pass
    
    @abstractmethod
    def get_processor_info(self) -> Dict[str, Any]:
        """Get information about the processor"""
        pass
    
    @abstractmethod
    def validate_input(self, data: Dict[str, Any]) -> bool:
        """Validate input data"""
        pass
