"""Model-free contracts for one bounded grounded-search semantic repair owner."""

from __future__ import annotations

import asyncio
import hashlib
import json
from types import SimpleNamespace

import pytest

from backend.services.generative.gemini_search_service import GeminiSearchService
from backend.tests.scripts.test_gemini_search_runtime import (
    AsyncSequenceModels,
    FakeClock,
    ProviderStatusError,
    _async_service,
    _response,
)


pytestmark = pytest.mark.contract
QUERY = "Research the current configuration contract."
REJECTED = "Rejected fixture answer; rejected-draft-sentinel must never be replayed."
ACCEPTED = "The documented configuration accepts a JSON object."
ISSUES = ("fixture_configuration_mismatch",)


class RecordingPolicy:
    def __init__(self) -> None:
        self.validations: list[tuple[str, str]] = []
        self.repairs: list[tuple[str, tuple[str, ...]]] = []

    def validate(self, query: str, text: str) -> tuple[str, ...]:
        self.validations.append((query, text))
        return ISSUES if text.startswith("Rejected") else ()

    def repair(self, query: str, codes: tuple[str, ...]) -> str:
        self.repairs.append((query, codes))
        return query + "\nRepair requirements: " + ", ".join(codes)


def quality_service(models, clock: FakeClock | None = None):
    policy = RecordingPolicy()
    service = _async_service(models, clock or FakeClock())
    service._response_validator = policy.validate
    service._repair_query_builder = policy.repair
    return service, policy


def researched_response(
    text: str, *, label: str, version: str | None = "gemini-3.8-flash-001"
):
    response = _response(text)
    metadata = response.candidates[0].grounding_metadata
    metadata.web_search_queries = [f"{label} query", "shared query"]
    metadata.grounding_chunks[0].web.uri = f"https://authority.example/{label}"
    response.model_version = version
    return response


@pytest.mark.parametrize("missing", ["response_validator", "repair_query_builder"])
def test_quality_callbacks_must_be_configured_as_a_pair(missing: str) -> None:
    policy = RecordingPolicy()
    kwargs = {
        "response_validator": policy.validate,
        "repair_query_builder": policy.repair,
    }
    kwargs[missing] = None

    with pytest.raises(ValueError):
        GeminiSearchService(**kwargs)


def test_quality_constructor_accepts_both_or_neither_without_constructing_a_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    policy = RecordingPolicy()

    configured = GeminiSearchService(
        response_validator=policy.validate,
        repair_query_builder=policy.repair,
    )
    plain = GeminiSearchService()

    assert configured._response_validator == policy.validate
    assert configured._repair_query_builder == policy.repair
    assert plain._response_validator is None
    assert plain._repair_query_builder is None
    assert configured._client is None and plain._client is None


@pytest.mark.asyncio
async def test_unconfigured_search_retains_legacy_one_call_behavior() -> None:
    response = researched_response(REJECTED, label="unfiltered")
    models = AsyncSequenceModels([response])
    service = _async_service(models, FakeClock())

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert result["text"] == REJECTED
    assert result["search_performed"] is True
    assert result["claims"][0]["text"] == REJECTED
    assert result["usage_metadata"] == {
        "input_tokens": 21,
        "output_tokens": 20,
        "total_tokens": 41,
    }


@pytest.mark.asyncio
async def test_clean_quality_response_uses_one_call_without_repair() -> None:
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="clean")])
    service, policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert policy.validations == [(QUERY, ACCEPTED)]
    assert policy.repairs == []
    assert result["text"] == ACCEPTED
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["usage_metadata"]["search_calls"] == 2
    assert result["usage_metadata"]["usage_complete"] is True
    assert models.calls[0]["config"].http_options.retry_options.attempts == 1


