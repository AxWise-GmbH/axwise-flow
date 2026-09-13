"""Dedicated Cloud Run worker process backed by the durable AxWise queue."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from backend.services.llm.gemini_runtime import close_shared_research_models
from backend.services.workflow_v2.worker_logging import configure_worker_logging
from backend.services.workflow_v2.worker_main import (
    build_worker,
    cost_configuration_ready,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_worker_logging()
    store, worker = build_worker()
    app.state.operation_store = store
    app.state.operation_worker_task = asyncio.create_task(worker.run_forever())
    try:
        yield
    finally:
        app.state.operation_worker_task.cancel()
        try:
            await app.state.operation_worker_task
        except asyncio.CancelledError:
            pass
        await worker.close()
        await close_shared_research_models()
        store.engine.dispose()


app = FastAPI(
    title="AxWise Workflow V2 Worker",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
async def readyz() -> dict[str, str]:
    task = app.state.operation_worker_task
    store = app.state.operation_store
    if (
        task.done()
        or not cost_configuration_ready()
        or not await asyncio.to_thread(store.ready)
    ):
        raise HTTPException(status_code=503, detail="worker is not ready")
    return {"status": "ready"}
