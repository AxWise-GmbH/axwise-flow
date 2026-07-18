"""Idempotent, tenant-isolated ingestion of orchestration execution outcomes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from backend.domain.orchestration.models import (
    ExecutionOutcomeRecordV1,
    ExecutionOutcomeV1,
    OrchestrationDecisionRecordV1,
    OutcomeEvaluationV1,
)
from backend.domain.orchestration.ports import DecisionStore, OutcomeStore
from backend.models import OrchestrationExecutionReceipt, OrchestrationOutcome


PARTNER_ID = "orqaly"
EVALUATION_VERSION = "outcome-evaluator-v1.0.0"


class OutcomeConflict(ValueError):
    """Raised when an outcome violates idempotency or decision linkage."""


class OutcomeValidationError(ValueError):
    """Raised when an outcome is not valid for the immutable decision snapshot."""


def _canonical_hash(outcome: ExecutionOutcomeV1) -> str:
    payload = outcome.model_dump(mode="json", exclude_none=False)
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


class OutcomeEvaluationService:
    """Deterministically derives comparable metrics while preserving raw inputs."""

    version = EVALUATION_VERSION

    @staticmethod
    def _delta(actual: float | int | None, expected: float | int | None) -> float | None:
        if actual is None or expected is None or expected <= 0:
            return None
        return round((actual - expected) / expected, 6)

    def evaluate(
        self,
        outcome: ExecutionOutcomeV1,
        decision: OrchestrationDecisionRecordV1,
    ) -> OutcomeEvaluationV1:
        expected_cost = decision.execution_plan.total_estimated_cost
        expected_currency = (
            decision.input_snapshot.planning.total_budget.currency
            if decision.input_snapshot.planning
            and decision.input_snapshot.planning.total_budget
            else decision.input_snapshot.budget.currency
        )
        currency_matches = outcome.currency == expected_currency
        expected_latency = decision.execution_plan.critical_path_latency_ms
        cost_delta = (
            self._delta(outcome.cost, expected_cost)
            if currency_matches
            else None
        )
        latency_delta = self._delta(outcome.latency_ms, expected_latency)
        failed_receipt = any(
            receipt.status
            in {"failed", "cancelled", "escalated", "approval_rejected"}
            for receipt in outcome.node_receipts
        )
        receipt_override = any(
            receipt.human_override for receipt in outcome.node_receipts
        )
        low_receipt_quality = any(
            receipt.quality_score is not None and receipt.quality_score < 0.65
            for receipt in outcome.node_receipts
        )
        low_receipt_acceptance = any(
            receipt.stakeholder_acceptance is not None
            and receipt.stakeholder_acceptance < 0.65
            for receipt in outcome.node_receipts
        )
        inferred_success = (
            outcome.execution_status == "completed"
            and outcome.authorization_status == "approved"
            and not failed_receipt
        )
        task_success = (
            outcome.task_success
            if outcome.task_success is not None
            else inferred_success
        )
        quality = outcome.quality_score
        acceptance = outcome.stakeholder_acceptance

        # Weighted, bounded score. Missing subjective metrics remain neutral rather
        # than being silently treated as perfect observations.
        normalized = 0.45 if task_success else 0.0
        normalized += 0.25 * (quality if quality is not None else 0.5)
        normalized += 0.20 * (acceptance if acceptance is not None else 0.5)
        normalized += 0.10 if outcome.execution_status == "completed" else 0.0
        normalized -= min(0.20, outcome.rework_count * 0.05)
        normalized -= min(0.20, outcome.escalation_count * 0.10)
        normalized -= 0.10 if outcome.human_override else 0.0
        normalized -= 0.20 if failed_receipt else 0.0
        normalized -= 0.10 if receipt_override else 0.0
        normalized -= 0.20 if outcome.authorization_status != "approved" else 0.0
        normalized = round(max(0.0, min(1.0, normalized)), 6)

        flags: list[str] = []
        if outcome.authorization_status != "approved":
            flags.append("authorization_not_fully_approved")
        if not currency_matches:
            flags.append("currency_mismatch")
        if outcome.execution_status != "completed":
            flags.append(f"execution_{outcome.execution_status}")
        if quality is not None and quality < 0.65:
            flags.append("low_quality")
        if acceptance is not None and acceptance < 0.65:
            flags.append("low_stakeholder_acceptance")
        if cost_delta is not None and cost_delta > 0.25:
            flags.append("material_cost_overrun")
        if latency_delta is not None and latency_delta > 0.50:
            flags.append("material_latency_overrun")
        if outcome.rework_count:
            flags.append("rework_observed")
        if outcome.escalation_count:
            flags.append("escalation_observed")
        if outcome.human_override:
            flags.append("human_override")
        if receipt_override:
            flags.append("node_human_override")
        if low_receipt_quality:
            flags.append("low_node_quality")
        if low_receipt_acceptance:
            flags.append("low_node_stakeholder_acceptance")
        if any(receipt.status in {"failed", "approval_rejected"} for receipt in outcome.node_receipts):
            flags.append("node_failure_observed")

        promotable = (
            task_success
            and outcome.authorization_status == "approved"
            and outcome.execution_status == "completed"
            and currency_matches
            and not outcome.human_override
            and not failed_receipt
            and not receipt_override
            and not low_receipt_quality
            and not low_receipt_acceptance
            and (quality is None or quality >= 0.65)
            and (acceptance is None or acceptance >= 0.65)
            and (cost_delta is None or cost_delta <= 0.25)
            and (latency_delta is None or latency_delta <= 0.50)
            and not any(receipt.status == "approval_rejected" for receipt in outcome.node_receipts)
        )
        return OutcomeEvaluationV1(
            evaluation_version=self.version,
            normalized_success=normalized,
            task_success=task_success,
            quality_score=quality,
            stakeholder_acceptance=acceptance,
            expected_cost=expected_cost,
            expected_currency=expected_currency,
            currency_matches=currency_matches,
            cost_delta_ratio=cost_delta,
            expected_latency_ms=expected_latency,
            latency_delta_ratio=latency_delta,
            safety_flags=list(dict.fromkeys(flags)),
            promotable_observation=promotable,
        )


class OrchestrationOutcomeService:
    def __init__(
        self,
        decision_store: DecisionStore,
        outcome_store: OutcomeStore,
        evaluator: OutcomeEvaluationService | None = None,
    ):
        self.decision_store = decision_store
        self.outcome_store = outcome_store
        self.evaluator = evaluator or OutcomeEvaluationService()

    @staticmethod
    def _decision_record(row) -> OrchestrationDecisionRecordV1:
        return OrchestrationDecisionRecordV1.model_validate(
            {
                **row.decision_payload,
                "input_snapshot": row.input_snapshot,
                "request_hash": row.request_hash,
                "reused": False,
            }
        )

    @staticmethod
    def _record(row, reused: bool = False) -> ExecutionOutcomeRecordV1:
        return ExecutionOutcomeRecordV1(
            outcome=ExecutionOutcomeV1.model_validate(row.outcome_payload),
            evaluation=OutcomeEvaluationV1.model_validate(row.evaluation_payload),
            scorer_version=row.scorer_version,
            received_at=row.received_at,
            request_hash=row.request_hash,
            reused=reused,
        )

    @staticmethod
    def _validate_receipts(
        outcome: ExecutionOutcomeV1,
        decision: OrchestrationDecisionRecordV1,
    ) -> None:
        nodes = {node.node_id: node for node in decision.execution_plan.nodes}
        for receipt in outcome.node_receipts:
            node = nodes.get(receipt.node_id)
            if node is None:
                raise OutcomeValidationError(
                    f"receipt {receipt.receipt_id} references unknown plan node {receipt.node_id}"
                )
            allowed_agents = {node.assigned_agent_id, node.reviewer_agent_id} - {None}
            if receipt.agent_id and receipt.agent_id not in allowed_agents:
                if not receipt.human_override:
                    raise OutcomeValidationError(
                        f"receipt {receipt.receipt_id} agent is not assigned to node {receipt.node_id}"
                    )
            if receipt.currency != outcome.currency:
                raise OutcomeValidationError(
                    f"receipt {receipt.receipt_id} currency does not match its outcome"
                )

    def ingest(
        self,
        decision_id: str,
        outcome: ExecutionOutcomeV1,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
        idempotency_key: str,
    ) -> ExecutionOutcomeRecordV1:
        if outcome.decision_id != decision_id:
            raise OutcomeValidationError("outcome decision_id does not match the path")
        request_hash = _canonical_hash(outcome)
        existing = self.outcome_store.find_by_idempotency(
            PARTNER_ID,
            external_org_id,
            external_user_id,
            idempotency_key,
        )
        if existing:
            if existing.request_hash != request_hash:
                raise OutcomeConflict(
                    "Idempotency key was reused with a different outcome"
                )
            return self._record(existing, reused=True)

        decision_row = self.decision_store.get_for_tenant(
            decision_id,
            external_org_id,
            external_user_id,
            user_id,
        )
        if not decision_row:
            raise OutcomeValidationError("orchestration decision was not found")
        decision = self._decision_record(decision_row)
        self._validate_receipts(outcome, decision)
        evaluation = self.evaluator.evaluate(outcome, decision)
        received_at = datetime.now(timezone.utc)
        row = OrchestrationOutcome(
            outcome_id=outcome.outcome_id,
            decision_id=decision_id,
            partner_id=PARTNER_ID,
            external_org_id=external_org_id,
            external_user_id=external_user_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            contract_version=outcome.contract_version,
            scorer_version=decision.scorer_version,
            outcome_payload=outcome.model_dump(mode="json", exclude_none=False),
            evaluation_payload=evaluation.model_dump(mode="json", exclude_none=False),
            authorization_status=outcome.authorization_status,
            execution_status=outcome.execution_status,
            normalized_success=evaluation.normalized_success,
            quality_score=outcome.quality_score,
            stakeholder_acceptance=outcome.stakeholder_acceptance,
            cost=outcome.cost,
            latency_ms=outcome.latency_ms,
            rework_count=outcome.rework_count,
            escalation_count=outcome.escalation_count,
            human_override=outcome.human_override,
            received_at=received_at,
        )
        receipts = [
            OrchestrationExecutionReceipt(
                receipt_id=receipt.receipt_id,
                outcome_id=outcome.outcome_id,
                decision_id=decision_id,
                external_org_id=external_org_id,
                external_user_id=external_user_id,
                user_id=user_id,
                node_id=receipt.node_id,
                agent_id=receipt.agent_id,
                attempt=receipt.attempt,
                status=receipt.status,
                receipt_payload=receipt.model_dump(mode="json", exclude_none=False),
                created_at=received_at,
            )
            for receipt in outcome.node_receipts
        ]
        try:
            self.outcome_store.add(row, receipts)
        except IntegrityError:
            self.outcome_store.rollback()
            existing = self.outcome_store.find_by_idempotency(
                PARTNER_ID,
                external_org_id,
                external_user_id,
                idempotency_key,
            )
            if existing and existing.request_hash == request_hash:
                return self._record(existing, reused=True)
            raise OutcomeConflict("outcome or receipt identifier already exists")
        return self._record(row)

    def list_for_decision(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> list[ExecutionOutcomeRecordV1]:
        decision = self.decision_store.get_for_tenant(
            decision_id,
            external_org_id,
            external_user_id,
            user_id,
        )
        if not decision:
            raise OutcomeValidationError("orchestration decision was not found")
        return [
            self._record(row)
            for row in self.outcome_store.list_for_decision(
                decision_id,
                external_org_id,
                external_user_id,
                user_id,
            )
        ]
