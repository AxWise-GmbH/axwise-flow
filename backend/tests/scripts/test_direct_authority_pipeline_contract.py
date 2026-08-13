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
    build_expected_trusted_topic_alias_expansion,
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
        f'<div class="product"><h1>{name}</h1>'
        f'<div class="price">Current price {currency} {price}</div></div>'
        '<script type="application/ld+json">'
        f'{{"@type":"Product","name":"{name}","offers":'
        f'{{"@type":"Offer","price":"{price}","priceCurrency":"{currency}"}}}}'
        "</script>"
    )


def _offer_topic_seed(
    *, country_code: str, scope_label: str, product_phrase: str
) -> dict:
    return _offer_topic_contracts(
        country_code=country_code,
        scope_label=scope_label,
        product_phrase=product_phrase,
    )["topic_seed_contract"]


def _topic_contracts(seed, scope: ConfirmedMarketScope) -> dict:
    expansion = build_expected_trusted_topic_alias_expansion(seed, scope)
    result = {
        "topic_seed_contract": seed.model_dump(mode="json"),
        "topic_market_scope_contract": scope.model_dump(mode="json"),
    }
    if expansion is not None:
        result["topic_alias_expansion"] = expansion.model_dump(mode="json")
    return result


def _offer_topic_contracts(
    *, country_code: str, scope_label: str, product_phrase: str
) -> dict:
    scope = ConfirmedMarketScope(
        scope_label=scope_label,
        country_codes=(country_code,),
        confirmed=True,
    )
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id=f"{country_code.casefold()}-offer-topic",
            title=f"{product_phrase} catalogue validation",
            problem_scope=f"Assess current {product_phrase} offers.",
            exact_topic_anchors=(product_phrase,),
        ),
        scope,
    )
    return _topic_contracts(seed, scope)


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
    <div class="product"><h2>Purenatural Sensitive koeratoit 12 kg</h2>
      <span class="price">Tavahind 64,90 €</span></div>
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


def test_schema_org_microdata_keeps_product_and_offer_in_the_same_scope():
    cat_name = "Applaws Natural Cat Food Tuna fillet with prawn 156g"
    dog_name = "Premium dog food 156g"
    raw_html = f"""
    <div itemscope itemtype="http://schema.org/Product">
      <h1 itemprop="name">{cat_name}</h1>
      <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <meta itemprop="price" content="10.90">
        <meta itemprop="priceCurrency" content="EUR">
        <link itemprop="availability" href="http://schema.org/InStock">
        <span class="grp-price">€ 10.90</span>
      </div>
      <meta itemprop="productID" content="sku:CAT-156">
    </div>
    <div itemscope itemtype="https://schema.org/Product">
      <h2 itemprop="name">{dog_name}</h2>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <meta itemprop="price" content="12.90">
        <meta itemprop="priceCurrency" content="EUR">
        <span>€ 12.90</span>
      </div>
      <meta itemprop="sku" content="DOG-156">
    </div>
    """
    direct_text = _normalized_document_text(raw_html, is_html=True)
    offers = _commercial_offer_evidence(raw_html)

    assert [row["signal_type"] for row in offers] == [
        "schema_org_product_offer",
        "schema_org_product_offer",
    ]
    assert [row["product_name"] for row in offers] == [cat_name, dog_name]
    assert [row["product_id"] for row in offers] == ["sku:CAT-156", "DOG-156"]
    assert [row["price"] for row in offers] == ["10.90", "12.90"]

    proof = build_direct_primary_market_proof(
        direct_url="https://shop.example.ee/en/product/cat-156",
        direct_text=direct_text,
        country_codes=["EE"],
        commercial_offer_evidence=offers,
        direct_raw_html=raw_html,
        retrieved_at="2026-08-13T00:00:00+00:00",
    )
    assert claim_matching_offer_evidence(
        proof, f"{cat_name} € 10.90"
    )["product_id"] == "sku:CAT-156"
    assert claim_matching_offer_evidence(
        proof, f"{cat_name} € 12.90"
    ) is None


@pytest.mark.asyncio
async def test_cached_cloudflare_challenge_is_rejected_not_counted_as_retrieved():
    challenge = (
        "<title>Just a moment...</title>"
        "<script>window._cf_chl_opt={};</script>"
        "<script src='/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1'>"
        "</script>"
    )

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": "https://shop.example.ee/cat-food",
            "text": "Just a moment...",
            "retrieved_at": "2026-08-13T00:00:00+00:00",
            "commercial_offer_evidence": [],
            "_structured_evidence_html": challenge,
            # A serialized/cache field is not a trust boundary; challenge
            # detection must still be re-derived from the raw document.
            "_retrieval_challenge_checked": True,
        }

    source = {
        "url": "https://shop.example.ee/cat-food",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)

    assert source["direct_fetch_status"] == "rejected_challenge"
    assert source["jurisdiction_binding_status"] == (
        "rejected_retrieval_challenge"
    )
    assert source.get("_direct_document_candidate") is None
    assert source.get("authority_proof") is None


