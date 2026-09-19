"""Single exact-model runtime for durable Gemini 3.8 research."""

from __future__ import annotations

import asyncio
import hashlib
import os
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Optional

import httpx
from google.genai import Client as GoogleGenAIClient
from google.genai.types import HttpOptions, HttpRetryOptions, ThinkingLevel
from pydantic_ai.messages import ModelResponse
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.providers.google import GoogleProvider

RESEARCH_MODEL = "gemini-3.8-flash"
RESEARCH_MODEL_RESOURCE = f"models/{RESEARCH_MODEL}"
RESEARCH_THINKING_LEVEL = ThinkingLevel.HIGH
RESEARCH_MAX_OUTPUT_TOKENS = 65_536
TRANSIENT_HTTP_STATUS_CODES = [408, 429, 500, 502, 503, 504]
RESEARCH_HTTP_ATTEMPTS = 3
RESEARCH_HTTP_OPERATION_SECONDS = 420.0
RESEARCH_HTTP_TIMEOUT_SECONDS = 360.0
MAX_RETRY_AFTER_SECONDS = 20.0


@dataclass(frozen=True)
class _SharedResearchRuntime:
    model: GoogleModel
    sdk_client: GoogleGenAIClient
    http_client: "BoundedRetryAsyncClient"


_SHARED_RESEARCH_MODELS: dict[str, _SharedResearchRuntime] = {}
_SHARED_WORKFLOW_MODELS: dict[str, _SharedResearchRuntime] = {}


class BoundedRetryAsyncClient(httpx.AsyncClient):
    """HTTPX client with one bounded retry owner for Gemini research calls.

    google-genai 2.17 retries timeouts and connect failures, but does not retry
    ``RemoteProtocolError`` (the production "server disconnected" failure) or
    honor ``Retry-After``. This client owns those retries. The SDK retry layer is
    therefore configured for one attempt in :func:`build_research_model`, which
    prevents multiplicative 3x3 retries and preserves exact-model routing.
    """

    _TRANSIENT_ERRORS = (
        httpx.TimeoutException,
        httpx.NetworkError,
        httpx.RemoteProtocolError,
    )

    def __init__(
        self,
        *,
        attempts: int = RESEARCH_HTTP_ATTEMPTS,
        operation_seconds: float = RESEARCH_HTTP_OPERATION_SECONDS,
        initial_delay: float = 1.0,
        max_delay: float = 12.0,
        jitter: float = 0.5,
        **kwargs: Any,
    ) -> None:
        if attempts < 1:
            raise ValueError("attempts must be at least one")
        if operation_seconds <= 0:
            raise ValueError("operation_seconds must be positive")
        self._retry_attempts = attempts
        self._operation_seconds = operation_seconds
        self._initial_delay = max(0.0, initial_delay)
        self._max_delay = max(0.0, max_delay)
        self._jitter = max(0.0, jitter)
        super().__init__(**kwargs)

    @staticmethod
    def _parse_retry_after(value: Optional[str]) -> Optional[float]:
        if not value:
            return None
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            pass
        try:
            retry_at = parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(
                0.0, (retry_at - datetime.now(timezone.utc)).total_seconds()
            )
        except (TypeError, ValueError, OverflowError):
            return None

    def _retry_delay(self, response: Optional[httpx.Response], attempt: int) -> float:
        exponential = min(
            self._max_delay,
            self._initial_delay * (2 ** max(0, attempt - 1)),
        )
        randomized = exponential + random.random() * self._jitter
        retry_after = None
        if response is not None:
            retry_after = self._parse_retry_after(
                response.headers.get("Retry-After")
            )
        if retry_after is not None:
            retry_after = min(retry_after, MAX_RETRY_AFTER_SECONDS)
        return max(randomized, retry_after or 0.0)

    @staticmethod
    def _clone_request(request: httpx.Request, content: bytes) -> httpx.Request:
        # SDK Gemini requests are replayable JSON/GET requests. Buffer once and
        # reconstruct the Request so a consumed ByteStream is never reused.
        return httpx.Request(
            method=request.method,
            url=request.url,
            headers=request.headers,
            content=content,
            extensions=dict(request.extensions),
        )

    async def send(
        self,
        request: httpx.Request,
        *,
        stream: bool = False,
        auth: Any = httpx.USE_CLIENT_DEFAULT,
        follow_redirects: Any = httpx.USE_CLIENT_DEFAULT,
    ) -> httpx.Response:
        body = await request.aread()
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._operation_seconds

        for attempt in range(1, self._retry_attempts + 1):
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise httpx.TimeoutException(
                    "Gemini transport exceeded its bounded operation deadline",
                    request=request,
                )

            attempt_request = self._clone_request(request, body)
            response: Optional[httpx.Response] = None
            try:
                response = await asyncio.wait_for(
                    super().send(
                        attempt_request,
                        stream=stream,
                        auth=auth,
                        follow_redirects=follow_redirects,
                    ),
                    timeout=remaining,
                )
            except asyncio.CancelledError:
                raise
            except asyncio.TimeoutError as exc:
                error: BaseException = httpx.ReadTimeout(
                    "Gemini transport exceeded its bounded operation deadline",
                    request=attempt_request,
                )
                error.__cause__ = exc
            except self._TRANSIENT_ERRORS as exc:
                error = exc
            else:
                if response.status_code not in TRANSIENT_HTTP_STATUS_CODES:
                    return response
                if attempt >= self._retry_attempts:
                    return response
                error = httpx.HTTPStatusError(
                    f"Transient Gemini HTTP status {response.status_code}",
                    request=attempt_request,
                    response=response,
                )

            if attempt >= self._retry_attempts:
                raise error

            sleep_seconds = self._retry_delay(response, attempt)
            remaining = deadline - loop.time()
            if sleep_seconds >= remaining:
                if response is not None:
                    await response.aclose()
                raise httpx.TimeoutException(
                    "Gemini retry delay exceeded its bounded operation deadline",
                    request=attempt_request,
                ) from error
            if response is not None:
                await response.aclose()
            await asyncio.sleep(sleep_seconds)

        raise AssertionError("bounded Gemini retry loop exhausted unexpectedly")


