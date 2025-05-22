"""
Persistence infrastructure package.

This package contains implementations of the repository interfaces defined in the domain layer.
These implementations handle the persistence of domain objects in the underlying storage system.
"""

from backend.infrastructure.persistence.base_repository import BaseRepository
from backend.infrastructure.persistence.interview_repository import InterviewRepository
from backend.infrastructure.persistence.analysis_repository import AnalysisRepository
from backend.infrastructure.persistence.persona_repository import PersonaRepository
from backend.infrastructure.persistence.prd_repository import PRDRepository
from backend.infrastructure.persistence.unit_of_work import UnitOfWork

__all__ = [
    'BaseRepository',
    'InterviewRepository',
    'AnalysisRepository',
    'PersonaRepository',
    'PRDRepository',
    'UnitOfWork',
]
