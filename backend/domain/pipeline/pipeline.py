"""Pipeline interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from .processor import IProcessor


class IPipeline(ABC):
    """Interface for processing pipelines"""
    
    @abstractmethod
    async def execute(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the pipeline with input data"""
        pass
    
    @abstractmethod
    def add_processor(self, processor: IProcessor) -> None:
        """Add a processor to the pipeline"""
        pass
    
    @abstractmethod
    def get_pipeline_info(self) -> Dict[str, Any]:
        """Get information about the pipeline"""
        pass
    
    @abstractmethod
    def validate_pipeline(self) -> bool:
        """Validate the pipeline configuration"""
        pass
