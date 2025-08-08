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
# Use a centralized import mechanism to avoid SQLAlchemy registry conflicts

# Global cache to ensure we only import models once
_models_cache = None


def _get_sqlalchemy_models():
    """Get SQLAlchemy models using a centralized import mechanism."""
    global _models_cache

    if _models_cache is not None:
        return _models_cache

    try:
        import importlib.util
        import os

        # Get the path to the main models.py file
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        models_file = os.path.join(backend_dir, "models.py")

        if os.path.exists(models_file):
            # Use a stable module name to avoid multiple executions and registry conflicts
            spec = importlib.util.spec_from_file_location(
                "backend_sqlalchemy_models_centralized", models_file
            )
            backend_models = importlib.util.module_from_spec(spec)
            # Only execute if not already loaded to prevent duplicate mappers
            import sys as _sys

            if "backend_sqlalchemy_models_centralized" not in _sys.modules:
                spec.loader.exec_module(backend_models)
                _sys.modules["backend_sqlalchemy_models_centralized"] = backend_models
            else:
                backend_models = _sys.modules["backend_sqlalchemy_models_centralized"]

            _models_cache = {
                "User": backend_models.User,
                "InterviewData": backend_models.InterviewData,
                "AnalysisResult": backend_models.AnalysisResult,
                "Persona": getattr(backend_models, "Persona", None),
                "CachedPRD": getattr(backend_models, "CachedPRD", None),
                "SimulationData": getattr(backend_models, "SimulationData", None),
            }
        else:
            _models_cache = {
                "User": None,
                "InterviewData": None,
                "AnalysisResult": None,
                "Persona": None,
                "CachedPRD": None,
                "SimulationData": None,
            }

    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Could not import SQLAlchemy models: {e}")

        _models_cache = {
            "User": None,
            "InterviewData": None,
            "AnalysisResult": None,
            "Persona": None,
            "CachedPRD": None,
            "SimulationData": None,
        }

    return _models_cache


# Get the models
_models = _get_sqlalchemy_models()
User = _models["User"]
InterviewData = _models["InterviewData"]
AnalysisResult = _models["AnalysisResult"]
Persona = _models["Persona"]
CachedPRD = _models["CachedPRD"]
SimulationData = _models["SimulationData"]


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
