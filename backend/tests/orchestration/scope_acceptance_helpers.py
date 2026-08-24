"""Deterministic owner-acceptance fixtures for scope-first orchestration tests."""

from __future__ import annotations

from uuid import NAMESPACE_URL, uuid5

from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.domain.orchestration.scope_models import (
    ScopeResearchAcceptanceBindingV1,
    ScopeStateV1,
)
from backend.services.orchestration.scope_contract_service import (
    build_scope_packet,
    ensure_scope_packet,
    research_execution_inputs_hash,
)


def accept_scope(
    request: DecisionCreateRequestV1,
    proposal_decision_id: str,
    *,
    execution_inputs_hash: str | None = None,
) -> DecisionCreateRequestV1:
    """Pin and accept exactly the proposal represented by ``request``."""

    packet = build_scope_packet(request)
    if packet.research_contract is None:
        raise AssertionError("proposal fixture must contain a research contract")
    state = request.scope_state or ScopeStateV1()
    state = state.model_copy(
        update={
            "admission": packet.admission,
            "deliverable": packet.deliverable,
            "research_contract": packet.research_contract,
        }
    )
    policy = request.research_policy.model_copy(
        update={
            "required_outputs": list(
                packet.research_contract.evidence.required_outputs
            ),
        }
    )
    accepted = request.model_copy(
        update={
            "upstream_decision_id": proposal_decision_id,
            "research_policy": policy,
            "scope_state": state,
            "scope_packet": None,
            "scope_research_acceptance": None,
        }
    )
    accepted = ensure_scope_packet(accepted)
    if accepted.scope_packet != packet:
        raise AssertionError("accepted scope must reproduce the proposal packet exactly")
    projection_hash = execution_inputs_hash or research_execution_inputs_hash(
        request,
        packet,
    )
    if projection_hash != research_execution_inputs_hash(accepted, packet):
        raise AssertionError("proposal and accepted execution inputs must hash equally")
    payload = {
        "version": "orqaly_scope_research_acceptance_v1",
        "org_id": request.tenant.org_id,
        "user_id": request.tenant.user_id,
        "goal_id": request.task.task_id,
        "proposal_decision_id": proposal_decision_id,
        "scope_hash": packet.scope_hash,
        "contract_hash": packet.research_contract.contract_hash,
        "execution_inputs_hash": projection_hash,
        "acceptance_id": str(
            uuid5(NAMESPACE_URL, f"axwise-test-scope-acceptance:{proposal_decision_id}")
        ),
        "accepted_at": "2026-08-24T12:00:00.000Z",
        "accepted_by_user_id": request.tenant.user_id,
    }
    payload["binding_hash"] = ScopeResearchAcceptanceBindingV1.canonical_hash_for(
        payload
    )
    acceptance = ScopeResearchAcceptanceBindingV1.model_validate(payload)
    return accepted.model_copy(update={"scope_research_acceptance": acceptance})


__all__ = ["accept_scope"]
