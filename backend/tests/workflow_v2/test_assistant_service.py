from __future__ import annotations

import asyncio
import hashlib
import json
from types import SimpleNamespace

import pytest
from pydantic_ai.messages import ModelResponse

import backend.services.workflow_v2.assistant.conversation_runner as conversation_runner_module
from backend.domain.workflow_v2.contracts import (
    AssistantTurnInputV1,
    AssistantTurnInputV2,
    OperationMetrics,
)
from backend.services.workflow_v2.assistant.conversation_runner import (
    CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT,
    PydanticAIConversationalAssistantRunner,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.service import AssistantTurnService
from backend.services.workflow_v2.assistant.image_runner import AssistantGeneratedImage
from backend.services.workflow_v2.assistant.widget_runner import (
    AssistantWidgetResult,
    CurrencyCandidate,
    WeatherCandidate,
    WidgetSource,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure

pytestmark = pytest.mark.contract


def assistant_input(
    response_mode: str,
    *,
    message: str = "What is 2 + 2?",
    conversation: list[dict[str, str]] | None = None,
) -> AssistantTurnInputV1:
    return AssistantTurnInputV1.model_validate(
        {
            "type": "AssistantTurnV1",
            "responseMode": response_mode,
            "message": message,
            "conversation": conversation or [],
        }
    )


def assistant_v2(
    capability: dict,
    *,
    message: str,
) -> AssistantTurnInputV2:
    return AssistantTurnInputV2.model_validate(
        {
            "type": "AssistantTurnV2",
            "responseMode": "one_shot",
            "message": message,
            "conversation": [],
            "capability": capability,
        }
    )


def usage_reader(raw: dict) -> tuple[int, int, int, int]:
    usage = raw.get("usage_metadata") or {}
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    queries = raw.get("provider_queries") or []
    return input_tokens, output_tokens, input_tokens + output_tokens, len(queries)


def metrics_factory(
    *,
    input_tokens: int,
    output_tokens: int,
    search_calls: int,
    model_version: str | None = None,
) -> OperationMetrics:
    return OperationMetrics(
        latency_ms=0,
        provider="google",
        model="gemini-3.8-flash",
        model_version=model_version,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        search_calls=search_calls,
        estimated_cost_micros=0,
    )


def source_types(_url: str, _title: str) -> set[str]:
    return {"grounded_web"}


class RecordingRunner:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.queries: list[str] = []

    async def search(self, query: str) -> dict:
        self.queries.append(query)
        return self.response


def service(
    *,
    grounded: RecordingRunner | None,
    conversation: RecordingRunner | None,
    image_runner=None,
    widget_runner=None,
) -> AssistantTurnService:
    return AssistantTurnService(
        grounded_runner=grounded,
        conversational_runner=conversation,
        source_type_classifier=source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
        image_runner=image_runner,
        widget_runner=widget_runner,
    )


class RecordingImageRunner:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def generate(self, prompt: str, **options) -> AssistantGeneratedImage:
        self.calls.append({"prompt": prompt, **options})
        data = b"\x89PNG\r\n\x1a\ngenerated"
        return AssistantGeneratedImage(
            data=data,
            mime_type="image/png",
            sha256=hashlib.sha256(data).hexdigest(),
            model="gemini-3.1-flash-image",
            model_version="gemini-3.1-flash-image-001",
            input_tokens=12,
            output_tokens=34,
        )


class RecordingWidgetRunner:
    def __init__(self, *, cache_hit: bool = False) -> None:
        self.calls: list[tuple] = []
        self.cache_hit = cache_hit

    async def weather(self, location: str, *, temperature_unit: str):
        self.calls.append(("weather", location, temperature_unit))
        return AssistantWidgetResult(
            kind="weather",
            payload=WeatherCandidate.model_validate(
                {
                    "location": "Berlin, Germany",
                    "observedAt": "2026-09-22T12:30:00+02:00",
                    "temperatureUnit": temperature_unit,
                    "temperature": "17.25",
                    "condition": "Partly cloudy",
                    "high": "19.5",
                    "low": "11.0",
                    "forecast": [
                        {
                            "label": "Tomorrow",
                            "condition": "Sunny",
                            "high": "20.25",
                            "low": "10",
                        }
                    ],
                }
            ),
            source=WidgetSource(
                title="Weather office", url="https://example.com/weather"
            ),
            model="gemini-3.8-flash",
            model_version="gemini-3.8-flash-001",
            input_tokens=20,
            output_tokens=8,
            cache_hit=self.cache_hit,
        )

    async def currency(self, base: str, quote: str, amount: str):
        self.calls.append(("currency", base, quote, amount))
        return AssistantWidgetResult(
            kind="currency",
            payload=CurrencyCandidate.model_validate(
                {
                    "base": base,
                    "quote": quote,
                    "amount": amount,
                    "convertedAmount": "117.25",
                    "rate": "1.1725",
                    "inverseRate": "0.8528784648",
                    "asOf": "2026-09-22T08:30:00Z",
                }
            ),
            source=WidgetSource(
                title="Central bank", url="https://example.com/rates"
            ),
            model="gemini-3.8-flash",
            model_version=None,
            input_tokens=0 if self.cache_hit else None,
            output_tokens=0 if self.cache_hit else None,
            cache_hit=self.cache_hit,
        )


@pytest.mark.asyncio
async def test_explicit_image_capability_uses_the_fast_image_runner() -> None:
    image = RecordingImageRunner()

    result = await service(
        grounded=None, conversation=None, image_runner=image
    ).execute(
        assistant_v2(
            {
                "kind": "image_generate",
                "aspectRatio": "16:9",
                "imageSize": "1K",
            },
            message="A blue robot in a calm workshop",
        )
    )

    assert image.calls == [
        {
            "prompt": "A blue robot in a calm workshop",
            "aspect_ratio": "16:9",
            "image_size": "1K",
            "input_image": None,
        }
    ]
    assert result.response.schema_version == "axwise.assistant-turn.v2"
    assert result.response.markdown == "Image generated successfully."
    presentation = result.response.presentations[0]
    assert presentation.kind == "generated_image"
    assert presentation.model == "gemini-3.1-flash-image"
    assert presentation.sha256 == hashlib.sha256(
        b"\x89PNG\r\n\x1a\ngenerated"
    ).hexdigest()
    assert result.metrics is not None
    assert result.metrics.model == "gemini-3.1-flash-image"
    assert result.metrics.total_tokens == 46
    assert result.metrics.search_calls == 0
    assert result.metrics.estimated_cost_micros is None


@pytest.mark.asyncio
async def test_weather_capability_returns_grounded_card_and_utc_fallback() -> None:
    widgets = RecordingWidgetRunner()

    result = await service(
        grounded=None, conversation=None, widget_runner=widgets
    ).execute(
        assistant_v2(
            {"kind": "weather", "location": "Berlin", "tempUnit": "C"},
            message="Current weather for Berlin.",
        )
    )

    assert widgets.calls == [("weather", "Berlin", "C")]
    presentation = result.response.presentations[0]
    assert presentation.kind == "weather"
    assert presentation.observed_at == "2026-09-22T10:30:00Z"
    assert presentation.temperature == "17.25"
    assert presentation.forecast[0].label == "Tomorrow"
    assert result.response.facts[0].source_urls == ["https://example.com/weather"]
    assert result.response.sources[0].source_types == ["grounded_web"]
    assert "[Source](<https://example.com/weather>)" in result.response.markdown
    assert result.metrics is not None
    assert result.metrics.total_tokens == 28
    assert result.metrics.search_calls == 1


@pytest.mark.asyncio
async def test_currency_capability_preserves_exact_decimal_strings() -> None:
    widgets = RecordingWidgetRunner()

    result = await service(
        grounded=None, conversation=None, widget_runner=widgets
    ).execute(
        assistant_v2(
            {"kind": "currency", "base": "EUR", "quote": "USD", "amount": "100.00"},
            message="Convert 100.00 EUR to USD.",
        )
    )

    presentation = result.response.presentations[0]
    assert presentation.kind == "currency"
    assert presentation.amount == "100.00"
    assert presentation.converted_amount == "117.25"
    assert presentation.rate == "1.1725"
    assert result.metrics is not None
    assert result.metrics.input_tokens is None
    assert result.metrics.total_tokens is None
    assert result.metrics.search_calls == 1
    serialized_metrics = result.metrics.model_dump(by_alias=True, exclude_unset=True)
    assert "modelVersion" not in serialized_metrics
    assert "inputTokens" not in serialized_metrics
    assert "outputTokens" not in serialized_metrics
    assert "totalTokens" not in serialized_metrics
    assert "estimatedCostMicros" not in serialized_metrics


@pytest.mark.asyncio
async def test_cached_widget_turn_reports_zero_usage_and_search_calls() -> None:
    result = await service(
        grounded=None,
        conversation=None,
        widget_runner=RecordingWidgetRunner(cache_hit=True),
    ).execute(
        assistant_v2(
            {"kind": "currency", "base": "EUR", "quote": "USD", "amount": "100"},
            message="Convert 100 EUR to USD.",
        )
    )

    assert result.metrics is not None
    assert result.metrics.input_tokens == 0
    assert result.metrics.output_tokens == 0
    assert result.metrics.total_tokens == 0
    assert result.metrics.search_calls == 0


def test_assistant_prompts_preserve_product_and_evidence_truth() -> None:
    query = json.loads(
        assistant_turn_query(
            assistant_input(
                "direct_answer",
                message="Can Orqaly execute the CRM update now?",
                conversation=[
                    {
                        "role": "assistant",
                        "content": "Orqaly already manages every CRM credential.",
                    }
                ],
            )
        )
    )

    instruction = query["instruction"]
    assert "prior assistant claims and user-provided examples as context" in instruction
    assert "unless the current canonical input explicitly establishes it" in instruction
    assert "target architecture" in instruction
    assert "grounded Research" in instruction
    assert "canonical input explicitly" in CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT
    assert "current product from the target architecture" in (
        CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT
    )


def test_research_prompt_requests_google_search_without_giving_chat_search_authority() -> None:
    research = json.loads(assistant_turn_query(
        assistant_input("one_shot", message="Explain HTTP Retry-After.")
    ).splitlines()[0])
    assert "use the available Google Search tool" in research["instruction"]
    assert "Respect the user's source restrictions" in research["instruction"]
    assert "Do not manually insert source URLs" in research["instruction"]
    assert "application renders citations from Google Search grounding metadata" in research["instruction"]
    for mode in ("direct_answer", "discover"):
        conversational = json.loads(assistant_turn_query(assistant_input(mode)))
        assert "use the available Google Search tool" not in conversational["instruction"]


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        ("grounding_evidence_missing", "AXWISE_ASSISTANT_EVIDENCE_UNAVAILABLE", False),
        ("deadline_exceeded", "AXWISE_ASSISTANT_RESEARCH_TIMEOUT", True),
        ("retry_exhausted", "AXWISE_ASSISTANT_RESEARCH_UNAVAILABLE", True),
        ("unavailable", "AXWISE_ASSISTANT_RESEARCH_UNAVAILABLE", True),
        ("response_processing_error", "AXWISE_ASSISTANT_RESEARCH_UNAVAILABLE", True),
        ("configuration_error", "AXWISE_ASSISTANT_RESEARCH_UNAVAILABLE", False),
    ],
)
def test_research_failure_distinguishes_missing_evidence_from_provider_failure(status, code, retryable) -> None:
    diagnostics = {"route": "gemini_google_search", "status": status, "call_count": 1}
    raw = {"text": "", "sources": [], "claims": [], "runtime_diagnostics": diagnostics}
    with pytest.raises(CognitiveExecutionFailure) as caught:
        project_assistant_result(
            raw, response_mode="one_shot", source_type_classifier=source_types,
            usage_reader=usage_reader, metrics_factory=metrics_factory,
        )
    assert caught.value.error_class == code
    assert caught.value.retryable is retryable
    assert caught.value.diagnostics == diagnostics
    assert caught.value.retry_after_seconds is None