def test_hidden_jsonld_topic_name_cannot_authorize_visible_sku_and_dog_price():
    raw_html = (
        "<div>Estonia product catalogue. DOG-SKU dog food price € 10.90.</div>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"DOG-SKU","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"10.90",'
        '"priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    assert _commercial_offer_evidence(raw_html) == []
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.ee/dog-sku",
            direct_text=direct_text,
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-13T00:00:00+00:00",
        )


@pytest.mark.parametrize(
    "raw_html",
    [
        '<main><h1>Cat food</h1><aside>DOG-SKU premium dog kibble current '
        'price € 10.90.</aside></main><script type="application/ld+json">'
        '{"@type":"Product","sku":"DOG-SKU","name":"Cat food","offers":'
        '{"@type":"Offer","price":"10.90","priceCurrency":"EUR"}}'
        '</script>',
        '<section class="product"><h1>Cat food</h1>'
        '<article class="product-card"><h2>Premium dog kibble</h2>'
        '<div class="price">Current price €10.90</div></article></section>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Cat food","offers":{"@type":"Offer","price":"10.90",'
        '"priceCurrency":"EUR"}}</script>',
        '<article><h1>Alpha cat food</h1><section><h2>Premium dog biscuits</h2>'
        '<div class="price">Current price €10.90</div></section></article>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"10.90",'
        '"priceCurrency":"EUR"}}</script>',
        '<section itemscope itemtype="https://schema.org/Product">'
        '<h1 itemprop="name">Alpha cat food</h1><div itemprop="offers" '
        'itemscope itemtype="https://schema.org/Offer">'
        '<meta itemprop="price" content="2.99">'
        '<meta itemprop="priceCurrency" content="EUR"></div>'
        '<article><h2>Dog biscuits</h2><span class="price">Current price '
        '€2.99</span></article></section>',
        '<section><h1>Alpha cat food</h1><div>Estonia delivery fee € 2.99.'
        '</div></section><script type="application/ld+json">'
        '{"@type":"Product","name":"Alpha cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        '</script>',
        '<section><h1>Alpha cat food</h1><div>Was price € 3.99; current price '
        '€ 2.99.</div></section><script type="application/ld+json">'
        '{"@type":"Product","name":"Alpha cat food","offers":'
        '{"@type":"Offer","price":"3.99","priceCurrency":"EUR"}}'
        '</script>',
        '<div class="product"><h1>Alpha cat food</h1><div class="delivery">'
        'Shipping fee <span class="price">€2.99</span></div></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"2.99",'
        '"priceCurrency":"EUR"}}</script>',
        '<div class="product"><h1>Alpha cat food</h1><div class="old-price">'
        'Was <span class="price">€3.99</span></div>'
        '<div class="current-price">Now €2.99</div></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"3.99",'
        '"priceCurrency":"EUR"}}</script>',
        '<div class="product"><h1>Alpha cat food</h1><div class="cart">'
        'Cart subtotal <span class="price">€2.99</span></div></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"2.99",'
        '"priceCurrency":"EUR"}}</script>',
    ],
)
def test_unscoped_or_noncurrent_offer_amount_cannot_form_visible_binding(raw_html):
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "nested_price_branch",
    [
        '<div class="listing-tile"><div class="title">Premium dog biscuits</div>'
        '<div class="price">Current price €10.90</div></div>',
        '<section><div>Premium dog biscuits</div>'
        '<div class="price">Current price €10.90</div></section>',
        '<div role="group" aria-label="Premium dog biscuits">'
        '<div class="price">Current price €10.90</div></div>',
        '<section><div class="price">Premium dog biscuits Current price '
        '€10.90</div></section>',
        '<section><div class="price"><span>Premium dog biscuits</span> '
        'Current price €10.90</div></section>',
        '<section><div class="price"><span itemprop="name">Member Sale</span> '
        'Current price €10.90</div></section>',
        '<section><div class="price"><span aria-label="Other product">'
        'Member Sale</span> Current price €10.90</div></section>',
        '<section><div class="price"><span class="title">Member Sale</span> '
        'Current price €10.90</div></section>',
        '<section><div class="price"><span role="heading">Member Sale</span> '
        'Current price €10.90</div></section>',
        '<section><div class="price"><span id="product-title">Member Sale</span> '
        'Current price €10.90</div></section>',
        '<section><div class="price">'
        + '<i></i>' * 257
        + '<span itemprop="name">Member Sale</span> Current price €10.90'
        '</div></section>',
        '<section><div class="price"><a href="/member-sale">Member Sale</a> '
        'Current price €10.90</div></section>',
        '<div class="listing-tile"><div class="price">Current price €10.90'
        '</div><div class="title">Premium dog biscuits</div></div>',
        '<section><div class="price">Current price €10.90</div>'
        '<div role="group" aria-label="Premium dog biscuits"></div></section>',
        '<section><div class="price">Current price €10.90</div>'
        '<div>Premium dog biscuits</div></section>',
        '<section><div class="price">Current price €10.90</div>'
        '<div>Delivery fee</div></section>',
        '<section><div class="price">Current price €10.90</div>'
        '<div>Old list price</div></section>',
        '<section><div class="price">Current price €10.90</div>'
        '<div>Cart subtotal</div></section>',
    ],
)
def test_nested_nonheading_product_branch_cannot_lend_price(
    nested_price_branch: str,
):
    raw_html = (
        '<div>Estonia catalogue</div><div class="product">'
        f'<h1>Alpha cat food</h1>{nested_price_branch}</div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"10.90","priceCurrency":"EUR"}}</script>'
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)

    assert _commercial_offer_evidence(raw_html) == []
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.ee/alpha",
            direct_text=direct_text,
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-13T00:00:00+00:00",
        )