@pytest.mark.asyncio
async def test_one_repair_meters_both_responses_but_attributes_only_accepted_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first = researched_response(REJECTED, label="rejected")
    last = researched_response(ACCEPTED, label="accepted")
    last.usage_metadata = SimpleNamespace(
        prompt_token_count=5,
        tool_use_prompt_token_count=2,
        candidates_token_count=3,
        thoughts_token_count=1,
        total_token_count=11,
    )
    models = AsyncSequenceModels([first, last])
    service, policy = quality_service(models)
    original_generation = service._generate_grounded_content_async
    generation_owners = 0

    async def counted_generation(query):
        nonlocal generation_owners
        generation_owners += 1
        return await original_generation(query)

    monkeypatch.setattr(service, "_generate_grounded_content_async", counted_generation)

    result = await service.search_web_general_async(QUERY)

    assert (
        generation_owners == 1
    ), "repair must not restart the operation/deadline owner"
    assert len(models.calls) == 2
    assert policy.repairs == [(QUERY, ISSUES)]
    assert [text for _query, text in policy.validations] == [REJECTED, ACCEPTED]
    assert models.calls[0]["contents"] == QUERY
    assert models.calls[1]["contents"] == QUERY + "\nRepair requirements: " + ISSUES[0]
    assert "rejected-draft-sentinel" not in models.calls[1]["contents"]
    assert all(
        call["config"].http_options.retry_options.attempts == 1 for call in models.calls
    )
    assert result["text"] == ACCEPTED
    assert result["search_performed"] is True
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["usage_metadata"] == {
        "input_tokens": 28,
        "output_tokens": 24,
        "total_tokens": 52,
        "search_calls": 4,
        "usage_complete": True,
    }
    assert result["model_version"] == "gemini-3.8-flash-001"
    assert result["provider_queries"] == ["accepted query", "shared query"]
    assert [item["url"] for item in result["sources"]] == [
        "https://authority.example/accepted"
    ]
    expected_hash = hashlib.sha256(ACCEPTED.encode("utf-8")).hexdigest()
    assert result["provider_response_hash"] == expected_hash
    assert len(result["claims"]) == 1
    claim = result["claims"][0]
    assert claim["text"] == ACCEPTED
    assert claim["provider_response_hash"] == expected_hash
    assert claim["source_urls"] == ["https://authority.example/accepted"]
    assert claim["provenance_artifact"]["response_parts"] == [ACCEPTED]
    assert claim["provenance_artifact"]["provider_response_text"] == ACCEPTED
    assert claim["provenance_artifact"]["sha256"] == expected_hash
    assert claim["offset_unit"] == "utf8_bytes"
    assert (claim["segment_start"], claim["segment_end"]) == (
        0,
        len(ACCEPTED.encode("utf-8")),
    )


