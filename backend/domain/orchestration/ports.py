"""Persistence ports used by the orchestration decision service."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Protocol

from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
    ExecutionPlan,
    PlanFeasibilityResultV1,
    ResearchJobV1,
    ResearchResultV1,
)

if TYPE_CHECKING:
    from backend.models import OrchestrationDecisionSnapshot


class DecisionStore(Protocol):
    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Optional[OrchestrationDecisionSnapshot]: ...

    def get_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationDecisionSnapshot]: ...

    def add(self, record: OrchestrationDecisionSnapshot) -> None: ...

    def rollback(self) -> None: ...


class EvidenceRetrievalPort(Protocol):
    def retrieve(
        self,
        request: DecisionCreateRequestV1,
        user_id: str,
    ) -> list[EvidenceItemV1]: ...


class ResearchToolPort(Protocol):
    def start(
        self,
        request: DecisionCreateRequestV1,
        decision_id: str,
        idempotency_key: str,
    ) -> ResearchJobV1: ...

    def collect(
        self,
        request: DecisionCreateRequestV1,
        job: ResearchJobV1,
    ) -> ResearchResultV1: ...


class PlanFeasibilityPort(Protocol):
    def validate(
        self,
        request: DecisionCreateRequestV1,
        plan: ExecutionPlan,
    ) -> PlanFeasibilityResultV1: ...
