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
    WORKFLOW_V2_FALLBACK_PHASE_SECONDS,
)


pytestmark = pytest.mark.contract


def server_query(
    *,
    allowed_hosts: list[str] | None = None,
    fallback_candidates: list[dict[str, str]] | None = None,
    description: str = "Verify applicable pet food labelling rules.",
    accepted_source_types: list[str] | None = None,
) -> str:
    payload = {
        "acceptedScopeSemantics": {
            "topicAnchors": [
                {"value": "cat food", "sourceSpans": [{"start": 0, "end": 8}]},
                {
                    "value": "pet nutrition",
                    "sourceSpans": [{"start": 10, "end": 23}],
                },
            ],
            "geography": ["Estonia", "European Union"],
            # These fields must never enter the discovery query.
            "objective": "UNRELATED OBJECTIVE",
            "deliverables": ["UNRELATED DELIVERABLE"],
        },
        "requirement": {
            "id": "food-law",
            "claimType": "regulatory_requirement",
            "description": description,
            "criticality": "blocking",
            "evidenceRole": "grounded_claim",
            "verificationBasis": "grounded_claims",
            "appliesWhen": "When assessing Estonia pet-food market entry.",
            "acceptedSourceTypes": accepted_source_types
            or ["government", "primary_law"],
            "allowedSourceHosts": allowed_hosts or [],
        },
    }
    if fallback_candidates is not None:
        payload["fallbackCandidateSources"] = fallback_candidates
    return "server-owned instruction\n" + canonical_json(payload)


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
async def test_primary_success_exposes_accepted_response_url_as_locator_only() -> None:
    official_url = "https://eur-lex.europa.eu/eli/reg/2009/767/oj/eng"
    primary = FakePrimary(
        {
            "search_performed": True,
            "provider": "gemini_google_search",
            "text": (
                "Generated legal prose is not evidence. Canonical source: "
                f"[{official_url}]({official_url})"
            ),
            "claims": [],
            "sources": [],
        }
    )
    searx = FakeSearx(discovery())
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, "unused")

    result = await ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=fetch,
        source_type_classifier=lambda _url, _title: {
            "government",
            "primary_law",
        },
    ).search(
        server_query(
            accepted_source_types=["primary_law"],
            allowed_hosts=["eur-lex.europa.eu"],
        )
    )

    assert result["text"] == primary.result["text"]
    assert result["claims"] == []
    assert result["sources"] == []
    assert result["same_operation_locators"] == [
        {
            "title": "eur-lex.europa.eu",
            "url": official_url,
        }
    ]
    assert searx.queries == []
    assert fetched == []


@pytest.mark.asyncio
async def test_same_operation_repair_locator_is_refetched_without_reasking_primary() -> None:
    url = "https://pta.agri.ee/pet-food-rules"
    exact = "Feed business operators must notify the competent authority."
    primary = FakePrimary(
        {
            "search_performed": True,
            "text": "A generated restatement that must remain locator-only.",
            "claims": [],
            "sources": [{"url": url, "title": "PTA rules"}],
        }
    )
    searx = FakeSearx(discovery(status="empty"))
    fetched: list[str] = []

    async def fetch(candidate_url: str) -> dict:
        fetched.append(candidate_url)
        return document(candidate_url, f"Introduction. {exact} End.")

    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    )
    result = await runner.search(
        server_query(
            allowed_hosts=["pta.agri.ee"],
            fallback_candidates=[{"url": url, "title": "PTA rules"}],
        )
    )

    assert primary.queries == []
    assert fetched == [url]
    assert result["provider"] == "searxng_direct_fetch"
    assert result["claims"][0]["text"] == exact
    assert result["runtime_diagnostics"]["primary_status"] == (
        "same_operation_locator_refetch"
    )


@pytest.mark.asyncio
async def test_failed_same_operation_locator_refetch_retains_bounded_status() -> None:
    url = "https://pta.agri.ee/pet-food-rules"
    primary = FakePrimary({"search_performed": True})
    searx = FakeSearx(discovery(status="empty"))

    async def failed_fetch(_url: str) -> dict:
        raise OSError("publisher temporarily unavailable")

    runner = ResilientResearchRunner(primary, searxng=searx, fetcher=failed_fetch)
    result = await runner.search(
        server_query(
            allowed_hosts=["pta.agri.ee"],
            fallback_candidates=[{"url": url, "title": "PTA rules"}],
        )
    )

    assert primary.queries == []
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == (
        "same_operation_locator_refetch"
    )
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "direct_fetch_error"
    )


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
async def test_transient_primary_official_url_is_refetched_as_locator_only() -> None:
    official_url = "https://eur-lex.europa.eu/eli/reg/2005/183/oj/eng"
    rejected_url = "https://marketing.example.org/pet-food-summary"
    exact = "Feed business operators shall comply with the applicable hygiene rules."
    publisher_text = f"Preamble. {exact} Annex."
    primary_result = transient("retry_exhausted")
    primary_result.update(
        {
            "text": (
                "Untrusted provider prose must not become evidence. Sources: "
                f"{rejected_url}, https://127.0.0.1/private, and {official_url}."
            ),
            "claims": [],
            "sources": [],
        }
    )
    fetched: list[str] = []
    extractor = ExactExtractor(exact)

    def classify(url: str, _title: str) -> set[str]:
        return (
            {"grounded_web", "government", "primary_law"}
            if url == official_url
            else {"grounded_web"}
        )

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, publisher_text)

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=FakeSearx(discovery(status="empty")),
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=classify,
    ).search(server_query(accepted_source_types=["primary_law"]))

    assert fetched == [official_url]
    assert len(extractor.requests) == 1
    assert [item.text for item in extractor.requests[0].documents] == [publisher_text]
    assert primary_result["text"] not in result["text"]
    expected_hash = hashlib.sha256(publisher_text.encode("utf-8")).hexdigest()
    assert result["provider_response_hash"] == expected_hash
    assert result["sources"][0]["citation_metadata"]["content_sha256"] == (
        expected_hash
    )
    assert result["sources"][0]["url"] == official_url
    claim = result["claims"][0]
    assert result["text"].encode("utf-8")[
        claim["segment_start"] : claim["segment_end"]
    ].decode("utf-8") == exact
    assert claim["provider_response_hash"] == expected_hash
    assert claim["source_urls"] == [official_url]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("accepted_source_types", "allowed_hosts", "classified_types"),
    [
        (["primary_law"], [], {"grounded_web"}),
        (["government"], ["other.gov.ee"], {"government"}),
    ],
)
async def test_transient_primary_locator_obeys_type_and_host_gates(
    accepted_source_types: list[str],
    allowed_hosts: list[str],
    classified_types: set[str],
) -> None:
    url = "https://pta.agri.ee/pet-food-rules"
    primary_result = transient("retry_exhausted")
    primary_result["text"] = f"Possible locator: {url}"
    fetched: list[str] = []

    async def fetch(candidate_url: str) -> dict:
        fetched.append(candidate_url)
        return document(candidate_url, "Publisher text")

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=FakeSearx(discovery(status="empty")),
        fetcher=fetch,
        extractor=EmptyExtractor(),
        source_type_classifier=lambda _url, _title: classified_types,
    ).search(
        server_query(
            accepted_source_types=accepted_source_types,
            allowed_hosts=allowed_hosts,
        )
    )

    assert fetched == []
    assert result["search_performed"] is False
    assert result.get("claims", []) == []
    assert result.get("sources", []) == []
    assert result["runtime_diagnostics"]["fallback"][
        "rejected_candidate_count"
    ] == 1


