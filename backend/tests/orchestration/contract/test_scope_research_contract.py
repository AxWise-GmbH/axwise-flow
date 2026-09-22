"""Typed semantic admission and immutable research-contract regressions."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.domain.market_scope import resolve_market_expression
from backend.domain.orchestration.scope_models import (
    ScopeEvidenceContractV1,
    ScopePacketV1,
    ScopeResearchAcceptanceBindingV1,
    ScopeResearchContractV1,
    ScopeStateV1,
)
from backend.services.orchestration.adapters.hybrid_research_adapter import (
    HybridResearchAdapter,
)
from backend.services.orchestration.scope_contract_service import (
    COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
    ScopeContractError,
    build_scope_packet,
    ensure_scope_packet,
    research_execution_inputs_hash,
    scope_contract_binding,
    validate_scope_research_acceptance,
)
from backend.tests.orchestration.unit.test_uncertainty_router import _payload


pytestmark = pytest.mark.contract

ALL_RESEARCH_OUTPUTS = [
    "market_sources",
    "market_claims",
    "synthetic_participants",
    "interviews",
    "customer_personas",
    "persona_resolution",
    "research_prd",
    "research_bundle",
]


def _request_payload(
    objective: str,
    desired_outcome: str,
    *,
    domain: str = "general",
    research_outputs: list[str] | None = None,
) -> dict:
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    payload["task"].update(
        {
            "domain": domain,
            "task_class": None,
            "capability_profile": None,
            "objective": objective,
            "desired_outcome": desired_outcome,
            "required_capabilities": [],
            "preferred_capabilities": [],
            "required_tools": [],
            "requested_actions": [],
            "stakeholders": [],
            "constraints": [],
        }
    )
    payload["research_policy"] = {
        "allow_hybrid_research": True,
        "minimum_mode": "auto",
        "required_outputs": (
            [] if research_outputs is None else research_outputs
        ),
    }
    payload.pop("research_brief", None)
    payload.pop("scope_state", None)
    payload.pop("scope_packet", None)
    return payload


def _commercial_payload() -> dict:
    payload = _request_payload(
        (
            "Plan a commercial market launch and distribution of cat food in "
            "Estonia, with EU regulatory context"
        ),
        (
            "A commercially viable launch plan supported by current official "
            "market sources"
        ),
        domain="pet_food_distribution",
        research_outputs=ALL_RESEARCH_OUTPUTS,
    )
    payload["research_policy"]["required"] = True
    payload["research_brief"] = {
        "business_idea": "Launch cat food distribution in Estonia",
        "target_stakeholders": "Estonian buyers and distributors",
        "problem": "Current commercial evidence is required before launch",
        "location": "Estonia",
    }
    return payload


def _request(payload: dict) -> DecisionCreateRequestV1:
    return DecisionCreateRequestV1.model_validate(payload)


def _legacy_contract() -> dict:
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "operational_process",
        "work_types": ["software_development"],
        "geographies": [],
        "evidence": {
            "mode": "synthetic",
            "grounding_required": False,
            "external_sources_required": False,
            "required_outputs": ["customer_personas", "research_bundle"],
        },
        "executor_role_slots": [],
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        payload
    )
    return payload


def _stale_scope_state(correction: str) -> dict:
    return {
        "admission": {
            "work_types": ["software_development"],
            "success_criteria": ["Deploy the old application"],
        },
        "deliverable": {"type": "operational_process_prd"},
        "research_contract": _legacy_contract(),
        "requirements": [
            {
                "text": correction,
                "source_refs": ["goal.data.context_revision_feedback"],
            }
        ],
    }


def test_meta_language_and_negation_do_not_create_work_types():
    payload = _request_payload(
        "Record a matching content hash for the approved result",
        "Do not deploy anything; return only the audit metadata",
    )

    packet = build_scope_packet(_request(payload))

    assert packet.research_contract is not None
    assert packet.research_contract.document_intent == "custom"
    assert packet.research_contract.work_types == ("mixed_custom",)
    assert "software_development" not in packet.admission.work_types
    assert "content_asset_creation" not in packet.admission.work_types


def test_default_research_capabilities_do_not_become_required_acquisition():
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    payload.pop("research_policy", None)
    payload.pop("research_brief", None)

    contract = build_scope_packet(_request(payload)).research_contract

    assert contract.evidence.mode == "none"
    assert contract.evidence.required_outputs == ()


def test_commercial_launch_binds_estonia_without_expanding_eu_and_pins_topology():
    packet = build_scope_packet(_request(_commercial_payload()))
    contract = packet.research_contract

    assert contract is not None
    assert contract.document_intent == "commercial_market_launch"
    assert contract.geographies == ("EE",)
    assert packet.admission.geographies == ["EE"]
    assert {
        "procurement_logistics",
        "research_analysis",
        "strategy_planning",
    }.issubset(contract.work_types)
    assert contract.evidence.mode == "grounded"
    assert contract.evidence.grounding_required is True
    assert contract.evidence.external_sources_required is True
    assert contract.evidence.required_outputs == tuple(
        sorted(ALL_RESEARCH_OUTPUTS)
    )
    assert packet.deliverable.type == "commercial_market_launch_prd"
    assert [slot.role for slot in contract.executor_role_slots] == list(
        COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES
    )
    assert [slot.slot_id[:9] for slot in contract.executor_role_slots] == [
        "role-0000",
        "role-0001",
        "role-0002",
        "role-0003",
        "role-0004",
    ]


def test_launch_ready_estonia_distribution_prd_uses_commercial_contract():
    prompt = (
        "Create a launch-ready, evidence-grounded PRD and operating plan for "
        "distributing subscription cat food in Estonia. Define customer and "
        "executor personas; supplier-to-last-mile workflow; pricing and "
        "unit-economics assumptions; legal and food-safety risks; KPIs; "
        "measurable acceptance criteria; and a phased rollout. Use current "
        "public evidence where required. Deliver exactly one complete Markdown "
        "file named estonia-cat-food-distribution-plan.md. Do not purchase, "
        "order, message third parties, or perform external business actions. "
        "Exclude credentials, payment data, authentication/session tokens, and "
        "unrelated goals."
    )
    payload = _request_payload(
        prompt,
        prompt,
        domain="general_operations",
        research_outputs=ALL_RESEARCH_OUTPUTS,
    )
    payload["research_policy"].update(
        {
            "required": False,
            "grounding_required": False,
            "fail_closed": True,
        }
    )
    payload["research_brief"] = {
        "business_idea": prompt,
        "target_stakeholders": (
            "Unknown — identify the person, team, organisation, community, "
            "buyer, user, or beneficiary affected by this goal"
        ),
        "problem": prompt,
        "research_questions": [
            "Who directly experiences the problem?",
            "Which observable outcome would count as success?",
        ],
        "required_execution_roles": [],
        "industry": "general_operations",
        "location": None,
        "depth": "detailed",
        "sample_size": 1,
    }
    payload["scope_state"] = {
        "requirements": [
            {
                "text": prompt,
                "priority": "P0",
                "authority": "user",
                "source_refs": ["goal.parsed_requirements"],
            }
        ]
    }

    packet = build_scope_packet(_request(payload))
    contract = packet.research_contract

    assert contract.document_intent == "commercial_market_launch"
    assert contract.geographies == ("EE",)
    assert {
        "procurement_logistics",
        "research_analysis",
        "strategy_planning",
    }.issubset(contract.work_types)
    assert contract.evidence.mode == "grounded"
    assert contract.evidence.required_outputs == tuple(
        sorted(ALL_RESEARCH_OUTPUTS)
    )
    assert packet.deliverable.type == "commercial_market_launch_prd"
    assert [slot.role for slot in contract.executor_role_slots] == list(
        COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES
    )
    assert packet.admission.requested_actions == []


@pytest.mark.parametrize(
    ("objective", "expected_mode", "expected_geographies"),
    [
        (
            "Prepare a stakeholder briefing memo from synthetic interviews only",
            "synthetic",
            (),
        ),
        (
            "Prepare a stakeholder briefing memo for Estonia using current public evidence",
            "grounded",
            ("EE",),
        ),
    ],
)
def test_custom_research_normalizes_unsupported_prd_output_for_every_mode(
    objective: str,
    expected_mode: str,
    expected_geographies: tuple[str, ...],
):
    payload = _request_payload(
        objective,
        "Return one reviewed Markdown briefing",
        research_outputs=ALL_RESEARCH_OUTPUTS,
    )

    packet = build_scope_packet(_request(payload))
    contract = packet.research_contract

    assert contract.document_intent == "custom"
    assert contract.evidence.mode == expected_mode
    assert contract.geographies == expected_geographies
    assert "research_prd" not in contract.evidence.required_outputs
    assert "research_bundle" in contract.evidence.required_outputs
    assert packet.deliverable.type == "custom_deliverable"


@pytest.mark.parametrize(
    ("objective", "expected_work_type", "expected_role"),
    [
        (
            "Prepare and run a marketing campaign for a local event",
            "outreach_campaign",
            "Campaign Execution Specialist",
        ),
        (
            "Send an SMS service notification to consented recipients",
            "external_service_operation",
            "External Service Operations Specialist",
        ),
        (
            "Plan procurement and logistics for recurring food deliveries",
            "procurement_logistics",
            "Procurement and Logistics Specialist",
        ),
    ],
)
def test_generic_noncommercial_work_gets_a_bounded_executor_topology(
    objective: str,
    expected_work_type: str,
    expected_role: str,
):
    payload = _request_payload(objective, "A reviewed execution plan")

    contract = build_scope_packet(_request(payload)).research_contract

    assert contract is not None
    assert contract.document_intent == "custom"
    assert expected_work_type in contract.work_types
    assert expected_role in [slot.role for slot in contract.executor_role_slots]
    assert contract.evidence.mode == "none"
    assert contract.evidence.required_outputs == ()


def test_correction_replaces_stale_contract_but_preserves_rebuilt_goal_context():
    payload = _commercial_payload()
    task_objective = payload["task"]["objective"]
    task_outcome = payload["task"]["desired_outcome"]
    payload["scope_state"] = _stale_scope_state(
        "Not software. Replace it with a commercial market launch for Estonia "
        "using current official sources; matching content hash is metadata only."
    )

    packet = build_scope_packet(_request(payload))
    contract = packet.research_contract

    assert contract is not None
    assert contract.document_intent == "commercial_market_launch"
    assert "software_development" not in contract.work_types
    assert "content_asset_creation" not in contract.work_types
    assert contract.geographies == ("EE",)
    assert packet.deliverable.type == "commercial_market_launch_prd"
    assert packet.intent.objective == task_objective
    assert packet.intent.desired_outcome == task_outcome
    assert packet.admission.success_criteria == [
        task_outcome,
        "Not software. Replace it with a commercial market launch for Estonia "
        "using current official sources; matching content hash is metadata only."
    ]


def test_partial_correction_changes_classification_without_erasing_goal():
    payload = _request_payload(
        "Prepare the autumn customer acquisition campaign",
        "A campaign plan ready for owner review",
    )
    payload["scope_state"] = _stale_scope_state(
        "Do not deploy software; keep the marketing campaign plan."
    )

    packet = build_scope_packet(_request(payload))

    assert packet.intent.objective == payload["task"]["objective"]
    assert packet.intent.desired_outcome == payload["task"]["desired_outcome"]
    assert packet.research_contract.work_types == ("outreach_campaign",)
    assert "software_development" not in packet.admission.work_types


def test_partial_geography_correction_retains_commercial_contract():
    payload = _commercial_payload()
    initial = build_scope_packet(_request(payload))
    payload["scope_state"] = _stale_scope_state(
        "Keep everything, just change the geography to Latvia."
    )

    corrected = build_scope_packet(_request(payload))
    contract = corrected.research_contract

    assert contract.document_intent == "commercial_market_launch"
    assert contract.geographies == ("LV",)
    assert contract.work_types == initial.research_contract.work_types
    assert contract.evidence == initial.research_contract.evidence
    assert [slot.role for slot in contract.executor_role_slots] == [
        slot.role for slot in initial.research_contract.executor_role_slots
    ]


def test_negated_old_geography_is_not_bound_with_its_replacement():
    payload = _commercial_payload()
    payload["scope_state"] = _stale_scope_state(
        "Not Estonia; use Latvia, and keep everything else."
    )

    contract = build_scope_packet(_request(payload)).research_contract

    assert contract.document_intent == "commercial_market_launch"
    assert contract.geographies == ("LV",)


def test_pinned_contract_is_authoritative_and_mismatches_fail_closed():
    payload = _commercial_payload()
    initial = build_scope_packet(_request(payload))
    contract = initial.research_contract
    assert contract is not None
    payload["task"]["objective"] = "Organize the accepted body of work"
    payload["task"]["desired_outcome"] = "Return the accepted deliverable"
    payload["research_policy"]["required_outputs"] = (
        contract.evidence.required_outputs
    )
    payload["scope_state"] = {
        "admission": initial.admission.model_dump(mode="json"),
        "deliverable": initial.deliverable.model_dump(mode="json"),
        "research_contract": contract.model_dump(mode="json"),
    }

    rebuilt = build_scope_packet(_request(payload))

    assert rebuilt.research_contract == contract
    assert rebuilt.research_contract.document_intent == (
        "commercial_market_launch"
    )

    mismatch = deepcopy(payload)
    mismatch_contract = deepcopy(mismatch["scope_state"]["research_contract"])
    mismatch_contract["geographies"] = ["DE"]
    mismatch_contract["contract_hash"] = (
        ScopeResearchContractV1.canonical_hash_for(mismatch_contract)
    )
    mismatch["scope_state"]["research_contract"] = mismatch_contract

    with pytest.raises(ScopeContractError, match="geographies"):
        build_scope_packet(_request(mismatch))


def test_binding_is_an_exact_packet_and_adapter_echo():
    request = ensure_scope_packet(_request(_commercial_payload()))
    packet = request.scope_packet
    assert packet is not None and packet.research_contract is not None

    binding = scope_contract_binding(packet)
    expected = {
        "scope_hash": packet.scope_hash,
        **packet.research_contract.model_dump(mode="json"),
    }

    assert binding.model_dump(mode="json") == expected
    task_context = HybridResearchAdapter._task_context(request)
    assert task_context.scope_contract_binding is not None
    assert task_context.scope_contract_binding.model_dump(mode="json") == expected
    assert task_context.scope_runtime_binding == packet.runtime


def test_business_evidence_v2_roles_override_generic_commercial_topology():
    payload = _commercial_payload()
    dynamic_roles = [
        "Estonian Retail Buyer Research Lead",
        "Local Pet-Food Pricing Analyst",
        "Veterinary Distribution Specialist",
    ]
    payload["research_brief"].update(
        {
            "research_prd_type": "commercial_market_launch",
            "required_execution_roles": dynamic_roles,
            "business_evidence_profile": {
                "version": "business_evidence_profile_v1",
                "intent": "commercial_market_launch",
                "economic_model": "physical_product",
                "market_scope_hash": resolve_market_expression(
                    "Estonia"
                ).resolution_hash,
                "fact_requirements": [
                    {
                        "kind": "physical_product_offer",
                        "minimum_verified": 2,
                        "applicability": "required",
                    }
                ],
                "calculation_requirements": [
                    {
                        "kind": "physical_offer_price_difference",
                        "minimum_verified": 1,
                        "applicability": "required_when_applicable",
                    }
                ],
                "required_role_slots": [
                    "customer_market",
                    "pricing_finance",
                    "domain_delivery",
                ],
            },
        }
    )

    request = ensure_scope_packet(_request(payload))
    contract = request.scope_packet.research_contract

    assert [slot.role for slot in contract.executor_role_slots] == dynamic_roles
    assert HybridResearchAdapter._task_context(
        request
    ).required_execution_roles == dynamic_roles


def test_evidence_modes_require_coherent_output_contracts():
    with pytest.raises(ValidationError, match="research_bundle"):
        ScopeEvidenceContractV1(
            mode="synthetic",
            required_outputs=["customer_personas"],
        )
    with pytest.raises(ValidationError, match="cannot request research outputs"):
        ScopeEvidenceContractV1(
            mode="none",
            required_outputs=["research_bundle"],
        )
    with pytest.raises(ValidationError, match="synthetic evidence"):
        ScopeEvidenceContractV1(
            mode="synthetic",
            required_outputs=["market_sources", "research_bundle"],
        )


def test_existing_evidence_mode_is_reserved_and_fails_before_dispatch():
    request = ensure_scope_packet(_request(_commercial_payload()))
    packet = request.scope_packet
    contract_payload = packet.research_contract.model_dump(mode="json")
    contract_payload["evidence"] = {
        **contract_payload["evidence"],
        "mode": "existing",
        "grounding_required": False,
        "external_sources_required": False,
    }
    contract_payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        contract_payload
    )
    existing_contract = ScopeResearchContractV1.model_validate(contract_payload)
    packet_payload = packet.model_dump(mode="json")
    packet_payload["research_contract"] = existing_contract.model_dump(mode="json")
    packet_payload["scope_hash"] = ScopePacketV1.canonical_hash_for(packet_payload)
    existing_packet = ScopePacketV1.model_validate(packet_payload)
    state = (request.scope_state or ScopeStateV1()).model_copy(
        update={
            "admission": existing_packet.admission,
            "deliverable": existing_packet.deliverable,
            "research_contract": existing_contract,
        }
    )
    accepted_request = request.model_copy(
        update={
            "upstream_decision_id": "decision-existing-proposal",
            "scope_state": state,
            "scope_packet": existing_packet,
        }
    )
    acceptance_payload = {
        "version": "orqaly_scope_research_acceptance_v1",
        "org_id": request.tenant.org_id,
        "user_id": request.tenant.user_id,
        "goal_id": request.task.task_id,
        "proposal_decision_id": "decision-existing-proposal",
        "scope_hash": existing_packet.scope_hash,
        "contract_hash": existing_contract.contract_hash,
        "execution_inputs_hash": research_execution_inputs_hash(
            accepted_request,
            existing_packet,
        ),
        "acceptance_id": "a7834d74-300a-4fc3-b4c5-69a3a5b45ca1",
        "accepted_at": "2026-08-24T12:00:00.000Z",
        "accepted_by_user_id": request.tenant.user_id,
    }
    acceptance_payload["binding_hash"] = (
        ScopeResearchAcceptanceBindingV1.canonical_hash_for(acceptance_payload)
    )
    accepted_request = accepted_request.model_copy(
        update={
            "scope_research_acceptance": (
                ScopeResearchAcceptanceBindingV1.model_validate(acceptance_payload)
            )
        }
    )

    with pytest.raises(ScopeContractError, match="portable bundle compiler"):
        validate_scope_research_acceptance(accepted_request, existing_packet)


@pytest.mark.parametrize("geography", ["ZZ", "AA", "ee"])
def test_contract_rejects_unassigned_or_noncanonical_geographies(
    geography: str,
):
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "custom",
        "work_types": ["mixed_custom"],
        "geographies": [geography],
        "evidence": {
            "mode": "none",
            "grounding_required": False,
            "external_sources_required": False,
            "required_outputs": [],
        },
        "executor_role_slots": [],
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        payload
    )

    with pytest.raises(ValidationError, match="geographies"):
        ScopeResearchContractV1.model_validate(payload)


def test_contract_rejects_noncanonical_arrays_and_role_slot_ids():
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "custom",
        "work_types": ["strategy_planning", "mixed_custom"],
        "geographies": [],
        "evidence": {
            "mode": "none",
            "grounding_required": False,
            "external_sources_required": False,
            "required_outputs": [],
        },
        "executor_role_slots": [
            {
                "slot_id": "role-ffffffffffffffff",
                "role": "Domain Delivery Specialist",
                "required": True,
            }
        ],
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        payload
    )

    with pytest.raises(ValidationError, match="work_types|slot IDs"):
        ScopeResearchContractV1.model_validate(payload)


def test_unicode_role_slot_ids_match_cross_language_utf8_vectors():
    vectors_path = (
        Path(__file__).parents[2]
        / "fixtures"
        / "scope_research_contract_v1_vectors.json"
    )
    vectors = json.loads(vectors_path.read_text(encoding="utf-8"))["role_slot_vectors"]
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "custom",
        "work_types": ["mixed_custom"],
        "geographies": [],
        "evidence": {
            "mode": "none",
            "grounding_required": False,
            "external_sources_required": False,
            "required_outputs": [],
        },
        "executor_role_slots": [
            {
                "slot_id": vector["slot_id"],
                "role": vector["role"],
                "required": True,
            }
            for vector in vectors
        ],
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(payload)

    contract = ScopeResearchContractV1.model_validate(payload)

    assert [slot.slot_id for slot in contract.executor_role_slots] == [
        vector["slot_id"] for vector in vectors
    ]
    invalid = deepcopy(payload)
    invalid["executor_role_slots"][0]["slot_id"] = vectors[0][
        "casefolded_slot_id"
    ]
    invalid["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(invalid)
    with pytest.raises(ValidationError, match="slot IDs"):
        ScopeResearchContractV1.model_validate(invalid)


def test_grounded_contract_requires_a_bound_geography():
    payload = {
        "version": "axwise_scope_research_contract_v1",
        "document_intent": "product_strategy",
        "work_types": ["research_analysis"],
        "geographies": [],
        "evidence": {
            "mode": "grounded",
            "grounding_required": True,
            "external_sources_required": True,
            "required_outputs": ["market_sources", "research_bundle"],
        },
        "executor_role_slots": [],
    }
    payload["contract_hash"] = ScopeResearchContractV1.canonical_hash_for(
        payload
    )

    with pytest.raises(ValidationError, match="at least one geography"):
        ScopeResearchContractV1.model_validate(payload)


async def test_scope_packet_hash_is_independent_of_optional_jev_configuration(monkeypatch):
    from backend.services.workflow_v2.cognitive import typesafe_triage

    def forbidden_provider(*_args, **_kwargs):
        raise AssertionError("scope packet construction must not call a provider")

    monkeypatch.setattr(typesafe_triage, "classify_intent_with_jev", forbidden_provider)
    request = DecisionCreateRequestV1.model_validate(_commercial_payload())
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    without_key = build_scope_packet(request).model_dump(mode="json")
    monkeypatch.setenv("TYPESAFE_API_KEY", "offline-placeholder")
    with_key = build_scope_packet(request).model_dump(mode="json")

    assert with_key == without_key
    assert with_key["research_contract"]["document_intent"] == "commercial_market_launch"
    # Real serialization catches an unawaited classifier escaping into the hash.
    assert json.loads(json.dumps(with_key)) == with_key
