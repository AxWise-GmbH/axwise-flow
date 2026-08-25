import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import PipelineRun, User
from backend.scripts import run_orqaly_hybrid_worker as worker
from backend.scripts import run_orqaly_hybrid_worker_service as worker_service
from backend.services.orqaly_hybrid_run_service import HybridRunService


pytestmark = pytest.mark.contract


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs):
    return "JSON"


@pytest.mark.asyncio
async def test_health_only_release_revision_never_starts_queue_poller(monkeypatch):
    poller_loaded = False
    entered_quiescence = asyncio.Event()

    def fail_if_loaded():
        nonlocal poller_loaded
        poller_loaded = True
        raise AssertionError("health-only revision must not import the poller")

    class QuiescenceEvent:
        async def wait(self):
            entered_quiescence.set()
            await asyncio.Future()

    monkeypatch.setattr(worker_service, "_load_poller", fail_if_loaded)
    monkeypatch.setattr(worker_service.asyncio, "Event", QuiescenceEvent)
    task = asyncio.create_task(
        worker_service.run_service(mode="health_only", poll_seconds=1)
    )
    await asyncio.wait_for(entered_quiescence.wait(), timeout=1)

    assert poller_loaded is False
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_poll_release_revision_runs_durable_queue_poller(monkeypatch):
    calls = []

    async def record_run(*, once, poll_seconds, lane):
        calls.append((once, poll_seconds, lane))

    monkeypatch.setattr(worker_service, "_load_poller", lambda: record_run)

    await worker_service.run_service(mode="poll", poll_seconds=2.5)

    assert calls == [(False, 2.5, "research")]


@pytest.mark.parametrize("value", ["legacy", "", " health only "])
def test_unknown_worker_mode_fails_closed_before_polling(value):
    with pytest.raises(ValueError, match="WORKER_MODE"):
        worker_service.resolve_worker_mode(value)


def test_worker_mode_is_normalized_consistently():
    assert worker_service.resolve_worker_mode(" POLL ") == "poll"
    assert worker_service.resolve_worker_mode(" HEALTH_ONLY ") == "health_only"


def test_worker_health_reports_build_and_cloud_revision_separately(monkeypatch):
    monkeypatch.setenv("WORKER_MODE", "health_only")
    monkeypatch.setenv("WORKER_LANE", "scope")
    monkeypatch.setenv("AXWISE_BUILD_REVISION", "abcdef123456")
    monkeypatch.setenv("K_REVISION", "axwise-orqaly-worker-00031-pause")

    payload = worker_service.health_payload()

    assert payload["mode"] == "health_only"
    assert payload["lane"] == "scope"
    assert payload["service"] == "axwise-orqaly-scope-worker"
    assert payload["build_revision"] == "abcdef123456"
    assert payload["cloud_revision"] == "axwise-orqaly-worker-00031-pause"


@pytest.mark.parametrize("value", ["both", "", "combined", " paid "])
def test_http_worker_service_rejects_nonisolated_lane(value):
    with pytest.raises(ValueError, match="WORKER_LANE"):
        worker_service.resolve_worker_lane(value)


@pytest.mark.asyncio
async def test_scope_lane_never_initializes_paid_research_stack(monkeypatch):
    calls = []

    async def idle_scope(**kwargs):
        calls.append(kwargs)
        return worker.ScopeLaneOutcome("idle")

    def fail_paid_stack():
        raise AssertionError("scope worker must not load the paid research stack")

    monkeypatch.setattr(worker, "_process_next_scope_correction", idle_scope)
    monkeypatch.setattr(worker, "_load_research_orchestrator", fail_paid_stack)
    monkeypatch.setattr(
        worker,
        "HybridRunService",
        lambda *_args, **_kwargs: fail_paid_stack(),
    )

    await worker.run(once=True, poll_seconds=1, lane="scope")

    assert calls == [{"exclude_tenant_key": None, "prefer_proposal": True}]