@pytest.mark.asyncio
async def test_transient_primary_response_uses_at_most_three_locator_urls() -> None:
    urls = [f"https://law-{index}.gov.ee/feed/rules" for index in range(5)]
    primary_result = transient("retry_exhausted")
    primary_result["text"] = "\n".join(urls)
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, f"Publisher bytes for {url}")

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=FakeSearx(discovery(status="empty")),
        fetcher=fetch,
        extractor=EmptyExtractor(),
        source_type_classifier=lambda _url, _title: {"government", "primary_law"},
    ).search(server_query(accepted_source_types=["primary_law"]))

    assert fetched == urls[:3]
    fallback = result["runtime_diagnostics"]["fallback"]
    assert fallback["omitted_candidate_count"] == 2


@pytest.mark.asyncio
async def test_primary_response_prioritizes_authorities_before_locator_cap() -> None:
    generic_urls = [f"https://example-{index}.com/feed" for index in range(3)]
    official_url = "https://eur-lex.europa.eu/eli/reg/2009/767/oj/eng"
    primary_result = {
        "search_performed": True,
        "provider": "gemini_google_search",
        "text": "\n".join([*generic_urls, official_url]),
        "claims": [],
        "sources": [],
    }

    def classify(url: str, _title: str) -> set[str]:
        if url == official_url:
            return {"grounded_web", "government", "primary_law"}
        return {"grounded_web"}

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=FakeSearx(discovery()),
        source_type_classifier=classify,
    ).search(
        server_query(accepted_source_types=["grounded_web", "primary_law"])
    )

    assert [row["url"] for row in result["same_operation_locators"]] == [
        official_url,
        *generic_urls[:2],
    ]


@pytest.mark.asyncio
async def test_mixed_primary_failure_falls_back_and_latches_open_circuit() -> None:
    mixed_failure = {
        "search_performed": False,
        "runtime_diagnostics": {
            "route": "gemini_google_search",
            "status": "retry_exhausted",
            "elapsed_ms": 41_669,
            "call_count": 3,
            "retry_count": 2,
        },
    }
    primary = FakePrimary(mixed_failure)
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(primary, searxng=searx)

    first = await runner.search(server_query())
    second = await runner.search(server_query())

    assert len(primary.queries) == 1
    assert len(searx.queries) == 2
    assert first["runtime_diagnostics"]["primary"] == {
        "route": "gemini_google_search",
        "status": "retry_exhausted",
        "elapsed_ms": 41_669,
        "call_count": 3,
        "retry_count": 2,
    }
    assert second["runtime_diagnostics"]["primary"] == {
        "route": "gemini_google_search",
        "status": "retry_exhausted",
        "elapsed_ms": 0,
        "call_count": 0,
        "retry_count": 0,
        "primary_skipped": True,
        "circuit_state": "open",
    }


@pytest.mark.asyncio
async def test_sync_only_discovery_is_rejected_without_starting_background_work() -> None:
    class SyncOnlySearx:
        def __init__(self) -> None:
            self.calls = 0

        def search_web_general(self, _query: str) -> dict:
            self.calls += 1
            return discovery()

    searx = SyncOnlySearx()
    runner = ResilientResearchRunner(FakePrimary(transient()), searxng=searx)

    result = await runner.search(server_query())

    assert searx.calls == 0
    assert result["runtime_diagnostics"]["fallback"]["status"] == "error"


@pytest.mark.asyncio
async def test_concurrent_transient_uses_one_primary_probe_and_zero_call_skips() -> None:
    class BlockingTransientPrimary(FakePrimary):
        def __init__(self) -> None:
            result = metered_transient()
            result["error"] = "sensitive provider detail"
            result["runtime_diagnostics"]["raw_error"] = "sensitive diagnostic"
            super().__init__(result)
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            await self.release.wait()
            return self.result

    primary = BlockingTransientPrimary()
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(primary, searxng=searx)

    searches = [
        asyncio.create_task(runner.search(server_query())) for _ in range(4)
    ]
    await primary.started.wait()
    await asyncio.sleep(0)
    assert len(primary.queries) == 1
    primary.release.set()
    results = await asyncio.gather(*searches)

    assert len(primary.queries) == 1
    assert len(searx.queries) == 4
    skipped = [
        result
        for result in results
        if result["runtime_diagnostics"]["primary"].get("primary_skipped") is True
    ]
    assert len(skipped) == 3
    for result in skipped:
        diagnostics = result["runtime_diagnostics"]
        assert diagnostics["primary"] == {
            "route": "gemini_google_search",
            "status": "deadline_exceeded",
            "elapsed_ms": 0,
            "call_count": 0,
            "retry_count": 0,
            "primary_skipped": True,
            "circuit_state": "open",
        }
        assert diagnostics["primary_provider_query_count"] == 0
        assert result["usage_metadata"] == {
            "inputTokens": 0,
            "outputTokens": 0,
            "totalTokens": 0,
        }
        assert "provider_queries" not in result
    actual = next(result for result in results if result not in skipped)
    assert actual["usage_metadata"] == {
        "inputTokens": 31,
        "outputTokens": 11,
        "totalTokens": 42,
    }
    assert actual["provider_queries"] == [
        "primary query one",
        "primary query two",
    ]
    serialized_skips = canonical_json(skipped)
    assert "sensitive provider detail" not in serialized_skips
    assert "sensitive diagnostic" not in serialized_skips


