import asyncio
import hashlib
import html
import json
import threading
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.research.simulation_bridge.models import CompanyDiscoveryItem
from api.research.simulation_bridge.services.market_scope import (
    resolve_market_scope,
)
from api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from api.research.simulation_bridge.services import pipeline as pipeline_module
from api.research.simulation_bridge.services.pipeline import (
    _admit_provider_candidate_urls,
    _observed_offer_acquisition_hints,
    _schedule_authority_candidates,
)
from api.research.simulation_bridge.services.regional_service import RegionalService
from backend.services.generative.gemini_search_service import GeminiSearchService
from backend.services.generative.searxng_search_service import SearxngSearchService
from backend.services import research_source_authority_service as authority_module
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    build_expected_trusted_topic_alias_expansion,
    build_topic_seed,
)
from backend.services.research_source_authority_service import (
    RetrievalChallengeError,
    _canonical_offer_availability,
    _commercial_offer_evidence,
    _offer_payload_is_valid,
    _normalized_document_text,
    _structured_statistical_observations,
    authority_attestation_acquisition_hints,
    build_attested_authority_proof,
    build_direct_primary_market_proof,
    build_recognized_root_proof,
    enrich_authority_sources as real_enrich_authority_sources,
    validate_authority_proof,
)


pytestmark = pytest.mark.contract


def _topic_lifecycle(seed, scope: ConfirmedMarketScope) -> dict:
    expansion = build_expected_trusted_topic_alias_expansion(seed, scope)
    result = {
        "topic_seed_contract": seed.model_dump(mode="json"),
        "topic_market_scope_contract": scope.model_dump(mode="json"),
    }
    if expansion is not None:
        result["topic_alias_expansion"] = expansion.model_dump(mode="json")
    return result


def _ee_cat_food_topic_lifecycle() -> dict:
    scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="estonia-cat-food-test",
            title="Cat food commercial launch",
            exact_topic_anchors=("cat food",),
        ),
        scope,
    )
    return _topic_lifecycle(seed, scope)


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


_EMTA_VAT_URL = "https://www.emta.ee/en/admin/content/handbook_article/39"
_EMTA_BARE_VAT_URL = "https://emta.ee/en/admin/content/handbook_article/39"
_OLAF_EMTA_DIRECTORY_URL = (
    "https://anti-fraud.ec.europa.eu/organisations/tax-and-customs-board_en"
)
_EC_EMTA_BARE_DIRECTORY_URL = (
    "https://vat-one-stop-shop.ec.europa.eu/estonia_en"
)
_EMTA_VAT_TEXT = (
    "Estonian Tax and Customs Board. Standard VAT rate. From 1 July 2025, "
    "the standard rate of VAT is 24%. The standard rate applies whenever no "
    "preferential rate or exemption applies. Last updated on 04.08.2026."
)
_OLAF_EMTA_DIRECTORY_TEXT = (
    "European Anti-Fraud Office. Tax and Customs Board. public sector. "
    "Website: www.emta.ee Country: Estonia."
)
_EC_EMTA_BARE_DIRECTORY_TEXT = (
    "European Commission VAT One Stop Shop. Estonia national contact. "
    "Website: https://emta.ee/en/business-client/taxes-and-payment/"
    "value-added-tax/special-schemes-e-commerce-and-services"
)
_AUTHORITY_RETRIEVED_AT = "2026-08-13T00:00:00+00:00"
_OMIT = object()
_PETCITY_APPLAWS_URL = (
    "https://www.petcity.ee/"
    "applaws-kassi-taissoot-kana-part-2kg-pmm0256600ee"
)
_PETCITY_ROYAL_CANIN_URL = (
    "https://www.petcity.ee/"
    "royal-canin-light-weight-kassitoit-400-g-001201"
)


def _petcity_offer_html(
    *,
    product_name: str,
    sku: str,
    visible_price: str,
    structured_price: str,
    availability: str = "InStock",
    product_type: Any = "Product",
    offer_type: Any = "Offer",
) -> str:
    availability_value = (
        availability
        if availability.startswith("http")
        else f"https://schema.org/{availability}"
    )
    availability_json = (
        f',"availability":"{availability_value}"'
        if availability
        else ""
    )
    offer_type_json = (
        ""
        if offer_type is _OMIT
        else f'"@type":{json.dumps(offer_type, separators=(",", ":"))},'
    )
    product_type_json = (
        ""
        if product_type is _OMIT
        else f'"@type":{json.dumps(product_type, separators=(",", ":"))},'
    )
    return (
        '<nav class="navbar"><span class="cart-total">0,00 €</span></nav>'
        '<section class="category-navigation">Kassitoit kategooria alates 3,49 €</section>'
        '<main class="layout-product" data-component="product">'
        '<div class="layout-product__row wrap-narrow">'
        '<div class="layout-product__content">'
        f'<h1 class="page-title" data-component="title">{product_name}</h1>'
        f'<form data-product-sku="{sku}"><div class="product-pricing">'
        '<div class="product-pricing__price" data-testid="product-card-price">'
        '<span class="product-pricing__price-value">'
        f'<span class="product-pricing__price-number">{visible_price}</span>'
        '</span></div></div></form></div></div></main>'
        '<aside class="delivery">Tasuta tarne alates 49,00 €</aside>'
        '<footer>PetCity Estonia</footer>'
        '<script type="application/ld+json">'
        '[{"@context":"https://schema.org",'
        f'{product_type_json}'
        f'"sku":"{sku}","name":"{product_name}","offers":'
        f'{{{offer_type_json}"price":{structured_price},'
        f'"priceCurrency":"EUR"{availability_json}}}'
        '},{"@context":"https://schema.org","@type":"BreadcrumbList",'
        '"itemListElement":[]}]'
        '</script>'
    )


@pytest.mark.parametrize(
    "offer_type",
    [
        "Offer",
        "http://schema.org/Offer",
        "https://schema.org/Offer/",
        ["Thing", "https://schema.org/Offer"],
    ],
)
def test_json_ld_offer_type_accepts_only_exact_offer_members(offer_type: Any):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        offer_type=offer_type,
    )

    [offer] = _commercial_offer_evidence(raw_html)

    assert offer["signal_type"] == "schema_org_product_offer"
    assert offer["product_id"] == "103681"
    assert offer["price"] == "15.99"
    assert offer["price_currency"] == "EUR"


@pytest.mark.parametrize(
    "offer_type",
    [
        _OMIT,
        None,
        "Thing",
        "AggregateOffer",
        "OfferCatalog",
        "https://schema.org/AggregateOffer",
        "https://schema.org/OfferThing",
        "https://attacker.example/Offer",
        ["Thing", "AggregateOffer"],
    ],
)
def test_json_ld_offer_type_rejects_missing_or_lookalike_types(offer_type: Any):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        offer_type=offer_type,
    )

    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "product_type",
    [
        "Product",
        "http://schema.org/Product",
        "https://schema.org/Product/",
        ["Thing", "https://schema.org/Product"],
    ],
)
def test_json_ld_product_type_accepts_only_exact_product_members(
    product_type: Any,
):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        product_type=product_type,
    )

    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "103681"


@pytest.mark.parametrize(
    "product_type",
    [
        _OMIT,
        None,
        "Thing",
        "ProductModel",
        "https://schema.org/ProductThing",
        "https://attacker.example/Product",
        ["Thing", "ProductModel"],
    ],
)
def test_json_ld_product_type_rejects_missing_or_foreign_types(
    product_type: Any,
):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        product_type=product_type,
    )

    assert _commercial_offer_evidence(raw_html) == []


def _json_ld_offer_markup(
    *,
    sku: Any = _OMIT,
    name: Any = _OMIT,
    price: Any = _OMIT,
    currency: Any = _OMIT,
    availability: Any = _OMIT,
) -> str:
    product: dict[str, Any] = {"@type": "Product"}
    offer: dict[str, Any] = {"@type": "Offer"}
    if sku is not _OMIT:
        product["sku"] = sku
    if name is not _OMIT:
        product["name"] = name
    if price is not _OMIT:
        offer["price"] = price
    if currency is not _OMIT:
        offer["priceCurrency"] = currency
    if availability is not _OMIT:
        offer["availability"] = availability
    product["offers"] = offer
    return (
        '<script type="application/ld+json">'
        + json.dumps(product, ensure_ascii=False, separators=(",", ":"))
        + "</script>"
    )


def _merchant_config_markup(product: dict[str, Any]) -> str:
    config = html.escape(
        json.dumps(
            {"products": [product]},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        quote=True,
    )
    return f'<div data-config="{config}"></div>'


def _microdata_offer_markup(
    *,
    sku: Any = _OMIT,
    name: Any = _OMIT,
    price: Any = _OMIT,
    currency: Any = _OMIT,
    availability: Any = _OMIT,
) -> str:
    product_fields: list[str] = []
    offer_fields: list[str] = []
    for itemprop, value in (("sku", sku), ("name", name)):
        if value is not _OMIT:
            product_fields.append(
                f'<meta itemprop="{itemprop}" content="{html.escape(str(value))}">'
            )
    for itemprop, value in (("price", price), ("priceCurrency", currency)):
        if value is not _OMIT:
            offer_fields.append(
                f'<meta itemprop="{itemprop}" content="{html.escape(str(value))}">'
            )
    if availability is not _OMIT:
        offer_fields.append(
            '<link itemprop="availability" '
            f'href="{html.escape(str(availability))}">'
        )
    return (
        '<div itemscope itemtype="https://schema.org/Product">'
        + "".join(product_fields)
        + '<div itemprop="offers" itemscope '
        'itemtype="https://schema.org/Offer">'
        + "".join(offer_fields)
        + "</div></div>"
    )


def _cached_unresolved_emta_row(*, url: str = _EMTA_VAT_URL) -> dict:
    return {
        "title": "Standard VAT rate",
        "url": url,
        "resolved_url": url,
        "retrieval_url": url,
        "provider": "searxng",
        "provider_source_id": "emta-vat",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "acquisition_evidence_classes": ["statutory_current"],
        "direct_fetch_status": "retrieved",
        "jurisdiction_binding_status": "verified",
        "_direct_document_candidate": {
            "final_url": url,
            "text": _EMTA_VAT_TEXT,
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
        },
    }


def _fixture_authority_enricher(
    *,
    directory_url: str = _OLAF_EMTA_DIRECTORY_URL,
    directory_text: str = _OLAF_EMTA_DIRECTORY_TEXT,
    directory_final_url: str = _OLAF_EMTA_DIRECTORY_URL,
    directory_error: BaseException | None = None,
    direct_url: str = _EMTA_VAT_URL,
):
    async def fetcher(url):
        if url == directory_url:
            if directory_error is not None:
                raise directory_error
            return {
                "final_url": directory_final_url,
                "text": directory_text,
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            }
        if url == direct_url:
            return {
                "final_url": direct_url,
                "text": _EMTA_VAT_TEXT,
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            }
        raise AssertionError(f"unexpected authority URL: {url}")

    async def enrich(rows):
        return await real_enrich_authority_sources(rows, fetcher=fetcher)

    return enrich


def test_code_owned_attestation_registry_is_exact_and_acquisition_only():
    expected_www = (_OLAF_EMTA_DIRECTORY_URL,)
    assert authority_attestation_acquisition_hints(
        publisher_url=_EMTA_VAT_URL,
        country_codes=["EE"],
    ) == expected_www
    expected_bare = (_EC_EMTA_BARE_DIRECTORY_URL,)
    assert authority_attestation_acquisition_hints(
        publisher_url=_EMTA_BARE_VAT_URL,
        country_codes=["EE"],
    ) == expected_bare

    rejected = [
        ("http://www.emta.ee/en/current-vat", ["EE"]),
        ("http://emta.ee/en/current-vat", ["EE"]),
        ("https://api.emta.ee/en/current-vat", ["EE"]),
        ("https://notemta.ee/en/current-vat", ["EE"]),
        ("https://emta.ee.attacker.example/current-vat", ["EE"]),
        ("https://attacker.emta.ee/current-vat", ["EE"]),
        ("https://www.emta.ee.attacker.example/current-vat", ["EE"]),
        ("https://attacker.www.emta.ee/current-vat", ["EE"]),
        ("https://user@www.emta.ee/current-vat", ["EE"]),
        ("https://user@emta.ee/current-vat", ["EE"]),
        ("https://www.emta.ee:444/current-vat", ["EE"]),
        ("https://emta.ee:444/current-vat", ["EE"]),
        (_EMTA_VAT_URL, ["LV"]),
        (_EMTA_VAT_URL, ["EE", "LV"]),
        (_EMTA_BARE_VAT_URL, ["LV"]),
        (_EMTA_BARE_VAT_URL, ["EE", "LV"]),
    ]
    for publisher_url, country_codes in rejected:
        assert authority_attestation_acquisition_hints(
            publisher_url=publisher_url,
            country_codes=country_codes,
        ) == ()


def test_observed_offer_hint_registry_requires_exact_market_and_source_anchor():
    expected = (_PETCITY_APPLAWS_URL, _PETCITY_ROYAL_CANIN_URL)
    assert _observed_offer_acquisition_hints(
        country_codes=("EE",),
        product_source_anchors=("cat food",),
    ) == expected

    for countries, anchors in (
        (("LV",), ("cat food",)),
        (("EE", "LV"), ("cat food",)),
        ((), ("cat food",)),
        (("EE",), ("copycat food",)),
        (("EE",), ("cat food copycat",)),
        (("EE",), ("cat food", "pet food")),
        (("EE",), ("kassi kuivtoit",)),
        (("EE",), ()),
    ):
        assert _observed_offer_acquisition_hints(
            country_codes=countries,
            product_source_anchors=anchors,
        ) == ()


@pytest.mark.parametrize(
    "availability",
    ["", "InStock", "https://schema.org/InStock", "LimitedAvailability", "OnlineOnly"],
)
def test_current_offer_availability_contract_accepts_only_reviewed_positive_states(
    availability: str,
):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        availability=availability,
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    "availability",
    [
        "OutOfStock",
        "SoldOut",
        "Discontinued",
        "BackOrder",
        "PreOrder",
        "PreSale",
        "Reserved",
        "NotInStock",
        "https://attacker.example/InStock",
    ],
)
def test_noncurrent_or_unknown_availability_cannot_authorize_visible_price(
    monkeypatch,
    availability: str,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        availability=availability,
    )
    direct_text = _normalized_document_text(raw_html, is_html=True)
    assert _commercial_offer_evidence(raw_html) == []
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url=_PETCITY_APPLAWS_URL,
            direct_text=direct_text,
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at=_AUTHORITY_RETRIEVED_AT,
        )