@pytest.mark.asyncio
@pytest.mark.parametrize("response_mode", ["direct_answer", "discover"])
async def test_conversational_modes_use_only_the_unsearched_runner(
    response_mode: str,
) -> None:
    grounded = RecordingRunner({"text": "wrong"})
    conversation = RecordingRunner(
        {
            "text": "4",
            "sources": [],
            "claims": [],
            "provider_queries": [],
            "model_version": "gemini-3.8-flash-001",
            "usage_metadata": {"input_tokens": 9, "output_tokens": 1},
            "runtime_diagnostics": {"status": "ok"},
        }
    )

    result = await service(grounded=grounded, conversation=conversation).execute(
        assistant_input(response_mode)
    )

    assert result.response.markdown == "4"
    assert grounded.queries == []
    assert len(conversation.queries) == 1
    request = json.loads(conversation.queries[0])
    assert request["message"] == "What is 2 + 2?"
    assert result.metrics is not None
    assert result.metrics.total_tokens == 10
    assert result.metrics.search_calls == 0
    assert result.metrics.model == "gemini-3.8-flash"
    assert result.metrics.model_version == "gemini-3.8-flash-001"


@pytest.mark.asyncio
async def test_one_shot_uses_only_grounded_runner_and_carries_fallback_authority() -> (
    None
):
    source_url = (
        "https://european-union.europa.eu/principles-countries-history/"
        "country-profiles/estonia_en"
    )
    grounded = RecordingRunner(
        {
            "text": "Grounded answer",
            "sources": [{"title": "Estonia", "url": source_url}],
            "claims": [
                {
                    "text": "Grounded answer",
                    "source_urls": [source_url],
                }
            ],
            "provider_queries": ["Estonia EU membership"],
            "model_version": "gemini-3.8-flash-001",
            "usage_metadata": {"input_tokens": 11, "output_tokens": 7},
            "runtime_diagnostics": {"status": "ok"},
        }
    )
    conversation = RecordingRunner({"text": "wrong"})

    result = await service(grounded=grounded, conversation=conversation).execute(
        assistant_input(
            "one_shot",
            message="Verify Estonia's EU membership.",
            conversation=[
                {"role": "user", "content": f"Use an official source at {source_url}."},
                {"role": "assistant", "content": "I can research that."},
            ],
        )
    )

    assert result.response.markdown == f"Grounded answer [1](<{source_url}>)"
    assert [source.canonical_url for source in result.response.sources] == [source_url]
    assert [fact.statement for fact in result.response.facts] == ["Grounded answer"]
    assert conversation.queries == []
    assistant_request, fallback_authority = grounded.queries[0].splitlines()
    assert json.loads(assistant_request)["message"] == "Verify Estonia's EU membership."
    authority = json.loads(fallback_authority)
    assert authority["requirement"]["description"] == (
        "Latest user request: Verify Estonia's EU membership. "
        f"Prior user request 1: Use an official source at {source_url}."
    )
    assert result.metrics is not None
    assert result.metrics.search_calls == 1
    assert result.metrics.model == "gemini-3.8-flash"
    assert result.metrics.model_version == "gemini-3.8-flash-001"


