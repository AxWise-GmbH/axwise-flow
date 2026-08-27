"""Dedicated IAM-only AxWise cognitive API for Orqaly workflow v2."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from backend.api.routes.workflow_v2_operations import (
    canonical_service_origin,
    get_operation_service,
    router as workflow_v2_operations_router,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    canonical_service_origin()
    service = get_operation_service()
    if not await asyncio.to_thread(service.store.ready):
        raise RuntimeError("AxWise operation database is not ready")
    yield
    if get_operation_service.cache_info().currsize:
        service = get_operation_service()
        engine = getattr(service.store, "engine", None)
        if engine is not None:
            engine.dispose()
    get_operation_service.cache_clear()


app = FastAPI(
    title="AxWise Workflow V2",
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
    service = get_operation_service()
    if not await asyncio.to_thread(service.store.ready):
        raise HTTPException(status_code=503, detail="operation database is not ready")
    return {"status": "ready"}


app.include_router(workflow_v2_operations_router)
