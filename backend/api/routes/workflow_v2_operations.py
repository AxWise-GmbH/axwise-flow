from __future__ import annotations

from functools import lru_cache
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    OperationResponse,
)
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import OperationConflict, PostgresOperationStore


router = APIRouter(prefix="/v2/operations", tags=["AxWise workflow v2 operations"])


@lru_cache(maxsize=1)
def get_operation_service() -> OperationService:
    from backend.services.workflow_v2.cognitive_executor import build_cognitive_executor

    store = PostgresOperationStore.from_environment()
    return OperationService(store, build_cognitive_executor(store))


def _status_url(request: Request, operation_id: UUID) -> str:
    return str(request.url_for("workflow_v2_operation_status", operation_id=str(operation_id)))


@router.post("", response_model=OperationResponse, response_model_exclude_none=True)
async def submit_operation(
    envelope: AxWiseOperationEnvelope,
    request: Request,
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
            _status_url(request, envelope.operation_id),
        )
    except OperationConflict as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if result.status in {"accepted", "running"}:
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["Retry-After"] = str(result.retry_after_seconds)
    return result


@router.get(
    "/{operation_id}",
    response_model=OperationResponse,
    response_model_exclude_none=True,
    name="workflow_v2_operation_status",
)
async def operation_status(
    operation_id: UUID,
    request: Request,
    service: OperationService = Depends(get_operation_service),
) -> OperationResponse:
    result = await service.status(operation_id, _status_url(request, operation_id))
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="operation not found")
    return result
