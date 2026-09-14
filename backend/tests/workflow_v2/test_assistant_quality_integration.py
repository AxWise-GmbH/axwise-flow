"""Publication and fallback integration checks without provider/network calls."""

from __future__ import annotations

import asyncio
import json

import pytest

from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.service import AssistantTurnService
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.resilient_research_runner import ResilientResearchRunner
from backend.tests.workflow_v2.test_assistant_service import (
    assistant_input,
    metrics_factory,
    source_types,
    usage_reader,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    ExactExtractor,
    FakeSearx,
    discovery,
    document,
)


pytestmark = pytest.mark.contract


class Responses:
    def __init__(self, *responses: dict) -> None:
        self.responses = list(responses)
        self.queries: list[str] = []

    async def search(self, query: str) -> dict:
        self.queries.append(query)
        if not self.responses:
            raise AssertionError("unexpected extra provider lifecycle")
        return self.responses.pop(0)


def quality_rejected(*, complete: bool = True) -> dict:
    return {
        "text": "",
        "sources": [],
        "claims": [],
        "provider": "gemini_google_search",
        "search_performed": False,
        "model_version": "gemini-test-version",
        "usage_metadata": {
            "input_tokens": 31 if complete else None,
            "output_tokens": 11 if complete else None,
            "total_tokens": 42 if complete else None,
            "search_calls": 3 if complete else None,
            "usage_complete": complete,
        },
        "runtime_diagnostics": {
            "route": "gemini_google_search",
            "status": "quality_rejected",
            "call_count": 2,
            "retry_count": 1,
            "usage_complete": complete,
        },
    }


def assistant_service(grounded) -> AssistantTurnService:
    return AssistantTurnService(
        grounded_runner=grounded,
        conversational_runner=Responses(),
        source_type_classifier=source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
    )


def request(message: str = "Research a synthetic n8n workflow. Do not execute it.") -> str:
    return assistant_turn_query(assistant_input("one_shot", message=message))


def token_counts(usage: dict) -> tuple[int | None, int | None, int | None]:
    return (
        usage.get("input_tokens", usage.get("inputTokens")),
        usage.get("output_tokens", usage.get("outputTokens")),
        usage.get("total_tokens", usage.get("totalTokens")),
    )


@pytest.mark.asyncio
async def test_custom_runner_defect_is_rejected_without_a_second_search() -> None:
    rejected = "No live credentials or executions exist in this workspace."
    runner = Responses(
        {
            "text": rejected,
            "runtime_diagnostics": {
                "route": "custom_adapter",
                "status": "ok",
                "call_count": 1,
                "raw_response": "PRIVATE REJECTED RESPONSE",
                "prompt": "PRIVATE USER PROMPT",
            },
        },
        {"text": "A second search must never happen."},
    )
    with pytest.raises(CognitiveExecutionFailure) as failure:
        await assistant_service(runner).execute(
            assistant_input("one_shot", message="Research the n8n setup; do not execute.")
        )

    assert len(runner.queries) == 1
    assert failure.value.error_class == "AXWISE_ASSISTANT_QUALITY_REJECTED"
    assert failure.value.retryable is False
    assert failure.value.diagnostics["status"] == "quality_rejected"
    assert failure.value.diagnostics["call_count"] == 1
    serialized = json.dumps(failure.value.diagnostics)
    assert "PRIVATE" not in serialized
    assert rejected not in serialized


@pytest.mark.asyncio
async def test_exhausted_quality_status_is_not_misreported_as_empty_answer() -> None:
    runner = Responses(quality_rejected())
    with pytest.raises(CognitiveExecutionFailure) as failure:
        await assistant_service(runner).execute(assistant_input("one_shot"))
    assert failure.value.error_class == "AXWISE_ASSISTANT_QUALITY_REJECTED"
    assert failure.value.retryable is False
    assert len(runner.queries) == 1


