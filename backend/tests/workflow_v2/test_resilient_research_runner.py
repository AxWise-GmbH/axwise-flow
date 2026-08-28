from __future__ import annotations

import asyncio
import hashlib
import json
from unittest.mock import MagicMock, patch

import pytest

from backend.domain.workflow_v2.contracts import canonical_json
from backend.services.generative.searxng_search_service import SearxngSearchService
from backend.services.workflow_v2.exact_span_extractor import (
    DraftCodePointSpan,
    ExactSpanExtractionRequest,
    ExactSpanSelectionDraft,
    assemble_exact_span_result,
)
from backend.services.workflow_v2.resilient_research_runner import (
    ResilientResearchRunner,
)


pytestmark = pytest.mark.contract


def server_query(*, allowed_hosts: list[str] | None = None) -> str:
    return "server-owned instruction\n" + canonical_json(
        {
            "acceptedScopeSemantics": {
                "topicAnchors": [
                    {"value": "cat food", "sourceSpans": [{"start": 0, "end": 8}]},
                    {"value": "pet nutrition", "sourceSpans": [{"start": 10, "end": 23}]},
                ],
                "geography": ["Estonia", "European Union"],
                # These fields must never enter the discovery query.
                "objective": "UNRELATED OBJECTIVE",
                "deliverables": ["UNRELATED DELIVERABLE"],
            },
            "requirement": {
                "id": "food-law",
                "claimType": "regulatory_requirement",
                "description": "Verify applicable pet food labelling rules.",
                "criticality": "blocking",
                "verificationBasis": "grounded_claims",
                "appliesWhen": "When assessing Estonia pet-food market entry.",
                "acceptedSourceTypes": ["government", "primary_law"],
                "allowedSourceHosts": allowed_hosts or [],
            },
        }
    )


class FakePrimary:
    def __init__(self, result: dict) -> None:
        self.result = result
        self.queries: list[str] = []
        self.closed = 0

    async def search(self, query: str) -> dict:
        self.queries.append(query)
        return self.result

    async def close(self) -> None:
        self.closed += 1


class FakeSearx:
    def __init__(self, result: dict) -> None:
        self.result = result
        self.queries: list[str] = []
        self.closed = 0

    async def search_web_general(self, query: str) -> dict:
        self.queries.append(query)
        return self.result

    async def close(self) -> None:
        self.closed += 1


def transient(status: str = "deadline_exceeded") -> dict:
    return {
        "search_performed": False,
        "runtime_diagnostics": {
            "route": "gemini_search",
            "status": status,
            "call_count": 3,
        },
    }


def metered_transient(status: str = "deadline_exceeded") -> dict:
    result = transient(status)
    result["usage_metadata"] = {
        "input_tokens": 31,
        "output_tokens": 11,
        "total_tokens": 42,
    }
    result["provider_queries"] = ["primary query one", "primary query two"]
    return result


def discovery(
    *,
    sources: list[dict] | None = None,
    claims: list[dict] | None = None,
    status: str = "ok",
    search_performed: bool = True,
) -> dict:
    return {
        "text": "SearX result presentation that must not be persisted as evidence",
        "sources": sources or [],
        "claims": claims or [],
        "provider_queries": ["must not leak into fallback output"],
        "search_performed": search_performed,
        "runtime_diagnostics": {"route": "searxng", "status": status},
    }


def document(url: str, text: str) -> dict:
    return {
        "final_url": url,
        "text": text,
        "retrieved_at": "2026-08-28T08:00:00Z",
    }


@pytest.mark.asyncio
async def test_primary_success_passes_through_by_identity_without_fallback() -> None:
    successful = {
        "search_performed": True,
        "text": "primary",
        "claims": [],
        "sources": [],
    }
    primary = FakePrimary(successful)
    searx = FakeSearx(discovery())
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, "unused")

    runner = ResilientResearchRunner(primary, searxng=searx, fetcher=fetch)
    result = await runner.search(server_query())

    assert result is successful
    assert searx.queries == []
    assert fetched == []


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["configuration_error", "non_retryable_error"])
async def test_nonretryable_primary_failure_never_invokes_fallback(status: str) -> None:
    failed = transient(status)
    primary = FakePrimary(failed)
    searx = FakeSearx(discovery())
    runner = ResilientResearchRunner(
        primary, searxng=searx, fetcher=None  # type: ignore[arg-type]
    )

    result = await runner.search(server_query())

    assert result is failed
    assert searx.queries == []


