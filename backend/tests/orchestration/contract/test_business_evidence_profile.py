"""Strict request contract for profile-selected broad business evidence."""

from __future__ import annotations

from copy import deepcopy

import pytest
from pydantic import ValidationError

from backend.domain.orchestration.models import (
    BusinessEvidenceProfileV1,
    ResearchBriefV1,
)
from backend.services.orchestration.adapters.hybrid_research_adapter import (
    HybridResearchAdapter,
)
from backend.tests.orchestration.unit.test_uncertainty_router import (
    _ambiguous_research_payload,
)
from backend.domain.orchestration.models import DecisionCreateRequestV1


pytestmark = pytest.mark.contract

MARKET_SCOPE_HASH = "a" * 64

ECONOMIC_MODELS = {
    "physical_product": (
        "physical_product_offer",
        "physical_offer_price_difference",
    ),
    "subscription": (
        "subscription_plan",
        "subscription_rate_difference",
    ),
    "usage_based": (
        "usage_tariff",
        "usage_tariff_rate_difference",
    ),
    "project_service": (
        "project_service_quote",
        "project_quote_rate_difference",
    ),
}


def _profile(economic_model: str) -> dict:
    fact_kind, calculation_kind = ECONOMIC_MODELS[economic_model]
    return {
        "version": "business_evidence_profile_v1",
        "intent": "commercial_market_launch",
        "economic_model": economic_model,
        "market_scope_hash": MARKET_SCOPE_HASH,
        "fact_requirements": [
            {
                "kind": fact_kind,
                "minimum_verified": 2,
                "applicability": "required",
            }
        ],
        "calculation_requirements": [
            {
                "kind": calculation_kind,
                "minimum_verified": 1,
                "applicability": "required_when_applicable",
            }
        ],
        "required_role_slots": [
            "customer_market",
            "pricing_finance",
            "domain_delivery",
        ],
    }


def _brief(profile: dict | None = None) -> ResearchBriefV1:
    values = {
        "business_idea": "Launch a verified offer",
        "target_stakeholders": "Economic buyers",
        "problem": "Comparable current evidence is required",
        "research_prd_type": "commercial_market_launch",
    }
    if profile is not None:
        values["business_evidence_profile"] = profile
    return ResearchBriefV1.model_validate(values)


@pytest.mark.parametrize("economic_model", sorted(ECONOMIC_MODELS))
def test_business_evidence_profile_accepts_each_reviewed_economic_model(
    economic_model: str,
):
    brief = _brief(_profile(economic_model))

    profile = brief.business_evidence_profile
    assert profile is not None
    assert profile.economic_model == economic_model
    assert profile.model_dump(mode="json") == _profile(economic_model)


@pytest.mark.parametrize(
    "field",
    ["fact_requirements", "calculation_requirements", "required_role_slots"],
)
def test_business_evidence_profile_rejects_duplicate_contract_entries(field: str):
    profile = _profile("physical_product")
    profile[field].append(deepcopy(profile[field][0]))

    with pytest.raises(ValidationError, match="unique"):
        BusinessEvidenceProfileV1.model_validate(profile)


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [
        (("economic_model", "laundromat"), "economic_model"),
        (("fact_kind", "laundry_cycle_price"), "kind"),
        (("calculation_kind", "generic_difference"), "kind"),
        (("role_slot", "roofing_specialist"), "required_role_slots"),
        (("extra", True), "extra_forbidden"),
    ],
)
def test_business_evidence_profile_rejects_unknown_contract_values(
    mutation: tuple[str, object], expected: str
):
    profile = _profile("usage_based")
    target, value = mutation
    if target == "fact_kind":
        profile["fact_requirements"][0]["kind"] = value
    elif target == "calculation_kind":
        profile["calculation_requirements"][0]["kind"] = value
    elif target == "role_slot":
        profile["required_role_slots"][0] = value
    else:
        profile[target] = value

    with pytest.raises(ValidationError, match=expected):
        BusinessEvidenceProfileV1.model_validate(profile)


def test_business_evidence_profile_rejects_cross_model_adapter_selection():
    profile = _profile("physical_product")
    profile["fact_requirements"][0]["kind"] = "subscription_plan"

    with pytest.raises(ValidationError, match="incompatible with economic_model"):
        BusinessEvidenceProfileV1.model_validate(profile)


@pytest.mark.parametrize(
    "requirements_field",
    ["fact_requirements", "calculation_requirements"],
)
def test_only_required_requirements_reject_zero_minimum(
    requirements_field: str,
):
    profile = _profile("physical_product")
    profile[requirements_field][0]["applicability"] = "required"
    profile[requirements_field][0]["minimum_verified"] = 0

    with pytest.raises(ValidationError, match="minimum_verified >= 1"):
        BusinessEvidenceProfileV1.model_validate(profile)

    profile[requirements_field][0]["applicability"] = "required_when_applicable"
    accepted = BusinessEvidenceProfileV1.model_validate(profile)
    assert getattr(accepted, requirements_field)[0].minimum_verified == 0


def test_non_none_profile_rejects_null_market_scope_hash():
    profile = _profile("project_service")
    profile["intent"] = "software_product"
    profile["market_scope_hash"] = None

    with pytest.raises(ValidationError, match="market_scope_hash is required"):
        BusinessEvidenceProfileV1.model_validate(profile)


def test_none_profile_accepts_null_market_scope_and_empty_requirements():
    accepted = BusinessEvidenceProfileV1.model_validate(
        {
            "version": "business_evidence_profile_v1",
            "intent": "operational_process",
            "economic_model": "none",
            "market_scope_hash": None,
            "fact_requirements": [],
            "calculation_requirements": [],
            "required_role_slots": [],
        }
    )

    assert accepted.market_scope_hash is None


def test_research_brief_rejects_profile_intent_drift():
    profile = _profile("project_service")
    profile["intent"] = "software_product"

    with pytest.raises(ValidationError, match="intent must equal research_prd_type"):
        _brief(profile)


def test_absent_profile_preserves_v1_request_and_task_context_compatibility():
    brief = _brief()
    assert brief.business_evidence_profile is None
    assert "business_evidence_profile" not in brief.model_dump(
        mode="json", exclude_none=True
    )

    payload = _ambiguous_research_payload()
    request = DecisionCreateRequestV1.model_validate(payload)
    task_context = HybridResearchAdapter._task_context(request)

    assert request.research_brief is not None
    assert request.research_brief.business_evidence_profile is None
    assert task_context.business_evidence_profile is None


def test_profile_is_preserved_in_typed_task_context():
    payload = _ambiguous_research_payload()
    payload["research_brief"]["research_prd_type"] = "commercial_market_launch"
    payload["research_brief"]["business_evidence_profile"] = _profile(
        "subscription"
    )
    request = DecisionCreateRequestV1.model_validate(payload)

    task_context = HybridResearchAdapter._task_context(request)

    assert task_context.business_evidence_profile is not None
    assert task_context.business_evidence_profile.model_dump(mode="json") == _profile(
        "subscription"
    )
