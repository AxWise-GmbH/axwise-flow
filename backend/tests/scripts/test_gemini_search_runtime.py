"""Behavioral contracts for bounded Gemini Google Search grounding."""

from __future__ import annotations

import asyncio
import gc
import json
import logging
import time
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from backend.services.generative.gemini_search_service import (
    GEMINI_SEARCH_ATTEMPT_SECONDS,
    GEMINI_SEARCH_OPERATION_SECONDS,
    GeminiSearchService,
)


pytestmark = pytest.mark.contract


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds

    async def async_sleep(self, seconds: float) -> None:
        self.sleep(seconds)


class SequenceModels:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class AsyncSequenceModels:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class BlockingAsyncModels:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        self.started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


class ProviderStatusError(RuntimeError):
    def __init__(self, code: int | str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _response(text: str = "Grounded answer") -> SimpleNamespace:
    source_url = "https://authority.example/grounded-answer"
    grounding_metadata = SimpleNamespace(
        web_search_queries=["query one", "query two", "query three"],
        search_entry_point=None,
        grounding_chunks=[
            SimpleNamespace(
                web=SimpleNamespace(title="Authority", uri=source_url)
            )
        ],
        grounding_supports=[
            SimpleNamespace(
                segment=SimpleNamespace(
                    text=text,
                    start_index=0,
                    end_index=len(text.encode("utf-8")),
                    part_index=0,
                ),
                grounding_chunk_indices=[0],
                confidence_scores=[0.99],
            )
        ],
    )
    return SimpleNamespace(
        text=text,
        model_version="gemini-3.8-flash-001",
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[SimpleNamespace(text=text)]),
                grounding_metadata=grounding_metadata,
            )
        ],
        usage_metadata=SimpleNamespace(
            prompt_token_count=17,
            candidates_token_count=9,
            thoughts_token_count=11,
            tool_use_prompt_token_count=4,
            total_token_count=41,
        ),
    )


def _redirect_response(
    provider_urls: list[str], text: str = "Grounded answer"
) -> SimpleNamespace:
    metadata = SimpleNamespace(
        web_search_queries=["grounded query"],
        search_entry_point=None,
        grounding_chunks=[
            SimpleNamespace(
                web=SimpleNamespace(title=f"Source {index}", uri=url)
            )
            for index, url in enumerate(provider_urls)
        ],
        grounding_supports=[
            SimpleNamespace(
                segment=SimpleNamespace(
                    text=text,
                    start_index=0,
                    end_index=len(text.encode("utf-8")),
                    part_index=0,
                ),
                grounding_chunk_indices=[0],
                confidence_scores=[0.99],
            )
        ],
    )
    return SimpleNamespace(
        text=text,
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[SimpleNamespace(text=text)]),
                grounding_metadata=metadata,
            )
        ],
        usage_metadata=SimpleNamespace(
            prompt_token_count=2,
            candidates_token_count=3,
            total_token_count=5,
        ),
    )


def _service(models: SequenceModels, clock: FakeClock) -> GeminiSearchService:
    service = GeminiSearchService.__new__(GeminiSearchService)
    service._client = SimpleNamespace(models=models)
    service._search_clock = clock.monotonic
    service._search_sleep = clock.sleep
    service._search_operation_seconds = 10.0
    service._search_attempt_seconds = 5.0
    service._search_max_attempts = 3
    return service


def _async_service(
    models: AsyncSequenceModels | BlockingAsyncModels,
    clock: FakeClock,
) -> GeminiSearchService:
    service = GeminiSearchService.__new__(GeminiSearchService)
    service._client = SimpleNamespace()
    service._async_client = SimpleNamespace(models=models)
    service._search_clock = clock.monotonic
    service._search_async_sleep = clock.async_sleep
    service._search_operation_seconds = 10.0
    service._search_attempt_seconds = 5.0
    service._search_max_attempts = 3
    return service


