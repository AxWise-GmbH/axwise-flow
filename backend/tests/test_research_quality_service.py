import hashlib
import os
import re
from datetime import datetime, timezone

import pytest

from backend.services.research_quality_service import (
    COMMERCIAL_MARKET_LAUNCH,
    _has_exact_span_provenance,
    _normalized_value,
    clean_semantic_text,
    determine_claim_class_applicability,
    evaluate_critical_claims,
    validate_research_prd,
)
from backend.services.research_source_authority_service import (
    _commercial_offer_evidence,
    _normalized_document_text,
    _structured_statistical_observations,
    build_authority_claim_artifact,
    build_attested_authority_proof,
    build_direct_primary_market_proof,
    is_trusted_public_root,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    build_topic_seed,
)


def test_attestation_host_match_rejects_suffix_spoof():
    with pytest.raises(ValueError, match="does not reference"):
        build_attested_authority_proof(
            direct_url="https://stat.ee/data",
            direct_text="Statistics Estonia published retail turnover data for Estonia.",
            attestation_url="https://directory.europa.eu/authorities",
            attestation_text=(
                "Government agency directory: evilstat.ee is the official statistics office."
            ),
            country_codes=["EE"],
            retrieved_at="2026-08-12T12:00:00+00:00",
        )

    proof = build_attested_authority_proof(
        direct_url="https://stat.ee/data",
        direct_text="Statistics Estonia published retail turnover data for Estonia.",
        attestation_url="https://directory.europa.eu/authorities",
        attestation_text=(
            "Government agency directory: https://stat.ee/data is the official statistics office."
        ),
        country_codes=["EE"],
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert proof["proof_type"] == "independent_public_root_attestation"

    for spoof in (
        "Government directory: https://evil.gov/path/stat.ee is official.",
        "Government directory: https://evil.gov/stat.ee is official.",
    ):
        with pytest.raises(ValueError, match="does not reference"):
            build_attested_authority_proof(
                direct_url="https://stat.ee/data",
                direct_text="Statistics Estonia published data for Estonia.",
                attestation_url="https://directory.europa.eu/authorities",
                attestation_text=spoof,
                country_codes=["EE"],
            )

    bare = build_attested_authority_proof(
        direct_url="https://stat.ee/data",
        direct_text="Statistics Estonia published data for Estonia.",
        attestation_url="https://directory.europa.eu/authorities",
        attestation_text="Government statistics office directory (stat.ee).",
        country_codes=["EE"],
    )
    assert bare["proof_type"] == "independent_public_root_attestation"


pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
)


def _cat_food_topic_seed(*country_codes: str) -> dict:
    return build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id="cat-food-quality-test",
            title="Cat food commercial launch",
            problem_scope="Assess cat food demand using official statistics.",
            industry="Pet food",
            target_user="Pet-food category buyer",
            exact_topic_anchors=("cat food",),
        ),
        ConfirmedMarketScope(
            scope_label="test market",
            country_codes=country_codes or ("EE",),
            confirmed=True,
        ),
    ).model_dump(mode="json")


