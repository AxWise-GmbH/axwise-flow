"""Authenticated API for immutable assignment, planning, and recovery decisions."""

from __future__ import annotations

from typing import Annotated, Any, Dict

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from backend.api.dependencies import (
    TenantContext,
    resolve_orqaly_tenant_user,
    tenant_context_from_headers,
    verify_orqaly_service_key,
)
from backend.database import get_db
from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    OrchestrationDecisionRecordV1,
    ReplanRequestV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
)
from backend.services.orchestration.decision_service import (
    IdempotencyConflict,
    OrchestrationDecisionService,
    ReplanError,
    ResearchRefreshError,
)
from backend.services.orchestration.adapters.evidence_adapter import (
    SqlAlchemyEvidenceAdapter,
)


router = APIRouter(
    prefix="/api/orqaly-axwise/v1/orchestration",
    tags=["Orchestration Decisions"],
)


def _service(
    db: Session,
    user=None,
    tenant: TenantContext | None = None,
) -> OrchestrationDecisionService:
    research_port = None
    if user is not None and tenant is not None:
        from backend.api.research.simulation_bridge.router import orchestrator
        from backend.services.orchestration.adapters.hybrid_research_adapter import (
            HybridResearchAdapter,
        )
        from backend.services.orqaly_hybrid_run_service import HybridRunService

        research_port = HybridResearchAdapter(
            HybridRunService(orchestrator),
            user,
            tenant.orgId,
            tenant.userId,
        )
    return OrchestrationDecisionService(
        SqlAlchemyDecisionStore(db),
        evidence_port=SqlAlchemyEvidenceAdapter(db),
        research_port=research_port,
    )


@router.post(
    "/decisions",
    response_model=OrchestrationDecisionRecordV1,
    status_code=status.HTTP_201_CREATED,
    summary="Create an immutable evidence-aware assignment or team decision",
    description=(
        "Routes a verified task through direct, existing-evidence, bounded A+B research, "
        "or human clarification before applying hard eligibility, weighted assignment, "
        "and optional validated team planning. "
        "The result is advisory and always requires Orqaly authorization."
    ),
)
async def create_orchestration_decision(
    request: Annotated[
        DecisionCreateRequestV1,
        Body(openapi_examples=ORCHESTRATION_DECISION_EXAMPLES),
    ],
    response: Response,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    request_id: str | None = Header(default=None, alias="X-Request-ID"),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> OrchestrationDecisionRecordV1:
    tenant = TenantContext(
        userId=request.tenant.user_id,
        orgId=request.tenant.org_id,
    )
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        record = _service(db, user, tenant).create(
            request=request,
            user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
            request_id=request_id,
        )
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    response.status_code = status.HTTP_200_OK if record.reused else status.HTTP_201_CREATED
    return record


@router.post(
    "/decisions/{decision_id}/research/refresh",
    response_model=OrchestrationDecisionRecordV1,
    status_code=status.HTTP_201_CREATED,
    summary="Resume a research-assisted decision and immutably rescore evidence",
)
async def refresh_orchestration_research(
    decision_id: str,
    response: Response,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    request_id: str | None = Header(default=None, alias="X-Request-ID"),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> OrchestrationDecisionRecordV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        refreshed = _service(db, user, tenant).refresh_research(
            decision_id=decision_id,
            external_org_id=tenant.orgId,
            external_user_id=tenant.userId,
            user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
            request_id=request_id,
        )
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ResearchRefreshError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)
    if refreshed.pending:
        response.status_code = status.HTTP_202_ACCEPTED
    elif refreshed.record.reused:
        response.status_code = status.HTTP_200_OK
    else:
        response.status_code = status.HTTP_201_CREATED
    return refreshed.record


@router.post(
    "/decisions/{decision_id}/replan",
    response_model=OrchestrationDecisionRecordV1,
    status_code=status.HTTP_201_CREATED,
    summary="Create a linked immutable recovery plan",
    description=(
        "Replans from authenticated execution-state changes without rewriting the "
        "parent decision. Supported triggers are agent unavailability, tool failure, "
        "output rejection, budget change, and human override."
    ),
)
async def replan_orchestration_decision(
    decision_id: str,
    change: ReplanRequestV1,
    response: Response,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    request_id: str | None = Header(default=None, alias="X-Request-ID"),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> OrchestrationDecisionRecordV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        record = _service(db, user, tenant).replan(
            decision_id=decision_id,
            change=change,
            external_org_id=tenant.orgId,
            external_user_id=tenant.userId,
            user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
            request_id=request_id,
        )
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ReplanError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=detail)
    response.status_code = status.HTTP_200_OK if record.reused else status.HTTP_201_CREATED
    return record


@router.get(
    "/decisions/{decision_id}",
    response_model=OrchestrationDecisionRecordV1,
    summary="Retrieve an immutable tenant-scoped orchestration decision",
)
async def get_orchestration_decision(
    decision_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> OrchestrationDecisionRecordV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    record = _service(db).get(
        decision_id,
        tenant.orgId,
        tenant.userId,
        user.user_id,
    )
    if not record:
        raise HTTPException(status_code=404, detail="Orchestration decision not found")
    return record


@router.get(
    "/schemas/decision-request-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the published Phase 1–3 decision-request JSON Schema",
)
async def get_decision_request_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return DecisionCreateRequestV1.model_json_schema(by_alias=True)