@pytest.mark.asyncio
async def test_exact_unique_searx_snippet_is_bound_to_direct_document() -> None:
    url = "https://pta.agri.ee/pet-food-rules"
    exact = "Feed labelling must identify the responsible operator."
    primary = FakePrimary(transient())
    searx = FakeSearx(
        discovery(
            sources=[{"url": url, "title": "Estonian Agriculture Authority"}],
            claims=[
                {
                    "text": exact,
                    "source_urls": [url],
                    "verification_status": "search_snippet_not_independently_verified",
                    "provider_queries": ["untrusted"],
                }
            ],
        )
    )

    async def fetch(_url: str) -> dict:
        return document(url, f"Introduction. {exact} Further guidance.")

    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    )
    result = await runner.search(server_query())

    response = f"Introduction. {exact} Further guidance."
    assert result["search_performed"] is True
    assert result["provider"] == "searxng_direct_fetch"
    assert result["text"] == response
    assert result["provider_response_hash"] == hashlib.sha256(
        response.encode("utf-8")
    ).hexdigest()
    assert result["claims"] == [
        {
            "text": exact,
            "source_urls": [url],
            "provider": "searxng_direct_fetch",
            "provider_response_hash": result["provider_response_hash"],
            "segment_start": len("Introduction. ".encode("utf-8")),
            "segment_end": len(f"Introduction. {exact}".encode("utf-8")),
            "offset_unit": "utf8_bytes",
            "span_target": "provider_response_text",
        }
    ]
    assert result["sources"][0]["url"] == url
    assert "provider_queries" not in canonical_json(result)
    discovery_query = searx.queries[0]
    assert "cat food" in discovery_query
    assert "Estonia" in discovery_query
    assert "Verify applicable pet food labelling rules." in discovery_query
    assert "When assessing Estonia pet-food market entry." in discovery_query
    assert "government" in discovery_query
    assert "UNRELATED" not in discovery_query


class ExactExtractor:
    def __init__(
        self,
        text: str,
        *,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        self.text = text
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.requests: list[ExactSpanExtractionRequest] = []
        self.closed = 0

    async def extract(
        self, request: ExactSpanExtractionRequest
    ):
        self.requests.append(request)
        selected = next(
            document for document in request.documents if self.text in document.text
        )
        start = selected.text.index(self.text)
        return assemble_exact_span_result(
            request,
            ExactSpanSelectionDraft(
                document_id=selected.document_id,
                spans=[
                    DraftCodePointSpan(start=start, end=start + len(self.text))
                ],
            ),
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
        )

    async def close(self) -> None:
        self.closed += 1


class EmptyExtractor:
    def __init__(self, *, input_tokens: int = 0, output_tokens: int = 0) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens

    async def extract(self, request: ExactSpanExtractionRequest):
        return assemble_exact_span_result(
            request,
            ExactSpanSelectionDraft(document_id=None, spans=[]),
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
        )


@pytest.mark.asyncio
async def test_exact_search_snippet_without_typed_extractor_preserves_transient() -> None:
    url = "https://pta.agri.ee/rules"
    exact = "This snippet is also present in the publisher document."

    async def fetch(_url: str) -> dict:
        return document(url, f"Start. {exact} End.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[{"url": url, "title": "Official rules"}],
                claims=[{"text": exact, "source_urls": [url]}],
            )
        ),
        fetcher=fetch,
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "exact_span_extractor_unavailable"
    )


@pytest.mark.asyncio
async def test_snippet_mismatch_is_rejected_and_typed_extractor_may_supply_span() -> None:
    url = "https://eur-lex.europa.eu/legal-content/EN/TXT/"
    exact = "Cats require €-denominated compliant labels."
    extractor = ExactExtractor(exact)
    searx = FakeSearx(
        discovery(
            sources=[{"url": url, "title": "EUR-Lex"}],
            claims=[{"text": "invented snippet", "source_urls": [url]}],
        )
    )

    async def fetch(_url: str) -> dict:
        return document(url, f"Preamble. {exact} End.")

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
    ).search(server_query())

    assert [claim["text"] for claim in result["claims"]] == [exact]
    assert "invented snippet" not in canonical_json(result)
    assert len(extractor.requests) == 1
    assert extractor.requests[0].requirement_query.requirement_id == "food-law"
    assert extractor.requests[0].requirement_query.applies_when == (
        "When assessing Estonia pet-food market entry."
    )