def _structured_statistic_grounding(
    *,
    source_id: str,
    source_url: str,
    value: str,
    series: str = "Cat food expenditure",
    period: str = "1st quarter 2026",
    dataset_id: str = "CAT001",
    unit: str = "million euros",
) -> dict:
    raw_html = f"""
    <figure data-uuid="cat-food-stat">
      <h2>Household expenditure on pets and cat food</h2>
      <a href="https://andmed.stat.ee/en/stat/{dataset_id}">dataset</a>
      <table data-series-orientation="column"><thead><tr>
        <th data-series-name="{series}" data-series-unit="{unit}">{series}</th>
      </tr></thead><tbody><tr>
        <th data-category="{period}">{period}</th><td>{value}</td>
      </tr></tbody></table><p>Last updated: 27 May 2026</p>
    </figure>
    """
    observations = _structured_statistical_observations(raw_html)
    assert len(observations) == 1
    observation = observations[0]
    direct_text = (
        "National public authority and official statistics office. "
        + _normalized_document_text(raw_html, is_html=True)
    )
    retrieved_at = "2026-08-12T12:00:00+00:00"
    proof = build_attested_authority_proof(
        direct_url=source_url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/authorities",
        attestation_text=f"Official public authority directory: {source_url}",
        country_codes=["EE"],
        retrieved_at=retrieved_at,
        structured_statistical_observations=observations,
        direct_raw_html=raw_html,
    )
    document = {
        "artifact_type": "direct_authority_document",
        "source_id": source_id,
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof["proof_signature"],
    }
    claim_text = observation["row_text"]
    artifact = build_authority_claim_artifact(
        source_id=source_id,
        source_url=source_url,
        authority_proof=proof,
        authority_document=document,
        claim_text=claim_text,
    )
    binding = artifact["claim_binding"]
    return {
        "market_sources": [{
            "source_id": source_id,
            "url": source_url,
            "publisher": source_url,
            "provider": "searxng",
            "country_codes": ["EE"],
            "source_authority": "official_public",
            "authority_verification_status": "independently_attested_direct_domain",
            "retrieved_at": retrieved_at,
            "authority_proof": proof,
            "_authority_document_artifact": document,
            "_structured_evidence_html": raw_html,
        }],
        "market_claims": [{
            "claim_id": f"claim-{source_id}",
            "subject": "Estonia",
            "predicate": "official cat food statistic",
            "object": claim_text,
            "source_ids": [source_id],
            "country_codes": ["EE"],
            "critical": True,
            "evidence_class": "official_statistic",
            "observation_end": observation["observation_end"],
            "published_at": observation["published_at"],
            "latest_release": True,
            "structured_statistical_observation": observation,
            "citation_metadata": {
                "segment_start": binding["claim_start"],
                "segment_end": binding["claim_end"],
                "span_target": "direct_authority_document",
                "offset_unit": "unicode_codepoints",
                "source_id": source_id,
            },
            "provenance_artifact": artifact,
        }],
        "topic_seed_contract": _cat_food_topic_seed("EE"),
    }


def _estonia_vat_grounding(*, value: str = "24%", direct: bool = True):
    claim_text = f"Estonia's standard VAT rate is {value} from July 2025."
    source_url = "https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax"
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        f"Value-added tax guidance for business clients. {claim_text}"
    )
    authority_proof = build_attested_authority_proof(
        direct_url=source_url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text=(
            "Official national authority directory: Estonian Tax and Customs Board, "
            "https://www.emta.ee"
        ),
        country_codes=["EE"],
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    source = {
        "source_id": "emta-vat",
        "url": source_url,
        "publisher": "www.emta.ee",
        "provider": "searxng",
        "country_codes": ["EE"],
        "source_authority": "official_public",
        "authority_verification_status": (
            "official_domain_verified" if direct else "provider_redirect_unverified"
        ),
        "retrieved_at": "2026-08-12T12:00:00+00:00",
        "authority_proof": authority_proof if direct else None,
    }
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": "emta-vat",
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": "2026-08-12T12:00:00+00:00",
        "authority_proof_signature": authority_proof["proof_signature"],
    }
    claim_artifact = build_authority_claim_artifact(
        source_id="emta-vat",
        source_url=source_url,
        authority_proof=authority_proof,
        authority_document=authority_document,
        claim_text=claim_text,
    )
    binding = claim_artifact["claim_binding"]
    return {
        "market_sources": [
            source
        ],
        "market_claims": [
            {
                "claim_id": "vat-current",
                "subject": "Estonia",
                "predicate": "standard VAT rate",
                "object": claim_text,
                "source_ids": ["emta-vat"],
                "country_codes": ["EE"],
                "critical": True,
                "effective_at": "2026-01-01T00:00:00+00:00",
                "current": True,
                "citation_metadata": {
                    "segment_start": binding["claim_start"],
                    "segment_end": binding["claim_end"],
                    "span_target": "direct_authority_document",
                    "offset_unit": "unicode_codepoints",
                    "source_id": "emta-vat",
                },
                "provenance_artifact": claim_artifact,
            }
        ],
    }


def _commercial_prd(regulatory_text: str):
    return {
        "prd_type": COMMERCIAL_MARKET_LAUNCH,
        "commercial_prd": {
            "market_scope": {"countries": ["EE"]},
            "market_and_demand_assessment": ["Grounded demand assessment"],
            "customer_segments": ["Retail category buyer"],
            "buying_roles": ["Economic buyer"],
            "regulatory_checklist": [regulatory_text],
            "competitors": ["Evidence-backed competitor set"],
            "suppliers_and_channels": ["Specialist retail"],
            "pricing_and_unit_economics": {
                "statement": "Net price derives from gross price and verified VAT.",
                "formula": "net_price = gross_price / (1 + vat_rate)",
                "input_claim_ids": ["vat-current"],
            },
            "go_to_market_plan_90_days": ["Validate", "Pilot", "Scale"],
            "risks_assumptions_and_validation": ["Interview buyers"],
        },
    }


