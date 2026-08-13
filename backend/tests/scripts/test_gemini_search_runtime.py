"""Behavioral contracts for bounded Gemini Google Search grounding."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from backend.services.generative.gemini_search_service import GeminiSearchService


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


def _response(text: str = "Grounded answer") -> SimpleNamespace:
    return SimpleNamespace(text=text, candidates=[])


def _service(models: SequenceModels, clock: FakeClock) -> GeminiSearchService:
    service = GeminiSearchService.__new__(GeminiSearchService)
    service._client = SimpleNamespace(models=models)
    service._search_clock = clock.monotonic
    service._search_sleep = clock.sleep
    service._search_operation_seconds = 10.0
    service._search_attempt_seconds = 5.0
    service._search_max_attempts = 3
    return service


def _http_status_error(code: int, *, retry_after: str | None = None) -> Exception:
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com")
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    response = httpx.Response(code, request=request, headers=headers)
    return httpx.HTTPStatusError(
        f"status {code}",
        request=request,
        response=response,
    )


def test_search_uses_exact_model_one_sdk_attempt_and_emits_runtime_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "models/gemini-3.7-flash")
    clock = FakeClock()
    models = SequenceModels([_response()])
    service = _service(models, clock)

    result = service.search_web_general("current Estonian cat-food market")

    assert result["search_performed"] is True
    assert len(models.calls) == 1
    call = models.calls[0]
    assert call["model"] == "gemini-3.7-flash"
    config = call["config"]
    assert config.temperature is None
    assert config.top_p is None
    assert config.top_k is None
    assert config.http_options.timeout == 5000
    assert config.http_options.retry_options.attempts == 1
    assert result["runtime_diagnostics"] == {
        "route": "gemini_google_search",
        "model": "gemini-3.7-flash",
        "status": "ok",
        "elapsed_ms": 0,
        "call_count": 1,
        "retry_count": 0,
        "deadline_ms": 10000,
        "fallback_used": False,
    }


def test_transient_disconnect_retries_same_model_with_bounded_call_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
    clock = FakeClock()
    models = SequenceModels(
        [httpx.RemoteProtocolError("Server disconnected"), _response()]
    )
    service = _service(models, clock)

    result = service.search_web_general("Estonian authority sources")

    assert [call["model"] for call in models.calls] == [
        "gemini-3.7-flash",
        "gemini-3.7-flash",
    ]
    assert clock.sleeps == [1.0]
    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["retry_count"] == 1
    assert result["runtime_diagnostics"]["elapsed_ms"] == 1000


def test_retry_after_is_honored_without_sdk_retry_multiplication(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
    clock = FakeClock()
    models = SequenceModels(
        [_http_status_error(429, retry_after="7"), _response()]
    )
    service = _service(models, clock)

    result = service.search_web_general("Estonian commercial market")

    assert clock.sleeps == [7.0]
    assert len(models.calls) == 2
    assert all(
        call["config"].http_options.retry_options.attempts == 1
        for call in models.calls
    )
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["runtime_diagnostics"]["elapsed_ms"] == 7000


def test_non_transient_error_is_not_retried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
    clock = FakeClock()
    models = SequenceModels([_http_status_error(400)])
    service = _service(models, clock)

    result = service.search_web_general("invalid request")

    assert result["search_performed"] is False
    assert result["error"] == "HTTPStatusError"
    assert len(models.calls) == 1
    assert clock.sleeps == []
    assert result["runtime_diagnostics"]["status"] == "non_retryable_error"
    assert result["runtime_diagnostics"]["call_count"] == 1


def test_retry_delay_cannot_exceed_total_operation_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
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
