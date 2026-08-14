"""Golden and adversarial tests for the pure business-evidence v2 contract."""

from __future__ import annotations

from copy import deepcopy

import pytest

from backend.services.business_evidence_contract_service import (
    build_business_evidence_contract_v1,
    calculation_manifest,
    canonical_contract_hash,
    fact_manifest,
    seal_evidence_calculation_v1,
    seal_evidence_fact_v1,
    validate_business_evidence_contract_v1,
)


pytestmark = pytest.mark.contract

MARKET_HASH = "a" * 64
TOPIC_HASH = "b" * 64
COMPARISON_HASH = "c" * 64

ARCHETYPES = {
    "physical_product": {
        "fact_kind": "physical_product_offer",
        "calculation_kind": "physical_offer_price_difference",
        "basis": {"quantity": "1", "unit": "package"},
        "payload": {
            "merchant": "Merchant One",
            "merchant_domain": "merchant.example",
            "offer_id": "offer-1",
            "product_name": "Complete Cat Food 2 kg",
            "brand": "Example Brand",
            "sku": "SKU-1",
            "pack": {"quantity": "2", "unit": "kilogram"},
        },
    },
    "subscription": {
        "fact_kind": "subscription_plan",
        "calculation_kind": "subscription_rate_difference",
        "basis": {"quantity": "1", "unit": "seat_month"},
        "payload": {
            "provider": "SaaS One",
            "provider_domain": "saas.example",
            "plan_id": "pro",
            "plan_name": "Professional",
            "included_seats": 1,
            "minimum_seats": 1,
        },
    },
    "usage_based": {
        "fact_kind": "usage_tariff",
        "calculation_kind": "usage_tariff_rate_difference",
        "basis": {"quantity": "1", "unit": "cycle"},
        "payload": {
            "provider": "Laundry One",
            "provider_domain": "laundry.example",
            "tariff_id": "washer-large",
            "tariff_name": "Large washer",
            "service_name": "Self-service wash cycle",
            "fixed_fee": None,
        },
    },
    "project_service": {
        "fact_kind": "project_service_quote",
        "calculation_kind": "project_quote_rate_difference",
        "basis": {"quantity": "1", "unit": "square_meter"},
        "payload": {
            "provider": "Roofing One",
            "provider_domain": "roofing.example",
            "quote_id": "quote-1",
            "service_name": "Roof replacement",
            "scope_hash": "d" * 64,
            "labour_included": True,
            "materials_included": True,
            "valid_until": "2026-09-30T00:00:00+00:00",
        },
    },
}


def _profile(model: str) -> dict:
    archetype = ARCHETYPES[model]
    return {
        "version": "business_evidence_profile_v1",
        "intent": "commercial_market_launch",
        "economic_model": model,
        "market_scope_hash": MARKET_HASH,
        "fact_requirements": [
            {
                "kind": archetype["fact_kind"],
                "minimum_verified": 2,
                "applicability": "required",
            }
        ],
        "calculation_requirements": [
            {
                "kind": archetype["calculation_kind"],
                "minimum_verified": 1,
                "applicability": "required",
            }
        ],
        "required_role_slots": ["pricing_finance", "domain_delivery"],
    }


def _fact(model: str, ordinal: int, amount: str) -> dict:
    archetype = ARCHETYPES[model]
    payload = deepcopy(archetype["payload"])
    if model == "physical_product":
        payload["merchant"] = f"Merchant {ordinal}"
        payload["merchant_domain"] = f"merchant{ordinal}.example"
        payload["offer_id"] = f"offer-{ordinal}"
        payload["sku"] = f"SKU-{ordinal}"
    elif model == "subscription":
        payload["provider"] = f"SaaS {ordinal}"
        payload["provider_domain"] = f"saas{ordinal}.example"
        payload["plan_id"] = f"pro-{ordinal}"
    elif model == "usage_based":
        payload["provider"] = f"Laundry {ordinal}"
        payload["provider_domain"] = f"laundry{ordinal}.example"
        payload["tariff_id"] = f"washer-{ordinal}"
    else:
        payload["provider"] = f"Roofing {ordinal}"
        payload["provider_domain"] = f"roofing{ordinal}.example"
        payload["quote_id"] = f"quote-{ordinal}"
    payload["price"] = {
        "amount": amount,
        "currency": "EUR",
        "tax_basis": "gross",
    }
    payload["basis"] = deepcopy(archetype["basis"])
    return {
        "schema_version": "evidence_fact_v1",
        "kind": archetype["fact_kind"],
        "fact_id": f"fact-{model}-{ordinal}",
        "claim_id": f"claim-{model}-{ordinal}",
        "source_ids": [f"source-{model}-{ordinal}"],
        "country_codes": ["EE"],
        "observed_at": "2026-08-14T09:00:00+00:00",
        "market_scope_hash": MARKET_HASH,
        "topic_seed_sha256": TOPIC_HASH,
        "comparison_scope_hash": COMPARISON_HASH,
        "verification_status": "verified_current_authoritative",
        "payload": payload,
    }