def _replace_direct_claim(
    grounding: dict,
    *,
    claim_text: str,
    evidence_class: str,
    temporal_fields: dict,
) -> dict:
    source = grounding["market_sources"][0]
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        + claim_text
    )
    proof = build_attested_authority_proof(
        direct_url=source["url"],
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text="Official authority directory: https://www.emta.ee",
        country_codes=["EE"],
        retrieved_at=source["retrieved_at"],
    )
    source["authority_proof"] = proof
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": source["source_id"],
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": source["retrieved_at"],
        "authority_proof_signature": proof["proof_signature"],
    }
    artifact = build_authority_claim_artifact(
        source_id=source["source_id"],
        source_url=source["url"],
        authority_proof=proof,
        authority_document=authority_document,
        claim_text=claim_text,
    )
    binding = artifact["claim_binding"]
    claim = grounding["market_claims"][0]
    claim.update(
        {
            "object": claim_text,
            "evidence_class": evidence_class,
            "citation_metadata": {
                "segment_start": binding["claim_start"],
                "segment_end": binding["claim_end"],
                "span_target": "direct_authority_document",
                "offset_unit": "unicode_codepoints",
                "source_id": source["source_id"],
            },
            "provenance_artifact": artifact,
            **temporal_fields,
        }
    )
    return grounding


def _catalog_grounding(
    *,
    country_code: str,
    source_url: str,
    claims: list[tuple[str, str]],
) -> dict:
    """Build production-shaped exact first-party catalogue observations."""

    retrieved_at = "2026-08-12T12:00:00+00:00"
    direct_text = "Current first-party product catalogue. " + " ".join(
        text for _, text in claims
    )
    offer_scripts = []
    for _claim_id, claim_text in claims:
        visible_price = re.search(
            r"(?:EUR|BRL|USD|GBP|€|\$|£)\s*(\d+(?:[.,]\d+)?)|"
            r"(\d+(?:[.,]\d+)?)\s*(€|\$|£)",
            claim_text,
            re.IGNORECASE,
        )
        if not visible_price:
            continue
        price = (visible_price.group(1) or visible_price.group(2)).replace(",", ".")
        token = visible_price.group(0).upper()
        currency = "BRL" if "BRL" in token else "USD" if "$" in token or "USD" in token else "GBP" if "£" in token or "GBP" in token else "EUR"
        product_name = " ".join(claim_text.split()[:4])
        offer_scripts.append(
            '<script type="application/ld+json">'
            f'{{"@type":"Product","name":"{product_name}","offers":'
            f'{{"@type":"Offer","price":"{price}","priceCurrency":"{currency}"}}}}'
            "</script>"
        )
    offer_html = "".join(offer_scripts)
    raw_html = f"<div>{direct_text}</div>{offer_html}"
    structured_offer = _commercial_offer_evidence(offer_html)
    proof = build_direct_primary_market_proof(
        direct_url=source_url,
        direct_text=direct_text,
        country_codes=[country_code],
        commercial_offer_evidence=structured_offer,
        direct_raw_html=raw_html,
        retrieved_at=retrieved_at,
    )
    source_id = f"catalog-{country_code.casefold()}"
    document = {
        "artifact_type": "direct_authority_document",
        "source_id": source_id,
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof["proof_signature"],
    }
    market_claims = []
    for claim_id, claim_text in claims:
        artifact = build_authority_claim_artifact(
            source_id=source_id,
            source_url=source_url,
            authority_proof=proof,
            authority_document=document,
            claim_text=claim_text,
        )
        binding = artifact["claim_binding"]
        market_claims.append(
            {
                "claim_id": claim_id,
                "subject": country_code,
                "predicate": "current catalogue product price",
                "object": claim_text,
                "source_ids": [source_id],
                "country_codes": [country_code],
                "critical": True,
                "evidence_class": "observed_primary_market",
                "observed_at": retrieved_at,
                "citation_metadata": {
                    "segment_start": binding["claim_start"],
                    "segment_end": binding["claim_end"],
                    "span_target": "direct_authority_document",
                    "offset_unit": "unicode_codepoints",
                    "source_id": source_id,
                },
                "provenance_artifact": artifact,
            }
        )
    return {
        "market_sources": [
            {
                "source_id": source_id,
                "url": source_url,
                "publisher": source_url,
                "provider": "searxng",
                "country_codes": [country_code],
                "source_authority": "first_party_catalog",
                "authority_verification_status": "direct_primary_market_observation",
                "retrieved_at": retrieved_at,
                "authority_proof": proof,
                "_authority_document_artifact": document,
                "_structured_evidence_html": raw_html,
            }
        ],
        "market_claims": market_claims,
    }


