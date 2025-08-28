"""Analysis repository interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class IAnalysisRepository(ABC):
    """Interface for analysis data repository"""
    
    @abstractmethod
    async def save_analysis(self, analysis_id: str, analysis_data: Dict[str, Any]) -> bool:
        """Save analysis data"""
        pass
    
    @abstractmethod
    async def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Get analysis data by ID"""
        pass
    
    @abstractmethod
    async def list_analyses(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all analyses, optionally filtered by user"""
        pass
    
    @abstractmethod
    async def delete_analysis(self, analysis_id: str) -> bool:
        """Delete analysis data"""
        pass
    
    @abstractmethod
    async def update_analysis(self, analysis_id: str, updates: Dict[str, Any]) -> bool:
        """Update analysis data"""
        pass
