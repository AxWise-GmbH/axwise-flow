import asyncio
import hashlib
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.research.simulation_bridge.models import CompanyDiscoveryItem
from api.research.simulation_bridge.services.market_scope import (
    resolve_market_scope,
)
from api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from api.research.simulation_bridge.services import pipeline as pipeline_module
from api.research.simulation_bridge.services.regional_service import RegionalService
from backend.services.generative.gemini_search_service import GeminiSearchService
from backend.services.generative.searxng_search_service import SearxngSearchService
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.research_source_authority_service import (
    build_recognized_root_proof,
)


pytestmark = pytest.mark.contract


def _company(
    name: str,
    location: str,
    website: str | None = None,
) -> CompanyDiscoveryItem:
    return CompanyDiscoveryItem(
        id=name.casefold().replace(" ", "-"),
        name=name,
        industry="Pet food",
        size="Unknown",
        location=location,
        latitude=0.0,
        longitude=0.0,
        decision_makers=[],
        estimated_pain_points=[],
        website=website,
    )


def test_country_scope_is_generic_and_rejects_cross_market_results():
    estonia = resolve_market_scope("Estonia")
    assert estonia.country_code == "EE"
    assert estonia.openregister_locality is None
    assert estonia.company_matches(
        _company("Tallinn Pet Foods", "Tallinn, Estonia", "https://example.ee")
    )
    assert not estonia.company_matches(
        _company("Hamburg Tiernahrung", "Hamburg, Germany", "https://example.de")
    )
    assert not estonia.company_matches(
        _company("Riga Pet Foods", "Riga, Latvia", "https://example.lv")
    )
    assert estonia.source_url_matches("https://pta.agri.ee/en")
    assert estonia.source_url_matches("https://ec.europa.eu/example")
    assert estonia.source_url_matches("https://generic.example.com/report")
    assert not estonia.source_url_matches("https://hamburg.example.de/report")
    assert estonia.evidence_text_matches("Estonian feed market rules apply.")
    assert not estonia.evidence_text_matches("Hamburg pet food demand increased.")
    assert not estonia.evidence_text_matches("Germany pet food demand increased.")

    brazil = resolve_market_scope("Brazil")
    assert brazil.country_code == "BR"
    assert brazil.company_matches(
        _company("São Paulo Pet Foods", "São Paulo, Brazil", "https://example.com.br")
    )


def test_openregister_is_enabled_only_for_authorized_german_localities():
    assert resolve_market_scope("Bremen, Germany").openregister_locality == "Bremen"
    assert resolve_market_scope("Munich").openregister_locality is None
    assert resolve_market_scope("Germany").openregister_locality is None
    assert resolve_market_scope("Tallinn, Estonia").openregister_locality is None


def test_regional_fallback_has_no_implicit_german_coordinate_anchor():
    service = RegionalService(model=object())

    assert service._get_base_coordinates("Tallinn, Estonia") is None
    assert service._get_base_coordinates("Unknown market") is None
    assert service._get_base_coordinates("Berlin, Germany") == (52.52, 13.405)


@pytest.mark.asyncio
async def test_registry_keyword_model_cannot_replace_authorized_geography():
    pipeline = B2BDataPipeline(
        location="Bremen, Germany",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
    )
    mock_agent = MagicMock()
    mock_agent.run = AsyncMock(
        return_value=SimpleNamespace(
            output=SimpleNamespace(
                german_city="Hamburg",
                search_keyword="Tiernahrung",
            )
        )
    )

    with patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=mock_agent,
    ):
        city, keyword = await pipeline._derive_search_params()

    assert city == "Bremen"
    assert keyword == "Tiernahrung"


