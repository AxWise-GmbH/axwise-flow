from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace

import pytest

from backend.domain.agentic import (
    DescriptorVersionRefV1,
    DispatchReceiptV1,
    DispatchStatus,
    EffectOutcome,
    ExecutorBindingVersionRefV1,
    ExternalObjectReferenceV1,
    GatewayEffectAttestationV1,
    ObservedCostV1,
)
from backend.services.orchestration.agentic_outcome_adapter import (
    AgenticOutcomeAdapterError,
    OrchestrationOutcomeProjectionV1,
    VerifiedGatewayEffectV1,
    adapt_verified_terminal_dispatch_receipt,
)
from backend.services.orchestration.outcome_service import OutcomeEvaluationService


pytestmark = [pytest.mark.contract, pytest.mark.unit]
NOW = datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc)
HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
HASH_D = "d" * 64
HASH_E = "e" * 64


def descriptor_ref(content_hash: str = HASH_A) -> DescriptorVersionRefV1:
    return DescriptorVersionRefV1(
        descriptor_key="universal_operation_v1",
        schema_version="1.0",
        content_hash=content_hash,
    )


def binding_ref(content_hash: str = HASH_B) -> ExecutorBindingVersionRefV1:
    return ExecutorBindingVersionRefV1(
        binding_key="bounded_executor",
        binding_version="1.0",
        content_hash=content_hash,
    )


def gateway_attestation(
    *,
    outcome: EffectOutcome = EffectOutcome.SUCCEEDED,
    observed_cost: ObservedCostV1 | None = None,
) -> GatewayEffectAttestationV1:
    return GatewayEffectAttestationV1(
        org_id="org-1",
        workspace_id="workspace-1",
        run_id="run-1",
        step_id="step-1",
        effect_id="effect-1",
        attempt_id="attempt-1",
        descriptor=descriptor_ref(),
        canonical_input_hash=HASH_C,
        precondition_hash=HASH_D,
        outcome=outcome,
        external_references=(
            ExternalObjectReferenceV1(
                reference_type="provider_message",
                reference_value="message-123",
            ),
            ExternalObjectReferenceV1(
                reference_type="provider_audit",
                reference_value="audit-456",
            ),
        ),
        output_hash=HASH_E if outcome == EffectOutcome.SUCCEEDED else None,
        observed_cost=observed_cost,
        observed_at=NOW + timedelta(seconds=6),
        receipt_hash=HASH_E,
        signature_key_id="gateway_key_1",
        signature="abcdefghijklmnop",
    )


def dispatch_receipt(
    *,
    status: DispatchStatus = DispatchStatus.SUCCEEDED,
    attestation: GatewayEffectAttestationV1 | None = None,
) -> DispatchReceiptV1:
    attestation = attestation or gateway_attestation()
    payload = {
        "org_id": "org-1",
        "workspace_id": "workspace-1",
        "run_id": "run-1",
        "step_id": "step-1",
        "attempt_id": "attempt-1",
        "descriptor": descriptor_ref(),
        "executor_binding": binding_ref(),
        "status": status,
        "observed_at": NOW + timedelta(seconds=7),
        "executor_reference": "executor-run-1",
        "effect_id": "effect-1",
        "gateway_effect_attestation": attestation,
    }
    if status == DispatchStatus.FAILED:
        payload.update(
            error_code="provider_rejected_operation",
            sanitized_error="Provider rejected the bounded operation",
        )
    return DispatchReceiptV1.model_validate(payload)


def verified_effect(receipt: DispatchReceiptV1) -> VerifiedGatewayEffectV1:
    assert receipt.gateway_effect_attestation is not None
    return VerifiedGatewayEffectV1(
        attestation=receipt.gateway_effect_attestation,
        verified_receipt_hash=receipt.gateway_effect_attestation.receipt_hash,
        verified_signature_key_id=(receipt.gateway_effect_attestation.signature_key_id),
        org_id=receipt.org_id,
        workspace_id=receipt.workspace_id,
        run_id=receipt.run_id,
        step_id=receipt.step_id,
        attempt_id=receipt.attempt_id,
        effect_id=receipt.effect_id or "",
        descriptor=receipt.descriptor,
        executor_binding=receipt.executor_binding,
        canonical_input_hash=(receipt.gateway_effect_attestation.canonical_input_hash),
    )