def _official_grounding(
    *,
    source_id: str,
    source_url: str,
    claims: list[dict],
) -> dict:
    retrieved_at = "2026-08-12T12:00:00+00:00"
    direct_text = (
        "National public authority, official statistics office and government tax authority. "
        + " ".join(str(row["text"]) for row in claims)
    )
    proof = build_attested_authority_proof(
        direct_url=source_url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/authorities",
        attestation_text=f"Official public authority directory: {source_url}",
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )
    document = {
        "artifact_type": "direct_authority_document",
        "source_id": source_id,
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof["proof_signature"],
    }
    market_claims = []
    for row in claims:
        artifact = build_authority_claim_artifact(
            source_id=source_id,
            source_url=source_url,
            authority_proof=proof,
            authority_document=document,
            claim_text=row["text"],
        )
        binding = artifact["claim_binding"]
        market_claims.append(
            {
                "claim_id": row["claim_id"],
                "subject": "Estonia",
                "predicate": row.get("predicate") or "official material fact",
                "object": row["text"],
                "source_ids": [source_id],
                "country_codes": ["EE"],
                "critical": True,
                "evidence_class": row["evidence_class"],
                "citation_metadata": {
                    "segment_start": binding["claim_start"],
                    "segment_end": binding["claim_end"],
                    "span_target": "direct_authority_document",
                    "offset_unit": "unicode_codepoints",
                    "source_id": source_id,
                },
                "provenance_artifact": artifact,
                **row.get("temporal", {}),
            }
        )
    return {
        "market_sources": [
            {
                "source_id": source_id,
                "url": source_url,
                "publisher": source_url,
                "provider": "searxng",
                "country_codes": ["EE"],
                "source_authority": "official_public",
                "authority_verification_status": "official_domain_verified",
                "retrieved_at": retrieved_at,
                "authority_proof": proof,
            }
        ],
        "market_claims": market_claims,
    }


def _merge_grounding(*parts: dict) -> dict:
    merged = {
        "market_sources": [row for part in parts for row in part["market_sources"]],
        "market_claims": [row for part in parts for row in part["market_claims"]],
    }
    topic_seed = next(
        (part.get("topic_seed_contract") for part in parts if part.get("topic_seed_contract")),
        None,
    )
    if topic_seed:
        merged["topic_seed_contract"] = topic_seed
    return merged


def test_estonia_vat_is_verified_from_dynamic_official_evidence_not_catalogue():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "passed"
    assert quality["verified_count"] == 1
    assert quality["verified_facts"][0]["display_value"] == "24%"


