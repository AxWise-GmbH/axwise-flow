"""Session state management for the application"""

import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from datetime import datetime

from backend.infrastructure.state.processing_stages import ProcessingStage

@dataclass
class AnalysisState:
    """Analysis state tracking"""
    current_stage: ProcessingStage = ProcessingStage.INITIALIZATION
    progress: float = 0.0
    message: str = ""

@dataclass
class PatternState:
    """Pattern tracking state"""
    patterns: List[Dict[str, Any]] = field(default_factory=list)
    pattern_metrics: Dict[str, float] = field(default_factory=dict)

@dataclass
class PersonaState:
    """Persona tracking state"""
    personas: List[Dict[str, Any]] = field(default_factory=list)
    validation_results: Dict[str, Any] = field(default_factory=dict)

class SessionState:
    """Manages session state and data persistence"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.state: Dict[str, Any] = {}
        self.metadata: Dict[str, Any] = {
            'created_at': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat()
        }
        self.analysis = AnalysisState()
        self.patterns = PatternState()
        self.personas = PersonaState()
        
    def get(self, key: str, default: Any = None) -> Any:
        """Get value from session state"""
        return self.state.get(key, default)
    
    def set(self, key: str, value: Any):
        """Set value in session state"""
        try:
            self.state[key] = value
            self.metadata['last_updated'] = datetime.now().isoformat()
            self.logger.debug(f"Set state key: {key}")
            
            # Update analysis state if needed
            if key == 'current_stage':
                try:
                    if isinstance(value, str):
                        self.analysis.current_stage = ProcessingStage.get_stage_by_name(value)
                    elif isinstance(value, ProcessingStage):
                        self.analysis.current_stage = value
                except ValueError:
                    self.logger.warning(f"Invalid stage name: {value}")
            elif key == 'progress':
                self.analysis.progress = float(value)
            elif key == 'processing_status':
                self.analysis.message = str(value)
            
        except Exception as e:
            self.logger.error(f"Error setting state key {key}: {str(e)}")
            raise
    
    def update(self, data: Dict[str, Any]):
        """Update multiple state values"""
        try:
            for key, value in data.items():
                self.set(key, value)
            self.logger.debug(f"Updated state with {len(data)} keys")
        except Exception as e:
            self.logger.error(f"Error updating state: {str(e)}")
            raise
    
    def delete(self, key: str):
        """Delete key from session state"""
        try:
            if key in self.state:
                del self.state[key]
                self.metadata['last_updated'] = datetime.now().isoformat()
                self.logger.debug(f"Deleted state key: {key}")
        except Exception as e:
            self.logger.error(f"Error deleting state key {key}: {str(e)}")
            raise
    
    def clear(self):
        """Clear all session state"""
        try:
            self.state.clear()
            self.metadata['last_updated'] = datetime.now().isoformat()
            self.analysis = AnalysisState()  # Reset analysis state
            self.patterns = PatternState()   # Reset pattern state
            self.personas = PersonaState()   # Reset persona state
            self.logger.debug("Cleared session state")
        except Exception as e:
            self.logger.error(f"Error clearing state: {str(e)}")
            raise
    
    def get_metadata(self) -> Dict[str, Any]:
        """Get session metadata"""
        return self.metadata.copy()
    
    def get_state_summary(self) -> Dict[str, Any]:
        """Get summary of current state"""
        return {
            'keys': list(self.state.keys()),
            'size': len(self.state),
            'metadata': self.get_metadata()
        }
    
    def has_key(self, key: str) -> bool:
        """Check if key exists in session state"""
        return key in self.state
    
    def get_keys(self) -> List[str]:
        """Get list of all state keys"""
        return list(self.state.keys())
    
    def get_all(self) -> Dict[str, Any]:
        """Get copy of entire state"""
        return self.state.copy()
    
    def get_state_snapshot(self) -> Dict[str, Any]:
        """Get snapshot of current state including analysis, patterns and personas"""
        # Get general state values
        snapshot = {
            'error_message': self.state.get('error_message'),
            'error_context': self.state.get('error_context'),
            'is_processing': self.state.get('is_processing', False),
            'processing_status': self.state.get('processing_status'),
            'progress': self.state.get('progress', 0.0),
            'result': self.state.get('result'),
            'current_stage': self.analysis.current_stage.name
        }
        
        # Add structured state
        snapshot.update({
            'analysis': {
                'stage': self.analysis.current_stage.name,
                'progress': self.analysis.progress,
                'message': self.analysis.message
            },
            'patterns': {
                'patterns': self.patterns.patterns,
                'metrics': self.patterns.pattern_metrics
            },
            'personas': {
                'personas': self.personas.personas,
                'validation': self.personas.validation_results
            },
            'metadata': self.get_metadata()
        })
        
        return snapshot

# Global instance
session_state = SessionState()