def test_projection_rejects_source_only_one_shot_as_ungrounded() -> None:
    raw = {
        "text": "Provider prose with no source-backed claim.",
        "sources": [
            {
                "title": "A locator is not evidence",
                "url": "https://example.org/locator-only",
            }
        ],
        "claims": [],
        "provider": "gemini_google_search",
        "runtime_diagnostics": {
            "route": "gemini_google_search",
            "status": "ok",
        },
    }

    with pytest.raises(CognitiveExecutionFailure) as raised:
        project_assistant_result(
            raw,
            response_mode="one_shot",
            source_type_classifier=source_types,
            usage_reader=usage_reader,
            metrics_factory=metrics_factory,
        )

    assert raised.value.error_class == "AXWISE_ASSISTANT_UNGROUNDED_RESPONSE"
    assert raised.value.retryable is True
    assert raised.value.diagnostics == {
        "route": "gemini_google_search",
        "status": "response_processing_error",
    }


@pytest.mark.asyncio
async def test_mode_specific_runner_is_required() -> None:
    with pytest.raises(CognitiveExecutionFailure) as raised:
        await service(grounded=None, conversation=None).execute(
            assistant_input("direct_answer")
        )

    assert raised.value.error_class == "AXWISE_ASSISTANT_UNAVAILABLE"
    assert raised.value.retryable is True