@pytest.mark.asyncio
async def test_valid_fact_does_not_hide_another_reader_visible_source_mismatch() -> None:
    good = "The Code node transforms input data."
    bad = "The Webhook node supports authentication."
    code_url = "https://docs.example.org/core/n8n-nodes-base.code/"
    chat_url = "https://docs.example.org/core/n8n-nodes-langchain.chattrigger/"
    runner = Responses(
        {
            "text": f"{good}\n\n{bad}",
            "sources": [
                {"title": "Code", "url": code_url},
                {"title": "Chat Trigger", "url": chat_url},
            ],
            "claims": [
                {"text": good, "source_urls": [code_url]},
                {"text": bad, "source_urls": [chat_url]},
            ],
            "runtime_diagnostics": {"route": "custom_adapter", "status": "ok"},
        }
    )
    with pytest.raises(CognitiveExecutionFailure) as failure:
        await assistant_service(runner).execute(
            assistant_input("one_shot", message="Research these n8n node settings.")
        )
    assert failure.value.error_class == "AXWISE_ASSISTANT_SOURCE_MISMATCH"
    assert failure.value.retryable is False
    assert len(runner.queries) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["quality_rejected", "grounding_evidence_missing"])
async def test_quality_rejection_fallback_preserves_usage_without_other_query_cooldown(status) -> None:
    clean = {
        "text": "The second query receives its own primary response.",
        "search_performed": True,
        "runtime_diagnostics": {"status": "ok", "call_count": 1},
        "usage_metadata": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
    }
    rejected = quality_rejected()
    rejected["runtime_diagnostics"]["status"] = status
    primary = Responses(rejected, clean)
    searx = FakeSearx(discovery(status="empty"))
    runner = ResilientResearchRunner(primary, searxng=searx)
    first_query = request()
    second_query = request("Research current Latvian chair manufacturers.")

    first = await runner.search(first_query)
    second = await runner.search(second_query)

    assert primary.queries == [first_query, second_query]
    assert len(searx.queries) == 1
    assert first["runtime_diagnostics"]["primary_status"] == status
    assert first["runtime_diagnostics"]["fallback_attempted"] is True
    assert "retry_after_seconds" not in first["runtime_diagnostics"]
    assert token_counts(first["usage_metadata"]) == (31, 11, 42)
    assert first["usage_metadata"]["search_calls"] == 3
    assert first["usage_metadata"]["usage_complete"] is True
    assert second is clean
    assert token_counts(second["usage_metadata"]) == (5, 2, 7)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["quality_rejected", "grounding_evidence_missing"])
async def test_quality_rejection_releases_waiting_query_to_its_own_primary_call(status) -> None:
    entered = asyncio.Event()
    release = asyncio.Event()

    class GatedPrimary(Responses):
        async def search(self, query: str) -> dict:
            if not self.queries:
                entered.set()
                self.queries.append(query)
                await release.wait()
                rejected = quality_rejected()
                rejected["runtime_diagnostics"]["status"] = status
                return rejected
            return await super().search(query)

    clean = {"text": "Second query only", "search_performed": True}
    primary = GatedPrimary(clean)
    runner = ResilientResearchRunner(primary, searxng=FakeSearx(discovery(status="empty")))
    first_query, second_query = request(), request("Research a different product.")
    first = asyncio.create_task(runner.search(first_query))
    await entered.wait()
    second = asyncio.create_task(runner.search(second_query))
    release.set()
    first_result, second_result = await asyncio.wait_for(asyncio.gather(first, second), 1)

    assert primary.queries == [first_query, second_query]
    assert first_result["runtime_diagnostics"]["primary_status"] == status
    assert second_result is clean


