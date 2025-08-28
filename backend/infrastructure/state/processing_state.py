"""Processing state management"""

from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from dataclasses import dataclass, field
from backend.infrastructure.events.processing_events import (
    ProcessingStage,
    ProcessingStatus,
    ProcessingEvent,
    QualityMetrics,
    StageMetadata
)

@dataclass
class ProcessState:
    """State of the processing pipeline"""
    stage_states: Dict[ProcessingStage, StageMetadata] = field(default_factory=dict)
    events: List[ProcessingEvent] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_stage: Optional[ProcessingStage] = None
    error_state: Optional[Dict[str, Any]] = None
    _progress: float = field(default=0.0)
    
    def __post_init__(self):
        """Initialize empty state for all stages"""
        self.stage_states.clear()  # Ensure clean state
        for stage in ProcessingStage:
            self.stage_states[stage] = StageMetadata(
                stage=stage,
                status=ProcessingStatus.PENDING,
                message="Not started",
                started_at=None,
                progress=0.0
            )
    
    def _get_stage(self, stage: Union[str, ProcessingStage]) -> ProcessingStage:
        """Convert string stage name to ProcessingStage enum"""
        if isinstance(stage, str):
            try:
                return ProcessingStage[stage.upper()]
            except KeyError:
                raise ValueError(f"Invalid stage name: {stage}")
        return stage
    
    def start_stage(self, stage: Union[str, ProcessingStage], message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Start a processing stage"""
        stage = self._get_stage(stage)
        
        if not self.started_at:
            self.started_at = datetime.now()
        
        self.current_stage = stage
        state = StageMetadata(
            stage=stage,
            status=ProcessingStatus.IN_PROGRESS,
            message=message,
            started_at=datetime.now(),
            progress=0.0
        )
        self.stage_states[stage] = state
        
        # Create and store event
        event = ProcessingEvent.stage_started(stage, message, metadata)
        self.events.append(event)
    
    def complete_stage(self,
                      stage: Union[str, ProcessingStage],
                      message: str,
                      quality: Optional[QualityMetrics] = None,
                      metadata: Optional[Dict[str, Any]] = None) -> None:
        """Complete a processing stage"""
        stage = self._get_stage(stage)
        
        if stage not in self.stage_states:
            raise ValueError(f"Stage {stage} not found in state")
        
        current_state = self.stage_states[stage]
        self.stage_states[stage] = StageMetadata(
            stage=stage,
            status=ProcessingStatus.COMPLETED,
            message=message,
            started_at=current_state.started_at or datetime.now(),
            completed_at=datetime.now(),
            quality=quality,
            progress=1.0
        )
        
        # Create and store event
        event = ProcessingEvent.stage_completed(stage, message, quality, metadata)
        self.events.append(event)
        
        # Update overall progress
        self._update_overall_progress()
        
        # Check if this was the final stage
        if stage == ProcessingStage.COMPLETION:
            self.completed_at = datetime.now()
            self._progress = 1.0
    
    def fail_stage(self,
                  stage: Union[str, ProcessingStage],
                  message: str,
                  error: str,
                  metadata: Optional[Dict[str, Any]] = None) -> None:
        """Mark a stage as failed"""
        stage = self._get_stage(stage)
        
        if stage not in self.stage_states:
            raise ValueError(f"Stage {stage} not found in state")
        
        current_state = self.stage_states[stage]
        self.stage_states[stage] = StageMetadata(
            stage=stage,
            status=ProcessingStatus.FAILED,
            message=message,
            started_at=current_state.started_at or datetime.now(),
            completed_at=datetime.now(),
            error=error,
            progress=current_state.progress  # Preserve progress
        )
        
        self.error_state = {
            'stage': stage.name,
            'message': message,
            'error': error,
            'occurred_at': datetime.now().isoformat()
        }
        
        # Create and store event
        event = ProcessingEvent.stage_failed(stage, message, error, metadata)
        self.events.append(event)
    
    def set_stage_waiting(self,
                         stage: Union[str, ProcessingStage],
                         message: str,
                         metadata: Optional[Dict[str, Any]] = None) -> None:
        """Set a stage to waiting status"""
        stage = self._get_stage(stage)
        
        if stage not in self.stage_states:
            raise ValueError(f"Stage {stage} not found in state")
        
        current_state = self.stage_states[stage]
        self.stage_states[stage] = StageMetadata(
            stage=stage,
            status=ProcessingStatus.WAITING,
            message=message,
            started_at=current_state.started_at or datetime.now(),
            progress=current_state.progress  # Preserve progress
        )
        
        # Create and store event
        event = ProcessingEvent.stage_waiting(stage, message, metadata)
        self.events.append(event)
    
    def update_progress(self, stage: Union[str, ProcessingStage], progress: float) -> None:
        """Update progress for the current stage"""
        stage = self._get_stage(stage)
        
        if stage not in self.stage_states:
            raise ValueError(f"Stage {stage} not found in state")
        
        if not 0 <= progress <= 1:
            raise ValueError(f"Progress must be between 0 and 1, got {progress}")
        
        current_state = self.stage_states[stage]
        self.stage_states[stage] = StageMetadata(
            stage=stage,
            status=ProcessingStatus.IN_PROGRESS,
            message=current_state.message,
            started_at=current_state.started_at or datetime.now(),
            progress=progress
        )
        
        # Update overall progress
        self._update_overall_progress()
    
    def _update_overall_progress(self) -> None:
        """Update overall progress based on stage progress"""
        total_progress = sum(
            state.progress or 0.0
            for state in self.stage_states.values()
        )
        self._progress = total_progress / len(self.stage_states)
    
    def get_stage_state(self, stage: Union[str, ProcessingStage]) -> StageMetadata:
        """Get the state of a specific stage"""
        stage = self._get_stage(stage)
        return self.stage_states[stage]
    
    def get_current_state(self) -> Dict[str, Any]:
        """Get the current state of processing"""
        stage_states = {}
        for stage, state in self.stage_states.items():
            stage_states[stage.name] = {
                'status': state.status.value,
                'message': state.message,
                'started_at': state.started_at.isoformat() if state.started_at else None,
                'completed_at': state.completed_at.isoformat() if state.completed_at else None,
                'error': state.error,
                'quality': state.quality.to_dict() if state.quality else None,
                'progress': state.progress
            }
        
        return {
            'current_stage': self.current_stage.name if self.current_stage else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'stage_states': stage_states,
            'error_state': self.error_state,
            'event_count': len(self.events),
            'progress': self._progress
        }
    
    def get_quality_metrics(self) -> Dict[ProcessingStage, Optional[QualityMetrics]]:
        """Get quality metrics for all stages"""
        return {
            stage: state.quality
            for stage, state in self.stage_states.items()
            if state.quality is not None
        }
    
    def get_events_since(self, timestamp: datetime) -> List[ProcessingEvent]:
        """Get all events since the given timestamp"""
        return [
            event for event in self.events
            if event.created_at > timestamp
        ]
    
    def reset(self) -> None:
        """Reset the processing state"""
        self.events.clear()
        self.started_at = None
        self.completed_at = None
        self.current_stage = None
        self.error_state = None
        self._progress = 0.0
        self.__post_init__()  # Reinitialize stage states
