"""Shared processing stage definitions"""

from enum import Enum, auto

class ProcessingStage(Enum):
    """Processing stages"""
    # System States
    IDLE = auto()
    INITIALIZATION = auto()
    
    # Data Processing
    FILE_UPLOAD = auto()
    FILE_VALIDATION = auto()
    DATA_VALIDATION = auto()
    PREPROCESSING = auto()
    
    # Analysis States
    ANALYSIS = auto()
    THEME_EXTRACTION = auto()
    KEYWORD_GROUPING = auto()
    SENTIMENT_ANALYSIS = auto()
    
    # Pattern Recognition
    PATTERN_DETECTION = auto()
    BEHAVIORAL_ANALYSIS = auto()
    TOOL_USAGE_ANALYSIS = auto()
    DECISION_PROCESS_ANALYSIS = auto()
    
    # Persona Formation
    PERSONA_FORMATION = auto()
    ROLE_CONTEXT_ANALYSIS = auto()
    COLLABORATION_ANALYSIS = auto()
    NEEDS_ANALYSIS = auto()
    
    # Final States
    INSIGHT_GENERATION = auto()
    VALIDATION = auto()
    COMPLETION = auto()
    
    @classmethod
    def get_stage_order(cls) -> dict:
        """Get the expected order of stages"""
        stages = list(cls)
        return {stage: idx for idx, stage in enumerate(stages)}
    
    @classmethod
    def get_stage_by_name(cls, name: str) -> 'ProcessingStage':
        """Get stage by name (case insensitive)"""
        try:
            return cls[name.upper()]
        except KeyError:
            raise ValueError(f"Invalid stage name: {name}")
    
    def get_progress_weight(self) -> float:
        """Get weight for progress calculation"""
        stage_weights = {
            # System States (5%)
            self.IDLE: 0.01,
            self.INITIALIZATION: 0.04,
            
            # Data Processing (15%)
            self.FILE_UPLOAD: 0.05,
            self.FILE_VALIDATION: 0.05,
            self.DATA_VALIDATION: 0.02,
            self.PREPROCESSING: 0.03,
            
            # Analysis States (25%)
            self.ANALYSIS: 0.05,
            self.THEME_EXTRACTION: 0.08,
            self.KEYWORD_GROUPING: 0.07,
            self.SENTIMENT_ANALYSIS: 0.05,
            
            # Pattern Recognition (25%)
            self.PATTERN_DETECTION: 0.08,
            self.BEHAVIORAL_ANALYSIS: 0.07,
            self.TOOL_USAGE_ANALYSIS: 0.05,
            self.DECISION_PROCESS_ANALYSIS: 0.05,
            
            # Persona Formation (20%)
            self.PERSONA_FORMATION: 0.05,
            self.ROLE_CONTEXT_ANALYSIS: 0.05,
            self.COLLABORATION_ANALYSIS: 0.05,
            self.NEEDS_ANALYSIS: 0.05,
            
            # Final States (10%)
            self.INSIGHT_GENERATION: 0.04,
            self.VALIDATION: 0.03,
            self.COMPLETION: 0.03
        }
        return stage_weights.get(self, 0.01)  # Default weight for unknown stages