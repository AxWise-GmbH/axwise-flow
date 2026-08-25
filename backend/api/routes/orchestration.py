"""Authenticated API for immutable assignment, planning, and recovery decisions."""

from __future__ import annotations

import uuid
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
from backend.domain.orchestration.scope_models import (
    QualityContractV1,
    ScopeClarificationAnswerRequestV1,
    ScopeConsumerDispatchV1,
    ScopeContinuationBindingV1,
    ScopeContinuationRequestV1,
    ScopeCorrectionAcceptanceV1,
    ScopeCorrectionPollV1,
    ScopeCorrectionRecordV1,
    ScopeCorrectionRequestV1,
    ScopePacketV1,
    ScopeProposalAcceptanceRequestV1,
    ScopeProposalAcceptanceV1,
    ScopeProposalCorrectionRequestV1,
    ScopeResearchCompletionRefV1,
    ScopeStateV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
    SqlAlchemyOutcomeStore,
    SqlAlchemyScopeCorrectionStore,
    SqlAlchemyScopeAcceptanceStore,
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
from backend.services.orchestration.scope_contract_service import ScopeContractError
from backend.services.orchestration.scope_correction_service import (
    PydanticAIScopeSemanticInterpreter,
    ScopeCorrectionConflict,
    ScopeCorrectionInProgress,
    ScopeCorrectionParentError,
    ScopeCorrectionService,
)
from backend.services.orchestration.scope_proposal_service import (
    ScopeAcceptanceConflict,
    ScopeProposalError,
    ScopeProposalService,
)
from backend.services.orchestration.scorer_registry import ScorerRegistryService
from backend.services.orchestration.scope_decision_projection import (
    build_scope_decision_projection,
)


router = APIRouter(
    prefix="/api/orqaly-axwise/v1/orchestration",
    tags=["Orchestration Decisions"],
)


def _correlation_id(request_id: str | None) -> str:
    """Return the caller trace id, or generate one for safe error correlation."""
    value = (request_id or "").strip()
    return value[:255] if value else str(uuid.uuid4())


def _contract_error(
    status_code: int,
    code: str,
    message: str,
    request_id: str,
) -> HTTPException:
    """Expose a bounded machine-readable error without tenant snapshots."""
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message[:500],
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
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
            HybridRunService(orchestrator, atomic_session=db),
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
        scope_correction_store=SqlAlchemyScopeCorrectionStore(db),
        scope_proposal_service=_scope_proposal_service(db),
    )


def _outcome_service(db: Session) -> OrchestrationOutcomeService:
    return OrchestrationOutcomeService(
        SqlAlchemyDecisionStore(db),
        SqlAlchemyOutcomeStore(db),
    )


def _scope_correction_service(
    db: Session,
    *,
    with_interpreter: bool = True,
) -> ScopeCorrectionService:
    return ScopeCorrectionService(
        parent_store=SqlAlchemyDecisionStore(db),
        correction_store=SqlAlchemyScopeCorrectionStore(db),
        interpreter=None,
        interpreter_factory=(
            PydanticAIScopeSemanticInterpreter if with_interpreter else None
        ),
    )


def _scope_proposal_service(db: Session) -> ScopeProposalService:
    return ScopeProposalService(
        decision_store=SqlAlchemyDecisionStore(db),
        correction_store=SqlAlchemyScopeCorrectionStore(db),
        acceptance_store=SqlAlchemyScopeAcceptanceStore(db),
    )


@router.post(
    "/decisions/{decision_id}/scope/corrections",
    include_in_schema=False,
    status_code=status.HTTP_410_GONE,
)
async def create_scope_correction(
    decision_id: str,
    request: ScopeCorrectionRequestV1,
    _service_key: str = Depends(verify_orqaly_service_key),
) -> ScopeCorrectionRecordV1:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "full scope correction envelopes are retired; revise the immutable "
            "proposal through /scope/proposals/{proposal_id}/corrections"
        ),
    )