@pytest.mark.parametrize("model", list(ARCHETYPES))
def test_four_archetypes_build_and_validate_golden_v2_contract(model: str):
    contract = build_business_evidence_contract_v1(
        _profile(model),
        [_fact(model, 2, "20.00"), _fact(model, 1, "10.0")],
    )

    assert validate_business_evidence_contract_v1(contract) == contract
    assert contract["version"] == "axwise_research_bundle_v2"
    assert [row["kind"] for row in contract["facts"]] == [
        ARCHETYPES[model]["fact_kind"],
        ARCHETYPES[model]["fact_kind"],
    ]
    assert contract["calculations"][0]["kind"] == (
        ARCHETYPES[model]["calculation_kind"]
    )
    assert "claim_id" not in contract["calculations"][0]
    assert contract["calculations"][0]["result"] == {
        "amount": "10",
        "currency": "EUR",
        "tax_basis": "gross",
    }
    quality = contract["quality"]["evidence_contract"]
    assert quality["version"] == "evidence_contract_quality_v1"
    assert quality["status"] == "passed"
    assert quality["profile_hash"] == contract["evidence_profile_hash"]
    assert quality["fact_requirements"] == [
        {
            "kind": ARCHETYPES[model]["fact_kind"],
            "status": "satisfied",
            "satisfied_count": 2,
            "fact_ids": [f"fact-{model}-1", f"fact-{model}-2"],
            "reason_code": None,
            "validation_plan": None,
        }
    ]
    assert quality["calculation_requirements"] == [
        {
            "kind": ARCHETYPES[model]["calculation_kind"],
            "status": "satisfied",
            "satisfied_count": 1,
            "calculation_ids": [contract["calculations"][0]["calculation_id"]],
            "reason_code": None,
            "validation_plan": None,
        }
    ]


def test_manifests_use_frozen_field_names_and_sort_by_identifier():
    facts = [
        seal_evidence_fact_v1(_fact("physical_product", 2, "20")),
        seal_evidence_fact_v1(_fact("physical_product", 1, "10")),
    ]
    contract = build_business_evidence_contract_v1(
        _profile("physical_product"), facts
    )

    assert fact_manifest(facts) == [
        {"fact_id": fact.fact_id, "fact_hash": fact.fact_hash}
        for fact in reversed(facts)
    ]
    calculation = contract["calculations"][0]
    assert calculation_manifest([calculation]) == [
        {
            "calculation_id": calculation["calculation_id"],
            "calculation_hash": calculation["calculation_hash"],
        }
    ]


def test_fact_array_order_is_preserved_but_manifest_hash_is_order_independent():
    profile = _profile("subscription")
    first = build_business_evidence_contract_v1(
        profile, [_fact("subscription", 2, "20"), _fact("subscription", 1, "10")]
    )
    second = build_business_evidence_contract_v1(
        profile, [_fact("subscription", 1, "10"), _fact("subscription", 2, "20")]
    )

    assert [row["fact_id"] for row in first["facts"]] == [
        "fact-subscription-2",
        "fact-subscription-1",
    ]
    assert [row["fact_id"] for row in second["facts"]] == [
        "fact-subscription-1",
        "fact-subscription-2",
    ]
    assert first["fact_manifest_hash"] == second["fact_manifest_hash"]
    assert first["calculation_manifest_hash"] == second["calculation_manifest_hash"]


