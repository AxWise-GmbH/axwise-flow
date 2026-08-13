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
    build_attested_authority_proof,
    build_direct_primary_market_proof,
    build_recognized_root_proof,
    enrich_authority_sources as real_enrich_authority_sources,
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
    statutory_query = next(
        row["query"]
        for row in queries
        if row["evidence_class"] == "statutory_current"
    )
    assert "official national tax authority" in statutory_query
    assert "VAT GST sales or consumption tax rate" in statutory_query
    assert "effective date" in statutory_query
    assert "Estonia" not in statutory_query
    assert "24%" not in statutory_query
    assert "historic consolidations" in statutory_query
    # Three evidence classes plus one batched authority-directory query across
    # two independent providers; each route admits at most two direct sources.
    assert (len(queries) + 1) * 2 == 8
    assert (len(queries) + 1) * 2 * 2 == 16


def test_live_cms_navigation_block_yields_signed_exact_statutory_claim(
    monkeypatch,
):
    """Regression for the production EMTA handbook page shape.

    Drupal navigation and the first content card normalize into one sentence
    longer than the extraction ceiling. The exact fact also does not repeat
    the country name; the signed source proof, not a keyword in the quote,
    supplies that jurisdiction binding.
    """

    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food compliance launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    direct_url = "https://www.emta.ee/en/admin/content/handbook_article/39"
    retrieved_at = "2026-08-13T00:00:00+00:00"
    direct_text = (
        ("Navigation private client business client e-services support " * 90)
        + "Breadcrumb Standard VAT rate From 1 July 2025, the standard rate "
        "of VAT is 24% . The standard rate applies whenever no preferential "
        "rate or exemption applies. Last updated on 04.08.2026"
    )
    attestation_url = (
        "https://taxation-customs.ec.europa.eu/document/estonia-contacts"
    )
    attestation_text = (
        "European Commission member-state authority directory. ESTONIA: "
        "Estonian Tax and Customs Board, Internet https://www.emta.ee"
    )
    proof = build_attested_authority_proof(
        direct_url=direct_url,
        direct_text=direct_text,
        attestation_url=attestation_url,
        attestation_text=attestation_text,
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )
    source = {
        "title": "Standard VAT rate",
        "url": direct_url,
        "provider": "gemini_google_search",
        "provider_source_id": "provider-route-a",
        "country_codes": ["EE"],
        "source_authority": "official_public",
        "authority_verification_status": (
            "independently_attested_direct_domain"
        ),
        "authority_proof": proof,
        "retrieved_at": retrieved_at,
        "direct_fetch_status": "retrieved",
        "jurisdiction_binding_status": "verified",
        "authority_document_artifact": {
            "artifact_type": "direct_authority_document",
            "text": direct_text,
            "sha256": proof["direct"]["content_sha256"],
            "retrieved_at": retrieved_at,
            "authority_proof_signature": proof["proof_signature"],
        },
    }

    # Reaching the same direct page through two provider routes must not change
    # its durable source ID or break the signed citation during URL dedupe.
    pipeline._store_direct_web_evidence([source], [])
    pipeline._store_direct_web_evidence(
        [{**source, "provider_source_id": "provider-route-b"}], []
    )

    assert len({row["source_id"] for row in pipeline.market_sources}) == 1
    statutory = [
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "statutory_current"
    ]
    assert statutory
    assert all("From 1 July 2025" in row["object"] for row in statutory)
    assert not pipeline.routing_diagnostics["rejected_cross_market_claims"]
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        mandatory_claim_classes=["statutory_current"],
        claim_class_applicability={
            "applicable_claim_classes": ["statutory_current"]
        },
    )
    assert quality["status"] == "passed", quality["blocked_claims"]
    assert quality["verified_claim_classes"] == ["statutory_current"]

    # Exercise the production boundary that previously failed: country-cell
    # metadata is attached after collection, URL dedupe runs, and the cell
    # evaluator must still be able to join the signed citation to its source.
    from backend.services.orqaly_hybrid_run_service import HybridRunService
    from backend.services.orqaly_research_bundle_service import (
        HybridGroundingPolicy,
        _merge_market_evidence,
    )

    for row in [*pipeline.market_sources, *pipeline.market_claims]:
        row["research_cell_ids"] = ["country:EE"]
        row["country_codes"] = ["EE"]
    sources, claims = _merge_market_evidence(
        pipeline.market_sources,
        pipeline.market_claims,
        HybridGroundingPolicy(),
    )
    grounding = {
        "market_sources": sources,
        "market_claims": claims,
        "cell_coverage": [
            {
                "cell_id": "country:EE",
                "country_codes": ["EE"],
                "status": "complete",
            }
        ],
    }
    cell_quality = HybridRunService._evaluate_country_cell_claims(
        grounding,
        critical_policy={
            "mandatory_claim_classes": ["statutory_current"],
            "freshness_days": 120,
        },
        claim_class_applicability={
            "applicable_claim_classes": ["statutory_current"]
        },
    )
    assert cell_quality[0]["status"] == "passed"
    assert cell_quality[0]["verified_claim_classes"] == ["statutory_current"]


