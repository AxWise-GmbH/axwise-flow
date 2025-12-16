"""
Pipeline orchestration routes for AxPersona.

This module handles full pipeline execution and job management endpoints.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.api.research.simulation_bridge.models import BusinessContext
from backend.database import SessionLocal
from backend.infrastructure.persistence.pipeline_run_repository import (
    PipelineRunRepository,
)
from backend.infrastructure.persistence.unit_of_work import UnitOfWork

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory job tracking (for active jobs)
_pipeline_jobs: Dict[str, "PipelineJobStatus"] = {}
_background_tasks: Set[asyncio.Task] = set()


class PipelineJobStatus(BaseModel):
    """Status of a pipeline job."""

    job_id: str
    status: str = "pending"
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    result: Optional[Any] = None


class PipelineRunSummary(BaseModel):
    """Summary of a pipeline run for listing."""

    job_id: str
    status: str
    created_at: str
    completed_at: Optional[str] = None
    persona_count: Optional[int] = None
    interview_count: Optional[int] = None


class PipelineRunDetail(BaseModel):
    """Detailed information about a pipeline run."""

    job_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    business_context: Optional[Dict[str, Any]] = None
    execution_trace: Optional[List[Dict[str, Any]]] = None
    total_duration_seconds: Optional[float] = None
    persona_count: Optional[int] = None
    interview_count: Optional[int] = None
    error: Optional[str] = None


@router.post("/pipeline", response_model=PipelineJobStatus)
async def create_pipeline_job(context: BusinessContext) -> PipelineJobStatus:
    """Create a background job for running the full AxPersona pipeline.

    This endpoint returns immediately with a job_id while the actual
    pipeline execution runs in the background.
    """
    from backend.api.axpersona.helpers import execute_pipeline

    job_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    # Persist pipeline run to database
    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        await repo.create_pipeline_run(
            job_id=job_id,
            business_context=context.model_dump() if hasattr(context, "model_dump") else context.dict(),
            user_id=None,
        )
        await uow.commit()

    job = PipelineJobStatus(
        job_id=job_id,
        status="pending",
        created_at=created_at.isoformat(),
    )
    _pipeline_jobs[job_id] = job

    async def run_job() -> None:
        await _run_pipeline_job(job, context, job_id)

    task = asyncio.create_task(run_job())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    logger.info("[AxPersona Pipeline] Created background task for job %s", job_id)
    return job


@router.get("/pipeline/jobs/{job_id}", response_model=PipelineJobStatus)
async def get_pipeline_job(job_id: str) -> PipelineJobStatus:
    """Retrieve the status (and result) of a pipeline job."""
    if job_id in _pipeline_jobs:
        return _pipeline_jobs[job_id]

    # Fallback to database
    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        run = await repo.get_pipeline_run(job_id)
        if run:
            return PipelineJobStatus(
                job_id=run.job_id,
                status=run.status,
                created_at=run.created_at.isoformat() if run.created_at else "",
                started_at=run.started_at.isoformat() if run.started_at else None,
                completed_at=run.completed_at.isoformat() if run.completed_at else None,
                error=run.error,
            )

    raise HTTPException(status_code=404, detail=f"Pipeline job {job_id} not found")


async def _run_pipeline_job(job: PipelineJobStatus, context: BusinessContext, job_id: str) -> None:
    """Execute the pipeline job in the background."""
    from backend.api.axpersona.helpers import execute_pipeline

    logger.info("[AxPersona Pipeline Job %s] started", job_id)
    job.status = "running"
    started_at = datetime.utcnow()
    job.started_at = started_at.isoformat()

    async with UnitOfWork(SessionLocal) as uow:
        repo = PipelineRunRepository(uow.session)
        await repo.update_pipeline_run_status(job_id=job_id, status="running", started_at=started_at)
        await uow.commit()

    try:
        result = await execute_pipeline(context=context, pipeline_id=job_id)
        job.result = result
        job.status = "completed"
        job.completed_at = datetime.utcnow().isoformat()
        logger.info("[AxPersona Pipeline Job %s] completed successfully", job_id)
    except Exception as exc:
        logger.exception("[AxPersona Pipeline Job %s] failed: %s", job_id, exc)
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.utcnow().isoformat()