def test_profile_hash_preserves_requirement_array_order():
    profile = _profile("physical_product")
    profile["required_role_slots"] = ["pricing_finance", "domain_delivery"]
    reversed_profile = deepcopy(profile)
    reversed_profile["required_role_slots"].reverse()

    assert canonical_contract_hash(profile) != canonical_contract_hash(
        reversed_profile
    )


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("scope", "market_scope_hash"),
        ("kind", "incompatible"),
        ("duplicate", "globally unique"),
        ("currency", "requirements are not satisfied"),
        ("basis", "requirements are not satisfied"),
        ("payload_extra", "Extra inputs"),
    ],
)
def test_builder_rejects_incompatible_or_untrusted_fact_shapes(
    mutation: str, message: str
):
    facts = [
        _fact("physical_product", 1, "10"),
        _fact("physical_product", 2, "20"),
    ]
    if mutation == "scope":
        facts[0]["market_scope_hash"] = "f" * 64
    elif mutation == "kind":
        facts[0] = _fact("subscription", 1, "10")
    elif mutation == "duplicate":
        facts[1]["fact_id"] = facts[0]["fact_id"]
    elif mutation == "currency":
        facts[1]["payload"]["price"]["currency"] = "USD"
    elif mutation == "basis":
        facts[1]["payload"]["basis"] = {"quantity": "1", "unit": "item"}
    else:
        facts[0]["payload"]["untrusted"] = True

    with pytest.raises(ValueError, match=message):
        build_business_evidence_contract_v1(_profile("physical_product"), facts)


def test_validator_rejects_resealed_wrong_calculation_result():
    contract = build_business_evidence_contract_v1(
        _profile("usage_based"),
        [_fact("usage_based", 1, "10"), _fact("usage_based", 2, "20")],
    )
    calculation = deepcopy(contract["calculations"][0])
    calculation.pop("calculation_hash")
    calculation["result"]["amount"] = "11"
    contract["calculations"][0] = seal_evidence_calculation_v1(
        calculation
    ).model_dump(mode="json")
    contract["calculation_manifest_hash"] = canonical_contract_hash(
        [
            {
                "calculation_id": contract["calculations"][0]["calculation_id"],
                "calculation_hash": contract["calculations"][0][
                    "calculation_hash"
                ],
            }
        ]
    )
    contract["quality"]["evidence_contract"]["calculation_manifest_hash"] = (
        contract["calculation_manifest_hash"]
    )

    with pytest.raises(ValueError, match="does not recompute"):
        validate_business_evidence_contract_v1(contract)


def test_sealed_fact_hash_detects_content_tampering():
    sealed = seal_evidence_fact_v1(_fact("project_service", 1, "100"))
    tampered = sealed.model_dump(mode="json")
    tampered["payload"]["price"]["amount"] = "101"

    with pytest.raises(ValueError, match="fact_hash does not match"):
        seal_evidence_fact_v1(tampered)


@pytest.mark.parametrize("field", ["amount", "quantity"])
def test_decimal_contract_rejects_values_longer_than_128_characters(field: str):
    fact = _fact("physical_product", 1, "10")
    if field == "amount":
        fact["payload"]["price"]["amount"] = "1" + ("0" * 128)
    else:
        fact["payload"]["basis"]["quantity"] = "1" + ("0" * 128)

    with pytest.raises(ValueError, match="at most 128 characters"):
        seal_evidence_fact_v1(fact)


def test_fact_requires_a_market_scope_hash_even_when_profile_scope_is_nullable():
    fact = _fact("subscription", 1, "10")
    fact.pop("market_scope_hash")

    with pytest.raises(ValueError, match="market_scope_hash"):
        seal_evidence_fact_v1(fact)


def test_model_none_allows_null_scope_and_an_empty_contract():
    contract = build_business_evidence_contract_v1(
        {
            "version": "business_evidence_profile_v1",
            "intent": "operational_process",
            "economic_model": "none",
            "market_scope_hash": None,
            "fact_requirements": [],
            "calculation_requirements": [],
            "required_role_slots": [],
        },
        [],
    )

    assert contract["facts"] == []
    assert contract["calculations"] == []
    assert contract["quality"]["evidence_contract"]["status"] == "passed"
    assert validate_business_evidence_contract_v1(contract) == contract


def test_required_when_applicable_requires_an_explicit_reviewed_na_decision():
    profile = _profile("physical_product")
    profile["fact_requirements"][0].update(
        {"minimum_verified": 0, "applicability": "required_when_applicable"}
    )
    profile["calculation_requirements"] = []

    with pytest.raises(ValueError, match="requirements are not satisfied"):
        build_business_evidence_contract_v1(profile, [])

    contract = build_business_evidence_contract_v1(
        profile,
        [],
        not_applicable_reasons={
            "physical_product_offer": "pricing_decision_not_in_scope"
        },
    )
    assert contract["quality"]["evidence_contract"]["fact_requirements"] == [
        {
            "kind": "physical_product_offer",
            "status": "not_applicable",
            "satisfied_count": 0,
            "fact_ids": [],
            "reason_code": "pricing_decision_not_in_scope",
            "validation_plan": None,
        }
    ]
    assert validate_business_evidence_contract_v1(contract) == contract


