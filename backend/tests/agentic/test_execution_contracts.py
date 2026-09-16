from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from backend.domain.agentic import (
    DescriptorVersionRefV1,
    DispatchReceiptV1,
    DispatchStatus,
    EffectExternality,
    EffectOutcome,
    EffectProfileV1,
    EffectTargetV1,
    ExecutionEnvelopeV1,
    ExecutionLimitsV1,
    ExecutorBindingVersionRefV1,
    GatewayEffectAttestationV1,
    MutationKind,
    PersonaVersionRefV1,
    StepKind,
    canonical_json_sha256,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]
NOW = datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc)
HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
HASH_D = "d" * 64


def descriptor_ref() -> DescriptorVersionRefV1:
    return DescriptorVersionRefV1(
        descriptor_key="universal_operation_v1",
        schema_version="1.0",
        content_hash=HASH_A,
    )


def binding_ref() -> ExecutorBindingVersionRefV1:
    return ExecutorBindingVersionRefV1(
        binding_key="bounded_executor",
        binding_version="1.0",
        content_hash=HASH_B,
    )


def envelope_payload() -> dict:
    canonical_input = {"objective": "Prepare a private draft", "revision": 1}
    return {
        "org_id": "org-1",
        "workspace_id": "workspace-1",
        "principal_id": "principal-1",
        "agent_id": "agent-1",
        "persona_version": PersonaVersionRefV1(
            persona_id="persona-1",
            persona_version="1.0",
            content_hash=HASH_C,
        ),
        "run_id": "run-1",
        "step_id": "step-1",
        "attempt_id": "attempt-1",
        "step_kind": StepKind.REASON,
        "descriptor": descriptor_ref(),
        "executor_binding": binding_ref(),
        "canonical_input": canonical_input,
        "canonical_input_hash": canonical_json_sha256(canonical_input),
        "effect_profile": EffectProfileV1(),
        "limits": ExecutionLimitsV1(
            maximum_turns=4,
            maximum_tokens=8_000,
            maximum_tool_calls=2,
            maximum_runtime_seconds=120,
            maximum_attempts=1,
            maximum_cost_minor=0,
            currency="EUR",
        ),
        "issued_at": NOW,
        "deadline": NOW + timedelta(minutes=2),
        "callback_reference": "callback-1",
        "policy_digest": HASH_D,
    }


def test_private_execution_envelope_is_hash_bound_and_has_no_external_authority():
    envelope = ExecutionEnvelopeV1.model_validate(envelope_payload())

    assert envelope.version == "orqaly_execution_envelope_v1"
    assert envelope.canonicalization == "rfc8785_v1"
    assert envelope.effect_id is None
    assert envelope.connection_references == ()
    with pytest.raises(ValidationError, match="canonical_input_hash"):
        ExecutionEnvelopeV1.model_validate(
            {**envelope_payload(), "canonical_input_hash": HASH_A}
        )


def test_non_external_envelope_rejects_external_authority_fields():
    with pytest.raises(ValidationError, match="external authority fields"):
        ExecutionEnvelopeV1.model_validate(
            {**envelope_payload(), "grant_reference": "grant-1"}
        )


def write_envelope_payload() -> dict:
    payload = envelope_payload()
    payload.update(
        {
            "step_kind": StepKind.CONNECTOR_WRITE,
            "effect_profile": EffectProfileV1(
                externality=EffectExternality.WRITE,
                mutation=MutationKind.UPDATE,
            ),
            "effect_id": "effect-1",
            "targets": (
                EffectTargetV1(
                    target_type="business_record",
                    target_reference="record-1",
                ),
            ),
            "connection_references": ("connection-1",),
            "grant_reference": "grant-1",
            "action_intent_id": "action-intent-1",
            "action_intent_hash": HASH_C,
            "approval_binding_hash": HASH_D,
            "idempotency_scope": "logical_effect",
            "idempotency_key": "idempotency-1",
        }
    )
    return payload