@pytest.mark.parametrize(
    "unavailable_label",
    [
        "Out of stock",
        "Sold out",
        "Discontinued",
        "Unavailable",
        "Not available",
        "Not currently available",
        "Laost otsas",
        "Pole saadaval",
        "Ei ole saadaval",
        "Välja müüdud",
    ],
)
def test_visible_unavailable_label_overrides_positive_or_absent_metadata(
    unavailable_label: str,
):
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
        availability="InStock",
    ).replace("15,99 €</span>", f"15,99 € {unavailable_label}</span>")

    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "outer_children",
    [
        (
            '<div class="availability">Out of stock</div>'
            '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
            '<span class="price">15,99 €</span></div>'
        ),
        (
            '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
            '<span class="price">15,99 €</span></div>'
            '<div class="availability">Out of stock</div>'
        ),
    ],
)
def test_unavailable_sibling_in_outer_product_owner_blocks_nested_binding(
    monkeypatch,
    outer_children: str,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    raw_html = (
        f'<section class="product">{outer_children}</section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )

    assert _commercial_offer_evidence(raw_html) == []
    with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
        build_direct_primary_market_proof(
            direct_url=_PETCITY_APPLAWS_URL,
            direct_text=_normalized_document_text(raw_html, is_html=True),
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at=_AUTHORITY_RETRIEVED_AT,
        )


@pytest.mark.parametrize("wrapper_count", [0, 1, 2, 3, 4, 5, 8, 32, 65])
def test_unavailable_outer_product_owner_cannot_be_hidden_by_wrappers(
    wrapper_count: int,
):
    opening = '<div class="wrapper">' * wrapper_count
    closing = "</div>" * wrapper_count
    raw_html = (
        '<section class="product">'
        f'{opening}<div class="product">'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        f'<span class="price">15,99 €</span></div>{closing}'
        '<div class="availability">Out of stock</div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "owner_attributes",
    [
        'class="layout-product"',
        'class="product-page"',
        'class="product-view"',
        'class="product-wrapper"',
        'class="product-detail"',
        'class="product_detail"',
        'class="product-tile"',
        'class="product-row"',
        'class="product-summary"',
        'class="product-info"',
        'class="product-content"',
        'class="product-shell"',
        'class="product-root"',
        'class="listing-tile"',
        'id="product-page"',
        'data-component="product"',
        'data-product-id="A1"',
        'data-product-sku="A1"',
        'data-product-sku="B2" data-product-id="A1"',
        'data-product-sku="B2" data-product-id="C3"',
        'data-testid="product"',
        'data-testid="product-card"',
        'role="group" aria-label="product"',
        'role="article"',
        'role="listitem"',
        'itemscope itemtype="https://schema.org/Product"',
    ],
)
def test_common_outer_product_owner_shapes_cannot_hide_unavailable_sibling(
    owner_attributes: str,
):
    raw_html = (
        f"<section {owner_attributes}>"
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<div class="availability">Out of stock</div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_form_with_exact_product_sku_is_a_bounded_offer_owner():
    raw_html = (
        '<form data-product-sku="A1"><div>'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<div class="availability">Out of stock</div></form>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("owner_tag", ["article", "li"])
def test_semantic_offer_owner_cannot_hide_unavailable_sibling(owner_tag: str):
    raw_html = (
        f"<{owner_tag}>"
        '<div><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<div class="availability">Out of stock</div>'
        f"</{owner_tag}>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("unavailable_tag", ["article", "li"])
def test_unrelated_semantic_neighbor_does_not_veto_current_offer(
    unavailable_tag: str,
):
    raw_html = (
        '<article><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></article>'
        f'<{unavailable_tag} data-product-sku="B2">'
        '<h2>Neighbor koeratoit 3 kg</h2>'
        '<span class="price">20,99 €</span><div>Out of stock</div>'
        f"</{unavailable_tag}>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize("outer_tag", ["section", "form", "fieldset", "aside"])
def test_generic_outer_element_does_not_claim_product_ownership(
    outer_tag: str,
):
    raw_html = (
        f"<{outer_tag}>"
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<div class="availability">Out of stock</div>'
        f"</{outer_tag}>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    "outer_attributes",
    [
        'data-product-id="B2"',
        'data-product-sku="B2"',
        'data-testid="copyproduct"',
        'role="list"',
        'class="copyproduct"',
    ],
)
def test_copycat_or_mismatched_owner_marker_does_not_veto_current_offer(
    outer_attributes: str,
):
    raw_html = (
        f'<section {outer_attributes}>'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<div class="availability">Out of stock</div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    "utility_attributes",
    [
        'class="recommended-product-carousel"',
        'class="product-count"',
        'class="product-filter"',
        'class="product-list"',
        'class="product-grid"',
        'class="products-grid"',
        'class="product-carousel"',
        'class="listing-grid"',
        'class="recommendations"',
        'class="copyproduct"',
    ],
)
def test_product_utility_or_copycat_container_does_not_veto_current_offer(
    utility_attributes: str,
):
    raw_html = (
        '<section class="product"><div class="product">'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f'<aside {utility_attributes}>Out of stock products: 0</aside></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize("utility_class", ["product-grid", "copyproduct"])
def test_utility_marker_cannot_hide_cue_for_offer_it_contains(
    utility_class: str,
):
    raw_html = (
        '<section class="product">'
        f'<div class="{utility_class}">'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span>'
        '<div class="availability">Out of stock</div></div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "subcomponent_class",
    [
        "product-info",
        "product-summary",
        "product-content",
        "product-wrapper",
    ],
)
def test_cue_only_product_subcomponent_cannot_shield_outer_offer(
    subcomponent_class: str,
):
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f'<div class="{subcomponent_class}">Out of stock</div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "cue_owner_markup",
    [
        "<article>Out of stock</article>",
        "<li>Out of stock</li>",
        '<div role="article">Out of stock</div>',
        '<div role="listitem">Out of stock</div>',
        '<div data-testid="product">Out of stock</div>',
        '<div data-testid="product-card">Out of stock</div>',
        '<div data-component="product">Out of stock</div>',
        '<div role="group" aria-label="product">Out of stock</div>',
        (
            '<div itemscope itemtype="https://schema.org/Product">'
            "Out of stock</div>"
        ),
        '<div class="product">Out of stock</div>',
        '<div class="product-card">Out of stock</div>',
        '<div class="product-tile">Out of stock</div>',
        '<div class="product-item">Out of stock</div>',
        '<div class="product-row">Out of stock</div>',
        '<div class="listing-tile">Out of stock</div>',
        '<div data-product-sku="A1">Out of stock</div>',
        '<div data-product-sku="a1">Out of stock</div>',
        '<div data-product-sku="Ａ１">Out of stock</div>',
        '<div data-product-sku="A\u200b1">Out of stock</div>',
        '<div data-product-sku="A1 B2">Out of stock</div>',
        '<div data-product-sku="A1,B2">Out of stock</div>',
        '<div data-product-sku="A1|B2">Out of stock</div>',
        '<div data-product-sku="A1;B2">Out of stock</div>',
        '<div data-product-sku="A1/B2">Out of stock</div>',
        '<div data-product-sku="A1+B2">Out of stock</div>',
        '<div data-product-sku="A1-B2">Out of stock</div>',
        '<div data-product-sku="A1_B2">Out of stock</div>',
        '<div data-product-sku="A1.B2">Out of stock</div>',
        '<div data-product-sku="A1:B2">Out of stock</div>',
        '<div data-product-sku="A1=B2">Out of stock</div>',
        '<div data-product-sku="A1~B2">Out of stock</div>',
        '<div data-product-sku="A1#B2">Out of stock</div>',
        '<div data-product-sku="A1@B2">Out of stock</div>',
        '<div data-product-sku="A1\\B2">Out of stock</div>',
        '<div data-product-sku="A1–B2">Out of stock</div>',
        '<div data-product-sku="A1—B2">Out of stock</div>',
        '<div data-product-sku="Α1">Out of stock</div>',
        '<div data-product-sku="А1">Out of stock</div>',
        '<div data-product-sku="A\ufe0f1">Out of stock</div>',
        (
            '<div data-product-sku="B2" data-product-id="C3">'
            "Out of stock</div>"
        ),
    ],
)
def test_cue_only_owner_marker_cannot_claim_an_independent_product(
    cue_owner_markup: str,
):
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f"{cue_owner_markup}</section>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "distinct_id_attributes",
    [
        'data-product-sku="B2"',
        'data-product-sku="B2" data-product-id="b2"',
    ],
)
def test_mismatched_explicit_product_id_keeps_cue_on_distinct_product(
    distinct_id_attributes: str,
):
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f'<div {distinct_id_attributes}>Out of stock</div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    ("heading", "price_markup"),
    [
        ("Details panel", '<span class="price">15,99 €</span>'),
        ("Toote saadavus", '<span class="price">15,99 €</span>'),
        ("15.99 EUR", '<span class="price">15,99 €</span>'),
        ("Stock information panel", '<span class="price">15,99 €</span>'),
        ("Applaws kassi kuivtoit", '<span class="price">15,99 €</span>'),
        ("Applaws kassi kuivtoit uus", '<span class="price">15,99 €</span>'),
        ("Delivery options", '<span class="shipping">Shipping 4,99 €</span>'),
        ("Out of stock", '<span class="price">15,99 €</span>'),
    ],
)
def test_unbound_heading_and_amount_cannot_invent_an_independent_product(
    heading: str,
    price_markup: str,
):
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f'<div class="product-card"><h2>{heading}</h2>{price_markup}'
        '<div>Out of stock</div></div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize(
    "subcomponent_class",
    [
        "product-info",
        "product-summary",
        "product-content",
        "product-wrapper",
    ],
)
def test_distinct_product_in_structural_subcomponent_owns_its_unavailable_cue(
    subcomponent_class: str,
):
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f'<div class="{subcomponent_class}" data-product-sku="B2">'
        '<h2>Neighbor koeratoit 3 kg</h2>'
        '<span class="price">20,99 €</span>'
        '<div>Out of stock</div></div></section>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    "neighbor_markup",
    [
        '<div class="product-card" data-product-sku="B2">',
        '<div class="product-tile" data-product-sku="B2">',
        '<div class="product-item" data-product-sku="B2">',
        '<div class="product-row" data-product-sku="B2">',
        '<article data-product-sku="B2">',
        '<div role="listitem" data-product-sku="B2">',
    ],
)
def test_reviewed_nested_card_marker_keeps_neighbor_cue_local(
    neighbor_markup: str,
):
    closing_tag = "</article>" if neighbor_markup.startswith("<article") else "</div>"
    raw_html = (
        '<section class="layout-product">'
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        f"{neighbor_markup}<h2>Neighbor koeratoit 3 kg</h2>"
        '<span class="price">20,99 €</span><div>Out of stock</div>'
        f"{closing_tag}</section>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


def test_copyproduct_global_cue_outside_product_owner_does_not_veto_offer():
    raw_html = (
        '<main><section class="product"><div class="product">'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div></section>'
        '<aside class="copyproduct">Out of stock products: 0</aside></main>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize("unavailable_location", ["neighbor", "footer"])
def test_unavailable_cue_outside_offer_owner_does_not_veto_current_product(
    monkeypatch,
    unavailable_location: str,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    current = (
        '<section class="product"><div class="product">'
        '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div></section>'
    )
    unavailable = (
        '<section class="product" data-product-sku="B2">'
        '<h2>Neighbor koeratoit 3 kg</h2>'
        '<span class="price">20,99 €</span><div>Out of stock</div></section>'
        if unavailable_location == "neighbor"
        else '<footer>Out of stock products may reappear later.</footer>'
    )
    raw_html = (
        f"<main>{current}{unavailable}</main>"
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
    )

    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)
    proof = build_direct_primary_market_proof(
        direct_url=_PETCITY_APPLAWS_URL,
        direct_text=_normalized_document_text(raw_html, is_html=True),
        country_codes=["EE"],
        direct_raw_html=raw_html,
        retrieved_at=_AUTHORITY_RETRIEVED_AT,
    )
    assert proof["proof_type"] == "direct_primary_market_observation"


@pytest.mark.parametrize(
    "is_salable",
    [True, False, None, 0, 1, "false", "true", [], {}],
)
def test_merchant_config_preserves_explicit_saleability(
    monkeypatch,
    is_salable: Any,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    config = html.escape(
        json.dumps(
            {
                "products": [
                    {
                        "id": "158130",
                        "sku": "158130",
                        "name": "Purenatural kassi kuivtoit 2 kg",
                        "priceSimple": 15.99,
                        "price": "15,99 €",
                        "actions": {"isSalable": is_salable},
                    }
                ]
            },
            separators=(",", ":"),
        ),
        quote=True,
    )
    raw_html = (
        f'<div data-config="{config}"></div>'
        '<div class="product"><h2>Purenatural kassi kuivtoit 2 kg</h2>'
        '<span class="price">Tavahind 15,99 €</span></div>'
    )
    offers = _commercial_offer_evidence(raw_html)

    assert bool(offers) is (is_salable is True)
    if is_salable is True:
        assert offers[0]["availability"] == "in_stock"
        proof = build_direct_primary_market_proof(
            direct_url="https://shop.example.ee/products",
            direct_text=_normalized_document_text(raw_html, is_html=True),
            country_codes=["EE"],
            direct_raw_html=raw_html,
            retrieved_at=_AUTHORITY_RETRIEVED_AT,
        )
        assert proof["proof_type"] == "direct_primary_market_observation"
    else:
        with pytest.raises(ValueError, match="no fetched structured Product/Offer"):
            build_direct_primary_market_proof(
                direct_url="https://shop.example.ee/products",
                direct_text=_normalized_document_text(raw_html, is_html=True),
                country_codes=["EE"],
                direct_raw_html=raw_html,
                retrieved_at=_AUTHORITY_RETRIEVED_AT,
            )


@pytest.mark.parametrize("negative_status", ["OutOfStock", "SoldOut", "Discontinued"])
@pytest.mark.parametrize("negative_first", [False, True])
def test_conflicting_duplicate_availability_poison_is_order_independent(
    negative_status: str,
    negative_first: bool,
):
    def offer(status: str) -> str:
        return (
            '<script type="application/ld+json">'
            '{"@type":"Product","sku":"A1",'
            '"name":"Applaws kassi kuivtoit 2 kg",'
            '"offers":{"@type":"Offer","price":"15.99",'
            '"priceCurrency":"EUR",'
            f'"availability":"https://schema.org/{status}"}}'
            "</script>"
        )

    signals = [offer("InStock"), offer(negative_status)]
    if negative_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_duplicate_current_availability_remains_one_bound_offer():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + (
            '<script type="application/ld+json">'
            '{"@type":"Product","sku":"A1",'
            '"name":"Applaws kassi kuivtoit 2 kg",'
            '"offers":{"@type":"Offer","price":"15.99",'
            '"priceCurrency":"EUR",'
            '"availability":"https://schema.org/InStock"}}'
            "</script>"
        )
        * 2
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize(
    ("availability", "expected"),
    [
        ("", ""),
        ("InStock", "instock"),
        ("https://schema.org/InStock", "instock"),
        ("LimitedAvailability", "limitedavailability"),
        ("OnlineOnly", "onlineonly"),
        ("OutOfStock", None),
        ("unknown", None),
    ],
)
def test_offer_availability_canonicalizer_is_closed(
    availability: str,
    expected: str | None,
):
    assert _canonical_offer_availability(
        availability,
        signal_type="schema_org_product_offer",
    ) == expected


@pytest.mark.parametrize("negative_first", [False, True])
@pytest.mark.parametrize(
    "negative_fields",
    [
        {
            "sku": "a1",
            "name": "Changed product name",
            "price": "99.99",
            "currency": "USD",
            "availability": "OutOfStock",
        },
        {"sku": "Ａ１", "availability": "SoldOut"},
        {
            "sku": "A\u200b1",
            "name": "Other text",
            "price": "invalid",
            "availability": "Discontinued",
        },
        {"sku": "A1", "name": None, "availability": "OutOfStock"},
    ],
    ids=["changed-fields", "omitted-fields", "invalid-price", "null-name"],
)
def test_same_strong_id_negative_availability_poisons_all_field_variants(
    negative_fields: dict[str, Any],
    negative_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _json_ld_offer_markup(**negative_fields)
    signals = [positive, negative]
    if negative_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("negative_first", [False, True])
@pytest.mark.parametrize(
    "malformed_availability",
    [False, 0, 1, [], {}, None, ""],
)
def test_explicit_malformed_availability_is_not_collapsed_to_absent(
    malformed_availability: Any,
    negative_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    malformed = _json_ld_offer_markup(
        sku="A1",
        availability=malformed_availability,
    )
    signals = [positive, malformed]
    if negative_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_missing_availability_key_remains_backward_compatible():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize("negative_first", [False, True])
@pytest.mark.parametrize("visible_sku", [False, True])
@pytest.mark.parametrize(
    ("negative_price", "negative_currency"),
    [(_OMIT, _OMIT), ("99.99", "USD"), ("15.99", "EUR")],
)
def test_anonymous_same_name_negative_poison_is_unconditional(
    negative_price: Any,
    negative_currency: Any,
    visible_sku: bool,
    negative_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _json_ld_offer_markup(
        name="Applaws kassi kuivtoit 2 kg",
        price=negative_price,
        currency=negative_currency,
        availability="OutOfStock",
    )
    signals = [positive, negative]
    if negative_first:
        signals.reverse()
    sku_markup = '<span class="sku">A1</span>' if visible_sku else ""
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        f'{sku_markup}<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("anonymous_name", [_OMIT, "Different product name"])
def test_anonymous_negative_cannot_poison_a_different_or_missing_name(
    anonymous_name: Any,
):
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            name=anonymous_name,
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


@pytest.mark.parametrize("negative_first", [False, True])
@pytest.mark.parametrize("negative_sku", [_OMIT, "B2"])
@pytest.mark.parametrize(
    ("negative_price", "negative_currency"),
    [("15.99", "EUR"), ("20.99", "EUR"), ("15.99", "USD"), (_OMIT, _OMIT)],
)
def test_anonymous_positive_cannot_separate_any_same_name_negative(
    negative_price: Any,
    negative_currency: Any,
    negative_sku: Any,
    negative_first: bool,
):
    positive = _json_ld_offer_markup(
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _json_ld_offer_markup(
        sku=negative_sku,
        name="Applaws kassi kuivtoit 2 kg",
        price=negative_price,
        currency=negative_currency,
        availability="OutOfStock",
    )
    signals = [positive, negative]
    if negative_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_anonymous_positive_ignores_negative_with_different_name():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            sku="B2",
            name="Different product name",
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_name"] == "Applaws kassi kuivtoit 2 kg"


@pytest.mark.parametrize(
    ("negative_price", "negative_currency"),
    [("20.99", "EUR"), ("15.99", "USD")],
)
def test_distinct_strong_id_same_name_without_display_collision_does_not_poison(
    negative_price: Any,
    negative_currency: Any,
):
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            sku="B2",
            name="Applaws kassi kuivtoit 2 kg",
            price=negative_price,
            currency=negative_currency,
            availability="OutOfStock",
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


@pytest.mark.parametrize("visible_sku", [False, True])
@pytest.mark.parametrize(
    ("negative_price", "negative_currency"),
    [(_OMIT, _OMIT), ("15.99", _OMIT), ("invalid", "EUR")],
)
def test_incomplete_distinct_id_same_name_requires_visible_current_id(
    negative_price: Any,
    negative_currency: Any,
    visible_sku: bool,
):
    sku_markup = '<span class="sku">A1</span>' if visible_sku else ""
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        f'{sku_markup}<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            sku="B2",
            name="Applaws kassi kuivtoit 2 kg",
            price=negative_price,
            currency=negative_currency,
            availability="OutOfStock",
        )
    )
    offers = _commercial_offer_evidence(raw_html)
    assert bool(offers) is visible_sku


@pytest.mark.parametrize("is_salable", [False, None, 0, "false"])
def test_invalid_merchant_saleability_poisons_matching_json_ld_offer(
    is_salable: Any,
):
    config = html.escape(
        json.dumps(
            {
                "products": [
                    {
                        "sku": "A1",
                        "name": "Applaws kassi kuivtoit 2 kg",
                        "priceSimple": 15.99,
                        "price": "15,99 €",
                        "actions": {"isSalable": is_salable},
                    }
                ]
            },
            separators=(",", ":"),
        ),
        quote=True,
    )
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
        f'<div data-config="{config}"></div>'
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_invalid_merchant_saleability_does_not_poison_distinct_offer():
    config = html.escape(
        json.dumps(
            {
                "products": [
                    {
                        "sku": "B2",
                        "name": "Neighbor koeratoit 3 kg",
                        "priceSimple": 20.99,
                        "price": "20,99 €",
                        "actions": {"isSalable": False},
                    }
                ]
            },
            separators=(",", ":"),
        ),
        quote=True,
    )
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
        f'<div data-config="{config}"></div>'
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


def test_unsalable_hidden_sku_poisons_same_visible_offer_without_sku_binding():
    config = html.escape(
        json.dumps(
            {
                "products": [
                    {
                        "sku": "B2",
                        "name": "Applaws kassi kuivtoit 2 kg",
                        "priceSimple": 15.99,
                        "price": "15,99 €",
                        "actions": {"isSalable": False},
                    }
                ]
            },
            separators=(",", ":"),
        ),
        quote=True,
    )
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
        f'<div data-config="{config}"></div>'
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_visible_sku_disambiguates_unsalable_hidden_sku_collision():
    config = html.escape(
        json.dumps(
            {
                "products": [
                    {
                        "sku": "B2",
                        "name": "Applaws kassi kuivtoit 2 kg",
                        "priceSimple": 15.99,
                        "price": "15,99 €",
                        "actions": {"isSalable": False},
                    }
                ]
            },
            separators=(",", ":"),
        ),
        quote=True,
    )
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"A1",'
        '"name":"Applaws kassi kuivtoit 2 kg",'
        '"offers":{"@type":"Offer","price":"15.99",'
        '"priceCurrency":"EUR",'
        '"availability":"https://schema.org/InStock"}}'
        "</script>"
        f'<div data-config="{config}"></div>'
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["visible_binding"]["product_id_text"] == "A1"


@pytest.mark.parametrize("negative_first", [False, True])
@pytest.mark.parametrize("negative_signal", ["json_ld", "merchant_config"])
@pytest.mark.parametrize(
    ("identifier_markup", "expected_offer"),
    [
        ("", False),
        ('<span class="sku">B2</span>', False),
        ('<span class="sku">A1 B2</span>', False),
        ('<span class="sku">B2 A1</span>', False),
        ('<span class="sku">A1/B2</span>', False),
        ('<span class="sku">A1+B2</span>', False),
        ('<span class="sku">A1-B2</span>', False),
        ('<span class="sku">A1_B2</span>', False),
        ('<span class="sku">A1.B2</span>', False),
        ('<span class="sku">A1</span><span class="sku">B2</span>', False),
        ('<span class="sku">A1</span><span>B2</span>', False),
        ('<span class="sku" aria-label="A1 B2">A1</span>', False),
        ('<span class="sku" title="B2">A1</span>', False),
        ('<span class="sku">A1 Ｂ２</span>', False),
        ('<span class="sku">A1 B\u200b2</span>', False),
        ('<span class="sku">A1</span>', True),
        ('<span class="sku">A1</span><span hidden>B2</span>', True),
        ('<span class="sku">A1 B20</span>', True),
    ],
)
def test_distinct_negative_id_requires_exclusive_atomic_visible_scope(
    identifier_markup: str,
    expected_offer: bool,
    negative_signal: str,
    negative_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = (
        _json_ld_offer_markup(
            sku="B2",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
        if negative_signal == "json_ld"
        else _merchant_config_markup(
            {
                "sku": "B2",
                "name": "Applaws kassi kuivtoit 2 kg",
                "priceSimple": 15.99,
                "price": "15,99 €",
                "actions": {"isSalable": False},
            }
        )
    )
    signals = [positive, negative]
    if negative_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        f'{identifier_markup}<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    offers = _commercial_offer_evidence(raw_html)
    assert bool(offers) is expected_offer
    if expected_offer:
        assert offers[0]["product_id"] == "A1"


def test_conflicting_id_in_separately_bounded_neighbor_does_not_contaminate_scope():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        '<article data-product-sku="B2"><span>B2</span></article>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _json_ld_offer_markup(
            sku="B2",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


def _conflicting_offer_signals() -> str:
    return _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    ) + _json_ld_offer_markup(
        sku="B2",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="OutOfStock",
    )


@pytest.mark.parametrize("container_kind", ["product", "article"])
def test_conflict_id_scan_accepts_exactly_2000_clean_descendants(
    container_kind: str,
):
    opening = '<div class="product">' if container_kind == "product" else "<article>"
    closing = "</div>" if container_kind == "product" else "</article>"
    # h1 + SKU + price + 1,997 inert elements = exactly 2,000 descendants.
    raw_html = (
        opening
        + '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span>'
        + "<i></i>" * 1_997
        + closing
        + _conflicting_offer_signals()
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


@pytest.mark.parametrize("container_kind", ["product", "article"])
@pytest.mark.parametrize(
    "last_descendant",
    [
        "<i></i>",
        "<i>B2</i>",
        '<i aria-label="B2"></i>',
        '<i title="B2"></i>',
    ],
)
def test_conflict_id_scan_fails_closed_at_descendant_2001(
    container_kind: str,
    last_descendant: str,
):
    opening = '<div class="product">' if container_kind == "product" else "<article>"
    closing = "</div>" if container_kind == "product" else "</article>"
    raw_html = (
        opening
        + '<h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span>'
        + "<i></i>" * 1_997
        + last_descendant
        + closing
        + _conflicting_offer_signals()
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("total_descendants", [1_999, 2_000])
@pytest.mark.parametrize(
    "last_descendant",
    ["<i>B2</i>", '<i aria-label="B2"></i>', '<i title="B2"></i>'],
)
def test_conflict_id_scan_checks_last_descendant_at_accepted_boundary(
    total_descendants: int,
    last_descendant: str,
):
    # h1 + SKU + price + the final conflicting node occupy four slots.
    inert_count = total_descendants - 4
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span>'
        + "<i></i>" * inert_count
        + last_descendant
        + "</div>"
        + _conflicting_offer_signals()
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_oversized_unrelated_neighbor_does_not_contaminate_atomic_scope():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        '<aside class="recommendations">'
        + "<i></i>" * 2_001
        + '<i aria-label="B2"></i></aside>'
        + _conflicting_offer_signals()
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert offer["product_id"] == "A1"


@pytest.mark.parametrize("overflow", [False, True])
def test_conflict_id_descendant_cap_applies_to_hinted_microdata_scope(
    overflow: bool,
):
    last_descendant = '<i title="B2"></i>' if overflow else ""
    raw_html = (
        '<div class="product" itemscope '
        'itemtype="https://schema.org/Product">'
        '<meta itemprop="sku" content="A1">'
        '<h1 itemprop="name">Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span>'
        '<div itemprop="offers" itemscope '
        'itemtype="https://schema.org/Offer">'
        '<data class="price" itemprop="price" value="15.99">15,99 €</data>'
        '<meta itemprop="priceCurrency" content="EUR">'
        '<link itemprop="availability" href="https://schema.org/InStock">'
        "</div>"
        + "<i></i>" * 1_993
        + last_descendant
        + "</div>"
        + _json_ld_offer_markup(
            sku="B2",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
    )
    offers = _commercial_offer_evidence(raw_html)
    assert bool(offers) is not overflow


@pytest.mark.parametrize("attribute", ["aria-label", "title"])
@pytest.mark.parametrize(
    ("retained_length", "tail", "expected_offer"),
    [
        (12_000, "", True),
        (12_000, " B2", False),
        (12_001, "", False),
    ],
)
def test_conflict_id_accessible_label_byte_boundary_fails_closed(
    retained_length: int,
    tail: str,
    expected_offer: bool,
    attribute: str,
):
    visible_scope = "Applaws kassi kuivtoit 2 kg A1 15,99 €"
    attribute_length = retained_length - len(visible_scope) - 1
    attribute_value = "x" * (attribute_length - len(tail)) + tail
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span>'
        f'<i {attribute}="{attribute_value}"></i></div>'
        + _conflicting_offer_signals()
    )
    offers = _commercial_offer_evidence(raw_html)
    assert bool(offers) is expected_offer


@pytest.mark.parametrize("merchant_first", [False, True])
@pytest.mark.parametrize(
    "is_salable",
    [False, None, 0, 1, "false", "true", [], {}],
)
def test_incomplete_same_id_merchant_negative_poisons_json_offer(
    is_salable: Any,
    merchant_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _merchant_config_markup(
        {"sku": "a1", "actions": {"isSalable": is_salable}}
    )
    signals = [positive, negative]
    if merchant_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_absent_merchant_saleability_remains_unknown_not_negative():
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + _merchant_config_markup(
            {
                "sku": "A1",
                "name": "Applaws kassi kuivtoit 2 kg",
                "priceSimple": 15.99,
                "price": "15,99 €",
                "actions": {},
            }
        )
    )
    [offer] = _commercial_offer_evidence(raw_html)
    assert _offer_payload_is_valid(offer)


@pytest.mark.parametrize("microdata_first", [False, True])
@pytest.mark.parametrize(
    "availability",
    ["https://schema.org/OutOfStock", "", "unknown"],
)
def test_microdata_negative_same_id_poisons_json_offer_before_completeness(
    availability: str,
    microdata_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _microdata_offer_markup(
        sku="a1",
        availability=availability,
    )
    signals = [positive, negative]
    if microdata_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("json_first", [False, True])
def test_json_negative_same_id_poisons_positive_microdata_offer(
    json_first: bool,
):
    positive = (
        '<div itemscope itemtype="https://schema.org/Product">'
        '<h1 itemprop="name">Applaws kassi kuivtoit 2 kg</h1>'
        '<meta itemprop="sku" content="A1">'
        '<div itemprop="offers" itemscope '
        'itemtype="https://schema.org/Offer">'
        '<meta itemprop="price" content="15.99">'
        '<meta itemprop="priceCurrency" content="EUR">'
        '<link itemprop="availability" '
        'href="https://schema.org/InStock">'
        '<span class="price">15,99 €</span></div></div>'
    )
    negative = _json_ld_offer_markup(
        sku="a1",
        availability="OutOfStock",
    )
    signals = [positive, negative]
    if json_first:
        signals.reverse()
    assert _commercial_offer_evidence("".join(signals)) == []


@pytest.mark.parametrize("microdata_first", [False, True])
def test_anonymous_microdata_negative_name_poisons_visible_json_id(
    microdata_first: bool,
):
    positive = _json_ld_offer_markup(
        sku="A1",
        name="Applaws kassi kuivtoit 2 kg",
        price="15.99",
        currency="EUR",
        availability="InStock",
    )
    negative = _microdata_offer_markup(
        name="Applaws kassi kuivtoit 2 kg",
        availability="https://schema.org/OutOfStock",
    )
    signals = [positive, negative]
    if microdata_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="sku">A1</span><span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


@pytest.mark.parametrize("json_first", [False, True])
def test_json_negative_same_id_poisons_positive_merchant_offer(
    json_first: bool,
):
    positive = _merchant_config_markup(
        {
            "sku": "A1",
            "name": "Applaws kassi kuivtoit 2 kg",
            "priceSimple": 15.99,
            "price": "15,99 €",
            "actions": {"isSalable": True},
        }
    )
    negative = _json_ld_offer_markup(
        sku="Ａ１",
        availability="OutOfStock",
    )
    signals = [positive, negative]
    if json_first:
        signals.reverse()
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + "".join(signals)
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_poison_identity_overflow_fails_closed():
    negatives = "".join(
        _json_ld_offer_markup(
            sku=f"NEGATIVE{index}",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="OutOfStock",
        )
        for index in range(200)
    )
    raw_html = (
        '<div class="product"><h1>Applaws kassi kuivtoit 2 kg</h1>'
        '<span class="price">15,99 €</span></div>'
        + _json_ld_offer_markup(
            sku="A1",
            name="Applaws kassi kuivtoit 2 kg",
            price="15.99",
            currency="EUR",
            availability="InStock",
        )
        + negatives
    )
    assert _commercial_offer_evidence(raw_html) == []


def test_observed_offer_candidates_are_untrusted_url_only_rows():
    lifecycle = _ee_cat_food_topic_lifecycle()
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **lifecycle,
    )

    candidates = pipeline._code_owned_observed_offer_candidates()

    assert [row["url"] for row in candidates] == [
        _PETCITY_APPLAWS_URL,
        _PETCITY_ROYAL_CANIN_URL,
    ]
    assert all(
        set(row) == {
            "title",
            "url",
            "provider",
            "provider_source_id",
            "retrieved_at",
            "provider_response_hash",
            "provider_query_ids",
            "provider_queries",
            "citation_metadata",
            "provider_redirect",
            "country_codes",
            "market_terms",
            "acquisition_evidence_classes",
            "_code_owned_observed_offer_acquisition_hint",
        }
        for row in candidates
    )
    assert all(
        row["_code_owned_observed_offer_acquisition_hint"] is True
        for row in candidates
    )
    assert all("authority_proof" not in row for row in candidates)
    assert all("source_authority" not in row for row in candidates)
    assert all("price" not in json.dumps(row).casefold() for row in candidates)

    pipeline._store_direct_web_evidence(candidates, [])
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **lifecycle,
        },
        ["EE"],
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "blocked"
    assert quality["verified_claim_classes"] == []


@pytest.mark.parametrize("location", ["Latvia", "Global"])
def test_observed_offer_candidates_do_not_cross_market(location: str):
    pipeline = B2BDataPipeline(
        location=location,
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_ee_cat_food_topic_lifecycle(),
    )
    assert pipeline._code_owned_observed_offer_candidates() == []


@pytest.mark.parametrize(
    "anchors",
    [("copycat food",), ("cat food", "pet food")],
)
def test_observed_offer_candidates_do_not_broaden_or_mix_topic(anchors):
    scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    title = " and ".join(anchors) + " launch"
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="wrong-observed-topic",
            title=title,
            exact_topic_anchors=anchors,
        ),
        scope,
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem=title,
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_topic_lifecycle(seed, scope),
    )
    assert pipeline._code_owned_observed_offer_candidates() == []


def test_observed_offer_candidate_materializer_rejects_unsafe_registry_urls(
    monkeypatch,
):
    key = (("EE",), ("cat food",))
    safe = _PETCITY_APPLAWS_URL
    monkeypatch.setitem(
        pipeline_module._OBSERVED_OFFER_ACQUISITION_HINTS_V1,
        key,
        (
            "http://www.petcity.ee/cleartext",
            "https://user@www.petcity.ee/userinfo",
            "https://www.petcity.ee.attacker.example/copycat",
            "https://www.petcity.ee:443/explicit-port",
            "https://www.petcity.ee:444/wrong-port",
            safe,
            f"{safe}#duplicate",
        ),
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_ee_cat_food_topic_lifecycle(),
    )

    candidates = pipeline._code_owned_observed_offer_candidates()

    assert [row["url"] for row in candidates] == [safe]


@pytest.mark.asyncio
async def test_primary_targeted_emta_attestation_bypasses_search_and_verifies(
    monkeypatch,
):
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
    unresolved = _cached_unresolved_emta_row()
    search = MagicMock()
    search.search_web_general.side_effect = AssertionError(
        "registered publisher must not wait for dynamic attestation search"
    )

    candidates = await pipeline._targeted_authority_attestation_sources(
        [unresolved],
        [("searxng", search)],
    )

    search.search_web_general.assert_not_called()
    assert [row["url"] for row in candidates] == [_OLAF_EMTA_DIRECTORY_URL]
    assert "authority_proof" not in candidates[0]
    assert candidates[0]["citation_metadata"] == {
        "discovery": "code_owned_acquisition_hint"
    }
    assert pipeline.routing_diagnostics["targeted_authority_attestation"] == {
        "status": "completed",
        "host_count": 0,
        "route_count": 0,
        "candidate_count": 1,
        "elapsed_ms": pipeline.routing_diagnostics[
            "targeted_authority_attestation"
        ]["elapsed_ms"],
        "deadline_ms": 90_000,
        "deterministic_candidate_count": 1,
        "requested_host_count": 1,
    }

    enriched = await _fixture_authority_enricher()([unresolved, *candidates])
    emta = enriched[0]
    assert emta["authority_verification_status"] == (
        "independently_attested_direct_domain"
    )
    assert emta["authority_proof"]["attestation"]["final_url"] == (
        _OLAF_EMTA_DIRECTORY_URL
    )
    pipeline._store_direct_web_evidence([emta], [])
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
    persisted = json.dumps(
        {
            "sources": pipeline.market_sources,
            "claims": pipeline.market_claims,
            "diagnostics": pipeline.routing_diagnostics,
        }
    )
    assert "_code_owned_attestation_acquisition_hint" not in persisted
    assert "code_owned_acquisition_hint" not in persisted


@pytest.mark.asyncio
async def test_pr62_bare_emta_statutory_recovery_uses_exact_ec_attestation(
    monkeypatch,
):
    """Recover the PR62 bare-host result without aliasing it to ``www``."""

    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem=(
            "PR62 Production V2 — Estonia Cat Food Evidence Canary"
        ),
        target_user="Retail buyer",
        model=MagicMock(),
        required_evidence_classes=["statutory_current"],
    )
    unresolved = _cached_unresolved_emta_row(url=_EMTA_BARE_VAT_URL)
    [candidate] = pipeline._code_owned_attestation_candidates([unresolved])
    assert candidate["url"] == _EC_EMTA_BARE_DIRECTORY_URL
    assert candidate["target_authority_host"] == "emta.ee"
    assert "authority_proof" not in candidate

    source_rows = [unresolved]
    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=_fixture_authority_enricher(
            directory_url=_EC_EMTA_BARE_DIRECTORY_URL,
            directory_text=_EC_EMTA_BARE_DIRECTORY_TEXT,
            directory_final_url=_EC_EMTA_BARE_DIRECTORY_URL,
            direct_url=_EMTA_BARE_VAT_URL,
        ),
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [], source_rows
        )

    assert recovered >= 1
    assert len(source_rows) == 1
    emta = source_rows[0]
    assert emta["url"] == _EMTA_BARE_VAT_URL
    assert emta["publisher"] == "emta.ee"
    assert emta["authority_verification_status"] == (
        "independently_attested_direct_domain"
    )
    assert emta["authority_proof"]["direct"]["final_host"] == "emta.ee"
    assert emta["authority_proof"]["attestation"]["final_url"] == (
        _EC_EMTA_BARE_DIRECTORY_URL
    )
    assert validate_authority_proof(
        emta,
        requested_country_codes=["EE"],
    )
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
    assert pipeline.routing_diagnostics["statutory_recovery"][
        "route_count"
    ] == 0
    assert pipeline.routing_diagnostics["statutory_recovery"][
        "deterministic_attestation_candidate_count"
    ] == 1
    persisted = json.dumps(
        [pipeline.market_sources, pipeline.market_claims, pipeline.routing_diagnostics]
    )
    assert "_code_owned_attestation_acquisition_hint" not in persisted
    assert "code_owned_acquisition_hint" not in persisted


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("directory_text", "directory_final_url"),
    [
        (
            "European Commission VAT page for Estonia without a publisher link.",
            _EC_EMTA_BARE_DIRECTORY_URL,
        ),
        (
            "European Commission VAT page for Estonia. Website: "
            "https://emta.ee.attacker.example/current-vat",
            _EC_EMTA_BARE_DIRECTORY_URL,
        ),
        (
            "European Commission VAT page for Estonia. Website: "
            "https://notemta.ee/current-vat",
            _EC_EMTA_BARE_DIRECTORY_URL,
        ),
        (
            _normalized_document_text(
                "<html><body>European Commission VAT page for Estonia. "
                "<script>https://emta.ee/current-vat</script>"
                "<span style='display:none'>emta.ee</span></body></html>",
                is_html=True,
            ),
            _EC_EMTA_BARE_DIRECTORY_URL,
        ),
        (
            "European Commission VAT page for Latvia. Website: "
            "https://emta.ee/current-vat",
            _EC_EMTA_BARE_DIRECTORY_URL,
        ),
        (
            _EC_EMTA_BARE_DIRECTORY_TEXT,
            "https://attacker.example/redirected-directory",
        ),
    ],
    ids=[
        "missing-host",
        "suffix-lookalike",
        "near-lookalike",
        "hidden-host-only",
        "wrong-country",
        "redirected-final-host",
    ],
)
async def test_bare_emta_hint_rejects_unbound_or_lookalike_attestations(
    monkeypatch,
    directory_text,
    directory_final_url,
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
    unresolved = _cached_unresolved_emta_row(url=_EMTA_BARE_VAT_URL)
    [hint] = pipeline._code_owned_attestation_candidates([unresolved])
    enriched = await _fixture_authority_enricher(
        directory_url=_EC_EMTA_BARE_DIRECTORY_URL,
        directory_text=directory_text,
        directory_final_url=directory_final_url,
        direct_url=_EMTA_BARE_VAT_URL,
    )([hint, unresolved])

    emta = next(
        row
        for row in enriched
        if "statutory_current"
        in set(row.get("acquisition_evidence_classes") or [])
    )
    assert "authority_proof" not in emta
    assert emta.get("source_authority") != "official_public"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("directory_text", "directory_final_url", "directory_error", "target_host"),
    [
        (
            "European Anti-Fraud Office. Tax and Customs Board. Country: Estonia.",
            _OLAF_EMTA_DIRECTORY_URL,
            None,
            "www.emta.ee",
        ),
        (
            _normalized_document_text(
                "<html><body>European Anti-Fraud Office. Tax and Customs Board. "
                "Country: Estonia. <script>www.emta.ee</script>"
                "<span style='display:none'>www.emta.ee</span></body></html>",
                is_html=True,
            ),
            _OLAF_EMTA_DIRECTORY_URL,
            None,
            "www.emta.ee",
        ),
        (
            "European Anti-Fraud Office. Tax and Customs Board. Website: "
            "www.emta.ee Country: Latvia.",
            _OLAF_EMTA_DIRECTORY_URL,
            None,
            "www.emta.ee",
        ),
        (
            _OLAF_EMTA_DIRECTORY_TEXT,
            "https://attacker.example/redirected-directory",
            None,
            "www.emta.ee",
        ),
        (
            _OLAF_EMTA_DIRECTORY_TEXT,
            _OLAF_EMTA_DIRECTORY_URL,
            None,
            "",
        ),
        (
            _OLAF_EMTA_DIRECTORY_TEXT,
            _OLAF_EMTA_DIRECTORY_URL,
            TimeoutError("directory unavailable"),
            "www.emta.ee",
        ),
    ],
    ids=[
        "tampered-missing-host",
        "hidden-host-only",
        "wrong-country",
        "redirected-final-host",
        "missing-target-binding",
        "directory-outage",
    ],
)
async def test_code_owned_attestation_stays_fail_closed_under_adversarial_inputs(
    monkeypatch,
    directory_text,
    directory_final_url,
    directory_error,
    target_host,
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
    [hint] = pipeline._code_owned_attestation_candidates(
        [_cached_unresolved_emta_row()]
    )
    hint["target_authority_host"] = target_host
    enriched = await _fixture_authority_enricher(
        directory_text=directory_text,
        directory_final_url=directory_final_url,
        directory_error=directory_error,
    )([hint, _cached_unresolved_emta_row()])

    emta = next(
        row
        for row in enriched
        if "statutory_current"
        in set(row.get("acquisition_evidence_classes") or [])
    )
    assert "authority_proof" not in emta
    assert emta.get("source_authority") != "official_public"


@pytest.mark.asyncio
async def test_code_owned_attestation_cannot_cross_attest_another_publisher(
    monkeypatch,
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
    [hint] = pipeline._code_owned_attestation_candidates(
        [_cached_unresolved_emta_row()]
    )
    attacker_url = "https://attacker.example/current-tax"
    attacker_text = (
        "Estonia national tax authority. Current VAT is 99% effective "
        "2026-01-01."
    )

    async def fetcher(url):
        if url == _OLAF_EMTA_DIRECTORY_URL:
            return {
                "final_url": url,
                "text": (
                    _OLAF_EMTA_DIRECTORY_TEXT
                    + " Unrelated website: attacker.example"
                ),
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            }
        if url == attacker_url:
            return {
                "final_url": url,
                "text": attacker_text,
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            }
        if url == _EMTA_VAT_URL:
            return {
                "final_url": url,
                "text": _EMTA_VAT_TEXT,
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            }
        raise AssertionError(f"unexpected authority URL: {url}")

    rows = await real_enrich_authority_sources(
        [
            hint,
            _cached_unresolved_emta_row(),
            {
                "url": attacker_url,
                "provider": "searxng",
                "country_codes": ["EE"],
                "market_terms": ["Estonia"],
                "acquisition_evidence_classes": ["statutory_current"],
            },
        ],
        fetcher=fetcher,
    )

    emta = next(row for row in rows if row.get("url") == _EMTA_VAT_URL)
    attacker = next(row for row in rows if row.get("url") == attacker_url)
    assert emta["authority_proof"]["proof_type"] == (
        "independent_public_root_attestation"
    )
    assert "authority_proof" not in attacker
    assert attacker.get("source_authority") != "official_public"


@pytest.mark.asyncio
async def test_statutory_recovery_uses_cached_emta_hint_without_healthy_provider(
    monkeypatch,
):
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
    source_rows = [_cached_unresolved_emta_row()]
    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=_fixture_authority_enricher(),
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [], source_rows
        )

    assert recovered >= 1
    assert source_rows[0]["authority_proof"]["attestation"]["final_url"] == (
        _OLAF_EMTA_DIRECTORY_URL
    )
    statutory_claims = [
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "statutory_current"
    ]
    assert statutory_claims
    assert len({row["claim_id"] for row in statutory_claims}) == len(
        statutory_claims
    )
    assert len({row["source_id"] for row in pipeline.market_sources}) == 1
    assert pipeline.routing_diagnostics["statutory_recovery"]["route_count"] == 0
    assert pipeline.routing_diagnostics["statutory_recovery"][
        "deterministic_attestation_candidate_count"
    ] == 1
    persisted = json.dumps(
        [pipeline.market_sources, pipeline.market_claims, pipeline.routing_diagnostics]
    )
    assert "_code_owned_attestation_acquisition_hint" not in persisted
    assert "code_owned_acquisition_hint" not in persisted


@pytest.mark.asyncio
async def test_statutory_recovery_provider_only_emta_result_is_attested_once(
    monkeypatch,
):
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

    class Search:
        def __init__(self):
            self.calls = 0

        def search_web_general(self, _query):
            self.calls += 1
            return {
                "search_performed": True,
                "sources": [{"title": "Standard VAT rate", "url": _EMTA_VAT_URL}],
                "runtime_diagnostics": {"status": "completed"},
            }

    search = Search()
    source_rows = []
    with patch(
        "api.research.simulation_bridge.services.pipeline.enrich_authority_sources",
        side_effect=_fixture_authority_enricher(),
    ):
        recovered = await pipeline._recover_missing_statutory_evidence(
            [("searxng", search)], source_rows
        )

    assert recovered >= 1
    assert search.calls == 1
    assert len(source_rows) == 1
    assert source_rows[0]["url"] == _EMTA_VAT_URL
    statutory_claims = [
        row
        for row in pipeline.market_claims
        if row.get("evidence_class") == "statutory_current"
    ]
    assert statutory_claims
    assert len({row["claim_id"] for row in statutory_claims}) == len(
        statutory_claims
    )
    assert len({row["source_id"] for row in pipeline.market_sources}) == 1


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

    async def preserve_candidate_sources(rows):
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
        side_effect=preserve_candidate_sources,
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
    claim_text = "Estonia's current standard VAT rate is 24% effective 2026-01-01."
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
    topic_scope = ConfirmedMarketScope(
        scope_label="Brazil", country_codes=("BR",), confirmed=True
    )
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="brazil-cat-food",
            title="Brazil cat food launch",
            problem_scope=(
                "Launch cat food commercially while outperforming the prior "
                "baseline quality score and defending unit economics."
            ),
            target_user="Pet food distributors and launch steering committee",
        ),
        topic_scope,
    )
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
        **_topic_lifecycle(topic_seed, topic_scope),
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
    for evidence_class in ("official_statistic", "observed_primary_market"):
        query = next(
            row["query"]
            for row in queries
            if row["evidence_class"] == evidence_class
        )
        assert "Exact product/category phrases: cat food." in query
        assert "baseline quality" not in query
        assert "unit economics" not in query
    observed_query = next(
        row["query"]
        for row in queries
        if row["evidence_class"] == "observed_primary_market"
    )
    assert "direct product-detail pages" in observed_query
    assert "schema.org Product/Offer" in observed_query
    assert "Exclude homepages and category/search pages" in observed_query
    # Three evidence classes plus one batched authority-directory query across
    # two independent providers; each route admits at most two direct sources.
    assert (len(queries) + 1) * 2 == 8
    assert (len(queries) + 1) * 2 * 2 == 16


def _authority_candidate(
    provider: str, evidence_class: str, ordinal: int
) -> dict:
    return {
        "url": f"https://{provider}.example.ee/{evidence_class}/{ordinal}",
        "provider": provider,
        "acquisition_evidence_classes": [evidence_class],
    }


def test_authority_scheduler_puts_two_provider_core_wave_before_overflow():
    rows = [
        _authority_candidate(provider, "observed_primary_market", ordinal)
        for provider in ("gemini", "searxng")
        for ordinal in range(6)
    ] + [
        _authority_candidate(provider, evidence_class, 0)
        for evidence_class in ("statutory_current", "official_statistic")
        for provider in ("gemini", "searxng")
    ]

    scheduled = _schedule_authority_candidates(rows)

    assert [
        (row["provider"], row["acquisition_evidence_classes"][0], row["url"].rsplit("/", 1)[-1])
        for row in scheduled[:8]
    ] == [
        ("gemini", "observed_primary_market", "0"),
        ("searxng", "observed_primary_market", "0"),
        ("gemini", "observed_primary_market", "1"),
        ("searxng", "observed_primary_market", "1"),
        ("gemini", "statutory_current", "0"),
        ("searxng", "statutory_current", "0"),
        ("gemini", "official_statistic", "0"),
        ("searxng", "official_statistic", "0"),
    ]
    assert len(scheduled) == 16


def test_observed_offer_hints_reserve_early_slots_without_starving_official_rows():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_ee_cat_food_topic_lifecycle(),
    )
    hints = pipeline._code_owned_observed_offer_candidates()
    noise = [
        _authority_candidate("gemini", "observed_primary_market", ordinal)
        for ordinal in range(24)
    ]
    official = [
        _authority_candidate(provider, evidence_class, 0)
        for provider in ("gemini", "searxng")
        for evidence_class in ("statutory_current", "official_statistic")
    ]

    scheduled = _schedule_authority_candidates([*noise, *official, *hints])

    assert [row["url"] for row in scheduled[:2]] == [
        _PETCITY_APPLAWS_URL,
        _PETCITY_ROYAL_CANIN_URL,
    ]
    assert all(row in scheduled for row in official)
    assert len(scheduled) <= pipeline_module._MAX_AUTHORITY_NETWORK_CANDIDATES


def test_scheduler_defensively_caps_code_owned_observed_rows_at_two():
    hints = [
        {
            "url": f"https://shop.example.ee/reviewed-{index}",
            "provider": pipeline_module._CODE_OWNED_OBSERVED_OFFER_PROVIDER,
            "acquisition_evidence_classes": ["observed_primary_market"],
        }
        for index in range(30)
    ]
    official = [
        _authority_candidate("gemini", evidence_class, 0)
        for evidence_class in ("statutory_current", "official_statistic")
    ]

    scheduled = _schedule_authority_candidates([*hints, *official])

    scheduled_hints = [
        row
        for row in scheduled
        if row.get("provider")
        == pipeline_module._CODE_OWNED_OBSERVED_OFFER_PROVIDER
    ]
    assert scheduled_hints == hints[:2]
    assert all(row in scheduled for row in official)
    assert len(scheduled) <= pipeline_module._MAX_AUTHORITY_NETWORK_CANDIDATES


def test_observed_hint_duplicate_does_not_consume_provider_candidate_capacity():
    other = [f"https://shop.example.ee/product-{index}" for index in range(6)]

    admitted = _admit_provider_candidate_urls(
        [_PETCITY_APPLAWS_URL, *other],
        existing_urls={_PETCITY_APPLAWS_URL},
        new_url_cap=6,
    )

    assert admitted == (_PETCITY_APPLAWS_URL, *other)


@pytest.mark.asyncio
async def test_reviewed_observed_offer_hints_pass_full_signed_topic_lifecycle(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    lifecycle = _ee_cat_food_topic_lifecycle()
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **lifecycle,
    )
    candidates = pipeline._code_owned_observed_offer_candidates()
    html_by_url = {
        _PETCITY_APPLAWS_URL: _petcity_offer_html(
            product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
            sku="103681",
            visible_price="15,99 €",
            structured_price="15.99",
        ),
        _PETCITY_ROYAL_CANIN_URL: _petcity_offer_html(
            product_name="Royal Canin Light Weight kassitoit 400 g",
            sku="001201",
            visible_price="10,09 €",
            structured_price="10.09",
        ),
    }

    async def fetcher(url: str) -> dict:
        raw_html = html_by_url[url]
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    enriched = await real_enrich_authority_sources(candidates, fetcher=fetcher)
    pipeline._store_direct_web_evidence(enriched, [])
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **lifecycle,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    assert {row["normalized_value"] for row in quality["verified_facts"]} == {
        "10.09:eur",
        "15.99:eur",
    }
    durable = json.dumps(
        [pipeline.market_sources, pipeline.market_claims], ensure_ascii=False
    )
    assert "_code_owned_observed_offer_acquisition_hint" not in durable
    assert "code_owned_acquisition_hint" not in durable


@pytest.mark.asyncio
async def test_observed_hint_reaches_enrichment_without_a_search_provider(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    monkeypatch.setitem(
        pipeline_module._OBSERVED_OFFER_ACQUISITION_HINTS_V1,
        (("EE",), ("cat food",)),
        (_PETCITY_APPLAWS_URL,),
    )
    lifecycle = _ee_cat_food_topic_lifecycle()
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        required_evidence_classes=["observed_primary_market"],
        **lifecycle,
    )
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
    )

    async def fetcher(url: str) -> dict:
        assert url == _PETCITY_APPLAWS_URL
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    async def enrich(rows: list[dict]) -> list[dict]:
        return await real_enrich_authority_sources(rows, fetcher=fetcher)

    with patch(
        "backend.services.generative.gemini_search_service."
        "GeminiSearchService.is_available",
        return_value=False,
    ), patch(
        "backend.services.generative.searxng_search_service."
        "SearxngSearchService.is_available",
        return_value=False,
    ), patch(
        "api.research.simulation_bridge.services.pipeline."
        "enrich_authority_sources",
        side_effect=enrich,
    ):
        companies = await pipeline._discover_via_web_search()

    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **lifecycle,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert companies == []
    assert quality["status"] == "passed", quality
    assert quality["verified_facts"][0]["normalized_value"] == "15.99:eur"


@pytest.mark.asyncio
async def test_attempted_source_ledger_rejects_arbitrary_authority_diagnostics(
    monkeypatch,
):
    lifecycle = _ee_cat_food_topic_lifecycle()
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        model=MagicMock(),
        data_source="web",
        required_evidence_classes=["observed_primary_market"],
        **lifecycle,
    )

    async def inject_untrusted_diagnostics(rows: list[dict]) -> list[dict]:
        for row in rows:
            row.update(
                {
                    "direct_fetch_status": "retrieved",
                    "jurisdiction_binding_status": "verified",
                    "authority_processing_status": "internal_secret_status",
                    "authority_failure_category": "raw_secret_error_message",
                }
            )
        return rows

    with patch(
        "backend.services.generative.gemini_search_service."
        "GeminiSearchService.is_available",
        return_value=False,
    ), patch(
        "backend.services.generative.searxng_search_service."
        "SearxngSearchService.is_available",
        return_value=False,
    ), patch(
        "api.research.simulation_bridge.services.pipeline."
        "enrich_authority_sources",
        side_effect=inject_untrusted_diagnostics,
    ):
        await pipeline._discover_via_web_search()

    attempted = pipeline.routing_diagnostics["attempted_sources"]
    assert len(attempted) == 2
    assert all(
        row["authority_processing_status"] == "invalid" for row in attempted
    )
    assert all(
        row["authority_failure_category"] == "invalid" for row in attempted
    )
    assert "secret" not in json.dumps(attempted).casefold()