def test_projection_accepts_only_byte_verified_direct_fetch_claims() -> None:
    url = "https://example.org/current-report"
    exact = "Verified publisher bytes."
    document = f"Before. {exact} After."
    document_bytes = document.encode("utf-8")
    start = document_bytes.index(exact.encode("utf-8"))
    end = start + len(exact.encode("utf-8"))
    response_hash = hashlib.sha256(document_bytes).hexdigest()
    raw = {
        "text": document,
        "sources": [
            {
                "title": "Current report",
                "url": url,
                "provider": "searxng_direct_fetch",
                "provider_response_hash": response_hash,
            }
        ],
        "claims": [
            {
                "text": exact,
                "source_urls": [url],
                "provider": "searxng_direct_fetch",
                "provider_response_hash": response_hash,
                "segment_start": start,
                "segment_end": end,
                "offset_unit": "utf8_bytes",
                "span_target": "provider_response_text",
            }
        ],
        "provider": "searxng_direct_fetch",
        "provider_response_hash": response_hash,
        "runtime_diagnostics": {
            "route": "searxng_direct_fetch",
            "status": "ok",
            "fallback_used": True,
        },
    }

    result = project_assistant_result(
        raw,
        response_mode="one_shot",
        source_type_classifier=source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
    )

    assert exact in result.response.markdown
    assert "Before." not in result.response.markdown
    assert "After." not in result.response.markdown
    assert [fact.statement for fact in result.response.facts] == [exact]
    assert [source.canonical_url for source in result.response.sources] == [url]