def test_complete_three_class_ledger_quarantines_rejected_candidates():
    statutory = _estonia_vat_grounding()
    statistic = _structured_statistic_grounding(
        source_id="statistics-current",
        source_url="https://statistics.example.ee/latest",
        value="1.37",
        series="Cat food household expenditure",
        period="2025",
    )
    catalogue = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/catalog",
        claims=[
            (
                "local-offer",
                "Royal Canin kassitoit kana 400 g Tavahind 89,99 €.",
            ),
            ("navigation-candidate", "Ostukorv 0,00 €."),
        ],
    )
    grounding = _merge_grounding(statutory, statistic, catalogue)
    # Reproduce the noisy PR39 candidate ledger without fabricating new source
    # authority. These exact signed rows remain diagnostic, but none may veto
    # independently complete mandatory-class coverage.
    valid_candidate = grounding["market_claims"][-1]
    for index in range(20):
        grounding["market_claims"].append(
            {
                **valid_candidate,
                "claim_id": f"navigation-{index}",
            }
        )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )

    assert quality["status"] == "passed", quality
    assert quality["verified_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    assert quality["conflict_count"] == 0
    assert quality["blocked_claims"] == []
    assert quality["quarantined_count"] == 21
    assert quality["candidate_rejection_counts"] == {
        "material_fact_not_extractable": 21
    }
    assert all(
        fact["identity_complete"]
        for row in quality["evidence_ledger"]
        for fact in row["facts"]
    )
    assert all(fact["normalized_value"] != "0:eur" for fact in quality["verified_facts"])


def test_only_rejected_candidate_still_fails_mandatory_class():
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/cart",
        claims=[("cart", "Ostukorv Royal Canin 400 g 0,00 €.")],
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "blocked"
    assert quality["verified_count"] == 0
    assert quality["missing_claim_classes"] == ["observed_primary_market"]
    assert quality["evidence_ledger"] == []


def test_distinct_catalog_products_and_pack_sizes_are_not_conflicts():
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/catalog",
        claims=[
            (
                "adult-chicken",
                "Adult chicken cat food Brand Alpha 400 g current retail price is €2.99 on 2026-08-12.",
            ),
            (
                "kitten-salmon",
                "Kitten salmon cat food Brand Beta 1 kg current retail price is EUR 7.49 on 2026-08-12.",
            ),
        ],
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    assert quality["verified_count"] == 2
    assert quality["conflicts"] == []


def test_distinct_non_euro_products_are_not_conflicts():
    grounding = _catalog_grounding(
        country_code="BR",
        source_url="https://shop.example.com.br/catalogo",
        claims=[
            (
                "adult-beef",
                "Adult beef cat food Brand Sul 400 g current retail price is BRL 39.90 on 2026-08-12.",
            ),
            (
                "kitten-fish",
                "Kitten fish cat food Brand Mar 1 kg current retail price is BRL 72.50 on 2026-08-12.",
            ),
        ],
    )

    quality = evaluate_critical_claims(
        grounding,
        ["BR"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    assert quality["conflict_count"] == 0


def test_live_catalog_variants_and_price_denominators_are_distinct_targets():
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://rimi.example.ee/cat-food",
        claims=[
            (
                "royal-canin-chicken",
                "Royal Canin Adult Chicken 400 g current retail price is €5.99/pcs on 2026-08-12.",
            ),
            (
                "royal-canin-salmon",
                "Royal Canin Adult Salmon 400 g current retail price is €6.49/pcs on 2026-08-12.",
            ),
            (
                "royal-canin-piece",
                "Royal Canin Adult Beef 85 g current retail price is €1.69/pcs on 2026-08-12.",
            ),
            (
                "royal-canin-kilo",
                "Royal Canin Adult Beef 85 g current retail price is €19.88/kg on 2026-08-12.",
            ),
        ],
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )

    assert quality["status"] == "passed", quality
    assert quality["conflict_count"] == 0


def test_same_catalog_target_detects_true_conflict_and_equal_formats_agree():
    conflict = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/same-sku",
        claims=[
            (
                "sku-a",
                "Brand Alpha Chicken SKU A123 400 g regular retail price is €2.99/pcs on 2026-08-12.",
            ),
            (
                "sku-b",
                "Brand Alpha Chicken SKU A123 400 g regular retail price is EUR 3,49/pcs on 2026-08-12.",
            ),
        ],
    )
    quality = evaluate_critical_claims(
        conflict,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert quality["status"] == "blocked"
    assert quality["conflict_count"] == 1
    assert _normalized_value("€2.99", "eur") == _normalized_value("EUR 2,99", "eur")


def test_scaled_statistical_values_normalize_to_same_magnitude():
    assert _normalized_value("1.37 million", "number") == _normalized_value(
        "1,370 thousand", "number"
    )
    assert _normalized_value(
        "8,116.2 million euros", "eur"
    ) == "8116200000:eur"


def test_unextractable_signed_statutory_claim_is_not_reported_verified():
    grounding = _replace_direct_claim(
        _estonia_vat_grounding(),
        claim_text="Current tax guidance applies from 1 July 2025.",
        evidence_class="statutory_current",
        temporal_fields={
            "effective_at": "2025-07-01T00:00:00+00:00",
            "current": True,
        },
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["statutory_current"],
    )

    assert quality["status"] == "blocked"
    assert quality["verified_count"] == 0
    assert quality["verified_claim_classes"] == []
    assert quality["missing_claim_classes"] == ["statutory_current"]
    assert quality["claims"][0]["status"] == "blocked_unverified"


def test_same_current_standard_statutory_rate_from_two_authorities_conflicts():
    temporal = {"effective_at": "2025-07-01T00:00:00+00:00", "current": True}
    grounding = _merge_grounding(
        _official_grounding(
            source_id="tax-authority-a",
            source_url="https://tax-one.example.ee/current-rate",
            claims=[{
                "claim_id": "standard-a",
                "text": "The current standard VAT rate is 22% effective 1 July 2025.",
                "evidence_class": "statutory_current",
                "predicate": "standard VAT rate",
                "temporal": temporal,
            }],
        ),
        _official_grounding(
            source_id="tax-authority-b",
            source_url="https://tax-two.example.ee/current-rate",
            claims=[{
                "claim_id": "standard-b",
                "text": "The current standard VAT rate is 24 percent effective 1 July 2025.",
                "evidence_class": "statutory_current",
                "predicate": "standard VAT rate",
                "temporal": temporal,
            }],
        ),
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["statutory_current"],
    )

    assert quality["status"] == "blocked"
    assert quality["conflict_count"] == 1


def test_standard_and_reduced_statutory_rates_are_distinct_facts():
    grounding = _official_grounding(
        source_id="tax-rates",
        source_url="https://tax-rates.example.ee/current-rates",
        claims=[
            {
                "claim_id": "standard",
                "text": "The current standard VAT rate is 24% effective 1 July 2025.",
                "evidence_class": "statutory_current",
                "predicate": "standard VAT rate",
                "temporal": {"effective_at": "2025-07-01T00:00:00+00:00", "current": True},
            },
            {
                "claim_id": "reduced",
                "text": "The current reduced VAT rate for books is 13% effective 1 July 2025.",
                "evidence_class": "statutory_current",
                "predicate": "reduced VAT rate",
                "temporal": {"effective_at": "2025-07-01T00:00:00+00:00", "current": True},
            },
        ],
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["statutory_current"],
    )

    assert quality["status"] == "passed", quality
    assert quality["conflict_count"] == 0


def test_official_series_conflicts_only_for_same_series_and_period():
    same_period = "2026-03-31T00:00:00+00:00"
    conflict = _merge_grounding(
        _structured_statistic_grounding(
            source_id="stats-a",
            source_url="https://stats-one.example.ee/q1",
            value="10.8",
            series="Cat food retail turnover",
            dataset_id="CATTURNOVER",
        ),
        _structured_statistic_grounding(
            source_id="stats-b",
            source_url="https://stats-two.example.ee/q1",
            value="11.2",
            series="Cat food retail turnover",
            dataset_id="CATTURNOVER",
        ),
    )
    conflict_quality = evaluate_critical_claims(
        conflict,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert conflict_quality["status"] == "blocked"
    assert conflict_quality["conflict_count"] == 1

    different_period = _merge_grounding(
        _structured_statistic_grounding(
            source_id="stats-q4",
            source_url="https://stats-periods.example.ee/q4",
            value="10.8",
            series="Cat food retail turnover",
            period="4th quarter 2025",
            dataset_id="CATTURNOVER",
        ),
        _structured_statistic_grounding(
            source_id="stats-q1",
            source_url="https://stats-periods.example.ee/q1",
            value="11.2",
            series="Cat food retail turnover",
            dataset_id="CATTURNOVER",
        ),
    )
    period_quality = evaluate_critical_claims(
        different_period,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert period_quality["status"] == "passed", period_quality
    assert period_quality["conflict_count"] == 0

    different_series = _merge_grounding(
        _structured_statistic_grounding(
            source_id="stats-net",
            source_url="https://stats-series.example.ee/net",
            value="8.12",
            series="Cat food net sales",
            dataset_id="CATSALES",
        ),
        _structured_statistic_grounding(
            source_id="stats-retail",
            source_url="https://stats-series.example.ee/retail",
            value="2.33",
            series="Cat food retail sales",
            dataset_id="CATSALES",
        ),
    )
    series_quality = evaluate_critical_claims(
        different_series,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert series_quality["status"] == "passed", series_quality
    assert series_quality["conflict_count"] == 0


def test_commercial_goal_determines_applicability_before_model_output():
    applicability = determine_claim_class_applicability(
        {
            "research_prd_type": "commercial_market_launch",
            "title": "Estonia cat-food launch",
            "description": "Price packages with regulatory VAT compliance",
        },
        [
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )
    assert applicability["applicable_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
        mandatory_claim_classes=applicability["requested_claim_classes"],
        claim_class_applicability=applicability,
    )
    assert quality["status"] == "blocked"
    assert {
        item["reason"] for item in quality["blocked_claims"]
    } >= {
        "mandatory_claim_class_missing:official_statistic",
        "mandatory_claim_class_missing:observed_primary_market",
    }


def test_noncommercial_goal_reports_reasoned_not_applicable_partition():
    applicability = determine_claim_class_applicability(
        {
            "research_prd_type": "operational_process",
            "description": "Document an internal handoff workflow",
        },
        ["statutory_current", "official_statistic", "observed_primary_market"],
    )
    assert applicability["applicable_claim_classes"] == []
    assert {
        item["evidence_class"]
        for item in applicability["not_applicable_claim_classes"]
    } == {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }


def test_provider_redirect_cannot_self_assert_official_authority():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(direct=False),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "current_direct_authoritative_source_missing",
        }
    ]


def test_unattested_spoof_cannot_reuse_official_labels():
    grounding = _estonia_vat_grounding()
    source = grounding["market_sources"][0]
    source["url"] = "https://evil.example/fake"
    source["publisher"] = "evil.example"

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "current_direct_authoritative_source_missing",
        }
    ]


def test_gov_label_inside_attacker_domain_is_not_a_public_root():
    assert is_trusted_public_root("https://tax.gov.evil.example/vat") is False


def test_internally_consistent_forged_authority_proof_fails_signature():
    grounding = _estonia_vat_grounding()
    source = grounding["market_sources"][0]
    source["authority_proof"]["direct"]["final_host"] = "evil.example"
    source["authority_proof"]["direct"]["final_url"] = "https://evil.example/fake"
    source["url"] = "https://evil.example/fake"

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"][0]["reason"] == (
        "current_direct_authoritative_source_missing"
    )


def test_old_official_statistic_fetched_today_is_not_current():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    claim.update(
        {
            "evidence_class": "official_statistic",
            "object": "Estonia's market population was 1.33 million in 2021.",
            "observation_end": "2021-12-31T00:00:00+00:00",
            "current": None,
        }
    )
    source = grounding["market_sources"][0]
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        + claim["object"]
    )
    proof = build_attested_authority_proof(
        direct_url=source["url"],
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text="Official authority directory: https://www.emta.ee",
        country_codes=["EE"],
        retrieved_at=source["retrieved_at"],
    )
    source["authority_proof"] = proof
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": source["source_id"],
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": source["retrieved_at"],
        "authority_proof_signature": proof["proof_signature"],
    }
    artifact = build_authority_claim_artifact(
        source_id=source["source_id"],
        source_url=source["url"],
        authority_proof=proof,
        authority_document=authority_document,
        claim_text=claim["object"],
    )
    binding = artifact["claim_binding"]
    claim["citation_metadata"] = {
        "segment_start": binding["claim_start"],
        "segment_end": binding["claim_end"],
        "span_target": "direct_authority_document",
        "offset_unit": "unicode_codepoints",
        "source_id": source["source_id"],
    }
    claim["provenance_artifact"] = artifact

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
        freshness_days=365,
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "fact_effective_or_observation_date_stale",
        }
    ]