def test_signed_statistic_and_catalog_quotes_need_not_repeat_country(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    retrieved_at = "2026-08-13T00:00:00+00:00"
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market launch",
        target_user="Retail category buyer",
        model=MagicMock(),
        required_evidence_classes=[
            "official_statistic",
            "observed_primary_market",
        ],
    )

    stat_url = "https://www.stat.ee/en/internal-trade"
    stat_text = (
        "Statistics Estonia official statistical publisher for Estonia. "
        + ("Navigation economy internal trade tables " * 50)
        + "Source data in the statistical database: KM0107 Last updated: "
        "27 May 2026 08:00 Net sales of trade enterprises 8.12 billion euros "
        "Q1 2026 Table KM0107"
    )
    directory_url = "https://european-union.europa.eu/estonia-authorities"
    directory_text = (
        "Official EU member-state directory: Statistics Estonia "
        "https://www.stat.ee"
    )
    stat_proof = build_attested_authority_proof(
        direct_url=stat_url,
        direct_text=stat_text,
        attestation_url=directory_url,
        attestation_text=directory_text,
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )

    catalog_url = "https://shop.example.ee/cat-food/sheba-340g"
    catalog_text = (
        "Estonia online storefront for local shoppers. "
        + ("Navigation categories delivery account " * 50)
        + "Product catalogue price 3,29 € 9,68 €/kg Täistoit kiisueine lihaga "
        "kastmes, SHEBA, "
        "340 g Osta"
    )
    catalog_proof = build_direct_primary_market_proof(
        direct_url=catalog_url,
        direct_text=catalog_text,
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )

    def source(
        *,
        url,
        title,
        proof,
        text,
        authority,
        verification,
    ):
        return {
            "title": title,
            "url": url,
            "provider": "gemini_google_search",
            "provider_source_id": f"provider-{title}",
            "country_codes": ["EE"],
            "source_authority": authority,
            "authority_verification_status": verification,
            "authority_proof": proof,
            "retrieved_at": retrieved_at,
            "direct_fetch_status": "retrieved",
            "jurisdiction_binding_status": "verified",
            "authority_document_artifact": {
                "artifact_type": "direct_authority_document",
                "text": text,
                "sha256": proof["direct"]["content_sha256"],
                "retrieved_at": retrieved_at,
                "authority_proof_signature": proof["proof_signature"],
            },
        }

    pipeline._store_direct_web_evidence(
        [
            source(
                url=stat_url,
                title="Internal trade",
                proof=stat_proof,
                text=stat_text,
                authority="official_public",
                verification="independently_attested_direct_domain",
            ),
            source(
                url=catalog_url,
                title="Cat food catalogue",
                proof=catalog_proof,
                text=catalog_text,
                authority="first_party_catalog",
                verification="direct_primary_market_observation",
            ),
        ],
        [],
    )

    classes = {
        row.get("evidence_class") for row in pipeline.market_claims
    }
    assert "official_statistic" in classes
    assert "observed_primary_market" in classes
    assert not pipeline.routing_diagnostics["rejected_cross_market_claims"]
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        freshness_days=120,
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=[
            "official_statistic",
            "observed_primary_market",
        ],
        claim_class_applicability={
            "applicable_claim_classes": [
                "official_statistic",
                "observed_primary_market",
            ]
        },
    )
    assert quality["status"] == "passed", quality["blocked_claims"]