def projection(**changes) -> OrchestrationOutcomeProjectionV1:
    values = {
        "outcome_id": "outcome-1",
        "decision_id": "decision-1",
        "node_id": "node-1",
        "node_attempt": 1,
        "agent_id": "agent-1",
        "authorization_status": "approved",
        "execution_status": "completed",
        "task_success": True,
        "run_terminal": True,
        "fallback_currency": "EUR",
        "started_at": NOW,
        "observed_cost_minor_unit_exponent": 2,
        "failure_type": None,
    }
    values.update(changes)
    return OrchestrationOutcomeProjectionV1(**values)


def evaluation_decision(
    *,
    cost: float | None,
    latency_ms: int,
    currency: str = "EUR",
) -> SimpleNamespace:
    return SimpleNamespace(
        execution_plan=SimpleNamespace(
            total_estimated_cost=cost,
            critical_path_latency_ms=latency_ms,
        ),
        input_snapshot=SimpleNamespace(
            planning=None,
            budget=SimpleNamespace(currency=currency),
        ),
    )


def test_success_projection_preserves_gateway_evidence_and_is_evaluator_compatible():
    receipt = dispatch_receipt(
        attestation=gateway_attestation(
            observed_cost=ObservedCostV1(amount_minor=12_345, currency="EUR")
        )
    )

    outcome = adapt_verified_terminal_dispatch_receipt(
        receipt,
        verified=verified_effect(receipt),
        projection=projection(),
    )

    assert outcome.authorization_status == "approved"
    assert outcome.execution_status == "completed"
    assert outcome.task_success is True
    assert outcome.cost == 123.45
    assert outcome.currency == "EUR"
    assert outcome.latency_ms == 7_000
    assert len(outcome.node_receipts) == 1
    node = outcome.node_receipts[0]
    assert node.receipt_id == f"agentic-{HASH_E}"
    assert node.node_id == "node-1"
    assert node.status == "completed"
    assert node.cost == 123.45

    prefix, encoded_evidence = node.notes[0].split(":", 1)
    assert prefix == "agentic_gateway_effect_evidence_v1"
    evidence = json.loads(encoded_evidence)
    dispatch = evidence["dispatch_receipt"]
    gateway = dispatch["gateway_effect_attestation"]
    assert evidence["verification"] == {
        "receipt_hash": HASH_E,
        "signature_key_id": "gateway_key_1",
    }
    assert evidence["observed_cost_minor_unit_exponent"] == 2
    assert gateway["receipt_hash"] == HASH_E
    assert gateway["canonical_input_hash"] == HASH_C
    assert gateway["precondition_hash"] == HASH_D
    assert gateway["output_hash"] == HASH_E
    assert gateway["observed_cost"] == {
        "amount_minor": 12_345,
        "currency": "EUR",
    }
    assert gateway["external_references"] == [
        {
            "reference_type": "provider_message",
            "reference_value": "message-123",
        },
        {
            "reference_type": "provider_audit",
            "reference_value": "audit-456",
        },
    ]

    evaluation = OutcomeEvaluationService().evaluate(
        outcome,
        evaluation_decision(cost=123.45, latency_ms=7_000),
    )
    assert evaluation.promotable_observation is True
    assert evaluation.safety_flags == []


def test_gateway_success_never_upgrades_authorization():
    receipt = dispatch_receipt(
        attestation=gateway_attestation(
            observed_cost=ObservedCostV1(amount_minor=100, currency="EUR")
        )
    )

    outcome = adapt_verified_terminal_dispatch_receipt(
        receipt,
        verified=verified_effect(receipt),
        projection=projection(authorization_status="rejected"),
    )

    assert outcome.authorization_status == "rejected"
    evaluation = OutcomeEvaluationService().evaluate(
        outcome,
        evaluation_decision(cost=1.0, latency_ms=7_000),
    )
    assert evaluation.promotable_observation is False
    assert "authorization_not_fully_approved" in evaluation.safety_flags