@pytest.mark.asyncio
async def test_scope_lane_db_error_backs_off_instead_of_hot_spinning(monkeypatch):
    poll_calls = 0
    sleeps = []

    async def failed_poll(**_kwargs):
        nonlocal poll_calls
        poll_calls += 1
        return worker.ScopeLaneOutcome("error")

    async def stop_after_backoff(seconds):
        sleeps.append(seconds)
        raise RuntimeError("stop-after-backoff")

    monkeypatch.setattr(worker, "_process_next_scope_correction", failed_poll)
    monkeypatch.setattr(worker.asyncio, "sleep", stop_after_backoff)

    with pytest.raises(RuntimeError, match="stop-after-backoff"):
        await worker._run_scope_lane(once=False, poll_seconds=2.5)

    assert poll_calls == 1
    assert sleeps == [2.5]


@pytest.mark.asyncio
async def test_both_lane_runs_scope_while_paid_research_is_blocked(monkeypatch):
    scope_completed = asyncio.Event()
    research_entered = asyncio.Event()
    research_release = asyncio.Event()
    closed = []

    async def scope_lane(**_kwargs):
        scope_completed.set()
        await asyncio.Future()

    async def research_lane(**_kwargs):
        research_entered.set()
        await research_release.wait()

    async def close_models():
        closed.append(True)

    monkeypatch.setattr(worker, "_run_scope_lane", scope_lane)
    monkeypatch.setattr(worker, "_run_research_lane", research_lane)
    monkeypatch.setattr(
        "backend.services.llm.gemini_runtime.close_shared_research_models",
        close_models,
    )

    task = asyncio.create_task(
        worker.run(once=False, poll_seconds=1, lane="both")
    )
    await asyncio.wait_for(research_entered.wait(), timeout=1)
    await asyncio.wait_for(scope_completed.wait(), timeout=1)
    assert not task.done()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert closed == [True]


@pytest.mark.asyncio
async def test_worker_rechecks_stale_runs_every_minute_while_idle(monkeypatch, caplog):
    clock = {"value": 0.0}
    sleep_durations = []

    class FakeLoop:
        @staticmethod
        def time():
            return clock["value"]

    class FakeService:
        def __init__(self):
            self.recovery_guards = []
            self.process_next_calls = 0

        def recover_stale_runs(self, *, stale_after_minutes):
            self.recovery_guards.append(stale_after_minutes)
            return 1 if len(self.recovery_guards) == 2 else 0

        async def process_next(self):
            self.process_next_calls += 1
            return None

    service = FakeService()

    async def fake_sleep(seconds):
        sleep_durations.append(seconds)
        clock["value"] += seconds
        if clock["value"] >= 120:
            raise RuntimeError("stop-test-loop")

    monkeypatch.setattr(worker, "HybridRunService", lambda _orchestrator: service)
    monkeypatch.setattr(worker.asyncio, "get_running_loop", lambda: FakeLoop())
    monkeypatch.setattr(worker.asyncio, "sleep", fake_sleep)
    caplog.set_level("INFO", logger=worker.__name__)

    with pytest.raises(RuntimeError, match="stop-test-loop"):
        await worker.run(
            once=False,
            # A long queue poll interval must not postpone the one-minute
            # recovery sweep.
            poll_seconds=300,
            recovery_interval_seconds=60,
            stale_after_minutes=30,
        )

    assert service.recovery_guards == [30, 30]
    assert service.process_next_calls == 2
    assert sleep_durations == [60, 60]
    assert "Recovered 1 stale hybrid jobs after the 30-minute guard" in caplog.text