@pytest.mark.asyncio
async def test_missing_statutory_recovery_uses_one_dynamic_route_and_exact_fact(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food pricing and compliance launch",
        target_user="Retail category buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    direct_url = "https://taxation-customs.ec.europa.eu/estonia-current-tax"
    direct_text = (
        "European Commission current tax guidance for Estonia. From 1 July 2025, "
        "the standard VAT rate is 24 per cent."
    )

    class Search:
        def __init__(self):
            self.queries = []

        def search_web_general(self, query):
            self.queries.append(query)
            return {
                "search_performed": True,
                "sources": [{"title": "Current tax authority", "url": direct_url}],
                "runtime_diagnostics": {
                    "route": "gemini_google_search",
                    "model": "models/gemini-3.6-flash",
                    "status": "completed",
                    "call_count": 1,
                },
            }

    async def recognized_enrich(rows):
        for row in rows:
            proof = build_recognized_root_proof(
                direct_url=direct_url,
                direct_text=direct_text,
                country_codes=["EE"],
                retrieved_at="2026-08-13T00:00:00+00:00",
            )
            row.update(
                {
                    "url": direct_url,
                    "resolved_url": direct_url,
                    "publisher": "taxation-customs.ec.europa.eu",
                    "source_authority": "official_public",
                    "authority_verification_status": "recognized_public_root_direct",
                    "authority_proof": proof,
                    "provider_redirect": False,
                    "retrieved_at": "2026-08-13T00:00:00+00:00",
                    "direct_fetch_status": "retrieved",
                    "jurisdiction_binding_status": "verified",
                    "authority_document_artifact": {
                        "artifact_type": "direct_authority_document",
                        "text": direct_text,
                        "sha256": proof["direct"]["content_sha256"],
                        "retrieved_at": "2026-08-13T00:00:00+00:00",
                        "authority_proof_signature": proof["proof_signature"],
                    },
                }
            )
        return rows

    search = Search()
    sources = []
    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=recognized_enrich,
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [("gemini_google_search", search)], sources
        )

    assert recovered == 1
    assert len(search.queries) == 1
    assert "Estonia" in search.queries[0]
    assert "official national tax authority" in search.queries[0]
    assert "EMTA" not in search.queries[0]
    assert "24 per cent" not in search.queries[0]
    assert pipeline.market_claims[0]["object"] in direct_text
    assert pipeline.market_claims[0]["evidence_class"] == "statutory_current"
    assert pipeline.routing_diagnostics["statutory_recovery"] == {
        "status": "completed",
        "route_count": 1,
        "candidate_count": 1,
        "retrieved_count": 1,
        "verified_count": 1,
        "accepted_verified_claims": 1,
        "elapsed_ms": pipeline.routing_diagnostics["statutory_recovery"]["elapsed_ms"],
        "deadline_ms": 90_000,
    }


