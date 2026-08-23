"""Focused contracts for structured PydanticAI utility calls."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai.types import ThinkingLevel
from pydantic import ValidationError
from pydantic_ai import ModelRetry

from backend.models.pattern import Pattern, PatternResponse
from backend.services.llm.gemini_runtime import BoundedRetryAsyncClient
from backend.services.llm import structured_utility_runtime as utility_runtime
from backend.services.processing import pattern_processor as pattern_module
from backend.services.processing.keyword_highlighter import DomainAnalysis


pytestmark = pytest.mark.contract


def _valid_pattern_response(*, evidence: str) -> PatternResponse:
    return PatternResponse(
        patterns=[
            Pattern(
                name="Collaborative validation",
                category="Decision Process",
                description="Participants validate important decisions with colleagues.",
                evidence=[evidence],
                frequency=0.8,
                sentiment=0.1,
                impact="Validation improves confidence before implementation.",
                suggested_actions=["Provide a lightweight peer-review workflow."],
            )
        ]
    )


def test_utility_model_is_exact_shared_and_has_one_transport_retry_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.7-flash")
    api_key = "structured-utility-test-key"

    first = utility_runtime.get_shared_structured_utility_model(api_key)
    second = utility_runtime.get_shared_structured_utility_model(api_key)
    transport = first._provider.client._api_client._async_httpx_client

    assert first is second
    assert first.model_name == "models/gemini-3.7-flash"
    assert first.settings["max_tokens"] == 65_536
    assert first.settings["google_thinking_config"]["thinking_level"] == (
        ThinkingLevel.MEDIUM
    )
    assert isinstance(transport, BoundedRetryAsyncClient)
    assert transport._retry_attempts == 2
    assert first._provider.client._api_client._http_options.retry_options.attempts == 1
    assert transport.is_closed is False

    asyncio.run(utility_runtime.close_shared_structured_utility_models())

    assert transport.is_closed is True


def test_utility_runtime_rejects_model_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.5-flash")

    with pytest.raises(RuntimeError, match="gemini-3.7-flash"):
        utility_runtime.get_shared_structured_utility_model("test-key")


@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf"])
def test_utility_run_deadline_must_be_finite_and_positive(
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv("GEMINI_STRUCTURED_UTILITY_DEADLINE_SECONDS", value)

    with pytest.raises(RuntimeError, match="finite and positive"):
        utility_runtime.structured_utility_deadline_seconds()


def test_utility_run_has_one_total_deadline_across_output_repairs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_STRUCTURED_UTILITY_DEADLINE_SECONDS", "0.01")

    async def never_finishes() -> None:
        await asyncio.Event().wait()

    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(utility_runtime.run_structured_utility(never_finishes()))


def test_pattern_processor_uses_shared_runtime_without_environment_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def output_validator(self, function):
            captured["validator"] = function
            return function

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    environment_before = dict(pattern_module.os.environ)
    shared_model = object()
    monkeypatch.setattr(
        pattern_module,
        "get_shared_structured_utility_model",
        lambda api_key: shared_model if api_key == "test-key" else None,
    )
    monkeypatch.setattr(pattern_module, "Agent", FakeAgent)

    processor = pattern_module.PatternProcessor()

    assert processor.pydantic_ai_available is True
    assert processor.model is shared_model
    assert captured["model"] is shared_model
    assert captured["retries"] == {"output": 2}
    assert dict(pattern_module.os.environ) == environment_before


def test_pattern_processor_fails_closed_on_model_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.5-flash")

    with pytest.raises(RuntimeError, match="gemini-3.7-flash"):
        pattern_module.PatternProcessor()


def test_pattern_output_validator_requests_semantic_repair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            pass

        def output_validator(self, function):
            captured["validator"] = function
            return function

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        pattern_module, "get_shared_structured_utility_model", lambda _key: object()
    )
    monkeypatch.setattr(pattern_module, "Agent", FakeAgent)
    pattern_module.PatternProcessor()
    validator = captured["validator"]
    output = _valid_pattern_response(evidence="A quote invented by the model")
    ctx = SimpleNamespace(
        deps=pattern_module.PatternRunContract(
            source_text="I always validate decisions with two colleagues."
        )
    )

    with pytest.raises(ModelRetry, match="verbatim evidence"):
        asyncio.run(validator(ctx, output))

    supported = _valid_pattern_response(
        evidence="I always validate decisions with two colleagues."
    )
    assert asyncio.run(validator(ctx, supported)) is supported


def test_pattern_generation_does_not_repeat_whole_prompt() -> None:
    processor = pattern_module.PatternProcessor.__new__(pattern_module.PatternProcessor)
    processor.pydantic_ai_available = True
    processor.pattern_agent = SimpleNamespace(
        run=AsyncMock(side_effect=RuntimeError("provider failed"))
    )

    result = asyncio.run(processor.process("Source interview text", {}))

    assert result == PatternResponse(patterns=[])
    processor.pattern_agent.run.assert_awaited_once()


def test_domain_analysis_rejects_unbounded_or_generic_terms() -> None:
    with pytest.raises(ValidationError):
        DomainAnalysis(
            research_domain="Dashboard adoption",
            industry_context="Analytics",
            core_domain_terms=["users", "dashboard"],
            technical_terms=[],
            emotional_terms=[],
            quantitative_indicators=[],
            confidence_score=1.2,
        )

    valid = DomainAnalysis(
        research_domain="Dashboard adoption",
        industry_context="Analytics",
        core_domain_terms=["dashboard", "analytics"],
        technical_terms=["kpi"],
        emotional_terms=[],
        quantitative_indicators=[],
        confidence_score=0.85,
    )
    assert valid.core_domain_terms == ["dashboard", "analytics"]
    assert valid.confidence_score == 0.85