def test_latest_annual_official_statistic_uses_class_specific_freshness():
    grounding = _structured_statistic_grounding(
        source_id="statistics-annual",
        source_url="https://statistics.example.ee/cat-food-annual",
        value="1.37",
        series="Cat food household expenditure",
        period="2025",
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_days=120,
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )

    assert quality["status"] == "passed", quality["blocked_claims"]
    assert quality["requested_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    assert quality["applicable_claim_classes"] == ["official_statistic"]
    assert quality["mandatory_claim_classes"] == ["official_statistic"]
    assert {row["evidence_class"] for row in quality["not_applicable_claim_classes"]} == {
        "statutory_current",
        "observed_primary_market",
    }


@pytest.mark.parametrize(
    "mutation",
    [
        lambda claim: claim["citation_metadata"].update(
            segment_start=9999, segment_end=10000
        ),
        lambda claim: claim["provenance_artifact"].update(sha256="not-a-hash"),
        lambda claim: claim["provenance_artifact"].update(
            authority_proof_signature="0" * 64
        ),
    ],
)
def test_critical_claim_rejects_unverifiable_span_artifacts(mutation):
    grounding = _estonia_vat_grounding()
    mutation(grounding["market_claims"][0])

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {"claim_id": "vat-current", "reason": "exact_claim_span_provenance_missing"}
    ]


