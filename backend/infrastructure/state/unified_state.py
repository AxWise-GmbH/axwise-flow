"""Unified state management system"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import dataclass, field

@dataclass
class AnalysisResult:
    """Analysis result data"""
    key_points: List[str]
    tags: List[str]
    sentiment: float
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class ThemeData:
    """Theme analysis data"""
    name: str
    keywords: List[str]
    summary: str
    frequency: int
    sentiment: float
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class PersonaData:
    """Persona data"""
    role: str
    context: str
    responsibilities: List[str]
    tools: List[str]
    collaboration_style: str
    decision_process: str
    pain_points: List[str]
    needs: List[str]
    created_at: datetime = field(default_factory=datetime.now)

class UnifiedStateManager:
    """Unified state management system"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._lock = asyncio.Lock()
        
        # Analysis state
        self.interviews: Dict[str, AnalysisResult] = {}
        self.themes: Dict[str, ThemeData] = {}
        self.personas: Dict[str, PersonaData] = {}
        
        # Processing state
        self.current_stage: Optional[str] = None
        self.progress: float = 0.0
        self.error: Optional[Dict[str, Any]] = None
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        
        # Metadata
        self.metadata: Dict[str, Any] = {
            'created_at': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat()
        }
    
    async def start_processing(self, stage: str) -> None:
        """Start processing stage"""
        async with self._lock:
            if not self.started_at:
                self.started_at = datetime.now()
            
            self.current_stage = stage
            self.progress = 0.0
            self.error = None
            self._update_metadata()
            
            self.logger.info(f"Started processing stage: {stage}")
    
    async def update_progress(self, progress: float) -> None:
        """Update processing progress"""
        async with self._lock:
            if not 0 <= progress <= 1:
                raise ValueError(f"Progress must be between 0 and 1, got {progress}")
            
            self.progress = progress
            self._update_metadata()
            
            self.logger.debug(f"Updated progress: {progress:.1%}")
    
    async def complete_processing(self) -> None:
        """Complete current processing stage"""
        async with self._lock:
            self.progress = 1.0
            self.completed_at = datetime.now()
            self._update_metadata()
            
            self.logger.info(f"Completed processing stage: {self.current_stage}")
    
    async def set_error(self, error: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Set error state"""
        async with self._lock:
            self.error = {
                'message': error,
                'context': context or {},
                'stage': self.current_stage,
                'occurred_at': datetime.now().isoformat()
            }
            self._update_metadata()
            
            self.logger.error(f"Error in stage {self.current_stage}: {error}")
    
    async def add_interview_analysis(self, interview_id: str, analysis: AnalysisResult) -> None:
        """Add interview analysis result"""
        async with self._lock:
            self.interviews[interview_id] = analysis
            self._update_metadata()
    
    async def add_theme(self, theme_id: str, theme_data: ThemeData) -> None:
        """Add theme analysis data"""
        async with self._lock:
            self.themes[theme_id] = theme_data
            self._update_metadata()
    
    async def add_persona(self, persona_id: str, persona_data: PersonaData) -> None:
        """Add persona data"""
        async with self._lock:
            self.personas[persona_id] = persona_data
            self._update_metadata()
    
    def get_state(self) -> Dict[str, Any]:
        """Get complete state snapshot"""
        return {
            'processing': {
                'stage': self.current_stage,
                'progress': self.progress,
                'error': self.error,
                'started_at': self.started_at.isoformat() if self.started_at else None,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None
            },
            'analysis': {
                'interviews': {
                    id: result.__dict__ for id, result in self.interviews.items()
                },
                'themes': {
                    id: theme.__dict__ for id, theme in self.themes.items()
                },
                'personas': {
                    id: persona.__dict__ for id, persona in self.personas.items()
                }
            },
            'metadata': self.metadata
        }
    
    def _update_metadata(self) -> None:
        """Update metadata timestamps"""
        self.metadata['last_updated'] = datetime.now().isoformat()
    
    async def reset(self) -> None:
        """Reset all state"""
        async with self._lock:
            # Reset analysis state
            self.interviews.clear()
            self.themes.clear()
            self.personas.clear()
            
            # Reset processing state
            self.current_stage = None
            self.progress = 0.0
            self.error = None
            self.started_at = None
            self.completed_at = None
            
            # Reset metadata
            self.metadata = {
                'created_at': datetime.now().isoformat(),
                'last_updated': datetime.now().isoformat()
            }
            
            self.logger.info("State reset completed")

# Global instance
