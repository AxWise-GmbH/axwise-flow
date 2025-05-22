"""
Models package for the backend.

This package contains Pydantic models used for data validation and serialization.
It also re-exports SQLAlchemy models from the main backend.models module for compatibility.
"""

# Import Pydantic models
from backend.models.transcript import TranscriptSegment, TranscriptMetadata, StructuredTranscript
from backend.models.pattern import Pattern, PatternResponse, PatternEvidence

# Re-export SQLAlchemy models from the original location for backward compatibility
# Use importlib to avoid circular imports
import sys
import importlib.util
import os

# Get the absolute path to the backend directory
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Import the models from the original models.py file
models_path = os.path.join(backend_dir, "models.py")
spec = importlib.util.spec_from_file_location("backend_models", models_path)
backend_models = importlib.util.module_from_spec(spec)
sys.modules["backend_models"] = backend_models
spec.loader.exec_module(backend_models)

# Re-export the models
User = backend_models.User
InterviewData = backend_models.InterviewData
AnalysisResult = backend_models.AnalysisResult
Persona = backend_models.Persona
CachedPRD = backend_models.CachedPRD

__all__ = [
    # Pydantic models
    'TranscriptSegment',
    'TranscriptMetadata',
    'StructuredTranscript',
    'Pattern',
    'PatternResponse',
    'PatternEvidence',

    # SQLAlchemy models
    'User',
    'InterviewData',
    'AnalysisResult',
    'Persona',
    'CachedPRD',
]