@pytest.mark.parametrize(
    ("requirements_field", "kind"),
    [
        ("fact_requirements", "physical_product_offer"),
        ("calculation_requirements", "physical_offer_price_difference"),
    ],
)
def test_missing_optional_requirement_is_informational_and_does_not_block(
    requirements_field: str, kind: str
):
    profile = _profile("physical_product")
    profile["fact_requirements"] = []
    profile["calculation_requirements"] = []
    profile[requirements_field] = [
        {
            "kind": kind,
            "minimum_verified": 1,
            "applicability": "optional",
        }
    ]

    contract = build_business_evidence_contract_v1(profile, [])
    quality = contract["quality"]["evidence_contract"]
    row = quality[requirements_field][0]

    assert quality["status"] == "passed"
    assert row["status"] == "insufficient_evidence"
    assert row["satisfied_count"] == 0
    assert row["reason_code"] is None
    assert row["validation_plan"]
    assert validate_business_evidence_contract_v1(contract) == contract


def test_validator_rejects_resealed_non_deterministic_calculation_id():
    contract = build_business_evidence_contract_v1(
        _profile("subscription"),
        [_fact("subscription", 1, "10"), _fact("subscription", 2, "20")],
    )
    calculation = deepcopy(contract["calculations"][0])
    calculation.pop("calculation_hash")
    calculation["calculation_id"] = "tampered-calculation-id"
    resealed = seal_evidence_calculation_v1(calculation).model_dump(mode="json")
    contract["calculations"][0] = resealed
    contract["calculation_manifest_hash"] = canonical_contract_hash(
        [
            {
                "calculation_id": resealed["calculation_id"],
                "calculation_hash": resealed["calculation_hash"],
            }
        ]
    )
    contract["quality"]["evidence_contract"]["calculation_manifest_hash"] = (
        contract["calculation_manifest_hash"]
    )
    contract["quality"]["evidence_contract"]["calculation_requirements"][0][
        "calculation_ids"
    ] = [resealed["calculation_id"]]

    with pytest.raises(ValueError, match="deterministic identity"):
        validate_business_evidence_contract_v1(contract)


def test_calculation_schema_rejects_removed_top_level_claim_id():
    contract = build_business_evidence_contract_v1(
        _profile("subscription"),
        [_fact("subscription", 1, "10"), _fact("subscription", 2, "20")],
    )
    calculation = deepcopy(contract["calculations"][0])
    calculation.pop("calculation_hash")
    calculation["claim_id"] = "calculation-claim-is-not-a-market-claim"

    with pytest.raises(ValueError, match="Extra inputs"):
        seal_evidence_calculation_v1(calculation)


def test_calculation_subtraction_is_exact_beyond_decimal_default_precision():
    higher = "99999999999999999999999999999.99"
    contract = build_business_evidence_contract_v1(
        _profile("subscription"),
        [_fact("subscription", 1, "0.01"), _fact("subscription", 2, higher)],
    )

    assert contract["calculations"][0]["result"]["amount"] == (
        "99999999999999999999999999999.98"
    )
    assert validate_business_evidence_contract_v1(contract) == contract


def test_calculation_accepts_and_exactly_subtracts_128_character_amount():
    higher = "9" * 128
    contract = build_business_evidence_contract_v1(
        _profile("usage_based"),
        [_fact("usage_based", 1, "0"), _fact("usage_based", 2, higher)],
    )

    assert contract["calculations"][0]["result"]["amount"] == higher
    assert validate_business_evidence_contract_v1(contract) == contract


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("scope_hash", "f" * 64),
        ("labour_included", False),
        ("materials_included", False),
    ],
)
def test_project_calculation_skips_quotes_with_heterogeneous_scope(
    field: str, replacement
):
    facts = [
        _fact("project_service", 1, "10"),
        _fact("project_service", 2, "20"),
    ]
    facts[1]["payload"][field] = replacement

    with pytest.raises(ValueError, match="requirements are not satisfied"):
        build_business_evidence_contract_v1(_profile("project_service"), facts)
