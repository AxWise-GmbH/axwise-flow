"""Progress tracking interface"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from enum import Enum


class ProgressStatus(Enum):
    """Progress status enumeration"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class IProgressTracker(ABC):
    """Interface for progress tracking"""
    
    @abstractmethod
    def start_tracking(self, task_id: str, total_steps: int) -> None:
        """Start tracking progress for a task"""
        pass
    
    @abstractmethod
    def update_progress(self, task_id: str, current_step: int, message: Optional[str] = None) -> None:
        """Update progress for a task"""
        pass
    
    @abstractmethod
    def complete_task(self, task_id: str, result: Optional[Dict[str, Any]] = None) -> None:
        """Mark task as completed"""
        pass
    
    @abstractmethod
    def fail_task(self, task_id: str, error: str) -> None:
        """Mark task as failed"""
        pass
    
    @abstractmethod
    def get_progress(self, task_id: str) -> Dict[str, Any]:
        """Get current progress for a task"""
        pass