@pytest.mark.asyncio
@pytest.mark.parametrize("first_failure", ["stale", "out_of_stock", "challenge"])
async def test_bad_reviewed_offer_fails_closed_while_second_hint_remains_fallback(
    monkeypatch,
    first_failure: str,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    lifecycle = _ee_cat_food_topic_lifecycle()
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **lifecycle,
    )
    candidates = pipeline._code_owned_observed_offer_candidates()
    applaws = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
    )
    royal = _petcity_offer_html(
        product_name="Royal Canin Light Weight kassitoit 400 g",
        sku="001201",
        visible_price="10,09 €",
        structured_price="10.09",
    )

    async def fetcher(url: str) -> dict:
        if url == _PETCITY_APPLAWS_URL:
            if first_failure == "challenge":
                raise RetrievalChallengeError("challenge")
            if first_failure == "out_of_stock":
                raw_html = _petcity_offer_html(
                    product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
                    sku="103681",
                    visible_price="15,99 €",
                    structured_price="15.99",
                    availability="OutOfStock",
                )
            else:
                raw_html = applaws
            retrieved_at = (
                "2020-01-01T00:00:00+00:00"
                if first_failure == "stale"
                else _AUTHORITY_RETRIEVED_AT
            )
        else:
            raw_html = royal
            retrieved_at = _AUTHORITY_RETRIEVED_AT
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": retrieved_at,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    enriched = await real_enrich_authority_sources(candidates, fetcher=fetcher)
    pipeline._store_direct_web_evidence(enriched, [])
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            **lifecycle,
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    verified = {
        row["normalized_value"] for row in quality["verified_facts"]
    }
    assert "10.09:eur" in verified
    assert "15.99:eur" not in verified