@pytest.mark.asyncio
async def test_cooldown_skips_then_reprobes_primary_at_exact_expiry() -> None:
    successful = {
        "search_performed": True,
        "text": "grounded after cooldown",
        "claims": [],
        "sources": [],
    }

    class SequencedPrimary(FakePrimary):
        async def search(self, query: str) -> dict:
            self.queries.append(query)
            return transient() if len(self.queries) == 1 else successful

    now = [100.0]
    primary = SequencedPrimary(transient())
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        primary_cooldown_seconds=10,
        monotonic_clock=lambda: now[0],
    )

    await runner.search(server_query())
    skipped = await runner.search(server_query())
    assert len(primary.queries) == 1
    assert skipped["runtime_diagnostics"]["primary"]["primary_skipped"] is True

    now[0] = 110.0
    reprobed = await runner.search(server_query())
    assert reprobed is successful
    assert len(primary.queries) == 2

    still_primary = await runner.search(server_query())
    assert still_primary is successful
    assert len(primary.queries) == 3


@pytest.mark.asyncio
async def test_successful_probe_never_shares_query_content_between_callers() -> None:
    class QueryPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__({})
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            if len(self.queries) == 1:
                self.started.set()
                await self.release.wait()
            return {
                "search_performed": True,
                "text": query,
                "claims": [],
                "sources": [],
            }

    primary = QueryPrimary()
    searx = FakeSearx(discovery())
    runner = ResilientResearchRunner(primary, searxng=searx)
    queries = ["canonical query a", "canonical query b", "canonical query c"]
    searches = [asyncio.create_task(runner.search(query)) for query in queries]
    await primary.started.wait()
    await asyncio.sleep(0)
    primary.release.set()

    results = await asyncio.gather(*searches)

    assert [result["text"] for result in results] == queries
    assert sorted(primary.queries) == sorted(queries)
    assert searx.queries == []


@pytest.mark.asyncio
async def test_nonretryable_failure_does_not_open_cooldown() -> None:
    primary = FakePrimary(transient("configuration_error"))
    searx = FakeSearx(discovery())
    runner = ResilientResearchRunner(primary, searxng=searx)

    first = await runner.search("first")
    second = await runner.search("second")

    assert first is primary.result
    assert second is primary.result
    assert primary.queries == ["first", "second"]
    assert searx.queries == []
    assert "primary_skipped" not in canonical_json([first, second])


@pytest.mark.asyncio
async def test_cancelled_gate_owner_cancels_call_and_waiter_reprobes() -> None:
    class CancellablePrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(transient())
            self.started = asyncio.Event()
            self.release = asyncio.Event()
            self.cancelled = 0

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                self.cancelled += 1
                raise
            return self.result

    primary = CancellablePrimary()
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(primary, searxng=searx)
    owner = asyncio.create_task(runner.search(server_query()))
    await primary.started.wait()
    waiter = asyncio.create_task(runner.search(server_query()))
    await asyncio.sleep(0)

    owner.cancel()
    with pytest.raises(asyncio.CancelledError):
        await owner
    assert primary.cancelled == 1
    primary.release.set()
    result = await waiter

    assert len(primary.queries) == 2
    assert "primary_skipped" not in result["runtime_diagnostics"]["primary"]
    await runner.search(server_query())
    assert len(primary.queries) == 2


@pytest.mark.asyncio
async def test_cancelled_gate_owner_without_waiter_leaves_no_orphan() -> None:
    class CancellablePrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(transient())
            self.started = asyncio.Event()
            self.release = asyncio.Event()
            self.cancelled = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise
            return self.result

    primary = CancellablePrimary()
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(primary, searxng=searx)
    search = asyncio.create_task(runner.search(server_query()))
    await primary.started.wait()

    search.cancel()
    with pytest.raises(asyncio.CancelledError):
        await search
    await primary.cancelled.wait()
    assert runner._active_searches == 0
    assert runner._primary_gate_in_flight is False

    primary.release.set()
    await runner.search(server_query())
    assert len(primary.queries) == 2


@pytest.mark.asyncio
async def test_double_cancellation_while_releasing_probe_gate_restores_invariants() -> None:
    class ReturningPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(transient())
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            await self.release.wait()
            return self.result

    primary = ReturningPrimary()
    runner = ResilientResearchRunner(
        primary,
        searxng=FakeSearx(discovery(status="empty", search_performed=False)),
    )
    release_started = asyncio.Event()
    original_release = runner._release_primary_gate

    async def observed_release() -> None:
        release_started.set()
        await original_release()

    runner._release_primary_gate = observed_release
    search = asyncio.create_task(runner.search(server_query()))
    await primary.started.wait()

    async with runner._primary_condition:
        primary.release.set()
        await asyncio.sleep(0)
        search.cancel()
        await release_started.wait()
        search.cancel()
        await asyncio.sleep(0)

    with pytest.raises(asyncio.CancelledError):
        await search
    assert runner._primary_gate_in_flight is False
    assert runner._active_searches == 0

    await runner.search(server_query())
    assert len(primary.queries) == 2
    await asyncio.wait_for(runner.close(), timeout=1)


@pytest.mark.asyncio
async def test_double_cancellation_while_leaving_search_restores_active_count() -> None:
    success = {
        "search_performed": True,
        "text": "grounded",
        "claims": [],
        "sources": [],
    }

    class ReturningPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(success)
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            await self.release.wait()
            return self.result

    primary = ReturningPrimary()
    runner = ResilientResearchRunner(primary)
    leave_started = asyncio.Event()
    original_leave = runner._leave_search

    async def observed_leave() -> None:
        leave_started.set()
        await original_leave()

    runner._leave_search = observed_leave
    search = asyncio.create_task(runner.search(server_query()))
    await primary.started.wait()

    async with runner._lifecycle_condition:
        primary.release.set()
        await leave_started.wait()
        search.cancel()
        await asyncio.sleep(0)
        search.cancel()
        await asyncio.sleep(0)

    with pytest.raises(asyncio.CancelledError):
        await search
    assert runner._active_searches == 0
    assert runner._primary_gate_in_flight is False
    await asyncio.wait_for(runner.close(), timeout=1)