@pytest.mark.asyncio
async def test_second_quality_rejection_is_empty_and_does_not_start_a_third_generation(
    caplog: pytest.LogCaptureFixture,
) -> None:
    models = AsyncSequenceModels(
        [
            researched_response(REJECTED, label="first"),
            researched_response(REJECTED, label="second"),
            researched_response(ACCEPTED, label="must-not-run"),
        ]
    )
    service, policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 2
    assert len(policy.repairs) == 1
    assert result["text"] == ""
    assert result["claims"] == []
    assert result["sources"] == []
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "quality_rejected"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["usage_metadata"] == {
        "input_tokens": 42,
        "output_tokens": 40,
        "total_tokens": 82,
        "search_calls": 4,
        "usage_complete": True,
    }
    assert "rejected-draft-sentinel" not in json.dumps(result) + "\n".join(
        caplog.messages
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("transient_first", [False, True])
async def test_semantic_repair_and_transport_retry_share_three_attempts(
    transient_first: bool,
) -> None:
    bad = researched_response(REJECTED, label="bad")
    transient = ProviderStatusError(503, "unavailable fixture")
    outcomes = [transient, bad] if transient_first else [bad, transient]
    models = AsyncSequenceModels(
        [*outcomes, researched_response(ACCEPTED, label="accepted")]
    )
    service, policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 3
    assert len(policy.repairs) == 1
    assert result["text"] == ACCEPTED
    assert result["runtime_diagnostics"]["call_count"] == 3
    assert all(
        call["config"].http_options.retry_options.attempts == 1 for call in models.calls
    )
    usage = result["usage_metadata"]
    assert usage["input_tokens"] is None
    assert usage["output_tokens"] is None
    assert usage["total_tokens"] is None
    assert usage["search_calls"] is None
    assert usage["usage_complete"] is False
    assert result.get("model_version") is None


@pytest.mark.asyncio
async def test_retry_exhaustion_after_quality_repair_cannot_dispatch_fourth_call() -> (
    None
):
    models = AsyncSequenceModels(
        [
            researched_response(REJECTED, label="bad"),
            ProviderStatusError(503, "first unavailable fixture"),
            ProviderStatusError(503, "second unavailable fixture"),
            researched_response(ACCEPTED, label="must-not-run"),
        ]
    )
    service, policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 3
    assert len(policy.repairs) == 1
    assert result["search_performed"] is False
    assert result["text"] == "" and result["claims"] == []
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    assert result["runtime_diagnostics"]["call_count"] == 3
    assert result["usage_metadata"]["usage_complete"] is False
    assert result["usage_metadata"]["total_tokens"] is None


@pytest.mark.asyncio
async def test_semantic_repair_cannot_reset_the_original_absolute_deadline() -> None:
    clock = FakeClock()
    models = AsyncSequenceModels(
        [
            researched_response(REJECTED, label="bad"),
            researched_response(ACCEPTED, label="must-not-run"),
        ]
    )
    service, policy = quality_service(models, clock)

    def validation_at_deadline(query: str, text: str):
        clock.now = 10.0
        return policy.validate(query, text)

    service._response_validator = validation_at_deadline

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert result["text"] == "" and result["claims"] == []
    assert result["runtime_diagnostics"]["status"] == "quality_rejected"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["runtime_diagnostics"]["elapsed_ms"] == 10_000
    assert result["usage_metadata"]["total_tokens"] == 41


@pytest.mark.asyncio
@pytest.mark.parametrize("failing_callback", ["validator", "repair_builder"])
async def test_quality_policy_exception_fails_closed_without_replaying_output(
    failing_callback: str,
) -> None:
    models = AsyncSequenceModels([researched_response(REJECTED, label="bad")])
    service, _policy = quality_service(models)

    def broken(*_args):
        raise RuntimeError("private-policy-error-sentinel")

    if failing_callback == "validator":
        service._response_validator = broken
    else:
        service._repair_query_builder = broken

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert result["text"] == "" and result["claims"] == []
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "configuration_error"
    assert result["usage_metadata"]["total_tokens"] == 41
    assert "private-policy-error-sentinel" not in json.dumps(result)


@pytest.mark.asyncio
async def test_missing_usage_is_unknown_while_observed_search_count_remains_known() -> (
    None
):
    missing_usage = researched_response(REJECTED, label="unknown")
    missing_usage.usage_metadata = None
    models = AsyncSequenceModels(
        [missing_usage, researched_response(ACCEPTED, label="accepted")]
    )
    service, _policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 2
    assert result["text"] == ACCEPTED
    assert result["usage_metadata"] == {
        "input_tokens": None,
        "output_tokens": None,
        "total_tokens": None,
        "search_calls": 4,
        "usage_complete": False,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("counter", ["invalid", -3, True, 2.5])
async def test_malformed_usage_counters_do_not_claim_complete_metering(counter) -> None:
    response = researched_response(ACCEPTED, label="accepted")
    response.usage_metadata.prompt_token_count = counter
    service, _policy = quality_service(AsyncSequenceModels([response]))
    result = await service.search_web_general_async(QUERY)
    assert result["usage_metadata"]["usage_complete"] is False
    assert result["usage_metadata"]["total_tokens"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("final_version", [None, "gemini-3.8-flash-002"])
async def test_model_version_is_exposed_only_when_every_attempt_agrees(
    final_version: str | None,
) -> None:
    models = AsyncSequenceModels(
        [
            researched_response(REJECTED, label="bad"),
            researched_response(ACCEPTED, label="accepted", version=final_version),
        ]
    )
    service, _policy = quality_service(models)

    result = await service.search_web_general_async(QUERY)

    assert result["text"] == ACCEPTED
    assert result.get("model_version") is None
    assert result["usage_metadata"]["total_tokens"] == 82


@pytest.mark.asyncio
async def test_cancellation_during_semantic_repair_propagates_without_further_calls() -> (
    None
):
    class RepairBlocks(AsyncSequenceModels):
        def __init__(self):
            super().__init__([researched_response(REJECTED, label="bad")])
            self.started = asyncio.Event()
            self.cancelled = asyncio.Event()

        async def generate_content(self, **kwargs):
            if not self.calls:
                return await super().generate_content(**kwargs)
            self.calls.append(kwargs)
            self.started.set()
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise

    models = RepairBlocks()
    service, policy = quality_service(models)
    task = asyncio.create_task(service.search_web_general_async(QUERY))
    try:
        await asyncio.wait_for(models.started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert models.cancelled.is_set()
        assert len(models.calls) == 2
        assert len(policy.repairs) == 1
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
