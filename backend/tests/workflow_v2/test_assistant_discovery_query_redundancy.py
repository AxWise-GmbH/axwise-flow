"""Remove only exact Assistant search redundancy; retain evidence authority."""

from __future__ import annotations

import copy
import json

import pytest

from backend.tests.workflow_v2.test_assistant_discovery_admission import (
    FIXTURE,
    request,
    runtime,
)


pytestmark = pytest.mark.contract
BOILERPLATE = "Answering the current bounded one-shot Assistant request."


def context_for(
    runtime,
    *,
    description,
    anchors,
    applies=BOILERPLATE,
    assistant=True,
    geography=(),
    hosts=("docs.publisher.example",),
):
    requirement = {
        "id": "assistant-one-shot" if assistant else "synthetic-research",
        "claimType": "assistant_one_shot" if assistant else "market_constraint",
        "description": description,
        "appliesWhen": applies,
        "acceptedSourceTypes": ["grounded_web"],
        "allowedSourceHosts": list(hosts),
    }
    payload = {
        "acceptedScopeSemantics": {
            "topicAnchors": [{"value": anchor} for anchor in anchors],
            "geography": list(geography),
        },
        "requirement": requirement,
    }
    frozen = copy.deepcopy(payload)
    canonical = runtime.canonical_json(payload)
    context = runtime._fallback_context("server-owned instruction\n" + canonical)
    assert context is not None
    assert payload == frozen
    assert runtime.canonical_json(payload) == canonical
    assert context.requirement == requirement
    assert context.applies_when == applies
    return context


def test_primary_prompt_and_complete_canonical_authority_stay_unchanged(runtime):
    query = runtime.assistant_turn_query(request(runtime))
    original_query = query
    first, last = query.rsplit("\n", 1)
    primary = json.loads(first)
    authority = json.loads(last)
    context = runtime._fallback_context(query)
    assert query == original_query
    assert primary["message"] == FIXTURE
    assert authority["requirement"]["description"] == FIXTURE
    assert authority["requirement"]["appliesWhen"] == BOILERPLATE
    assert authority["acceptedScopeSemantics"]["topicAnchors"] == [
        {"value": FIXTURE[:200]}
    ]
    assert context.discovery_query == "site:docs.n8n.io " + FIXTURE
    assert context.query_complete is True


@pytest.mark.parametrize(
    "description",
    [
        "Verify Unicode café Zürich 日本語 webhook behaviour.",
        "Latest user request: Compare outputs. Prior user request 1: Never execute or send data.",
        "Verify only publisher facts; do not infer an unavailable deployment version.",
    ],
)
def test_exact_duplicate_removal_preserves_full_request_and_geography(
    runtime, description
):
    context = context_for(
        runtime,
        description=description,
        anchors=[description[:30]],
        geography=("Estonia",),
    )
    assert (
        context.discovery_query
        == "site:docs.publisher.example " + description + " Estonia"
    )
    assert context.query_complete is True


def test_independent_anchor_and_meaningful_applicability_are_preserved(runtime):
    description = "Verify webhook response details."
    context = context_for(
        runtime,
        description=description,
        anchors=["webhook response", "version-specific validation"],
        applies="Only for release 7 and synthetic input.",
    )
    assert context.discovery_query == (
        "site:docs.publisher.example Verify webhook response details. "
        "Only for release 7 and synthetic input. version-specific validation"
    )
    assert context.query_complete is True


@pytest.mark.parametrize("applies", [BOILERPLATE, "Only for the specified market."])
def test_non_assistant_queries_keep_all_historical_sections(runtime, applies):
    description = "Verify market conditions."
    context = context_for(
        runtime,
        description=description,
        anchors=["market"],
        applies=applies,
        assistant=False,
    )
    assert (
        context.discovery_query
        == f"site:docs.publisher.example {description} {applies} market"
    )


@pytest.mark.parametrize(
    "description_size, complete", [(560, True), (561, False), (1000, False)]
)
def test_compaction_does_not_turn_truncated_requirements_complete(
    runtime, description_size, complete
):
    description = "R" * description_size
    context = context_for(runtime, description=description, anchors=[description[:200]])
    expected, _ = runtime._bounded_query_term(description, maximum=560)
    assert context.discovery_query == "site:docs.publisher.example " + expected
    assert context.query_complete is complete


@pytest.mark.parametrize("anchor_size", [201, 300])
def test_redundant_overbudget_anchor_still_reports_original_incompleteness(
    runtime, anchor_size
):
    description = "R" * 400
    context = context_for(
        runtime, description=description, anchors=[description[:anchor_size]]
    )
    assert context.discovery_query == "site:docs.publisher.example " + description
    assert context.query_complete is False


def test_anchor_in_truncated_away_description_tail_is_not_removed(runtime):
    context = context_for(
        runtime,
        description="R" * 600 + " unique required tail",
        anchors=["unique required tail"],
    )
    assert context.discovery_query.endswith(" unique required tail")
    assert context.query_complete is False


def test_distinct_case_and_partial_anchor_are_not_treated_as_semantic_duplicates(
    runtime,
):
    context = context_for(
        runtime,
        description="Verify case-sensitive identifiers.",
        anchors=["CASE-SENSITIVE", "identifiers extended"],
    )
    assert context.discovery_query.endswith(" CASE-SENSITIVE identifiers extended")


def test_no_host_policy_and_all_explicit_host_policies_remain_unchanged(runtime):
    for hosts in ((), ("b.publisher.example", "a.publisher.example")):
        context = context_for(
            runtime,
            description="Verify exact policy.",
            anchors=["exact policy"],
            hosts=hosts,
        )
        assert context.allowed_hosts == frozenset(hosts)
        prefix = " ".join(f"site:{host}" for host in sorted(hosts))
        assert (
            context.discovery_query
            == (prefix + " " if prefix else "") + "Verify exact policy."
        )
        assert " OR " not in context.discovery_query
