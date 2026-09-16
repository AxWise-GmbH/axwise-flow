"""Parsed publication checks share the existing repair owner and response budget."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import hashlib
import json
from types import SimpleNamespace

import pytest

from backend.services.generative.gemini_search_service import GeminiSearchService
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.resilient_research_runner import (
    ResilientResearchRunner,
)
from backend.tests.scripts.test_gemini_search_quality_runtime import (
    ACCEPTED,
    ISSUES,
    QUERY,
    REJECTED,
    quality_service,
    researched_response,
)
from backend.tests.scripts.test_gemini_search_runtime import (
    AsyncSequenceModels,
    FakeClock,
    ProviderStatusError,
)
from backend.tests.workflow_v2.test_assistant_service import assistant_input
from backend.tests.workflow_v2.test_resilient_research_runner import (
    FakeSearx,
    discovery,
)


pytestmark = pytest.mark.contract
PUBLICATION_REJECTED = "A sourced draft with private-publication-draft-sentinel."
PUBLICATION_ISSUES = ("fixture_citation_source_mismatch",)
REDIRECT_ROOT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/"


def publication_service(models, clock=None):
    service, policy = quality_service(models, clock or FakeClock())
    parsed_inputs = []

    def parsed(query, raw):
        parsed_inputs.append((query, deepcopy(raw)))
        return (
            PUBLICATION_ISSUES
            if any(source["url"].endswith("/rejected") for source in raw["sources"])
            else ()
        )

    service._parsed_response_validator = parsed
    return service, policy, parsed_inputs


@pytest.mark.parametrize(
    "missing", ["response_validator", "repair_query_builder", "both"]
)
def test_parsed_policy_requires_the_existing_text_policy_and_repair_pair(missing):
    options = {
        "response_validator": lambda query, text: (),
        "repair_query_builder": lambda query, codes: query,
        "parsed_response_validator": lambda query, raw: (),
    }
    if missing == "both":
        options["response_validator"] = options["repair_query_builder"] = None
    else:
        options[missing] = None
    with pytest.raises(ValueError):
        GeminiSearchService(**options)


def test_constructor_accepts_all_three_policies_without_provider_initialization(
    monkeypatch,
):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    parsed = lambda query, raw: ()
    service = GeminiSearchService(
        response_validator=lambda query, text: (),
        repair_query_builder=lambda query, codes: query,
        parsed_response_validator=parsed,
    )
    assert service._parsed_response_validator is parsed
    assert service._client is None


@pytest.mark.asyncio
async def test_accepted_parsed_result_is_cached_without_second_normalization(
    monkeypatch,
):
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="accepted")])
    service, policy, parsed = publication_service(models)
    normalize = service._normalize_grounded_result_async
    parser = service.search_web_general
    normalizations, parses = [], []

    async def counted_normalize(*args, **kwargs):
        normalizations.append(1)
        return await normalize(*args, **kwargs)

    def counted_parse(*args, **kwargs):
        parses.append(1)
        return parser(*args, **kwargs)

    monkeypatch.setattr(service, "_normalize_grounded_result_async", counted_normalize)
    monkeypatch.setattr(service, "search_web_general", counted_parse)
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == len(normalizations) == len(parses) == len(parsed) == 1
    assert policy.repairs == []
    assert parsed[0][0] == QUERY
    assert parsed[0][1]["sources"][0]["url"] == "https://authority.example/accepted"
    assert parsed[0][1]["claims"][0]["text"] == ACCEPTED
    for key in (
        "text",
        "sources",
        "claims",
        "provider_response_hash",
        "provider_queries",
    ):
        assert result[key] == parsed[0][1][key]
    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["usage_metadata"]["total_tokens"] == 41
    assert "_parsed_result" not in json.dumps(result)
    assert "_response_metering" not in json.dumps(result)


@pytest.mark.asyncio
async def test_source_repair_resolves_each_response_once_and_keeps_only_accepted_provenance(
    monkeypatch,
):
    first = researched_response(PUBLICATION_REJECTED, label="rejected")
    last = researched_response(ACCEPTED, label="accepted")
    for response, label in ((first, "rejected"), (last, "accepted")):
        response.candidates[0].grounding_metadata.grounding_chunks[0].web.uri = (
            REDIRECT_ROOT + label
        )
    last.usage_metadata = SimpleNamespace(
        prompt_token_count=5,
        tool_use_prompt_token_count=2,
        candidates_token_count=3,
        thoughts_token_count=1,
        total_token_count=11,
    )
    models = AsyncSequenceModels([first, last])
    service, policy, parsed = publication_service(models)
    owners, resolved, parses = [], [], []
    generate = service._generate_grounded_content_async
    parser = service.search_web_general

    async def counted_generate(query):
        owners.append(query)
        return await generate(query)

    async def resolve(url):
        resolved.append(url)
        return "https://authority.example/" + url.rsplit("/", 1)[-1]

    def counted_parse(*args, **kwargs):
        parses.append(1)
        return parser(*args, **kwargs)

    service._grounding_redirect_async_resolver = resolve
    service._grounding_redirect_resolver = lambda _url: pytest.fail(
        "async parser attempted synchronous network access"
    )
    monkeypatch.setattr(service, "_generate_grounded_content_async", counted_generate)
    monkeypatch.setattr(service, "search_web_general", counted_parse)
    result = await service.search_web_general_async(QUERY)

    assert owners == [QUERY]
    assert len(models.calls) == len(parsed) == len(parses) == 2
    assert resolved == [REDIRECT_ROOT + "rejected", REDIRECT_ROOT + "accepted"]
    assert policy.repairs == [(QUERY, PUBLICATION_ISSUES)]
    assert all(query == QUERY for query, _raw in parsed)
    assert "private-publication-draft-sentinel" not in models.calls[1]["contents"]
    assert result["usage_metadata"] == {
        "input_tokens": 28,
        "output_tokens": 24,
        "total_tokens": 52,
        "search_calls": 4,
        "usage_complete": True,
    }
    assert result["model_version"] == "gemini-3.8-flash-001"
    assert result["provider_queries"] == ["accepted query", "shared query"]
    assert [source["url"] for source in result["sources"]] == [
        "https://authority.example/accepted"
    ]
    expected_hash = hashlib.sha256(ACCEPTED.encode("utf-8")).hexdigest()
    assert result["provider_response_hash"] == expected_hash
    claim = result["claims"][0]
    assert claim["text"] == ACCEPTED
    assert claim["provider_response_hash"] == expected_hash
    assert claim["source_urls"] == ["https://authority.example/accepted"]
    assert claim["provenance_artifact"]["provider_response_text"] == ACCEPTED
    assert claim["provenance_artifact"]["provider_response_sha256"] == expected_hash
    assert (claim["segment_start"], claim["segment_end"]) == (
        0,
        len(ACCEPTED.encode("utf-8")),
    )
    assert "rejected" not in json.dumps(result)


@pytest.mark.asyncio
async def test_text_repair_and_later_parsed_defect_cannot_start_a_second_repair():
    models = AsyncSequenceModels(
        [
            researched_response(REJECTED, label="text-rejected"),
            researched_response(PUBLICATION_REJECTED, label="rejected"),
            researched_response(ACCEPTED, label="must-not-run"),
        ]
    )
    service, policy, parsed = publication_service(models)
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 2
    assert policy.repairs == [(QUERY, ISSUES)]
    assert len(parsed) == 1 and parsed[0][1]["text"] == PUBLICATION_REJECTED
    assert result["text"] == "" and result["sources"] == [] and result["claims"] == []
    assert result["runtime_diagnostics"]["status"] == "quality_rejected"
    assert result["runtime_diagnostics"]["call_count"] == 2
    assert result["usage_metadata"]["total_tokens"] == 82


@pytest.mark.asyncio
@pytest.mark.parametrize("transient_first", [False, True])
async def test_transport_and_parsed_repair_share_the_original_three_attempt_limit(
    transient_first,
):
    bad = researched_response(PUBLICATION_REJECTED, label="rejected")
    transient = ProviderStatusError(503, "synthetic transport failure")
    initial = [transient, bad] if transient_first else [bad, transient]
    models = AsyncSequenceModels(
        [*initial, researched_response(ACCEPTED, label="accepted")]
    )
    service, policy, parsed = publication_service(models)
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 3 and len(policy.repairs) == 1 and len(parsed) == 2
    assert result["text"] == ACCEPTED
    assert result["runtime_diagnostics"]["call_count"] == 3
    assert all(
        call["config"].http_options.retry_options.attempts == 1 for call in models.calls
    )
    assert result["usage_metadata"]["usage_complete"] is False
    assert result["usage_metadata"]["total_tokens"] is None
    assert result["usage_metadata"]["search_calls"] is None
    assert "model_version" not in result


@pytest.mark.asyncio
async def test_parsed_rejection_at_original_deadline_keeps_usage_without_another_call():
    clock = FakeClock()
    models = AsyncSequenceModels(
        [
            researched_response(PUBLICATION_REJECTED, label="rejected"),
            researched_response(ACCEPTED, label="must-not-run"),
        ]
    )
    service, _policy, _parsed = publication_service(models, clock)

    def expired_policy(query, raw):
        clock.now = 10.0
        return PUBLICATION_ISSUES

    service._parsed_response_validator = expired_policy
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert result["text"] == "" and result["claims"] == []
    assert result["runtime_diagnostics"]["status"] == "quality_rejected"
    assert result["runtime_diagnostics"]["call_count"] == 1
    assert result["usage_metadata"]["total_tokens"] == 41


@pytest.mark.asyncio
async def test_expired_normalization_cannot_publish_a_previously_parsed_answer(
    monkeypatch,
):
    clock = FakeClock()
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="accepted")])
    service, _policy, _parsed = publication_service(models, clock)
    normalize = service._normalize_grounded_result_async

    async def expired_normalization(*args, **kwargs):
        result = await normalize(*args, **kwargs)
        clock.now = 10.0
        return result

    monkeypatch.setattr(
        service, "_normalize_grounded_result_async", expired_normalization
    )
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1
    assert result["search_performed"] is False
    assert result["text"] == "" and result["claims"] == [] and result["sources"] == []
    assert result["runtime_diagnostics"]["status"] in {
        "deadline_exceeded",
        "response_processing_error",
    }
    assert result["usage_metadata"]["total_tokens"] == 41


@pytest.mark.asyncio
async def test_normalization_failure_reaches_existing_fallback_with_one_metered_primary_call(
    monkeypatch,
):
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="accepted")])
    service, _policy, parsed = publication_service(models)

    async def failed_normalization(*_args, **_kwargs):
        raise ValueError("private-normalization-error-sentinel")

    monkeypatch.setattr(
        service, "_normalize_grounded_result_async", failed_normalization
    )
    searx = FakeSearx(discovery(status="empty"))
    query = assistant_turn_query(
        assistant_input(
            "one_shot", message="Research the synthetic component configuration."
        )
    )
    runner = ResilientResearchRunner(
        SimpleNamespace(search=service.search_web_general_async), searxng=searx
    )
    result = await runner.search(query)

    assert len(models.calls) == 1 and parsed == []
    assert len(searx.queries) == 1
    assert (
        result["runtime_diagnostics"]["primary_status"] == "response_processing_error"
    )
    assert result["runtime_diagnostics"]["fallback_attempted"] is True
    assert result["text"] == "" and result["claims"] == []
    usage = result["usage_metadata"]
    assert usage.get("total_tokens", usage.get("totalTokens")) == 41
    assert usage.get("search_calls", usage.get("searchCalls")) == 2
    assert "private-normalization-error-sentinel" not in json.dumps(result)


@pytest.mark.asyncio
async def test_cancellation_during_parsed_redirect_resolution_cancels_children():
    response = researched_response(ACCEPTED, label="accepted")
    response.candidates[0].grounding_metadata.grounding_chunks[0].web.uri = (
        REDIRECT_ROOT + "blocked"
    )
    models = AsyncSequenceModels([response])
    service, policy, parsed = publication_service(models)
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def resolve(_url):
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    service._grounding_redirect_async_resolver = resolve
    task = asyncio.create_task(service.search_web_general_async(QUERY))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cancelled.is_set()
        assert len(models.calls) == 1 and policy.repairs == [] and parsed == []
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "defects",
    [["not_a_tuple"], ("not-a-safe-code",), tuple(f"code_{i}" for i in range(13))],
)
async def test_invalid_parsed_policy_result_fails_closed_with_metering(defects):
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="accepted")])
    service, policy, _parsed = publication_service(models)
    service._parsed_response_validator = lambda _query, _raw: defects
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1 and policy.repairs == []
    assert result["text"] == "" and result["claims"] == []
    assert result["runtime_diagnostics"]["status"] == "configuration_error"
    assert result["usage_metadata"]["total_tokens"] == 41


@pytest.mark.asyncio
@pytest.mark.parametrize("error_type", [RuntimeError, TimeoutError])
async def test_parsed_policy_exception_does_not_expose_raw_error_or_draft(error_type):
    models = AsyncSequenceModels([researched_response(ACCEPTED, label="accepted")])
    service, policy, _parsed = publication_service(models)

    def broken(_query, _raw):
        raise error_type("private-publication-policy-error-sentinel")

    service._parsed_response_validator = broken
    result = await service.search_web_general_async(QUERY)

    assert len(models.calls) == 1 and policy.repairs == []
    assert result["text"] == "" and result["claims"] == [] and result["sources"] == []
    assert result["runtime_diagnostics"]["status"] == "configuration_error"
    assert result["usage_metadata"]["total_tokens"] == 41
    assert "private-publication-policy-error-sentinel" not in json.dumps(result)


@pytest.mark.asyncio
async def test_parsed_cache_is_operation_local_under_concurrent_queries():
    class ByQueryModels:
        def __init__(self):
            self.calls = []

        async def generate_content(self, **kwargs):
            self.calls.append(kwargs)
            await asyncio.sleep(0)
            query = kwargs["contents"]
            return researched_response(f"Accepted answer for {query}.", label=query)

    models = ByQueryModels()
    service, policy, parsed = publication_service(models)
    first, second = await asyncio.gather(
        service.search_web_general_async("first"),
        service.search_web_general_async("second"),
    )

    assert len(models.calls) == len(parsed) == 2 and policy.repairs == []
    for query, other, raw in (("first", "second", first), ("second", "first", second)):
        assert raw["text"] == f"Accepted answer for {query}."
        assert [source["url"] for source in raw["sources"]] == [
            f"https://authority.example/{query}"
        ]
        assert raw["usage_metadata"]["total_tokens"] == 41
        assert raw["runtime_diagnostics"]["call_count"] == 1
        assert other not in json.dumps(raw)