def test_observed_candidate_cap_keeps_sixth_recovery_and_excludes_seventh():
    urls = [f"https://shop.example.ee/challenge-{index}" for index in range(5)]
    urls.extend(
        [
            "https://shop.example.ee/valid-product-offer",
            "https://shop.example.ee/excluded-overflow",
        ]
    )

    admitted = _admit_provider_candidate_urls(
        urls, existing_urls=set(), new_url_cap=6
    )
    scheduled = _schedule_authority_candidates(
        [
            {
                "url": url,
                "provider": "gemini",
                "acquisition_evidence_classes": ["observed_primary_market"],
            }
            for url in admitted
        ]
    )

    assert admitted[-1].endswith("valid-product-offer")
    assert all("excluded-overflow" not in url for url in admitted)
    assert scheduled[-1]["url"].endswith("valid-product-offer")
    assert len(scheduled) == 6


def test_duplicate_urls_do_not_charge_second_provider_new_candidate_cap():
    shared = [f"https://shop.example.ee/shared-{index}" for index in range(6)]
    unique = "https://shop.example.ee/searxng-unique-product"

    admitted = _admit_provider_candidate_urls(
        [*shared, unique],
        existing_urls=set(shared),
        new_url_cap=6,
    )

    assert admitted == (*shared, unique)


