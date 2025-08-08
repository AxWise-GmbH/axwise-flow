"""
FastAPI dependencies.

This module provides dependency functions for FastAPI endpoints, using the
dependency injection container to create and manage service instances.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.external.auth_middleware import get_current_user

# Import SQLAlchemy models from centralized package to avoid duplicate registration
from backend.models import User
from backend.infrastructure.container import Container
from backend.infrastructure.persistence.unit_of_work import UnitOfWork

logger = logging.getLogger(__name__)

# Global container instance
_container = Container()


def get_container() -> Container:
    """
    Get the dependency injection container.

    Returns:
        Container instance
    """
    return _container


def get_unit_of_work(db: Session = Depends(get_db)) -> UnitOfWork:
    """
    Get a Unit of Work instance.

    Args:
        db: Database session

    Returns:
        Unit of Work instance
    """
    # Create a UnitOfWork that uses the provided session
    return UnitOfWork(lambda: db)


async def get_interview_repository(uow: UnitOfWork = Depends(get_unit_of_work)):
    """
    Get the interview repository.

    Args:
        uow: Unit of Work instance

    Returns:
        Interview repository instance
    """
    # Enter the UnitOfWork context to initialize repositories
    with uow as unit_of_work:
        return unit_of_work.interviews


async def get_analysis_repository(uow: UnitOfWork = Depends(get_unit_of_work)):
    """
    Get the analysis repository.

    Args:
        uow: Unit of Work instance

    Returns:
        Analysis repository instance
    """
    # Enter the UnitOfWork context to initialize repositories
    with uow as unit_of_work:
        return unit_of_work.analyses


# These will be implemented when the services are created
async def get_interview_service(
    uow: UnitOfWork = Depends(get_unit_of_work), user: User = Depends(get_current_user)
):
    """
    Get the interview service.

    Args:
        uow: Unit of Work instance
        user: Current authenticated user

    Returns:
        Interview service instance
    """
    # This will be implemented when the service is created
    raise NotImplementedError("Interview service not yet implemented")


async def get_analysis_service(
    uow: UnitOfWork = Depends(get_unit_of_work), user: User = Depends(get_current_user)
):
    """
    Get the analysis service.

    Args:
        uow: Unit of Work instance
        user: Current authenticated user

    Returns:
        Analysis service instance
    """
    # This will be implemented when the service is created
    raise NotImplementedError("Analysis service not yet implemented")


async def get_persona_service(
    uow: UnitOfWork = Depends(get_unit_of_work), user: User = Depends(get_current_user)
):
    """
    Get the persona service.

    Args:
        uow: Unit of Work instance
        user: Current authenticated user

    Returns:
        Persona service instance
    """
    # This will be implemented when the service is created
    raise NotImplementedError("Persona service not yet implemented")


async def get_prd_service(
    uow: UnitOfWork = Depends(get_unit_of_work), user: User = Depends(get_current_user)
):
    """
    Get the PRD service.

    Args:
        uow: Unit of Work instance
        user: Current authenticated user

    Returns:
        PRD service instance
    """
    # This will be implemented when the service is created
    raise NotImplementedError("PRD service not yet implemented")