def normalized_research_model(value: str) -> str:
    return str(value or "").strip().removeprefix("models/")


def exact_uniform_model_version_from_result(result: Any) -> str | None:
    """Return one proven provider version for every Google response in a run.

    PydanticAI 2.28 sets ``ModelResponse.model_name`` to the configured model
    resource when Google omits ``modelVersion``. The configured resource is
    therefore an ambiguity sentinel, not provider provenance. Output-validation
    retries also create multiple model responses, so a single operation-level
    version is truthful only when every current-run response exposes the same
    non-sentinel value.
    """

    new_messages = getattr(result, "new_messages", None)
    if not callable(new_messages):
        return None
    try:
        messages = new_messages()
    except (AttributeError, TypeError, ValueError):
        return None
    responses = [message for message in messages if isinstance(message, ModelResponse)]
    if not responses:
        return None
    versions: list[str] = []
    for response in responses:
        value = response.model_name
        if (
            response.provider_name != "google"
            or not isinstance(value, str)
            or not value
            or value != value.strip()
            or len(value) > 200
            or value == RESEARCH_MODEL_RESOURCE
        ):
            return None
        versions.append(value)
    return versions[0] if len(set(versions)) == 1 else None


def _build_research_runtime(api_key: str) -> _SharedResearchRuntime:
    configured = os.getenv("GEMINI_MODEL", RESEARCH_MODEL_RESOURCE)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise RuntimeError(
            f"Durable research requires GEMINI_MODEL={RESEARCH_MODEL_RESOURCE}; "
            f"received {configured!r}. Provider/model fallback is disabled."
        )
    http_client = BoundedRetryAsyncClient(
        timeout=httpx.Timeout(RESEARCH_HTTP_TIMEOUT_SECONDS, connect=10.0),
        follow_redirects=False,
    )
    # Exactly one retry owner. The custom HTTPX client handles all supported
    # transient transport/status cases and the SDK must not multiply attempts.
    retry_options = HttpRetryOptions(
        attempts=1,
        http_status_codes=TRANSIENT_HTTP_STATUS_CODES,
    )
    sdk_client = GoogleGenAIClient(
        api_key=api_key,
        http_options=HttpOptions(
            timeout=int(RESEARCH_HTTP_TIMEOUT_SECONDS * 1000),
            httpx_async_client=http_client,
            retry_options=retry_options,
        ),
    )
    model = GoogleModel(
        RESEARCH_MODEL_RESOURCE,
        provider=GoogleProvider(client=sdk_client),
        settings=GoogleModelSettings(
            max_tokens=RESEARCH_MAX_OUTPUT_TOKENS,
            google_thinking_config={
                "thinking_level": RESEARCH_THINKING_LEVEL,
            },
        ),
    )
    return _SharedResearchRuntime(
        model=model,
        sdk_client=sdk_client,
        http_client=http_client,
    )


def build_research_model(api_key: str) -> GoogleModel:
    """Build an exact caller-owned research model.

    Long-lived application code should prefer :func:`get_shared_research_model`
    so its injected HTTP transport is registered for shutdown cleanup.
    """

    return _build_research_runtime(api_key).model


def get_shared_research_model(api_key: str) -> GoogleModel:
    """Return the process-wide exact research model for an API credential.

    ``GoogleProvider(client=...)`` treats the injected google-genai client as
    caller-owned. Reusing the model prevents request-scoped services from
    leaking one HTTPX connection pool per invocation while preserving a single
    bounded transport/retry owner.
    """

    configured = os.getenv("GEMINI_MODEL", RESEARCH_MODEL_RESOURCE)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise RuntimeError(
            f"Durable research requires GEMINI_MODEL={RESEARCH_MODEL_RESOURCE}; "
            f"received {configured!r}. Provider/model fallback is disabled."
        )
    credential_fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    runtime = _SHARED_RESEARCH_MODELS.get(credential_fingerprint)
    if runtime is None:
        runtime = _build_research_runtime(api_key)
        _SHARED_RESEARCH_MODELS[credential_fingerprint] = runtime
    return runtime.model