def test_fragment_variants_merge_as_one_retrieval_and_preserve_later_candidate():
    shared = "https://shop.example.ee/shared-product"
    fragments = [f"{shared}#section-{index}" for index in range(12)]
    valid = "https://shop.example.ee/valid-product"

    admitted = _admit_provider_candidate_urls(
        [*fragments, valid],
        existing_urls={shared},
        new_url_cap=6,
    )

    assert admitted == (fragments[0], valid)


def test_authority_scheduler_caps_network_and_preserves_one_eurostat_row():
    rows = [
        _authority_candidate(f"provider-{index}", "statutory_current", 0)
        for index in range(30)
    ]
    rows.append(
        {
            "url": "https://ec.europa.eu/eurostat/api/data",
            "provider": "eurostat_comext_official",
            "acquisition_evidence_classes": ["official_statistic"],
        }
    )

    scheduled = _schedule_authority_candidates(rows)

    assert len(scheduled) == 25
    assert scheduled[0]["provider"] == "eurostat_comext_official"


@pytest.mark.asyncio
async def test_priority_offer_proofs_finish_before_saturated_scheduled_core(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    monkeypatch.setattr(authority_module, "_AUTHORITY_ENRICHMENT_SECONDS", 1.0)
    monkeypatch.setattr(authority_module, "_AUTHORITY_PROOF_RESERVE_SECONDS", 0.5)
    monkeypatch.setattr(authority_module, "_AUTHORITY_PRIORITY_PROOF_SECONDS", 0.3)
    monkeypatch.setattr(
        authority_module,
        "_AUTHORITY_ORDINARY_PROOF_RESERVE_SECONDS",
        0.2,
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_ee_cat_food_topic_lifecycle(),
    )
    hints = pipeline._code_owned_observed_offer_candidates()
    eurostat = {
        "url": "https://ec.europa.eu/eurostat/api/comext/estonia",
        "provider": "eurostat_comext_official",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "acquisition_evidence_classes": ["official_statistic"],
    }
    ordinary = [
        {
            "url": f"https://ordinary-{index}.example.ee/source",
            "provider": f"ordinary-{index}",
            "provider_source_id": f"ordinary-{index}",
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
            "acquisition_evidence_classes": ["statutory_current"],
        }
        for index in range(18)
    ]
    scheduled = _schedule_authority_candidates([*ordinary, *hints, eurostat])
    original_urls = [row["url"] for row in scheduled]
    assert len(scheduled) == 21
    assert scheduled[0] is eurostat
    assert scheduled[1:3] == hints

    html_by_url = {
        _PETCITY_APPLAWS_URL: _petcity_offer_html(
            product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
            sku="103681",
            visible_price="15,99 €",
            structured_price="15.99",
        ),
        _PETCITY_ROYAL_CANIN_URL: _petcity_offer_html(
            product_name="Royal Canin Light Weight kassitoit 400 g",
            sku="001201",
            visible_price="10,09 €",
            structured_price="10.09",
        ),
    }

    async def fetcher(url: str) -> dict:
        raw_html = html_by_url.get(url, "<main>Estonia authority page</main>")
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    proof_semaphore = asyncio.Semaphore(1)
    release_ordinary = asyncio.Event()
    priority_done = asyncio.Event()
    ordinary_started = asyncio.Event()
    priority_count = 0
    proof_order: list[str] = []

    async def saturated_cpu(_executor, function, *args, **kwargs):
        nonlocal priority_count
        async with proof_semaphore:
            row = args[0]
            if row.get("_code_owned_observed_offer_acquisition_hint") is True:
                proof_order.append(str(row["url"]))
                outcome = function(*args, **kwargs)
                priority_count += 1
                if priority_count == 2:
                    priority_done.set()
                return outcome
            ordinary_started.set()
            await release_ordinary.wait()
            proof_order.append(str(row["url"]))
            return function(*args, **kwargs)

    monkeypatch.setattr(authority_module, "_run_authority_cpu", saturated_cpu)
    enrichment = asyncio.create_task(
        real_enrich_authority_sources(scheduled, fetcher=fetcher)
    )
    try:
        await asyncio.wait_for(priority_done.wait(), timeout=0.5)
        release_ordinary.set()
        enriched = await asyncio.wait_for(enrichment, timeout=1.5)
    finally:
        release_ordinary.set()
        if not enrichment.done():
            enrichment.cancel()
            await asyncio.gather(enrichment, return_exceptions=True)

    assert ordinary_started.is_set()
    assert proof_order[:2] == [_PETCITY_APPLAWS_URL, _PETCITY_ROYAL_CANIN_URL]
    assert [row["url"] for row in enriched] == original_urls
    assert all(row["authority_proof"] for row in enriched[1:3])
    assert all(
        row.get("authority_processing_status")
        in {"completed", "stage_deadline_exceeded"}
        for row in enriched
    )


@pytest.mark.asyncio
async def test_hung_priority_reserves_time_for_official_core_proof(monkeypatch):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    monkeypatch.setattr(authority_module, "_AUTHORITY_ENRICHMENT_SECONDS", 0.3)
    monkeypatch.setattr(authority_module, "_AUTHORITY_PROOF_RESERVE_SECONDS", 0.2)
    monkeypatch.setattr(authority_module, "_AUTHORITY_PRIORITY_PROOF_SECONDS", 0.03)
    monkeypatch.setattr(
        authority_module,
        "_AUTHORITY_ORDINARY_PROOF_RESERVE_SECONDS",
        0.05,
    )
    eurostat_url = "https://ec.europa.eu/eurostat/api/comext/estonia"
    eurostat_text = (
        "Eurostat official statistics for Estonia. Data published 13 August 2026."
    )
    hint_url = _PETCITY_APPLAWS_URL
    hint_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
    )
    rows = [
        {
            "url": eurostat_url,
            "provider": "eurostat_comext_official",
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
            "acquisition_evidence_classes": ["official_statistic"],
            "_direct_document_candidate": {
                "final_url": eurostat_url,
                "text": eurostat_text,
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
                "commercial_offer_evidence": [],
                "structured_statistical_observations": [],
                "_structured_evidence_html": "",
            },
        },
        {
            "url": hint_url,
            "provider": "code_owned_observed_offer_registry",
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
            "acquisition_evidence_classes": ["observed_primary_market"],
            "_code_owned_observed_offer_acquisition_hint": True,
            "_direct_document_candidate": {
                "final_url": hint_url,
                "text": _normalized_document_text(hint_html, is_html=True),
                "retrieved_at": _AUTHORITY_RETRIEVED_AT,
                "commercial_offer_evidence": _commercial_offer_evidence(hint_html),
                "structured_statistical_observations": [],
                "_structured_evidence_html": hint_html,
            },
        },
    ]
    release_priority = threading.Event()
    priority_started = threading.Event()
    priority_finished = threading.Event()
    ordinary_finished = threading.Event()
    calls: list[str] = []
    original_outcome = authority_module._enrich_authority_row_outcome

    def cancellation_resistant_outcome(source, direct, attestations):
        url = str(source["url"])
        calls.append(url)
        if source.get("_code_owned_observed_offer_acquisition_hint") is True:
            priority_started.set()
            release_priority.wait(timeout=1.0)
            try:
                return original_outcome(source, direct, attestations)
            finally:
                priority_finished.set()
        outcome = original_outcome(source, direct, attestations)
        ordinary_finished.set()
        return outcome

    monkeypatch.setattr(
        authority_module,
        "_enrich_authority_row_outcome",
        cancellation_resistant_outcome,
    )
    try:
        enriched = await asyncio.wait_for(
            real_enrich_authority_sources(rows),
            timeout=0.4,
        )
        assert priority_started.is_set()
        assert ordinary_finished.is_set()
        assert not priority_finished.is_set()
    finally:
        release_priority.set()
        await asyncio.to_thread(priority_finished.wait, 0.3)

    assert calls.count(eurostat_url) == 1
    assert calls.count(hint_url) == 1
    assert enriched[0]["authority_processing_status"] == "completed"
    assert enriched[0]["authority_verification_status"] == (
        "recognized_public_root_direct"
    )
    assert enriched[1]["authority_processing_status"] == (
        "stage_deadline_exceeded"
    )
    assert enriched[1]["authority_failure_category"] == (
        "proof_stage_deadline_exceeded"
    )


