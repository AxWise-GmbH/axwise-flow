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
    grounding_metadata = SimpleNamespace(
        web_search_queries=["query one", "query two", "query three"],
        search_entry_point=None,
        grounding_chunks=[],
        grounding_supports=[],
    )
    return SimpleNamespace(
        text=text,
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
    assert config.candidate_count is None
    assert config.max_output_tokens is None
    assert str(config.thinking_config.thinking_level).upper().endswith("HIGH")
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
    assert result["usage_metadata"] == {
        "input_tokens": 21,
        "output_tokens": 20,
        "total_tokens": 41,
    }
    assert result["provider_queries"] == ["query one", "query two", "query three"]


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
    assert result["provider_queries"] == ["query one", "query two", "query three"]


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


def test_trusted_google_redirect_is_resolved_once_without_fetching_final_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
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
    monkeypatch.setenv("GEMINI_SEARCH_MODEL", "gemini-3.7-flash")
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
        grounding_supports=[],
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

    assert [source["url"] for source in result["sources"]] == [
        "https://authority.example/x"
    ]