@pytest.mark.asyncio
@pytest.mark.parametrize("complete", [True, False])
async def test_exact_fallback_preserves_search_counts_and_usage_completeness(complete: bool) -> None:
    url = "https://docs.example.org/reference"
    exact = "The verified component accepts the documented input."
    searx = FakeSearx(discovery(sources=[{"url": url, "title": "Component reference"}]))

    async def fetch(_url: str) -> dict:
        return document(url, f"Publisher introduction. {exact} Publisher appendix.")

    result = await ResilientResearchRunner(
        Responses(quality_rejected(complete=complete)),
        searxng=searx,
        fetcher=fetch,
        extractor=ExactExtractor(exact, input_tokens=17, output_tokens=5),
        source_type_classifier=source_types,
    ).search(request())

    assert result["provider"] == "searxng_direct_fetch"
    assert [claim["text"] for claim in result["claims"]] == [exact]
    assert result["usage_metadata"]["usage_complete"] is complete
    assert token_counts(result["usage_metadata"]) == ((48, 16, 64) if complete else (None, None, None))
    assert result["usage_metadata"]["search_calls"] == (3 if complete else None)
    if not complete:
        assert result["usage_metadata"].get("inputTokens") is None
        assert result["usage_metadata"].get("outputTokens") is None
        assert result["usage_metadata"].get("totalTokens") is None
    assert "provider_queries" not in result
    assert "must not leak" not in json.dumps(result)
    assert result["runtime_diagnostics"]["primary_status"] == "quality_rejected"
    assert len(searx.queries) == 1


@pytest.mark.asyncio
async def test_unmetered_extractor_failure_does_not_claim_complete_operation_usage() -> None:
    url = "https://docs.example.org/reference"

    class FailedExtractor:
        async def extract(self, _request):
            raise RuntimeError("PRIVATE EXTRACTION FAILURE")

    async def fetch(_url: str) -> dict:
        return document(url, "A fetched publisher document.")

    result = await ResilientResearchRunner(
        Responses(quality_rejected()),
        searxng=FakeSearx(discovery(sources=[{"url": url, "title": "Reference"}])),
        fetcher=fetch,
        extractor=FailedExtractor(),
        source_type_classifier=source_types,
    ).search(request())

    assert result["runtime_diagnostics"]["fallback"]["status"] == "extraction_error"
    assert result["usage_metadata"]["usage_complete"] is False
    assert token_counts(result["usage_metadata"]) == (None, None, None)
    assert result["usage_metadata"].get("inputTokens") is None
    assert result["usage_metadata"].get("outputTokens") is None
    assert result["usage_metadata"].get("totalTokens") is None
    assert result["usage_metadata"]["search_calls"] == 3
    assert "PRIVATE EXTRACTION FAILURE" not in json.dumps(result)


@pytest.mark.asyncio
async def test_final_failure_preserves_observed_primary_receipt_through_sanitization() -> None:
    url = "https://docs.example.org/reference"
    primary = quality_rejected()
    primary["runtime_diagnostics"].update(
        input_tokens=31, output_tokens=11, total_tokens=42,
    )

    class FailedExtractor:
        async def extract(self, _request):
            raise RuntimeError("PRIVATE EXTRACTION FAILURE")

    async def fetch(_url: str) -> dict:
        return document(url, "A fetched publisher document.")

    runner = ResilientResearchRunner(
        Responses(primary),
        searxng=FakeSearx(discovery(sources=[{"url": url, "title": "Reference"}])),
        fetcher=fetch,
        extractor=FailedExtractor(),
        source_type_classifier=source_types,
    )
    with pytest.raises(CognitiveExecutionFailure) as failure:
        await assistant_service(runner).execute(
            assistant_input("one_shot", message="Research the n8n component.")
        )

    assert failure.value.error_class == "AXWISE_ASSISTANT_QUALITY_REJECTED"
    receipt = failure.value.diagnostics["primary"]
    assert receipt["status"] == "quality_rejected"
    assert receipt["input_tokens"] == 31
    assert receipt["output_tokens"] == 11
    assert receipt["total_tokens"] == 42
    assert receipt["usage_complete"] is True
    assert "PRIVATE EXTRACTION FAILURE" not in json.dumps(failure.value.diagnostics)