def test_priority_budget_uses_fixed_ordinary_reserve_before_submission(
    monkeypatch,
):
    monkeypatch.setattr(authority_module, "_AUTHORITY_PRIORITY_PROOF_SECONDS", 10.0)
    monkeypatch.setattr(
        authority_module,
        "_AUTHORITY_ORDINARY_PROOF_RESERVE_SECONDS",
        3.0,
    )
    monkeypatch.setattr(authority_module.time, "monotonic", lambda: 85.0)
    assert authority_module._priority_authority_proof_budget(
        stage_deadline=100.0
    ) == 10.0

    monkeypatch.setattr(authority_module.time, "monotonic", lambda: 88.0)
    assert authority_module._priority_authority_proof_budget(
        stage_deadline=100.0
    ) == 9.0

    monkeypatch.setattr(authority_module.time, "monotonic", lambda: 97.0)
    assert authority_module._priority_authority_proof_budget(
        stage_deadline=100.0
    ) == 0.0


@pytest.mark.asyncio
async def test_zero_priority_budget_submits_no_priority_executor_work(monkeypatch):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    monkeypatch.setattr(authority_module, "_AUTHORITY_PRIORITY_PROOF_SECONDS", 0.0)
    raw_html = _petcity_offer_html(
        product_name="Applaws kassi kuivtoit, kana/part, 2 kg",
        sku="103681",
        visible_price="15,99 €",
        structured_price="15.99",
    )
    row = {
        "url": _PETCITY_APPLAWS_URL,
        "provider": "code_owned_observed_offer_registry",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "acquisition_evidence_classes": ["observed_primary_market"],
        "_code_owned_observed_offer_acquisition_hint": True,
    }
    calls = 0

    async def fetcher(url: str) -> dict:
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    async def forbidden_cpu(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise AssertionError("zero-budget priority proof was submitted")

    monkeypatch.setattr(authority_module, "_run_authority_cpu", forbidden_cpu)
    [enriched] = await real_enrich_authority_sources([row], fetcher=fetcher)

    assert calls == 0
    assert enriched["authority_processing_status"] == "stage_deadline_exceeded"
    assert enriched["authority_failure_category"] == (
        "proof_stage_deadline_exceeded"
    )


@pytest.mark.asyncio
async def test_rejected_priority_proof_is_one_shot_and_ordinary_still_runs(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_ee_cat_food_topic_lifecycle(),
    )
    hints = pipeline._code_owned_observed_offer_candidates()
    official_url = "https://ec.europa.eu/eurostat/api/comext/estonia"
    official = {
        "url": official_url,
        "provider": "eurostat_comext_official",
        "country_codes": ["EE"],
        "market_terms": ["Estonia"],
        "acquisition_evidence_classes": ["official_statistic"],
    }
    rows = _schedule_authority_candidates([official, *hints])
    valid_html = _petcity_offer_html(
        product_name="Royal Canin Light Weight kassitoit 400 g",
        sku="001201",
        visible_price="10,09 €",
        structured_price="10.09",
    )
    invalid_html = (
        '<nav class="category-navigation">Kassitoit alates 3,49 €</nav>'
        '<script type="application/ld+json">'
        '[{"@context":"https://schema.org","@type":"BreadcrumbList",'
        '"itemListElement":[]}]</script>'
    )
    call_counts = {str(row["url"]): 0 for row in rows}
    original_outcome = authority_module._enrich_authority_row_outcome

    def counted_outcome(source, direct, attestations):
        call_counts[str(source["url"])] += 1
        return original_outcome(source, direct, attestations)

    async def fetcher(url: str) -> dict:
        if url == _PETCITY_APPLAWS_URL:
            raw_html = invalid_html
        elif url == _PETCITY_ROYAL_CANIN_URL:
            raw_html = valid_html
        else:
            raw_html = "<main>Eurostat official statistics for Estonia.</main>"
        return {
            "final_url": url,
            "text": _normalized_document_text(raw_html, is_html=True),
            "retrieved_at": _AUTHORITY_RETRIEVED_AT,
            "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
            "structured_statistical_observations": [],
            "_structured_evidence_html": raw_html,
        }

    monkeypatch.setattr(
        authority_module,
        "_enrich_authority_row_outcome",
        counted_outcome,
    )
    enriched = await real_enrich_authority_sources(rows, fetcher=fetcher)

    assert all(count == 1 for count in call_counts.values())
    by_url = {str(row["url"]): row for row in enriched}
    assert by_url[_PETCITY_APPLAWS_URL]["authority_processing_status"] == (
        "completed"
    )
    assert by_url[_PETCITY_APPLAWS_URL]["authority_failure_category"] == (
        "primary_market_proof_rejected"
    )
    assert by_url[_PETCITY_ROYAL_CANIN_URL]["authority_verification_status"] == (
        "direct_primary_market_observation"
    )
    assert by_url[official_url]["authority_processing_status"] == "completed"


@pytest.mark.asyncio
async def test_sixth_observed_recovery_starts_inside_bounded_fetch_lane(monkeypatch):
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "test-authority-secret-32-bytes-minimum",
    )
    valid_url = "https://shop.example.ee/valid-product-offer"
    raw_html = (
        '<div>Estonia catalogue</div><div class="product">'
        '<h1>Alpha cat food</h1><div class="price">Current price €2.99</div>'
        '</div><script type="application/ld+json">{"@type":"Product",'
        '"name":"Alpha cat food","offers":{"@type":"Offer",'
        '"price":"2.99","priceCurrency":"EUR"}}</script>'
    )
    rows = [
        {
            **_authority_candidate("gemini", "observed_primary_market", index),
            "url": valid_url if index == 5 else f"https://shop.example.ee/challenge-{index}",
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        }
        for index in range(6)
    ] + [
        {
            **_authority_candidate("gemini", evidence_class, 0),
            "country_codes": ["EE"],
            "market_terms": ["Estonia"],
        }
        for evidence_class in ("statutory_current", "official_statistic")
    ]
    scheduled = _schedule_authority_candidates(rows)
    valid_started = asyncio.Event()
    release_slow = asyncio.Event()

    async def fetcher(url: str) -> dict:
        if url == valid_url:
            valid_started.set()
            return {
                "final_url": url,
                "text": _normalized_document_text(raw_html, is_html=True),
                "retrieved_at": "2026-08-13T00:00:00+00:00",
                "commercial_offer_evidence": _commercial_offer_evidence(raw_html),
                "_structured_evidence_html": raw_html,
            }
        await release_slow.wait()
        raise RetrievalChallengeError("challenge")

    task = asyncio.create_task(
        real_enrich_authority_sources(scheduled, fetcher=fetcher)
    )
    await asyncio.wait_for(valid_started.wait(), timeout=0.5)
    release_slow.set()
    enriched = await task

    valid = next(row for row in enriched if row["url"] == valid_url)
    assert valid["authority_proof"]["proof_type"] == (
        "direct_primary_market_observation"
    )


