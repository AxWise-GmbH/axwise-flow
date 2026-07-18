"""Persistence ports used by the orchestration decision service."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Protocol

from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
    ExecutionPlan,
    LearnedFeatureV1,
    PlanFeasibilityResultV1,
    ResearchJobV1,
    ResearchResultV1,
)

if TYPE_CHECKING:
    from backend.models import (
        OrchestrationDecisionSnapshot,
        OrchestrationExecutionReceipt,
        OrchestrationOutcome,
    )


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


class OutcomeStore(Protocol):
    def find_by_idempotency(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
    ) -> Optional[OrchestrationOutcome]: ...

    def get_for_tenant(
        self,
        outcome_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Optional[OrchestrationOutcome]: ...

    def list_for_decision(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> list[OrchestrationOutcome]: ...

    def add(
        self,
        outcome: OrchestrationOutcome,
        receipts: list[OrchestrationExecutionReceipt],
    ) -> None: ...

    def rollback(self) -> None: ...


class OutcomeLearningPort(Protocol):
    def enrich(
        self,
        request: DecisionCreateRequestV1,
        scorer_version: str,
    ) -> tuple[DecisionCreateRequestV1, list[LearnedFeatureV1]]: ...