@pytest.mark.asyncio
async def test_concurrent_close_waits_for_query_specific_followup_once() -> None:
    class FollowupPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__({})
            self.followup_started = asyncio.Event()
            self.followup_release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            if len(self.queries) > 1:
                self.followup_started.set()
                await self.followup_release.wait()
            return {
                "search_performed": True,
                "text": query,
                "claims": [],
                "sources": [],
            }

    primary = FollowupPrimary()
    searx = FakeSearx(discovery())
    runner = ResilientResearchRunner(primary, searxng=searx)
    await runner.search("availability gate")
    followup = asyncio.create_task(runner.search("query-specific followup"))
    await primary.followup_started.wait()

    first_close = asyncio.create_task(runner.close())
    second_close = asyncio.create_task(runner.close())
    await asyncio.sleep(0)
    assert not first_close.done()
    assert not second_close.done()
    with pytest.raises(RuntimeError, match="closed"):
        await runner.search("late query")

    primary.followup_release.set()
    assert (await followup)["text"] == "query-specific followup"
    await asyncio.gather(first_close, second_close)

    assert primary.closed == 1
    assert searx.closed == 1
    with pytest.raises(RuntimeError, match="closed"):
        await runner.search("after close")


@pytest.mark.asyncio
async def test_close_waits_for_fallback_before_closing_components() -> None:
    class BlockingSearx(FakeSearx):
        def __init__(self) -> None:
            super().__init__(discovery(status="empty", search_performed=False))
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search_web_general(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            await self.release.wait()
            return self.result

    primary = FakePrimary(transient())
    searx = BlockingSearx()
    runner = ResilientResearchRunner(primary, searxng=searx)
    search = asyncio.create_task(runner.search(server_query()))
    await searx.started.wait()

    close = asyncio.create_task(runner.close())
    await asyncio.sleep(0)
    assert not close.done()
    assert primary.closed == 0
    assert searx.closed == 0

    searx.release.set()
    assert (await search)["search_performed"] is True
    await close
    assert primary.closed == 1
    assert searx.closed == 1


@pytest.mark.asyncio
async def test_double_cancelled_close_while_waiting_restores_open_state() -> None:
    success = {
        "search_performed": True,
        "text": "grounded",
        "claims": [],
        "sources": [],
    }

    class BlockingPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(success)
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            self.started.set()
            await self.release.wait()
            return self.result

    primary = BlockingPrimary()
    runner = ResilientResearchRunner(primary)
    search = asyncio.create_task(runner.search(server_query()))
    await primary.started.wait()
    close = asyncio.create_task(runner.close())
    while not runner._closing:
        await asyncio.sleep(0)

    async with runner._lifecycle_condition:
        close.cancel()
        await asyncio.sleep(0)
        close.cancel()
        await asyncio.sleep(0)

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(close, timeout=1)
    assert runner._closing is False
    assert runner._closed is False

    primary.release.set()
    assert (await search)["text"] == "grounded"
    await asyncio.wait_for(runner.close(), timeout=1)
    assert runner._closed is True
    assert primary.closed == 1


@pytest.mark.asyncio
async def test_double_cancelled_close_during_finalization_marks_runner_closed() -> None:
    class BlockingClosePrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__({"search_performed": True})
            self.close_started = asyncio.Event()
            self.close_cancelled = 0

        async def close(self) -> None:
            self.close_started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.close_cancelled += 1
                raise

    primary = BlockingClosePrimary()
    runner = ResilientResearchRunner(primary)
    mark_started = asyncio.Event()
    original_mark_closed = runner._mark_closed_after_shutdown

    async def observed_mark_closed() -> None:
        mark_started.set()
        await original_mark_closed()

    runner._mark_closed_after_shutdown = observed_mark_closed
    close = asyncio.create_task(runner.close())
    await primary.close_started.wait()

    async with runner._lifecycle_condition:
        close.cancel()
        await mark_started.wait()
        close.cancel()
        await asyncio.sleep(0)

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(close, timeout=1)
    assert primary.close_cancelled == 1
    assert runner._closing is False
    assert runner._closed is True
    with pytest.raises(RuntimeError, match="closed"):
        await runner.search(server_query())
    await asyncio.wait_for(runner.close(), timeout=1)


@pytest.mark.asyncio
async def test_query_transient_latches_cooldown_despite_concurrent_success() -> None:
    success = {
        "search_performed": True,
        "text": "grounded",
        "claims": [],
        "sources": [],
    }

    class OutOfOrderPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(success)
            self.older_started = asyncio.Event()
            self.older_release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            call = len(self.queries)
            if call == 2:
                self.older_started.set()
                await self.older_release.wait()
                return transient()
            return {**success, "text": query}

    primary = OutOfOrderPrimary()
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    now = [0.0]
    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        primary_cooldown_seconds=10,
        monotonic_clock=lambda: now[0],
    )
    await runner.search("availability gate")
    older = asyncio.create_task(runner.search(server_query()))
    await primary.older_started.wait()

    newer = await runner.search("newer query")
    assert newer["text"] == "newer query"
    primary.older_release.set()
    older_result = await older
    assert older_result["provider"] == "searxng_direct_fetch"

    after = await runner.search(server_query())
    assert after["provider"] == "searxng_direct_fetch"
    assert after["runtime_diagnostics"]["primary"]["primary_skipped"] is True
    assert len(primary.queries) == 3

    now[0] = 10.0
    recovered = await runner.search("post-cooldown gate")
    assert recovered["text"] == "post-cooldown gate"
    assert len(primary.queries) == 4
    assert "primary_skipped" not in canonical_json(recovered)


