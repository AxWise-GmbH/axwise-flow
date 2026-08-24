"""Focused v1/v2 build_research_bundle evidence-contract integration tests."""

from __future__ import annotations

import hashlib
from copy import deepcopy
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

import pytest

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    DemographicDetails,
    InterviewResponse,
    QuestionsData,
    SimulatedInterview,
    SimulatedPerson,
    SimulationConfig,
    SimulationRequest,
    SimulationResponse,
)
from backend.domain.market_scope import resolve_market_expression
from backend.domain.orchestration.scope_models import (
    ScopeContractBindingV1,
    ScopeResearchAcceptanceBindingV1,
    ScopeResearchContractV1,
    TrustedRuntimeMetadataV1,
)
from backend.services.orqaly_research_bundle_service import (
    BUNDLE_VERSION,
    HybridGroundingPolicy,
    HybridResearchMode,
    _complete_business_evidence_owner_ledger,
    build_research_bundle,
    canonical_hash,
)
from backend.services.research_quality_service import evaluate_critical_claims
from backend.tests.test_research_quality_service import _catalog_grounding


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
            "merchant": "Merchant",
            "merchant_domain": "merchant.example",
            "offer_id": "offer",
            "product_name": "Complete Cat Food 2 kg",
            "brand": "Example Brand",
            "sku": "SKU",
            "pack": {"quantity": "2", "unit": "kilogram"},
        },
    },
    "subscription": {
        "fact_kind": "subscription_plan",
        "calculation_kind": "subscription_rate_difference",
        "basis": {"quantity": "1", "unit": "seat_month"},
        "payload": {
            "provider": "SaaS",
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
            "provider": "Laundry",
            "provider_domain": "laundry.example",
            "tariff_id": "washer",
            "tariff_name": "Large washer",
            "service_name": "Self-service wash cycle",
            "fixed_fee": None,
        },
    },
    "project_service": {
        "fact_kind": "project_service_quote",
        "calculation_kind": "project_quote_rate_difference",
        "basis": {"quantity": "1", "unit": "hour"},
        "payload": {
            "provider": "Software Studio",
            "provider_domain": "studio.example",
            "quote_id": "quote",
            "service_name": "Software delivery project",
            "scope_hash": "d" * 64,
            "labour_included": True,
            "materials_included": False,
            "valid_until": "2026-09-30T00:00:00+00:00",
        },
    },
}


def _request() -> SimulationRequest:
    return SimulationRequest(
        business_context=BusinessContext(
            business_idea="Launch a grounded offer",
            target_customer="Evidence-conscious buyers",
            problem="Current offer evidence is incomplete",
            industry="cross-category",
            location="Estonia",
            market_scope=resolve_market_expression("Estonia"),
        ),
        questions_data=QuestionsData(stakeholders={}),
        config=SimulationConfig(people_per_stakeholder=1),
    )


def _result() -> SimulationResponse:
    person = SimulatedPerson(
        id="participant-1",
        name="Customer Buyer",
        age=38,
        background="Owns the buying decision.",
        motivations=["Use traceable evidence"],
        pain_points=["Unverified offers"],
        communication_style="direct",
        stakeholder_type="customer",
        demographic_details=DemographicDetails(country_code="EE"),
    )
    interview = SimulatedInterview(
        person_id=person.id,
        stakeholder_type="customer",
        responses=[
            InterviewResponse(
                question="What do you require?",
                response="Comparable verified evidence.",
                sentiment="neutral",
                key_insights=["Evidence must be comparable"],
            )
        ],
        interview_duration_minutes=5,
        overall_sentiment="neutral",
        key_themes=["evidence"],
    )
    return SimulationResponse(
        success=True,
        message="complete",
        simulation_id="simulation-v2-contract",
        people=[person],
        interviews=[interview],
        empirical_personas=[
            {
                "name": "Customer Buyer",
                "stakeholder_intelligence": {
                    "stakeholder_type": "Problem experiencer"
                },
                "pain_points": ["Unverified offers"],
            }
        ],
        data={
            "persona_resolution": {
                "customer_persona": {
                    "name": "Customer Buyer",
                    "buyer_role": True,
                },
                "ideal_agent_persona": {
                    "role": "Finance Pricing Specialist"
                },
            }
        },
    )


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
        "required_role_slots": ["pricing_finance"],
    }


