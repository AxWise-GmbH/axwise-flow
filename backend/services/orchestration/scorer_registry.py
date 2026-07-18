"""Human-reviewed scorer promotion, rollback, and tenant-scoped outcome features."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    LearnedFeatureV1,
    SCORER_VERSION,
    ScorerEvaluationReportV1,
)
from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationExecutionReceipt,
    OrchestrationOutcome,
    OrchestrationScorerVersion,
)
from backend.services.orchestration.assignment_scorer import AssignmentScorer, WEIGHTS
from backend.services.orchestration.evaluation_service import ScorerEvaluationService


class ScorerGovernanceError(ValueError):
    """Raised when a scorer change bypasses a Phase 4 safety gate."""


class ScorerRegistryService:
    def __init__(self, session: Session):
        self.session = session

    def register_candidate(
        self,
        *,
        external_org_id: str,
        version: str,
        parent_version: str = SCORER_VERSION,
        weights: dict[str, float],
        minimum_samples: int = 3,
        window_days: int = 180,
    ) -> OrchestrationScorerVersion:
        # Reuse scorer validation so invalid or gameable configurations never persist.
        AssignmentScorer(weights=weights, version=version)
        if not external_org_id.strip() or not version.strip():
            raise ScorerGovernanceError("tenant and scorer version are required")
        if minimum_samples < 3:
            raise ScorerGovernanceError("minimum_samples cannot be lower than 3")
        if window_days < 1 or window_days > 3650:
            raise ScorerGovernanceError("window_days must be between 1 and 3650")
        configuration = {
            "weights": dict(weights),
            "minimum_samples": minimum_samples,
            "window_days": window_days,
        }
        existing = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == external_org_id,
                OrchestrationScorerVersion.version == version,
            )
            .first()
        )
        if existing:
            if (
                existing.parent_version != parent_version
                or existing.configuration != configuration
            ):
                raise ScorerGovernanceError(
                    "a scorer version is immutable once registered"
                )
            return existing
        row = OrchestrationScorerVersion(
            external_org_id=external_org_id,
            version=version,
            parent_version=parent_version,
            status="candidate",
            configuration=configuration,
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    def promote(
        self,
        *,
        external_org_id: str,
        version: str,
        report: ScorerEvaluationReportV1,
        reviewed_by: str,
    ) -> OrchestrationScorerVersion:
        if not reviewed_by.strip():
            raise ScorerGovernanceError("human reviewer identity is required")
        row = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == external_org_id,
                OrchestrationScorerVersion.version == version,
            )
            .first()
        )
        if not row or row.status != "candidate":
            raise ScorerGovernanceError("candidate scorer version was not found")
        expected_baseline = row.parent_version or SCORER_VERSION
        enforced_blockers = ScorerEvaluationService.promotion_blockers(report)
        if (
            report.external_org_id != external_org_id
            or report.candidate_version != version
            or report.baseline_version != expected_baseline
            or not report.passed
            or report.blockers
            or enforced_blockers
        ):
            raise ScorerGovernanceError(
                "scorer promotion requires a tenant-bound, baseline-matched, "
                "passing, blocker-free evaluation report"
            )
        now = datetime.now(timezone.utc)
        active = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == external_org_id,
                OrchestrationScorerVersion.status == "active",
            )
            .all()
        )
        for current in active:
            current.status = "retired"
            current.retired_at = now
        row.status = "active"
        row.evaluation_report = report.model_dump(mode="json")
        row.reviewed_by = reviewed_by.strip()
        row.promoted_at = now
        self.session.commit()
        self.session.refresh(row)
        return row

    def rollback(
        self,
        *,
        external_org_id: str,
        version: str,
        reviewed_by: str,
    ) -> None:
        if not reviewed_by.strip():
            raise ScorerGovernanceError("human reviewer identity is required")
        row = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == external_org_id,
                OrchestrationScorerVersion.version == version,
                OrchestrationScorerVersion.status == "active",
            )
            .first()
        )
        if not row:
            raise ScorerGovernanceError("active scorer version was not found")
        row.status = "rolled_back"
        row.retired_at = datetime.now(timezone.utc)
        row.reviewed_by = reviewed_by.strip()
        if row.parent_version and row.parent_version != SCORER_VERSION:
            parent = (
                self.session.query(OrchestrationScorerVersion)
                .filter(
                    OrchestrationScorerVersion.external_org_id == external_org_id,
                    OrchestrationScorerVersion.version == row.parent_version,
                )
                .first()
            )
            if parent:
                parent.status = "active"
                parent.retired_at = None
        self.session.commit()

    def active_scorer(self, external_org_id: str) -> AssignmentScorer:
        row = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == external_org_id,
                OrchestrationScorerVersion.status == "active",
            )
            .order_by(OrchestrationScorerVersion.promoted_at.desc())
            .first()
        )
        if not row:
            return AssignmentScorer(weights=WEIGHTS, version=SCORER_VERSION)
        return AssignmentScorer(
            weights=row.configuration["weights"],
            version=row.version,
        )

    def enrich(
        self,
        request: DecisionCreateRequestV1,
        scorer_version: str,
    ) -> tuple[DecisionCreateRequestV1, list[LearnedFeatureV1]]:
        if scorer_version == SCORER_VERSION:
            return request, []
        version = (
            self.session.query(OrchestrationScorerVersion)
            .filter(
                OrchestrationScorerVersion.external_org_id == request.tenant.org_id,
                OrchestrationScorerVersion.version == scorer_version,
                OrchestrationScorerVersion.status == "active",
            )
            .first()
        )
        if not version:
            return request, []
        config = version.configuration
        window_start = datetime.now(timezone.utc) - timedelta(
            days=int(config.get("window_days", 180))
        )
        decision_rows = (
            self.session.query(OrchestrationOutcome, OrchestrationDecisionSnapshot)
            .join(
                OrchestrationDecisionSnapshot,
                OrchestrationDecisionSnapshot.decision_id
                == OrchestrationOutcome.decision_id,
            )
            .filter(
                OrchestrationOutcome.external_org_id == request.tenant.org_id,
                OrchestrationOutcome.received_at >= window_start,
                OrchestrationDecisionSnapshot.selected_agent_id.isnot(None),
            )
            .all()
        )
        receipt_rows = (
            self.session.query(OrchestrationOutcome, OrchestrationExecutionReceipt)
            .join(
                OrchestrationExecutionReceipt,
                and_(
                    OrchestrationExecutionReceipt.outcome_id
                    == OrchestrationOutcome.outcome_id,
                    OrchestrationExecutionReceipt.external_org_id
                    == OrchestrationOutcome.external_org_id,
                    OrchestrationExecutionReceipt.external_user_id
                    == OrchestrationOutcome.external_user_id,
                ),
            )
            .filter(
                OrchestrationOutcome.external_org_id == request.tenant.org_id,
                OrchestrationOutcome.received_at >= window_start,
                OrchestrationExecutionReceipt.agent_id.isnot(None),
            )
            .all()
        )
        samples: dict[str, list[tuple[float, datetime, str]]] = defaultdict(list)
        outcomes_with_receipts: set[tuple[str, str]] = set()
        receipt_observations: dict[
            tuple[str, str, str],
            tuple[float, datetime, str, int],
        ] = {}
        for outcome, receipt in receipt_rows:
            payload = receipt.receipt_payload
            if (
                outcome.evaluation_payload.get("promotable_observation") is not True
                or receipt.status != "completed"
                or payload.get("human_override") is True
            ):
                continue
            receipt_quality = payload.get("quality_score")
            value = (
                float(receipt_quality)
                if receipt_quality is not None
                else float(outcome.normalized_success)
            )
            key = (
                outcome.external_user_id,
                outcome.outcome_id,
                receipt.agent_id,
            )
            existing = receipt_observations.get(key)
            candidate = (
                value,
                outcome.received_at,
                "orchestration_execution_receipts",
                receipt.attempt,
            )
            if existing is None or receipt.attempt >= existing[3]:
                receipt_observations[key] = candidate
            outcomes_with_receipts.add(
                (outcome.external_user_id, outcome.outcome_id)
            )
        for (_, _, agent_id), observation in receipt_observations.items():
            samples[agent_id].append(observation[:3])
        for outcome, decision in decision_rows:
            if (
                (outcome.external_user_id, outcome.outcome_id)
                not in outcomes_with_receipts
                and outcome.evaluation_payload.get("promotable_observation") is True
            ):
                samples[decision.selected_agent_id].append(
                    (
                        float(outcome.normalized_success),
                        outcome.received_at,
                        "orchestration_outcomes",
                    )
                )
        minimum_samples = int(config.get("minimum_samples", 3))
        features: list[LearnedFeatureV1] = []
        updated_agents = []
        now = datetime.now(timezone.utc)
        for agent in request.available_agents:
            observations = samples.get(agent.agent_id, [])
            if len(observations) < minimum_samples:
                updated_agents.append(agent)
                continue
            value = round(
                sum(item[0] for item in observations)
                / len(observations),
                6,
            )
            updated_agents.append(agent.model_copy(update={"success_rate": value}))
            starts = [item[1] for item in observations]
            provenance = (
                "orchestration_execution_receipts"
                if any(item[2] == "orchestration_execution_receipts" for item in observations)
                else "orchestration_outcomes"
            )
            features.append(
                LearnedFeatureV1(
                    agent_id=agent.agent_id,
                    value=value,
                    sample_count=len(observations),
                    external_org_id=request.tenant.org_id,
                    window_start=min(starts),
                    window_end=max(starts) if starts else now,
                    provenance=provenance,
                    scorer_version=scorer_version,
                )
            )
        return request.model_copy(update={"available_agents": updated_agents}), features