def test_multipart_utf8_byte_span_is_bound_to_exact_provider_response():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    part_zero = "Sissejuhatus: hinnad eurodes. "
    part_one = "Hinnale lisandub käibemaks 24%."
    response_text = part_zero + part_one
    response_parts = [part_zero, part_one]
    part_hashes = [
        hashlib.sha256(value.encode("utf-8")).hexdigest()
        for value in response_parts
    ]
    claim.update(
        {
            "object": part_one,
            "provider_response_hash": hashlib.sha256(
                response_text.encode("utf-8")
            ).hexdigest(),
            "citation_metadata": {
                "segment_start": 0,
                "segment_end": len(part_one.encode("utf-8")),
                "span_target": "provider_response_part",
                "part_index": 1,
                "offset_unit": "utf8_bytes",
            },
            "provenance_artifact": {
                "artifact_type": "provider_response_part",
                "part_index": 1,
                "text": part_one,
                "sha256": part_hashes[1],
                "response_part_hashes": part_hashes,
                "response_parts_sha256": hashlib.sha256(
                    "\n".join(part_hashes).encode("ascii")
                ).hexdigest(),
                "response_parts": response_parts,
                "provider_response_text": response_text,
                "provider_response_sha256": hashlib.sha256(
                    response_text.encode("utf-8")
                ).hexdigest(),
            },
        }
    )

    assert _has_exact_span_provenance(claim, part_one)