def get_shared_workflow_model(api_key: str) -> GoogleModel:
    """Exact Gemini 3.8 Flash/HIGH model without an application output cap."""

    configured = os.getenv("GEMINI_MODEL", RESEARCH_MODEL_RESOURCE)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise RuntimeError(
            f"Workflow cognition requires GEMINI_MODEL={RESEARCH_MODEL_RESOURCE}; "
            f"received {configured!r}. Provider/model fallback is disabled."
        )
    credential_fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    runtime = _SHARED_WORKFLOW_MODELS.get(credential_fingerprint)
    if runtime is None:
        research_runtime = _build_research_runtime(api_key)
        model = GoogleModel(
            RESEARCH_MODEL_RESOURCE,
            provider=GoogleProvider(client=research_runtime.sdk_client),
            settings=GoogleModelSettings(
                google_thinking_config={"thinking_level": RESEARCH_THINKING_LEVEL},
            ),
        )
        runtime = _SharedResearchRuntime(
            model=model,
            sdk_client=research_runtime.sdk_client,
            http_client=research_runtime.http_client,
        )
        _SHARED_WORKFLOW_MODELS[credential_fingerprint] = runtime
    return runtime.model


async def _close_shared_research_runtime(runtime: _SharedResearchRuntime) -> None:
    # google-genai deliberately does not own or close a caller-supplied
    # HttpOptions.httpx_async_client. Close that exact transport explicitly,
    # then release the SDK's separately-owned synchronous resources.
    await runtime.http_client.aclose()
    runtime.sdk_client.close()


async def close_shared_research_model(api_key: str) -> None:
    """Release one cached credential runtime (primarily for key rotation/tests)."""

    credential_fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    runtime = _SHARED_RESEARCH_MODELS.pop(credential_fingerprint, None)
    if runtime is not None:
        await _close_shared_research_runtime(runtime)


async def close_shared_research_models() -> None:
    """Close caller-owned google-genai transports during application shutdown."""

    runtimes = list(_SHARED_RESEARCH_MODELS.values()) + list(
        _SHARED_WORKFLOW_MODELS.values()
    )
    _SHARED_RESEARCH_MODELS.clear()
    _SHARED_WORKFLOW_MODELS.clear()
    closed_transports: set[int] = set()
    for runtime in runtimes:
        if id(runtime.http_client) in closed_transports:
            continue
        closed_transports.add(id(runtime.http_client))
        await _close_shared_research_runtime(runtime)


def require_search_model() -> str:
    configured = os.getenv("GEMINI_SEARCH_MODEL", RESEARCH_MODEL)
    if normalized_research_model(configured) != RESEARCH_MODEL:
        raise RuntimeError(
            f"Grounded research requires GEMINI_SEARCH_MODEL={RESEARCH_MODEL}; "
            f"received {configured!r}. Provider/model fallback is disabled."
        )
    return RESEARCH_MODEL


# -----------------------------------------------------------------------------
# Google GenAI Context Caching for Repeated Cognitive Workflow Prompts
# -----------------------------------------------------------------------------
_CONTEXT_CACHE_REGISTRY: dict[str, str] = {}


def get_cached_content_name(cache_key: str) -> str | None:
    """Return the active cached content resource name if cached on Google Cloud."""
    return _CONTEXT_CACHE_REGISTRY.get(cache_key)


async def create_or_reuse_gemini_context_cache(
    client: GoogleGenAIClient,
    *,
    cache_key: str,
    model: str = RESEARCH_MODEL_RESOURCE,
    contents: list[Any],
    ttl_seconds: int = 600,
) -> str | None:
    """Create or reuse a server-side Gemini context cache on Google Cloud.
    
    Caches large static prompts (system instructions, schemas, corpus transcripts)
    with a 10-minute TTL, reducing input token billing by 75% on repeated turns.
    """
    if cache_key in _CONTEXT_CACHE_REGISTRY:
        return _CONTEXT_CACHE_REGISTRY[cache_key]

    try:
        from google.genai import types
        cache_config = types.CreateCachedContentConfig(
            contents=contents,
            ttl=f"{ttl_seconds}s",
            display_name=f"orqanix-cognitive-{cache_key[:12]}"
        )
        cached = await client.aio.caches.create(
            model=model,
            config=cache_config,
        )
        if cached and cached.name:
            _CONTEXT_CACHE_REGISTRY[cache_key] = cached.name
            return cached.name
    except Exception as e:
        # Fall back gracefully to uncached execution if caching is unsupported
        pass
    return None