def _task_context(profile: dict | None = None) -> dict:
    context = {
        "task_id": "broad-evidence-task",
        "title": "Build grounded commercial evidence",
        "description": "Compare verified offers",
        "desired_outcome": "A traceable decision",
        "research_prd_type": "commercial_market_launch",
        "required_execution_roles": ["Finance Pricing Specialist"],
    }
    if profile is not None:
        context["business_evidence_profile"] = profile
    return context


def _typed_payload(model: str, ordinal: int, amount: str) -> dict:
    archetype = ARCHETYPES[model]
    payload = deepcopy(archetype["payload"])
    if model == "physical_product":
        payload.update(
            {
                "merchant": f"Merchant {ordinal}",
                "merchant_domain": f"merchant{ordinal}.example",
                "offer_id": f"offer-{ordinal}",
                "sku": f"SKU-{ordinal}",
            }
        )
    elif model == "subscription":
        payload.update(
            {
                "provider": f"SaaS {ordinal}",
                "provider_domain": f"saas{ordinal}.example",
                "plan_id": f"pro-{ordinal}",
            }
        )
    elif model == "usage_based":
        payload.update(
            {
                "provider": f"Laundry {ordinal}",
                "provider_domain": f"laundry{ordinal}.example",
                "tariff_id": f"washer-{ordinal}",
            }
        )
    else:
        payload.update(
            {
                "provider": f"Studio {ordinal}",
                "provider_domain": f"studio{ordinal}.example",
                "quote_id": f"quote-{ordinal}",
            }
        )
    payload["price"] = {
        "amount": amount,
        "currency": "EUR",
        "tax_basis": "gross",
    }
    payload["basis"] = deepcopy(archetype["basis"])
    return {
        "kind": archetype["fact_kind"],
        "comparison_scope_hash": COMPARISON_HASH,
        "payload": payload,
    }


def _grounding(model: str, *, status: str = "verified_current_authoritative"):
    rows = []
    sources = []
    for ordinal, amount in ((1, "10"), (2, "20")):
        claim_id = f"claim-{model}-{ordinal}"
        fact_id = f"fact-{model}-{ordinal}"
        source_id = f"source-{model}-{ordinal}"
        rows.append(
            {
                "claim_id": claim_id,
                "status": status,
                "country_codes": ["EE"],
                "source_ids": [source_id],
                "effective_or_observation_at": "2026-08-14T09:00:00+00:00",
                "sources": [{"source_id": source_id}],
                "facts": [
                    {
                        "fact_id": fact_id,
                        "claim_id": claim_id,
                        "identity_complete": True,
                        "source_scope": [source_id],
                        "country_codes": ["EE"],
                        "temporal_scope": "2026-08-14T09:00:00+00:00",
                        "topic_seed_sha256": TOPIC_HASH,
                        "business_evidence": _typed_payload(
                            model, ordinal, amount
                        ),
                    }
                ],
            }
        )
        sources.append(
            {
                "source_id": source_id,
                "source_type": "official_company_website",
                "url": f"https://source{ordinal}.example/offer",
                "title": f"Verified offer {ordinal}",
            }
        )
    return {
        "market_sources": sources,
        "market_claims": [],
        "critical_claim_quality": {
            "status": "passed" if status == "verified_current_authoritative" else "blocked",
            "topic_seed_sha256": TOPIC_HASH,
            "evidence_ledger": rows,
        },
    }