def test_known_not_applied_effect_becomes_failed_node_and_preserves_error():
    receipt = dispatch_receipt(
        status=DispatchStatus.FAILED,
        attestation=gateway_attestation(
            outcome=EffectOutcome.NOT_APPLIED,
            observed_cost=ObservedCostV1(amount_minor=0, currency="EUR"),
        ),
    )

    outcome = adapt_verified_terminal_dispatch_receipt(
        receipt,
        verified=verified_effect(receipt),
        projection=projection(
            execution_status="failed",
            task_success=False,
        ),
    )

    assert outcome.execution_status == "failed"
    assert outcome.task_success is False
    assert outcome.failure_type == "tool_failure"
    assert outcome.node_receipts[0].status == "failed"
    assert outcome.node_receipts[0].failure_type == "gateway_effect_not_applied"
    evidence = json.loads(outcome.node_receipts[0].notes[0].split(":", 1)[1])
    assert evidence["dispatch_receipt"]["error_code"] == ("provider_rejected_operation")
    assert (
        evidence["dispatch_receipt"]["gateway_effect_attestation"]["outcome"]
        == "not_applied"
    )

    evaluation = OutcomeEvaluationService().evaluate(
        outcome,
        evaluation_decision(cost=0.0, latency_ms=7_000),
    )
    assert evaluation.promotable_observation is False
    assert "node_failure_observed" in evaluation.safety_flags


def test_nonterminal_and_unknown_effect_receipts_are_rejected():
    accepted = DispatchReceiptV1(
        org_id="org-1",
        workspace_id="workspace-1",
        run_id="run-1",
        step_id="step-1",
        attempt_id="attempt-1",
        descriptor=descriptor_ref(),
        executor_binding=binding_ref(),
        status=DispatchStatus.ACCEPTED,
        observed_at=NOW + timedelta(seconds=1),
        executor_reference="executor-run-1",
        effect_id="effect-1",
    )
    success = dispatch_receipt()
    with pytest.raises(AgenticOutcomeAdapterError, match="nonterminal"):
        adapt_verified_terminal_dispatch_receipt(
            accepted,
            verified=verified_effect(success),
            projection=projection(),
        )

    unknown = dispatch_receipt(
        status=DispatchStatus.OUTCOME_UNKNOWN,
        attestation=gateway_attestation(outcome=EffectOutcome.OUTCOME_UNKNOWN),
    )
    with pytest.raises(AgenticOutcomeAdapterError, match="unknown external effect"):
        adapt_verified_terminal_dispatch_receipt(
            unknown,
            verified=verified_effect(unknown),
            projection=projection(),
        )


def test_tampered_or_wrongly_bound_verified_evidence_is_rejected():
    receipt = dispatch_receipt()
    verified = verified_effect(receipt)

    tampered_receipt = receipt.model_copy(update={"run_id": "run-other"})
    with pytest.raises(AgenticOutcomeAdapterError, match="dispatch run_id"):
        adapt_verified_terminal_dispatch_receipt(
            tampered_receipt,
            verified=verified,
            projection=projection(),
        )

    with pytest.raises(AgenticOutcomeAdapterError, match="receipt hash"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=replace(verified, verified_receipt_hash=HASH_A),
            projection=projection(),
        )

    with pytest.raises(AgenticOutcomeAdapterError, match="executor binding"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=replace(verified, executor_binding=binding_ref(HASH_C)),
            projection=projection(),
        )

    wrong_attestation = verified.attestation.model_copy(
        update={"effect_id": "effect-other"}
    )
    with pytest.raises(AgenticOutcomeAdapterError, match="does not match the dispatch"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=replace(verified, attestation=wrong_attestation),
            projection=projection(),
        )


def test_projection_requires_terminal_run_and_consistent_time_and_cost_scale():
    receipt = dispatch_receipt(
        attestation=gateway_attestation(
            observed_cost=ObservedCostV1(amount_minor=100, currency="EUR")
        )
    )
    verified = verified_effect(receipt)

    with pytest.raises(AgenticOutcomeAdapterError, match="whole run must be terminal"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=verified,
            projection=projection(run_terminal=False),
        )

    with pytest.raises(AgenticOutcomeAdapterError, match="minor-unit exponent"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=verified,
            projection=projection(observed_cost_minor_unit_exponent=None),
        )

    with pytest.raises(AgenticOutcomeAdapterError, match="trusted run start"):
        adapt_verified_terminal_dispatch_receipt(
            receipt,
            verified=verified,
            projection=projection(started_at=NOW + timedelta(seconds=8)),
        )
