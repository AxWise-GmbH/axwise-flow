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
