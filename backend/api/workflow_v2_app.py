"""Dedicated IAM-only AxWise cognitive API for Orqaly workflow v2."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

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


@app.exception_handler(RequestValidationError)
async def capability_validation_error(request: Request, error: RequestValidationError):
    """Do not echo newly supplied transcript content in validation errors.

    Existing operations retain their historical FastAPI error response. New
    capability errors deliberately expose neither model input nor dynamic keys.
    """
    body = error.body
    capability_types = {
        "AdmitTranscriptCorpusV1",
        "AnalyzeEvidenceV1",
        "AssistantTurnV2",
        "SimulateV1",
    }
    operation_type = body.get("operationType") if type(body) is dict else None
    input_value = body.get("input") if type(body) is dict else None
    input_type = input_value.get("type") if type(input_value) is dict else None
    if any(
        type(value) is str and value in capability_types
        for value in (operation_type, input_type)
    ):
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {
                        "loc": ["body"],
                        "msg": "Invalid bounded capability operation input",
                        "type": "value_error.capability_input",
                    }
                ]
            },
        )
    return await request_validation_exception_handler(request, error)


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