@pytest.mark.asyncio
async def test_non_german_market_skips_registry_and_uses_web_route():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
    )
    pipeline.openregister_key = "configured-but-german-only"
    estonian = _company(
        "Tallinn Pet Foods", "Tallinn, Estonia", "https://example.ee"
    )
    pipeline._fetch_from_openregister = AsyncMock(
        side_effect=AssertionError("OpenRegister must not receive Estonia")
    )
    pipeline._discover_via_web_search = AsyncMock(return_value=[estonian])
    pipeline._enrich_contacts_and_people = AsyncMock()
    pipeline._enrich_with_grounded_pain_points = AsyncMock(
        side_effect=lambda rows: rows
    )

    results = await pipeline.run()

    assert results == [estonian]
    pipeline._fetch_from_openregister.assert_not_awaited()
    assert pipeline.routing_diagnostics["providers"][0] == {
        "provider": "openregister",
        "attempted": False,
        "accepted_company_count": 0,
        "source_count": 0,
        "reason": "unsupported_market",
    }


@pytest.mark.asyncio
async def test_cross_market_web_rows_are_rejected_after_provider_parsing():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
    )
    pipeline._discover_via_web_search = AsyncMock(
        return_value=[
            _company("Wrong Market", "Hamburg, Germany", "https://wrong.de"),
            _company("Right Market", "Tallinn, Estonia", "https://right.ee"),
        ]
    )
    pipeline._enrich_contacts_and_people = AsyncMock()
    pipeline._enrich_with_grounded_pain_points = AsyncMock(
        side_effect=lambda rows: rows
    )

    results = await pipeline.run()

    assert [row.name for row in results] == ["Right Market"]
    assert pipeline.routing_diagnostics["rejected_cross_market"] == [
        {
            "provider": "web",
            "company_id": "wrong-market",
            "location": "Hamburg, Germany",
        }
    ]


@pytest.mark.asyncio
async def test_independent_batch_enrichments_run_concurrently_without_losing_rows():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
    )
    estonian = _company(
        "Tallinn Pet Foods", "Tallinn, Estonia", "https://example.ee"
    )
    pipeline._discover_via_web_search = AsyncMock(return_value=[estonian])
    active = 0
    maximum_active = 0

    async def enrich(_rows):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1

    pipeline._enrich_contacts_and_people = AsyncMock(side_effect=enrich)
    pipeline._enrich_with_grounded_pain_points = AsyncMock(side_effect=enrich)

    results = await pipeline.run()

    assert results == [estonian]
    assert maximum_active == 2


@pytest.mark.asyncio
async def test_web_router_preserves_direct_sources_without_company_extraction():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
    )
    gemini = MagicMock()
    gemini.is_available.return_value = True
    gemini.search_web_general.return_value = {
        "search_performed": True,
        "text": "Grounded Estonian market evidence",
        "sources": [
            {"title": "PTA", "url": "https://pta.agri.ee/en"},
            {"title": "Statistics Estonia", "url": "https://stat.ee/en"},
            {"title": "Wrong market", "url": "https://hamburg.example.de"},
        ],
        "claims": [],
    }
    searxng = MagicMock()
    searxng.is_available.return_value = True
    searxng.search_web_general.return_value = {
        "search_performed": True,
        "text": "EU feed rules apply in Estonia",
        "sources": [
            {
                "title": "European Commission",
                "url": "https://food.ec.europa.eu/example",
            }
        ],
        "claims": [
            {
                "text": "EU feed rules apply in Estonia.",
                "source_urls": ["https://food.ec.europa.eu/example"],
            }
        ],
    }
    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(output=SimpleNamespace(companies=[]))
    )

    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=gemini,
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService",
        return_value=searxng,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ):
        companies = await pipeline._discover_via_web_search()

    assert companies == []
    assert len(pipeline.market_sources) == 1
    assert len(pipeline.market_claims) == 1
    assert pipeline.market_claims[0]["source_ids"] == [
        next(
            row["source_id"]
            for row in pipeline.market_sources
            if row["publisher"] == "food.ec.europa.eu"
        )
    ]
    assert pipeline.routing_diagnostics["rejected_cross_market_sources"] == [
        {
            "provider": "gemini_google_search",
            "url": "https://hamburg.example.de",
        }
    ]
    searxng.search_web_general.assert_called_once()