def _build(
    *,
    task_context: dict,
    grounding: dict,
) -> dict:
    request = _request()
    grounding = deepcopy(grounding)
    grounding.setdefault(
        "market_scope",
        request.business_context.market_scope.model_dump(mode="json"),
    )
    requested_outputs = {
        "market_sources": True,
        "persona_resolution": True,
        "research_bundle": True,
    }
    roles = list(task_context.get("required_execution_roles") or [])
    role_slots = [
        {
            "slot_id": (
                f"role-{ordinal:04x}"
                f"{hashlib.sha256(role.encode('utf-8')).hexdigest()[:12]}"
            ),
            "role": role,
            "required": True,
        }
        for ordinal, role in enumerate(roles)
    ]
    contract_payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "commercial_market_launch",
        "work_types": ["research_analysis", "strategy_planning"],
        "geographies": ["EE"],
        "evidence": {
            "mode": "grounded",
            "grounding_required": True,
            "external_sources_required": True,
            "required_outputs": sorted(requested_outputs),
        },
        "executor_role_slots": role_slots,
    }
    contract_payload["contract_hash"] = (
        ScopeResearchContractV1.canonical_hash_for(contract_payload)
    )
    contract = ScopeResearchContractV1.model_validate(contract_payload)
    scope_hash = canonical_hash(
        {
            "fixture": "business-evidence-research-bundle",
            "contract": contract.model_dump(mode="json"),
        }
    )
    binding = ScopeContractBindingV1.model_validate(
        {"scope_hash": scope_hash, **contract.model_dump(mode="json")}
    )
    execution_hash = canonical_hash(
        {
            "fixture": "business-evidence-execution",
            "scope_contract_binding": binding.model_dump(mode="json"),
            "task_id": task_context["task_id"],
        }
    )
    acceptance_payload = {
        "version": "orqaly_scope_research_acceptance_v1",
        "org_id": "orqaly-org-business-evidence",
        "user_id": "orqaly-user-business-evidence",
        "goal_id": task_context["task_id"],
        "proposal_decision_id": "business-evidence-proposal",
        "scope_hash": scope_hash,
        "contract_hash": contract.contract_hash,
        "execution_inputs_hash": execution_hash,
        "acceptance_id": str(
            uuid5(NAMESPACE_URL, "business-evidence-research-bundle")
        ),
        "accepted_at": "2026-08-24T12:00:00.000Z",
        "accepted_by_user_id": "orqaly-user-business-evidence",
    }
    acceptance_payload["binding_hash"] = (
        ScopeResearchAcceptanceBindingV1.canonical_hash_for(
            acceptance_payload
        )
    )
    acceptance = ScopeResearchAcceptanceBindingV1.model_validate(
        acceptance_payload
    )
    task_context = {
        **task_context,
        "scope_contract_binding": binding.model_dump(mode="json"),
        "research_execution_inputs_hash": execution_hash,
        "scope_research_acceptance": acceptance.model_dump(mode="json"),
        "scope_runtime_binding": TrustedRuntimeMetadataV1().model_dump(
            mode="json"
        ),
    }
    return build_research_bundle(
        job_id="job-business-evidence",
        request=request,
        requested_outputs=requested_outputs,
        result=_result(),
        grounding=grounding,
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
        analysis_result_id=42,
        research_prd={
            "analysis_result_id": 42,
            "cached_prd_id": 7,
            "content_hash": "e" * 64,
            "prd_type": "commercial_market_launch",
            "status": "completed",
        },
        task_context=task_context,
    )


@pytest.mark.parametrize("model", list(ARCHETYPES))
def test_bundle_fails_closed_when_profile_adapter_is_not_enabled(
    monkeypatch, model: str
):
    monkeypatch.delenv("AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", raising=False)

    with pytest.raises(ValueError, match=f"model {model} is not enabled"):
        _build(
            task_context=_task_context(_profile(model)),
            grounding=_grounding(model),
        )


