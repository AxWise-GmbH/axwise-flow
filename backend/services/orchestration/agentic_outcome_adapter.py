"""Pure projection of verified Agent effect evidence into evaluator contracts.

The adapter deliberately does not verify signatures, authorize work, persist data,
or infer a whole-run result from one executor status.  Its inputs carry the
already-verified Gateway binding and the already-decided orchestration outcome.
It only checks that those inputs still describe the same known terminal effect.

The legacy node-receipt contract has no structured evidence field.  The complete
dispatch/Gateway evidence is therefore retained as deterministic JSON in one
versioned node note, including the exact integer observed cost and its explicit
minor-unit exponent.  The numeric ``cost`` projection is only for the existing
evaluator and may have ordinary floating-point precision limits.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import json
import math
import re
from typing import Literal

from backend.domain.agentic.enums import DispatchStatus, EffectOutcome
from backend.domain.agentic.execution import (
    DispatchReceiptV1,
    GatewayEffectAttestationV1,
)
from backend.domain.agentic.references import (
    DescriptorVersionRefV1,
    ExecutorBindingVersionRefV1,
)
from backend.domain.orchestration.models import (
    ExecutionOutcomeV1,
    NodeExecutionReceiptV1,
)


AuthorizationStatus = Literal["approved", "rejected", "partially_approved"]
ExecutionStatus = Literal["completed", "failed", "cancelled", "escalated"]
OutcomeFailureType = Literal[
    "agent_failure",
    "tool_failure",
    "invalid_output",
    "policy_rejection",
    "budget_exceeded",
    "timeout",
    "stakeholder_rejection",
    "cancelled_by_user",
    "unknown",
]

_AUTHORIZATION_STATUSES = {"approved", "rejected", "partially_approved"}
_EXECUTION_STATUSES = {"completed", "failed", "cancelled", "escalated"}
_FAILURE_TYPES = {
    "agent_failure",
    "tool_failure",
    "invalid_output",
    "policy_rejection",
    "budget_exceeded",
    "timeout",
    "stakeholder_rejection",
    "cancelled_by_user",
    "unknown",
}
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_EVIDENCE_NOTE_PREFIX = "agentic_gateway_effect_evidence_v1:"


class AgenticOutcomeAdapterError(ValueError):
    """Raised when evidence cannot be projected without changing its meaning."""


@dataclass(frozen=True, slots=True)
class VerifiedGatewayEffectV1:
    """Identity that an upstream Gateway verifier has authenticated.

    The adapter rechecks every value against both the executor receipt and the
    embedded Gateway attestation.  Creating this value is not signature
    verification; only the trust-boundary verifier should construct it in live
    wiring.
    """

    attestation: GatewayEffectAttestationV1
    verified_receipt_hash: str
    verified_signature_key_id: str
    org_id: str
    workspace_id: str
    run_id: str
    step_id: str
    attempt_id: str
    effect_id: str
    descriptor: DescriptorVersionRefV1
    executor_binding: ExecutorBindingVersionRefV1
    canonical_input_hash: str


@dataclass(frozen=True, slots=True)
class OrchestrationOutcomeProjectionV1:
    """Trusted run-level facts that cannot be learned from a step receipt.

    In particular, ``authorization_status`` and the whole-run result are copied
    from this context.  Gateway success never creates or upgrades authority.
    """

    outcome_id: str
    decision_id: str
    node_id: str
    node_attempt: int
    authorization_status: AuthorizationStatus
    execution_status: ExecutionStatus
    task_success: bool
    run_terminal: bool
    fallback_currency: str
    agent_id: str | None = None
    started_at: datetime | None = None
    observed_cost_minor_unit_exponent: int | None = None
    failure_type: OutcomeFailureType | None = None


def _reject(message: str) -> None:
    raise AgenticOutcomeAdapterError(message)


def _is_aware(value: datetime) -> bool:
    return value.tzinfo is not None and value.utcoffset() is not None


def _validate_projection(projection: OrchestrationOutcomeProjectionV1) -> None:
    if projection.run_terminal is not True:
        _reject("whole run must be terminal before an outcome can be projected")
    if projection.authorization_status not in _AUTHORIZATION_STATUSES:
        _reject("unknown orchestration authorization status")
    if projection.execution_status not in _EXECUTION_STATUSES:
        _reject("unknown orchestration execution status")
    if type(projection.task_success) is not bool:
        _reject("task_success must be an explicit whole-run boolean")
    if projection.task_success and projection.execution_status != "completed":
        _reject("a successful task requires completed whole-run status")
    if projection.failure_type not in _FAILURE_TYPES | {None}:
        _reject("unknown orchestration failure type")
    if not _CURRENCY_RE.fullmatch(projection.fallback_currency):
        _reject("fallback currency must be an uppercase ISO-style code")
    if projection.started_at is not None and not _is_aware(projection.started_at):
        _reject("started_at must be timezone-aware")


def _validate_known_terminal_effect(receipt: DispatchReceiptV1) -> None:
    if receipt.status in {DispatchStatus.ACCEPTED, DispatchStatus.RUNNING}:
        _reject("nonterminal dispatch receipt cannot become an outcome")
    if receipt.status == DispatchStatus.OUTCOME_UNKNOWN:
        _reject("unknown external effect cannot become an outcome")
    if receipt.status not in {DispatchStatus.SUCCEEDED, DispatchStatus.FAILED}:
        _reject("dispatch receipt does not contain a known terminal external effect")


def _validate_verified_binding(
    receipt: DispatchReceiptV1,
    verified: VerifiedGatewayEffectV1,
) -> GatewayEffectAttestationV1:
    attestation = verified.attestation
    if receipt.gateway_effect_attestation is None:
        _reject("terminal external effect is missing its Gateway attestation")
    if receipt.gateway_effect_attestation != attestation:
        _reject("verified Gateway attestation does not match the dispatch receipt")

    receipt_identity = {
        "org_id": receipt.org_id,
        "workspace_id": receipt.workspace_id,
        "run_id": receipt.run_id,
        "step_id": receipt.step_id,
        "attempt_id": receipt.attempt_id,
        "effect_id": receipt.effect_id,
    }
    attested_identity = {
        "org_id": attestation.org_id,
        "workspace_id": attestation.workspace_id,
        "run_id": attestation.run_id,
        "step_id": attestation.step_id,
        "attempt_id": attestation.attempt_id,
        "effect_id": attestation.effect_id,
    }
    expected_identity = {
        "org_id": verified.org_id,
        "workspace_id": verified.workspace_id,
        "run_id": verified.run_id,
        "step_id": verified.step_id,
        "attempt_id": verified.attempt_id,
        "effect_id": verified.effect_id,
    }
    for field, expected in expected_identity.items():
        if receipt_identity[field] != expected:
            _reject(f"dispatch {field} does not match verified effect binding")
        if attested_identity[field] != expected:
            _reject(f"Gateway {field} does not match verified effect binding")

    if receipt.descriptor != verified.descriptor:
        _reject("dispatch descriptor does not match verified effect binding")
    if attestation.descriptor != verified.descriptor:
        _reject("Gateway descriptor does not match verified effect binding")
    if receipt.executor_binding != verified.executor_binding:
        _reject("executor binding does not match verified dispatch binding")
    if attestation.canonical_input_hash != verified.canonical_input_hash:
        _reject("canonical input hash does not match verified effect binding")
    if attestation.receipt_hash != verified.verified_receipt_hash:
        _reject("Gateway receipt hash does not match signature verification result")
    if attestation.signature_key_id != verified.verified_signature_key_id:
        _reject("Gateway signing key does not match signature verification result")

    if attestation.outcome == EffectOutcome.OUTCOME_UNKNOWN:
        _reject("unknown external effect cannot become an outcome")
    allowed_outcomes = {
        DispatchStatus.SUCCEEDED: {EffectOutcome.SUCCEEDED},
        DispatchStatus.FAILED: {EffectOutcome.FAILED, EffectOutcome.NOT_APPLIED},
    }
    if attestation.outcome not in allowed_outcomes[receipt.status]:
        _reject("Gateway outcome does not match terminal dispatch status")

    if not _is_aware(receipt.observed_at) or not _is_aware(attestation.observed_at):
        _reject("effect observation timestamps must be timezone-aware")
    if receipt.observed_at < attestation.observed_at:
        _reject("dispatch observation predates its Gateway effect observation")
    return attestation


def _project_cost(
    attestation: GatewayEffectAttestationV1,
    projection: OrchestrationOutcomeProjectionV1,
) -> tuple[float | None, str]:
    observed = attestation.observed_cost
    exponent = projection.observed_cost_minor_unit_exponent
    if observed is None:
        if exponent is not None:
            _reject("minor-unit exponent is valid only with observed cost")
        return None, projection.fallback_currency
    if exponent is None or not isinstance(exponent, int) or isinstance(exponent, bool):
        _reject("observed cost requires an integer minor-unit exponent")
    if not 0 <= exponent <= 9:
        _reject("observed cost minor-unit exponent must be between 0 and 9")

    try:
        projected = float(Decimal(observed.amount_minor).scaleb(-exponent))
    except (OverflowError, ValueError):
        _reject("observed cost cannot be represented by the outcome contract")
    if not math.isfinite(projected):
        _reject("observed cost cannot be represented by the outcome contract")
    return projected, observed.currency


def _evidence_note(
    receipt: DispatchReceiptV1,
    verified: VerifiedGatewayEffectV1,
    projection: OrchestrationOutcomeProjectionV1,
) -> str:
    payload = {
        "contract_version": "1.0",
        "dispatch_receipt": receipt.model_dump(mode="json", exclude_none=False),
        "verification": {
            "receipt_hash": verified.verified_receipt_hash,
            "signature_key_id": verified.verified_signature_key_id,
        },
        "observed_cost_minor_unit_exponent": (
            projection.observed_cost_minor_unit_exponent
        ),
    }
    return _EVIDENCE_NOTE_PREFIX + json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def adapt_verified_terminal_dispatch_receipt(
    receipt: DispatchReceiptV1,
    *,
    verified: VerifiedGatewayEffectV1,
    projection: OrchestrationOutcomeProjectionV1,
) -> ExecutionOutcomeV1:
    """Translate one verified terminal effect without making trust decisions."""

    _validate_projection(projection)
    _validate_known_terminal_effect(receipt)
    attestation = _validate_verified_binding(receipt, verified)

    if projection.started_at is not None:
        if receipt.observed_at < projection.started_at:
            _reject("terminal receipt predates the trusted run start")
        latency_ms = int(
            (receipt.observed_at - projection.started_at).total_seconds() * 1_000
        )
    else:
        latency_ms = None

    node_completed = receipt.status == DispatchStatus.SUCCEEDED
    if projection.task_success and not node_completed:
        _reject("a failed effect receipt cannot claim whole-task success")

    cost, currency = _project_cost(attestation, projection)
    receipt_id = f"agentic-{attestation.receipt_hash}"
    node_failure_type = None
    if not node_completed:
        node_failure_type = (
            "gateway_effect_not_applied"
            if attestation.outcome == EffectOutcome.NOT_APPLIED
            else "gateway_effect_failed"
        )
    node_receipt = NodeExecutionReceiptV1(
        receipt_id=receipt_id,
        node_id=projection.node_id,
        agent_id=projection.agent_id,
        attempt=projection.node_attempt,
        status="completed" if node_completed else "failed",
        started_at=projection.started_at,
        completed_at=receipt.observed_at,
        cost=cost,
        currency=currency,
        latency_ms=latency_ms,
        failure_type=node_failure_type,
        notes=[_evidence_note(receipt, verified, projection)],
    )

    outcome_failure_type = projection.failure_type
    if projection.execution_status == "failed" and outcome_failure_type is None:
        outcome_failure_type = "tool_failure" if not node_completed else "unknown"
    return ExecutionOutcomeV1(
        outcome_id=projection.outcome_id,
        decision_id=projection.decision_id,
        authorization_status=projection.authorization_status,
        execution_status=projection.execution_status,
        task_success=projection.task_success,
        cost=cost,
        currency=currency,
        latency_ms=latency_ms,
        failure_type=outcome_failure_type,
        completed_at=receipt.observed_at,
        node_receipts=[node_receipt],
        notes=[f"derived_from_verified_gateway_receipt:{attestation.receipt_hash}"],
    )


__all__ = [
    "AgenticOutcomeAdapterError",
    "OrchestrationOutcomeProjectionV1",
    "VerifiedGatewayEffectV1",
    "adapt_verified_terminal_dispatch_receipt",
]
