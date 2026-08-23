"""Recovery for legacy pipeline runs owned by the API process."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models import PipelineRun


ORQALY_PARTNER_ID = "orqaly"
ORQALY_HYBRID_PIPELINE_MODE = "hybrid_a_plus_b"


def recover_stale_api_pipeline_runs(
    session_factory: Callable[[], Session],
    *,
    stale_after_minutes: int = 30,
    now: datetime | None = None,
) -> list[str]:
    """Fail interrupted API-owned runs without touching the durable worker queue.

    Orqaly hybrid jobs are leased and recovered by the standalone worker from
    their ``updated_at`` heartbeat. API process age and cold starts are not
    evidence that their worker attempt has died.
    """

    if stale_after_minutes <= 0:
        raise ValueError("stale_after_minutes must be positive")

    recovery_time = now or datetime.now(timezone.utc)
    cutoff = recovery_time - timedelta(minutes=stale_after_minutes)
    session = session_factory()
    try:
        stale_runs = (
            session.query(PipelineRun)
            .filter(
                PipelineRun.status.in_(["running", "pending"]),
                PipelineRun.created_at < cutoff,
                or_(
                    PipelineRun.partner_id.is_(None),
                    PipelineRun.partner_id != ORQALY_PARTNER_ID,
                    PipelineRun.pipeline_mode.is_(None),
                    PipelineRun.pipeline_mode != ORQALY_HYBRID_PIPELINE_MODE,
                ),
            )
            .with_for_update(skip_locked=True)
            .all()
        )
        recovered_ids: list[str] = []
        for run in stale_runs:
            interrupted_status = run.status
            run.status = "failed"
            run.completed_at = recovery_time
            run.error = (
                "Job interrupted - API server restarted while job was "
                f"{interrupted_status}"
            )
            recovered_ids.append(run.job_id)
        if recovered_ids:
            session.commit()
        return recovered_ids
    finally:
        session.close()