@pytest.mark.asyncio
async def test_pre_transient_success_cannot_reopen_after_cooldown_expiry() -> None:
    success = {
        "search_performed": True,
        "text": "grounded",
        "claims": [],
        "sources": [],
    }

    class CompletionOrderPrimary(FakePrimary):
        def __init__(self) -> None:
            super().__init__(success)
            self.stale_started = asyncio.Event()
            self.stale_release = asyncio.Event()
            self.recovery_started = asyncio.Event()
            self.recovery_release = asyncio.Event()

        async def search(self, query: str) -> dict:
            self.queries.append(query)
            call = len(self.queries)
            if call == 2:
                self.stale_started.set()
                await self.stale_release.wait()
                return {**success, "text": query}
            if call == 3:
                return transient()
            if call == 4:
                self.recovery_started.set()
                await self.recovery_release.wait()
            return {**success, "text": query}

    primary = CompletionOrderPrimary()
    now = [0.0]
    runner = ResilientResearchRunner(
        primary,
        searxng=FakeSearx(discovery(status="empty", search_performed=False)),
        primary_cooldown_seconds=10,
        primary_healthy_seconds=5,
        monotonic_clock=lambda: now[0],
    )
    await runner.search("availability gate")
    stale = asyncio.create_task(runner.search("pre-transient success"))
    await primary.stale_started.wait()

    transient_result = await runner.search("transient query")
    assert transient_result["runtime_diagnostics"]["fallback"]["status"] == (
        "invalid_canonical_input"
    )
    now[0] = 10.0
    primary.stale_release.set()
    assert (await stale)["text"] == "pre-transient success"

    recovery = asyncio.create_task(runner.search("recovery gate"))
    await primary.recovery_started.wait()
    follower = asyncio.create_task(runner.search("post-recovery query"))
    await asyncio.sleep(0)
    assert primary.queries == [
        "availability gate",
        "pre-transient success",
        "transient query",
        "recovery gate",
    ]

    primary.recovery_release.set()
    recovered, followed = await asyncio.gather(recovery, follower)
    assert recovered["text"] == "recovery gate"
    assert followed["text"] == "post-recovery query"
    assert len(primary.queries) == 5


@pytest.mark.parametrize("cooldown", [0, -1, float("nan"), float("inf"), 901])
def test_primary_cooldown_is_bounded(cooldown: float) -> None:
    with pytest.raises(ValueError, match="primary_cooldown_seconds"):
        ResilientResearchRunner(
            FakePrimary(transient()),
            primary_cooldown_seconds=cooldown,
        )


@pytest.mark.parametrize(
    ("argument", "value"),
    [
        ("primary_healthy_seconds", 0),
        ("primary_healthy_seconds", 31),
        ("fallback_phase_seconds", 0),
        ("fallback_phase_seconds", 61),
    ],
)
def test_primary_and_fallback_phase_limits_are_bounded(
    argument: str, value: float
) -> None:
    with pytest.raises(ValueError, match=argument):
        ResilientResearchRunner(
            FakePrimary(transient()),
            **{argument: value},
        )


def test_virtual_max_cardinality_fallback_fits_research_deadline() -> None:
    research_deadline = 510.0
    primary_failure_at = 45.0
    cooldown_until = primary_failure_at + 450.0
    virtual_seconds = primary_failure_at
    maximum_requirements = 12
    concurrency = 4
    waves_per_pass = -(-maximum_requirements // concurrency)
    for _pass_number in range(2):
        for _wave in range(waves_per_pass):
            virtual_seconds += WORKFLOW_V2_FALLBACK_PHASE_SECONDS

    assert virtual_seconds == 405.0
    assert virtual_seconds <= 450.0
    assert virtual_seconds < research_deadline
    assert virtual_seconds < cooldown_until

    all_success_virtual_seconds = 0.0
    for _pass_number in range(2):
        for _wave in range(waves_per_pass):
            all_success_virtual_seconds += 70.0
    assert all_success_virtual_seconds == 420.0
    assert all_success_virtual_seconds < 450.0

    # A healthy gate may be followed by one query-specific transient before
    # the circuit latches. Provider failure at 45s plus the 60s fallback leaves
    # five bounded fallback waves: 70 + 105 + 5*60 = 475.
    mixed_transient_seconds = 70.0 + (45.0 + 60.0) + (5 * 60.0)
    assert mixed_transient_seconds == 475.0
    assert mixed_transient_seconds < research_deadline

    # Conservatively allow the transient to surface only after the complete
    # 70s primary envelope; the 510s research cap still leaves ten seconds.
    mixed_postprocessing_transient_seconds = 70.0 + (70.0 + 60.0) + (5 * 60.0)
    assert mixed_postprocessing_transient_seconds == 500.0
    assert mixed_postprocessing_transient_seconds < research_deadline


@pytest.mark.asyncio
async def test_discovery_is_cancelled_by_aggregate_fallback_deadline() -> None:
    class BlockingSearx(FakeSearx):
        def __init__(self) -> None:
            super().__init__(discovery())
            self.cancelled = asyncio.Event()

        async def search_web_general(self, query: str) -> dict:
            self.queries.append(query)
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise

    searx = BlockingSearx()
    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx,
        fallback_phase_seconds=0.01,
    )

    result = await asyncio.wait_for(runner.search(server_query()), timeout=1)

    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "fallback_deadline_exceeded"
    )
    await searx.cancelled.wait()


@pytest.mark.asyncio
async def test_parallel_fetches_are_cancelled_by_aggregate_fallback_deadline() -> None:
    url = "https://example.gov.ee/rules"
    cancelled = asyncio.Event()

    async def blocking_fetch(_url: str) -> dict:
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=blocking_fetch,
        fallback_phase_seconds=0.01,
    )

    result = await asyncio.wait_for(runner.search(server_query()), timeout=1)

    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "fallback_deadline_exceeded"
    )
    await cancelled.wait()


@pytest.mark.asyncio
async def test_extractor_is_cancelled_by_aggregate_fallback_deadline() -> None:
    url = "https://example.gov.ee/rules"

    class BlockingExtractor:
        def __init__(self) -> None:
            self.cancelled = asyncio.Event()

        async def extract(self, _request: ExactSpanExtractionRequest):
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise

    async def fetch(_url: str) -> dict:
        return document(url, "A direct authoritative requirement is present.")

    extractor = BlockingExtractor()
    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=extractor,
        fallback_phase_seconds=0.01,
    )

    result = await asyncio.wait_for(runner.search(server_query()), timeout=1)

    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "fallback_deadline_exceeded"
    )
    await extractor.cancelled.wait()


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
    assert "requirement:" not in discovery_query
    assert "source classes:" not in discovery_query
    assert "primary_law" not in discovery_query
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
async def test_operation_local_source_fills_remaining_slot_and_is_refetched() -> None:
    reused_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/"
    irrelevant_urls = [
        "https://irrelevant.example/a",
        "https://irrelevant.example/b",
    ]
    exact = "The mandatory label shall declare the analytical constituents."
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        if url == reused_url:
            return document(url, f"Preamble. {exact} Annex.")
        return document(url, "Unrelated publisher text.")

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": url, "title": "Irrelevant"} for url in irrelevant_urls
                ]
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(
        server_query(
            fallback_candidates=[{"url": reused_url, "title": "EUR-Lex"}]
        )
    )

    assert fetched == [*irrelevant_urls, reused_url]
    assert result["provider"] == "searxng_direct_fetch"
    assert result["sources"][0]["url"] == reused_url
    assert result["claims"][0]["text"] == exact
    assert result["runtime_diagnostics"]["candidate_count"] == 3