@pytest.mark.asyncio
async def test_deep_web_router_uses_searxng_only_when_gemini_lacks_authoritative_evidence():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        minimum_source_count=1,
        minimum_authoritative_source_count=1,
    )
    gemini = MagicMock()
    gemini.is_available.return_value = True
    gemini.search_web_general.return_value = {
        "search_performed": True,
        "text": "Independent Estonia market report",
        "sources": [{"title": "Trade press", "url": "https://example.com/estonia"}],
        "claims": [
            {
                "text": "Estonia retail demand is changing.",
                "source_urls": ["https://example.com/estonia"],
            }
        ],
    }
    searxng = MagicMock()
    searxng.is_available.return_value = True
    searxng.search_web_general.return_value = {
        "search_performed": True,
        "text": "European Commission rules apply in Estonia",
        "sources": [
            {"title": "European Commission", "url": "https://food.ec.europa.eu/estonia"}
        ],
        "claims": [
            {
                "text": "European Commission feed rules apply in Estonia.",
                "source_urls": ["https://food.ec.europa.eu/estonia"],
            }
        ],
    }
    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(output=SimpleNamespace(companies=[]))
    )

    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=gemini,
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService",
        return_value=searxng,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ):
        await pipeline._discover_via_web_search()

    gemini.search_web_general.assert_called_once()
    searxng.search_web_general.assert_called_once()
    assert {row["source_authority"] for row in pipeline.market_sources} == {
        "unverified_redirect",
        "official_public",
    }


@pytest.mark.asyncio
async def test_web_router_continues_after_a_provider_error():
    pipeline = B2BDataPipeline(
        location="Brazil",
        business_problem="Commercial market launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        minimum_source_count=1,
    )
    gemini = MagicMock()
    gemini.is_available.return_value = True
    gemini.search_web_general.side_effect = RuntimeError("provider unavailable")
    searxng = MagicMock()
    searxng.is_available.return_value = True
    searxng.search_web_general.return_value = {
        "search_performed": True,
        "text": "Brazilian market evidence",
        "sources": [{"title": "IBGE", "url": "https://ibge.gov.br/market"}],
        "claims": [
            {
                "text": "Brazil market statistics are available.",
                "source_urls": ["https://ibge.gov.br/market"],
            }
        ],
    }
    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(
            output=SimpleNamespace(
                companies=[
                    _company(
                        "São Paulo Pet Foods",
                        "São Paulo, Brazil",
                        "https://invented.example.com",
                    )
                ]
            )
        )
    )

    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=gemini,
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService",
        return_value=searxng,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ):
        companies = await pipeline._discover_via_web_search()

    assert [row["provider"] for row in pipeline.routing_diagnostics["providers"]] == [
        "gemini_google_search:general_market",
        "searxng:general_market",
        "web_parser",
    ]
    assert pipeline.routing_diagnostics["providers"][0]["reason"] == (
        "provider_error:RuntimeError"
    )
    assert len(pipeline.market_sources) == 1
    assert companies[0].website is None
    assert companies[0].pain_point_sources is None