@pytest.mark.asyncio
async def test_recovery_requeues_only_stale_run_and_legacy_row_fails_closed(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/worker-recovery.db")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, PipelineRun.__table__],
    )
    factory = sessionmaker(bind=engine)
    now = datetime.now(timezone.utc)
    session = factory()
    session.add_all(
        [
            PipelineRun(
                job_id="stale-job",
                status="running",
                business_context={},
                partner_id="orqaly",
                pipeline_mode="hybrid_a_plus_b",
                current_stage="grounding_market",
                progress_percentage=3,
                execution_trace=[],
                started_at=now - timedelta(minutes=31),
                updated_at=now - timedelta(minutes=31),
            ),
            PipelineRun(
                job_id="fresh-job",
                status="running",
                business_context={},
                partner_id="orqaly",
                pipeline_mode="hybrid_a_plus_b",
                current_stage="grounding_market",
                progress_percentage=3,
                execution_trace=[],
                started_at=now - timedelta(minutes=29),
                updated_at=now - timedelta(minutes=29),
            ),
        ]
    )
    session.commit()
    session.close()

    service = HybridRunService(object(), session_factory=factory)
    assert service.recover_stale_runs(stale_after_minutes=30) == 1
    assert service.recover_stale_runs(stale_after_minutes=30) == 0
    session = factory()
    assert session.query(PipelineRun).filter_by(job_id="stale-job").one().status == "queued"
    session.close()

    # Recovery does not grandfather pre-unified paid rows. Claim revalidates
    # the durable generic scope capability and terminalizes the legacy row
    # before any provider/tool call.
    assert await service.process_next() is None
    assert await service.process_next() is None

    session = factory()
    stale = session.query(PipelineRun).filter_by(job_id="stale-job").one()
    fresh = session.query(PipelineRun).filter_by(job_id="fresh-job").one()
    assert stale.status == "failed"
    assert stale.current_stage == "security_failed"
    assert stale.attempt_count == 0
    assert [row["message"] for row in stale.execution_trace] == [
        "Recovered after an interrupted worker attempt"
    ]
    assert fresh.status == "running"
    assert fresh.current_stage == "grounding_market"
    assert fresh.attempt_count == 0
    session.close()


@pytest.mark.asyncio
async def test_worker_recovery_uses_heartbeat_not_job_creation_time(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/worker-heartbeat.db")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, PipelineRun.__table__],
    )
    factory = sessionmaker(bind=engine)
    now = datetime.now(timezone.utc)
    session = factory()
    session.add(
        PipelineRun(
            job_id="old-job-live-worker",
            status="running",
            business_context={},
            partner_id="orqaly",
            pipeline_mode="hybrid_a_plus_b",
            current_stage="grounding_market",
            progress_percentage=40,
            execution_trace=[],
            created_at=now - timedelta(hours=2),
            started_at=now - timedelta(hours=2),
            updated_at=now - timedelta(minutes=1),
        )
    )
    session.commit()
    session.close()

    service = HybridRunService(object(), session_factory=factory)

    assert service.recover_stale_runs(stale_after_minutes=30) == 0
    assert await service.process_next() is None

    session = factory()
    run = session.query(PipelineRun).filter_by(job_id="old-job-live-worker").one()
    assert run.status == "running"
    assert run.current_stage == "grounding_market"
    session.close()


@pytest.mark.asyncio
async def test_paid_claim_alternates_tenants_even_for_poison_legacy_rows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/worker-tenant-fair.db")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, PipelineRun.__table__],
    )
    factory = sessionmaker(bind=engine)
    now = datetime.now(timezone.utc)
    session = factory()
    for ordinal, (job_id, org_id, owner_id) in enumerate(
        (
            ("tenant-a-oldest", "org-a", "owner-a"),
            ("tenant-a-second", "org-a", "owner-a"),
            ("tenant-b-newer", "org-b", "owner-b"),
        )
    ):
        session.add(
            PipelineRun(
                job_id=job_id,
                status="queued",
                business_context={},
                partner_id="orqaly",
                external_org_id=org_id,
                external_user_id=owner_id,
                pipeline_mode="hybrid_a_plus_b",
                current_stage="queued",
                progress_percentage=0,
                execution_trace=[],
                request_payload={},
                requested_outputs={},
                created_at=now + timedelta(seconds=ordinal),
                updated_at=now + timedelta(seconds=ordinal),
            )
        )
    session.commit()
    session.close()

    service = HybridRunService(object(), session_factory=factory)
    assert await service.process_next() is None
    assert await service.process_next() is None

    session = factory()
    rows = {
        row.job_id: row.status for row in session.query(PipelineRun).all()
    }
    session.close()
    assert rows == {
        "tenant-a-oldest": "failed",
        "tenant-a-second": "queued",
        "tenant-b-newer": "failed",
    }