@pytest.mark.asyncio
async def test_extractor_span_repeated_in_document_preserves_transient() -> None:
    url = "https://example.gov.ee/repeated"
    repeated = "The same passage."

    async def fetch(_url: str) -> dict:
        return document(url, f"{repeated} Middle. {repeated}")

    result = await ResilientResearchRunner(
        FakePrimary(metered_transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official source"}])
        ),
        fetcher=fetch,
        extractor=ExactExtractor(repeated, input_tokens=13, output_tokens=4),
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "extraction_span_not_unique"
    )
    assert result["usage_metadata"] == {
        "inputTokens": 44,
        "outputTokens": 15,
        "totalTokens": 59,
    }
    assert len(result["provider_queries"]) == 2


@pytest.mark.asyncio
async def test_untrusted_snippet_only_locates_a_bounded_fetched_document_window() -> None:
    url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=window"
    exact = "The exact legal passage is near the end of the publisher document."
    raw_text = "irrelevant preface " * 20 + exact + " annex"

    async def fetch(_url: str) -> dict:
        return document(url, raw_text)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[{"url": url, "title": "EUR-Lex"}],
                claims=[{"text": exact, "source_urls": [url]}],
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_document_characters=100,
    ).search(server_query())

    assert [claim["text"] for claim in result["claims"]] == [exact]
    assert len(result["text"]) == 100
    assert exact in result["text"]
    assert not result["text"].startswith("irrelevant preface")


@pytest.mark.asyncio
async def test_searx_claim_fields_are_discarded_when_not_exact_in_document() -> None:
    url = "https://example.gov.ee/rules"
    searx = FakeSearx(
        discovery(
            sources=[{"url": url, "title": "Official rules"}],
            claims=[
                {
                    "text": "A fabricated search-engine claim.",
                    "source_urls": [url],
                    "provider_response_hash": "0" * 64,
                    "segment_start": 0,
                    "segment_end": 33,
                    "verification_status": "verified",
                }
            ],
        )
    )

    async def fetch(_url: str) -> dict:
        return document(url, "The independently fetched publisher document says otherwise.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx,
        fetcher=fetch,
        extractor=EmptyExtractor(),
    ).search(server_query())

    assert result["search_performed"] is True
    assert result["claims"] == []
    assert result["sources"] == []
    assert result["text"] == ""


@pytest.mark.asyncio
async def test_healthy_empty_searx_result_is_successful_zero_evidence() -> None:
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    result = await ResilientResearchRunner(
        FakePrimary(transient("unavailable")),
        searxng=searx,
        fetcher=None,  # type: ignore[arg-type]
    ).search(server_query())

    assert result["search_performed"] is True
    assert result["claims"] == []
    diagnostics = result["runtime_diagnostics"]
    assert diagnostics["route"] == "searxng_direct_fetch"
    assert diagnostics["status"] == "empty"
    assert diagnostics["primary_status"] == "unavailable"
    assert diagnostics["fallback_attempted"] is True
    assert diagnostics["fallback_used"] is True
    assert diagnostics["call_count"] == 3
    assert diagnostics["retry_count"] == 0
    assert diagnostics["primary"]["call_count"] == 3
    assert diagnostics["discovery"]["call_count"] == 0
    assert diagnostics["discovery"]["status"] == "empty"
    assert diagnostics["extractor"] == {"input_tokens": 0, "output_tokens": 0}
    assert diagnostics["candidate_count"] == 0
    assert diagnostics["fetched_count"] == 0
    assert diagnostics["rejected_candidate_count"] == 0
    assert diagnostics["claim_count"] == 0
    assert result["usage_metadata"] == {
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
    }


@pytest.mark.asyncio
async def test_empty_result_with_every_engine_unresponsive_preserves_transient() -> None:
    searx_result = discovery(status="empty", search_performed=False)
    searx_result["runtime_diagnostics"]["unresponsive_engines"] = [
        {"engine": engine, "reason": "unavailable"}
        for engine in ("bing", "brave", "duckduckgo", "google")
    ]
    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(searx_result),
        fetcher=None,  # type: ignore[arg-type]
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "all_engines_unresponsive"
    )


