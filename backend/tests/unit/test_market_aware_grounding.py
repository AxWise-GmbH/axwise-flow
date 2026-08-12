from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.research.simulation_bridge.models import CompanyDiscoveryItem
from api.research.simulation_bridge.services.market_scope import (
    resolve_market_scope,
)
from api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from backend.services.generative.gemini_search_service import GeminiSearchService
from backend.services.generative.searxng_search_service import SearxngSearchService


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
    assert resolve_market_scope("Munich").openregister_locality == "München"
    assert resolve_market_scope("Germany").openregister_locality is None
    assert resolve_market_scope("Tallinn, Estonia").openregister_locality is None


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
        "gemini_google_search",
        "searxng",
    ]
    assert pipeline.routing_diagnostics["providers"][0]["reason"] == (
        "provider_error:RuntimeError"
    )
    assert len(pipeline.market_sources) == 1
    assert companies[0].website is None
    assert companies[0].pain_point_sources is None


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
    assert result["sources"] == [
        {
            "title": "Estonian Agriculture and Food Board",
            "url": "https://pta.agri.ee/en",
        }
    ]
    assert "Official feed and food market guidance" in result["text"]
    assert request.call_args.kwargs["follow_redirects"] is False


def test_searxng_rejects_untrusted_cleartext_remote_endpoint():
    assert SearxngSearchService("http://public.example").is_available() is False
    assert SearxngSearchService("http://localhost:8080").is_available() is True


def test_gemini_search_preserves_claim_to_source_citations():
    service = GeminiSearchService.__new__(GeminiSearchService)
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
                    text="Estonian feed operators must follow applicable feed rules."
                ),
                grounding_chunk_indices=[0],
                confidence_scores=[0.96],
            )
        ],
    )
    response = SimpleNamespace(
        text="Grounded response",
        candidates=[SimpleNamespace(grounding_metadata=metadata)],
    )
    service._client = SimpleNamespace(
        models=SimpleNamespace(generate_content=MagicMock(return_value=response))
    )

    result = service.search_web_general("Estonian cat food regulation")

    assert result["claims"] == [
        {
            "text": "Estonian feed operators must follow applicable feed rules.",
            "source_urls": ["https://pta.agri.ee/en"],
            "confidence_scores": [0.96],
        }
    ]
