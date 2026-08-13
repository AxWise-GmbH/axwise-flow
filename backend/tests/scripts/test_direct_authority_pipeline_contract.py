"""Production-shaped direct-authority claim join regressions."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

import pytest

from backend.api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.research_source_authority_service import (
    _normalized_document_text,
    _proof_signature,
    build_direct_primary_market_proof,
    build_attested_authority_proof,
    build_recognized_root_proof,
    enrich_authority_sources,
    trusted_public_root_search_scope,
    validate_authority_proof,
)


pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
)


def _source_row(direct_text: str) -> dict:
    source_url = "https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax"
    retrieved_at = "2026-08-12T12:00:00+00:00"
    proof = build_attested_authority_proof(
        direct_url=source_url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text=(
            "Official national authority directory for the Estonian Tax and "
            "Customs Board: https://www.emta.ee"
        ),
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )
    return {
        "title": "Estonian Tax and Customs Board VAT guidance",
        "url": source_url,
        "provider": "searxng",
        "provider_source_id": "searx-emta-vat",
        "retrieved_at": retrieved_at,
        "country_codes": ["EE"],
        "source_authority": "official_public",
        "authority_verification_status": "independently_attested_direct_domain",
        "authority_proof": proof,
        "authority_document_artifact": {
            "artifact_type": "direct_authority_document",
            "text": direct_text,
            "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
            "retrieved_at": retrieved_at,
            "authority_proof_signature": proof["proof_signature"],
        },
    }


def _snippet_claim(source_url: str, claim_text: str) -> dict:
    payload = f"search-result:{claim_text}"
    return {
        "text": claim_text,
        "source_urls": [source_url],
        "provider": "searxng",
        "provider_response_hash": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
        "provider_query_ids": ["query-estonia-vat"],
        "provider_queries": ["Estonia current VAT rate effective date"],
        "segment_start": 0,
        "segment_end": len(claim_text),
        "span_target": "source_snippet",
        "provenance_artifact": {
            "artifact_type": "source_snippet",
            "text": claim_text,
            "sha256": hashlib.sha256(claim_text.encode("utf-8")).hexdigest(),
        },
    }


def test_official_claim_is_rebound_to_bounded_signed_direct_document_excerpt():
    claim_text = "Estonia's standard VAT rate is 24% effective 2026-01-01."
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax "
        f"authority. Value-added tax guidance. {claim_text}"
    )
    source = _source_row(direct_text)
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Estonian category buyers",
    )

    pipeline._store_direct_web_evidence(
        [source], [_snippet_claim(source["url"], claim_text)]
    )

    stored_source = pipeline.market_sources[0]
    stored_claim = pipeline.market_claims[0]
    artifact = stored_claim["provenance_artifact"]
    assert stored_source["source_authority"] == "official_public"
    assert "_authority_document_artifact" not in stored_source
    assert "text" not in (stored_source.get("authority_document") or {})
    assert artifact["artifact_type"] == "direct_authority_document"
    assert len(artifact["text"]) < 1_000
    assert stored_claim["evidence_class"] == "statutory_current"
    assert stored_claim["current"] is True
    assert stored_claim["effective_at"] == "2026-01-01T00:00:00+00:00"

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
    assert quality["evidence_ledger"][0]["sources"][0][
        "authority_proof_signature"
    ] == stored_source["authority_proof"]["proof_signature"]


def test_official_url_cannot_authorize_a_fabricated_search_snippet():
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax "
        "authority. General value-added tax guidance."
    )
    fabricated = "Estonia's standard VAT rate is 7% effective 2026-01-01."
    source = _source_row(direct_text)
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Estonian category buyers",
    )

    pipeline._store_direct_web_evidence(
        [source], [_snippet_claim(source["url"], fabricated)]
    )
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["statutory_current"],
    )

    assert quality["status"] == "blocked"
    assert pipeline.market_claims[0]["critical"] is False
    assert pipeline.market_claims[0]["evidence_class"] == "source_linked_observation"
    assert quality["blocked_claims"] == [
        {"claim_id": "", "reason": "no_material_critical_claims_identified"}
    ]


def test_provider_paraphrase_is_replaced_by_exact_unicode_direct_quote():
    exact = "Estonia’s current VAT rate is 24% effective 2026-01-01 (käibemaks)."
    direct_text = (
        "Estonian Tax and Customs Board is the national government tax authority. "
        + exact
    )
    paraphrase = "Estonia currently applies a 24% VAT rate from January 2026."
    source = _source_row(direct_text)
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Estonian category buyers",
    )

    pipeline._store_direct_web_evidence(
        [source], [_snippet_claim(source["url"], paraphrase)]
    )

    paraphrased = next(row for row in pipeline.market_claims if row["object"] == paraphrase)
    quoted = next(row for row in pipeline.market_claims if row["object"] == exact)
    assert paraphrased["critical"] is False
    assert quoted["provenance_artifact"]["text"][
        quoted["citation_metadata"]["segment_start"] :
        quoted["citation_metadata"]["segment_end"]
    ] == exact
    assert quoted["semantic_extraction"] == "deterministic_exact_direct_quote_v1"
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


def test_authority_html_is_normalized_to_visible_unicode_text():
    normalized = _normalized_document_text(
        "<html><style>.hidden{}</style><body><h1>Hind&nbsp;Eestis</h1>"
        "<script>wrong = '€99'</script><p>Kassi toit maksab €2.99.</p></body></html>",
        is_html=True,
    )
    assert normalized == "Hind Eestis Kassi toit maksab €2.99."


@pytest.mark.asyncio
async def test_direct_retail_catalogue_price_is_signed_extracted_and_verified():
    url = "https://shop.example.ee/cat-food"
    direct_text = (
        "Official product catalogue for Estonia. "
        "The current retail price for premium cat food is €2.99 on 2026-08-12."
    )

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
        }

    source = {
        "title": "Estonian cat food catalogue",
        "url": url,
        "provider": "searxng",
        "provider_source_id": "searx-estonia-cat-price",
        "provider_query_ids": ["query-estonia-cat-price"],
        "provider_queries": ["Estonia cat food retail price"],
        "country_codes": ["EE"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source["source_authority"] == "first_party_catalog"

    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Estonian category buyers",
    )
    pipeline._store_direct_web_evidence(
        [source],
        [_snippet_claim(url, "Premium cat food costs about €3 in Estonia.")],
    )
    exact_claim = next(
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "observed_primary_market"
        and row.get("critical") is True
    )
    assert exact_claim["object"] in direct_text
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("requested_code", "final_url", "direct_text", "expected"),
    [
        (
            "EE",
            "https://shop.example.fi/cat-food",
            "Estonia product catalogue. Current retail price is 39,90 €.",
            False,
        ),
        (
            "BR",
            "https://shop.example.ee/cat-food",
            "Brazil product catalogue. Current retail price is BRL 39.90.",
            False,
        ),
        (
            "EE",
            "https://shop.example.com/cat-food",
            "Current retail price for cat food is 39,90 €.",
            False,
        ),
        (
            "EE",
            "https://shop.example.com/cat-food",
            "Estonia product catalogue. Current retail price is 39,90 €.",
            True,
        ),
        (
            "EE",
            "https://food.ec.europa.eu/estonia",
            "European Commission guidance for Estonia is current from 2026-01-01.",
            True,
        ),
    ],
)
async def test_resolved_document_must_bind_requested_jurisdiction(
    requested_code: str,
    final_url: str,
    direct_text: str,
    expected: bool,
):
    async def fetcher(_url: str) -> dict:
        return {
            "final_url": final_url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
        }

    row = {
        "title": "redirected result",
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/test",
        "provider": "gemini_google_search",
        "provider_redirect": True,
        "country_codes": [requested_code],
    }
    await enrich_authority_sources([row], fetcher=fetcher)

    assert (row.get("jurisdiction_binding_status") == "verified") is expected
    assert bool(row.get("authority_proof")) is expected


@pytest.mark.asyncio
async def test_recognized_public_root_must_cover_requested_jurisdiction():
    async def us_fetcher(_url: str) -> dict:
        return {
            "final_url": "https://trade.gov/estonia",
            "text": (
                "Estonia current value added tax rate is 24 per cent. "
                "Entry into force 01.07.2025."
            ),
            "retrieved_at": "2026-08-12T12:00:00+00:00",
        }

    us_row = {
        "url": "https://trade.gov/estonia",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([us_row], fetcher=us_fetcher)
    assert us_row["jurisdiction_binding_status"] == "rejected_authority_jurisdiction"
    assert "authority_proof" not in us_row

    async def eu_fetcher(_url: str) -> dict:
        return {
            "final_url": "https://taxation-customs.ec.europa.eu/estonia",
            "text": (
                "European Commission current VAT guidance for Estonia applies from "
                "2025-07-01 at 24 per cent."
            ),
            "retrieved_at": "2026-08-12T12:00:00+00:00",
        }

    eu_row = {
        "url": "https://taxation-customs.ec.europa.eu/estonia",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([eu_row], fetcher=eu_fetcher)
    assert eu_row["source_authority"] == "official_public"
    assert eu_row["authority_verification_status"] == "recognized_public_root_direct"


def test_recognized_root_builder_and_validator_reject_signed_wrong_jurisdiction():
    direct_url = "https://trade.gov/estonia"
    direct_text = (
        "Estonia current value added tax rate is 24 per cent. "
        "Entry into force 01.07.2025."
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"

    with pytest.raises(ValueError, match="does not cover requested jurisdiction"):
        build_recognized_root_proof(
            direct_url=direct_url,
            direct_text=direct_text,
            country_codes=["EE"],
            retrieved_at=retrieved_at,
        )
    with pytest.raises(ValueError, match="does not cover requested jurisdiction"):
        build_recognized_root_proof(
            direct_url=direct_url,
            direct_text=direct_text,
            country_codes=["US", "EE"],
            retrieved_at=retrieved_at,
        )

    valid_us_proof = build_recognized_root_proof(
        direct_url=direct_url,
        direct_text=direct_text,
        country_codes=["US"],
        retrieved_at=retrieved_at,
    )
    forged_payload = {
        key: value
        for key, value in valid_us_proof.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    forged_payload["country_codes"] = ["EE"]
    signed_wrong_jurisdiction = {
        **forged_payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(forged_payload),
    }
    source = {
        "url": direct_url,
        "retrieved_at": retrieved_at,
        "country_codes": ["EE"],
        "source_authority": "official_public",
        "authority_proof": signed_wrong_jurisdiction,
    }

    assert validate_authority_proof(
        source,
        requested_country_codes=["EE"],
    ) is False

    mixed_payload = {
        key: value
        for key, value in valid_us_proof.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    mixed_payload["country_codes"] = ["US", "EE"]
    source["authority_proof"] = {
        **mixed_payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(mixed_payload),
    }
    assert validate_authority_proof(
        source,
        requested_country_codes=["EE"],
    ) is False


def test_real_publisher_shapes_extract_dynamic_dates_percent_and_price_order():
    retrieved_at = "2026-08-12T12:00:00+00:00"
    statutory = (
        "The current value added tax rate is 24 per cent. "
        "Entry into force 01.07.2025."
    )
    statistic = (
        "Posted on 30 January 2026. According to Statistics Estonia, total "
        "retail turnover in 2025 was 10.8 billion euros."
    )
    catalog = (
        "Estonia kassitoit tootekataloog. Hind 39,90 € on 2026-08-12."
    )

    statutory_rows = B2BDataPipeline._direct_document_claim_passages(
        statutory, retrieved_at=retrieved_at
    )
    statistic_rows = B2BDataPipeline._direct_document_claim_passages(
        statistic, retrieved_at=retrieved_at
    )
    catalog_rows = B2BDataPipeline._direct_document_claim_passages(
        catalog, retrieved_at=retrieved_at
    )

    assert statutory_rows[0]["evidence_class"] == "statutory_current"
    assert statutory_rows[0]["effective_at"] == "2025-07-01T00:00:00+00:00"
    assert statistic_rows[0]["evidence_class"] == "official_statistic"
    assert statistic_rows[0]["published_at"] == "2026-01-30T00:00:00+00:00"
    assert statistic_rows[0]["observation_end"] == "2025-12-31T00:00:00+00:00"
    assert statistic_rows[0]["latest_release"] is True
    assert catalog_rows[0]["evidence_class"] == "observed_primary_market"
    assert "39,90 €" in catalog_rows[0]["text"]


def test_current_tax_authority_page_shape_extracts_material_rule_without_catalogue():
    direct_page = (
        "Last updated 1 July 2025. Standard VAT rate. "
        "From 1 July 2025, the standard VAT rate is 24 per cent. "
        "The guidance applies to taxable supplies by registered businesses."
    )

    rows = B2BDataPipeline._direct_document_claim_passages(
        direct_page,
        retrieved_at="2026-08-13T00:00:00+00:00",
    )

    statutory = [row for row in rows if row["evidence_class"] == "statutory_current"]
    assert len(statutory) == 1
    assert statutory[0]["effective_at"] == "2025-07-01T00:00:00+00:00"
    assert statutory[0]["current"] is True
    assert "24 per cent" in statutory[0]["text"]


def test_long_punctuation_free_statistics_cards_use_bounded_update_windows():
    navigation = "Navigation filter category download dataset " * 35
    normalized_page = (
        navigation
        + "Last updated: 13 May 2026 08:00 Population figure as at 1 January "
        "2026 was 1,369,995 persons resident in the country "
        + ("table heading age group region value " * 45)
        + "Last updated: 31 July 2026 09:00 Retail turnover volume for the "
        "second quarter 2026 "
        "was 98.7 points according to the published statistical table "
        + ("download csv metadata series " * 45)
    )

    rows = B2BDataPipeline._direct_document_claim_passages(
        normalized_page,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )

    statistics = [row for row in rows if row["evidence_class"] == "official_statistic"]
    assert len(statistics) == 2
    assert all(len(row["text"]) <= 1_200 for row in statistics)
    assert all(row["text"] in " ".join(normalized_page.split()) for row in statistics)
    assert statistics[0]["published_at"] == "2026-05-13T00:00:00+00:00"
    assert statistics[0]["observation_end"] == "2026-01-01T00:00:00+00:00"
    assert statistics[0]["latest_release"] is True
    assert statistics[1]["published_at"] == "2026-07-31T00:00:00+00:00"
    assert statistics[1]["observation_end"] == "2026-06-30T00:00:00+00:00"
    assert statistics[1]["latest_release"] is True


def test_partial_year_statistic_never_invents_future_observation_end():
    rows = B2BDataPipeline._direct_document_claim_passages(
        "Posted on 27 May 2026. Internal trade turnover for 2026 was "
        "10.8 billion euros.",
        retrieved_at="2026-08-12T12:00:00+00:00",
    )

    assert rows == []


def test_statistic_period_range_uses_latest_completed_quarter():
    rows = B2BDataPipeline._direct_document_claim_passages(
        "Posted on 27 May 2026. Internal trade turnover by quarters, "
        "1st quarter 2025 – 1st quarter 2026 was 10.8 billion euros.",
        retrieved_at="2026-08-12T12:00:00+00:00",
    )

    assert rows[0]["evidence_class"] == "official_statistic"
    assert rows[0]["published_at"] == "2026-05-27T00:00:00+00:00"
    assert rows[0]["observation_end"] == "2026-03-31T00:00:00+00:00"


def test_statistic_publication_date_is_bound_to_release_marker_not_table_cell():
    rows = B2BDataPipeline._direct_document_claim_passages(
        "May 2026 -6 -25 June 2026 9 -16 Internal trade turnover by "
        "quarters, 1st quarter 2025 – 1st quarter 2026 was 10.8 billion "
        "euros Last updated: 31 July 2026 09:00",
        retrieved_at="2026-08-12T12:00:00+00:00",
    )

    assert rows[0]["published_at"] == "2026-07-31T00:00:00+00:00"
    assert rows[0]["observation_end"] == "2026-03-31T00:00:00+00:00"


@pytest.mark.asyncio
async def test_cached_unresolved_publisher_is_attested_by_exact_trusted_root_host_link():
    publisher_url = "https://statistics-authority.example.ee/latest"
    publisher_text = (
        "Last updated: 13 May 2026. The population in 2026 was "
        "1,369,995 persons."
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    unresolved = {
        "url": publisher_url,
        "resolved_url": publisher_url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "direct_fetch_status": "retrieved",
        "_direct_document_candidate": {
            "final_url": publisher_url,
            "text": publisher_text,
            "retrieved_at": retrieved_at,
        },
    }
    anchor_url = "https://commission.europa.eu/public-authorities/estonia"
    anchor_text = (
        "European Commission public authority directory for Estonia: the official "
        "national statistics authority is https://statistics-authority.example.ee"
    )
    anchor = {
        "url": anchor_url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    fetch_calls = []

    async def fetcher(url: str) -> dict:
        fetch_calls.append(url)
        assert url == anchor_url
        return {
            "final_url": anchor_url,
            "text": anchor_text,
            "retrieved_at": retrieved_at,
        }

    await enrich_authority_sources([unresolved, anchor], fetcher=fetcher)

    assert fetch_calls == [anchor_url]
    assert unresolved["source_authority"] == "official_public"
    assert unresolved["authority_verification_status"] == (
        "independently_attested_direct_domain"
    )
    assert validate_authority_proof(
        {
            **unresolved,
            "retrieved_at": retrieved_at,
            "country_codes": ["EE"],
        },
        requested_country_codes=["EE"],
    )
    assert trusted_public_root_search_scope(["EE"]) == "site:europa.eu"
    assert trusted_public_root_search_scope(["BR"]) == "site:gov.br"


@pytest.mark.asyncio
async def test_targeted_gemini_redirect_must_fetch_trusted_root_before_attesting():
    publisher_url = "https://statistics-authority.example.ee/latest"
    publisher_text = (
        "Last updated: 13 May 2026. Population as at 1 January 2026 was "
        "1,369,995 persons in Estonia."
    )
    redirect_url = (
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/anchor"
    )
    anchor_url = "https://commission.europa.eu/public-authorities/estonia"
    anchor_text = (
        "European Commission public authority directory for Estonia: the official "
        "national statistics authority is https://statistics-authority.example.ee"
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    unresolved = {
        "url": publisher_url,
        "resolved_url": publisher_url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "direct_fetch_status": "retrieved",
        "_direct_document_candidate": {
            "final_url": publisher_url,
            "text": publisher_text,
            "retrieved_at": retrieved_at,
        },
    }

    class Gemini:
        def search_web_general(self, _query: str) -> dict:
            return {
                "search_performed": True,
                "sources": [
                    {
                        "title": "Authority directory",
                        "url": redirect_url,
                        "provider_redirect": True,
                    }
                ],
                "runtime_diagnostics": {"status": "completed", "call_count": 1},
            }

    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food launch",
        target_user="Retail buyer",
        required_evidence_classes=["official_statistic"],
    )
    candidates = await pipeline._targeted_authority_attestation_sources(
        [unresolved], [("gemini_google_search", Gemini())]
    )
    assert candidates[0]["provider_redirect"] is True
    assert "authority_proof" not in candidates[0]

    async def fetcher(url: str) -> dict:
        assert url == redirect_url
        return {
            "final_url": anchor_url,
            "text": anchor_text,
            "retrieved_at": retrieved_at,
        }

    await enrich_authority_sources([unresolved, *candidates], fetcher=fetcher)

    assert unresolved["authority_verification_status"] == (
        "independently_attested_direct_domain"
    )
    assert validate_authority_proof(
        {**unresolved, "retrieved_at": retrieved_at},
        requested_country_codes=["EE"],
    )


@pytest.mark.asyncio
async def test_untrusted_targeted_result_cannot_self_attest_publisher():
    publisher_url = "https://statistics-authority.example.ee/latest"
    publisher_text = (
        "Estonia official statistics authority. Last updated 13 May 2026. "
        "Population as at 1 January 2026 was 1,369,995 persons."
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    rows = [
        {
            "url": publisher_url,
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        },
        {
            "url": "https://search-result.example.com/directory",
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        },
    ]

    async def fetcher(url: str) -> dict:
        return {
            "final_url": url,
            "text": (
                publisher_text
                if url == publisher_url
                else "Estonia directory links statistics-authority.example.ee"
            ),
            "retrieved_at": retrieved_at,
        }

    await enrich_authority_sources(rows, fetcher=fetcher)

    assert rows[0].get("source_authority") != "official_public"
    assert "authority_proof" not in rows[0]


@pytest.mark.asyncio
async def test_cross_jurisdiction_trusted_root_cannot_attest_local_publisher():
    publisher_url = "https://stat.example.ee/latest"
    publisher_text = (
        "Estonia national statistics authority. Last updated 13 May 2026. "
        "Population as at 1 January 2026 was 1,369,995 persons."
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    us_attestation_url = "https://trade.gov/estonia-directory"
    us_attestation_text = (
        "US government authority directory for Estonia names https://stat.example.ee"
    )

    with pytest.raises(
        ValueError,
        match="attestation root does not cover requested jurisdiction",
    ):
        build_attested_authority_proof(
            direct_url=publisher_url,
            direct_text=publisher_text,
            attestation_url=us_attestation_url,
            attestation_text=us_attestation_text,
            country_codes=["EE"],
            retrieved_at=retrieved_at,
        )
    with pytest.raises(
        ValueError,
        match="attestation root does not cover requested jurisdiction",
    ):
        build_attested_authority_proof(
            direct_url=publisher_url,
            direct_text=publisher_text,
            attestation_url=us_attestation_url,
            attestation_text=us_attestation_text,
            country_codes=["US", "EE"],
            retrieved_at=retrieved_at,
        )

    valid = build_attested_authority_proof(
        direct_url=publisher_url,
        direct_text=publisher_text,
        attestation_url="https://commission.europa.eu/estonia-directory",
        attestation_text=(
            "European Commission official public authority directory for Estonia "
            "names https://stat.example.ee"
        ),
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )
    forged_payload = {
        key: value
        for key, value in valid.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    forged_payload["attestation"] = {
        **forged_payload["attestation"],
        "final_url": us_attestation_url,
        "final_host": "trade.gov",
        "content_sha256": hashlib.sha256(
            us_attestation_text.encode("utf-8")
        ).hexdigest(),
        "excerpt": {
            "text": us_attestation_text,
            "start": 0,
            "end": len(us_attestation_text),
            "sha256": hashlib.sha256(
                us_attestation_text.encode("utf-8")
            ).hexdigest(),
        },
    }
    forged = {
        **forged_payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(forged_payload),
    }
    assert validate_authority_proof(
        {
            "url": publisher_url,
            "retrieved_at": retrieved_at,
            "country_codes": ["EE"],
            "source_authority": "official_public",
            "authority_proof": forged,
        },
        requested_country_codes=["EE"],
    ) is False

    async def fetcher(url: str) -> dict:
        if url == publisher_url:
            return {
                "final_url": publisher_url,
                "text": publisher_text,
                "retrieved_at": retrieved_at,
            }
        return {
            "final_url": us_attestation_url,
            "text": us_attestation_text,
            "retrieved_at": retrieved_at,
        }

    rows = [
        {
            "url": publisher_url,
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        },
        {
            "url": us_attestation_url,
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        },
    ]
    await enrich_authority_sources(rows, fetcher=fetcher)
    assert rows[1]["jurisdiction_binding_status"] == (
        "rejected_authority_jurisdiction"
    )
    assert rows[0].get("source_authority") != "official_public"
    assert "authority_proof" not in rows[0]


def test_effective_date_is_bound_to_entry_into_force_not_prior_amendment_date():
    text = (
        "The current value added tax rate is 24 per cent. "
        "[RT I, 02.01.2025, 2 - entry into force 01.07.2025]."
    )
    rows = B2BDataPipeline._direct_document_claim_passages(
        text,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert rows[0]["effective_at"] == "2025-07-01T00:00:00+00:00"


@pytest.mark.asyncio
async def test_brazil_brl_catalogue_proof_extracts_and_passes_quality():
    url = "https://shop.example.com.br/cat-food"
    direct_text = (
        "Brazil product catalogue. Current retail price for cat food is "
        "BRL 39.90 on 2026-08-12."
    )

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
        }

    source = {
        "title": "Brazil cat food catalogue",
        "url": url,
        "provider": "searxng",
        "provider_source_id": "searx-brazil-cat-price",
        "provider_query_ids": ["query-brazil-cat-price"],
        "provider_queries": ["Brazil cat food retail price local currency"],
        "country_codes": ["BR"],
        "market_terms": ["Brazil"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source["source_authority"] == "first_party_catalog"

    pipeline = B2BDataPipeline(
        location="Brazil",
        business_problem="Launch cat food commercially",
        target_user="Brazilian category buyers",
    )
    pipeline._store_direct_web_evidence([source], [])
    claim = next(
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "observed_primary_market"
    )
    assert "BRL 39.90" in claim["object"]
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["BR"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]