def test_observed_results_are_topic_ranked_before_per_route_source_cap():
    topic_scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="estonia-cat-food-ranking",
            title="Estonia cat food launch",
            problem_scope="Assess cat food prices and demand.",
            exact_topic_anchors=("cat food",),
        ),
        topic_scope,
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial launch",
        target_user="Retail buyer",
        model=MagicMock(),
        **_topic_lifecycle(topic_seed, topic_scope),
    )
    sources = [
        {"title": "Dog dry food", "url": "https://shop.example.ee/dog-1"},
        {"title": "Dog wet food", "url": "https://shop.example.ee/dog-2"},
        {"title": "Unknown product", "url": "https://shop.example.ee/cat"},
    ]
    claims = [
        {
            "text": "Current cat food catalogue price",
            "source_urls": ["https://shop.example.ee/cat"],
        }
    ]

    ranked = pipeline._rank_provider_sources_for_topic(
        "observed_primary_market", sources, claims
    )

    assert [row["url"] for row in ranked[:2]] == [
        "https://shop.example.ee/cat",
        "https://shop.example.ee/dog-1",
    ]
    assert pipeline._rank_provider_sources_for_topic(
        "observed_primary_market", sources, []
    ) == sources

    statistic_sources = [
        {"title": "Statistics office", "url": "https://stat.example.ee/home"},
        {"title": "Grocery turnover", "url": "https://stat.example.ee/grocery"},
        {"title": "Unknown dataset", "url": "https://stat.example.ee/cat-food"},
    ]
    statistic_claims = [{
        "text": "Official cat food expenditure dataset",
        "source_urls": ["https://stat.example.ee/cat-food"],
    }]
    assert [
        row["url"]
        for row in pipeline._rank_provider_sources_for_topic(
            "official_statistic", statistic_sources, statistic_claims
        )[:2]
    ] == [
        "https://stat.example.ee/cat-food",
        "https://stat.example.ee/home",
    ]


