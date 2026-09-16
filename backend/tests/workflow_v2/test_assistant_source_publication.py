"""The same source restriction controls acquisition and reader-facing evidence."""

from __future__ import annotations

import copy
import json

import httpx
import pytest

from backend.services.workflow_v2 import direct_source_fetch
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.publication import (
    assess_assistant_publication,
    assistant_parsed_response_defects,
    assistant_source_url_allowed,
    source_policy_from_query,
)
from backend.services.workflow_v2.assistant.publishers import (
    reviewed_publisher_bindings,
)
from backend.services.workflow_v2.assistant.source_policy import (
    AssistantSourcePolicy,
    resolve_assistant_source_policy,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.resilient_research_runner import (
    ResilientResearchRunner,
)
from backend.tests.workflow_v2.test_assistant_claim_spans import grounded_response
from backend.tests.workflow_v2.test_assistant_service import (
    RecordingRunner,
    assistant_input,
    metrics_factory,
    service,
    source_types,
    usage_reader,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    FakePrimary,
    FakeSearx,
    discovery,
    document,
    transient,
)

pytestmark = pytest.mark.contract
DOCS = "https://docs.n8n.io"
CODE = DOCS + "/integrations/builtin/core-nodes/n8n-nodes-base.code"
OUTSIDE = "https://getclaudeskills.com/skills/javascript-code-node-czlonkowski"
FIXTURE = (
    "Synthetic quality-release acceptance: research only the official n8n documentation "
    "and produce a concise source-linked checklist for a provider-free JSON webhook "
    "that trims a text field and returns HTTP 400 for missing or non-string input. "
    "Use public documentation and synthetic examples only. Distinguish documented "
    "behaviour from implementation suggestions and unverified assumptions. Do not "
    "create or edit workflows, connect providers, change schedules, deploy anything or send messages."
)


def docs_policy() -> AssistantSourcePolicy:
    return resolve_assistant_source_policy(
        assistant_input("one_shot", message=FIXTURE),
        reviewed_publisher_bindings(),
    )


def project(raw: dict, policy: AssistantSourcePolicy):
    return project_assistant_result(
        raw,
        response_mode="one_shot",
        source_type_classifier=source_types,
        usage_reader=usage_reader,
        metrics_factory=metrics_factory,
        source_policy=policy,
    )


def test_recorded_request_binds_reviewed_documentation_in_both_provider_prompts() -> (
    None
):
    policy = docs_policy()
    assert policy.resolved and policy.basis == "reviewed_bindings"
    assert policy.roots == (DOCS,)
    query = assistant_turn_query(
        assistant_input("one_shot", message=FIXTURE), source_policy=policy
    )
    primary, fallback = map(json.loads, query.splitlines())
    assert primary["sourcePolicy"] == policy.to_payload()
    assert fallback["requirement"]["allowedSourceHosts"] == ["docs.n8n.io"]
    assert source_policy_from_query(query) == policy
    assert DOCS in primary["instruction"]
    assert assistant_source_url_allowed(query, CODE)
    assert not assistant_source_url_allowed(query, OUTSIDE)
    assert not assistant_source_url_allowed(query, "https://community.n8n.io/docs")
    assert not assistant_source_url_allowed(
        query, "https://github.com/n8n-io/n8n/issues/21827"
    )


@pytest.mark.asyncio
async def test_unknown_official_publisher_requires_reference_before_paid_search() -> (
    None
):
    runner = RecordingRunner({})
    with pytest.raises(CognitiveExecutionFailure) as raised:
        await service(grounded=runner, conversation=None).execute(
            assistant_input(
                "one_shot", message="Use only official UnknownProduct documentation."
            )
        )
    assert raised.value.error_class == "AXWISE_ASSISTANT_SOURCE_REFERENCE_REQUIRED"
    assert raised.value.retryable is False
    assert raised.value.diagnostics["call_count"] == 0
    assert runner.queries == []


def test_live_third_party_claim_cannot_publish_as_official_documentation() -> None:
    text = "Compatible Execution Mode: Run Once for Each Item [[5.1.1]]"
    raw = grounded_response(text, [text], urls=[OUTSIDE])
    raw["sources"].append({"title": "Official documentation", "url": CODE})
    original = copy.deepcopy(raw)
    publication = assess_assistant_publication(raw, docs_policy())
    assert "source_policy_violation" in publication.issues
    assert publication.claims == []
    with pytest.raises(CognitiveExecutionFailure) as raised:
        project(raw, docs_policy())
    assert raised.value.error_class == "AXWISE_ASSISTANT_EVIDENCE_POLICY_REJECTED"
    assert raw == original


def test_a_valid_claim_does_not_hide_an_outside_source_fragment() -> None:
    good = "The Code node transforms data."
    text = good + "\n\nRead `$json.body.text.trim()` before returning."
    raw = grounded_response(text, [good, "body"], urls=[CODE, OUTSIDE])
    assert (
        "source_policy_violation"
        in assess_assistant_publication(raw, docs_policy()).issues
    )


def test_canonical_links_and_marker_free_fact_display_preserve_original_ledger() -> (
    None
):
    text = "The Code node transforms data [[5.1.1]]."
    raw = grounded_response(text, [text], urls=[CODE])
    original = copy.deepcopy(raw)
    result = project(raw, docs_policy())
    assert f"[1](<{CODE}>)" in result.response.markdown
    assert "[[5.1.1]]" not in result.response.markdown
    assert result.response.facts[0].statement == "The Code node transforms data."
    assert result.response.facts[0].source_urls == [CODE]
    assert raw == original


def test_same_policy_applies_to_parsed_repair_gate_and_final_projection() -> None:
    query = assistant_turn_query(assistant_input("one_shot", message=FIXTURE))
    text = "The Code node transforms data."
    rejected = grounded_response(text, [text], urls=[OUTSIDE])
    accepted = grounded_response(text, [text], urls=[CODE])
    assert "source_policy_violation" in assistant_parsed_response_defects(
        query, rejected
    )
    assert assistant_parsed_response_defects(query, accepted) == ()
    assert project(accepted, docs_policy()).response.facts[0].source_urls == [CODE]


def test_outside_prose_link_cannot_bypass_admitted_provider_source_policy() -> None:
    statement = "The Code node transforms data."
    raw = grounded_response(
        statement + f"\n\n[Reference]({OUTSIDE})", [statement], urls=[CODE]
    )
    assert (
        "source_policy_violation"
        in assess_assistant_publication(raw, docs_policy()).issues
    )


@pytest.mark.parametrize(
    "suffix",
    [
        f" `[resource]({OUTSIDE})",
        f" {{{{ [resource]({OUTSIDE}) }}}}",
        f"\n    [resource]({OUTSIDE})",
        f" [resource][ref]\n\n> [ref]: {OUTSIDE}",
        f" [resource][ref]\n\n- [ref]: {OUTSIDE}",
        f" [outer [resource]({OUTSIDE})]({CODE})",
        f" [outer <{OUTSIDE}>]({CODE})",
    ],
)
def test_rendered_link_cannot_hide_in_non_code_markdown(suffix: str) -> None:
    statement = "The Code node transforms data."
    raw = grounded_response(statement + suffix, [statement], urls=[CODE])
    original = copy.deepcopy(raw)
    assert (
        "source_policy_violation"
        in assess_assistant_publication(raw, docs_policy()).issues
    )
    with pytest.raises(CognitiveExecutionFailure) as raised:
        project(raw, docs_policy())
    assert raised.value.error_class == "AXWISE_ASSISTANT_EVIDENCE_POLICY_REJECTED"
    assert raw == original


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "redirect",
    [
        "https://forum.example/docs/result",
        "https://publisher.example/community/result",
        "https://publisher.example/docs-evil/result",
    ],
)
async def test_direct_fetch_does_not_contact_outside_redirect_destination(
    monkeypatch, redirect
) -> None:
    policy = AssistantSourcePolicy(
        mode="restricted",
        source_kind="documentation",
        restriction="Use only these docs",
        roots=("https://publisher.example/docs",),
        basis="user_references",
    )
    dns, requests = [], []

    async def resolve(hostname):
        dns.append(hostname)
        return ("93.184.216.34",)

    async def handler(request):
        requests.append(str(request.url))
        return httpx.Response(302, headers={"location": redirect}, request=request)

    monkeypatch.setattr(direct_source_fetch, "_resolve_public_addresses", resolve)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="violates source policy"):
            await direct_source_fetch.fetch_direct_source(
                "https://publisher.example/docs/start",
                client=client,
                url_validator=policy.allows_url,
            )
    assert dns == ["publisher.example"]
    assert requests == ["https://publisher.example/docs/start"]


