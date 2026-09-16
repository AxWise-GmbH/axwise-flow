from __future__ import annotations

import os
from functools import lru_cache
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    OperationCancelResponse,
    OperationEventPage,
    OperationResponse,
)
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import OperationConflict, PostgresOperationStore


router = APIRouter(prefix="/v2/operations", tags=["AxWise workflow v2 operations"])


@lru_cache(maxsize=1)
def get_operation_service() -> OperationService:
    store = PostgresOperationStore.from_environment()
    return OperationService(store)


def _status_url(operation_id: UUID, tenant_id: UUID) -> str:
    base_url = canonical_service_origin()
    return f"{base_url}/v2/operations/{operation_id}?tenantId={tenant_id}"


def canonical_service_origin() -> str:
    configured = os.getenv("AXWISE_SERVICE_URL", "")
    parsed = urlsplit(configured)
    if (
        parsed.scheme not in {"https", "http"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("AXWISE_SERVICE_URL must be a canonical HTTP(S) origin")
    return f"{parsed.scheme}://{parsed.netloc}"


@router.post("", response_model=OperationResponse, response_model_exclude_unset=True)
async def submit_operation(
    envelope: AxWiseOperationEnvelope,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    service: OperationService = Depends(get_operation_service),
) -> OperationResponse:
    if idempotency_key != str(envelope.operation_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency-Key must equal operationId",
        )
    try:
        result = await service.submit(
            envelope,
            _status_url(envelope.operation_id, envelope.owner.tenant_id),
        )
    except OperationConflict as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if result.status in {"accepted", "running", "cancel_requested"}:
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["Retry-After"] = str(result.retry_after_seconds)
    return result


@router.get(
    "/{operation_id}",
    response_model=OperationResponse,
    response_model_exclude_unset=True,
    name="workflow_v2_operation_status",
)
async def operation_status(
    operation_id: UUID,
    tenant_id: UUID = Query(alias="tenantId"),
    service: OperationService = Depends(get_operation_service),
) -> OperationResponse:
    result = await service.status(
        tenant_id,
        operation_id,
        _status_url(operation_id, tenant_id),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="operation not found")
    return result


@router.get(
    "/{operation_id}/events",
    response_model=OperationEventPage,
    response_model_exclude_unset=True,
    name="workflow_v2_operation_events",
)
async def operation_events(
    operation_id: UUID,
    tenant_id: UUID = Query(alias="tenantId"),
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    service: OperationService = Depends(get_operation_service),
) -> OperationEventPage:
    result = await service.events(
        tenant_id,
        operation_id,
        after=after,
        limit=limit,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="operation not found")
    return result


@router.post(
    "/{operation_id}/cancel",
    response_model=OperationCancelResponse,
    response_model_exclude_unset=True,
    name="workflow_v2_operation_cancel",
)
async def cancel_operation(
    operation_id: UUID,
    response: Response,
    tenant_id: UUID = Query(alias="tenantId"),
    service: OperationService = Depends(get_operation_service),
) -> OperationCancelResponse:
    result = await service.cancel(
        tenant_id,
        operation_id,
        _status_url(operation_id, tenant_id),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="operation not found")
    if result.status == "cancel_requested":
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["Retry-After"] = str(result.retry_after_seconds)
    return result
