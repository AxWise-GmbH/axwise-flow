"""Processing event definitions and handlers"""

from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

from backend.infrastructure.state.processing_stages import ProcessingStage


class ProcessingStatus(str):
    """Processing status constants"""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    WAITING = "waiting"


@dataclass
class QualityMetrics:
    """Quality metrics for a processing stage"""

    completeness: float  # 0-1: how complete is the data
    confidence: float  # 0-1: how confident are we in the results
    reliability: float  # 0-1: how reliable is the processing
    created_at: datetime = None

    def __post_init__(self):
        self.created_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "completeness": self.completeness,
            "confidence": self.confidence,
            "reliability": self.reliability,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class StageMetadata:
    """Metadata for a processing stage"""

    stage: ProcessingStage
    status: ProcessingStatus
    message: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    quality: Optional[QualityMetrics] = None
    progress: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stage": self.stage.name,
            "status": self.status,
            "message": self.message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "error": self.error,
            "quality": self.quality.to_dict() if self.quality else None,
            "progress": self.progress,
        }


class ProcessingEvent:
    """Event emitted during processing"""

    def __init__(
        self,
        stage: ProcessingStage,
        status: ProcessingStatus,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        quality: Optional[QualityMetrics] = None,
        progress: float = 0.0,
    ):
        self.stage = stage
        self.status = status
        self.message = message
        self.metadata = metadata or {}
        self.error = error
        self.quality = quality
        self.progress = progress
        self.created_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for serialization"""
        return {
            "stage": self.stage.name,
            "status": self.status,
            "message": self.message,
            "metadata": self.metadata,
            "error": self.error,
            "quality": self.quality.to_dict() if self.quality else None,
            "progress": self.progress,
            "created_at": self.created_at.isoformat(),
        }

    @staticmethod
    def stage_started(
        stage: ProcessingStage, message: str, metadata: Optional[Dict[str, Any]] = None
    ) -> "ProcessingEvent":
        """Create a stage started event"""
        return ProcessingEvent(
            stage=stage,
            status=ProcessingStatus.IN_PROGRESS,
            message=message,
            metadata=metadata,
            progress=0.0,
        )

    @staticmethod
    def stage_completed(
        stage: ProcessingStage,
        message: str,
        quality: Optional[QualityMetrics] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ProcessingEvent":
        """Create a stage completed event"""
        return ProcessingEvent(
            stage=stage,
            status=ProcessingStatus.COMPLETED,
            message=message,
            metadata=metadata,
            quality=quality,
            progress=1.0,
        )

    @staticmethod
    def stage_failed(
        stage: ProcessingStage,
        message: str,
        error: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ProcessingEvent":
        """Create a stage failed event"""
        return ProcessingEvent(
            stage=stage,
            status=ProcessingStatus.FAILED,
            message=message,
            metadata=metadata,
            error=error,
            progress=0.0,
        )

    @staticmethod
    def stage_waiting(
        stage: ProcessingStage, message: str, metadata: Optional[Dict[str, Any]] = None
    ) -> "ProcessingEvent":
        """Create a stage waiting event"""
        return ProcessingEvent(
            stage=stage,
            status=ProcessingStatus.WAITING,
            message=message,
            metadata=metadata,
            progress=0.0,
        )
