"""Run durable Orqaly A+B jobs outside the FastAPI request process."""

import argparse
import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Literal

from backend.services.orqaly_hybrid_run_service import HybridRunService
from backend.database import SessionLocal
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
    SqlAlchemyScopeCorrectionStore,
)
from backend.services.orchestration.scope_correction_service import (
    build_corrected_proposal_request,
    PydanticAIScopeSemanticInterpreter,
    ScopeCorrectionService,
)
from backend.services.orchestration.decision_service import (
    OrchestrationDecisionService,
)
from backend.services.orchestration.scope_contract_service import (
    research_execution_inputs_hash,
)


RECOVERY_INTERVAL_SECONDS = 60.0
STALE_RUN_MINUTES = 30
logger = logging.getLogger(__name__)
WORKER_LANE_SCOPE = "scope"
WORKER_LANE_RESEARCH = "research"
WORKER_LANE_BOTH = "both"
_VALID_WORKER_LANES = {
    WORKER_LANE_SCOPE,
    WORKER_LANE_RESEARCH,
    WORKER_LANE_BOTH,
}


@dataclass(frozen=True)
class ScopeLaneOutcome:
    status: Literal["processed", "idle", "error"]
    tenant_key: tuple[str, str] | None = None


def resolve_worker_lane(value: str | None = None) -> str:
    """Resolve one explicit workload lane; `both` is local/test only."""

    lane = str(value if value is not None else os.getenv("WORKER_LANE", "research"))
    lane = lane.strip().casefold()
    if lane not in _VALID_WORKER_LANES:
        raise ValueError(
            "WORKER_LANE must be one of: " + ", ".join(sorted(_VALID_WORKER_LANES))
        )
    return lane


def _load_research_orchestrator():
    """Keep the paid research stack out of the low-latency scope service."""

    from backend.api.research.simulation_bridge.router import orchestrator

    return orchestrator


async def _process_next_scope_correction(
    *,
    exclude_tenant_key: tuple[str, str] | None = None,
    prefer_proposal: bool = True,
) -> ScopeLaneOutcome:
    """Claim one durable correction independently of the paid research queue."""

    session = SessionLocal()
    reservation = None
    try:
        decision_store = SqlAlchemyDecisionStore(session)
        decision_service = OrchestrationDecisionService(decision_store)

        def persist_proposal(request, compilation, proposal_source, user_id):
            proposal = compilation.proposal
            packet = compilation.scope_packet
            if proposal is None or packet is None:
                raise ValueError("compiled correction lost its proposal")
            corrected_request = build_corrected_proposal_request(
                correction_id=proposal.correction_id,
                request=request,
                proposal_source=proposal_source,
                packet=packet,
            )
            return decision_service.create_precompiled_scope_proposal(
                corrected_request,
                user_id=user_id,
                proposal_id=proposal.proposal_id,
                proposal_hash=proposal.proposal_hash,
                expected_execution_inputs_hash=research_execution_inputs_hash(
                    corrected_request,
                    packet,
                ),
                scope_proposal=proposal.scope_proposal,
            )

        service = ScopeCorrectionService(
            parent_store=decision_store,
            correction_store=SqlAlchemyScopeCorrectionStore(session),
            interpreter=None,
            interpreter_factory=PydanticAIScopeSemanticInterpreter,
            proposal_persister=persist_proposal,
        )
        proposal_reservation = None
        if prefer_proposal:
            proposal_reservation = service.claim_proposal(
                exclude_tenant_key=exclude_tenant_key
            )
        if proposal_reservation is not None:
            reservation = proposal_reservation
            service.process_pending_proposal(reservation)
            return ScopeLaneOutcome(
                "processed",
                (
                    reservation.record.request.org_id,
                    reservation.record.request.user_id,
                ),
            )
        reservation = service.claim(exclude_tenant_key=exclude_tenant_key)
        if reservation is None and not prefer_proposal:
            reservation = service.claim_proposal(
                exclude_tenant_key=exclude_tenant_key
            )
        if reservation is None:
            return ScopeLaneOutcome("idle")
        tenant_key = (
            reservation.record.request.org_id,
            reservation.record.request.user_id,
        )
        if reservation.record.status == "proposal_persisting":
            service.process_pending_proposal(reservation)
        else:
            await service.process_reserved(
                reservation,
                internal_user_id=reservation.internal_user_id,
            )
        return ScopeLaneOutcome("processed", tenant_key)
    except Exception:
        logger.exception("Durable scope-correction worker attempt failed")
        if reservation is not None:
            return ScopeLaneOutcome(
                "processed",
                (
                    reservation.record.request.org_id,
                    reservation.record.request.user_id,
                ),
            )
        return ScopeLaneOutcome("error")
    finally:
        session.close()


