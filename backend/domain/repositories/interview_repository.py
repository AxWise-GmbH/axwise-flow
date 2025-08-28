"""Interview repository interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class IInterviewRepository(ABC):
    """Interface for interview data repository"""
    
    @abstractmethod
    async def save_interview(self, interview_id: str, interview_data: Dict[str, Any]) -> bool:
        """Save interview data"""
        pass
    
    @abstractmethod
    async def get_interview(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get interview data by ID"""
        pass
    
    @abstractmethod
    async def list_interviews(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all interviews, optionally filtered by user"""
        pass
    
    @abstractmethod
    async def delete_interview(self, interview_id: str) -> bool:
        """Delete interview data"""
        pass
    
    @abstractmethod
    async def update_interview(self, interview_id: str, updates: Dict[str, Any]) -> bool:
        """Update interview data"""
        pass
    
    @abstractmethod
    async def search_interviews(self, query: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search interviews by content"""
        pass