def _live_physical_grounding(monkeypatch, *, offer_count: int = 2) -> dict:
    monkeypatch.setenv(
        "AXWISE_AUTHORITY_PROOF_SECRET",
        "bundle-projection-authority-secret-32-bytes",
    )
    claims = (
        [
            (
                "claim-alpha",
                "Alpha cat food 400 g current retail price is 15,99 € on 2026-08-12.",
            ),
            (
                "claim-beta",
                "Beta cat food 2 kg current retail price is 20,99 € on 2026-08-12.",
            ),
        ]
        if offer_count == 2
        else [
            (
                f"claim-{index}",
                f"Variant {index} cat food 400 g current retail price is "
                f"{10 + index},99 € on 2026-08-12.",
            )
            for index in range(offer_count)
        ]
    )
    grounding = _catalog_grounding(
        country_code="EE",
        source_url="https://shop.example.ee/offers",
        claims=claims,
    )
    source = grounding["market_sources"][0]
    source["authority_document"] = {
        key: value
        for key, value in source["_authority_document_artifact"].items()
        if key != "text"
    }
    grounding["critical_claim_quality"] = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        mandatory_claim_classes=["observed_primary_market"],
    )
    assert grounding["critical_claim_quality"]["status"] == "passed"
    for source in grounding["market_sources"]:
        source.pop("_authority_document_artifact", None)
        source.pop("_structured_evidence_html", None)
    return grounding


def test_live_signed_physical_offers_emit_v2_and_complete_owner_ledger(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", "physical_product"
    )
    bundle = _build(
        task_context=_task_context(_profile("physical_product")),
        grounding=_live_physical_grounding(monkeypatch),
    )

    assert bundle["version"] == "axwise_research_bundle_v2"
    assert len(bundle["facts"]) == 2
    assert len(bundle["calculations"]) == 1
    assert bundle["quality"]["evidence_contract"]["status"] == "passed"
    # Physical calculations intentionally compare observed pack-total prices;
    # the distinct pack sizes remain explicit in their input facts.
    assert {fact["payload"]["pack"]["unit"] for fact in bundle["facts"]} == {
        "gram",
        "kilogram",
    }
    assert len({fact["comparison_scope_hash"] for fact in bundle["facts"]}) == 1
    owner_ledger = bundle["quality"]["critical_claims"]["evidence_ledger"]
    emitted_ids = {fact["fact_id"] for fact in bundle["facts"]}
    owner_ids = {
        fact["fact_id"]
        for row in owner_ledger
        for fact in row["facts"]
    }
    assert owner_ids == emitted_ids
    assert "_physical_product_projection_authorization" not in str(bundle)
    assert bundle["executor_personas"][0]["role_slot"] == "pricing_finance"
    hash_input = {key: value for key, value in bundle.items() if key != "bundle_hash"}
    assert bundle["bundle_hash"] == canonical_hash(hash_input)


def test_live_signed_physical_fact_only_profile_emits_without_calculation(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", "physical_product"
    )
    profile = _profile("physical_product")
    profile["fact_requirements"][0]["minimum_verified"] = 1
    profile["calculation_requirements"] = []

    bundle = _build(
        task_context=_task_context(profile),
        grounding=_live_physical_grounding(monkeypatch, offer_count=1),
    )

    assert len(bundle["facts"]) == 1
    assert bundle["calculations"] == []
    assert bundle["quality"]["evidence_contract"]["status"] == "passed"


def test_enabled_physical_adapter_rejects_legacy_injected_typed_evidence(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", "physical_product"
    )
    with pytest.raises(ValueError, match="observed-primary-market"):
        _build(
            task_context=_task_context(_profile("physical_product")),
            grounding=_grounding("physical_product"),
        )