@pytest.mark.asyncio
async def test_statutory_recovery_skips_unhealthy_secondary_and_stays_fail_closed():
    pipeline = B2BDataPipeline(
        location="Brazil",
        business_problem="Commercial pet food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    pipeline.routing_diagnostics["providers"].append(
        {
            "provider": "searxng:statutory_current",
            "source_count": 0,
            "runtime": {
                "status": "empty",
                "unresponsive_engines": [{"engine": "brave", "reason": "rate_limited"}],
            },
        }
    )

    class EmptySearch:
        def __init__(self):
            self.calls = 0

        def search_web_general(self, _query):
            self.calls += 1
            return {"search_performed": False, "sources": []}

    gemini = EmptySearch()
    searx = EmptySearch()
    recovered = await pipeline._recover_missing_statutory_evidence(
        [("gemini_google_search", gemini), ("searxng", searx)], []
    )

    assert recovered == 0
    assert gemini.calls == 1
    assert searx.calls == 0
    assert pipeline.market_claims == []
    assert pipeline.routing_diagnostics["statutory_recovery"]["route_count"] == 1
    assert pipeline.routing_diagnostics["statutory_recovery"][
        "accepted_verified_claims"
    ] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "runtime",
    [
        {"status": "timeout"},
        {"status": "failed", "http_status": 429},
        {"status": "failed", "http_status": 503},
    ],
)
async def test_recovery_skips_unhealthy_gemini_transport_routes(runtime):
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    pipeline.routing_diagnostics["providers"].append(
        {
            "provider": "gemini_google_search:statutory_current",
            "source_count": 0,
            "runtime": runtime,
        }
    )
    search = MagicMock()
    recovered = await pipeline._recover_missing_statutory_evidence(
        [("gemini_google_search", search)], []
    )
    assert recovered == 0
    search.search_web_general.assert_not_called()
    assert pipeline.routing_diagnostics["statutory_recovery"]["route_count"] == 0


@pytest.mark.asyncio
async def test_recovery_retries_completed_gemini_relevance_miss_once():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    pipeline.routing_diagnostics["providers"].append(
        {
            "provider": "gemini_google_search:statutory_current",
            "source_count": 0,
            "runtime": {"status": "completed", "http_status": 200},
        }
    )

    class Search:
        def __init__(self):
            self.calls = 0

        def search_web_general(self, _query):
            self.calls += 1
            return {"search_performed": False, "sources": []}

    search = Search()
    recovered = await pipeline._recover_missing_statutory_evidence(
        [("gemini_google_search", search)], []
    )
    assert recovered == 0
    assert search.calls == 1
    assert pipeline.routing_diagnostics["statutory_recovery"]["route_count"] == 1


