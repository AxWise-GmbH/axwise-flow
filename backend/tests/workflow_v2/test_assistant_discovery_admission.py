"""Exact acceptance regression; synthetic boundaries, real production callbacks.

Run from the chosen AxWise source checkout with its existing Python runtime and
PYTHONPATH set to that checkout. This file does not load dotenv, invoke gcloud,
call providers, fetch pages, or mutate application sources. Network and DNS are
blocked before application imports; pytest's ancestor conftest must be excluded.
"""
from __future__ import annotations

import copy
import hashlib
import json
import socket
import time
from collections import Counter
from types import SimpleNamespace

import pytest


pytestmark = pytest.mark.contract


FIXTURE = (
    "Synthetic fallback-budget-release acceptance: research only the official n8n documentation "
    "and produce a concise source-linked checklist for a provider-free JSON webhook "
    "that trims a text field and returns HTTP 400 for missing or non-string input. "
    "Use public documentation and synthetic examples only. Distinguish documented "
    "behaviour from implementation suggestions and unverified assumptions. Do not "
    "create or edit workflows, connect providers, change schedules, deploy anything or send messages."
)
FIXTURE_SHA256 = "d454f5220a1721862174230a07a7a8352c776e4757d3175397a00afd67d48b16"
OFFICIAL = "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
EXACT = "The synthetic documentation fixture accepts a JSON object."
DISCOVERY_REJECTION_FIELDS = (
    "discovery_canonical_url_rejected_count",
    "discovery_allowed_host_rejected_count",
    "discovery_owner_root_rejected_count",
    "discovery_source_type_rejected_count",
)
REJECTION_FIELDS = (*DISCOVERY_REJECTION_FIELDS, "primary_locator_rejected_count")


