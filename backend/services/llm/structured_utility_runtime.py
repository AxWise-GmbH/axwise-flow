"""Shared exact-model runtime for bounded structured Gemini utility calls.

Pattern extraction and keyword classification need reliable native structured
output, but they do not need the research pipeline's highest thinking setting
or its longer operation deadline.  This module gives those utilities their own
process-wide connection pool while retaining the same single-owner transport
retry policy as durable research.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
from dataclasses import dataclass
from typing import Awaitable, TypeVar

import httpx
from google.genai import Client as GoogleGenAIClient
from google.genai.types import HttpOptions, HttpRetryOptions, ThinkingLevel
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider

from backend.services.llm.gemini_runtime import (
    BoundedRetryAsyncClient,
    RESEARCH_MODEL,
    RESEARCH_MODEL_RESOURCE,
    TRANSIENT_HTTP_STATUS_CODES,
    normalized_research_model,
)


UTILITY_THINKING_LEVEL = ThinkingLevel.MEDIUM
UTILITY_MAX_OUTPUT_TOKENS = 65_536
UTILITY_HTTP_ATTEMPTS = 2
UTILITY_HTTP_OPERATION_SECONDS = 180.0
UTILITY_HTTP_TIMEOUT_SECONDS = 150.0
UTILITY_RUN_DEADLINE_SECONDS = 300.0


_ResultT = TypeVar("_ResultT")


@dataclass(frozen=True)
class _SharedStructuredUtilityRuntime:
    model: GoogleModel
    sdk_client: GoogleGenAIClient
    http_client: BoundedRetryAsyncClient


_SHARED_STRUCTURED_UTILITY_MODELS: dict[str, _SharedStructuredUtilityRuntime] = {}


def structured_utility_deadline_seconds() -> float:
    """Return the total deadline across transport and semantic-repair calls."""

    configured = os.getenv("GEMINI_STRUCTURED_UTILITY_DEADLINE_SECONDS")
    if configured is None or not configured.strip():
        return UTILITY_RUN_DEADLINE_SECONDS
    try:
        deadline = float(configured)
    except ValueError as exc:
        raise RuntimeError(
            "GEMINI_STRUCTURED_UTILITY_DEADLINE_SECONDS must be numeric"
        ) from exc
    if not math.isfinite(deadline) or deadline <= 0:
        raise RuntimeError(
            "GEMINI_STRUCTURED_UTILITY_DEADLINE_SECONDS must be finite and positive"
        )
    return deadline


async def run_structured_utility(awaitable: Awaitable[_ResultT]) -> _ResultT:
    """Run one logical utility task within one end-to-end deadline."""

    try:
        deadline = structured_utility_deadline_seconds()
    except Exception:
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        raise
    return await asyncio.wait_for(
        awaitable,
        timeout=deadline,
    )


def _require_utility_model() -> None:
    configured = os.getenv("GEMINI_MODEL", RESEARCH_MODEL_RESOURCE)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise RuntimeError(
            "Structured Gemini utilities require "
            f"GEMINI_MODEL={RESEARCH_MODEL_RESOURCE}; "
            f"received {configured!r}. Provider/model fallback is disabled."
        )


def _build_structured_utility_runtime(
    api_key: str,
) -> _SharedStructuredUtilityRuntime:
    _require_utility_model()
    http_client = BoundedRetryAsyncClient(
        attempts=UTILITY_HTTP_ATTEMPTS,
        operation_seconds=UTILITY_HTTP_OPERATION_SECONDS,
        timeout=httpx.Timeout(UTILITY_HTTP_TIMEOUT_SECONDS, connect=10.0),
        follow_redirects=False,
    )
    # The HTTPX transport is the sole owner of transient retries.  PydanticAI
    # may still perform output-validation repair, which is a distinct model
    # correction request rather than a duplicate transport retry.
    retry_options = HttpRetryOptions(
        attempts=1,
        http_status_codes=TRANSIENT_HTTP_STATUS_CODES,
    )
    sdk_client = GoogleGenAIClient(
        api_key=api_key,
        http_options=HttpOptions(
            timeout=int(UTILITY_HTTP_TIMEOUT_SECONDS * 1000),
            httpx_async_client=http_client,
            retry_options=retry_options,
        ),
    )
    model = GoogleModel(
        RESEARCH_MODEL_RESOURCE,
        provider=GoogleProvider(client=sdk_client),
        settings=GoogleModelSettings(
            max_tokens=UTILITY_MAX_OUTPUT_TOKENS,
            google_thinking_config={"thinking_level": UTILITY_THINKING_LEVEL},
        ),
    )
    return _SharedStructuredUtilityRuntime(
        model=model,
        sdk_client=sdk_client,
        http_client=http_client,
    )


def get_shared_structured_utility_model(api_key: str) -> GoogleModel:
    """Return the cached exact Gemini model for structured utility calls."""

    if not api_key or not api_key.strip():
        raise ValueError("A non-empty Gemini API key is required")
    _require_utility_model()
    credential_fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    runtime = _SHARED_STRUCTURED_UTILITY_MODELS.get(credential_fingerprint)
    if runtime is None:
        runtime = _build_structured_utility_runtime(api_key)
        _SHARED_STRUCTURED_UTILITY_MODELS[credential_fingerprint] = runtime
    return runtime.model


async def close_shared_structured_utility_models() -> None:
    """Close all caller-owned utility transports during application shutdown."""

    runtimes = list(_SHARED_STRUCTURED_UTILITY_MODELS.values())
    _SHARED_STRUCTURED_UTILITY_MODELS.clear()
    closed_transports: set[int] = set()
    for runtime in runtimes:
        if id(runtime.http_client) in closed_transports:
            continue
        closed_transports.add(id(runtime.http_client))
        await runtime.http_client.aclose()
        runtime.sdk_client.close()