@pytest.mark.asyncio
async def test_optional_company_parser_timeout_preserves_verified_evidence(monkeypatch):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        minimum_source_count=1,
        required_evidence_classes=["statutory_current"],
    )
    source_url = "https://tax.gov.ee/current-vat"
    claim_text = "Estonia's current VAT rate is 24% effective 2026-01-01."
    retrieved_at = "2026-08-12T12:00:00+00:00"
    gemini = MagicMock()
    gemini.is_available.return_value = True
    gemini.search_web_general.return_value = {
        "search_performed": True,
        "text": claim_text,
        "sources": [{"title": "Estonia current VAT guidance", "url": source_url}],
        "claims": [
            {
                "text": claim_text,
                "source_urls": [source_url],
            }
        ],
    }
    searxng = MagicMock()
    searxng.is_available.return_value = False
    parser = MagicMock()
    parser.run = AsyncMock()

    async def preserve_authority(rows):
        proof = build_recognized_root_proof(
            direct_url=source_url,
            direct_text=claim_text,
            country_codes=["EE"],
            retrieved_at=retrieved_at,
        )
        rows[0].update(
            {
                "url": source_url,
                "publisher": "tax.gov.ee",
                "country_codes": ["EE"],
                "retrieved_at": retrieved_at,
                "source_authority": "official_public",
                "authority_verification_status": "recognized_public_root_direct",
                "direct_fetch_status": "retrieved",
                "jurisdiction_binding_status": "verified",
                "authority_proof": proof,
                "authority_document_artifact": {
                    "artifact_type": "direct_authority_document",
                    "text": claim_text,
                    "sha256": hashlib.sha256(claim_text.encode("utf-8")).hexdigest(),
                    "retrieved_at": retrieved_at,
                    "authority_proof_signature": proof["proof_signature"],
                },
            }
        )
        return rows

    # Use a dispatching wrapper because each stage passes a newly-created
    # coroutine to the same deadline helper.
    calls = 0

    async def dispatch(awaitable, *, deadline_seconds):
        nonlocal calls
        calls += 1
        if calls == 1:
            return await awaitable
        awaitable.close()
        raise asyncio.TimeoutError

    monkeypatch.setattr(
        pipeline_module,
        "_await_with_hard_stage_deadline",
        dispatch,
    )
    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=gemini,
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService",
        return_value=searxng,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=preserve_authority,
    ):
        companies = await pipeline._discover_via_web_search()

    assert companies == []
    assert pipeline.market_sources
    assert pipeline.market_claims
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["statutory_current"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]
    assert pipeline.routing_diagnostics["company_structuring"]["status"] == "timeout"
    assert pipeline.routing_diagnostics["providers"][-1]["provider"] == "web_parser"
    assert pipeline.routing_diagnostics["providers"][-1]["reason"] == "stage_timeout"


@pytest.mark.asyncio
async def test_hard_stage_deadline_bounds_cancellation_cleanup():
    release = asyncio.Event()
    task_seen = asyncio.Event()
    captured_task = None

    async def cancellation_resistant_stage():
        nonlocal captured_task
        captured_task = asyncio.current_task()
        task_seen.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            await release.wait()

    started = time.monotonic()
    with pytest.raises(asyncio.TimeoutError):
        await pipeline_module._await_with_hard_stage_deadline(
            cancellation_resistant_stage(),
            deadline_seconds=0.04,
        )
    elapsed = time.monotonic() - started
    await task_seen.wait()
    assert elapsed < 0.1
    assert captured_task is not None and not captured_task.done()
    release.set()
    await asyncio.sleep(0)
    assert captured_task.done()


@pytest.mark.asyncio
async def test_company_parser_normal_response_keeps_existing_schema_and_quality():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        minimum_source_count=1,
    )
    source_url = "https://retailer.example.ee/cat-food"
    gemini = MagicMock()
    gemini.is_available.return_value = True
    gemini.search_web_general.return_value = {
        "search_performed": True,
        "text": "Tallinn Pet Foods operates in Tallinn, Estonia.",
        "sources": [{"title": "Tallinn Pet Foods", "url": source_url}],
        "claims": [
            {
                "text": "Tallinn Pet Foods operates in Tallinn, Estonia.",
                "source_urls": [source_url],
            }
        ],
    }
    searxng = MagicMock()
    searxng.is_available.return_value = False
    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(
            output=SimpleNamespace(
                companies=[_company("Tallinn Pet Foods", "Tallinn, Estonia", source_url)]
            )
        )
    )

    async def preserve_authority(rows):
        return rows

    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=gemini,
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService",
        return_value=searxng,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=preserve_authority,
    ):
        companies = await pipeline._discover_via_web_search()

    assert [row.name for row in companies] == ["Tallinn Pet Foods"]
    assert parser.run.await_count == 1
    assert pipeline.routing_diagnostics["company_structuring"]["status"] == "completed"
    assert pipeline.routing_diagnostics["company_structuring"]["company_count"] == 1
    assert pipeline.routing_diagnostics["providers"][-1]["provider"] == "web_parser"
    assert pipeline.routing_diagnostics["providers"][-1]["reason"] is None