@pytest.mark.asyncio
async def test_unavailable_searx_preserves_primary_transient_status() -> None:
    primary = FakePrimary(transient("response_processing_error"))
    searx = FakeSearx(
        discovery(status="unavailable", search_performed=False)
    )
    result = await ResilientResearchRunner(
        primary, searxng=searx, fetcher=None  # type: ignore[arg-type]
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "response_processing_error"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["route"] == "searxng_direct_fetch"
    assert fallback["status"] == "unavailable"
    assert fallback["discovery"]["route"] == "searxng"
    assert fallback["extractor"] == {"input_tokens": 0, "output_tokens": 0}


@pytest.mark.asyncio
async def test_untrusted_search_performed_flag_cannot_override_bad_discovery_status() -> None:
    malformed = discovery(
        sources=[],
        status="response_processing_error",
        search_performed=True,
    )
    result = await ResilientResearchRunner(
        FakePrimary(metered_transient("unavailable")),
        searxng=FakeSearx(malformed),
        fetcher=None,  # type: ignore[arg-type]
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "unavailable"
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "response_processing_error"
    )
    assert result["usage_metadata"] == {
        "inputTokens": 31,
        "outputTokens": 11,
        "totalTokens": 42,
    }


@pytest.mark.asyncio
async def test_real_adapter_mixed_malformed_rows_cannot_become_healthy_missing() -> None:
    url = "https://eur-lex.europa.eu/legal-content/EN/TXT/"
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            {"url": url, "title": "EUR-Lex", "content": "candidate snippet"},
            "malformed provider row",
        ]
    }
    response.status_code = 200
    response.content = b"bounded mixed response"

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ):
        mixed_discovery = SearxngSearchService(
            "https://search.example.run.app"
        ).search_web_general("bounded accepted-scope query")

    assert mixed_discovery["runtime_diagnostics"]["status"] == "ok"
    assert mixed_discovery["runtime_diagnostics"]["invalid_result_count"] == 1

    async def fetch(_url: str) -> dict:
        return document(url, "Publisher text with no applicable exact passage.")

    result = await ResilientResearchRunner(
        FakePrimary(metered_transient("unavailable")),
        searxng=FakeSearx(mixed_discovery),
        fetcher=fetch,
        extractor=EmptyExtractor(input_tokens=7, output_tokens=2),
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "unavailable"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "discovery_rows_incomplete"
    assert fallback["malformed_candidate_count"] == 1
    assert result["usage_metadata"] == {
        "inputTokens": 38,
        "outputTokens": 13,
        "totalTokens": 51,
    }


@pytest.mark.asyncio
async def test_unsafe_candidates_and_cross_host_redirects_cannot_become_evidence() -> None:
    allowed = "pta.agri.ee"
    safe_url = f"https://{allowed}/rules"
    fetched: list[str] = []
    searx = FakeSearx(
        discovery(
            sources=[
                {"url": "https://127.0.0.1/secrets", "title": "unsafe"},
                {"url": "http://pta.agri.ee/plain", "title": "plain HTTP"},
                {"url": "https://evil.example/rules", "title": "wrong host"},
                {"url": safe_url, "title": "candidate"},
            ],
            claims=[{"text": "exact", "source_urls": [safe_url]}],
        )
    )

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document("https://evil.example/redirected", "exact")

    result = await ResilientResearchRunner(
        FakePrimary(transient()), searxng=searx, fetcher=fetch
    ).search(server_query(allowed_hosts=[allowed]))

    assert fetched == [safe_url]
    assert result["search_performed"] is False
    assert result.get("claims", []) == []
    assert result.get("sources", []) == []
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "direct_fetch_incomplete"
    )


