"""Dedicated IAM-only AxWise cognitive API for Orqaly workflow v2."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api.routes.workflow_v2_operations import (
    get_operation_service,
    router as workflow_v2_operations_router,
)
from backend.services.llm.gemini_runtime import close_shared_research_models


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await close_shared_research_models()
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


app.include_router(workflow_v2_operations_router)