def test_v2_owner_ledger_is_complete_beyond_generic_twelve_item_bound(monkeypatch):
    monkeypatch.setenv(
        "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", "physical_product"
    )
    bundle = _build(
        task_context=_task_context(_profile("physical_product")),
        grounding=_live_physical_grounding(monkeypatch, offer_count=13),
    )

    owner_ledger = bundle["quality"]["critical_claims"]["evidence_ledger"]
    owner_facts = [fact for row in owner_ledger for fact in row["facts"]]
    assert len(bundle["facts"]) == len(owner_ledger) == len(owner_facts) == 13
    assert {fact["fact_id"] for fact in bundle["facts"]} == {
        fact["fact_id"] for fact in owner_facts
    }


def test_v2_owner_merge_retains_nonbusiness_provenance_with_thirteen_typed_facts(
    monkeypatch,
):
    monkeypatch.setenv(
        "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS", "physical_product"
    )
    grounding = _live_physical_grounding(monkeypatch, offer_count=13)
    statutory_fact = {
        "fact_id": "statutory-fact-retained",
        "claim_id": "statutory-claim-retained",
        "evidence_class": "statutory_regulatory",
        "source_scope": ["statutory-source-retained"],
        "country_codes": ["EE"],
        "temporal_scope": "2026-08-13T00:00:00+00:00",
        "topic_seed_sha256": TOPIC_HASH,
        "display_value": "A bounded non-business regulatory fact",
    }
    critical = grounding["critical_claim_quality"]
    critical["evidence_ledger"].insert(
        0,
        {
            "claim_id": "statutory-claim-retained",
            "evidence_class": "statutory_regulatory",
            "status": "verified_current_authoritative",
            "country_codes": ["EE"],
            "source_ids": ["statutory-source-retained"],
            "effective_or_observation_at": "2026-08-13T00:00:00+00:00",
            "facts": [statutory_fact],
            "sources": [{"source_id": "statutory-source-retained"}],
        },
    )
    critical.setdefault("verified_facts", []).insert(0, statutory_fact)

    bundle = _build(
        task_context=_task_context(_profile("physical_product")),
        grounding=grounding,
    )

    emitted_ids = {fact["fact_id"] for fact in bundle["facts"]}
    serialized_critical = bundle["quality"]["critical_claims"]
    serialized_owners = [
        fact["fact_id"]
        for row in serialized_critical["evidence_ledger"]
        for fact in row.get("facts") or []
        if fact.get("fact_id") in emitted_ids
    ]
    serialized_verified = [
        fact["fact_id"]
        for fact in serialized_critical["verified_facts"]
        if fact.get("fact_id") in emitted_ids
    ]
    assert len(emitted_ids) == 13
    assert len(serialized_owners) == len(set(serialized_owners)) == 13
    assert len(serialized_verified) == len(set(serialized_verified)) == 13
    assert any(
        fact.get("fact_id") == "statutory-fact-retained"
        for row in serialized_critical["evidence_ledger"]
        for fact in row.get("facts") or []
    )
    assert any(
        fact.get("fact_id") == "statutory-fact-retained"
        for fact in serialized_critical["verified_facts"]
    )
    assert "_physical_product_projection_authorization" not in str(bundle)


def _thirteen_fact_owner_fixture() -> tuple[dict, list[dict]]:
    emitted = [
        {
            "fact_id": f"fact-{index}",
            "claim_id": "claim-many",
            "source_ids": ["source-many"],
            "country_codes": ["EE"],
            "observed_at": "2026-08-14T09:00:00Z",
            "topic_seed_sha256": TOPIC_HASH,
        }
        for index in range(13)
    ]
    facts = [
        {
            "fact_id": row["fact_id"],
            "claim_id": row["claim_id"],
            "identity_complete": True,
            "evidence_class": "observed_primary_market",
            "source_scope": row["source_ids"],
            "country_codes": row["country_codes"],
            "temporal_scope": "2026-08-14T09:00:00+00:00",
            "topic_seed_sha256": TOPIC_HASH,
            "_physical_product_projection_authorization": {"secret": index},
        }
        for index, row in enumerate(emitted)
    ]
    grounding = {
        "critical_claim_quality": {
            "evidence_ledger": [
                {
                    "claim_id": "claim-many",
                    "evidence_class": "observed_primary_market",
                    "status": "verified_current_authoritative",
                    "source_ids": ["source-many"],
                    "country_codes": ["EE"],
                    "effective_or_observation_at": (
                        "2026-08-14T09:00:00+00:00"
                    ),
                    "facts": facts,
                    "sources": [{"source_id": "source-many"}],
                }
            ]
        }
    }
    return grounding, emitted


