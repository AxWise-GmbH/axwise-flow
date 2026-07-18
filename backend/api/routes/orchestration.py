"""Authenticated API for immutable assignment, planning, and recovery decisions."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List

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
    ExecutionOutcomeRecordV1,
    ExecutionOutcomeV1,
    OrchestrationDecisionRecordV1,
    ReplanRequestV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
    SqlAlchemyOutcomeStore,
)
from backend.services.orchestration.decision_service import (
    DecisionLinkError,
    IdempotencyConflict,
    OrchestrationDecisionService,
    ReplanError,
    ResearchRefreshError,
)
from backend.services.orchestration.adapters.evidence_adapter import (
    SqlAlchemyEvidenceAdapter,
)
from backend.services.orchestration.outcome_service import (
    OrchestrationOutcomeService,
    OutcomeConflict,
    OutcomeValidationError,
)
from backend.services.orchestration.scorer_registry import ScorerRegistryService


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
    registry = ScorerRegistryService(db)
    scorer = registry.active_scorer(tenant.orgId) if tenant is not None else None
    return OrchestrationDecisionService(
        SqlAlchemyDecisionStore(db),
        scorer=scorer,
        evidence_port=SqlAlchemyEvidenceAdapter(db),
        research_port=research_port,
        outcome_learning_port=registry if tenant is not None else None,
    )


def _outcome_service(db: Session) -> OrchestrationOutcomeService:
    return OrchestrationOutcomeService(
        SqlAlchemyDecisionStore(db),
        SqlAlchemyOutcomeStore(db),
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
    except DecisionLinkError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=detail)
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


@router.post(
    "/decisions/{decision_id}/outcomes",
    response_model=ExecutionOutcomeRecordV1,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an idempotent decision and plan-node execution outcome",
    description=(
        "Stores Orqaly's raw execution observations, validates every node receipt "
        "against the immutable plan, and derives a versioned evaluation without "
        "granting AxWise execution authority."
    ),
)
async def submit_orchestration_outcome(
    decision_id: str,
    outcome: ExecutionOutcomeV1,
    response: Response,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ExecutionOutcomeRecordV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        record = _outcome_service(db).ingest(
            decision_id=decision_id,
            outcome=outcome,
            external_org_id=tenant.orgId,
            external_user_id=tenant.userId,
            user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
        )
    except OutcomeConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except OutcomeValidationError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=detail)
    response.status_code = status.HTTP_200_OK if record.reused else status.HTTP_201_CREATED
    return record


@router.get(
    "/decisions/{decision_id}/outcomes",
    response_model=List[ExecutionOutcomeRecordV1],
    summary="List tenant-scoped immutable outcomes for a decision",
)
async def list_orchestration_outcomes(
    decision_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> List[ExecutionOutcomeRecordV1]:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        return _outcome_service(db).list_for_decision(
            decision_id,
            tenant.orgId,
            tenant.userId,
            user.user_id,
        )
    except OutcomeValidationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get(
    "/schemas/decision-request-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the published Phase 1–3 decision-request JSON Schema",
)
async def get_decision_request_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return DecisionCreateRequestV1.model_json_schema(by_alias=True)


@router.get(
    "/schemas/execution-outcome-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the published Phase 4 execution-outcome JSON Schema",
)
async def get_execution_outcome_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return ExecutionOutcomeV1.model_json_schema()