@pytest.mark.asyncio
async def test_ineligible_fresh_results_cannot_crow_reusable_authority() -> None:
    reused_url = "https://eur-lex.europa.eu/eli/reg/2009/767/oj/eng"
    generic_urls = [
        "https://generic.example.org/first",
        "https://generic.example.org/second",
        "https://generic.example.org/third",
    ]
    exact = "Feed materials may be marketed only if they are safe and genuine."
    classified: list[str] = []
    fetched: list[str] = []

    def classify(url: str, _title: str) -> set[str]:
        classified.append(url)
        return {"grounded_web"}

    async def fetch(url: str) -> dict:
        fetched.append(url)
        if url == reused_url:
            return document(url, f"Regulation. {exact} Annex.")
        return document(url, "Generic publisher text.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": url, "title": "Generic web result"}
                    for url in generic_urls
                ]
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_candidates=1,
        source_type_classifier=classify,
    ).search(
        server_query(
            accepted_source_types=["primary_law"],
            fallback_candidates=[{"url": reused_url, "title": "EUR-Lex"}],
        )
    )

    assert classified == generic_urls
    assert fetched == [reused_url]
    assert result["claims"][0]["text"] == exact
    assert result["runtime_diagnostics"]["candidate_count"] == 1
    assert result["runtime_diagnostics"]["rejected_candidate_count"] == 3


@pytest.mark.asyncio
async def test_source_type_filter_runs_before_fresh_candidate_limit() -> None:
    generic_urls = [
        "https://generic.example.org/first",
        "https://generic.example.org/second",
        "https://generic.example.org/third",
    ]
    statistics_url = "https://statistics.example.org/official-table"
    exact = "The official table reports this exact market statistic."
    fetched: list[str] = []

    def classify(url: str, _title: str) -> set[str]:
        if url == statistics_url:
            return {"grounded_web", "official_statistics"}
        return {"grounded_web"}

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, exact)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    *(
                        {"url": url, "title": "Generic web result"}
                        for url in generic_urls
                    ),
                    {"url": statistics_url, "title": "Official statistics"},
                ]
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_candidates=1,
        source_type_classifier=classify,
    ).search(server_query(accepted_source_types=["official_statistics"]))

    assert fetched == [statistics_url]
    assert result["sources"][0]["url"] == statistics_url
    assert result["runtime_diagnostics"]["rejected_candidate_count"] == 3


@pytest.mark.asyncio
async def test_specific_fresh_source_outranks_generic_grounded_web() -> None:
    generic_url = "https://generic.example.org/market-summary"
    statistics_url = "https://statistics.example.org/official-table"
    exact = "The official table reports this exact market statistic."
    fetched: list[str] = []

    def classify(url: str, _title: str) -> set[str]:
        if url == statistics_url:
            return {"grounded_web", "official_statistics"}
        return {"grounded_web"}

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, exact)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": generic_url, "title": "Generic market summary"},
                    {"url": statistics_url, "title": "Official statistics"},
                ]
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_candidates=1,
        source_type_classifier=classify,
    ).search(
        server_query(
            accepted_source_types=["grounded_web", "official_statistics"]
        )
    )

    assert fetched == [statistics_url]
    assert result["sources"][0]["url"] == statistics_url


@pytest.mark.asyncio
async def test_grounded_web_keeps_generic_fresh_candidate_viable() -> None:
    url = "https://generic.example.org/market-summary"
    exact = "The publisher reports this exact market observation."
    fetched: list[str] = []

    async def fetch(candidate_url: str) -> dict:
        fetched.append(candidate_url)
        return document(candidate_url, exact)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Market summary"}])
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        source_type_classifier=lambda _url, _title: {"grounded_web"},
    ).search(server_query(accepted_source_types=["grounded_web"]))

    assert fetched == [url]
    assert result["claims"][0]["text"] == exact


@pytest.mark.asyncio
@pytest.mark.parametrize("accepted_source_type", ["industry", "official_statistics"])
async def test_generic_fresh_result_preserves_specific_market_evidence_gap(
    accepted_source_type: str,
) -> None:
    url = "https://generic.example.org/market-summary"
    fetched: list[str] = []

    async def fetch(candidate_url: str) -> dict:
        fetched.append(candidate_url)
        return document(candidate_url, "Must not be fetched.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(sources=[{"url": url, "title": "Market summary"}])
        ),
        fetcher=fetch,
        extractor=EmptyExtractor(),
        source_type_classifier=lambda _url, _title: {"grounded_web"},
    ).search(server_query(accepted_source_types=[accepted_source_type]))

    assert fetched == []
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "discovery_rows_incomplete"
    )
    assert result["runtime_diagnostics"]["fallback"][
        "rejected_candidate_count"
    ] == 1


@pytest.mark.asyncio
async def test_operation_local_duplicate_keeps_title_and_merges_fresh_snippet() -> None:
    reused_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/"
    exact = "The exact authoritative provision appears only in the later section."
    raw_text = "Unrelated publisher preface. " * 80 + exact + " Annex."
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, raw_text)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[{"url": reused_url, "title": "Fresh search title"}],
                claims=[{"text": exact, "source_urls": [reused_url]}],
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_document_characters=180,
    ).search(
        server_query(
            fallback_candidates=[{"url": reused_url, "title": "Accepted title"}]
        )
    )

    assert fetched == [reused_url]
    assert result["sources"][0]["title"] == "Accepted title"
    assert result["claims"][0]["text"] == exact
    assert result["text"].encode("utf-8")[
        result["claims"][0]["segment_start"] : result["claims"][0]["segment_end"]
    ].decode("utf-8") == exact
    assert result["provider_response_hash"] == hashlib.sha256(
        result["text"].encode("utf-8")
    ).hexdigest()