@pytest.mark.asyncio
async def test_ranked_candidate_order_dedupe_and_one_document_hash_are_deterministic() -> None:
    first_url = "https://a.example.ee/rules"
    second_url = "https://b.example.ee/rules"
    exact = "This exact sentence appears once."
    calls: list[str] = []

    async def fetch(url: str) -> dict:
        calls.append(url)
        return document(url, f"Header {exact} Footer")

    def searx_with_sources(rows: list[dict]) -> FakeSearx:
        return FakeSearx(
            discovery(
                sources=rows,
                claims=[
                    {"text": exact, "source_urls": [first_url]},
                    {"text": exact, "source_urls": [second_url]},
                ],
            )
        )

    rows = [
        {"url": second_url, "title": "B"},
        {"url": first_url, "title": "A duplicate"},
        {"url": first_url, "title": "A"},
    ]
    result_one = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx_with_sources(rows),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(server_query())
    result_two = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx_with_sources(rows),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(server_query())

    expected_text = f"Header {exact} Footer"
    expected_hash = hashlib.sha256(expected_text.encode("utf-8")).hexdigest()
    assert calls == [second_url, first_url, second_url, first_url]
    assert result_one == result_two
    assert len(result_one["sources"]) == 1
    assert result_one["sources"][0]["url"] == second_url
    assert result_one["provider_response_hash"] == expected_hash
    assert all(claim["source_urls"] == [second_url] for claim in result_one["claims"])


@pytest.mark.asyncio
async def test_all_direct_fetch_errors_preserve_primary_transient() -> None:
    url = "https://example.ee/source"

    async def unavailable_fetch(_url: str) -> dict:
        raise TimeoutError("temporary fetch outage")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Publisher"}])
        ),
        fetcher=unavailable_fetch,
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["runtime_diagnostics"]["fallback"]["status"] == "direct_fetch_error"


class BlockingSearx(FakeSearx):
    def __init__(self) -> None:
        super().__init__({})
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def search_web_general(self, query: str) -> dict:
        self.queries.append(query)
        self.started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


@pytest.mark.asyncio
async def test_parent_cancellation_propagates_and_close_is_idempotent() -> None:
    primary = FakePrimary(transient())
    searx = BlockingSearx()
    extractor = ExactExtractor("unused")
    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=None,  # type: ignore[arg-type]
        extractor=extractor,
    )
    task = asyncio.create_task(runner.search(server_query()))
    await asyncio.wait_for(searx.started.wait(), timeout=1)
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert searx.cancelled.is_set()

    await runner.close()
    await runner.close()
    assert primary.closed == 1
    assert searx.closed == 1
    assert extractor.closed == 1
    with pytest.raises(RuntimeError, match="closed"):
        await runner.search(server_query())


@pytest.mark.asyncio
async def test_noncanonical_appended_json_does_not_reach_discovery() -> None:
    primary = FakePrimary(transient())
    searx = FakeSearx(discovery())
    query = server_query().replace('"geography":[', '"geography": [', 1)

    result = await ResilientResearchRunner(
        primary, searxng=searx, fetcher=None  # type: ignore[arg-type]
    ).search(query)

    assert searx.queries == []
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "invalid_canonical_input"
    )


@pytest.mark.asyncio
async def test_maximum_scope_cannot_erase_material_discovery_fields() -> None:
    material_requirement = "MATERIAL LEGAL REQUIREMENT " + "r" * 970
    material_applicability = "ONLY FOR ESTONIA MARKET ENTRY " + "a" * 960
    hosts = [f"host-{index:02d}.example.ee" for index in range(20)]
    query = "server-owned instruction\n" + canonical_json(
        {
            "acceptedScopeSemantics": {
                "topicAnchors": [
                    {
                        "value": f"anchor-{index:02d}-" + "t" * 286,
                        "sourceSpans": [{"start": 0, "end": 1}],
                    }
                    for index in range(24)
                ],
                "geography": [f"geography-{index:02d}-" + "g" * 140 for index in range(24)],
            },
            "requirement": {
                "id": "material-law",
                "claimType": "regulatory_requirement",
                "description": material_requirement,
                "criticality": "blocking",
                "verificationBasis": "grounded_claims",
                "appliesWhen": material_applicability,
                "acceptedSourceTypes": ["government", "primary_law"],
                "allowedSourceHosts": hosts,
            },
        }
    )
    searx = FakeSearx(discovery(status="empty", search_performed=False))

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx,
        fetcher=None,  # type: ignore[arg-type]
    ).search(query)

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "discovery_query_incomplete"
    assert fallback["query_complete"] is False
    discovery_query = searx.queries[0]
    assert len(discovery_query) <= 2_000
    assert "requirement: MATERIAL LEGAL REQUIREMENT" in discovery_query
    assert "applicability: ONLY FOR ESTONIA MARKET ENTRY" in discovery_query
    assert "source classes: government | primary_law" in discovery_query
    assert "publishers: site:host-00.example.ee" in discovery_query
    assert "topics: anchor-00-" in discovery_query
    assert "geography: geography-00-" in discovery_query