def test_write_envelope_requires_effect_target_and_opaque_grant():
    envelope = ExecutionEnvelopeV1.model_validate(write_envelope_payload())
    assert envelope.effect_id == "effect-1"

    for field, message in (
        ("effect_id", "requires effect_id"),
        ("targets", "requires at least one target"),
        ("grant_reference", "requires an opaque grant"),
        ("action_intent_id", "immutable action intent"),
        ("approval_binding_hash", "exact approval binding"),
        ("idempotency_key", "idempotency binding"),
    ):
        payload = write_envelope_payload()
        payload[field] = () if field == "targets" else None
        if field == "action_intent_id":
            payload["action_intent_hash"] = None
        if field == "idempotency_key":
            payload["idempotency_scope"] = None
        with pytest.raises(ValidationError, match=message):
            ExecutionEnvelopeV1.model_validate(payload)


def test_external_read_requires_action_intent_but_not_human_approval():
    payload = envelope_payload()
    payload.update(
        {
            "step_kind": StepKind.CONNECTOR_READ,
            "effect_profile": EffectProfileV1(
                externality=EffectExternality.READ,
            ),
            "connection_references": ("connection-1",),
        }
    )
    with pytest.raises(ValidationError, match="immutable action intent"):
        ExecutionEnvelopeV1.model_validate(payload)
    payload.update(
        {
            "action_intent_id": "action-intent-1",
            "action_intent_hash": HASH_C,
        }
    )
    assert ExecutionEnvelopeV1.model_validate(payload).approval_binding_hash is None


def attestation(**changes) -> GatewayEffectAttestationV1:
    payload = {
        "org_id": "org-1",
        "workspace_id": "workspace-1",
        "run_id": "run-1",
        "step_id": "step-1",
        "effect_id": "effect-1",
        "attempt_id": "attempt-1",
        "descriptor": descriptor_ref(),
        "canonical_input_hash": envelope_payload()["canonical_input_hash"],
        "outcome": EffectOutcome.SUCCEEDED,
        "observed_at": NOW + timedelta(seconds=5),
        "receipt_hash": HASH_C,
        "signature_key_id": "gateway_key_1",
        "signature": "abcdefghijklmnop",
    }
    payload.update(changes)
    return GatewayEffectAttestationV1.model_validate(payload)


def receipt_payload(**changes) -> dict:
    payload = {
        "org_id": "org-1",
        "workspace_id": "workspace-1",
        "run_id": "run-1",
        "step_id": "step-1",
        "attempt_id": "attempt-1",
        "descriptor": descriptor_ref(),
        "executor_binding": binding_ref(),
        "status": DispatchStatus.SUCCEEDED,
        "observed_at": NOW + timedelta(seconds=6),
        "executor_reference": "execution-1",
        "effect_id": "effect-1",
        "gateway_effect_attestation": attestation(),
    }
    payload.update(changes)
    return payload


def test_terminal_external_receipt_requires_matching_gateway_attestation():
    receipt = DispatchReceiptV1.model_validate(receipt_payload())
    assert receipt.gateway_effect_attestation is not None

    with pytest.raises(ValidationError, match="requires Gateway attestation"):
        DispatchReceiptV1.model_validate(
            receipt_payload(gateway_effect_attestation=None)
        )
    with pytest.raises(ValidationError, match="does not match dispatch identity"):
        DispatchReceiptV1.model_validate(
            receipt_payload(
                gateway_effect_attestation=attestation(workspace_id="workspace-2")
            )
        )
    with pytest.raises(ValidationError, match="outcome does not match"):
        DispatchReceiptV1.model_validate(
            receipt_payload(
                gateway_effect_attestation=attestation(
                    outcome=EffectOutcome.OUTCOME_UNKNOWN
                )
            )
        )


def test_non_effect_success_needs_no_gateway_attestation():
    receipt = DispatchReceiptV1(
        org_id="org-1",
        workspace_id="workspace-1",
        run_id="run-1",
        step_id="step-1",
        attempt_id="attempt-1",
        descriptor=descriptor_ref(),
        executor_binding=binding_ref(),
        status=DispatchStatus.SUCCEEDED,
        observed_at=NOW,
    )

    assert receipt.gateway_effect_attestation is None


def test_nonterminal_executor_status_cannot_claim_gateway_effect_proof():
    with pytest.raises(ValidationError, match="terminal effect status"):
        DispatchReceiptV1.model_validate(receipt_payload(status=DispatchStatus.RUNNING))


def test_naive_envelope_times_are_rejected():
    payload = envelope_payload()
    payload["issued_at"] = datetime(2026, 9, 4, 10, 0)
    with pytest.raises(ValidationError, match="timezone"):
        ExecutionEnvelopeV1.model_validate(payload)