@pytest.fixture
def runtime(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("offline_network_dns_or_dotenv_read_forbidden")

    for name in ("getaddrinfo", "gethostbyname", "gethostbyname_ex", "create_connection"):
        monkeypatch.setattr(socket, name, forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    try:
        import dotenv
    except ImportError:
        pass
    else:
        monkeypatch.setattr(dotenv, "load_dotenv", lambda *_args, **_kwargs: False)
        monkeypatch.setattr(dotenv, "dotenv_values", forbidden)

    # Delay application imports until the no-network/no-dotenv fixture is active.
    import httpx
    from backend.domain.workflow_v2.contracts import AssistantTurnInputV1, canonical_json
    from backend.services.generative.searxng_search_service import SearxngSearchService
    from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
    from backend.services.workflow_v2.assistant.publication import (
        assistant_source_url_allowed,
        source_policy_from_query,
    )
    from backend.services.workflow_v2.assistant.service import AssistantTurnService
    from backend.services.workflow_v2.assistant.source_policy import AssistantSourcePolicy
    from backend.services.workflow_v2.cognitive.sources import (
        _classify_source_types,
        _usage_from_search,
    )
    from backend.services.workflow_v2.cognitive_executor import _operation_metrics
    from backend.services.workflow_v2.exact_span_extractor import (
        DraftCodePointSpan,
        ExactSpanSelectionDraft,
        assemble_exact_span_result,
    )
    from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
    from backend.services.workflow_v2.research_diagnostics import sanitize_research_evidence_diagnostics
    from backend.services.workflow_v2.resilient_research_runner import (
        ResilientResearchRunner,
        _DISCOVERY_SECTION_BUDGETS,
        _MAX_DISCOVERY_QUERY_CHARACTERS,
        _bounded_query_term,
        _candidate_rows,
        _candidate_rows_with_rejections,
        _fallback_context,
    )

    return SimpleNamespace(**locals())


def request(runtime):
    return runtime.AssistantTurnInputV1.model_validate(
        {
            "type": "AssistantTurnV1",
            "responseMode": "one_shot",
            "message": FIXTURE,
            "conversation": [],
        }
    )


def test_exact_fixture_policy_query_and_production_classifier(runtime):
    assert len(FIXTURE) == 498
    assert hashlib.sha256(FIXTURE.encode("utf-8")).hexdigest() == FIXTURE_SHA256
    query = runtime.assistant_turn_query(request(runtime))
    context = runtime._fallback_context(query)
    policy = runtime.source_policy_from_query(query)
    assert context is not None and context.query_complete is True
    assert context.allowed_hosts == frozenset({"docs.n8n.io"})
    assert context.accepted_source_types == ("grounded_web",)
    assert context.requirement["description"] == FIXTURE
    assert policy.mode == "restricted"
    assert policy.source_kind == "official_documentation"
    assert policy.basis == "reviewed_bindings"
    assert policy.resolved is True
    assert policy.roots == ("https://docs.n8n.io",)
    assert json.loads(query.splitlines()[0])["message"] == FIXTURE
    assert context.discovery_query == " ".join(
        [
            "site:docs.n8n.io",
            FIXTURE,
        ]
    )
    assert len(context.discovery_query) == 515
    previous = " ".join(
        [FIXTURE, "Answering the current bounded one-shot Assistant request.",
         "site:docs.n8n.io", FIXTURE[:200]]
    )
    assert Counter(context.discovery_query.split()) <= Counter(previous.split())
    assert len(context.discovery_query) < len(previous)
    assert runtime._classify_source_types(OFFICIAL, "Untrusted title") == {"grounded_web"}
    assert runtime.assistant_source_url_allowed(query, OFFICIAL)
    for outside in (
        "https://community.n8n.io/t/synthetic-example",
        "https://n8n.io/workflows/synthetic-example",
        "https://sub.docs.n8n.io/synthetic",
        "https://docs.n8n.io.evil.example/synthetic",
        "http://docs.n8n.io/synthetic",
        "https://docs.n8n.io/../synthetic",
        "https://docs.n8n.io/%252e%252e/synthetic",
    ):
        assert not runtime.assistant_source_url_allowed(query, outside)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case, outside_count, include_official, expected_rejected, primary_rejected",
    [
        ("ten_outside", 10, False, 10, 0),
        ("official_rank_ten", 9, True, 9, 0),
        ("one_official", 0, True, 0, 0),
        ("primary_locator_separate", 10, False, 10, 1),
    ],
)
async def test_exact498_real_admission_and_projection(
    runtime, case, outside_count, include_official, expected_rejected, primary_rejected
):
    primary_queries = []
    discovery_queries = []
    discovery_ledgers = []
    fetched = []
    extraction_requests = []
    captured = []

    rows = [
        {
            "url": f"https://community.n8n.io/t/synthetic-{index}",
            "title": "Synthetic outside result",
            "content": "Synthetic discovery snippet, not evidence.",
        }
        for index in range(outside_count)
    ]
    if include_official:
        rows.append({"url": OFFICIAL, "title": "Webhook", "content": "Synthetic locator only."})

    class Primary:
        async def search(self, query):
            primary_queries.append(query)
            raw = {
                "search_performed": False,
                "runtime_diagnostics": {
                    "route": "gemini_search",
                    "status": "response_processing_error",
                    "call_count": 3,
                },
            }
            if primary_rejected:
                raw.update(
                    provider="gemini_google_search",
                    error="MissingGroundingEvidence",
                    _grounding_locator_urls=["https://outside.example/synthetic-primary"],
                )
            return raw

        async def close(self):
            pass

    class Discovery:
        async def search_web_general_async(self, query):
            discovery_queries.append(query)
            response = runtime.httpx.Response(
                200,
                json={"results": rows, "unresponsive_engines": []},
                request=runtime.httpx.Request("GET", "https://synthetic-search.example/search"),
            )
            raw = runtime.SearxngSearchService._result_from_response(
                response, query, started_at=time.monotonic()
            )
            # Provider-authored counters must never replace code observations.
            raw["runtime_diagnostics"].update(
                {field: 999 for field in REJECTION_FIELDS}
            )
            raw["runtime_diagnostics"]["evidence"] = {
                "stage": "admission", **{field: 999 for field in REJECTION_FIELDS},
                "query": "PRIVATE_SYNTHETIC_CANARY",
            }
            discovery_ledgers.append((raw, copy.deepcopy(raw)))
            return raw

        async def close(self):
            pass

    async def fetch(url):
        fetched.append(url)
        assert url == OFFICIAL
        return {
            "final_url": url,
            "text": "Synthetic preamble. " + EXACT + " Synthetic appendix.",
            "retrieved_at": "2026-09-09T00:00:00Z",
        }

    class Extractor:
        async def extract(self, extraction_request):
            extraction_requests.append(extraction_request)
            selected = next(doc for doc in extraction_request.documents if EXACT in doc.text)
            start = selected.text.index(EXACT)
            return runtime.assemble_exact_span_result(
                extraction_request,
                runtime.ExactSpanSelectionDraft(
                    document_id=selected.document_id,
                    spans=[runtime.DraftCodePointSpan(start=start, end=start + len(EXACT))],
                ),
                input_tokens=0,
                output_tokens=0,
            )

        async def close(self):
            pass

    runner = runtime.ResilientResearchRunner(
        Primary(),
        searxng=Discovery(),
        fetcher=fetch,
        extractor=Extractor(),
        source_type_classifier=runtime._classify_source_types,
        source_url_validator=runtime.assistant_source_url_allowed,
        discovery_seconds=20.0,
    )

    class Capture:
        async def search(self, query):
            raw = await runner.search(query)
            captured.append(raw)
            return raw

    service = runtime.AssistantTurnService(
        grounded_runner=Capture(),
        conversational_runner=None,
        source_type_classifier=runtime._classify_source_types,
        usage_reader=runtime._usage_from_search,
        metrics_factory=runtime._operation_metrics,
    )
    input_value = request(runtime)
    query = runtime.assistant_turn_query(input_value)
    try:
        if not include_official:
            with pytest.raises(runtime.CognitiveExecutionFailure, match="^AXWISE_ASSISTANT_EMPTY_RESPONSE$") as caught:
                await service.execute(input_value)
            assert caught.value.evidence_diagnostics == captured[0]["runtime_diagnostics"]["evidence"]
        else:
            result = await service.execute(input_value)
            assert len(result.response.facts) == 1
            assert result.response.facts[0].statement == EXACT
            assert result.response.facts[0].source_urls == [OFFICIAL]
            assert "bounded evidence fallback, not a complete synthesis" in result.response.markdown
    finally:
        await runner.close()

    assert primary_queries == [query]
    assert len(discovery_queries) == 1
    assert discovery_queries[0] == runtime._fallback_context(query).discovery_query
    assert fetched == ([OFFICIAL] if include_official else [])
    assert len(extraction_requests) == int(include_official)
    assert all(raw == original for raw, original in discovery_ledgers)
    evidence = captured[0]["runtime_diagnostics"]["evidence"]
    assert evidence == {
        "stage": "extraction" if include_official else "admission",
        "query_complete": True,
        "discovery_result_count": len(rows),
        "discovery_invalid_result_count": 0,
        "candidate_count": int(include_official),
        "fetched_count": int(include_official),
        "fetch_error_count": 0,
        "validation_incomplete_count": 0,
        "rejected_candidate_count": expected_rejected + primary_rejected,
        "malformed_candidate_count": 0,
        "omitted_candidate_count": 0,
        "claim_count": int(include_official),
        "discovery_canonical_url_rejected_count": 0,
        "discovery_allowed_host_rejected_count": expected_rejected,
        "discovery_owner_root_rejected_count": 0,
        "discovery_source_type_rejected_count": 0,
        "primary_locator_rejected_count": primary_rejected,
    }
    # No provider-query receipt was supplied; that fact remains absent/unknown.
    assert "primary_provider_query_count" not in evidence
    assert "PRIVATE_SYNTHETIC_CANARY" not in json.dumps(evidence)


@pytest.mark.parametrize(
    "hosts, oversized",
    [
        ((), False),
        (("docs.publisher.example",), False),
        (("z.publisher.example", "a.publisher.example"), False),
        (tuple(f"host-{index:02d}-{'x' * 55}.example" for index in range(20)), True),
    ],
)
def test_publisher_first_preserves_sections_budgets_and_completeness(runtime, hosts, oversized):
    budgets = runtime._DISCOVERY_SECTION_BUDGETS
    assert budgets == {
        "requirement": 560, "applicability": 300, "source classes": 160,
        "publishers": 650, "topics": 200, "geography": 80,
    }
    assert runtime._MAX_DISCOVERY_QUERY_CHARACTERS == 2_000
    description = "R" * 700 if oversized else "Verify the exact synthetic requirement."
    applies = "A" * 400 if oversized else "Only within the synthetic applicability gate."
    anchors = ["T" * 300] if oversized else ["topic B", "topic A"]
    geography = ["G" * 160] if oversized else ["Region B", "Region A"]
    requirement = {
        "id": "synthetic-order-regression", "description": description,
        "appliesWhen": applies, "acceptedSourceTypes": ["grounded_web", "government"],
        "allowedSourceHosts": list(hosts),
    }
    payload = {
        "acceptedScopeSemantics": {
            "topicAnchors": [{"value": value} for value in anchors],
            "geography": geography,
        },
        "requirement": requirement,
    }
    context = runtime._fallback_context("server-owned instruction\n" + runtime.canonical_json(payload))
    assert context is not None
    first = [
        runtime._bounded_query_term(description, maximum=budgets["requirement"]),
        runtime._bounded_query_term(applies, maximum=budgets["applicability"]),
    ]
    publisher = [runtime._bounded_query_term(
        " ".join(f"site:{host}" for host in sorted(hosts)), maximum=budgets["publishers"]
    )] if hosts else []
    tail = [
        runtime._bounded_query_term(" ".join(sorted(anchors)), maximum=budgets["topics"]),
        runtime._bounded_query_term(" ".join(sorted(geography)), maximum=budgets["geography"]),
    ]
    previous_sections = first + publisher + tail
    previous = " ".join(text for text, _complete in previous_sections)
    expected = " ".join(text for text, _complete in publisher + first + tail)
    assert context.discovery_query == expected
    assert Counter(expected.split()) == Counter(previous.split())
    assert len(expected) == len(previous) <= 2_000
    assert context.query_complete is all(complete for _text, complete in previous_sections)
    assert context.query_complete is (not oversized)
    assert context.allowed_hosts == frozenset(hosts)
    assert set(context.accepted_source_types) == {"grounded_web", "government"}
    assert context.requirement == requirement
    assert context.applies_when == applies
    assert " OR " not in context.discovery_query


def test_rejection_predicates_preserve_legacy_tuple_and_count_at_original_gates(runtime):
    policy = runtime.AssistantSourcePolicy(
        mode="restricted", source_kind="specified_sources", resolved=True,
        restriction="Use only these synthetic user-selected paths.", basis="user_references",
        roots=("https://docs.n8n.io/approved", "https://www.gov.uk/guidance"),
    )
    def row(url):
        return {"url": url, "title": "PRIVATE_SYNTHETIC_TITLE"}

    raw = {
        "sources": [
            row("http://docs.n8n.io/approved/insecure"),
            *[row("https://outside.example/synthetic")] * 2,
            *[row("https://docs.n8n.io/not-approved")] * 2,
            *[row("https://docs.n8n.io/approved/not-government")] * 3,
            *[row("https://www.gov.uk/guidance/synthetic-a")] * 2,
            row("https://www.gov.uk/guidance/synthetic-b"),
            "PRIVATE_SYNTHETIC_MALFORMED_ROW",
        ],
        "runtime_diagnostics": {field: 999 for field in REJECTION_FIELDS},
    }
    original = copy.deepcopy(raw)
    kwargs = {
        "allowed_hosts": frozenset(policy.allowed_hosts),
        "accepted_source_types": frozenset({"government"}),
        "source_type_classifier": runtime._classify_source_types,
        "maximum": 1, "url_validator": policy.allows_url,
    }
    legacy = runtime._candidate_rows(raw, **kwargs)
    detailed, counts = runtime._candidate_rows_with_rejections(raw, **kwargs)
    assert type(legacy) is tuple and len(legacy) == 4
    assert legacy == detailed
    selected, rejected, malformed, omitted = legacy
    assert [item.canonical_url for item in selected] == ["https://www.gov.uk/guidance/synthetic-a"]
    assert (rejected, malformed, omitted) == (6, 1, 1)
    assert counts == {
        "discovery_canonical_url_rejected_count": 1,
        "discovery_allowed_host_rejected_count": 2,
        "discovery_owner_root_rejected_count": 2,
        # Three duplicate rows reach the classifier once, after URL dedup.
        "discovery_source_type_rejected_count": 1,
    }
    assert sum(counts.values()) == rejected
    assert raw == original
    assert all(type(key) is str and type(value) is int for key, value in counts.items())
    assert "PRIVATE" not in json.dumps(counts)
    assert "https://" not in json.dumps(counts)


@pytest.mark.parametrize("raw", [{}, {"sources": None}, {"sources": "PRIVATE"}])
def test_unobserved_source_list_does_not_invent_predicate_zeroes(runtime, raw):
    result, counts = runtime._candidate_rows_with_rejections(
        raw, allowed_hosts=frozenset(), accepted_source_types=frozenset({"grounded_web"}),
        source_type_classifier=runtime._classify_source_types, maximum=3,
    )
    assert result == ([], 0, 1, 0)
    assert counts == {}


def test_observed_empty_source_list_has_known_zero_predicate_rejections(runtime):
    result, counts = runtime._candidate_rows_with_rejections(
        {"sources": []}, allowed_hosts=frozenset(),
        accepted_source_types=frozenset({"grounded_web"}),
        source_type_classifier=runtime._classify_source_types, maximum=3,
    )
    assert result == ([], 0, 0, 0)
    assert counts == dict.fromkeys(DISCOVERY_REJECTION_FIELDS, 0)


@pytest.mark.asyncio
async def test_discovery_failure_has_no_unobserved_admission_rejection_counters(runtime):
    class Primary:
        async def search(self, _query):
            return {"search_performed": False, "runtime_diagnostics": {"status": "unavailable"}}

    class Discovery:
        async def search_web_general_async(self, _query):
            return {
                "search_performed": False, "sources": [],
                "runtime_diagnostics": {
                    "status": "unavailable", **dict.fromkeys(REJECTION_FIELDS, 999),
                },
            }

    runner = runtime.ResilientResearchRunner(
        Primary(), searxng=Discovery(), fetcher=None,
        source_type_classifier=runtime._classify_source_types,
        source_url_validator=runtime.assistant_source_url_allowed,
    )
    try:
        raw = await runner.search(runtime.assistant_turn_query(request(runtime)))
    finally:
        await runner.close()
    evidence = raw["runtime_diagnostics"]["evidence"]
    assert evidence["stage"] == "discovery"
    assert not set(REJECTION_FIELDS).intersection(evidence)


@pytest.mark.parametrize("field", REJECTION_FIELDS)
@pytest.mark.parametrize("value", [0, 1, 10_000])
def test_new_operator_counters_preserve_exact_known_integers(runtime, field, value):
    raw = {
        "stage": "admission", field: value,
        "query": "PRIVATE", "title": "PRIVATE", "snippet": "PRIVATE",
        "url": "https://private.example/token?secret=PRIVATE", "hash": "PRIVATE",
    }
    expected = {"stage": "admission", field: value}
    assert runtime.sanitize_research_evidence_diagnostics(raw) == expected
    error = runtime.CognitiveExecutionFailure(
        "AXWISE_ASSISTANT_EMPTY_RESPONSE", retryable=True,
        diagnostics={"route": "gemini_google_search", "status": "unavailable", "evidence": raw},
    )
    assert error.evidence_diagnostics == expected
    assert error.diagnostics == {"route": "gemini_google_search", "status": "unavailable"}
    assert "PRIVATE" not in json.dumps(error.evidence_diagnostics)


@pytest.mark.parametrize("field", REJECTION_FIELDS)
@pytest.mark.parametrize("value", [True, False, None, -1, 10_001, 1.0, "1"])
def test_new_operator_counters_do_not_coerce_or_invent_values(runtime, field, value):
    assert runtime.sanitize_research_evidence_diagnostics(
        {"stage": "admission", field: value}
    ) == {"stage": "admission"}


@pytest.mark.parametrize("field", REJECTION_FIELDS)
def test_new_operator_counter_names_do_not_compare_hostile_nonstring_keys(runtime, field):
    class CollisionKey:
        def __hash__(self):
            return hash(field)

        def __eq__(self, _other):
            raise AssertionError("private_key_comparison_forbidden")

    assert runtime.sanitize_research_evidence_diagnostics(
        {"stage": "admission", CollisionKey(): "PRIVATE"}
    ) is None