def test_multipart_span_rejects_tampered_part_manifest_and_byte_boundary():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    text = "Hinnale lisandub käibemaks 24%."
    response_parts = ["Eesti hinnainfo. ", text]
    response_text = "".join(response_parts)
    hashes = [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in response_parts]
    claim.update(
        {
            "object": text,
            "provider_response_hash": hashlib.sha256(response_text.encode("utf-8")).hexdigest(),
            "citation_metadata": {
                "segment_start": 1,  # starts inside the first multibyte H
                "segment_end": len(text.encode("utf-8")),
                "span_target": "provider_response_part",
                "part_index": 1,
                "offset_unit": "utf8_bytes",
            },
            "provenance_artifact": {
                "artifact_type": "provider_response_part",
                "part_index": 1,
                "text": text,
                "sha256": hashes[1],
                "response_part_hashes": hashes,
                "response_parts_sha256": hashlib.sha256("\n".join(hashes).encode("ascii")).hexdigest(),
                "response_parts": response_parts,
                "provider_response_text": response_text,
                "provider_response_sha256": hashlib.sha256(response_text.encode("utf-8")).hexdigest(),
            },
        }
    )

    assert not _has_exact_span_provenance(claim, text)


def test_generic_conflict_validator_rejects_stale_document_value():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    validation = validate_research_prd(
        _commercial_prd("The standard VAT rate in Estonia is 22%."),
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert {"critical_fact_conflict", "material_fact_unlinked"} & {
        row["code"] for row in validation["issues"]
    }


def test_semantic_cleaner_removes_presentation_markup_and_null_members():
    assert clean_semantic_text(
        {"role": "**Finance\\_Pricing**", "items": ["* Evidence", None], "missing": None}
    ) == {"role": "Finance_Pricing", "items": ["Evidence"]}


def test_commercial_prd_rejects_empty_required_sections():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd("Regulation validated against claim vat-current")
    content["commercial_prd"] = {
        key: ([] if isinstance(value, list) else {})
        for key, value in content["commercial_prd"].items()
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert "commercial_section_empty" in {
        row["code"] for row in validation["issues"]
    }


def test_commercial_prd_rejects_boolean_section_placeholders():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd("Regulation validated against claim vat-current")
    content["commercial_prd"] = {
        key: False for key in content["commercial_prd"]
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert sum(
        row["code"] == "commercial_section_empty"
        for row in validation["issues"]
    ) == 10


def test_commercial_prd_requires_per_fact_traceability():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd(
        {
            "statement": "The standard VAT rate is 24%.",
            "claim_ids": ["vat-current"],
        }
    )
    content["commercial_prd"]["pricing_and_unit_economics"] = {
        "statement": "Target retail price is €29.90.",
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert "material_fact_unlinked" in {row["code"] for row in validation["issues"]}


def test_commercial_prd_accepts_labeled_hypothesis_with_validation_plan():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd(
        {
            "statement": "The standard VAT rate is 24%.",
            "claim_ids": ["vat-current"],
        }
    )
    content["commercial_prd"]["pricing_and_unit_economics"] = {
        "statement": "Hypothesized retail price is €29.90.",
        "evidence_class": "synthetic_hypothesis",
        "validation_plan": "Test with 12 Estonian category buyers before launch.",
        "formula": "net_price = gross_price / (1 + vat_rate)",
        "input_claim_ids": ["vat-current"],
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "passed", validation["issues"]
