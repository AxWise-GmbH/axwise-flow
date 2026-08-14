"""Authority and tamper tests for the dormant physical-offer projector."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

import pytest

from backend.domain.orchestration.models import BusinessEvidenceProfileV1
from backend.services.business_evidence_projection_service import (
    PROJECTION_ALLOWLIST_ENV,
    _matching_signed_offer,
    _offer_identity_hash,
    configured_business_evidence_projection_models,
    effective_business_evidence_claim_policy,
    physical_product_comparison_scope_hash,
    project_business_evidence_facts,
    require_enabled_business_evidence_projection,
)
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.orqaly_research_bundle_service import request_with_grounding
from backend.tests.test_orqaly_research_bundle_business_evidence import _request
from backend.tests.test_research_quality_service import _catalog_grounding


pytestmark = pytest.mark.contract

AUTHORITY_SECRET = "projection-test-authority-secret-32-bytes"
MARKET_SCOPE_HASH = "a" * 64


def _profile() -> BusinessEvidenceProfileV1:
    return BusinessEvidenceProfileV1.model_validate(
        {
            "intent": "commercial_market_launch",
            "economic_model": "physical_product",
            "market_scope_hash": MARKET_SCOPE_HASH,
            "fact_requirements": [
                {
                    "kind": "physical_product_offer",
                    "minimum_verified": 1,
                    "applicability": "required",
                }
            ],
        }
    )


def _rollout_profile() -> BusinessEvidenceProfileV1:
    value = _profile().model_dump(mode="json")
    value["fact_requirements"] = [
        {
            "kind": "physical_product_offer",
            "minimum_verified": 2,
            "applicability": "required",
        }
    ]
    value["calculation_requirements"] = [
        {
            "kind": "physical_offer_price_difference",
            "minimum_verified": 1,
            "applicability": "required",
        }
    ]
    return BusinessEvidenceProfileV1.model_validate(value)


def _live_grounding(
    monkeypatch: pytest.MonkeyPatch,
    *,
    claim_text: str = (
        "Alpha cat food 400 g current retail price is 15,99 € on 2026-08-12."
    ),
) -> dict:
    monkeypatch.setenv("AXWISE_AUTHORITY_PROOF_SECRET", AUTHORITY_SECRET)
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/alpha",
        claims=[
            (
                "claim-alpha",
                claim_text,
            )
        ],
    )
    source = grounding["market_sources"][0]
    private_document = source["_authority_document_artifact"]
    source["authority_document"] = {
        key: value
        for key, value in private_document.items()
        if key != "text"
    }
    grounding["critical_claim_quality"] = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert grounding["critical_claim_quality"]["status"] == "passed"
    return grounding


def _scrub_private_source_artifacts(grounding: dict) -> dict:
    scrubbed = deepcopy(grounding)
    for source in scrubbed["market_sources"]:
        source.pop("_authority_document_artifact", None)
        source.pop("_structured_evidence_html", None)
    return scrubbed


def _project(grounding: dict) -> list[dict]:
    return project_business_evidence_facts(
        grounding,
        _profile(),
        enabled_models={"physical_product"},
    )


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        ("", frozenset()),
        ("physical_product", frozenset({"physical_product"})),
    ],
)
def test_projection_allowlist_accepts_only_closed_values(configured, expected):
    assert configured_business_evidence_projection_models(configured) == expected


@pytest.mark.parametrize(
    "configured",
    [
        "subscription",
        "physical_product,physical_product",
        " physical_product",
        "physical_product ",
        "physical_product,",
        ",physical_product",
        "physical-product",
    ],
)
def test_projection_allowlist_rejects_unknown_duplicate_or_malformed_values(
    configured,
):
    with pytest.raises(ValueError):
        configured_business_evidence_projection_models(configured)


def test_physical_rollout_derives_required_observed_market_policy(monkeypatch):
    monkeypatch.setenv(PROJECTION_ALLOWLIST_ENV, "physical_product")

    policy = effective_business_evidence_claim_policy(
        _rollout_profile(),
        {
            "required": False,
            "fail_closed": False,
            "mandatory_claim_classes": ["statutory_current"],
            "freshness_by_class": {
                "official_statistic": 730,
                "observed_primary_market": 365,
            },
        },
    )

    assert policy["required"] is True
    assert policy["fail_closed"] is True
    assert policy["mandatory_claim_classes"] == [
        "statutory_current",
        "observed_primary_market",
    ]
    assert policy["freshness_by_class"]["observed_primary_market"] == 120


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        (
            "fact_requirements",
            [
                {
                    "kind": "physical_product_offer",
                    "minimum_verified": 2,
                    "applicability": "optional",
                }
            ],
            "at least one required verified offer",
        ),
        (
            "calculation_requirements",
            [
                {
                    "kind": "physical_offer_price_difference",
                    "minimum_verified": 1,
                    "applicability": "required_when_applicable",
                }
            ],
            "requires a required price-difference calculation",
        ),
    ],
)
def test_physical_rollout_rejects_unsupported_requirement_shapes(
    monkeypatch, field, value, message
):
    monkeypatch.setenv(PROJECTION_ALLOWLIST_ENV, "physical_product")
    profile_value = _rollout_profile().model_dump(mode="json")
    profile_value[field] = value
    profile = BusinessEvidenceProfileV1.model_validate(profile_value)

    with pytest.raises(ValueError, match=message):
        require_enabled_business_evidence_projection(profile)


def test_physical_rollout_accepts_one_required_fact_without_calculation(monkeypatch):
    monkeypatch.setenv(PROJECTION_ALLOWLIST_ENV, "physical_product")
    profile_value = _rollout_profile().model_dump(mode="json")
    profile_value["fact_requirements"][0]["minimum_verified"] = 1
    profile_value["calculation_requirements"] = []
    profile = BusinessEvidenceProfileV1.model_validate(profile_value)

    require_enabled_business_evidence_projection(profile)


def test_projection_is_dormant_by_default(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    monkeypatch.delenv(PROJECTION_ALLOWLIST_ENV, raising=False)

    assert project_business_evidence_facts(grounding, _profile()) == []


def test_live_signed_offer_projects_identically_before_and_after_raw_scrub(
    monkeypatch,
):
    grounding = _live_grounding(monkeypatch)

    raw_projection = _project(grounding)
    scrubbed_projection = _project(_scrub_private_source_artifacts(grounding))

    assert scrubbed_projection == raw_projection
    assert len(raw_projection) == 1
    fact = raw_projection[0]
    assert fact["claim_id"] == "claim-alpha"
    assert fact["source_ids"] == ["catalog-ee"]
    assert fact["country_codes"] == ["EE"]
    assert fact["verification_status"] == "verified_current_authoritative"
    assert fact["payload"] == {
        "merchant": "shop.example.ee",
        "merchant_domain": "shop.example.ee",
        "offer_id": fact["payload"]["offer_id"],
        "product_name": "Alpha cat food 400 g",
        "brand": None,
        "sku": "fixture-claim-alpha",
        "pack": {"quantity": "400", "unit": "gram"},
        "price": {
            "amount": "15.99",
            "currency": "EUR",
            "tax_basis": "unknown",
        },
        "basis": {"quantity": "1", "unit": "package"},
    }
    assert len(fact["payload"]["offer_id"]) == 64
    assert fact["comparison_scope_hash"] == physical_product_comparison_scope_hash(
        _profile(),
        topic_seed_sha256=fact["topic_seed_sha256"],
        country_codes=["EE"],
        currency="EUR",
    )


def test_projector_never_depends_on_market_claim_prose(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    expected = _project(grounding)
    grounding["market_claims"][0]["object"] = (
        "Untrusted prose with a different product and a different price."
    )

    assert _project(grounding) == expected


def test_internal_fact_authorization_is_not_projected_to_llm_context(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    fact = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0]
    assert "_physical_product_projection_authorization" in fact

    request = request_with_grounding(_request(), grounding)
    public_quality = request.business_context.grounding_context[
        "critical_claim_quality"
    ]
    assert "_physical_product_projection_authorization" not in str(public_quality)


def test_semantically_equal_rfc3339_instants_preserve_ledger_ownership(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    fact = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0]
    fact["temporal_scope"] = "2026-08-12T12:00:00Z"

    assert len(_project(grounding)) == 1


def test_matching_hand_authored_field_is_ignored_in_favor_of_projection(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    derived = _project(grounding)[0]
    fact = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0]
    fact["business_evidence"] = {
        "kind": derived["kind"],
        "comparison_scope_hash": derived["comparison_scope_hash"],
        "payload": deepcopy(derived["payload"]),
    }

    assert _project(grounding) == [derived]


def test_hand_authored_field_cannot_override_authority_projection(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    derived = _project(grounding)[0]
    fact = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0]
    supplied = {
        "kind": derived["kind"],
        "comparison_scope_hash": derived["comparison_scope_hash"],
        "payload": deepcopy(derived["payload"]),
    }
    supplied["payload"]["price"]["amount"] = "1"
    fact["business_evidence"] = supplied

    with pytest.raises(ValueError, match="conflicts with authority projection"):
        _project(grounding)


def _mutate_row_status(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["status"] = "stale"


def _mutate_row_class(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0][
        "evidence_class"
    ] = "official_statistic"


def _mutate_claim_owner(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "claim_id"
    ] = "claim-other"


def _mutate_source_owner(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "source_scope"
    ] = ["catalog-other"]


def _mutate_country_owner(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "country_codes"
    ] = ["DE"]


def _mutate_time_owner(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "temporal_scope"
    ] = "2026-08-11T12:00:00Z"


def _mutate_topic_owner(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "topic_seed_sha256"
    ] = "f" * 64


def _mutate_signed_name(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "signed_offer_product_name"
    ] = "Different product 400 g"


def _mutate_price(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "normalized_value"
    ] = "1:eur"


def _mutate_basis(grounding: dict) -> None:
    fact = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0]
    fact["semantic_scope"] = fact["semantic_scope"].replace("per_item", "per_kg")


def _mutate_pack(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"][0][
        "fact_terms"
    ].append("2kg")


def _mutate_source_authority(grounding: dict) -> None:
    grounding["market_sources"][0]["source_authority"] = "official_public"


def _mutate_source_url(grounding: dict) -> None:
    grounding["market_sources"][0]["url"] = "https://other.example.ee/alpha"


def _mutate_summary_signature(grounding: dict) -> None:
    grounding["critical_claim_quality"]["evidence_ledger"][0]["sources"][0][
        "authority_proof_signature"
    ] = "0" * 64


def _mutate_proof_offer(grounding: dict) -> None:
    grounding["market_sources"][0]["authority_proof"][
        "commercial_offer_evidence"
    ][0]["price"] = "1"


def _mutate_private_raw(grounding: dict) -> None:
    grounding["market_sources"][0]["_structured_evidence_html"] = grounding[
        "market_sources"
    ][0]["_structured_evidence_html"].replace("15.99", "1", 1)


@pytest.mark.parametrize(
    "mutator",
    [
        _mutate_row_status,
        _mutate_row_class,
        _mutate_claim_owner,
        _mutate_source_owner,
        _mutate_country_owner,
        _mutate_time_owner,
        _mutate_topic_owner,
        _mutate_signed_name,
        _mutate_price,
        _mutate_basis,
        _mutate_pack,
        _mutate_source_authority,
        _mutate_source_url,
        _mutate_summary_signature,
        _mutate_proof_offer,
        _mutate_private_raw,
    ],
)
def test_projection_fails_closed_for_ownership_proof_and_raw_tampering(
    monkeypatch, mutator
):
    grounding = _live_grounding(monkeypatch)
    mutator(grounding)

    with pytest.raises(ValueError):
        _project(grounding)


def test_scrubbed_proof_still_rejects_hmac_tampering(monkeypatch):
    grounding = _scrub_private_source_artifacts(_live_grounding(monkeypatch))
    grounding["market_sources"][0]["authority_proof"]["retrieved_at"] = (
        "2026-08-12T12:00:01+00:00"
    )

    with pytest.raises(ValueError):
        _project(grounding)


@pytest.mark.parametrize(
    "removed_private_key",
    ["_authority_document_artifact", "_structured_evidence_html"],
)
def test_private_raw_binding_requires_both_artifacts(monkeypatch, removed_private_key):
    grounding = _live_grounding(monkeypatch)
    grounding["market_sources"][0].pop(removed_private_key)

    with pytest.raises(ValueError, match="incomplete private raw binding"):
        _project(grounding)


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("artifact_type", "other"),
        ("source_id", "catalog-other"),
        ("authority_proof_signature", "0" * 64),
        ("sha256", "0" * 64),
        ("retrieved_at", "2026-08-11T12:00:00+00:00"),
    ],
)
def test_scrubbed_source_requires_exact_published_document_metadata(
    monkeypatch, field, replacement
):
    grounding = _scrub_private_source_artifacts(_live_grounding(monkeypatch))
    grounding["market_sources"][0]["authority_document"][field] = replacement

    with pytest.raises(ValueError, match="authority document metadata"):
        _project(grounding)


def test_scrubbed_source_rejects_missing_published_document_metadata(monkeypatch):
    grounding = _scrub_private_source_artifacts(_live_grounding(monkeypatch))
    grounding["market_sources"][0].pop("authority_document")

    with pytest.raises(ValueError, match="published authority document"):
        _project(grounding)


def test_copied_proof_cannot_be_reowned_under_new_claim_and_fact_ids(monkeypatch):
    grounding = _live_grounding(monkeypatch)
    row = grounding["critical_claim_quality"]["evidence_ledger"][0]
    fact = row["facts"][0]
    claim = grounding["market_claims"][0]
    row["claim_id"] = "claim-copied"
    fact["claim_id"] = "claim-copied"
    fact["fact_id"] = "claim-copied:fact:1"
    claim["claim_id"] = "claim-copied"

    with pytest.raises(ValueError, match="authorization ownership"):
        _project(grounding)


def test_projection_rejects_missing_or_duplicate_market_claim_ownership(monkeypatch):
    missing = _live_grounding(monkeypatch)
    missing["market_claims"] = []
    with pytest.raises(ValueError, match="absent from market_claims"):
        _project(missing)

    duplicate = _live_grounding(monkeypatch)
    duplicate["market_claims"].append(deepcopy(duplicate["market_claims"][0]))
    with pytest.raises(ValueError, match="market claim ownership must be unique"):
        _project(duplicate)


def test_projection_rejects_tampered_claim_span_and_fact_authorization(monkeypatch):
    bad_span = _live_grounding(monkeypatch)
    bad_span["market_claims"][0]["citation_metadata"]["segment_end"] -= 1
    with pytest.raises(ValueError, match="provenance"):
        _project(bad_span)

    bad_authorization = _live_grounding(monkeypatch)
    authorization = bad_authorization["critical_claim_quality"][
        "evidence_ledger"
    ][0]["facts"][0]["_physical_product_projection_authorization"]
    authorization["fact_id"] = "fact-other"
    with pytest.raises(ValueError, match="authorization"):
        _project(bad_authorization)


def test_projection_rejects_zero_priced_offer(monkeypatch):
    monkeypatch.setenv("AXWISE_AUTHORITY_PROOF_SECRET", AUTHORITY_SECRET)
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/zero",
        claims=[
            (
                "claim-zero",
                "Alpha cat food 400 g current retail price is 0,00 € on 2026-08-12.",
            )
        ],
    )
    offer = grounding["market_sources"][0]["authority_proof"][
        "commercial_offer_evidence"
    ][0]
    fact = {
        "unit": "eur",
        "normalized_value": "0:eur",
        "metric_key": "price:eur",
        "semantic_scope": (
            f"catalog:signed_offer:{_offer_identity_hash(offer)}:per_item:eur"
        ),
        "signed_offer_product_name": "Alpha cat food 400 g",
    }

    with pytest.raises(ValueError, match="price must be positive"):
        _matching_signed_offer(fact, [offer])
