"""
Models package for the backend.

This package contains Pydantic models used for data validation and serialization.
It also re-exports SQLAlchemy models from the main backend.models module for compatibility.
"""

# Import Pydantic models
from .transcript import TranscriptSegment, TranscriptMetadata, StructuredTranscript
from .pattern import Pattern, PatternResponse, PatternEvidence
from .research_session import (
    ResearchSession,
    ResearchExport,
    ResearchSessionCreate,
    ResearchSessionUpdate,
    ResearchSessionResponse,
    ResearchSessionSummary,
)

# Re-export SQLAlchemy models from the original location for backward compatibility
# Use the same direct import approach that works in the test

try:
    import importlib.util
    import os

    # Get the path to the main models.py file (same approach as the working test)
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_file = os.path.join(backend_dir, "models.py")

    if os.path.exists(models_file):
        spec = importlib.util.spec_from_file_location(
            "backend_models_init", models_file
        )
        backend_models = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(backend_models)

        # Extract the models using the same approach that works
        User = backend_models.User
        InterviewData = backend_models.InterviewData
        AnalysisResult = backend_models.AnalysisResult
        Persona = backend_models.Persona
        CachedPRD = backend_models.CachedPRD
        SimulationData = backend_models.SimulationData

    else:
        # Fallback if models.py doesn't exist
        User = None
        InterviewData = None
        AnalysisResult = None
        Persona = None
        CachedPRD = None
        SimulationData = None

except Exception as e:
    # Fallback for any import errors
    import logging

    logger = logging.getLogger(__name__)
    logger.warning(f"Could not import SQLAlchemy models: {e}")

    # Set to None to avoid import errors
    User = None
    InterviewData = None
    AnalysisResult = None
    Persona = None
    CachedPRD = None
    SimulationData = None


__all__ = [
    # Pydantic models
    "TranscriptSegment",
    "TranscriptMetadata",
    "StructuredTranscript",
    "Pattern",
    "PatternResponse",
    "PatternEvidence",
    "ResearchSession",
    "ResearchExport",
    "ResearchSessionCreate",
    "ResearchSessionUpdate",
    "ResearchSessionResponse",
    "ResearchSessionSummary",
    # SQLAlchemy models
    "User",
    "InterviewData",
    "AnalysisResult",
    "Persona",
    "CachedPRD",
    "SimulationData",
]