def _http_status_error(
    code: int,
    *,
    retry_after: str | None = None,
    message: str | None = None,
    body: bytes = b"",
) -> Exception:
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com")
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    response = httpx.Response(
        code,
        request=request,
        headers=headers,
        content=body,
    )
    return httpx.HTTPStatusError(
        message or f"status {code}",
        request=request,
        response=response,
    )


def test_constructor_accepts_narrower_workflow_runtime_bounds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    generic = GeminiSearchService()
    service = GeminiSearchService(
        search_operation_seconds=45,
        search_attempt_seconds=20,
    )

    assert generic._search_operation_seconds == GEMINI_SEARCH_OPERATION_SECONDS
    assert generic._search_attempt_seconds == GEMINI_SEARCH_ATTEMPT_SECONDS
    assert service._search_operation_seconds == 45
    assert service._search_attempt_seconds == 20


@pytest.mark.parametrize(
    ("operation_seconds", "attempt_seconds", "message"),
    [
        (0, 1, "search_operation_seconds"),
        (121, 1, "search_operation_seconds"),
        (45, 0, "search_attempt_seconds"),
        (45, 46, "search_attempt_seconds"),
        (float("nan"), 1, "search_operation_seconds"),
    ],
)
def test_constructor_rejects_unbounded_runtime_limits(
    operation_seconds: float,
    attempt_seconds: float,
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        GeminiSearchService(
            search_operation_seconds=operation_seconds,
            search_attempt_seconds=attempt_seconds,
        )


def test_search_uses_exact_model_one_sdk_attempt_and_emits_runtime_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "models/gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels([_response()])
    service = _service(models, clock)

    result = service.search_web_general("current Estonian cat-food market")

    assert result["search_performed"] is True
    assert len(models.calls) == 1
    call = models.calls[0]
    assert call["model"] == "gemini-3.8-flash"
    config = call["config"]
    assert config.temperature is None
    assert config.top_p is None
    assert config.top_k is None
    assert config.candidate_count is None
    assert config.max_output_tokens is None
    assert str(config.thinking_config.thinking_level).upper().endswith("HIGH")
    assert config.http_options.timeout == 5000
    assert config.http_options.retry_options.attempts == 1
    assert result["runtime_diagnostics"] == {
        "route": "gemini_google_search",
        "model": "gemini-3.8-flash",
        "status": "ok",
        "elapsed_ms": 0,
        "call_count": 1,
        "retry_count": 0,
        "deadline_ms": 10000,
        "fallback_used": False,
    }
    assert result["usage_metadata"] == {
        "input_tokens": 21,
        "output_tokens": 20,
        "total_tokens": 41,
    }
    assert result["model_version"] == "gemini-3.8-flash-001"
    assert result["provider_queries"] == ["query one", "query two", "query three"]


@pytest.mark.asyncio
async def test_async_search_uses_exact_model_and_same_bounded_sdk_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "models/gemini-3.8-flash")
    clock = FakeClock()
    models = AsyncSequenceModels([_response()])
    service = _async_service(models, clock)

    result = await service.search_web_general_async(
        "current Estonian cat-food market"
    )

    assert result["search_performed"] is True
    assert len(models.calls) == 1
    call = models.calls[0]
    assert call["model"] == "gemini-3.8-flash"
    config = call["config"]
    assert config.temperature is None
    assert config.max_output_tokens is None
    assert str(config.thinking_config.thinking_level).upper().endswith("HIGH")
    assert config.http_options.timeout == 5000
    assert config.http_options.retry_options.attempts == 1
    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["usage_metadata"] == {
        "input_tokens": 21,
        "output_tokens": 20,
        "total_tokens": 41,
    }


