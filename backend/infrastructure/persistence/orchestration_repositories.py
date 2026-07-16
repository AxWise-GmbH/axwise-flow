"""Tenant-scoped persistence for immutable orchestration decisions."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from backend.models import OrchestrationDecisionSnapshot, OrchestrationEvent


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