@pytest.mark.asyncio
async def test_fallback_filters_exact_roots_before_candidate_limit_and_checks_final_url() -> (
    None
):
    policy = AssistantSourcePolicy(
        mode="restricted",
        source_kind="documentation",
        restriction="Use only these docs",
        roots=("https://publisher.example/docs",),
        basis="user_references",
    )
    query = assistant_turn_query(
        assistant_input(
            "one_shot",
            message="Use only documentation at https://publisher.example/docs.",
        ),
        source_policy=policy,
    )
    permitted = "https://publisher.example/docs/reference"
    fetched, extracted = [], []

    async def fetch(url):
        fetched.append(url)
        return document(
            "https://publisher.example/community/redirected",
            "Outside bytes must not reach extraction.",
        )

    class Extractor:
        async def extract(self, request):
            extracted.append(request)
            raise AssertionError("Policy-violating bytes reached the model")

    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(
            discovery(
                sources=[
                    {
                        "url": "https://publisher.example/community/first",
                        "title": "Official docs",
                    },
                    {
                        "url": "https://publisher.example/docs-lookalike/second",
                        "title": "Docs",
                    },
                    {"url": permitted, "title": "Permitted documentation"},
                ]
            )
        ),
        fetcher=fetch,
        extractor=Extractor(),
        maximum_candidates=1,
        source_type_classifier=source_types,
        source_url_validator=assistant_source_url_allowed,
    )
    result = await runner.search(query)
    assert fetched == [permitted]
    assert extracted == []
    assert result["search_performed"] is False
    assert "Outside bytes" not in json.dumps(result)


def test_malformed_server_policy_is_not_silently_treated_as_unrestricted() -> None:
    query = json.dumps(
        {
            "instruction": "server",
            "message": "request",
            "sourcePolicy": {"mode": "unrestricted"},
        }
    )
    assert not assistant_source_url_allowed(query, CODE)
    with pytest.raises(ValueError):
        source_policy_from_query(query)