def test_complete_owner_ledger_keeps_thirteen_facts_in_one_row_without_token():
    grounding, emitted = _thirteen_fact_owner_fixture()

    rows, facts = _complete_business_evidence_owner_ledger(grounding, emitted)

    assert len(rows) == 1
    assert len(rows[0]["facts"]) == len(facts) == 13
    assert {fact["fact_id"] for fact in facts} == {
        fact["fact_id"] for fact in emitted
    }
    assert "_physical_product_projection_authorization" not in str(rows)


@pytest.mark.parametrize("failure", ["missing", "duplicate"])
def test_complete_owner_ledger_rejects_missing_or_duplicate_thirteenth_owner(
    failure,
):
    grounding, emitted = _thirteen_fact_owner_fixture()
    facts = grounding["critical_claim_quality"]["evidence_ledger"][0]["facts"]
    if failure == "missing":
        facts.pop()
    else:
        facts.append(deepcopy(facts[-1]))

    with pytest.raises(ValueError, match="one serialized owner|multiple owners"):
        _complete_business_evidence_owner_ledger(grounding, emitted)


def test_profile_absent_preserves_v1_shape_and_bundle_hash_contract():
    bundle = _build(
        task_context=_task_context(),
        grounding={"market_sources": [], "market_claims": []},
    )

    assert bundle["version"] == BUNDLE_VERSION == "axwise_research_bundle_v1"
    assert "evidence_profile" not in bundle
    assert "facts" not in bundle
    assert "calculations" not in bundle
    assert "evidence_contract" not in bundle["quality"]
    hash_input = {key: value for key, value in bundle.items() if key != "bundle_hash"}
    assert bundle["bundle_hash"] == canonical_hash(hash_input)
    assert bundle["bundle_hash"] == (
        "81acdc57269bfea4f7cfed377ecf532ecddc8e45fbb3cd763dd265fa6f87ddc6"
    )


def test_v2_rejects_role_slot_and_requested_role_count_mismatch():
    profile = _profile("project_service")
    profile["required_role_slots"] = ["pricing_finance", "domain_delivery"]

    with pytest.raises(ValueError, match="exactly match requested execution roles"):
        _build(
            task_context=_task_context(profile),
            grounding=_grounding("project_service"),
        )


def test_null_profile_market_scope_cannot_emit_typed_market_facts():
    profile = _profile("physical_product")
    profile["market_scope_hash"] = None

    with pytest.raises(ValueError, match="market_scope_hash"):
        _build(
            task_context=_task_context(profile),
            grounding=_grounding("physical_product"),
        )


def test_model_none_supports_null_scope_empty_facts_and_zero_role_slots():
    profile = {
        "version": "business_evidence_profile_v1",
        "intent": "commercial_market_launch",
        "economic_model": "none",
        "market_scope_hash": None,
        "fact_requirements": [],
        "calculation_requirements": [],
        "required_role_slots": [],
    }
    task_context = _task_context(profile)
    task_context["required_execution_roles"] = []

    bundle = _build(
        task_context=task_context,
        grounding={"market_sources": [], "market_claims": []},
    )

    assert bundle["version"] == "axwise_research_bundle_v2"
    assert bundle["facts"] == []
    assert bundle["calculations"] == []
    assert bundle["executor_personas"] == []
    assert bundle["persona_assignments"] == []