@router.post(
    "/scope/proposals/{proposal_decision_id}/corrections",
    response_model=ScopeCorrectionPollV1,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Reserve a compact correction against one immutable scope proposal",
    description=(
        "The caller sends only proposal identity plus owner prose. AxWise reloads "
        "the sealed packet and authority snapshot internally before reserving any "
        "model work. Poll the returned correction identity until terminal."
    ),
)
async def create_proposal_scope_correction(
    proposal_decision_id: str,
    request: ScopeProposalCorrectionRequestV1,
    response: Response,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    request_id: str | None = Header(default=None, alias="X-Request-ID"),
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeCorrectionPollV1:
    correlation_id = _correlation_id(request_id)
    if proposal_decision_id != request.proposal_decision_id:
        raise _contract_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "AXWISE_SCOPE_CORRECTION_PARENT_INVALID",
            "path proposal_decision_id does not match the correction request",
            correlation_id,
        )
    if tenant.orgId != request.org_id or tenant.userId != request.user_id:
        raise _contract_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "AXWISE_SCOPE_CORRECTION_PARENT_INVALID",
            "tenant headers do not match the correction request",
            correlation_id,
        )
    tenant = TenantContext(userId=request.user_id, orgId=request.org_id)
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        service = _scope_correction_service(db)
        reservation = service.reserve_from_proposal(
            request,
            internal_user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
        )
        record = reservation.record
    except ScopeCorrectionParentError as exc:
        detail = str(exc)
        code = (
            status.HTTP_404_NOT_FOUND
            if "not found" in detail
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise _contract_error(
            code,
            "AXWISE_SCOPE_CORRECTION_PARENT_INVALID",
            detail,
            correlation_id,
        )
    except ScopeCorrectionInProgress as exc:
        raise _contract_error(
            status.HTTP_409_CONFLICT,
            "AXWISE_SCOPE_CORRECTION_IN_PROGRESS",
            str(exc),
            correlation_id,
        )
    except ScopeCorrectionConflict as exc:
        raise _contract_error(
            status.HTTP_409_CONFLICT,
            "AXWISE_SCOPE_CORRECTION_CONFLICT",
            str(exc),
            correlation_id,
        )
    except ScopeContractError as exc:
        raise _contract_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "AXWISE_SCOPE_CORRECTION_INVALID",
            str(exc),
            correlation_id,
        )
    response.headers["X-Request-ID"] = correlation_id
    response.status_code = (
        status.HTTP_200_OK
        if record.status in {
            "compiled",
            "needs_material_clarification",
            "accepted",
            "failed",
            "proposal_dead_lettered",
        }
        else status.HTTP_202_ACCEPTED
    )
    return service.compact_poll(record)


@router.get(
    "/scope/corrections/{correction_id}",
    response_model=ScopeCorrectionPollV1,
    status_code=status.HTTP_200_OK,
    summary="Poll one durable tenant-bound scope correction",
)
async def get_scope_correction(
    correction_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeCorrectionPollV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        service = _scope_correction_service(db, with_interpreter=False)
        record = service.get(
            correction_id,
            org_id=tenant.orgId,
            external_user_id=tenant.userId,
            internal_user_id=user.user_id,
        )
        return service.compact_poll(record)
    except ScopeCorrectionParentError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post(
    "/scope/corrections/{correction_id}/clarifications/{clarification_id}/answers",
    response_model=ScopeCorrectionPollV1,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Resolve one exact material clarification as a durable child attempt",
)
async def answer_scope_clarification(
    correction_id: str,
    clarification_id: str,
    answer: ScopeClarificationAnswerRequestV1,
    response: Response,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeCorrectionPollV1:
    if (
        correction_id != answer.parent_correction_id
        or clarification_id != answer.clarification_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="clarification path does not match the bound answer",
        )
    if tenant.orgId != answer.org_id or tenant.userId != answer.user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tenant headers do not match the clarification answer",
        )
    user = resolve_orqaly_tenant_user(db, tenant)
    service = _scope_correction_service(db, with_interpreter=False)
    try:
        reservation = service.answer_material_clarification(
            answer,
            internal_user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
        )
    except ScopeCorrectionParentError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ScopeCorrectionConflict, ScopeCorrectionInProgress) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    record = reservation.record
    response.status_code = (
        status.HTTP_200_OK
        if record.status in {
            "compiled",
            "needs_material_clarification",
            "failed",
            "proposal_dead_lettered",
        }
        else status.HTTP_202_ACCEPTED
    )
    return service.compact_poll(record)


@router.post(
    "/scope/proposals/{proposal_decision_id}/accept",
    response_model=ScopeProposalAcceptanceV1,
    status_code=status.HTTP_201_CREATED,
    summary="Atomically accept one immutable initial or corrected scope proposal",
)
async def accept_scope_proposal(
    proposal_decision_id: str,
    acceptance: ScopeProposalAcceptanceRequestV1,
    response: Response,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeProposalAcceptanceV1:
    if proposal_decision_id != acceptance.proposal_decision_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="path proposal_decision_id does not match acceptance request",
        )
    if tenant.orgId != acceptance.org_id or tenant.userId != acceptance.user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tenant headers do not match acceptance request",
        )
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        existing = SqlAlchemyScopeAcceptanceStore(db).get_by_proposal(
            proposal_decision_id,
            tenant.orgId,
            tenant.userId,
            user.user_id,
        )
        result = _scope_proposal_service(db).accept(
            acceptance,
            internal_user_id=user.user_id,
        )
    except ScopeProposalError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ScopeAcceptanceConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    response.status_code = status.HTTP_200_OK if existing is not None else status.HTTP_201_CREATED
    return result