def test_projection_rejects_forged_direct_fetch_claim() -> None:
    document = "Verified publisher bytes."
    response_hash = hashlib.sha256(document.encode("utf-8")).hexdigest()
    raw = {
        "text": document,
        "sources": [
            {
                "title": "Current report",
                "url": "https://example.org/current-report",
                "provider": "searxng_direct_fetch",
                "provider_response_hash": response_hash,
            }
        ],
        "claims": [
            {
                "text": "Forged",
                "source_urls": ["https://example.org/current-report"],
                "provider": "searxng_direct_fetch",
                "provider_response_hash": response_hash,
                "segment_start": 0,
                "segment_end": 6,
                "offset_unit": "utf8_bytes",
                "span_target": "provider_response_text",
            }
        ],
        "provider": "searxng_direct_fetch",
        "provider_response_hash": response_hash,
        "runtime_diagnostics": {
            "route": "searxng_direct_fetch",
            "status": "ok",
            "fallback_used": True,
        },
    }

    with pytest.raises(CognitiveExecutionFailure) as raised:
        project_assistant_result(
            raw,
            response_mode="one_shot",
            source_type_classifier=source_types,
            usage_reader=usage_reader,
            metrics_factory=metrics_factory,
        )

    assert raised.value.error_class == "AXWISE_ASSISTANT_EMPTY_RESPONSE"
    assert raised.value.retryable is False


def test_projection_propagates_safe_retry_guidance() -> None:
    raw = {
        "text": "",
        "sources": [],
        "claims": [],
        "provider": "gemini_google_search",
        "runtime_diagnostics": {
            "route": "grounded_search",
            "status": "unavailable",
            "primary_skipped": True,
            "circuit_state": "open",
            "retry_after_seconds": 450,
        },
    }

    with pytest.raises(CognitiveExecutionFailure) as raised:
        project_assistant_result(
            raw,
            response_mode="one_shot",
            source_type_classifier=source_types,
            usage_reader=usage_reader,
            metrics_factory=metrics_factory,
        )

    assert raised.value.retryable is True
    assert raised.value.retry_after_seconds == 450
    assert raised.value.retry_at is not None
    assert raised.value.diagnostics == raw["runtime_diagnostics"]


@pytest.mark.asyncio
async def test_conversation_runner_deadline_cancels_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancelled = asyncio.Event()

    class BlockingAgent:
        async def run(self, _query: str):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

    runner = PydanticAIConversationalAssistantRunner.__new__(
        PydanticAIConversationalAssistantRunner
    )
    runner.agent = BlockingAgent()
    monkeypatch.setattr(
        conversation_runner_module,
        "WORKFLOW_V2_ASSISTANT_CHAT_DEADLINE_SECONDS",
        0.01,
    )

    result = await runner.search("{}")

    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["text"] == ""
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_conversation_runner_exposes_exact_served_model_version() -> None:
    class VersionedAgent:
        async def run(self, _query: str):
            response = ModelResponse(
                parts=[],
                model_name="gemini-3.8-flash-001",
                provider_name="google",
            )
            return SimpleNamespace(
                output="Four.",
                usage=SimpleNamespace(input_tokens=9, output_tokens=1),
                response=response,
                new_messages=lambda: [response],
            )

    runner = PydanticAIConversationalAssistantRunner.__new__(
        PydanticAIConversationalAssistantRunner
    )
    runner.agent = VersionedAgent()

    result = await runner.search("{}")

    assert result["text"] == "Four."
    assert result["model_version"] == "gemini-3.8-flash-001"
