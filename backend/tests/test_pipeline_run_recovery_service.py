from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import PipelineRun, User
from backend.services.pipeline_run_recovery_service import (
    recover_stale_api_pipeline_runs,
)


pytestmark = pytest.mark.contract


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs):
    return "JSON"


def test_api_startup_recovery_never_fails_worker_owned_orqaly_hybrid_run(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/api-recovery.db")
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
                job_id="orqaly-hybrid-running",
                status="running",
                business_context={},
                partner_id="orqaly",
                pipeline_mode="hybrid_a_plus_b",
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(minutes=1),
            ),
            PipelineRun(
                job_id="legacy-api-running",
                status="running",
                business_context={},
                pipeline_mode="legacy_in_process",
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            ),
            PipelineRun(
                job_id="fresh-api-running",
                status="running",
                business_context={},
                pipeline_mode="legacy_in_process",
                created_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
            ),
        ]
    )
    session.commit()
    session.close()

    recovered = recover_stale_api_pipeline_runs(
        factory,
        stale_after_minutes=30,
        now=now,
    )

    assert recovered == ["legacy-api-running"]
    session = factory()
    hybrid = session.query(PipelineRun).filter_by(job_id="orqaly-hybrid-running").one()
    legacy = session.query(PipelineRun).filter_by(job_id="legacy-api-running").one()
    fresh = session.query(PipelineRun).filter_by(job_id="fresh-api-running").one()
    assert hybrid.status == "running"
    assert hybrid.completed_at is None
    assert hybrid.error is None
    assert legacy.status == "failed"
    assert legacy.completed_at.replace(tzinfo=timezone.utc) == now
    assert "while job was running" in legacy.error
    assert fresh.status == "running"
    session.close()