@router.post(
    "/scope/corrections/{correction_id}/accept",
    include_in_schema=False,
    status_code=status.HTTP_410_GONE,
)
async def accept_scope_correction(
    correction_id: str,
    acceptance: ScopeCorrectionAcceptanceV1,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeCorrectionRecordV1:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "correction-specific acceptance is retired; accept the immutable "
            "scope proposal decision instead"
        ),
    )
    # Kept unreachable for one release so stale clients receive an explicit
    # fail-closed protocol error rather than accidentally selecting a new path.
    if correction_id != acceptance.correction_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="path correction_id does not match the acceptance binding",
        )
    if tenant.orgId != acceptance.org_id or tenant.userId != acceptance.user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tenant headers do not match the correction acceptance",
        )
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        return _scope_correction_service(db, with_interpreter=False).accept(
            acceptance,
            internal_user_id=user.user_id,
        )
    except ScopeCorrectionParentError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ScopeCorrectionConflict, ScopeContractError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post(
    "/scope/proposals/{proposal_decision_id}/continuations",
    response_model=ScopeContinuationBindingV1,
    status_code=status.HTTP_201_CREATED,
    summary="Mint an exact accepted-scope continuation for downstream work",
)
async def create_scope_continuation(
    proposal_decision_id: str,
    continuation: ScopeContinuationRequestV1,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeContinuationBindingV1:
    if proposal_decision_id != continuation.proposal_decision_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="path proposal_decision_id does not match continuation request",
        )
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        return _scope_proposal_service(db).continuation(
            continuation,
            org_id=tenant.orgId,
            external_user_id=tenant.userId,
            internal_user_id=user.user_id,
        )
    except (ScopeProposalError, ScopeAcceptanceConflict) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get(
    "/scope/proposals/{proposal_decision_id}/research/completions/"
    "{result_decision_id}",
    response_model=ScopeResearchCompletionRefV1,
    summary="Mint a compact proof of one usable accepted research result",
)
async def get_scope_research_completion(
    proposal_decision_id: str,
    result_decision_id: str,
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeResearchCompletionRefV1:
    user = resolve_orqaly_tenant_user(db, tenant)
    try:
        return _scope_proposal_service(db).research_completion_ref(
            proposal_decision_id=proposal_decision_id,
            result_decision_id=result_decision_id,
            org_id=tenant.orgId,
            external_user_id=tenant.userId,
            internal_user_id=user.user_id,
        )
    except (ScopeProposalError, ScopeAcceptanceConflict) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/scope/proposals/{proposal_decision_id}/consumers",
    response_model=ScopeConsumerDispatchV1,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Consume an accepted proposal through a compact purpose envelope",
)
async def consume_scope_proposal(
    proposal_decision_id: str,
    continuation: ScopeContinuationRequestV1,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    request_id: str | None = Header(default=None, alias="X-Request-ID"),
    tenant: TenantContext = Depends(tenant_context_from_headers),
    _service_key: str = Depends(verify_orqaly_service_key),
    db: Session = Depends(get_db),
) -> ScopeConsumerDispatchV1:
    if proposal_decision_id != continuation.proposal_decision_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="path proposal_decision_id does not match consumer request",
        )
    user = resolve_orqaly_tenant_user(db, tenant)
    proposal_service = _scope_proposal_service(db)
    try:
        binding = proposal_service.continuation(
            continuation,
            org_id=tenant.orgId,
            external_user_id=tenant.userId,
            internal_user_id=user.user_id,
        )
    except (ScopeProposalError, ScopeAcceptanceConflict, ScopeContractError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    receipt_identity = {
        "proposal_decision_id": binding.proposal_decision_id,
        "proposal_hash": binding.proposal_hash,
        "acceptance_id": binding.acceptance_id,
        "acceptance_hash": binding.acceptance_hash,
        "scope_hash": binding.scope_hash,
        "purpose": binding.purpose,
        "consumer_inputs_hash": binding.consumer_inputs_hash,
        "continuation_binding_hash": binding.binding_hash,
    }
    if binding.purpose in {"synthesis", "execution"}:
        # This is an immutable scope preflight, not execution authorization.
        # Orqaly must bind the exact execution continuation/hash to a later
        # succeeded Gate-2 attempt before any tool or external side effect.
        return ScopeConsumerDispatchV1(
            receipt_id=ScopeConsumerDispatchV1.canonical_receipt_id(
                receipt_identity
            ),
            proposal_decision_id=binding.proposal_decision_id,
            proposal_hash=binding.proposal_hash,
            acceptance_id=binding.acceptance_id,
            acceptance_hash=binding.acceptance_hash,
            scope_hash=binding.scope_hash,
            purpose=binding.purpose,
            consumer_inputs_hash=binding.consumer_inputs_hash,
            continuation=binding,
            status="preflight_validated",
            reused=False,
        )
    try:
        result = _service(db, user, tenant).consume_scope_proposal(
            continuation,
            org_id=tenant.orgId,
            external_user_id=tenant.userId,
            user_id=user.user_id,
            idempotency_key=idempotency_key.strip(),
            request_id=_correlation_id(request_id),
        )
    except (ScopeProposalError, ScopeAcceptanceConflict, ScopeContractError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    stored_binding = result.input_snapshot.scope_continuation
    acceptance = result.input_snapshot.scope_proposal_acceptance
    consumer = result.input_snapshot.scope_consumer_inputs
    proposal = result.scope_packet and result.input_snapshot.scope_packet
    if (
        stored_binding is None
        or acceptance is None
        or consumer is None
        or proposal is None
        or stored_binding != binding
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="stored consumer receipt lost its immutable bindings",
        )
    job = result.research_job
    if binding.purpose == "research" and job is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="research preflight did not produce a durable research job",
        )
    return ScopeConsumerDispatchV1(
        receipt_id=ScopeConsumerDispatchV1.canonical_receipt_id(receipt_identity),
        proposal_decision_id=binding.proposal_decision_id,
        proposal_hash=binding.proposal_hash,
        acceptance_id=binding.acceptance_id,
        acceptance_hash=binding.acceptance_hash,
        scope_hash=binding.scope_hash,
        purpose=binding.purpose,
        consumer_inputs_hash=binding.consumer_inputs_hash,
        continuation=binding,
        status=(
            "research_dispatched"
            if binding.purpose == "research"
            else "decision_created"
        ),
        decision_id=result.decision_id,
        decision_status=result.status.value,
        decision_projection=(
            build_scope_decision_projection(result, binding.purpose)
            if binding.purpose in {"planning", "assignment"}
            else None
        ),
        research_job_id=job.job_id if job is not None else None,
        research_job_status=job.status if job is not None else None,
        reused=result.reused,
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
    correlation_id = _correlation_id(request_id)
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
            request_id=correlation_id,
        )
    except IdempotencyConflict as exc:
        raise _contract_error(
            status.HTTP_409_CONFLICT,
            "AXWISE_IDEMPOTENCY_CONFLICT",
            str(exc),
            correlation_id,
        )
    except DecisionLinkError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_422_UNPROCESSABLE_ENTITY
        error_code = (
            "AXWISE_UPSTREAM_DECISION_NOT_FOUND"
            if code == status.HTTP_404_NOT_FOUND
            else "AXWISE_UPSTREAM_DECISION_INVALID"
        )
        raise _contract_error(code, error_code, detail, correlation_id)
    except (ScopeProposalError, ScopeAcceptanceConflict) as exc:
        raise _contract_error(
            status.HTTP_409_CONFLICT,
            "AXWISE_SCOPE_PROPOSAL_STALE_OR_INVALID",
            str(exc),
            correlation_id,
        )
    except ScopeContractError as exc:
        raise _contract_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "AXWISE_SCOPE_CONTRACT_INVALID",
            str(exc),
            correlation_id,
        )
    response.headers["X-Request-ID"] = correlation_id
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
    "/schemas/scope-packet-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the canonical compact scope-packet JSON Schema",
)
async def get_scope_packet_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return ScopePacketV1.model_json_schema()


@router.get(
    "/schemas/scope-state-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the optional explicit scope-state JSON Schema",
)
async def get_scope_state_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return ScopeStateV1.model_json_schema()


@router.get(
    "/schemas/quality-contract-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the deterministic scope-quality contract JSON Schema",
)
async def get_quality_contract_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return QualityContractV1.model_json_schema()


@router.get(
    "/schemas/execution-outcome-v1",
    response_model=Dict[str, Any],
    summary="Retrieve the published Phase 4 execution-outcome JSON Schema",
)
async def get_execution_outcome_schema(
    _service_key: str = Depends(verify_orqaly_service_key),
) -> Dict[str, Any]:
    return ExecutionOutcomeV1.model_json_schema()