@pytest.mark.asyncio
async def test_incomplete_query_may_still_yield_exact_verified_evidence() -> None:
    url = "https://example.gov.ee/rules"
    exact = "This exact official obligation applies to the product."
    base_query = server_query()
    instruction, raw_payload = base_query.rsplit("\n", 1)
    payload = json.loads(raw_payload)
    payload["requirement"]["description"] = "R" * 900
    query = instruction + "\n" + canonical_json(payload)

    async def fetch(_url: str) -> dict:
        return document(url, f"Preamble. {exact} Appendix.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(query)

    assert result["search_performed"] is True
    assert [claim["text"] for claim in result["claims"]] == [exact]
    assert result["runtime_diagnostics"]["query_complete"] is False


@pytest.mark.asyncio
async def test_partial_direct_retrieval_without_evidence_preserves_transient() -> None:
    first_url = "https://one.example.ee/rules"
    second_url = "https://two.example.ee/rules"

    async def partial_fetch(url: str) -> dict:
        if url == first_url:
            raise TimeoutError("temporary publisher outage")
        return document(second_url, "No passage satisfies the requirement.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": first_url, "title": "First publisher"},
                    {"url": second_url, "title": "Second publisher"},
                ]
            )
        ),
        fetcher=partial_fetch,
        extractor=EmptyExtractor(input_tokens=17, output_tokens=5),
    ).search(server_query(allowed_hosts=["one.example.ee", "two.example.ee"]))

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "direct_fetch_incomplete"
    assert fallback["discovery"]["status"] == "ok"
    assert fallback["extractor"] == {"input_tokens": 17, "output_tokens": 5}


@pytest.mark.asyncio
async def test_invalid_fetched_mappings_cannot_become_successful_empty_evidence() -> None:
    allowed = "pta.agri.ee"
    first_url = f"https://{allowed}/invalid-final"
    second_url = f"https://{allowed}/empty-text"

    async def invalid_fetch(url: str) -> dict:
        if url == first_url:
            return document("https://attacker.example/redirected", "Not accepted.")
        return document(second_url, "")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": first_url, "title": "Rejected redirect"},
                    {"url": second_url, "title": "Empty response"},
                ]
            )
        ),
        fetcher=invalid_fetch,
        extractor=EmptyExtractor(),
    ).search(server_query(allowed_hosts=[allowed]))

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "deadline_exceeded"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "direct_fetch_incomplete"
    assert fallback["discovery"]["status"] == "ok"


@pytest.mark.asyncio
async def test_malformed_and_wholly_rejected_discovery_rows_preserve_transient() -> None:
    discovery_result = discovery()
    discovery_result["sources"] = [
        "not a source row",
        {"url": "http://example.gov.ee/not-https", "title": "Rejected"},
    ]

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(discovery_result),
        fetcher=None,  # type: ignore[arg-type]
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "retry_exhausted"
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "discovery_rows_incomplete"
    assert fallback["query_complete"] is True
    assert fallback["malformed_candidate_count"] == 1
    assert fallback["rejected_candidate_count"] == 1


@pytest.mark.asyncio
async def test_partial_discovery_rows_cannot_turn_no_selection_into_missing() -> None:
    url = "https://example.gov.ee/rules"
    discovery_result = discovery(
        sources=[{"url": url, "title": "Official rules"}]
    )
    discovery_result["sources"].append({"title": "Missing URL"})

    async def fetch(_url: str) -> dict:
        return document(url, "This document has no applicable supporting passage.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery_result),
        fetcher=fetch,
        extractor=EmptyExtractor(input_tokens=3, output_tokens=1),
    ).search(server_query())

    assert result["search_performed"] is False
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "discovery_rows_incomplete"
    assert fallback["rejected_candidate_count"] == 1
    assert result["usage_metadata"] == {
        "inputTokens": 3,
        "outputTokens": 1,
        "totalTokens": 4,
    }


