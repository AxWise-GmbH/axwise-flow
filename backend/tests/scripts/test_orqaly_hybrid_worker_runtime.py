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

    async def record_run(*, once, poll_seconds):
        calls.append((once, poll_seconds))

    monkeypatch.setattr(worker_service, "_load_poller", lambda: record_run)

    await worker_service.run_service(mode="poll", poll_seconds=2.5)

    assert calls == [(False, 2.5)]


@pytest.mark.parametrize("value", ["legacy", "", " health only "])
def test_unknown_worker_mode_fails_closed_before_polling(value):
    with pytest.raises(ValueError, match="WORKER_MODE"):
        worker_service.resolve_worker_mode(value)


def test_worker_mode_is_normalized_consistently():
    assert worker_service.resolve_worker_mode(" POLL ") == "poll"
    assert worker_service.resolve_worker_mode(" HEALTH_ONLY ") == "health_only"


def test_worker_health_reports_build_and_cloud_revision_separately(monkeypatch):
    monkeypatch.setenv("WORKER_MODE", "health_only")
    monkeypatch.setenv("AXWISE_BUILD_REVISION", "abcdef123456")
    monkeypatch.setenv("K_REVISION", "axwise-orqaly-worker-00031-pause")

    payload = worker_service.health_payload()

    assert payload["mode"] == "health_only"
    assert payload["build_revision"] == "abcdef123456"
    assert payload["cloud_revision"] == "axwise-orqaly-worker-00031-pause"


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
async def test_recovery_requeues_only_stale_run_and_claims_it_once(tmp_path):
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
    assert await service.process_next() == "stale-job"
    assert await service.process_next() is None

    session = factory()
    stale = session.query(PipelineRun).filter_by(job_id="stale-job").one()
    fresh = session.query(PipelineRun).filter_by(job_id="fresh-job").one()
    assert stale.status == "running"
    assert stale.attempt_count == 1
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
