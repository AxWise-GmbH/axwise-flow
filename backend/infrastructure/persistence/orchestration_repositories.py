"""Tenant-scoped persistence for immutable orchestration decisions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationEvent,
    OrchestrationExecutionReceipt,
    OrchestrationOutcome,
    OrchestrationScopeAcceptance,
    OrchestrationScopeCorrection,
)
from backend.domain.orchestration.scope_models import SCOPE_ACTIVE_REVISION_STATUSES


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

    def lock_for_tenant(
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
            .with_for_update()
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


class SqlAlchemyScopeCorrectionStore:
    """Atomic first-success store for raw semantic correction submissions."""

    def __init__(self, session: Session):
        self.session = session
        # Lease heartbeats may run while the owning worker is blocked in a
        # provider call. Keep only the thread-safe Engine for that narrow CAS;
        # the ORM Session itself is never shared with the heartbeat thread.
        self._lease_bind = session.get_bind()

    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.partner_id == partner_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.idempotency_key == idempotency_key,
            )
            .populate_existing()
            .first()
        )

    def find_by_raw_submission(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
        source_scope_hash: str,
        correction_hash: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.partner_id == partner_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.task_id == task_id,
                OrchestrationScopeCorrection.upstream_decision_id
                == upstream_decision_id,
                OrchestrationScopeCorrection.source_scope_hash == source_scope_hash,
                OrchestrationScopeCorrection.correction_hash == correction_hash,
            )
            .populate_existing()
            .first()
        )

    def get_for_tenant(
        self,
        correction_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.user_id == user_id,
            )
            .populate_existing()
            .first()
        )

    def find_by_clarification_parent(
        self,
        parent_correction_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.parent_correction_id
                == parent_correction_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.user_id == user_id,
            )
            .populate_existing()
            .first()
        )

    def answer_clarification(
        self,
        parent_correction_id: str,
        child: OrchestrationScopeCorrection,
    ) -> bool:
        """Atomically retire the exact question and install its one child head."""

        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id
                == parent_correction_id,
                OrchestrationScopeCorrection.status
                == "needs_material_clarification",
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "clarification_answered",
                    OrchestrationScopeCorrection.updated_at: datetime.now(timezone.utc),
                },
                synchronize_session=False,
            )
        )
        if updated != 1:
            self.session.rollback()
            return False
        self.session.add(child)
        self.session.commit()
        self.session.refresh(child)
        return True

    def find_latest_successful(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.partner_id == partner_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.task_id == task_id,
                OrchestrationScopeCorrection.upstream_decision_id
                == upstream_decision_id,
                OrchestrationScopeCorrection.status.in_(["compiled", "accepted"]),
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
            )
            .order_by(
                OrchestrationScopeCorrection.source_scope_generation.desc(),
                OrchestrationScopeCorrection.created_at.desc(),
                OrchestrationScopeCorrection.id.desc(),
            )
            .populate_existing()
            .first()
        )

    def find_active_for_source(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
        source_scope_hash: str,
    ) -> Optional[OrchestrationScopeCorrection]:
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.partner_id == partner_id,
                OrchestrationScopeCorrection.external_org_id == external_org_id,
                OrchestrationScopeCorrection.external_user_id == external_user_id,
                OrchestrationScopeCorrection.task_id == task_id,
                OrchestrationScopeCorrection.upstream_decision_id
                == upstream_decision_id,
                OrchestrationScopeCorrection.source_scope_hash == source_scope_hash,
                OrchestrationScopeCorrection.status.in_(
                    SCOPE_ACTIVE_REVISION_STATUSES
                ),
            )
            .populate_existing()
            .first()
        )

    def add(self, record: OrchestrationScopeCorrection) -> None:
        self.session.add(record)
        self.session.commit()
        self.session.refresh(record)

    def mark_failed(
        self,
        correction_id: str,
        lease_token: str,
        error_code: str,
        usage: dict | None = None,
    ) -> None:
        (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                OrchestrationScopeCorrection.status == "interpreting",
                OrchestrationScopeCorrection.interpretation_lease_token == lease_token,
                OrchestrationScopeCorrection.interpretation_lease_expires_at
                > datetime.now(timezone.utc),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "failed",
                    OrchestrationScopeCorrection.error_code: error_code[:120],
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                    OrchestrationScopeCorrection.usage_payload: usage,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()

    def requeue_failed(self, correction_id: str) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                OrchestrationScopeCorrection.status == "failed",
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "queued",
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def extend_lease(
        self,
        correction_id: str,
        lease_token: str,
        expected_status: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> bool:
        """Extend only one live, exactly-owned correction/proposal lease."""

        if expected_status not in {"interpreting", "proposal_persisting"}:
            return False
        compilation_condition = (
            OrchestrationScopeCorrection.compilation_payload.is_(None)
            if expected_status == "interpreting"
            else OrchestrationScopeCorrection.compilation_payload.is_not(None)
        )
        statement = (
            update(OrchestrationScopeCorrection)
            .where(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.status == expected_status,
                OrchestrationScopeCorrection.interpretation_lease_token
                == lease_token,
                OrchestrationScopeCorrection.interpretation_lease_expires_at
                > now,
                compilation_condition,
            )
            .values(
                interpretation_lease_expires_at=lease_expires_at,
                updated_at=now,
            )
        )
        with self._lease_bind.begin() as connection:
            result = connection.execute(statement)
        return result.rowcount == 1

    def claim_specific(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> Optional[OrchestrationScopeCorrection]:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                or_(
                    OrchestrationScopeCorrection.status == "queued",
                    and_(
                        OrchestrationScopeCorrection.status == "interpreting",
                        or_(
                            OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.interpretation_lease_expires_at
                            <= now,
                        ),
                    ),
                ),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "interpreting",
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: lease_token,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at:
                        lease_expires_at,
                    OrchestrationScopeCorrection.attempt_count:
                        OrchestrationScopeCorrection.attempt_count + 1,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        if updated != 1:
            return None
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(OrchestrationScopeCorrection.correction_id == correction_id)
            .populate_existing()
            .one()
        )

    def claim_next(
        self,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> Optional[OrchestrationScopeCorrection]:
        query = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                or_(
                    OrchestrationScopeCorrection.status == "queued",
                    and_(
                        OrchestrationScopeCorrection.status == "interpreting",
                        or_(
                            OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.interpretation_lease_expires_at
                            <= now,
                        ),
                    ),
                ),
            )
            .order_by(
                OrchestrationScopeCorrection.created_at.asc(),
                OrchestrationScopeCorrection.id.asc(),
            )
        )
        if exclude_tenant_key is not None:
            external_org_id, external_user_id = exclude_tenant_key
            alternate = query.filter(
                or_(
                    OrchestrationScopeCorrection.external_org_id
                    != external_org_id,
                    OrchestrationScopeCorrection.external_user_id
                    != external_user_id,
                )
            )
            try:
                row = alternate.with_for_update(skip_locked=True).first()
            except Exception:
                row = alternate.first()
            if row is not None:
                return self.claim_specific(
                    row.correction_id,
                    lease_token,
                    lease_expires_at,
                    now,
                )
        try:
            row = query.with_for_update(skip_locked=True).first()
        except Exception:
            row = query.first()
        if row is None:
            return None
        return self.claim_specific(
            row.correction_id,
            lease_token,
            lease_expires_at,
            now,
        )

    def claim_specific_proposal(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        max_attempts: int,
    ) -> Optional[OrchestrationScopeCorrection]:
        self._dead_letter_exhausted_proposals(max_attempts, now)
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.proposal_attempt_count < max_attempts,
                or_(
                    OrchestrationScopeCorrection.status == "proposal_pending",
                    and_(
                        OrchestrationScopeCorrection.status == "proposal_failed",
                        or_(
                            OrchestrationScopeCorrection.proposal_next_attempt_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.proposal_next_attempt_at
                            <= now,
                        ),
                    ),
                    and_(
                        OrchestrationScopeCorrection.status == "proposal_persisting",
                        or_(
                            OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.interpretation_lease_expires_at
                            <= now,
                        ),
                    ),
                ),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "proposal_persisting",
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: lease_token,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at:
                        lease_expires_at,
                    OrchestrationScopeCorrection.proposal_attempt_count:
                        OrchestrationScopeCorrection.proposal_attempt_count + 1,
                    OrchestrationScopeCorrection.proposal_next_attempt_at: None,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        if updated != 1:
            return None
        return (
            self.session.query(OrchestrationScopeCorrection)
            .filter(OrchestrationScopeCorrection.correction_id == correction_id)
            .populate_existing()
            .one()
        )

    def claim_next_proposal(
        self,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
        max_attempts: int,
        exclude_tenant_key: tuple[str, str] | None = None,
    ) -> Optional[OrchestrationScopeCorrection]:
        self._dead_letter_exhausted_proposals(max_attempts, now)
        query = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.proposal_attempt_count < max_attempts,
                or_(
                    OrchestrationScopeCorrection.status == "proposal_pending",
                    and_(
                        OrchestrationScopeCorrection.status == "proposal_failed",
                        or_(
                            OrchestrationScopeCorrection.proposal_next_attempt_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.proposal_next_attempt_at
                            <= now,
                        ),
                    ),
                    and_(
                        OrchestrationScopeCorrection.status == "proposal_persisting",
                        or_(
                            OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.interpretation_lease_expires_at
                            <= now,
                        ),
                    ),
                ),
            )
            .order_by(
                OrchestrationScopeCorrection.created_at.asc(),
                OrchestrationScopeCorrection.id.asc(),
            )
        )
        if exclude_tenant_key is not None:
            external_org_id, external_user_id = exclude_tenant_key
            alternate = query.filter(
                or_(
                    OrchestrationScopeCorrection.external_org_id
                    != external_org_id,
                    OrchestrationScopeCorrection.external_user_id
                    != external_user_id,
                )
            )
            try:
                row = alternate.with_for_update(skip_locked=True).first()
            except Exception:
                row = alternate.first()
            if row is not None:
                return self.claim_specific_proposal(
                    row.correction_id,
                    lease_token,
                    lease_expires_at,
                    now,
                    max_attempts,
                )
        try:
            row = query.with_for_update(skip_locked=True).first()
        except Exception:
            row = query.first()
        if row is None:
            return None
        return self.claim_specific_proposal(
            row.correction_id,
            lease_token,
            lease_expires_at,
            now,
            max_attempts,
        )

    def _dead_letter_exhausted_proposals(
        self,
        max_attempts: int,
        now: datetime,
    ) -> int:
        """Terminalize exhausted proposal work before it can starve the queue."""

        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.proposal_attempt_count >= max_attempts,
                or_(
                    OrchestrationScopeCorrection.status.in_(
                        ["proposal_pending", "proposal_failed"]
                    ),
                    and_(
                        OrchestrationScopeCorrection.status == "proposal_persisting",
                        or_(
                            OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                                None
                            ),
                            OrchestrationScopeCorrection.interpretation_lease_expires_at
                            <= now,
                        ),
                    ),
                ),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "proposal_dead_lettered",
                    OrchestrationScopeCorrection.error_code:
                        "proposal_retry_exhausted",
                    OrchestrationScopeCorrection.proposal_next_attempt_at: None,
                    OrchestrationScopeCorrection.proposal_dead_lettered_at: now,
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                },
                synchronize_session=False,
            )
        )
        if updated:
            self.session.commit()
        return updated

    def finalize_proposal(
        self,
        correction_id: str,
        lease_token: str,
    ) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.status == "proposal_persisting",
                OrchestrationScopeCorrection.interpretation_lease_token == lease_token,
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.interpretation_lease_expires_at
                > datetime.now(timezone.utc),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "compiled",
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                    OrchestrationScopeCorrection.proposal_next_attempt_at: None,
                    OrchestrationScopeCorrection.proposal_dead_lettered_at: None,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def mark_proposal_failed(
        self,
        correction_id: str,
        lease_token: str,
        error_code: str,
        next_attempt_at: datetime | None,
        dead_lettered_at: datetime | None,
    ) -> None:
        (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.status == "proposal_persisting",
                OrchestrationScopeCorrection.interpretation_lease_token == lease_token,
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.interpretation_lease_expires_at
                > datetime.now(timezone.utc),
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: (
                        "proposal_dead_lettered"
                        if dead_lettered_at is not None
                        else "proposal_failed"
                    ),
                    OrchestrationScopeCorrection.error_code: (
                        "proposal_retry_exhausted"
                        if dead_lettered_at is not None
                        else error_code[:120]
                    ),
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                    OrchestrationScopeCorrection.proposal_next_attempt_at:
                        next_attempt_at,
                    OrchestrationScopeCorrection.proposal_dead_lettered_at:
                        dead_lettered_at,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()

    def retry_failed(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                OrchestrationScopeCorrection.status == "failed",
            )
            .update(
                {
                    OrchestrationScopeCorrection.status: "interpreting",
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: lease_token,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at:
                        lease_expires_at,
                    OrchestrationScopeCorrection.attempt_count:
                        OrchestrationScopeCorrection.attempt_count + 1,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def reclaim_expired(
        self,
        correction_id: str,
        lease_token: str,
        lease_expires_at: datetime,
        now: datetime,
    ) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                OrchestrationScopeCorrection.status == "interpreting",
                or_(
                    OrchestrationScopeCorrection.interpretation_lease_expires_at.is_(
                        None
                    ),
                    OrchestrationScopeCorrection.interpretation_lease_expires_at <= now,
                ),
            )
            .update(
                {
                    OrchestrationScopeCorrection.interpretation_lease_token: lease_token,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at:
                        lease_expires_at,
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.attempt_count:
                        OrchestrationScopeCorrection.attempt_count + 1,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def store_compilation_if_absent(
        self,
        correction_id: str,
        lease_token: str,
        payload: dict,
        status: str,
        now: datetime,
        usage: dict | None = None,
    ) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_(None),
                OrchestrationScopeCorrection.status == "interpreting",
                OrchestrationScopeCorrection.interpretation_lease_token == lease_token,
                OrchestrationScopeCorrection.interpretation_lease_expires_at > now,
            )
            .update(
                {
                    OrchestrationScopeCorrection.compilation_payload: payload,
                    OrchestrationScopeCorrection.status: status,
                    OrchestrationScopeCorrection.error_code: None,
                    OrchestrationScopeCorrection.interpretation_lease_token: None,
                    OrchestrationScopeCorrection.interpretation_lease_expires_at: None,
                    OrchestrationScopeCorrection.usage_payload: usage,
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def store_acceptance_if_absent(
        self,
        correction_id: str,
        payload: dict,
    ) -> bool:
        updated = (
            self.session.query(OrchestrationScopeCorrection)
            .filter(
                OrchestrationScopeCorrection.correction_id == correction_id,
                OrchestrationScopeCorrection.compilation_payload.is_not(None),
                OrchestrationScopeCorrection.acceptance_payload.is_(None),
                OrchestrationScopeCorrection.status == "compiled",
            )
            .update(
                {
                    OrchestrationScopeCorrection.acceptance_payload: payload,
                    OrchestrationScopeCorrection.status: "accepted",
                },
                synchronize_session=False,
            )
        )
        self.session.commit()
        return updated == 1

    def rollback(self) -> None:
        self.session.rollback()


class SqlAlchemyScopeAcceptanceStore:
    """Tenant-bound first-success persistence for unified proposal acceptance."""

    def __init__(self, session: Session):
        self.session = session

    def get_by_proposal(
        self,
        proposal_decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationScopeAcceptance]:
        return (
            self.session.query(OrchestrationScopeAcceptance)
            .filter(
                OrchestrationScopeAcceptance.proposal_decision_id
                == proposal_decision_id,
                OrchestrationScopeAcceptance.external_org_id == external_org_id,
                OrchestrationScopeAcceptance.external_user_id == external_user_id,
                OrchestrationScopeAcceptance.user_id == user_id,
            )
            .populate_existing()
            .first()
        )

    def add(self, row: OrchestrationScopeAcceptance) -> None:
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)

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
        # Receipt rows reference the outcome through an immediate composite
        # foreign key. The mapped models have no ORM relationship, so make the
        # parent INSERT explicit while keeping the transaction atomic.
        self.session.flush()
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