@pytest.mark.asyncio
async def test_statutory_recovery_does_not_run_after_initial_signed_exact_fact(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    url = "https://taxation-customs.ec.europa.eu/estonia-tax"
    text = "Estonia current standard VAT rate is 24% effective 2026-01-01."
    proof = build_recognized_root_proof(
        direct_url=url,
        direct_text=text,
        country_codes=["EE"],
        retrieved_at="2026-08-13T00:00:00+00:00",
    )
    pipeline._store_direct_web_evidence(
        [
            {
                "title": "Current tax authority",
                "url": url,
                "provider": "searxng",
                "provider_source_id": "tax-source",
                "retrieved_at": "2026-08-13T00:00:00+00:00",
                "country_codes": ["EE"],
                "source_authority": "official_public",
                "authority_verification_status": "recognized_public_root_direct",
                "authority_proof": proof,
                "authority_document_artifact": {
                    "artifact_type": "direct_authority_document",
                    "text": text,
                    "sha256": proof["direct"]["content_sha256"],
                    "retrieved_at": "2026-08-13T00:00:00+00:00",
                    "authority_proof_signature": proof["proof_signature"],
                },
            }
        ],
        [],
    )

    search = MagicMock()
    recovered = await pipeline._recover_missing_statutory_evidence(
        [("gemini_google_search", search)], []
    )

    assert recovered == 0
    search.search_web_general.assert_not_called()
    assert "statutory_recovery" not in pipeline.routing_diagnostics


@pytest.mark.asyncio
async def test_unverified_statutory_paraphrase_does_not_suppress_recovery():
    pipeline = B2BDataPipeline(
        location="Brazil",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    pipeline.market_claims.append(
        {
            "claim_id": "unverified-provider-paraphrase",
            "object": "Brazil current standard VAT rate is 18% effective 2026-01-01.",
            "critical": True,
            "evidence_class": "statutory_current",
            "current": True,
            "effective_at": "2026-01-01T00:00:00+00:00",
            "source_ids": ["missing-source"],
            "country_codes": ["BR"],
        }
    )

    class EmptySearch:
        def __init__(self):
            self.calls = 0

        def search_web_general(self, _query):
            self.calls += 1
            return {"search_performed": False, "sources": []}

    search = EmptySearch()
    recovered = await pipeline._recover_missing_statutory_evidence(
        [("gemini_google_search", search)], []
    )
    assert recovered == 0
    assert search.calls == 1
    assert pipeline.routing_diagnostics["statutory_recovery"]["route_count"] == 1


@pytest.mark.asyncio
async def test_recovery_attests_dynamic_non_gov_tax_authority_in_same_bounded_route(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial pricing and compliance launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    authority_url = "https://www.emta.ee/en/current-tax-rate"
    directory_url = "https://european-union.europa.eu/estonia-authorities"
    authority_text = (
        "Estonia national tax authority guidance. From 1 July 2025, the current "
        "standard VAT rate is 24 per cent."
    )
    directory_text = (
        "Official Estonia public authority directory: Estonian Tax and Customs "
        "Board https://www.emta.ee"
    )

    class Search:
        def __init__(self):
            self.calls = 0

        def search_web_general(self, _query):
            self.calls += 1
            return {
                "search_performed": True,
                "sources": [
                    {"title": "Current national tax page", "url": authority_url},
                    {"title": "EU authority directory", "url": directory_url},
                ],
            }

    async def fetcher(url):
        return {
            "final_url": url,
            "text": authority_text if url == authority_url else directory_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
        }

    async def enrich(rows):
        return await real_enrich_authority_sources(rows, fetcher=fetcher)

    search = Search()
    source_rows = []
    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=enrich,
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [("gemini_google_search", search)], source_rows
        )

    assert search.calls == 1
    assert recovered == 1
    emta = next(row for row in pipeline.market_sources if "emta.ee" in row["url"])
    assert emta["authority_verification_status"] == (
        "independently_attested_direct_domain"
    )
    assert emta["authority_proof"]["proof_type"] == (
        "independent_public_root_attestation"
    )
    exact = next(
        row
        for row in pipeline.market_claims
        if row["evidence_class"] == "statutory_current"
    )
    assert "24 per cent" in exact["object"]
    assert exact["provenance_artifact"]["artifact_type"] == (
        "direct_authority_document"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("directory_url", "directory_text"),
    [
        (
            "https://european-union.europa.eu/estonia-authorities",
            "Official Estonia public authority directory without a publisher link.",
        ),
        (
            "https://trade.gov/estonia",
            "US government page mentioning Estonia and https://www.emta.ee",
        ),
    ],
)
async def test_recovery_rejects_unbound_or_wrong_jurisdiction_attestation(
    monkeypatch,
    directory_url,
    directory_text,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial compliance launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    authority_url = "https://www.emta.ee/en/current-tax-rate"
    authority_text = (
        "Estonia national tax authority guidance. From 1 July 2025, the current "
        "standard VAT rate is 24 per cent."
    )

    class Search:
        def search_web_general(self, _query):
            return {
                "search_performed": True,
                "sources": [
                    {"title": "National tax page", "url": authority_url},
                    {"title": "Directory", "url": directory_url},
                ],
            }

    async def fetcher(url):
        return {
            "final_url": url,
            "text": authority_text if url == authority_url else directory_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
        }

    async def enrich(rows):
        return await real_enrich_authority_sources(rows, fetcher=fetcher)

    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=enrich,
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [("gemini_google_search", Search())], []
        )

    assert recovered == 0
    assert not pipeline.market_sources


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


@pytest.mark.asyncio
async def test_targeted_attestation_skips_rejected_jurisdiction_publishers():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current", "official_statistic"],
    )

    class Search:
        def __init__(self):
            self.queries = []

        def search_web_general(self, query):
            self.queries.append(query)
            return {"search_performed": False, "sources": []}

    search = Search()
    await pipeline._targeted_authority_attestation_sources(
        [
            {
                "resolved_url": "https://trade.gov/estonia",
                "jurisdiction_binding_status": "rejected_authority_jurisdiction",
            },
            {
                "resolved_url": "https://stat.ee/data",
                "jurisdiction_binding_status": "unverified",
            },
        ],
        [("gemini_google_search", search)],
    )

    assert len(search.queries) == 1
    assert '"stat.ee"' in search.queries[0]
    assert "trade.gov" not in search.queries[0]
    assert pipeline.routing_diagnostics["targeted_authority_attestation"][
        "host_count"
    ] == 1


@pytest.mark.asyncio
async def test_rejected_authority_jurisdiction_is_diagnostic_only_not_evidence(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
    )
    eu_url = "https://taxation-customs.ec.europa.eu/estonia-tax"
    eu_text = "Estonia current standard VAT rate is 24% effective 2025-07-01."

    class Gemini:
        def is_available(self):
            return True

        def search_web_general(self, _query):
            return {
                "search_performed": True,
                "text": eu_text,
                "sources": [
                    {"title": "Wrong root", "url": "https://trade.gov/estonia"},
                    {"title": "EU tax authority", "url": eu_url},
                ],
                "claims": [{"text": eu_text, "source_urls": [eu_url]}],
            }

    async def enrich(rows):
        for row in rows:
            if "trade.gov" in row["url"]:
                row.update(
                    {
                        "resolved_url": row["url"],
                        "direct_fetch_status": "retrieved",
                        "jurisdiction_binding_status": "rejected_authority_jurisdiction",
                    }
                )
                continue
            proof = build_recognized_root_proof(
                direct_url=eu_url,
                direct_text=eu_text,
                country_codes=["EE"],
                retrieved_at="2026-08-13T00:00:00+00:00",
            )
            row.update(
                {
                    "resolved_url": eu_url,
                    "direct_fetch_status": "retrieved",
                    "jurisdiction_binding_status": "verified",
                    "source_authority": "official_public",
                    "authority_verification_status": "recognized_public_root_direct",
                    "authority_proof": proof,
                    "retrieved_at": "2026-08-13T00:00:00+00:00",
                    "authority_document_artifact": {
                        "artifact_type": "direct_authority_document",
                        "text": eu_text,
                        "sha256": proof["direct"]["content_sha256"],
                        "retrieved_at": "2026-08-13T00:00:00+00:00",
                        "authority_proof_signature": proof["proof_signature"],
                    },
                }
            )
        return rows

    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(output=SimpleNamespace(companies=[]))
    )
    with patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=Gemini(),
    ), patch(
        "backend.services.generative.searxng_search_service.SearxngSearchService.is_available",
        return_value=False,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=enrich,
    ), patch(
        "api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ):
        await pipeline._discover_via_web_search()

    assert all("trade.gov" not in row.get("url", "") for row in pipeline.market_sources)
    assert all(
        "trade.gov" not in " ".join(row.get("source_ids") or [])
        for row in pipeline.market_claims
    )
    assert any(
        row.get("reason") == "resolved_document_not_bound_to_requested_market"
        and "trade.gov" in row.get("url", "")
        for row in pipeline.routing_diagnostics["rejected_cross_market_sources"]
    )


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


def test_searxng_base_url_must_not_include_search_endpoint():
    service = SearxngSearchService("https://search.axwise.example/search")

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get"
    ) as request:
        result = service.search_web_general("market")

    assert service.is_available() is False
    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] == "unavailable"
    request.assert_not_called()


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