def test_estonian_trusted_alias_is_present_in_observed_acquisition_query():
    topic_scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="estonia-cat-food-query",
            title="Launch cat food commercially",
            problem_scope="Assess current cat food offers.",
            exact_topic_anchors=("cat food",),
        ),
        topic_scope,
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food commercially",
        target_user="Retail buyer",
        required_evidence_classes=["observed_primary_market"],
        **_topic_lifecycle(topic_seed, topic_scope),
    )

    [query] = pipeline._directed_evidence_queries()

    assert (
        "Exact product/category phrases: cat food, kassi kuivtoit, kassitoit."
        in query["query"]
    )
    assert pipeline.routing_diagnostics["topic_alias_registry_version"]


def test_topic_bound_pipeline_rejects_seed_without_confirmed_scope():
    scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="missing-topic-scope",
            title="Cat food launch",
            exact_topic_anchors=("cat food",),
        ),
        scope,
    )

    with pytest.raises(ValueError, match="requires a seed and confirmed market"):
        B2BDataPipeline(
            location="Estonia",
            business_problem="Launch cat food",
            target_user="Retail buyer",
            required_evidence_classes=["observed_primary_market"],
            topic_seed_contract=seed.model_dump(mode="json"),
        )


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
    topic_scope = ConfirmedMarketScope(
        scope_label="Estonia", country_codes=("EE",), confirmed=True
    )
    topic_seed = build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="estonia-cat-food-market",
            title="Commercial cat food market launch",
            problem_scope="Assess cat food demand and prices.",
            industry="Pet food",
            exact_topic_anchors=("cat food",),
        ),
        topic_scope,
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Commercial cat food market launch",
        target_user="Retail category buyer",
        model=MagicMock(),
        required_evidence_classes=[
            "official_statistic",
            "observed_primary_market",
        ],
        **_topic_lifecycle(topic_seed, topic_scope),
    )

    stat_url = "https://www.stat.ee/en/internal-trade"
    stat_html = """
    <figure data-uuid="trade-current">
      <h2>Household expenditure on pets and cat food</h2>
      <a href="https://andmed.stat.ee/en/stat/KM0107">dataset</a>
      <table data-series-orientation="column">
        <thead><tr><th data-series-name="Cat food expenditure"
          data-series-unit="million euros">Cat food expenditure</th></tr></thead>
        <tbody><tr><th data-category="1st quarter 2026">1st quarter 2026</th>
          <td>8,116.2</td></tr></tbody>
      </table><p>Last updated: 27 May 2026</p>
    </figure>
    """
    stat_text = (
        "Statistics Estonia official statistical publisher for Estonia. "
        + _normalized_document_text(stat_html, is_html=True)
    )
    stat_observations = _structured_statistical_observations(stat_html)
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
        structured_statistical_observations=stat_observations,
        direct_raw_html=stat_html,
    )

    catalog_url = "https://shop.example.ee/cat-food/sheba-340g"
    catalog_offer_html = (
        '<div>Estonia online storefront for local shoppers.</div>'
        '<article class="product-card"><h1>SHEBA cat food</h1>'
        '<p>Täistoit kiisueine lihaga kastmes, 340 g Osta</p>'
        '<div class="price">Current product price 3,29 €</div></article>'
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"SHEBA-340G","name":"SHEBA cat food","offers":'
        '{"@type":"Offer","price":"3.29","priceCurrency":"EUR"}}'
        "</script>"
    )
    catalog_text = _normalized_document_text(catalog_offer_html, is_html=True)
    catalog_proof = build_direct_primary_market_proof(
        direct_url=catalog_url,
        direct_text=catalog_text,
        country_codes=["EE"],
        commercial_offer_evidence=_commercial_offer_evidence(catalog_offer_html),
        direct_raw_html=catalog_offer_html,
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
        raw_html,
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
            "_structured_evidence_html": raw_html,
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
                raw_html=stat_html,
            ),
            source(
                url=catalog_url,
                title="Cat food catalogue",
                proof=catalog_proof,
                text=catalog_text,
                authority="first_party_catalog",
                verification="direct_primary_market_observation",
                raw_html=catalog_offer_html,
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
            **_topic_lifecycle(topic_seed, topic_scope),
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
                    "model": "models/gemini-3.7-flash",
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
        if url == _OLAF_EMTA_DIRECTORY_URL:
            return {
                "final_url": url,
                "text": (
                    "European Anti-Fraud Office. Tax and Customs Board. "
                    "Country: Estonia."
                ),
                "retrieved_at": "2026-08-13T00:00:00+00:00",
            }
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
        **_ee_cat_food_topic_lifecycle(),
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
        **_ee_cat_food_topic_lifecycle(),
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