def test_css_id_hidden_product_cannot_form_visible_binding():
    raw_html = (
        '<style>#secret{display:none}</style><div id="secret" class="product">'
        '<h1>Alpha cat food</h1><span class="price">Current price €2.99'
        '</span></div><div>Estonia catalogue</div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"2.99",'
        '"priceCurrency":"EUR"}}</script>'
    )

    assert _normalized_document_text(raw_html, is_html=True) == "Estonia catalogue"
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("wrapper", ["dialog", "details"])
def test_default_closed_native_container_cannot_authorize_offer(wrapper: str):
    raw_html = (
        f'<{wrapper}><div class="product"><h1>Alpha cat food</h1>'
        '<div class="price">Current price €2.99</div></div>'
        f'</{wrapper}><div>Estonia catalogue</div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )

    assert _normalized_document_text(raw_html, is_html=True) == "Estonia catalogue"
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("wrapper", ["dialog open", "details open"])
def test_open_native_container_can_authorize_visible_offer(wrapper: str):
    tag = wrapper.split()[0]
    raw_html = (
        f'<{wrapper}><div class="product"><h1>Alpha cat food</h1>'
        '<div class="price">Current price €2.99</div></div>'
        f'</{tag}><div>Estonia catalogue</div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )

    assert len(_commercial_offer_evidence(raw_html)) == 1


@pytest.mark.parametrize(
    "declaration",
    ["opacity:0", "content-visibility:hidden", "visibility:collapse"],
)
@pytest.mark.parametrize("via_rule", [False, True])
def test_high_confidence_hidden_css_cannot_authorize_offer(
    declaration: str, via_rule: bool
):
    style = (
        f'<style>#secret{{{declaration}}}</style><div id="secret"'
        if via_rule
        else f'<div id="secret" style="{declaration}"'
    )
    raw_html = (
        f'{style} class="product"><h1>Alpha cat food</h1>'
        '<span class="price">Current price €2.99</span></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )

    assert _normalized_document_text(raw_html, is_html=True) == ""
    assert _commercial_offer_evidence(raw_html) == []


def test_equal_delivery_and_current_amount_cannot_substitute_signed_occurrence():
    raw_html = (
        '<div>Estonia catalogue</div><div class="product">'
        '<h1>Alpha cat food</h1><div class="delivery">Delivery fee €2.99</div>'
        '<p>Long product description with ingredients, nutritional analysis, '
        'stock information, package details and shopping notes.</p>'
        '<div class="current-price">Current product price €2.99</div></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)

    assert _commercial_offer_evidence(raw_html) == []
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.ee/alpha",
            direct_text=direct_text,
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-13T00:00:00+00:00",
        )


def test_primary_market_proof_rejects_injected_direct_text_not_derived_from_raw():
    raw_html = (
        '<div class="product"><h1>Alpha cat food</h1>'
        '<div class="price">Current price €2.99</div></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )
    injected_text = "Estonia catalogue " + _normalized_document_text(
        raw_html, is_html=True
    )

    with pytest.raises(ValueError, match="does not match normalized fetched"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.com/alpha",
            direct_text=injected_text,
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-13T00:00:00+00:00",
        )


def test_microdata_ordinary_element_uses_visible_text_not_content_attribute():
    raw_html = (
        '<section itemscope itemtype="https://schema.org/Product">'
        '<h1 itemprop="name" content="Alpha cat food">Premium dog food</h1>'
        '<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">'
        '<meta itemprop="price" content="2.99">'
        '<meta itemprop="priceCurrency" content="EUR">'
        '<span class="price">Current price €2.99</span></div></section>'
    )
    offers = _commercial_offer_evidence(raw_html)

    assert offers[0]["product_name"] == "Premium dog food"
    assert "Alpha cat food" not in offers[0]["visible_binding"]["scope_text"]


def test_void_input_does_not_hide_following_visible_offer_text():
    raw_html = (
        '<div class="product"><input hidden><h1>Alpha cat food</h1>'
        '<span class="price">Current price €2.99</span></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"2.99",'
        '"priceCurrency":"EUR"}}</script>'
    )

    assert "Alpha cat food" in _normalized_document_text(raw_html, is_html=True)
    assert len(_commercial_offer_evidence(raw_html)) == 1


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
        '<div class="product"><h1>Alpha cat food</h1>'
        f"<div>{direct_text}</div></div><script type=\"application/ld+json\">"
        f'{{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        f'"offers":{{"@type":"Offer","price":"{visible_price[1:]}",'
        f'"priceCurrency":"{currency}"}}}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    proof = build_direct_primary_market_proof(
        direct_url=f"https://shop.example.{country_code.casefold()}/alpha",
        direct_text=direct_text,
        country_codes=[country_code],
        direct_raw_html=raw_html,
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert claim_matching_offer_evidence(
        proof,
        proof["commercial_offer_evidence"][0]["visible_binding"]["claim_text"],
    )


def test_ambiguous_currency_symbol_rejects_multiple_offer_currencies():
    direct_text = "United States Alpha cat food SKU A123 current price $12.99."
    raw_html = (
        '<div class="product"><h1>Alpha cat food</h1>'
        f"<div>{direct_text}</div></div><script type=\"application/ld+json\">"
        '[{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"USD"}},'
        '{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"CAD"}}]'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url="https://shop.example.com/alpha",
            direct_text=direct_text,
            country_codes=["US"],
            direct_raw_html=raw_html,
            retrieved_at="2026-08-12T12:00:00+00:00",
        )


def test_two_equal_price_products_keep_independent_visible_bindings_and_claims():
    raw_html = (
        '<article class="product-card"><h2>Alpha cat food</h2><div>SKU-A</div>'
        '<span class="price">Current price €2.99</span></article>'
        '<article class="product-card"><h2>Alpha cat food</h2><div>SKU-B</div>'
        '<span class="price">Current price €2.99</span></article>'
        '<script type="application/ld+json">['
        '{"@type":"Product","sku":"SKU-A","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}},'
        '{"@type":"Product","sku":"SKU-B","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}]'
        '</script>'
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    offers = _commercial_offer_evidence(raw_html)
    proof = build_direct_primary_market_proof(
        direct_url="https://shop.example.ee/equal-price",
        direct_text=direct_text,
        country_codes=["EE"],
        direct_raw_html=raw_html,
        retrieved_at="2026-08-13T00:00:00+00:00",
    )
    spans = B2BDataPipeline._structured_offer_claim_passages(
        direct_text, proof, retrieved_at=proof["retrieved_at"]
    )

    assert [row["product_id"] for row in offers] == ["SKU-A", "SKU-B"]
    assert [
        row["visible_binding"]["product_id_text"] for row in offers
    ] == ["SKU-A", "SKU-B"]
    assert len(proof["commercial_offer_evidence"]) == 2
    assert {"SKU-A", "SKU-B"}.issubset(
        {sku for row in spans for sku in ("SKU-A", "SKU-B") if sku in row["text"]}
    )


def test_hidden_product_ids_cannot_create_two_offers_from_one_visible_card():
    raw_html = (
        '<article class="product-card"><h2>Alpha cat food</h2>'
        '<span class="price">Current price €2.99</span></article>'
        '<script type="application/ld+json">['
        '{"@type":"Product","sku":"SKU-A","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}},'
        '{"@type":"Product","sku":"SKU-B","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}]'
        '</script>'
    )

    assert _commercial_offer_evidence(raw_html) == []


def test_machine_decimal_does_not_equal_visible_thousands_grouping():
    raw_html = (
        '<div class="product"><h1>Alpha cat food</h1>'
        '<span class="price">Current price €1,299</span></div>'
        '<script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer","price":"1.299",'
        '"priceCurrency":"EUR"}}</script>'
    )
    assert _commercial_offer_evidence(raw_html) == []

    matching_raw_html = raw_html.replace('"price":"1.299"', '"price":"1299"')
    assert _commercial_offer_evidence(matching_raw_html)[0]["price"] == "1299"


def test_ambiguous_symbol_rejects_self_asserted_wrong_country():
    direct_text = "United States Alpha cat food SKU A123 current price $12.99."
    raw_html = (
        '<div class="product"><h1>Alpha cat food</h1>'
        f"<div>{direct_text}</div></div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha cat food",'
        '"offers":{"@type":"Offer","price":"12.99","priceCurrency":"USD"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
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
    raw_html = (
        '<div>Official product catalogue for Estonia.</div>'
        '<div class="product"><h1>premium cat food</h1>'
        '<div class="price">The current retail price is €2.99</div>'
        '<div>Observed on 2026-08-12.</div></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"premium cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
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
            **_offer_topic_contracts(
                country_code="EE",
                scope_label="Estonia",
                product_phrase="premium cat food",
            ),
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]


def test_live_shaped_split_product_heading_and_price_form_one_exact_offer_claim():
    url = (
        "https://www.smartech.ee/en/products/miscellaneous/"
        "applaws-natural-cat-food-tuna-fillet-with-prawn-wet-cat-food-156g-0/"
    )
    product_name = (
        "Applaws Natural Cat Food Tuna fillet with prawn - wet cat food - 156g"
    )
    filler = (
        "Product images are illustrative. The original product may vary, so "
        "please refer to the product specifications in the product description. "
        "Available for delivery in Estonia. "
    )
    raw_html = (
        f'<section class="product"><h1>{product_name}</h1><div>{filler}</div>'
        '<div class="product-info-price"><p>Price</p>'
        '<strong>€ 10.90</strong></div>'
        "<div>Free delivery threshold € 50.00</div>"
        "<div>EAN 5060122490238</div></section>"
        '<article class="product-card">Premium dog food 156g '
        '<span class="price">Price € 12.90</span></article>'
        '<script type="application/ld+json">'
        f'{{"@type":"Product","name":"{product_name}",'
        '"gtin13":"5060122490238","offers":{"@type":"Offer",'
        '"price":"10.90","priceCurrency":"EUR"}}'
        "</script>"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Premium dog food 156g",'
        '"offers":{"@type":"Offer","price":"12.90",'
        '"priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    retrieved_at = "2026-08-13T00:00:00+00:00"
    proof = build_direct_primary_market_proof(
        direct_url=url,
        direct_text=direct_text,
        country_codes=["EE"],
        direct_raw_html=raw_html,
        retrieved_at=retrieved_at,
    )
    document = {
        "artifact_type": "direct_authority_document",
        "text": direct_text,
        "sha256": proof["direct"]["content_sha256"],
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof["proof_signature"],
    }
    topic_contracts = _offer_topic_contracts(
        country_code="EE",
        scope_label="Estonia",
        product_phrase="cat food",
    )
    seed = topic_contracts["topic_seed_contract"]
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyer",
        **topic_contracts,
    )
    expected_spans = pipeline._structured_offer_claim_passages(
        direct_text, proof, retrieved_at=retrieved_at
    )
    assert any(
        product_name in row["text"] and "€ 10.90" in row["text"]
        for row in expected_spans
    ), [repr(row["text"]) for row in expected_spans]
    pipeline._store_direct_web_evidence(
        [{
            "title": product_name,
            "url": url,
            "provider": "searxng",
            "country_codes": ["EE"],
            "source_authority": "first_party_catalog",
            "authority_verification_status": "direct_primary_market_observation",
            "jurisdiction_binding_status": "verified",
            "retrieved_at": retrieved_at,
            "authority_proof": proof,
            "authority_document_artifact": document,
            "_structured_evidence_html": raw_html,
        }],
        [],
    )

    exact = [
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "observed_primary_market"
        and product_name in str(row.get("object") or "")
        and "€ 10.90" in str(row.get("object") or "")
    ]
    assert exact, pipeline.market_claims
    assert all(str(row["object"]) in direct_text for row in exact)
    assert min(len(str(row["object"])) for row in exact) <= 480
    bounded = min((str(row["object"]) for row in exact), key=len)
    assert "€ 50.00" not in bounded
    assert "Premium dog food" not in bounded

    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **topic_contracts,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality
    assert {row["normalized_value"] for row in quality["verified_facts"]} == {
        "10.90:eur"
    }


def test_petcity_shaped_estonian_offer_passes_full_signed_alias_lifecycle():
    url = "https://www.petcity.ee/royal-canin-light-weight-kassitoit-400-g-001201"
    product_name = "Royal Canin Light Weight kassitoit 400 g"
    raw_html = (
        '<main class="layout-product" data-component="product">'
        '<div class="layout-product__row wrap-narrow">'
        '<div class="layout-product__content">'
        f'<h1 class="page-title" data-component="title">{product_name}</h1>'
        '<form data-product-sku="001201"><div class="product-pricing">'
        '<div class="product-pricing__price" data-testid="product-card-price">'
        '<span class="product-pricing__price-value">'
        '<span class="product-pricing__price-number">10,09 €</span>'
        '</span></div></div></form></div></div></main>'
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"Product",'
        f'"sku":"001201","name":"{product_name}","offers":'
        '{"@type":"Offer","price":"10.09","priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}</script>'
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    retrieved_at = "2026-08-13T00:00:00+00:00"
    offers = _commercial_offer_evidence(raw_html)
    assert [(row["product_id"], row["price"], row["price_currency"]) for row in offers] == [
        ("001201", "10.09", "EUR")
    ]
    assert offers[0]["visible_binding"]["claim_text"] == (
        f"{product_name} 10,09 €"
    )
    proof = build_direct_primary_market_proof(
        direct_url=url,
        direct_text=direct_text,
        country_codes=["EE"],
        direct_raw_html=raw_html,
        retrieved_at=retrieved_at,
    )
    topic_contracts = _offer_topic_contracts(
        country_code="EE",
        scope_label="Estonia",
        product_phrase="cat food",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyer",
        **topic_contracts,
    )
    pipeline._store_direct_web_evidence(
        [{
            "url": url,
            "country_codes": ["EE"],
            "retrieved_at": retrieved_at,
            "source_authority": "first_party_catalog",
            "authority_verification_status": "direct_primary_market_observation",
            "jurisdiction_binding_status": "verified",
            "authority_proof": proof,
            "authority_document_artifact": {
                "artifact_type": "direct_authority_document",
                "text": direct_text,
                "sha256": proof["direct"]["content_sha256"],
                "retrieved_at": retrieved_at,
                "authority_proof_signature": proof["proof_signature"],
            },
            "_structured_evidence_html": raw_html,
        }],
        [],
    )

    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **topic_contracts,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    assert quality["verified_facts"][0]["normalized_value"] == "10.09:eur"
    assert quality["topic_alias_expansion_sha256"] == (
        topic_contracts["topic_alias_expansion"]["expansion_sha256"]
    )


def test_price_semantic_attribute_tokens_are_exact_and_preserve_negative_roles():
    product = (
        '<div class="product"><h1>Alpha cat food</h1>{price}</div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Alpha cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}</script>'
    )
    data_testid_price = product.replace(
        "{price}",
        '<span class="amount" data-testid="product-card-price">€2.99</span>',
    )
    assert len(_commercial_offer_evidence(data_testid_price)) == 1

    for price_node in (
        '<span class="pricey" data-testid="product-card-pricey">€2.99</span>',
        '<div class="delivery"><span data-testid="product-card-price">€2.99</span></div>',
        '<div class="old-price"><span data-testid="product-card-price">€2.99</span></div>',
    ):
        assert _commercial_offer_evidence(product.replace("{price}", price_node)) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "hidden_attribute",
    [
        "hidden",
        'aria-hidden="true"',
        'style="display:none"',
        'style="visibility: hidden"',
        'style="DiSpLaY : NoNe ! IMPORTANT"',
        'style="visibility:hidden!important"',
    ],
)
async def test_hidden_offer_text_cannot_become_primary_market_evidence(
    hidden_attribute: str,
):
    url = "https://shop.example.ee/cat-food/hidden-alpha"
    raw_html = (
        f"<div {hidden_attribute}><span>Alpha cat food</span>"
        "<span>€ 2.99</span></div>"
        "<div>Estonia product catalogue</div>"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Alpha cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    assert "Alpha cat food" not in direct_text
    assert "2.99" not in direct_text

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)

    assert source.get("source_authority") != "first_party_catalog"
    assert source.get("authority_proof") is None


@pytest.mark.asyncio
async def test_template_offer_text_cannot_become_primary_market_evidence():
    url = "https://shop.example.ee/cat-food/template-alpha"
    raw_html = (
        "<template><div>Alpha cat food € 2.99</div></template>"
        "<div>Estonia product catalogue</div>"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Alpha cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    assert "Alpha cat food" not in direct_text
    assert "2.99" not in direct_text

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source.get("source_authority") != "first_party_catalog"
    assert source.get("authority_proof") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "non_void_startend_tag",
    ["<div hidden/>", "<template/>", "<script/>"],
)
async def test_non_void_startend_tag_keeps_trailing_offer_text_hidden(
    non_void_startend_tag: str,
):
    url = "https://shop.example.ee/cat-food/non-void-startend"
    raw_html = (
        "<div>Estonia product catalogue</div>"
        + non_void_startend_tag
        + "Hidden cat food price € 9.99"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Hidden cat food","offers":'
        '{"@type":"Offer","price":"9.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    assert "Hidden cat food" not in direct_text
    assert "9.99" not in direct_text

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source.get("source_authority") != "first_party_catalog"
    assert source.get("authority_proof") is None


def test_unclosed_hidden_subtree_stays_hidden_conservatively():
    normalized = _normalized_document_text(
        "<div>Visible catalogue</div><div hidden><span>Alpha cat food € 2.99",
        is_html=True,
    )

    assert normalized == "Visible catalogue"


@pytest.mark.asyncio
async def test_offer_identity_cannot_match_inside_larger_visible_word():
    url = "https://shop.example.ee/copycat-food"
    raw_html = (
        "<div>Estonia Copycat food Price € 2.99</div>"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": "2026-08-13T00:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source.get("source_authority") != "first_party_catalog"
    assert source.get("authority_proof") is None


@pytest.mark.asyncio
async def test_offer_identity_with_punctuation_boundary_passes_full_path():
    url = "https://shop.example.ee/cat-food/punctuation"
    raw_html = (
        '<div>Estonia product catalogue.</div><div class="product">'
        '<h1>Cat food</h1><div class="price">Price € 2.99</div></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    retrieved_at = "2026-08-13T00:00:00+00:00"

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": retrieved_at,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source.get("source_authority") == "first_party_catalog"

    topic_contracts = _offer_topic_contracts(
        country_code="EE", scope_label="Estonia", product_phrase="cat food"
    )
    seed = topic_contracts["topic_seed_contract"]
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyer",
        **topic_contracts,
    )
    pipeline._store_direct_web_evidence([source], [])
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **topic_contracts,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality
    assert [row["normalized_value"] for row in quality["verified_facts"]] == [
        "2.99:eur"
    ]


@pytest.mark.asyncio
async def test_copycat_candidate_cannot_borrow_valid_offer_elsewhere_on_page():
    url = "https://shop.example.ee/cat-food/copycat-candidate"
    copycat_claim = "Copycat food Price € 2.99."
    raw_html = (
        '<div>Estonia product catalogue.</div><div class="product">'
        '<h1>Cat food</h1><div class="price">Price € 2.99</div></div>'
        f"<div>{copycat_claim}</div>"
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Cat food","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    retrieved_at = "2026-08-13T00:00:00+00:00"

    async def fetcher(_url: str) -> dict:
        return {
            "final_url": url,
            "text": direct_text,
            "retrieved_at": retrieved_at,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "_structured_evidence_html": raw_html,
        }

    source = {
        "url": url,
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
    }
    await enrich_authority_sources([source], fetcher=fetcher)
    assert source.get("source_authority") == "first_party_catalog"
    proof = source["authority_proof"]
    assert claim_matching_offer_evidence(
        proof,
        proof["commercial_offer_evidence"][0]["visible_binding"]["claim_text"],
    )
    assert claim_matching_offer_evidence(proof, copycat_claim) is None

    topic_contracts = _offer_topic_contracts(
        country_code="EE", scope_label="Estonia", product_phrase="cat food"
    )
    seed = topic_contracts["topic_seed_contract"]
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyer",
        **topic_contracts,
    )
    pipeline._store_direct_web_evidence(
        [source], [_snippet_claim(url, copycat_claim)]
    )
    copycat_rows = [
        row for row in pipeline.market_claims if row.get("object") == copycat_claim
    ]
    assert copycat_rows
    assert all(
        row.get("critical") is False
        and row.get("evidence_class") == "source_linked_observation"
        for row in copycat_rows
    )

    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **topic_contracts,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality
    copycat_claim_ids = {row["claim_id"] for row in copycat_rows}
    assert copycat_claim_ids.isdisjoint(
        {row["claim_id"] for row in quality["evidence_ledger"]}
    )
    assert [row["normalized_value"] for row in quality["verified_facts"]] == [
        "2.99:eur"
    ]


@pytest.mark.asyncio
async def test_delivery_threshold_is_not_authorized_by_product_offer():
    url = "https://shop.example.ee/cat-food/alpha-a123"
    direct_text = (
        "Alpha kana kassitoit SKU A123 400 g Tavahind 2,99 EUR "
        "Tellimuse tasuta tarne alampiir 50,00 EUR observed 2026-08-12."
    )
    raw_html = (
        '<div class="product"><h1>Alpha kana kassitoit</h1>'
        '<span class="price">Tavahind 2,99 EUR</span>'
        f"<div>{direct_text}</div></div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha kana kassitoit",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)

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
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **_offer_topic_contracts(
                country_code="EE",
                scope_label="Estonia",
                product_phrase="alpha kana kassitoit",
            ),
        },
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
        '<div class="product"><h1>Alpha kana kassitoit</h1>'
        '<span class="price">Tavahind 2,99 EUR</span>'
        f"<div>{direct_text}</div></div><script type=\"application/ld+json\">"
        '{"@type":"Product","sku":"A123","name":"Alpha kana kassitoit",'
        '"offers":{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
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
        currency = "BRL" if "BRL" in direct_text else "EUR"
        visible_amount = "BRL 39.90" if currency == "BRL" else "39,90 €"
        offer_html = (
            f'<div>{direct_text}</div>'
            '<div class="product"><h1>cat food</h1>'
            f'<div class="price">Current retail price is {visible_amount}'
            '</div></div>'
            '<script type="application/ld+json">'
            f'{{"@type":"Product","name":"cat food","offers":'
            f'{{"@type":"Offer","price":"39.90","priceCurrency":"'
            f'{currency}"}}}}'
            "</script>"
        )
        offer_rows = (
            _commercial_offer_evidence(offer_html)
            if "39" in direct_text
            else []
        )
        fetched_text = (
            _normalized_document_text(offer_html, is_html=True)
            if offer_rows
            else direct_text
        )
        return {
            "final_url": final_url,
            "text": fetched_text,
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": offer_rows,
            "_structured_evidence_html": offer_html if offer_rows else "",
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
    topic_scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    topic_seed_model = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-food-stat-test",
            title="Cat food commercial launch",
            problem_scope="Assess cat food demand using official statistics.",
            industry="Pet food",
            exact_topic_anchors=("cat food",),
        ),
        topic_scope,
    )
    topic_contracts = _topic_contracts(topic_seed_model, topic_scope)
    topic_seed = topic_contracts["topic_seed_contract"]
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market assessment",
        target_user="Retail buyer",
        model=None,
        required_evidence_classes=["official_statistic"],
        **topic_contracts,
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
            **topic_contracts,
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
    topic_scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    topic_seed_model = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-food-motor-negative",
            title="Cat food commercial launch",
            problem_scope="Assess cat food demand using official statistics.",
            industry="Pet food",
            exact_topic_anchors=("cat food",),
        ),
        topic_scope,
    )
    topic_contracts = _topic_contracts(topic_seed_model, topic_scope)
    topic_seed = topic_contracts["topic_seed_contract"]
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market assessment",
        target_user="Retail buyer",
        required_evidence_classes=["official_statistic"],
        **topic_contracts,
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
            **topic_contracts,
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
        **_offer_topic_contracts(
            country_code="EE",
            scope_label="Estonia",
            product_phrase="cat food",
        ),
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
            '<div>Brazil product catalogue.</div>'
            '<div class="product"><h1>cat food</h1>'
            '<div class="price">Current retail price is BRL 39.90</div>'
            '<div>Observed on 2026-08-12.</div></div>'
            '<script type="application/ld+json">'
            '{"@type":"Product","name":"cat food","offers":'
            '{"@type":"Offer","price":"39.90","priceCurrency":"BRL"}}'
            "</script>"
        )
        return {
            "final_url": url,
            "text": _normalized_document_text(offer_html, is_html=True),
            "retrieved_at": "2026-08-12T12:00:00+00:00",
            "commercial_offer_evidence": _commercial_offer_evidence(offer_html),
            "_structured_evidence_html": offer_html,
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
            **_offer_topic_contracts(
                country_code="BR",
                scope_label="Brazil",
                product_phrase="cat food",
            ),
        },
        ["BR"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]
