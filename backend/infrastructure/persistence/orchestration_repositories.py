"""Tenant-scoped persistence for immutable orchestration decisions."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationEvent,
    OrchestrationExecutionReceipt,
    OrchestrationOutcome,
)


class SqlAlchemyDecisionStore:
    def __init__(self, session: Session):
        self.session = session

    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Optional[OrchestrationDecisionSnapshot]:
        return (
            self.session.query(OrchestrationDecisionSnapshot)
            .filter(
                OrchestrationDecisionSnapshot.partner_id == partner_id,
                OrchestrationDecisionSnapshot.external_org_id == external_org_id,
                OrchestrationDecisionSnapshot.external_user_id == external_user_id,
                OrchestrationDecisionSnapshot.idempotency_key == idempotency_key,
                OrchestrationDecisionSnapshot.deleted_at.is_(None),
            )
            .first()
        )

    def get_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationDecisionSnapshot]:
        return (
            self.session.query(OrchestrationDecisionSnapshot)
            .filter(
                OrchestrationDecisionSnapshot.decision_id == decision_id,
                OrchestrationDecisionSnapshot.external_org_id == external_org_id,
                OrchestrationDecisionSnapshot.external_user_id == external_user_id,
                OrchestrationDecisionSnapshot.user_id == user_id,
                OrchestrationDecisionSnapshot.deleted_at.is_(None),
            )
            .first()
        )

    def add(self, record: OrchestrationDecisionSnapshot) -> None:
        self.session.add(record)
        self.session.add(
            OrchestrationEvent(
                event_id=f"event-{uuid.uuid4()}",
                decision_id=record.decision_id,
                external_org_id=record.external_org_id,
                user_id=record.user_id,
                event_type="decision.created",
                event_payload={
                    "request_id": record.request_id,
                    "request_hash": record.request_hash,
                    "contract_version": record.contract_version,
                    "scorer_version": record.scorer_version,
                    "routing_mode": record.routing_mode,
                    "parent_decision_id": record.parent_decision_id,
                },
                created_at=record.created_at,
            )
        )
        self.session.commit()
        self.session.refresh(record)

    def rollback(self) -> None:
        self.session.rollback()


class SqlAlchemyOutcomeStore:
    """Atomic outcome, node-receipt, and audit-event persistence."""

    def __init__(self, session: Session):
        self.session = session

    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Optional[OrchestrationOutcome]:
        return (
            self.session.query(OrchestrationOutcome)
            .filter(
                OrchestrationOutcome.partner_id == partner_id,
                OrchestrationOutcome.external_org_id == external_org_id,
                OrchestrationOutcome.external_user_id == external_user_id,
                OrchestrationOutcome.idempotency_key == idempotency_key,
            )
            .first()
        )

    def get_for_tenant(
        self,
        outcome_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationOutcome]:
        return (
            self.session.query(OrchestrationOutcome)
            .filter(
                OrchestrationOutcome.outcome_id == outcome_id,
                OrchestrationOutcome.external_org_id == external_org_id,
                OrchestrationOutcome.external_user_id == external_user_id,
                OrchestrationOutcome.user_id == user_id,
            )
            .first()
        )

    def list_for_decision(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> list[OrchestrationOutcome]:
        return (
            self.session.query(OrchestrationOutcome)
            .filter(
                OrchestrationOutcome.decision_id == decision_id,
                OrchestrationOutcome.external_org_id == external_org_id,
                OrchestrationOutcome.external_user_id == external_user_id,
                OrchestrationOutcome.user_id == user_id,
            )
            .order_by(OrchestrationOutcome.received_at.asc())
            .all()
        )

    def add(
        self,
        outcome: OrchestrationOutcome,
        receipts: list[OrchestrationExecutionReceipt],
    ) -> None:
        self.session.add(outcome)
        self.session.add_all(receipts)
        self.session.add(
            OrchestrationEvent(
                event_id=f"event-{uuid.uuid4()}",
                decision_id=outcome.decision_id,
                external_org_id=outcome.external_org_id,
                user_id=outcome.user_id,
                event_type="outcome.received",
                event_payload={
                    "outcome_id": outcome.outcome_id,
                    "request_hash": outcome.request_hash,
                    "scorer_version": outcome.scorer_version,
                    "execution_status": outcome.execution_status,
                    "normalized_success": outcome.normalized_success,
                    "receipt_count": len(receipts),
                },
                created_at=outcome.received_at,
            )
        )
        self.session.commit()
        self.session.refresh(outcome)

    def rollback(self) -> None:
        self.session.rollback()