@pytest.mark.asyncio
async def test_current_labeling_discovery_precedes_unrelated_reused_legal_locators() -> None:
    reused_urls = [
        "https://eur-lex.europa.eu/eli/reg/2005/183/oj/eng",
        "https://eur-lex.europa.eu/eli/reg/2009/1069/oj/eng",
    ]
    current_urls = [
        "https://pta.agri.ee/general-feed-guidance",
        "https://pta.agri.ee/pet-food-labeling",
    ]
    exact = "Pet food labels must identify the feed material and responsible operator."
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        if url == current_urls[1]:
            return document(url, exact)
        return document(url, "Authoritative but unrelated publisher text.")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {"url": current_urls[0], "title": "General feed guidance"},
                    {"url": current_urls[1], "title": "Exact labeling rules"},
                ],
                claims=[{"text": exact, "source_urls": [current_urls[1]]}],
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(
        server_query(
            fallback_candidates=[
                {"url": url, "title": f"Reused {index}"}
                for index, url in enumerate(reused_urls)
            ]
        )
    )

    assert fetched == [*current_urls, reused_urls[0]]
    assert result["sources"][0]["url"] == current_urls[1]
    assert result["claims"][0]["text"] == exact
    assert result["runtime_diagnostics"]["candidate_count"] == 3
    assert result["runtime_diagnostics"]["omitted_candidate_count"] == 1


@pytest.mark.asyncio
async def test_operation_local_source_survives_unavailable_searx() -> None:
    reused_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/"
    exact = "The label shall declare analytical constituents."

    async def fetch(url: str) -> dict:
        return document(url, f"Preamble. {exact} Annex.")

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(
            discovery(status="unavailable", search_performed=False)
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(
        server_query(
            fallback_candidates=[{"url": reused_url, "title": "EUR-Lex"}]
        )
    )

    assert result["search_performed"] is True
    assert result["sources"][0]["url"] == reused_url
    diagnostics = result["runtime_diagnostics"]
    assert diagnostics["status"] == "ok"
    assert diagnostics["discovery"]["status"] == "unavailable"


@pytest.mark.asyncio
async def test_requirement_terms_locate_reused_evidence_beyond_prefix() -> None:
    reused_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/"
    exact = "Mandatory labeling includes declarations of analytical constituents."
    raw_text = "Unrelated preface. " * 100 + exact + " Final annex."
    extractor = ExactExtractor(exact)

    async def fetch(url: str) -> dict:
        assert url == reused_url
        return document(url, raw_text)

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery(status="empty", search_performed=False)),
        fetcher=fetch,
        extractor=extractor,
        maximum_document_characters=180,
    ).search(
        server_query(
            fallback_candidates=[{"url": reused_url, "title": "EUR-Lex"}]
        )
    )

    assert result["claims"][0]["text"] == exact
    assert exact in result["text"]
    assert not result["text"].startswith("Unrelated preface")
    selected_text = extractor.requests[0].documents[0].text
    assert len(selected_text) == 180


@pytest.mark.asyncio
async def test_requirement_window_avoids_repetitive_early_locator_decoy() -> None:
    reused_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/"
    locator_terms = "labeling rules assessing Estonia market entry "
    exact = (
        "When assessing Estonia pet-food market entry, applicable labeling rules "
        "require disclosure."
    )
    raw_text = (
        "Table of contents. "
        + locator_terms * 40
        + "x" * 500
        + exact
        + "y" * 500
        + "Appendix index. "
        + locator_terms * 40
    )
    outcomes: list[tuple[str, str, list[dict]]] = []

    async def fetch(url: str) -> dict:
        assert url == reused_url
        return document(url, raw_text)

    for _ in range(2):
        result = await ResilientResearchRunner(
            FakePrimary(transient()),
            searxng=FakeSearx(discovery(status="empty", search_performed=False)),
            fetcher=fetch,
            extractor=ExactExtractor(exact),
            maximum_document_characters=220,
            monotonic_clock=lambda: 0.0,
        ).search(
            server_query(
                fallback_candidates=[{"url": reused_url, "title": "EUR-Lex"}]
            )
        )
        outcomes.append(
            (result["text"], result["provider_response_hash"], result["claims"])
        )

    assert outcomes[0] == outcomes[1]
    selected_text, selected_hash, claims = outcomes[0]
    assert exact in selected_text
    assert claims[0]["text"] == exact
    assert selected_hash == hashlib.sha256(selected_text.encode("utf-8")).hexdigest()


@pytest.mark.asyncio
async def test_invalid_operation_local_source_fails_canonical_input_closed() -> None:
    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery()),
        fetcher=None,  # type: ignore[arg-type]
    ).search(
        server_query(
            fallback_candidates=[
                {"url": "https://evil.example/source", "title": "Wrong host"}
            ],
            allowed_hosts=["eur-lex.europa.eu"],
        )
    )

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "invalid_canonical_input"
    )


@pytest.mark.asyncio
async def test_explicit_eu_regulation_outranks_degraded_search_results() -> None:
    regulation_767 = "https://eur-lex.europa.eu/eli/reg/2009/767/oj/eng"
    irrelevant = [
        "https://irrelevant.example/bmi",
        "https://irrelevant.example/boeing",
        "https://irrelevant.example/dictionary",
    ]
    exact = "Feed materials may be marketed only if they are safe and genuine."
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        text = exact if url == regulation_767 else "Unrelated search result."
        return document(url, f"Publisher heading. {text} Publisher footer.")

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(
            discovery(
                sources=[{"url": url, "title": "Irrelevant"} for url in irrelevant]
            )
        ),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
    ).search(
        server_query(
            description=(
                "Verify Regulation (EC) No 767/2009 for the accepted planning "
                "requirement."
            )
        )
    )

    assert fetched == [regulation_767, irrelevant[0], irrelevant[1]]
    assert result["search_performed"] is True
    assert result["provider"] == "searxng_direct_fetch"
    assert result["sources"][0]["url"] == regulation_767
    assert result["claims"][0]["text"] == exact
    assert result["provider_response_hash"] == hashlib.sha256(
        result["text"].encode("utf-8")
    ).hexdigest()


