"""Production-shaped direct-authority claim join regressions."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from datetime import datetime, timezone

import pytest

from backend.api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    build_topic_seed,
)
from backend.services.research_source_authority_service import (
    _commercial_offer_evidence,
    _normalized_document_text,
    _proof_signature,
    _structured_statistical_observations,
    build_direct_primary_market_proof,
    build_attested_authority_proof,
    build_recognized_root_proof,
    claim_matching_offer_evidence,
    enrich_authority_sources,
    trusted_public_root_search_scope,
    validate_authority_proof,
)


pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
)


def _offer_evidence(*, name: str, price: str, currency: str) -> list[dict]:
    return _commercial_offer_evidence(
        '<script type="application/ld+json">'
        f'{{"@type":"Product","name":"{name}","offers":'
        f'{{"@type":"Offer","price":"{price}","priceCurrency":"{currency}"}}}}'
        "</script>"
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
    assert stored_source["_authority_document_artifact"]["text"] == direct_text
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
        {"claim_id": "", "reason": "no_verified_complete_material_facts"}
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


def test_live_shaped_merchant_config_binds_product_price_not_cart_or_other_value():
    raw_html = """
    <div>Ostukorv 0,00 €</div>
    <div data-component="productCategoryList"
      data-config='{&quot;products&quot;:[{&quot;id&quot;:&quot;45933&quot;,
      &quot;sku&quot;:&quot;158130&quot;,&quot;name&quot;:&quot;Purenatural Sensitive koeratoit 12 kg&quot;,
      &quot;price&quot;:&quot;64,90\u00a0€&quot;,&quot;priceSimple&quot;:64.9,
      &quot;actions&quot;:{&quot;isSalable&quot;:true}}]}'></div>
    <div>Purenatural Sensitive koeratoit 12 kg Tavahind 64,90 €</div>
    <div>Unrelated Beta product 999,00 €</div>
    """
    direct_text = _normalized_document_text(raw_html, is_html=True)
    offers = _commercial_offer_evidence(raw_html)

    assert len(offers) == 1
    assert offers[0]["signal_type"] == "merchant_product_config"
    assert offers[0]["product_id"] == "158130"
    assert offers[0]["price"] == "64.9"
    assert offers[0]["price_currency"] == "EUR"
    proof = build_direct_primary_market_proof(
        direct_url="https://shop.example.ee/products",
        direct_text=direct_text,
        country_codes=["EE"],
        commercial_offer_evidence=offers,
        direct_raw_html=raw_html,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert claim_matching_offer_evidence(
        proof, "Purenatural Sensitive koeratoit 12 kg Tavahind 64,90 €"
    )
    assert claim_matching_offer_evidence(proof, "Ostukorv 0,00 €") is None
    assert claim_matching_offer_evidence(
        proof, "Unrelated Beta product 999,00 €"
    ) is None


@pytest.mark.parametrize(
    ("country_code", "visible_price", "currency"),
    [
        ("US", "$12.99", "USD"),
        ("CA", "$12.99", "CAD"),
        ("TH", "฿499.00", "THB"),
    ],
)
def test_ambiguous_currency_symbol_uses_one_raw_derived_offer_in_one_country(
    country_code: str,
    visible_price: str,
    currency: str,
):
    direct_text = f"Alpha cat food SKU A123 current price {visible_price}."
    raw_html = (
        f"<div>{direct_text}</div><script type=\"application/ld+json\">"
        f'{{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        f'"offers":{{"@type":"Offer","price":"{visible_price[1:]}",'
        f'"priceCurrency":"{currency}"}}}}'
        "</script>"
    )
    proof = build_direct_primary_market_proof(
        direct_url=f"https://shop.example.{country_code.casefold()}/alpha",
        direct_text=direct_text,
        country_codes=[country_code],
        direct_raw_html=raw_html,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert claim_matching_offer_evidence(proof, direct_text)


def test_ambiguous_currency_symbol_rejects_multiple_offer_currencies():
    direct_text = "United States Alpha cat food SKU A123 current price $12.99."
    raw_html = (
        f"<div>{direct_text}</div><script type=\"application/ld+json\">"
        '[{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"USD"}},'
        '{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"CAD"}}]'
        "</script>"
    )
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.com/alpha",
            direct_text=direct_text,
            country_codes=["US"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-12T12:00:00+00:00",
        )


def test_ambiguous_symbol_rejects_self_asserted_wrong_country():
    direct_text = "United States Alpha cat food SKU A123 current price $12.99."
    raw_html = (
        f"<div>{direct_text}</div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"USD"}}'
        "</script>"
    )
    with pytest.raises(ValueError, match="does not bind requested jurisdiction"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.com/alpha",
            direct_text=direct_text,
            country_codes=["CA"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-12T12:00:00+00:00",
        )
    with pytest.raises(ValueError, match="exactly one country cell"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.com/alpha",
            direct_text=direct_text,
            country_codes=["US", "CA"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-12T12:00:00+00:00",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "direct_text",
    [
        "Wikipedia article: the reported cat-food price was EUR 29.90 on 2026-08-12.",
        "Government tax guidance: a filing threshold of EUR 29.90 applies in Estonia.",
    ],
)
async def test_generic_currency_page_without_fetched_offer_is_not_first_party_catalog(
    direct_text: str,
):
    async def fetcher(_url: str) -> dict:
        return {
            "final_url": "https://publisher.example.ee/article",
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": [],
        }

    source = {
        "url": "https://publisher.example.ee/article",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)

    assert source.get("source_authority") != "first_party_catalog"
    assert source.get("authority_proof") is None


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
            "commercial_offer_evidence": _offer_evidence(
                name="premium cat food", price="2.99", currency="EUR"
            ),
            "_structured_evidence_html": (
                f"<div>{direct_text}</div><script type=\"application/ld+json\">"
                '{"@type":"Product","name":"premium cat food","offers":'
                '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
                "</script>"
            ),
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
async def test_delivery_threshold_is_not_authorized_by_product_offer():
    url = "https://shop.example.ee/cat-food/alpha-a123"
    direct_text = (
        "Alpha kana kassitoit SKU A123 400 g Tavahind 2,99 EUR "
        "Tellimuse tasuta tarne alampiir 50,00 EUR observed 2026-08-12."
    )
    raw_html = (
        f"<div>{direct_text}</div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha kana kassitoit",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {"url": url, "country_codes": ["EE"], "market_terms": ["Estonia"]}
    await enrich_authority_sources([source], fetcher=fetcher)
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Category buyer",
    )
    pipeline._store_direct_web_evidence([source], [])
    quality = evaluate_critical_claims(
        {"market_sources": pipeline.market_sources, "market_claims": pipeline.market_claims},
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    values = [row["normalized_value"] for row in quality["verified_facts"]]
    assert values == ["2.99:eur"]
    assert all("50" not in row["display_value"] for row in quality["verified_facts"])


@pytest.mark.asyncio
async def test_resigned_offer_price_cannot_authorize_delivery_threshold():
    url = "https://shop.example.ee/cat-food/alpha-a123"
    direct_text = (
        "Estonia Alpha kana kassitoit SKU A123 400 g Tavahind 2,99 EUR "
        "Tellimuse tasuta tarne alampiir 50,00 EUR observed 2026-08-12."
    )
    raw_html = (
        f"<div>{direct_text}</div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha kana kassitoit",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    proof = build_direct_primary_market_proof(
        direct_url=url,
        direct_text=direct_text,
        country_codes=["EE"],
        direct_raw_html=raw_html,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    forged = copy.deepcopy(proof)
    forged_offer = forged["commercial_offer_evidence"][0]
    forged_offer["price"] = "50.00"
    unsigned_offer = {key: value for key, value in forged_offer.items() if key != "sha256"}
    forged_offer["sha256"] = hashlib.sha256(
        json.dumps(unsigned_offer, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    payload = {
        key: value for key, value in forged.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    forged["proof_signature"] = _proof_signature(payload)
    source = {
        "url": url,
        "country_codes": ["EE"],
        "retrieved_at": forged["retrieved_at"],
        "source_authority": "first_party_catalog",
        "authority_verification_status": "direct_primary_market_observation",
        "authority_proof": forged,
        "jurisdiction_binding_status": "verified",
        "_structured_evidence_html": raw_html,
        "authority_document_artifact": {
            "artifact_type": "direct_authority_document",
            "text": direct_text,
            "sha256": forged["direct"]["content_sha256"],
            "retrieved_at": forged["retrieved_at"],
            "authority_proof_signature": forged["proof_signature"],
        },
    }
    pipeline = B2BDataPipeline(
        location="Estonia", business_problem="Launch cat food", target_user="Buyer"
    )
    pipeline._store_direct_web_evidence([source], [])
    quality = evaluate_critical_claims(
        {"market_sources": pipeline.market_sources, "market_claims": pipeline.market_claims},
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "blocked"
    assert quality["verified_count"] == 0


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
            "Estonia product catalogue. Current retail price for cat food is 39,90 €.",
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
        offer_html = (
            '<script type="application/ld+json">'
            f'{{"@type":"Product","name":"cat food","offers":'
            f'{{"@type":"Offer","price":"39.90","priceCurrency":"'
            f'{"BRL" if "BRL" in direct_text else "EUR"}"}}}}'
            "</script>"
        )
        offer_rows = (
            _commercial_offer_evidence(offer_html)
            if "39" in direct_text
            else []
        )
        return {
            "final_url": final_url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": offer_rows,
            "_structured_evidence_html": (
                f"<div>{direct_text}</div>{offer_html}" if offer_rows else ""
            ),
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


def test_live_shaped_structured_stat_table_binds_latest_positional_fact():
    raw_html = """
    <figure data-uuid="trade-chart">
      <h2>Household expenditure on pets and cat food</h2>
      <a href="https://andmed.stat.ee/en/stat/KM0107">dataset</a>
      <table data-series-orientation="column">
        <thead><tr>
          <th data-series-name="Cat food net sales" data-series-unit="million euros">Cat food net sales</th>
          <th data-series-name="Cat food retail sales" data-series-unit="million euros">Cat food retail sales</th>
        </tr></thead>
        <tbody>
          <tr><th data-category="4th quarter 2025">4th quarter 2025</th><td>7.80</td><td>2.10</td></tr>
          <tr><th data-category="1st quarter 2026">1st quarter 2026</th><td>8.12</td><td>2.33</td></tr>
        </tbody>
      </table>
      <p>Last updated: 27 May 2026</p>
    </figure>
    """
    observations = _structured_statistical_observations(raw_html)

    assert observations[0]["dataset_id"] == "KM0107"
    assert observations[0]["series"] == "Cat food net sales"
    assert observations[0]["unit"] == "million euros"
    assert observations[0]["period"] == "1st quarter 2026"
    assert observations[0]["observation_end"] == "2026-03-31T00:00:00+00:00"
    assert observations[0]["value"] == "8.12"
    assert observations[0]["row_cells"] == ["8.12", "2.33"]
    assert all(row["value"] != "2026" for row in observations)

    direct_text = _normalized_document_text(raw_html, is_html=True)
    retrieved_at = "2026-08-12T12:00:00+00:00"
    url = "https://www.stat.example.ee/internal-trade"
    proof = build_attested_authority_proof(
        direct_url=url,
        direct_text="Statistics Estonia official statistics office. " + direct_text,
        attestation_url="https://european-union.europa.eu/statistics-authorities",
        attestation_text="Official statistics authority directory: https://www.stat.example.ee",
        country_codes=["EE"],
        retrieved_at=retrieved_at,
        structured_statistical_observations=observations,
        direct_raw_html=raw_html,
    )
    signed_text = "Statistics Estonia official statistics office. " + direct_text
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-food-stat-test",
            title="Cat food commercial launch",
            problem_scope="Assess cat food demand using official statistics.",
            industry="Pet food",
            exact_topic_anchors=("cat food",),
        ),
        ConfirmedMarketScope(
            scope_label="Estonia", country_codes=("EE",), confirmed=True
        ),
    ).model_dump(mode="json")
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market assessment",
        target_user="Retail buyer",
        model=None,
        required_evidence_classes=["official_statistic"],
        topic_seed_contract=topic_seed,
    )
    pipeline._store_direct_web_evidence(
        [
            {
                "url": url,
                "provider": "searxng",
                "country_codes": ["EE"],
                "retrieved_at": retrieved_at,
                "jurisdiction_binding_status": "verified",
                "source_authority": "official_public",
                "authority_verification_status": "independently_attested_direct_domain",
                "authority_proof": proof,
                "_structured_evidence_html": raw_html,
                "authority_document_artifact": {
                    "artifact_type": "direct_authority_document",
                    "text": signed_text,
                    "sha256": hashlib.sha256(signed_text.encode()).hexdigest(),
                    "retrieved_at": retrieved_at,
                    "authority_proof_signature": proof["proof_signature"],
                },
            }
        ],
        [],
    )
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            "topic_seed_contract": topic_seed,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )

    assert quality["status"] == "passed", quality
    assert quality["conflict_count"] == 0
    assert quality["verified_facts"][0]["display_value"] == "8.12 million euros"
    assert quality["verified_facts"][0]["normalized_value"] == "8120000:eur"

    missing_topic = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert missing_topic["status"] == "blocked"
    assert missing_topic["topic_contract_status"] == "missing_or_invalid"
    assert missing_topic["candidate_rejection_counts"] == {
        "topic_contract_missing_or_invalid": 1
    }


def test_motor_vehicle_statistic_cannot_cover_cat_food_topic():
    raw_html = """
    <figure data-uuid="vehicle-trade">
      <h2>Sale of motor vehicles</h2>
      <a href="https://andmed.stat.ee/en/stat/VEH001">dataset</a>
      <table data-series-orientation="column"><thead><tr>
        <th data-series-name="Motor vehicle retail sales"
          data-series-unit="million euros">Motor vehicle retail sales</th>
      </tr></thead><tbody><tr>
        <th data-category="1st quarter 2026">1st quarter 2026</th><td>8.12</td>
      </tr></tbody></table><p>Last updated: 27 May 2026</p>
      <footer hidden>Cat food market report</footer>
    </figure>
    """
    observations = _structured_statistical_observations(raw_html)
    direct_text = (
        "Statistics Estonia official statistics office. "
        + _normalized_document_text(raw_html, is_html=True)
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    url = "https://www.stat.example.ee/vehicle-trade"
    proof = build_attested_authority_proof(
        direct_url=url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/statistics-authorities",
        attestation_text="Official statistics authority: https://www.stat.example.ee",
        country_codes=["EE"],
        retrieved_at=retrieved_at,
        structured_statistical_observations=observations,
        direct_raw_html=raw_html,
    )
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-food-motor-negative",
            title="Cat food commercial launch",
            problem_scope="Assess cat food demand using official statistics.",
            industry="Pet food",
            exact_topic_anchors=("cat food",),
        ),
        ConfirmedMarketScope(
            scope_label="Estonia", country_codes=("EE",), confirmed=True
        ),
    ).model_dump(mode="json")
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market assessment",
        target_user="Retail buyer",
        required_evidence_classes=["official_statistic"],
        topic_seed_contract=topic_seed,
    )
    pipeline._store_direct_web_evidence(
        [{
            "url": url,
            "country_codes": ["EE"],
            "retrieved_at": retrieved_at,
            "jurisdiction_binding_status": "verified",
            "source_authority": "official_public",
            "authority_verification_status": "independently_attested_direct_domain",
            "authority_proof": proof,
            "_structured_evidence_html": raw_html,
            "authority_document_artifact": {
                "artifact_type": "direct_authority_document",
                "text": direct_text,
                "sha256": hashlib.sha256(direct_text.encode()).hexdigest(),
                "retrieved_at": retrieved_at,
                "authority_proof_signature": proof["proof_signature"],
            },
        }],
        [],
    )

    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            "topic_seed_contract": topic_seed,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )

    assert quality["status"] == "blocked"
    assert quality["verified_claim_classes"] == []
    assert quality["missing_claim_classes"] == ["official_statistic"]
    assert pipeline.routing_diagnostics["topic_mismatch_observation_count"] == 1


def test_row_oriented_stat_table_keeps_latest_bound_series_not_heading_number():
    raw_html = """
    <figure data-uuid="km024-chart">
      <h2>Quarterly trade, 1st quarter 2026, million euros</h2>
      <a href="https://andmed.stat.ee/en/stat/KM024">dataset</a>
      <table data-series-orientation="row">
        <thead><tr><th>Series</th>
          <th data-category="4th quarter 2025">4th quarter 2025</th>
          <th data-category="1st quarter 2026">1st quarter 2026</th>
        </tr></thead>
        <tbody><tr><th data-series-name="retail-volume-index"
          data-series-unit="points">Retail turnover volume index</th>
          <td>97.2</td><td>98.7</td></tr></tbody>
      </table><p>Last updated: 27 May 2026</p>
    </figure>
    """

    observations = _structured_statistical_observations(raw_html)

    assert len(observations) == 1
    assert observations[0]["dataset_id"] == "KM024"
    assert observations[0]["series"] == "Retail turnover volume index"
    assert observations[0]["series_code"] == "retail-volume-index"
    assert observations[0]["unit"] == "points"
    assert observations[0]["period"] == "1st quarter 2026"
    assert observations[0]["value"] == "98.7"
    assert observations[0]["cell_text"] == "98.7"
    assert all(row["value"] != "2026" for row in observations)


def test_full_flat_stat_table_date_like_cells_do_not_crash_direct_consumption():
    raw_html = """
    <figure data-uuid="km024-live-shape">
      <h2>Quarterly trade 2026, million euros</h2>
      <a href="https://andmed.stat.ee/en/stat/KM024">dataset</a>
      <table data-series-orientation="row"><thead><tr><th>Series</th>
        <th data-category="1st quarter 2026">1st quarter 2026</th></tr></thead>
        <tbody>
          <tr><th data-series-name="retail-index" data-series-unit="points">
            Retail turnover volume index</th><td>98.7</td></tr>
          <tr><th data-series-name="calendar-like-values" data-series-unit="points">
            Monthly table changes</th><td>-16</td></tr>
        </tbody></table><p>Last updated: 31 July 2026 09:00</p>
    </figure>
    """
    normalized = _normalized_document_text(raw_html, is_html=True)

    # Generic exact-quote extraction may decline the flattened table, but it
    # must never throw before the structured positional path is consumed.
    B2BDataPipeline._direct_document_claim_passages(
        normalized, retrieved_at="2026-08-12T12:00:00+00:00"
    )
    observations = _structured_statistical_observations(raw_html)
    assert any(row["value"] == "98.7" for row in observations)


def test_resigned_structured_stat_value_not_present_in_cell_is_rejected():
    raw_html = """
    <figure data-uuid="trade-chart">
      <a href="https://andmed.stat.ee/en/stat/KM0107">dataset</a>
      <table><thead><tr><th data-series-name="retail-sales"
        data-series-unit="million euros">Retail sales</th></tr></thead>
        <tbody><tr><th data-category="1st quarter 2026">1st quarter 2026</th>
          <td>100.0</td></tr></tbody></table>
      <p>Last updated: 27 May 2026</p>
    </figure>
    """
    direct_text = (
        "Statistics Estonia official statistics office. "
        + _normalized_document_text(raw_html, is_html=True)
    )
    forged = dict(_structured_statistical_observations(raw_html)[0])
    forged["value"] = "999.0"
    unsigned = {
        key: value for key, value in forged.items() if key != "observation_sha256"
    }
    import json
    forged["observation_sha256"] = hashlib.sha256(
        json.dumps(
            unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()
    retrieved_at = "2026-08-12T12:00:00+00:00"
    url = "https://www.stat.example.ee/retail"
    with pytest.raises(ValueError, match="do not match fetched raw HTML"):
        build_attested_authority_proof(
            direct_url=url,
            direct_text=direct_text,
            attestation_url="https://european-union.europa.eu/statistics-authorities",
            attestation_text="Official statistics directory: https://www.stat.example.ee",
            country_codes=["EE"],
            retrieved_at=retrieved_at,
            structured_statistical_observations=[forged],
            direct_raw_html=raw_html,
        )


def test_resigned_structured_stat_cannot_map_sibling_cell_to_wrong_series():
    raw_html = """
    <figure data-uuid="trade-chart"><a href="https://andmed.stat.ee/en/stat/KM0107">dataset</a>
      <table><thead><tr>
        <th data-series-name="net-sales" data-series-unit="million euros">Net sales</th>
        <th data-series-name="retail-sales" data-series-unit="million euros">Retail sales</th>
      </tr></thead><tbody><tr><th data-category="1st quarter 2026">1st quarter 2026</th>
        <td>8,116</td><td>2,773</td></tr></tbody></table>
      <p>Last updated: 27 May 2026</p></figure>
    """
    observations = _structured_statistical_observations(raw_html)
    retail = next(row for row in observations if row["series_code"] == "retail-sales")
    forged = dict(retail)
    forged["value"] = "8,116"
    forged["cell_text"] = "8,116"
    unsigned = {
        key: value for key, value in forged.items() if key != "observation_sha256"
    }
    import json
    forged["observation_sha256"] = hashlib.sha256(
        json.dumps(
            unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()

    with pytest.raises(ValueError, match="do not match fetched raw HTML"):
        build_attested_authority_proof(
            direct_url="https://www.stat.example.ee/retail",
            direct_text=(
                "Statistics Estonia official statistics office. "
                + _normalized_document_text(raw_html, is_html=True)
            ),
            attestation_url="https://european-union.europa.eu/statistics-authorities",
            attestation_text="Official statistics directory: https://www.stat.example.ee",
            country_codes=["EE"],
            retrieved_at="2026-08-12T12:00:00+00:00",
            structured_statistical_observations=[forged],
            direct_raw_html=raw_html,
        )

    direct_text = (
        "Statistics Estonia official statistics office. "
        + _normalized_document_text(raw_html, is_html=True)
    )
    valid_proof = build_attested_authority_proof(
        direct_url="https://www.stat.example.ee/retail",
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/statistics-authorities",
        attestation_text="Official statistics directory: https://www.stat.example.ee",
        country_codes=["EE"],
        retrieved_at="2026-08-12T12:00:00+00:00",
        structured_statistical_observations=observations,
        direct_raw_html=raw_html,
    )
    # Simulate a compromised producer that can re-sign its own assertion but
    # cannot change the already fetched private raw document anchor.
    forged["row_cells"] = ["8,116", "8,116"]
    forged["series"] = "Cat food sales"
    forged["series_code"] = "cat-food-sales"
    unsigned = {
        key: value for key, value in forged.items() if key != "observation_sha256"
    }
    forged["observation_sha256"] = hashlib.sha256(
        json.dumps(
            unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()
    resigned = copy.deepcopy(valid_proof)
    resigned["structured_statistical_observations"] = [forged]
    payload = {
        key: value for key, value in resigned.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    resigned["proof_signature"] = _proof_signature(payload)
    pipeline = B2BDataPipeline(
        location="Estonia", business_problem="Cat food market", target_user="Buyer"
    )
    pipeline._store_direct_web_evidence(
        [{
            "url": "https://www.stat.example.ee/retail",
            "country_codes": ["EE"],
            "retrieved_at": resigned["retrieved_at"],
            "source_authority": "official_public",
            "authority_verification_status": "independently_attested_direct_domain",
            "jurisdiction_binding_status": "verified",
            "authority_proof": resigned,
            "_structured_evidence_html": raw_html,
            "authority_document_artifact": {
                "artifact_type": "direct_authority_document",
                "text": direct_text,
                "sha256": resigned["direct"]["content_sha256"],
                "retrieved_at": resigned["retrieved_at"],
                "authority_proof_signature": resigned["proof_signature"],
            },
        }],
        [],
    )
    quality = evaluate_critical_claims(
        {"market_sources": pipeline.market_sources, "market_claims": pipeline.market_claims},
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert quality["status"] == "blocked"
    assert quality["verified_count"] == 0


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


def test_flattened_multi_value_statistic_is_not_promoted_by_release_marker():
    rows = B2BDataPipeline._direct_document_claim_passages(
        "May 2026 -6 -25 June 2026 9 -16 Internal trade turnover by "
        "quarters, 1st quarter 2025 – 1st quarter 2026 was 10.8 billion "
        "euros Last updated: 31 July 2026 09:00",
        retrieved_at="2026-08-12T12:00:00+00:00",
    )

    # Several unlabelled table cells occur in one flat span. A publication
    # marker cannot safely assign them all one series/period identity; the raw
    # HTML structured-table path handles valid positional cells instead.
    assert rows == []


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
        offer_html = (
            '<script type="application/ld+json">'
            '{"@type":"Product","name":"cat food","offers":'
            '{"@type":"Offer","price":"39.90","priceCurrency":"BRL"}}'
            "</script>"
        )
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": _offer_evidence(
                name="cat food", price="39.90", currency="BRL"
            ),
            "_structured_evidence_html": f"<div>{direct_text}</div>{offer_html}",
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