def _recover_stale_runs(
    service: HybridRunService,
    *,
    stale_after_minutes: int,
) -> int:
    recovered = service.recover_stale_runs(
        stale_after_minutes=stale_after_minutes,
    )
    if recovered:
        logger.info(
            "Recovered %s stale hybrid jobs after the %s-minute guard",
            recovered,
            stale_after_minutes,
        )
    else:
        logger.debug(
            "Periodic stale hybrid-job recovery found no eligible rows"
        )
    return recovered


async def _run_scope_lane(
    *,
    once: bool,
    poll_seconds: float,
) -> ScopeLaneOutcome:
    last_tenant_key: tuple[str, str] | None = None
    prefer_proposal = True
    while True:
        outcome = await _process_next_scope_correction(
            exclude_tenant_key=last_tenant_key,
            prefer_proposal=prefer_proposal,
        )
        prefer_proposal = not prefer_proposal
        if outcome.tenant_key is not None:
            last_tenant_key = outcome.tenant_key
        if once:
            return outcome
        if outcome.status != "processed":
            await asyncio.sleep(poll_seconds)


async def _run_research_lane(
    *,
    once: bool,
    poll_seconds: float,
    recovery_interval_seconds: float,
    stale_after_minutes: int,
) -> bool:
    service = HybridRunService(_load_research_orchestrator())
    _recover_stale_runs(
        service,
        stale_after_minutes=stale_after_minutes,
    )
    loop = asyncio.get_running_loop()
    next_recovery_at = loop.time() + recovery_interval_seconds
    while True:
        now = loop.time()
        if now >= next_recovery_at:
            _recover_stale_runs(
                service,
                stale_after_minutes=stale_after_minutes,
            )
            next_recovery_at = now + recovery_interval_seconds

        job_id = await service.process_next()
        processed = job_id is not None
        if job_id:
            await service.process_job(job_id, already_claimed=True)
        if once:
            return processed
        if not processed:
            until_recovery = max(0.0, next_recovery_at - loop.time())
            await asyncio.sleep(min(poll_seconds, until_recovery))


async def run(
    once: bool,
    poll_seconds: float,
    *,
    recovery_interval_seconds: float = RECOVERY_INTERVAL_SECONDS,
    stale_after_minutes: int = STALE_RUN_MINUTES,
    lane: str = WORKER_LANE_RESEARCH,
) -> None:
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be positive")
    if recovery_interval_seconds <= 0:
        raise ValueError("recovery_interval_seconds must be positive")
    if stale_after_minutes <= 0:
        raise ValueError("stale_after_minutes must be positive")
    resolved_lane = resolve_worker_lane(lane)
    close_models = None
    if resolved_lane in {WORKER_LANE_RESEARCH, WORKER_LANE_BOTH}:
        from backend.services.llm.gemini_runtime import close_shared_research_models

        close_models = close_shared_research_models
    try:
        if resolved_lane == WORKER_LANE_SCOPE:
            await _run_scope_lane(once=once, poll_seconds=poll_seconds)
            return
        if resolved_lane == WORKER_LANE_RESEARCH:
            await _run_research_lane(
                once=once,
                poll_seconds=poll_seconds,
                recovery_interval_seconds=recovery_interval_seconds,
                stale_after_minutes=stale_after_minutes,
            )
            return
        if once:
            scope_outcome = await _run_scope_lane(
                once=True,
                poll_seconds=poll_seconds,
            )
            if scope_outcome.status != "processed":
                await _run_research_lane(
                    once=True,
                    poll_seconds=poll_seconds,
                    recovery_interval_seconds=recovery_interval_seconds,
                    stale_after_minutes=stale_after_minutes,
                )
            return
        # Local/test convenience only. Production deploys these as separate
        # Cloud Run services so a blocking paid provider cannot affect chat SLA.
        await asyncio.gather(
            _run_scope_lane(once=False, poll_seconds=poll_seconds),
            _run_research_lane(
                once=False,
                poll_seconds=poll_seconds,
                recovery_interval_seconds=recovery_interval_seconds,
                stale_after_minutes=stale_after_minutes,
            ),
        )
    finally:
        if close_models is not None:
            await close_models()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run durable Orqaly hybrid A+B jobs")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    parser.add_argument(
        "--lane",
        choices=sorted(_VALID_WORKER_LANES),
        default=resolve_worker_lane(),
        help="Run the low-latency scope lane or the paid research lane",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run(args.once, args.poll_seconds, lane=args.lane))


if __name__ == "__main__":
    main()