def test_directed_acquisition_has_bounded_dynamic_query_and_source_ceiling():
    pipeline = B2BDataPipeline(
        location="Brazil",
        business_problem=(
            "Launch cat food commercially in Brazil. Previous wrong Germany fallback failed."
        ),
        target_user="Brazilian retail buyer",
        model=MagicMock(),
        required_evidence_classes=[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )
    queries = pipeline._directed_evidence_queries()
    assert len(queries) == 3
    assert {row["evidence_class"] for row in queries} == {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }
    assert all("Brazil" in row["query"] for row in queries)
    assert all("Germany" not in row["query"] for row in queries)
    assert all("EUR" not in row["query"] for row in queries)
    # Three evidence classes plus one batched authority-directory query across
    # two independent providers; each route admits at most two direct sources.
    assert (len(queries) + 1) * 2 == 8
    assert (len(queries) + 1) * 2 * 2 == 16


@pytest.mark.asyncio
async def test_targeted_attestation_is_host_bounded_and_keeps_redirect_untrusted():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current", "official_statistic"],
    )
    unresolved = [
        {
            "resolved_url": f"https://publisher-{index}.example.ee/data",
            "country_codes": ["EE"],
        }
        for index in range(5)
    ]

    class Search:
        def __init__(self, provider):
            self.provider = provider
            self.queries = []

        def search_web_general(self, query):
            self.queries.append(query)
            query_hash = hashlib.sha256(query.encode()).hexdigest()[:12]
            if self.provider == "gemini_google_search":
                url = (
                    "https://vertexaisearch.cloud.google.com/"
                    f"grounding-api-redirect/{query_hash}"
                )
            else:
                url = f"https://commission.europa.eu/authority/{query_hash}"
            return {
                "search_performed": True,
                "sources": [
                    {
                        "title": "Authority directory",
                        "url": url,
                        "provider_redirect": self.provider
                        == "gemini_google_search",
                    },
                    {"title": "Extra result", "url": f"{url}-extra"},
                ],
                "runtime_diagnostics": {
                    "status": "completed",
                    "call_count": 1,
                    "result_count": 2,
                },
            }

    gemini = Search("gemini_google_search")
    searx = Search("searxng")
    rows = await pipeline._targeted_authority_attestation_sources(
        unresolved,
        [("gemini_google_search", gemini), ("searxng", searx)],
    )

    # Five discovered hosts are capped to four; each of two providers gets one
    # route and contributes at most one candidate per host/query.
    assert len(gemini.queries) == len(searx.queries) == 4
    assert len(rows) == 8
    assert all("site:europa.eu" in query for query in gemini.queries + searx.queries)
    assert all(row["target_authority_host"].startswith("publisher-") for row in rows)
    google_rows = [row for row in rows if row["provider"] == "gemini_google_search"]
    assert google_rows and all(row["provider_redirect"] for row in google_rows)
    # Retrieval never self-promotes a redirect or directory result. Strict
    # direct fetch + trusted-root/exact-host proof runs in the next stage.
    assert all("authority_proof" not in row for row in rows)
    assert pipeline.routing_diagnostics["targeted_authority_attestation"] == {
        "status": "completed",
        "host_count": 4,
        "route_count": 8,
        "candidate_count": 8,
        "elapsed_ms": pipeline.routing_diagnostics[
            "targeted_authority_attestation"
        ]["elapsed_ms"],
        "deadline_ms": 90_000,
    }


