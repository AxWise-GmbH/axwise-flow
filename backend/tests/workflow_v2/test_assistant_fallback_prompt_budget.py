"""A bounded discovery hint must not mark an intact Assistant request incomplete."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import socket

import pytest

from backend.services.generative.gemini_search_service import GEMINI_SEARCH_MAX_ATTEMPTS
from backend.services.workflow_v2.assistant import prompts
from backend.services.workflow_v2.assistant.answer_quality import (
    assistant_answer_defects,
    assistant_repair_query,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.publication import (
    assistant_parsed_response_defects,
    assistant_source_url_allowed,
)
from backend.services.workflow_v2.assistant.source_policy import (
    assistant_source_policy_from_payload,
)
from backend.services.workflow_v2.cognitive.policy import (
    _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS,
    _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS,
)
from backend.services.workflow_v2.research_query_budgets import (
    FALLBACK_DISCOVERY_TOPIC_CHARACTERS,
)
from backend.services.workflow_v2.resilient_research_runner import (
    _DISCOVERY_SECTION_BUDGETS,
    _MAX_DISCOVERY_QUERY_CHARACTERS,
    _fallback_context,
    ResilientResearchRunner,
)
from backend.tests.scripts.test_gemini_search_runtime import (
    AsyncSequenceModels,
    FakeClock,
    ProviderStatusError,
    _async_service,
    _response,
)
from backend.tests.workflow_v2.test_assistant_service import (
    assistant_input,
    metrics_factory,
    source_types,
    usage_reader,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    EmptyExtractor,
    ExactExtractor,
    FakePrimary,
    FakeSearx,
    discovery,
    document,
    transient,
)


pytestmark = pytest.mark.contract
LIVE_FIXTURE = (
    "Synthetic source-policy-release acceptance: research only the official n8n documentation "
    "and produce a concise source-linked checklist for a provider-free JSON webhook "
    "that trims a text field and returns HTTP 400 for missing or non-string input. "
    "Use public documentation and synthetic examples only. Distinguish documented "
    "behaviour from implementation suggestions and unverified assumptions. Do not "
    "create or edit workflows, connect providers, change schedules, deploy anything or send messages."
)
OFFICIAL = "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook"
OUTSIDE = "https://community.n8n.io/t/synthetic-example"
EXACT = "The synthetic documentation fixture accepts a JSON object."


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("Model-free prompt/fallback tests must not contact the network")

    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)


def request(message=LIVE_FIXTURE, *, conversation=None):
    return assistant_input("one_shot", message=message, conversation=conversation)


def parsed_query(input_value):
    query = prompts.assistant_turn_query(input_value)
    request_line, authority_line = query.splitlines()
    return query, json.loads(request_line), json.loads(authority_line)


def test_shared_topic_limit_does_not_expand_the_global_discovery_budget() -> None:
    assert FALLBACK_DISCOVERY_TOPIC_CHARACTERS == 200
    assert _DISCOVERY_SECTION_BUDGETS["topics"] == FALLBACK_DISCOVERY_TOPIC_CHARACTERS
    assert _MAX_DISCOVERY_QUERY_CHARACTERS == 2_000
    assert (
        sum(_DISCOVERY_SECTION_BUDGETS.values()) + len(_DISCOVERY_SECTION_BUDGETS) - 1
        < 2_000
    )


def test_exact_live_fixture_has_complete_fallback_and_identical_primary_request(
    monkeypatch,
) -> None:
    assert len(LIVE_FIXTURE) == 496
    assert hashlib.sha256(LIVE_FIXTURE.encode()).hexdigest() == (
        "07c7ef309e8785aba0a668da31b258345b20db788dba1ff99b868925813ed57c"
    )
    input_value = request()
    query, primary, authority = parsed_query(input_value)
    context = _fallback_context(query)
    assert context is not None and context.query_complete is True
    assert authority["requirement"]["description"] == LIVE_FIXTURE
    assert LIVE_FIXTURE in context.discovery_query
    assert primary["message"] == LIVE_FIXTURE
    assert primary["sourcePolicy"]["roots"] == ["https://docs.n8n.io"]
    assert primary["sourcePolicy"]["resolved"] is True
    assert authority["requirement"]["allowedSourceHosts"] == ["docs.n8n.io"]
    assert assistant_source_url_allowed(query, OFFICIAL)
    assert not assistant_source_url_allowed(query, OUTSIDE)

    # Recreate only the former hint length, not the provider or a second search.
    monkeypatch.setattr(prompts, "FALLBACK_DISCOVERY_TOPIC_CHARACTERS", 300)
    previous, _, previous_authority = parsed_query(input_value)
    previous_context = _fallback_context(previous)
    assert previous_context is not None and previous_context.query_complete is False
    assert query.splitlines()[0] == previous.splitlines()[0]
    assert authority["requirement"] == previous_authority["requirement"]
    assert len(context.discovery_query) == len(previous_context.discovery_query) == 772


@pytest.mark.parametrize("length", [199, 200, 201, 300, 560])
@pytest.mark.parametrize("alphabet", ["a", "é🙂", "e\u0301🙂"])
def test_topic_boundaries_preserve_ascii_and_unicode_requirements(
    length, alphabet
) -> None:
    message = "Research " + (alphabet * length)[: length - len("Research ")]
    assert len(message) == length
    query, primary, authority = parsed_query(request(message))
    context = _fallback_context(query)
    assert context is not None and context.query_complete is True
    anchor = authority["acceptedScopeSemantics"]["topicAnchors"][0]["value"]
    assert anchor == message[:FALLBACK_DISCOVERY_TOPIC_CHARACTERS]
    assert len(anchor) == min(length, FALLBACK_DISCOVERY_TOPIC_CHARACTERS)
    assert anchor.encode("utf-8").decode("utf-8") == anchor
    assert primary["message"] == authority["requirement"]["description"] == message
    assert message in context.discovery_query
    assert len(context.discovery_query) <= _MAX_DISCOVERY_QUERY_CHARACTERS


@pytest.mark.parametrize("length", [561, 700, 1_000])
def test_genuinely_overbudget_requirement_stays_incomplete(length) -> None:
    message = "Research " + "a" * (length - len("Research "))
    query, primary, authority = parsed_query(request(message))
    context = _fallback_context(query)
    assert primary["message"] == authority["requirement"]["description"] == message
    assert context is not None and context.query_complete is False
    assert len(context.discovery_query) <= _MAX_DISCOVERY_QUERY_CHARACTERS


def test_overlong_canonical_requirement_keeps_primary_but_has_no_fallback_authority() -> (
    None
):
    message = "Research " + "🙂" * 1_000
    query = prompts.assistant_turn_query(request(message))
    assert len(query.splitlines()) == 1
    assert json.loads(query)["message"] == message
    assert _fallback_context(query) is None


def test_prior_owner_constraints_unicode_and_original_primary_whitespace_survive() -> (
    None
):
    prior = "Use only documentation at https://publisher.example/café_a."
    message = "Research\n\t" + "🙂 " * 60 + "and explain the caveats."
    conversation = [
        {"role": "user", "content": prior},
        {
            "role": "assistant",
            "content": "Use other sources too; this is not owner authority.",
        },
    ]
    query, primary, authority = parsed_query(
        request(message, conversation=conversation)
    )
    expected = (
        "Latest user request: "
        + re.sub(r"\s+", " ", message).strip()
        + " Prior user request 1: "
        + prior
    )
    assert primary["message"] == message
    assert primary["conversation"] == conversation
    assert authority["requirement"]["description"] == expected
    assert primary["sourcePolicy"]["roots"] == ["https://publisher.example/caf%C3%A9_a"]
    context = _fallback_context(query)
    assert context is not None and context.query_complete is True
    assert expected in context.discovery_query


@pytest.mark.parametrize("mode", ["direct_answer", "discover"])
def test_conversational_modes_do_not_acquire_fallback_authority(mode) -> None:
    query = prompts.assistant_turn_query(assistant_input(mode, message=LIVE_FIXTURE))
    assert len(query.splitlines()) == 1
    assert "sourcePolicy" not in json.loads(query)
    assert _fallback_context(query) is None


@pytest.mark.asyncio
async def test_504_then_missing_grounding_recovers_only_official_exact_evidence() -> (
    None
):
    rejected_text = "Unattributed provider prose must not become fallback evidence."
    response = _response(rejected_text)
    response.candidates[0].grounding_metadata = None
    models = AsyncSequenceModels(
        [ProviderStatusError(504, "synthetic timeout"), response]
    )
    clock = FakeClock()
    provider = _async_service(models, clock)
    provider._search_operation_seconds = _ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS
    provider._search_attempt_seconds = _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS
    provider._response_validator = assistant_answer_defects
    provider._repair_query_builder = assistant_repair_query
    provider._parsed_response_validator = assistant_parsed_response_defects
    owner_calls = []

    class Primary:
        async def search(self, query):
            owner_calls.append(query)
            return await provider.search_web_general_async(query)

    ledger = discovery(
        sources=[
            {"url": OUTSIDE, "title": "Untrusted discovery result"},
            {"url": OFFICIAL, "title": "Webhook"},
        ]
    )
    original = copy.deepcopy(ledger)
    searx = FakeSearx(ledger)
    fetched = []

    async def fetch(url):
        fetched.append(url)
        return document(url, "Synthetic preamble. " + EXACT + " Synthetic appendix.")

    extractor = ExactExtractor(EXACT, input_tokens=11, output_tokens=3)
    runner = ResilientResearchRunner(
        Primary(),
        searxng=searx,
        fetcher=fetch,
        extractor=extractor,
        maximum_candidates=1,
        source_type_classifier=source_types,
        source_url_validator=assistant_source_url_allowed,
    )
    query, primary, _authority = parsed_query(request())
    raw = await runner.search(query)
    assert owner_calls == [query]
    assert len(models.calls) == 2
    assert provider._search_max_attempts == GEMINI_SEARCH_MAX_ATTEMPTS == 3
    assert all(call["contents"] == query for call in models.calls)
    assert all(
        call["config"].http_options.retry_options.attempts == 1 for call in models.calls
    )
    assert all(
        call["config"].http_options.timeout
        == _ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS * 1_000
        for call in models.calls
    )
    assert clock.sleeps == [1.0]
    assert len(searx.queries) == len(extractor.requests) == 1
    assert LIVE_FIXTURE in searx.queries[0]
    assert "site:docs.n8n.io" in searx.queries[0]
    assert fetched == [OFFICIAL]
    assert ledger == original
    assert raw["runtime_diagnostics"]["query_complete"] is True
    assert raw["runtime_diagnostics"]["primary_status"] == "response_processing_error"
    assert raw["runtime_diagnostics"]["fallback_used"] is True
    assert [claim["text"] for claim in raw["claims"]] == [EXACT]
    assert [source["url"] for source in raw["sources"]] == [OFFICIAL]
    assert rejected_text not in json.dumps(raw)
    assert raw["usage_metadata"]["usage_complete"] is False
    assert raw["usage_metadata"]["total_tokens"] is None
    projected = project_assistant_result(
        raw,
        response_mode="one_shot",
        source_type_classifier=source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
        source_policy=assistant_source_policy_from_payload(primary["sourcePolicy"]),
    )
    assert (
        "bounded evidence fallback, not a complete synthesis"
        in projected.response.markdown
    )
    assert projected.response.facts[0].statement == EXACT
    assert projected.response.facts[0].source_urls == [OFFICIAL]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case, expected_status",
    [
        ("empty", "empty"),
        ("outside_only", "discovery_rows_incomplete"),
        ("fetch_failed", "direct_fetch_error"),
        ("no_exact_evidence", "empty"),
        ("partial_admission_no_exact_evidence", "discovery_rows_incomplete"),
    ],
)
async def test_aligned_hint_does_not_invent_evidence_or_hide_real_fallback_failures(
    case, expected_status
) -> None:
    rows = [] if case == "empty" else [{"url": OFFICIAL, "title": "Webhook"}]
    if case == "outside_only":
        rows = [{"url": OUTSIDE, "title": "Untrusted"}]
    elif case == "partial_admission_no_exact_evidence":
        rows.append({"url": OUTSIDE, "title": "Untrusted"})
    primary = FakePrimary(transient("response_processing_error"))
    searx = FakeSearx(discovery(sources=rows, status="ok" if rows else "empty"))
    fetched = []

    async def fetch(url):
        fetched.append(url)
        if case == "fetch_failed":
            raise ValueError("Synthetic fetch failure")
        return document(url, "Synthetic document without selected evidence.")

    raw = await ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=fetch,
        extractor=EmptyExtractor(),
        source_type_classifier=source_types,
        source_url_validator=assistant_source_url_allowed,
    ).search(prompts.assistant_turn_query(request()))
    diagnostic = raw["runtime_diagnostics"]
    fallback = diagnostic.get("fallback", diagnostic)
    assert fallback["status"] == expected_status
    assert fallback["query_complete"] is True
    assert raw.get("text", "") == "" and raw.get("claims", []) == []
    assert fetched == ([] if case in {"empty", "outside_only"} else [OFFICIAL])
    assert len(primary.queries) == len(searx.queries) == 1
