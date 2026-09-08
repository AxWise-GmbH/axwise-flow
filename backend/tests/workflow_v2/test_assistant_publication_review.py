"""Independent checks of the production URL-policy bridge and redirect boundary."""

from __future__ import annotations

import copy

import httpx
import pytest

from backend.services.workflow_v2 import direct_source_fetch
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.publication import (
    assistant_source_url_allowed,
)
from backend.services.workflow_v2.assistant.source_policy import AssistantSourcePolicy
from backend.services.workflow_v2.resilient_research_runner import (
    ResilientResearchRunner,
)
from backend.tests.workflow_v2.test_assistant_service import (
    assistant_input,
    source_types,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    ExactExtractor,
    FakePrimary,
    FakeSearx,
    discovery,
    document,
    transient,
)


pytestmark = pytest.mark.contract
ROOT = "https://publisher.example/docs"
PERMITTED = ROOT + "/reference"
OUTSIDE = "https://publisher.example/community/post"
EXACT = "The component accepts a JSON object."


def policy_query():
    policy = AssistantSourcePolicy(
        mode="restricted",
        source_kind="documentation",
        restriction="Use only the supplied documentation root",
        roots=(ROOT,),
        basis="user_references",
    )
    query = assistant_turn_query(
        assistant_input("one_shot", message="Research the supplied component docs."),
        source_policy=policy,
    )
    return policy, query


@pytest.mark.asyncio
async def test_default_fetcher_receives_exact_request_policy_before_extraction(
    monkeypatch,
):
    _policy, query = policy_query()
    received = []
    ledger = discovery(
        sources=[
            {"url": OUTSIDE, "title": "Official docs"},
            {"url": PERMITTED, "title": "Component reference"},
        ]
    )
    original = copy.deepcopy(ledger)

    async def fetch(url, *, url_validator=None):
        received.append(url)
        assert callable(
            url_validator
        ), "default transport lost the source-policy predicate"
        assert url_validator(PERMITTED) is True
        assert url_validator(OUTSIDE) is False
        assert url_validator("https://publisher.example/docs-evil/reference") is False
        return document(url, EXACT)

    monkeypatch.setattr(direct_source_fetch, "fetch_direct_source", fetch)
    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(ledger),
        extractor=ExactExtractor(EXACT),
        maximum_candidates=1,
        source_type_classifier=source_types,
        source_url_validator=assistant_source_url_allowed,
    )
    result = await runner.search(query)
    assert received == [PERMITTED]
    assert result["search_performed"] is True
    assert [claim["text"] for claim in result["claims"]] == [EXACT]
    assert [source["url"] for source in result["sources"]] == [PERMITTED]
    assert ledger == original


@pytest.mark.asyncio
async def test_default_fetcher_result_is_rechecked_even_if_transport_returns_wrong_url(
    monkeypatch,
):
    _policy, query = policy_query()
    extracted = []

    async def fetch(url, *, url_validator=None):
        assert url_validator(url) is True
        return document(OUTSIDE, EXACT)

    class Extractor:
        async def extract(self, request):
            extracted.append(request)
            raise AssertionError("Unapproved document reached the extractor")

    monkeypatch.setattr(direct_source_fetch, "fetch_direct_source", fetch)
    runner = ResilientResearchRunner(
        FakePrimary(transient()),
        searxng=FakeSearx(discovery(sources=[{"url": PERMITTED, "title": "Docs"}])),
        extractor=Extractor(),
        source_type_classifier=source_types,
        source_url_validator=assistant_source_url_allowed,
    )
    result = await runner.search(query)
    assert extracted == []
    assert result["search_performed"] is False
    assert result.get("claims", []) == []


@pytest.mark.asyncio
async def test_second_redirect_is_rejected_before_dns_or_request_even_with_following_client(
    monkeypatch,
):
    policy, _query = policy_query()
    requests, dns = [], []

    async def resolve(host):
        dns.append(host)
        return ("93.184.216.34",)

    async def handler(request):
        url = str(request.url)
        requests.append(url)
        if url == ROOT + "/start":
            return httpx.Response(
                302, headers={"location": ROOT + "/hop"}, request=request
            )
        assert url == ROOT + "/hop"
        return httpx.Response(302, headers={"location": OUTSIDE}, request=request)

    monkeypatch.setattr(direct_source_fetch, "_resolve_public_addresses", resolve)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=True
    ) as client:
        with pytest.raises(ValueError, match="violates source policy"):
            await direct_source_fetch.fetch_direct_source(
                ROOT + "/start",
                client=client,
                url_validator=policy.allows_url,
            )
    assert requests == [ROOT + "/start", ROOT + "/hop"]
    assert dns == ["publisher.example", "publisher.example"]