def test_searxng_adapter_is_optional_bounded_and_source_bearing():
    service = SearxngSearchService("https://search.axwise.example")
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            {
                "title": "Estonian Agriculture and Food Board",
                "url": "https://pta.agri.ee/en",
                "content": "Official feed and food market guidance for Estonia.",
            },
            {"title": "Unsafe", "url": "javascript:alert(1)", "content": "x"},
            {"title": "Cleartext", "url": "http://example.ee", "content": "x"},
        ]
    }

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ) as request:
        result = service.search_web_general("cat food regulation Estonia")

    assert result["search_performed"] is True
    assert len(result["sources"]) == 1
    assert result["sources"][0]["title"] == (
        "Estonian Agriculture and Food Board"
    )
    assert result["sources"][0]["url"] == "https://pta.agri.ee/en"
    assert result["sources"][0]["provider"] == "searxng"
    assert result["sources"][0]["provider_source_id"].startswith("searxng-")
    assert result["sources"][0]["provider_query_ids"]
    assert result["sources"][0]["retrieved_at"]
    assert "Official feed and food market guidance" in result["text"]
    assert request.call_args.kwargs["follow_redirects"] is False


def test_searxng_rejects_untrusted_cleartext_remote_endpoint():
    assert SearxngSearchService("http://public.example").is_available() is False
    assert SearxngSearchService("http://localhost:8080").is_available() is True


def test_searxng_cloud_run_uses_audience_bound_identity_token():
    service = SearxngSearchService(
        "https://axwise-searxng.example.run.app",
        auth_mode="google_identity",
    )
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"results": []}

    with patch(
        "google.oauth2.id_token.fetch_id_token",
        return_value="audience-bound-token",
    ) as fetch_token, patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ) as request:
        service.search_web_general("Estonian pet-food market")

    assert fetch_token.call_args.args[1] == "https://axwise-searxng.example.run.app"
    assert request.call_args.kwargs["headers"] == {
        "Authorization": "Bearer audience-bound-token"
    }


def test_searxng_rejects_unknown_auth_mode_without_network_request():
    service = SearxngSearchService(
        "https://search.example.com", auth_mode="static_key"
    )

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get"
    ) as request:
        result = service.search_web_general("market")

    assert result["search_performed"] is False
    assert result["error"] == "ValueError"
    request.assert_not_called()


def test_gemini_search_preserves_claim_to_source_citations():
    service = GeminiSearchService.__new__(GeminiSearchService)
    prefix = "Eesti turuülevaade. "
    claim_text = "Estonian feed operators must follow applicable feed rules."
    metadata = SimpleNamespace(
        grounding_chunks=[
            SimpleNamespace(
                web=SimpleNamespace(
                    title="Estonian Agriculture and Food Board",
                    uri="https://pta.agri.ee/en",
                )
            )
        ],
        grounding_supports=[
            SimpleNamespace(
                segment=SimpleNamespace(
                    text=claim_text,
                    start_index=0,
                    end_index=len(claim_text.encode("utf-8")),
                    part_index=1,
                ),
                grounding_chunk_indices=[0],
                confidence_scores=[0.96],
            )
        ],
    )
    response = SimpleNamespace(
        text="Grounded response",
        candidates=[
            SimpleNamespace(
                grounding_metadata=metadata,
                content=SimpleNamespace(
                    parts=[
                        SimpleNamespace(text=prefix),
                        SimpleNamespace(text=claim_text),
                    ]
                ),
            )
        ],
    )
    service._client = SimpleNamespace(
        models=SimpleNamespace(generate_content=MagicMock(return_value=response))
    )

    result = service.search_web_general("Estonian cat food regulation")

    assert len(result["claims"]) == 1
    claim = result["claims"][0]
    assert claim["text"] == claim_text
    assert claim["source_urls"] == ["https://pta.agri.ee/en"]
    assert claim["confidence_scores"] == [0.96]
    assert claim["part_index"] == 1
    assert claim["offset_unit"] == "utf8_bytes"
    assert claim["span_target"] == "provider_response_part"
    assert claim["provenance_artifact"]["response_parts"] == [
        prefix,
        claim_text,
    ]