@pytest.mark.asyncio
async def test_async_generated_text_without_grounding_metadata_fails_closed() -> None:
    response = _response("Ungrounded provider prose must not escape.")
    response.candidates[0].grounding_metadata = None
    models = AsyncSequenceModels([response])
    service = _async_service(models, FakeClock())

    result = await service.search_web_general_async("current facts")

    assert len(models.calls) == 1
    assert result["search_performed"] is False
    assert result["text"] == ""
    assert result["sources"] == []
    assert result["claims"] == []
    assert result["error"] == "MissingGroundingEvidence"
    assert result["runtime_diagnostics"]["status"] == "grounding_evidence_missing"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["usage_metadata"] == {
        "input_tokens": 21,
        "output_tokens": 20,
        "total_tokens": 41,
    }
    assert result["model_version"] == "gemini-3.8-flash-001"


def test_grounding_chunks_without_source_backed_support_fail_closed() -> None:
    response = _response("Unsupported provider prose must not escape.")
    response.candidates[0].grounding_metadata.grounding_supports = []
    service = _service(SequenceModels([response]), FakeClock())

    result = service.search_web_general("current facts")

    assert result["search_performed"] is False
    assert result["text"] == ""
    assert result["sources"] == []
    assert result["claims"] == []
    assert result["error"] == "MissingGroundingEvidence"
    assert result["runtime_diagnostics"]["status"] == "grounding_evidence_missing"