@pytest.mark.asyncio
async def test_success_sums_primary_and_extractor_gemini_usage_and_queries() -> None:
    url = "https://example.gov.ee/rules"
    exact = "The exact verified rule applies."

    async def fetch(_url: str) -> dict:
        return document(url, f"Preamble. {exact} Appendix.")

    result = await ResilientResearchRunner(
        FakePrimary(metered_transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact, input_tokens=17, output_tokens=5),
    ).search(server_query())

    assert result["search_performed"] is True
    assert result["usage_metadata"] == {
        "inputTokens": 48,
        "outputTokens": 16,
        "totalTokens": 64,
    }
    assert result["provider_queries"] == [
        "primary query one",
        "primary query two",
    ]
    diagnostics = result["runtime_diagnostics"]
    assert diagnostics["primary_provider_query_count"] == 2
    assert diagnostics["extractor"] == {"input_tokens": 17, "output_tokens": 5}


@pytest.mark.asyncio
async def test_empty_sums_primary_and_extractor_usage_without_counting_searx() -> None:
    url = "https://example.gov.ee/rules"

    async def fetch(_url: str) -> dict:
        return document(url, "No applicable supporting passage is present.")

    result = await ResilientResearchRunner(
        FakePrimary(metered_transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=EmptyExtractor(input_tokens=19, output_tokens=7),
    ).search(server_query())

    assert result["search_performed"] is True
    assert result["claims"] == []
    assert result["usage_metadata"] == {
        "inputTokens": 50,
        "outputTokens": 18,
        "totalTokens": 68,
    }
    assert len(result["provider_queries"]) == 2
    assert "must not leak" not in canonical_json(result["provider_queries"])


@pytest.mark.asyncio
async def test_extractor_exception_retains_only_observable_primary_metering() -> None:
    url = "https://example.gov.ee/rules"

    class FailedExtractor:
        async def extract(self, _request: ExactSpanExtractionRequest):
            raise RuntimeError("raw provider failure must not escape")

    async def fetch(_url: str) -> dict:
        return document(url, "A fetched source document.")

    result = await ResilientResearchRunner(
        FakePrimary(metered_transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=FailedExtractor(),
    ).search(server_query())

    assert result["search_performed"] is False
    assert result["usage_metadata"] == {
        "inputTokens": 31,
        "outputTokens": 11,
        "totalTokens": 42,
    }
    assert len(result["provider_queries"]) == 2
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["status"] == "extraction_error"
    assert fallback["extractor"] == {"input_tokens": 0, "output_tokens": 0}
    assert "raw provider failure" not in canonical_json(result)


@pytest.mark.asyncio
async def test_empty_extraction_preserves_usage_and_only_finite_diagnostics() -> None:
    url = "https://example.gov.ee/rules"
    primary_result = transient()
    primary_result["runtime_diagnostics"].update(
        {
            "call_count": 10**100,
            "retry_count": -12,
            "elapsed_ms": 10**100,
            "secret_error": "must not propagate",
        }
    )
    discovery_result = discovery(sources=[{"url": url, "title": "Rules"}])
    discovery_result["runtime_diagnostics"].update(
        {
            "call_count": 1,
            "retry_count": 0,
            "elapsed_ms": 23,
            "raw_response": "must not propagate",
        }
    )

    async def fetch(_url: str) -> dict:
        return document(url, "The source contains no applicable supporting passage.")

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=FakeSearx(discovery_result),
        fetcher=fetch,
        extractor=EmptyExtractor(input_tokens=29, output_tokens=7),
    ).search(server_query())

    assert result["search_performed"] is True
    assert result["claims"] == []
    assert result["usage_metadata"] == {
        "inputTokens": 29,
        "outputTokens": 7,
        "totalTokens": 36,
    }
    diagnostics = result["runtime_diagnostics"]
    assert diagnostics["call_count"] == 100
    assert diagnostics["retry_count"] == 0
    assert diagnostics["elapsed_ms"] == 900_000
    assert diagnostics["primary"]["call_count"] == 100
    assert diagnostics["discovery"]["call_count"] == 1
    assert diagnostics["discovery"]["status"] == "ok"
    assert diagnostics["extractor"] == {"input_tokens": 29, "output_tokens": 7}
    serialized = canonical_json(diagnostics)
    assert "secret_error" not in serialized
    assert "raw_response" not in serialized
