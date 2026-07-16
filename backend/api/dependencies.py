"""
FastAPI dependencies.

This module provides dependency functions for FastAPI endpoints, using the
dependency injection container to create and manage service instances.
"""

import logging
import os
import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.external.auth_middleware import get_current_user

# Import SQLAlchemy models from centralized package to avoid duplicate registration
from backend.models import OrqalyTenantMapping, User
from backend.infrastructure.container import Container
from backend.infrastructure.persistence.unit_of_work import UnitOfWork

logger = logging.getLogger(__name__)

# Global container instance
_container = Container()


class TenantContext(BaseModel):
    """Verified external tenant identifiers supplied by the Orqaly backend."""

    userId: str = Field(..., description="Unique user ID from Orqaly")
    orgId: str = Field(..., description="Unique organization/tenant ID")


def tenant_context_from_headers(
    x_orqaly_org_id: str = Header(..., alias="X-Orqaly-Org-ID"),
    x_orqaly_user_id: str = Header(..., alias="X-Orqaly-User-ID"),
) -> TenantContext:
    """Build verified external tenant context from M2M request headers."""
    return TenantContext(orgId=x_orqaly_org_id, userId=x_orqaly_user_id)


async def verify_orqaly_service_key(
    x_axwise_key: Optional[str] = Header(
        None,
        alias="x-axwise-key",
        description="API key for secure service-to-service integration",
    ),
) -> str:
    """Validate the Orqaly machine credential using constant-time comparison."""
    expected_key = os.getenv("AXWISE_API_KEY")
    if not expected_key:
        logger.error("AXWISE_API_KEY is not configured for service-to-service requests")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service authentication is not configured",
        )
    if not x_axwise_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing secure x-axwise-key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    if not secrets.compare_digest(x_axwise_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid service key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return x_axwise_key


def resolve_orqaly_tenant_user(
    db: Session, tenant: TenantContext, partner_id: str = "orqaly"
) -> User:
    """Resolve external tenant identity through a persisted active mapping."""
    mapping = (
        db.query(OrqalyTenantMapping)
        .filter(
            OrqalyTenantMapping.partner_id == partner_id,
            OrqalyTenantMapping.external_org_id == tenant.orgId,
            OrqalyTenantMapping.external_user_id == tenant.userId,
            OrqalyTenantMapping.active.is_(True),
        )
        .first()
    )
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Orqaly tenant is not mapped to an AxWise workspace",
        )
    user = db.query(User).filter(User.user_id == mapping.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mapped AxWise workspace is unavailable",
        )
    return user


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