@pytest.mark.asyncio
async def test_async_transient_retry_uses_cancellable_sleep(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = AsyncSequenceModels(
        [
            ProviderStatusError(
                503,
                "sensitive async provider message and body",
            ),
            _response(),
        ]
    )
    service = _async_service(models, clock)

    result = await service.search_web_general_async("Estonian authority sources")

    assert clock.sleeps == [1.0]
    assert len(models.calls) == 2
    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["elapsed_ms"] == 1000
    assert "upstream_status_code" not in result["runtime_diagnostics"]
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code=503" in log_output
    assert "sensitive async provider" not in log_output


@pytest.mark.asyncio
async def test_cancelling_async_search_cancels_provider_without_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    models = BlockingAsyncModels()
    service = _async_service(models, FakeClock())
    task = asyncio.create_task(service.search_web_general_async("blocking query"))
    await models.started.wait()

    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert models.cancelled.is_set()
    assert len(models.calls) == 1


@pytest.mark.asyncio
async def test_stalled_async_provider_automatically_hits_outer_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    models = BlockingAsyncModels()
    service = _async_service(models, FakeClock())
    service._search_clock = time.monotonic
    service._search_operation_seconds = 0.02
    service._search_attempt_seconds = 0.02
    started_at = time.monotonic()

    result = await asyncio.wait_for(
        service.search_web_general_async("stalled grounded query"),
        timeout=1,
    )

    wall_elapsed = time.monotonic() - started_at
    assert models.cancelled.is_set()
    assert len(models.calls) == 1
    assert result["search_performed"] is False
    assert result["error"] == "TimeoutError"
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["runtime_diagnostics"]["deadline_ms"] == 20
    diagnostic_elapsed_ms = result["runtime_diagnostics"]["elapsed_ms"]
    assert 10 <= diagnostic_elapsed_ms <= 500
    assert abs(diagnostic_elapsed_ms - round(wall_elapsed * 1000)) <= 5
    assert wall_elapsed < 0.5


@pytest.mark.asyncio
async def test_repeated_cancellation_stops_async_redirect_resolution() -> None:
    provider_url = (
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/source"
    )
    service = _async_service(
        AsyncSequenceModels([_redirect_response([provider_url])]),
        FakeClock(),
    )
    started = asyncio.Event()
    cancelled = asyncio.Event()
    release_cleanup = asyncio.Event()

    async def resolve(_url: str) -> str:
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            await release_cleanup.wait()
            raise

    service._grounding_redirect_async_resolver = resolve
    search = asyncio.create_task(service.search_web_general_async("grounded"))
    await asyncio.wait_for(started.wait(), timeout=1)

    search.cancel()
    await asyncio.wait_for(cancelled.wait(), timeout=1)
    search.cancel()
    assert not search.done()
    release_cleanup.set()

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(search, timeout=1)


@pytest.mark.asyncio
async def test_async_redirect_phase_has_strict_aggregate_deadline() -> None:
    provider_url = (
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/source"
    )
    service = _async_service(
        AsyncSequenceModels([_redirect_response([provider_url])]),
        FakeClock(),
    )
    service._search_redirect_seconds = 0.01
    cancelled = asyncio.Event()

    async def resolve(_url: str) -> str:
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    service._grounding_redirect_async_resolver = resolve
    service._grounding_redirect_resolver = lambda _url: pytest.fail(
        "async workflow parser attempted synchronous redirect I/O"
    )

    result = await asyncio.wait_for(
        service.search_web_general_async("grounded"), timeout=1
    )

    assert cancelled.is_set()
    assert result["search_performed"] is True
    assert result["sources"][0]["url"] == provider_url
    assert result["sources"][0]["resolved_url"] is None


@pytest.mark.asyncio
async def test_async_redirect_child_failure_is_sanitized_without_exception_group() -> None:
    provider_url = (
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/source"
    )
    service = _async_service(
        AsyncSequenceModels([_redirect_response([provider_url])]),
        FakeClock(),
    )

    async def resolve(_url: str) -> str:
        raise RuntimeError("sensitive redirect failure")

    service._grounding_redirect_async_resolver = resolve

    result = await service.search_web_general_async("grounded")

    assert result["search_performed"] is True
    assert result["sources"][0]["url"] == provider_url
    assert result["sources"][0]["resolved_url"] is None
    assert "sensitive redirect failure" not in str(result)


@pytest.mark.asyncio
async def test_async_normalization_updates_elapsed_and_caps_redirects() -> None:
    provider_urls = [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/"
        f"source-{index}"
        for index in range(12)
    ]
    clock = FakeClock()
    service = _async_service(
        AsyncSequenceModels([_redirect_response(provider_urls)]), clock
    )
    observed: list[str] = []

    async def resolve(url: str) -> str:
        observed.append(url)
        if len(observed) == 1:
            clock.sleep(7)
        return f"https://authority.example/source-{len(observed)}"

    service._grounding_redirect_async_resolver = resolve

    result = await service.search_web_general_async("grounded")

    assert len(observed) == 10
    assert len(result["sources"]) == 10
    assert result["runtime_diagnostics"]["elapsed_ms"] == 7000
    assert result["runtime_diagnostics"]["deadline_ms"] == 35_000


@pytest.mark.asyncio
async def test_async_cpu_parser_fails_closed_at_its_absolute_deadline() -> None:
    clock = FakeClock()
    base_response = _response()

    class AdvancingResponse:
        candidates = base_response.candidates
        usage_metadata = base_response.usage_metadata

        @property
        def text(self) -> str:
            clock.sleep(6)
            return "bounded response"

    service = _async_service(
        AsyncSequenceModels([AdvancingResponse()]),
        clock,
    )

    result = await service.search_web_general_async("grounded")

    assert result["search_performed"] is False
    assert result["error"] == "TimeoutError"
    assert result["runtime_diagnostics"]["status"] == "response_processing_error"
    assert result["runtime_diagnostics"]["elapsed_ms"] == 6000
    assert result["runtime_diagnostics"]["deadline_ms"] == 35_000


def test_transient_disconnect_retries_same_model_with_bounded_call_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels(
        [httpx.RemoteProtocolError("Server disconnected"), _response()]
    )
    service = _service(models, clock)

    result = service.search_web_general("Estonian authority sources")

    assert [call["model"] for call in models.calls] == [
        "gemini-3.8-flash",
        "gemini-3.8-flash",
    ]
    assert clock.sleeps == [1.0]
    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["retry_count"] == 1
    assert result["runtime_diagnostics"]["elapsed_ms"] == 1000
    assert result["provider_queries"] == ["query one", "query two", "query three"]


def test_retry_after_is_honored_without_sdk_retry_multiplication(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels(
        [
            _http_status_error(
                429,
                retry_after="7",
                message="sensitive quota message",
                body=b"sensitive quota response body",
            ),
            _response(),
        ]
    )
    service = _service(models, clock)
    # Keep a useful retry window after the provider's seven-second backoff.
    service._search_operation_seconds = 20

    result = service.search_web_general("Estonian commercial market")

    assert clock.sleeps == [7.0]
    assert len(models.calls) == 2
    assert all(
        call["config"].http_options.retry_options.attempts == 1
        for call in models.calls
    )
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["elapsed_ms"] == 7000
    assert "upstream_status_code" not in result["runtime_diagnostics"]
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code=429" in log_output
    assert "sensitive quota" not in log_output


@pytest.mark.asyncio
@pytest.mark.parametrize("async_mode", [False, True])
@pytest.mark.parametrize(
    ("statuses", "durations", "expected_timeouts", "expected_status"),
    [
        ([200], [32.8], [60], "ok"),
        ([504, 504, 400], [20, 20, 1], [60, 60, 60], "retry_exhausted"),
        ([504, 504], [60, 54.6], [60, 59], "deadline_exceeded"),
    ],
)
async def test_real_sdk_serializes_fresh_identical_grounded_requests_with_bounded_retries(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    async_mode: bool,
    statuses: list[int],
    durations: list[float],
    expected_timeouts: list[int],
    expected_status: str,
) -> None:
    from google import genai
    from google.genai import types
    from backend.services.generative.gemini_search_service import (
        _GroundedSearchRuntimeError,
    )

    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    caplog.set_level(logging.INFO)
    clock = FakeClock()
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        index = len(requests) - 1
        # A surprise retry fails without ever reaching a real HTTP transport.
        assert index < len(statuses)
        clock.now += durations[index]
        status = statuses[index]
        if status == 200:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "synthetic answer"}]}}
                    ],
                    "modelVersion": "gemini-3.8-flash-001",
                },
            )
        return httpx.Response(
            status,
            json={
                "error": {
                    "code": status,
                    "status": (
                        "DEADLINE_EXCEEDED" if status == 504 else "INVALID_ARGUMENT"
                    ),
                    "message": "sensitive synthetic provider payload",
                }
            },
        )

    transport = httpx.MockTransport(respond)
    sync_http = httpx.Client(transport=transport, trust_env=False)
    async_http = httpx.AsyncClient(transport=transport, trust_env=False)
    client = genai.Client(
        api_key="synthetic-not-a-real-key",
        vertexai=False,
        http_options=types.HttpOptions(
            httpx_client=sync_http, httpx_async_client=async_http
        ),
    )
    service = _async_service(AsyncSequenceModels([]), clock)
    service._client = client
    service._async_client = client.aio
    service._search_sleep = clock.sleep
    service._search_operation_seconds = 120
    service._search_attempt_seconds = 60
    query = "sensitive synthetic user research question"
    try:
        try:
            if async_mode:
                _, diagnostics = await service._generate_grounded_content_async(query)
            else:
                _, diagnostics = service._generate_grounded_content(query)
        except _GroundedSearchRuntimeError as error:
            diagnostics = error.diagnostics
        assert diagnostics["status"] == expected_status
        assert diagnostics["call_count"] == len(statuses) <= 3
        assert diagnostics["deadline_ms"] == 120000
        assert diagnostics["elapsed_ms"] <= 120000
        assert len({request.content for request in requests}) == 1
        for request, timeout in zip(requests, expected_timeouts, strict=True):
            payload = json.loads(request.content)
            assert payload["tools"] == [{"googleSearch": {}}]
            assert payload["generationConfig"] == {
                "thinkingConfig": {"thinking_level": "HIGH"}
            }
            assert request.url.path == "/v1beta/models/gemini-3.8-flash:generateContent"
            assert request.headers["X-Server-Timeout"] == str(timeout)
            assert request.extensions["timeout"]["read"] == pytest.approx(
                timeout, abs=0.002
            )
        if expected_status == "deadline_exceeded":
            assert clock.sleeps == [1.0]  # No useless final sleep or tiny third call.
        logs = "\n".join(caplog.messages)
        assert "phase=started timeout_ms=60000" in logs
        assert "remaining_ms=120000" in logs or "remaining_ms=119999" in logs
        assert query not in logs
        assert "sensitive synthetic provider payload" not in logs
        assert "synthetic-not-a-real-key" not in logs
    finally:
        await client.aio.aclose()
        client.close()
        await async_http.aclose()
        sync_http.close()
        # The pinned SDK schedules a second best-effort close in __del__.
        # Release it while this test loop is alive, not during loop teardown.
        service._async_client = None
        service._client = None
        del client
        gc.collect()
        await asyncio.sleep(0)
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_assistant_budget_can_be_cancelled_without_retry_or_background_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.services.workflow_v2.cognitive_executor import (
        GeminiGroundedResearchRunner,
    )

    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    models = BlockingAsyncModels()
    runner = GeminiGroundedResearchRunner.__new__(GeminiGroundedResearchRunner)
    runner.service = _async_service(models, FakeClock())
    runner.service._search_operation_seconds = 120
    runner.service._search_attempt_seconds = 60
    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.02):
            await runner.search("sensitive synthetic request")
    assert models.cancelled.is_set()
    assert len(models.calls) == 1
    assert models.calls[0]["config"].http_options.timeout == 60000