@pytest.mark.asyncio
async def test_multiple_named_eu_regulations_fail_canonical_input_closed() -> None:
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, "must not be fetched")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery()),
        fetcher=fetch,
        extractor=EmptyExtractor(),
    ).search(
        server_query(
            description=(
                "Verify Regulation (EC) No 767/2009 and Regulation (EC) "
                "No 183/2005."
            )
        )
    )

    assert fetched == []
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["fallback"]["status"] == (
        "invalid_canonical_input"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("accepted_source_types", "allowed_hosts"),
    [
        (["government"], []),
        (["government", "primary_law"], ["riigiteataja.ee"]),
    ],
)
async def test_explicit_eu_locator_preserves_source_type_and_host_gates(
    accepted_source_types: list[str], allowed_hosts: list[str]
) -> None:
    fetched: list[str] = []

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, "must not be fetched")

    result = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery(status="error", search_performed=False)),
        fetcher=fetch,
        extractor=EmptyExtractor(),
    ).search(
        server_query(
            description="Verify Regulation (EC) No 767/2009.",
            accepted_source_types=accepted_source_types,
            allowed_hosts=allowed_hosts,
        )
    )

    assert fetched == []
    assert result["search_performed"] is False


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
async def test_real_adapter_preserves_late_authority_for_runner_filtering() -> None:
    authority_url = "https://eur-lex.europa.eu/legal-content/EN/TXT/"
    generic_urls = [
        f"https://generic-{index}.example.org/source" for index in range(12)
    ]
    exact = "Feed business operators shall comply with the applicable hygiene rules."
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            *(
                {
                    "url": url,
                    "title": "Generic web result",
                    "content": "Unrelated discovery snippet.",
                }
                for url in generic_urls
            ),
            {
                "url": authority_url,
                "title": "EUR-Lex",
                "content": "Official primary-law locator.",
            },
        ]
    }
    response.status_code = 200
    response.content = b"late authority discovery response"

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ):
        discovery_result = SearxngSearchService(
            "https://search.example.run.app"
        ).search_web_general("bounded accepted-scope query")

    fetched: list[str] = []

    def classify(url: str, _title: str) -> set[str]:
        return (
            {"grounded_web", "government", "primary_law"}
            if url == authority_url
            else {"grounded_web"}
        )

    async def fetch(url: str) -> dict:
        fetched.append(url)
        return document(url, f"Preamble. {exact} Annex.")

    result = await ResilientResearchRunner(
        FakePrimary(transient("retry_exhausted")),
        searxng=FakeSearx(discovery_result),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        maximum_candidates=1,
        source_type_classifier=classify,
    ).search(server_query(accepted_source_types=["primary_law"]))

    assert len(discovery_result["sources"]) == 13
    assert fetched == [authority_url]
    assert result["sources"][0]["url"] == authority_url
    assert result["claims"][0]["text"] == exact
    assert result["runtime_diagnostics"]["candidate_count"] == 1
    assert result["runtime_diagnostics"]["rejected_candidate_count"] == 12


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
        monotonic_clock=lambda: 0.0,
    ).search(server_query())
    result_two = await ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=searx_with_sources(rows),
        fetcher=fetch,
        extractor=ExactExtractor(exact),
        monotonic_clock=lambda: 0.0,
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
                "evidenceRole": "grounded_claim",
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
    assert "MATERIAL LEGAL REQUIREMENT" in discovery_query
    assert "ONLY FOR ESTONIA MARKET ENTRY" in discovery_query
    assert "site:host-00.example.ee" in discovery_query
    assert "anchor-00-" in discovery_query
    assert "geography-00-" in discovery_query
    assert "requirement:" not in discovery_query
    assert "source classes:" not in discovery_query


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
    now = [50.0]

    class FailedExtractor:
        async def extract(self, _request: ExactSpanExtractionRequest):
            now[0] += 0.3
            raise RuntimeError("raw provider failure must not escape")

    class TimedSearx(FakeSearx):
        async def search_web_general(self, query: str) -> dict:
            now[0] += 0.1
            return await super().search_web_general(query)

    async def fetch(_url: str) -> dict:
        now[0] += 0.2
        return document(url, "A fetched source document.")

    primary_result = metered_transient()
    primary_result["runtime_diagnostics"]["elapsed_ms"] = 17
    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=TimedSearx(
            discovery(sources=[{"url": url, "title": "Official rules"}])
        ),
        fetcher=fetch,
        extractor=FailedExtractor(),
        monotonic_clock=lambda: now[0],
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
    assert fallback["elapsed_ms"] == 600
    assert result["runtime_diagnostics"]["elapsed_ms"] == 617
    assert fallback["extractor"] == {"input_tokens": 0, "output_tokens": 0}
    assert "raw provider failure" not in canonical_json(result)


@pytest.mark.asyncio
async def test_empty_extraction_preserves_usage_and_only_finite_diagnostics() -> None:
    url = "https://example.gov.ee/rules"
    now = [100.0]
    primary_result = transient()
    primary_result["runtime_diagnostics"].update(
        {
            "call_count": 10**100,
            "retry_count": -12,
            "elapsed_ms": 17,
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

    class TimedSearx(FakeSearx):
        async def search_web_general(self, query: str) -> dict:
            now[0] += 0.1
            return await super().search_web_general(query)

    class TimedEmptyExtractor(EmptyExtractor):
        async def extract(self, request: ExactSpanExtractionRequest):
            now[0] += 0.3
            return await super().extract(request)

    async def fetch(_url: str) -> dict:
        now[0] += 0.2
        return document(url, "The source contains no applicable supporting passage.")

    result = await ResilientResearchRunner(
        FakePrimary(primary_result),
        searxng=TimedSearx(discovery_result),
        fetcher=fetch,
        extractor=TimedEmptyExtractor(input_tokens=29, output_tokens=7),
        monotonic_clock=lambda: now[0],
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
    assert diagnostics["primary"]["elapsed_ms"] == 17
    assert diagnostics["fallback_elapsed_ms"] == 600
    assert diagnostics["elapsed_ms"] == 617
    assert diagnostics["primary"]["call_count"] == 100
    assert diagnostics["discovery"]["call_count"] == 1
    assert diagnostics["discovery"]["status"] == "ok"
    assert diagnostics["extractor"] == {"input_tokens": 29, "output_tokens": 7}
    serialized = canonical_json(diagnostics)
    assert "secret_error" not in serialized
    assert "raw_response" not in serialized
