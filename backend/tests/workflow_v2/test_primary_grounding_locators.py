"""Unsupported Google sources are locators only, never publishable evidence."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import socket
from types import SimpleNamespace

import pytest

from backend.services.generative.gemini_search_service import (
    GEMINI_SEARCH_MAX_ATTEMPTS,
    GEMINI_SEARCH_MAX_GROUNDING_CHUNKS,
)
from backend.services.workflow_v2.assistant.answer_quality import (
    assistant_answer_defects,
    assistant_repair_query,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.publication import (
    assistant_parsed_response_defects,
    assistant_source_url_allowed,
    source_policy_from_query,
)
from backend.services.workflow_v2.cognitive.policy import (
    _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS,
    _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS,
)
from backend.services.workflow_v2.cognitive.sources import _classify_source_types
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.resilient_research_runner import (
    _MAX_REUSABLE_SOURCE_CANDIDATES,
    _fallback_context,
    _primary_response_locator_rows,
    ResilientResearchRunner,
)
from backend.tests.scripts.test_gemini_search_runtime import (
    AsyncSequenceModels,
    FakeClock,
    ProviderStatusError,
    _async_service,
    _response,
)
from backend.tests.workflow_v2.test_assistant_fallback_prompt_budget import (
    LIVE_FIXTURE,
    OFFICIAL,
    OUTSIDE,
    request,
)
from backend.tests.workflow_v2.test_assistant_service import (
    metrics_factory,
    usage_reader,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    EmptyExtractor,
    ExactExtractor,
    FakePrimary,
    FakeSearx,
    discovery,
    document,
)


pytestmark = pytest.mark.contract
FIELD = "_grounding_locator_urls"
PROVIDER_PROSE = "Unsupported provider prose must never enter an evidence artifact."
PROVIDER_TITLE = "UNTRUSTED_PROVIDER_TITLE"
EXACT = "This documentation fixture accepts a JSON object."
PUBLISHER_TEXT = f"Fresh publisher snapshot. {EXACT} End of fixture."
WRAPPER = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/fixture"


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("Locator regression attempted real network access")

    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)


def sdk_response(urls, *, supported=False, prose=PROVIDER_PROSE):
    response = _response(prose)
    metadata = response.candidates[0].grounding_metadata
    metadata.grounding_chunks = [
        SimpleNamespace(web=SimpleNamespace(uri=url, title=PROVIDER_TITLE))
        for url in urls
    ]
    if not supported:
        metadata.grounding_supports = []
    return response


def primary_for(response, *, retry_first=False, publication=True):
    outcomes = [ProviderStatusError(504, "synthetic timeout")] if retry_first else []
    models = AsyncSequenceModels([*outcomes, response])
    clock = FakeClock()
    provider = _async_service(models, clock)
    provider._search_operation_seconds = _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS
    provider._search_attempt_seconds = _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS
    if publication:
        provider._response_validator = assistant_answer_defects
        provider._repair_query_builder = assistant_repair_query
        provider._parsed_response_validator = assistant_parsed_response_defects

    class Primary:
        def __init__(self):
            self.queries = []
            self.raw = None

        async def search(self, query):
            self.queries.append(query)
            self.raw = await provider.search_web_general_async(query)
            return self.raw

    return SimpleNamespace(
        primary=Primary(), provider=provider, models=models, clock=clock
    )


def failed_primary(urls):
    return {
        "text": "",
        "sources": [],
        "claims": [],
        "provider": "gemini_google_search",
        "search_performed": False,
        "error": "MissingGroundingEvidence",
        "runtime_diagnostics": {"status": "response_processing_error"},
        FIELD: urls,
    }


def admitted(raw, *, query=None, **overrides):
    query = query or assistant_turn_query(request())
    context = _fallback_context(query)
    assert context is not None
    options = {
        "allowed_hosts": context.allowed_hosts,
        "accepted_source_types": frozenset(context.accepted_source_types),
        "source_type_classifier": _classify_source_types,
        "maximum": _MAX_REUSABLE_SOURCE_CANDIDATES,
        "url_validator": lambda url: assistant_source_url_allowed(query, url),
    }
    return _primary_response_locator_rows(raw, **{**options, **overrides})


def assert_unpublished(raw):
    assert raw["search_performed"] is False
    assert raw["text"] == "" and raw["sources"] == [] and raw["claims"] == []
    assert raw["error"] == "MissingGroundingEvidence"


@pytest.mark.asyncio
async def test_missing_support_retains_only_bounded_normalized_urls(caplog):
    urls = [f"https://docs.n8n.io/fixture-{index}" for index in range(12)]
    fixture = primary_for(sdk_response(urls, prose=f"{PROVIDER_PROSE} {OUTSIDE}"))
    raw = await fixture.primary.search(assistant_turn_query(request()))

    assert_unpublished(raw)
    assert GEMINI_SEARCH_MAX_GROUNDING_CHUNKS == 10
    assert raw[FIELD] == urls[:10]
    assert len(fixture.models.calls) == 1
    assert PROVIDER_PROSE not in json.dumps(raw)
    assert PROVIDER_TITLE not in json.dumps(raw)
    assert OUTSIDE not in json.dumps(raw)
    assert FIELD not in raw["runtime_diagnostics"]
    assert all(url not in caplog.text for url in urls)
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_ASSISTANT_EMPTY_RESPONSE"
    ):
        project_assistant_result(
            raw,
            response_mode="one_shot",
            source_type_classifier=_classify_source_types,
            usage_reader=usage_reader,
            metrics_factory=metrics_factory,
            source_policy=source_policy_from_query(assistant_turn_query(request())),
        )


@pytest.mark.asyncio
async def test_successful_grounded_output_has_no_new_locator_channel():
    fixture = primary_for(
        sdk_response([OFFICIAL], supported=True, prose=EXACT), publication=False
    )
    raw = await fixture.primary.search("Bounded fixture")

    assert raw["search_performed"] is True
    assert raw["text"] == EXACT and raw["claims"][0]["text"] == EXACT
    assert [source["url"] for source in raw["sources"]] == [OFFICIAL]
    assert FIELD not in raw


@pytest.mark.asyncio
async def test_prose_only_url_without_grounding_chunk_is_not_preserved():
    response = sdk_response([], prose=f"{PROVIDER_PROSE} {OFFICIAL}")
    response.candidates[0].grounding_metadata = None
    fixture = primary_for(response)
    raw = await fixture.primary.search(assistant_turn_query(request()))

    assert_unpublished(raw)
    assert FIELD not in raw
    assert admitted(raw) == ([], 0, 0, 0)


@pytest.mark.asyncio
async def test_producer_deduplicates_and_refuses_noncanonical_private_and_wrapper_urls():
    urls = [
        OFFICIAL,
        OFFICIAL,
        WRAPPER,
        "http://docs.n8n.io/",
        "https://127.0.0.1/a",
        "https://DOCS.n8n.io/a",
        "https://docs.n8n.io/a#fragment",
        None,
    ]
    fixture = primary_for(sdk_response(urls))

    async def unresolved(_url):
        return None

    fixture.provider._grounding_redirect_async_resolver = unresolved
    raw = await fixture.primary.search(assistant_turn_query(request()))

    assert_unpublished(raw)
    assert raw[FIELD] == [OFFICIAL]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "outside_prefix,retry_first", [(False, False), (True, False), (False, True)]
)
async def test_real_normalization_recovers_only_after_fresh_fetch_and_exact_span(
    outside_prefix,
    retry_first,
    caplog,
):
    urls = (
        [f"https://outside.example/fixture-{index}" for index in range(4)]
        if outside_prefix
        else []
    )
    fixture = primary_for(sdk_response([*urls, OFFICIAL]), retry_first=retry_first)
    query = assistant_turn_query(request())
    searx = FakeSearx(discovery(sources=[{"url": OUTSIDE, "title": PROVIDER_TITLE}]))
    fetched = []

    async def fetch(url):
        fetched.append(url)
        return document(url, PUBLISHER_TEXT)

    extractor = ExactExtractor(EXACT, input_tokens=7, output_tokens=3)
    runner = ResilientResearchRunner(
        fixture.primary,
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=_classify_source_types,
        source_url_validator=assistant_source_url_allowed,
    )
    raw = await runner.search(query)

    assert_unpublished(fixture.primary.raw)
    assert fixture.primary.raw[FIELD] == [*urls, OFFICIAL]
    assert fetched == [OFFICIAL] and len(extractor.requests) == 1
    assert extractor.requests[0].documents[0].text == PUBLISHER_TEXT
    assert extractor.requests[0].documents[0].title == "docs.n8n.io"
    assert [claim["text"] for claim in raw["claims"]] == [EXACT]
    assert [source["url"] for source in raw["sources"]] == [OFFICIAL]
    assert (
        raw["provider_response_hash"]
        == hashlib.sha256(PUBLISHER_TEXT.encode()).hexdigest()
    )
    assert raw["runtime_diagnostics"]["fallback_used"] is True
    assert FIELD not in raw
    assert PROVIDER_PROSE not in json.dumps(raw) and PROVIDER_TITLE not in json.dumps(
        raw
    )
    assert OFFICIAL not in caplog.text and OUTSIDE not in caplog.text
    assert fixture.primary.queries == [query] and len(searx.queries) == 1
    assert len(fixture.models.calls) == 1 + int(retry_first)
    assert fixture.clock.sleeps == ([1.0] if retry_first else [])
    assert fixture.provider._search_max_attempts == GEMINI_SEARCH_MAX_ATTEMPTS == 3
    assert runner.maximum_candidates == _MAX_REUSABLE_SOURCE_CANDIDATES == 3
    assert _fallback_context(query).query_complete is True
    assert LIVE_FIXTURE in searx.queries[0] and len(searx.queries[0]) == 772
    assert all(call["contents"] == query for call in fixture.models.calls)
    assert all(
        call["config"].http_options.retry_options.attempts == 1
        for call in fixture.models.calls
    )
    assert all(
        call["config"].http_options.timeout
        == _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS * 1000
        for call in fixture.models.calls
    )
    projected = project_assistant_result(
        raw,
        response_mode="one_shot",
        source_type_classifier=_classify_source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
        source_policy=source_policy_from_query(query),
    )
    assert projected.response.facts[0].statement == EXACT
    assert projected.response.facts[0].source_urls == [OFFICIAL]


@pytest.mark.asyncio
@pytest.mark.parametrize("resolved", [OFFICIAL, OUTSIDE, None])
async def test_google_wrapper_requires_resolved_publisher_and_owner_admission(resolved):
    fixture = primary_for(sdk_response([WRAPPER]))
    resolved_calls = []

    async def resolve(url):
        resolved_calls.append(url)
        return resolved

    fixture.provider._grounding_redirect_async_resolver = resolve
    raw = await fixture.primary.search(assistant_turn_query(request()))
    candidates, rejected, _malformed, _omitted = admitted(raw)

    assert_unpublished(raw)
    assert resolved_calls == [WRAPPER] and len(fixture.models.calls) == 1
    assert WRAPPER not in raw.get(FIELD, [])
    assert [item.canonical_url for item in candidates] == (
        [OFFICIAL] if resolved == OFFICIAL else []
    )
    assert rejected == (1 if resolved == OUTSIDE else 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case", ["outside_only", "prose_only", "wrapper", "missing_authority"]
)
async def test_unadmitted_or_incomplete_primary_response_never_starts_a_fetch(case):
    urls = {
        "outside_only": [OUTSIDE],
        "prose_only": [],
        "wrapper": [WRAPPER],
        "missing_authority": [OFFICIAL],
    }[case]
    fixture = primary_for(sdk_response(urls, prose=f"{PROVIDER_PROSE} {OFFICIAL}"))

    async def unresolved(_url):
        return None

    fixture.provider._grounding_redirect_async_resolver = unresolved
    fetched = []

    async def fetch(url):
        fetched.append(url)
        return document(url, PUBLISHER_TEXT)

    searx = FakeSearx(discovery(sources=[{"url": OUTSIDE, "title": PROVIDER_TITLE}]))
    extractor = ExactExtractor(EXACT)
    query = assistant_turn_query(request())
    if case == "missing_authority":
        query = query.splitlines()[0]
    raw = await ResilientResearchRunner(
        fixture.primary,
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=_classify_source_types,
        source_url_validator=assistant_source_url_allowed,
    ).search(query)

    assert_unpublished(raw)
    assert fetched == extractor.requests == []
    assert len(fixture.models.calls) == 1
    assert len(searx.queries) == (0 if case == "missing_authority" else 1)
    assert raw["runtime_diagnostics"]["fallback"]["status"] == (
        "invalid_canonical_input"
        if case == "missing_authority"
        else "discovery_rows_incomplete"
    )


@pytest.mark.asyncio
async def test_ten_grounding_locators_do_not_expand_the_shared_three_fetch_budget():
    urls = [f"https://docs.n8n.io/fixture-{index}" for index in range(10)]
    fixture = primary_for(sdk_response(urls))
    searx = FakeSearx(discovery(sources=[{"url": OFFICIAL, "title": PROVIDER_TITLE}]))
    fetched = []

    async def fetch(url):
        fetched.append(url)
        return document(url, PUBLISHER_TEXT)

    extractor = ExactExtractor(EXACT)
    raw = await ResilientResearchRunner(
        fixture.primary,
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=_classify_source_types,
        source_url_validator=assistant_source_url_allowed,
    ).search(assistant_turn_query(request()))

    assert fixture.primary.raw[FIELD] == urls
    assert fetched == urls[:3]
    assert (
        len(fixture.models.calls) == len(searx.queries) == len(extractor.requests) == 1
    )
    assert len(extractor.requests[0].documents) == 3
    assert raw["runtime_diagnostics"]["candidate_count"] == 3
    assert raw["runtime_diagnostics"]["omitted_candidate_count"] >= 7
    assert [claim["text"] for claim in raw["claims"]] == [EXACT]


@pytest.mark.parametrize(
    "payload", [None, OFFICIAL, {"url": OFFICIAL}, (OFFICIAL,), [OFFICIAL] * 11]
)
def test_unknown_or_oversized_channel_shape_cannot_be_truncated_into_valid_locators(
    payload,
):
    assert admitted(failed_primary(payload)) == ([], 0, 1, 0)


@pytest.mark.parametrize(
    "changed",
    [
        {"provider": "unknown"},
        {"provider": None},
        {"search_performed": True},
        {"error": "UnknownFailure"},
        {"error": None},
    ],
)
def test_channel_is_accepted_only_in_the_explicit_failed_normalizer_shape(changed):
    raw = {**failed_primary([OFFICIAL]), **changed}
    assert admitted(raw) == ([], 0, 1, 0)


@pytest.mark.parametrize(
    "url",
    [
        "",
        " http://docs.n8n.io/",
        "https://127.0.0.1/a",
        "https://localhost/a",
        "https://docs.n8n.io:443/a",
        "https://docs.n8n.io/a#fragment",
        WRAPPER,
        "https://grounding-api-redirect.googleusercontent.com/fixture",
        OUTSIDE,
        "https://other.docs.n8n.io/a",
        "https://docs.n8n.io.evil.example/a",
        "https://docs.n8n.io/%2e%2e/outside",
        "https://docs.n8n.io/" + "a" * 4000,
    ],
)
def test_consumer_revalidates_canonical_host_path_and_wrapper_admission(url):
    assert admitted(failed_primary([url])) == ([], 1, 0, 0)


def test_malformed_items_do_not_acquire_authority_and_valid_items_are_url_only():
    raw = failed_primary([None, {"url": OFFICIAL, "title": EXACT}, 7, OFFICIAL])
    original = copy.deepcopy(raw)
    candidates, rejected, malformed, omitted = admitted(raw)

    assert raw == original
    assert rejected == omitted == 0 and malformed == 3
    assert [(item.canonical_url, item.title, item.snippets) for item in candidates] == [
        (OFFICIAL, "docs.n8n.io", ())
    ]
    assert admitted(failed_primary([OFFICIAL]), source_type_classifier=None)[0] == []
    assert (
        admitted(
            failed_primary([OFFICIAL]), accepted_source_types=frozenset({"primary_law"})
        )[0]
        == []
    )


def test_grounding_and_existing_prose_locators_share_dedup_ranking_and_one_cap():
    generic = [f"https://example.org/{index}" for index in range(4)]
    authority = [f"https://agency.gov/{index}" for index in range(3)]
    raw = failed_primary([*generic[:3], *authority[:2]])
    raw["text"] = " ".join([generic[0], authority[2], generic[3]])
    candidates, rejected, malformed, omitted = admitted(
        raw,
        allowed_hosts=frozenset(),
        url_validator=None,
        accepted_source_types=frozenset({"grounded_web", "government"}),
    )

    assert [item.canonical_url for item in candidates] == authority
    assert all(item.snippets == () for item in candidates)
    assert rejected == malformed == 0 and omitted == 4
    assert len(candidates) == _MAX_REUSABLE_SOURCE_CANDIDATES == 3


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,expected",
    [
        ("changed_final_host", "direct_fetch_incomplete"),
        ("empty_text", "direct_fetch_incomplete"),
        ("fetch_error", "direct_fetch_error"),
        ("no_evidence", "discovery_rows_incomplete"),
        ("forged_span", "extraction_span_not_unique"),
    ],
)
async def test_locator_never_substitutes_for_complete_fetched_exact_evidence(
    case, expected
):
    fixture = primary_for(sdk_response([OFFICIAL]))
    fetched = []

    async def fetch(url):
        fetched.append(url)
        if case == "fetch_error":
            raise ValueError("Synthetic incomplete fetch")
        return document(
            OUTSIDE if case == "changed_final_host" else url,
            "" if case == "empty_text" else PUBLISHER_TEXT,
        )

    class ForgedExtractor(ExactExtractor):
        async def extract(self, query):
            result = await super().extract(query)
            return result.model_copy(
                update={
                    "spans": [
                        result.spans[0].model_copy(
                            update={
                                "text": "Invented provider assertion not present in the publisher document.",
                            }
                        )
                    ]
                }
            )

    extractor = (
        EmptyExtractor()
        if case == "no_evidence"
        else (
            ForgedExtractor(EXACT) if case == "forged_span" else ExactExtractor(EXACT)
        )
    )
    searx = FakeSearx(discovery(sources=[{"url": OUTSIDE, "title": PROVIDER_TITLE}]))
    raw = await ResilientResearchRunner(
        fixture.primary,
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=_classify_source_types,
        source_url_validator=assistant_source_url_allowed,
    ).search(assistant_turn_query(request()))

    assert (
        fetched == [OFFICIAL] and len(fixture.models.calls) == len(searx.queries) == 1
    )
    assert_unpublished(raw)
    assert raw["runtime_diagnostics"]["fallback"]["status"] == expected
    if case in {"changed_final_host", "empty_text", "fetch_error"}:
        assert extractor.requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_locator_fetch_respects_existing_deadline_and_cancellation(cancel):
    fixture = primary_for(sdk_response([OFFICIAL]))
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def fetch(_url):
        started.set()
        try:
            await asyncio.Future()
        finally:
            stopped.set()

    extractor = ExactExtractor(EXACT)
    searx = FakeSearx(discovery(status="empty", search_performed=False))
    runner = ResilientResearchRunner(
        fixture.primary,
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        source_type_classifier=_classify_source_types,
        source_url_validator=assistant_source_url_allowed,
        fallback_phase_seconds=1 if cancel else 0.02,
    )
    task = asyncio.create_task(runner.search(assistant_turn_query(request())))
    await asyncio.wait_for(started.wait(), timeout=1)
    if cancel:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        raw = await asyncio.wait_for(task, timeout=1)
        assert_unpublished(raw)
        assert (
            raw["runtime_diagnostics"]["fallback"]["status"]
            == "fallback_deadline_exceeded"
        )
    assert stopped.is_set() and extractor.requests == []
    assert len(fixture.models.calls) == len(searx.queries) == 1