@pytest.mark.parametrize("async_mode", [False, True])
@pytest.mark.asyncio
async def test_retry_budget_is_rechecked_after_oversleep(
    monkeypatch: pytest.MonkeyPatch,
    async_mode: bool,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = (
        AsyncSequenceModels([_http_status_error(504)])
        if async_mode
        else SequenceModels([_http_status_error(504)])
    )
    service = _async_service(models, clock) if async_mode else _service(models, clock)

    def oversleep(_seconds: float) -> None:
        clock.now = 6  # Only four of the configured ten seconds remain.

    async def async_oversleep(seconds: float) -> None:
        oversleep(seconds)

    service._search_sleep = oversleep
    service._search_async_sleep = async_oversleep
    result = (
        await service.search_web_general_async("synthetic")
        if async_mode
        else service.search_web_general("synthetic")
    )
    assert len(models.calls) == 1
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"


def test_non_transient_error_is_not_retried(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels(
        [
            _http_status_error(
                400,
                message="sensitive sync provider message",
                body=b"sensitive sync provider body",
            )
        ]
    )
    service = _service(models, clock)

    result = service.search_web_general("invalid request")

    assert result["search_performed"] is False
    assert result["error"] == "HTTPStatusError"
    assert len(models.calls) == 1
    assert clock.sleeps == []
    assert result["runtime_diagnostics"]["status"] == "non_retryable_error"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["runtime_diagnostics"]["upstream_status_code"] == 400
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code=400" in log_output
    assert "sensitive sync provider" not in log_output
    assert "sensitive sync provider" not in str(result)


@pytest.mark.asyncio
async def test_async_first_non_transient_error_remains_non_retryable(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = AsyncSequenceModels(
        [
            ProviderStatusError(
                "403",
                "sensitive async rejection and body",
            )
        ]
    )
    service = _async_service(models, clock)

    result = await service.search_web_general_async("invalid async request")

    assert result["search_performed"] is False
    assert result["error"] == "ProviderStatusError"
    assert len(models.calls) == 1
    assert clock.sleeps == []
    assert result["runtime_diagnostics"]["status"] == "non_retryable_error"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["runtime_diagnostics"]["retry_count"] == 0
    assert result["runtime_diagnostics"]["elapsed_ms"] == 0
    assert result["runtime_diagnostics"]["upstream_status_code"] == 403
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code=403" in log_output
    assert "sensitive async rejection" not in log_output
    assert "sensitive async rejection" not in str(result)


def test_transient_then_non_transient_failure_remains_fallback_eligible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels(
        [_http_status_error(504), _http_status_error(400)]
    )
    service = _service(models, clock)

    result = service.search_web_general("temporarily unavailable search")

    assert result["search_performed"] is False
    assert result["error"] == "HTTPStatusError"
    assert len(models.calls) == 2
    assert clock.sleeps == [1.0]
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["retry_count"] == 1
    assert result["runtime_diagnostics"]["elapsed_ms"] == 1000
    assert result["runtime_diagnostics"]["upstream_status_code"] == 400


@pytest.mark.asyncio
async def test_async_transients_then_non_transient_failure_remain_fallback_eligible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = AsyncSequenceModels(
        [
            _http_status_error(504),
            _http_status_error(504),
            _http_status_error(400),
        ]
    )
    service = _async_service(models, clock)

    result = await service.search_web_general_async(
        "repeatedly unavailable search"
    )

    assert result["search_performed"] is False
    assert result["error"] == "HTTPStatusError"
    assert len(models.calls) == 3
    assert clock.sleeps == [1.0, 2.0]
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    assert result["runtime_diagnostics"]["call_count"] == 3
    assert result["runtime_diagnostics"]["retry_count"] == 2
    assert result["runtime_diagnostics"]["elapsed_ms"] == 3000
    assert result["runtime_diagnostics"]["upstream_status_code"] == 400


@pytest.mark.parametrize(
    "invalid_status_code",
    [True, 99, 600, "099", "600", " 429", "429.0", 429.0],
)
def test_invalid_upstream_status_is_omitted_from_diagnostics_and_logs(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    invalid_status_code: Any,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    error = RuntimeError("sensitive invalid-status provider response")
    error.status_code = invalid_status_code
    service = _service(SequenceModels([error]), FakeClock())

    result = service.search_web_general("invalid provider status")

    assert result["search_performed"] is False
    assert "upstream_status_code" not in result["runtime_diagnostics"]
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code" not in log_output
    assert "sensitive invalid-status" not in log_output
    assert "sensitive invalid-status" not in str(result)


@pytest.mark.asyncio
async def test_async_retry_retains_last_valid_status_when_terminal_error_has_none(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    models = AsyncSequenceModels(
        [
            ProviderStatusError(503, "sensitive first failure"),
            httpx.RemoteProtocolError("sensitive disconnect two"),
            httpx.RemoteProtocolError("sensitive disconnect three"),
        ]
    )
    service = _async_service(models, FakeClock())

    result = await service.search_web_general_async("retain provider status")

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    assert result["runtime_diagnostics"]["upstream_status_code"] == 503
    log_output = "\n".join(caplog.messages)
    assert "upstream_status_code=503" in log_output
    assert "sensitive first failure" not in log_output
    assert "sensitive disconnect" not in log_output
    assert "sensitive" not in str(result)


def test_retry_delay_cannot_exceed_total_operation_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    clock = FakeClock()
    models = SequenceModels([_http_status_error(429, retry_after="20")])
    service = _service(models, clock)
    service._search_operation_seconds = 0.5
    service._search_attempt_seconds = 0.5

    result = service.search_web_general("bounded search")

    assert result["search_performed"] is False
    assert len(models.calls) == 1
    assert clock.sleeps == []
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["runtime_diagnostics"]["deadline_ms"] == 500


def test_wrong_search_model_fails_closed_before_provider_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-2.5-flash")
    clock = FakeClock()
    models = SequenceModels([_response()])
    service = _service(models, clock)

    result = service.search_web_general("must not fall back")

    assert result["search_performed"] is False
    assert result["error"] == "RuntimeError"
    assert models.calls == []
    assert result["runtime_diagnostics"]["status"] == "configuration_error"
    assert result["runtime_diagnostics"]["call_count"] == 0
    assert result["runtime_diagnostics"]["fallback_used"] is False


def test_trusted_google_redirect_is_resolved_once_without_fetching_final_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    text = "EU feed law applies."
    provider_url = (
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/source123"
    )
    final_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=example"
    metadata = SimpleNamespace(
        web_search_queries=["EU feed law"],
        search_entry_point=None,
        grounding_chunks=[
            SimpleNamespace(
                web=SimpleNamespace(title="EU feed law", uri=provider_url)
            )
        ],
        grounding_supports=[
            SimpleNamespace(
                segment=SimpleNamespace(
                    text=text,
                    start_index=0,
                    end_index=len(text.encode("utf-8")),
                    part_index=0,
                ),
                grounding_chunk_indices=[0],
                confidence_scores=[0.99],
            )
        ],
    )
    response = SimpleNamespace(
        text=text,
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[SimpleNamespace(text=text)]),
                grounding_metadata=metadata,
            )
        ],
        usage_metadata=SimpleNamespace(
            prompt_token_count=2,
            candidates_token_count=3,
            total_token_count=5,
        ),
    )
    clock = FakeClock()
    service = _service(SequenceModels([response]), clock)
    observed = []

    def resolve(url: str) -> str:
        observed.append(url)
        return final_url

    service._grounding_redirect_resolver = resolve
    result = service.search_web_general("EU feed law")

    assert observed == [provider_url]
    assert result["sources"][0]["url"] == final_url
    assert result["sources"][0]["provider_url"] == provider_url
    assert result["sources"][0]["resolved_url"] == final_url
    assert result["sources"][0]["provider_redirect"] is True
    assert result["claims"][0]["source_urls"] == [final_url]


def test_grounding_redirect_rejects_untrusted_and_private_destinations() -> None:
    clock = FakeClock()
    service = _service(SequenceModels([]), clock)
    called = []
    service._grounding_redirect_resolver = lambda url: called.append(url) or "https://127.0.0.1/x"

    assert service._resolve_grounding_redirect("https://blog.example/redirect") is None
    assert called == []
    assert service._resolve_grounding_redirect(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/private"
    ) is None


def test_direct_grounding_chunks_reject_unsafe_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.8-flash")
    metadata = SimpleNamespace(
        web_search_queries=[],
        search_entry_point=None,
        grounding_chunks=[
            SimpleNamespace(web=SimpleNamespace(title="HTTP", uri="http://example.com/x")),
            SimpleNamespace(
                web=SimpleNamespace(title="User info", uri="https://user@example.com/x")
            ),
            SimpleNamespace(
                web=SimpleNamespace(title="Private IP", uri="https://127.0.0.1/x")
            ),
            SimpleNamespace(
                web=SimpleNamespace(title="Valid", uri="https://authority.example/x")
            ),
        ],
        grounding_supports=[
            SimpleNamespace(
                segment=SimpleNamespace(
                    text="Grounded answer",
                    start_index=0,
                    end_index=len("Grounded answer".encode("utf-8")),
                    part_index=0,
                ),
                grounding_chunk_indices=[3],
                confidence_scores=[0.99],
            )
        ],
    )
    response = SimpleNamespace(
        text="Grounded answer",
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(parts=[SimpleNamespace(text="Grounded answer")]),
                grounding_metadata=metadata,
            )
        ],
        usage_metadata=None,
    )
    service = _service(SequenceModels([response]), FakeClock())

    result = service.search_web_general("safe sources")

    assert result["search_performed"] is True
    assert [source["url"] for source in result["sources"]] == [
        "https://authority.example/x"
    ]
    assert result["claims"][0]["source_urls"] == ["https://authority.example/x"]
