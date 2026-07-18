"""Deterministic Phase 2 task, evidence, and uncertainty classification."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from backend.domain.orchestration.enums import (
    CLASSIFICATION_ORDER,
    RISK_ORDER,
    Reversibility,
)
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
)


GENERIC_PHRASES = {
    "analyze this",
    "do this",
    "fix it",
    "handle this",
    "help me",
    "improve it",
    "make it better",
    "take care of it",
}
SENSITIVE_STAKEHOLDERS = {
    "customer",
    "employee",
    "regulator",
    "patient",
    "candidate",
    "investor",
    "board",
}
UNRESOLVED_STAKEHOLDER_MARKERS = {
    "unknown",
    "unspecified",
    "to be determined",
    "tbd",
    "identify the person",
    "identify the customer",
    "affected stakeholder",
}


@dataclass(frozen=True)
class ClassifiedTask:
    ambiguity: float
    evidence_sufficiency: float
    evidence_need: float
    contradiction: float
    stakeholder_sensitivity: float
    consequence: float
    deadline_pressure: float
    uncertainty: float
    value_of_information: float
    authority_complete: bool
    reasons: tuple[str, ...]


class TaskClassifier:
    """Produces replayable signals without a model call or hidden inference."""

    def __init__(self, provenance_weights: dict[str, float] | None = None):
        self.provenance_weights = provenance_weights or {
            "operational": 1.0,
            "empirical": 1.0,
            "inferred": 0.8,
            "synthetic": 0.65,
        }

    @staticmethod
    def _clamp(value: float) -> float:
        return round(max(0.0, min(1.0, value)), 6)

    def _ambiguity(self, request: DecisionCreateRequestV1) -> tuple[float, list[str]]:
        task = request.task
        score = 0.0
        reasons: list[str] = []
        objective = task.objective.casefold().strip()
        outcome = task.desired_outcome.casefold().strip()
        if len(objective.split()) < 6:
            score += 0.25
            reasons.append("objective is underspecified")
        if len(outcome.split()) < 6:
            score += 0.2
            reasons.append("desired outcome lacks completion detail")
        if any(phrase in objective or phrase in outcome for phrase in GENERIC_PHRASES):
            score += 0.3
            reasons.append("task uses generic or unresolved language")
        if not task.required_capabilities and not task.capability_profile:
            score += 0.15
            reasons.append("capability requirements were not explicitly verified")
        stakeholder_text = " ".join(task.stakeholders).casefold().strip()
        if not stakeholder_text or any(
            marker in stakeholder_text
            for marker in UNRESOLVED_STAKEHOLDER_MARKERS
        ):
            score += 0.25
            reasons.append("stakeholders are unspecified or unresolved")
        return self._clamp(score), reasons

    def _stakeholder_sensitivity(self, request: DecisionCreateRequestV1) -> float:
        task = request.task
        normalized = " ".join(task.stakeholders).casefold()
        sensitive = any(value in normalized for value in SENSITIVE_STAKEHOLDERS)
        count_signal = min(len(task.stakeholders) / 5.0, 1.0) * 0.4
        sensitive_signal = 0.3 if sensitive else 0.0
        classification_signal = (
            CLASSIFICATION_ORDER[task.data_classification] / 3.0
        ) * 0.3
        return self._clamp(count_signal + sensitive_signal + classification_signal)

    def _consequence(self, request: DecisionCreateRequestV1) -> float:
        task = request.task
        reversibility = {
            Reversibility.REVERSIBLE: 0.0,
            Reversibility.PARTIALLY_REVERSIBLE: 0.5,
            Reversibility.IRREVERSIBLE: 1.0,
        }[task.reversibility]
        action_signal = 1.0 if task.requested_actions else 0.0
        return self._clamp(
            (RISK_ORDER[task.risk_level] / 3.0) * 0.55
            + reversibility * 0.3
            + action_signal * 0.15
        )

    def _deadline_pressure(
        self,
        request: DecisionCreateRequestV1,
        now: datetime,
    ) -> float:
        deadline = request.task.deadline
        if not deadline:
            return 0.0
        normalized_deadline = (
            deadline.replace(tzinfo=timezone.utc)
            if deadline.tzinfo is None
            else deadline.astimezone(timezone.utc)
        )
        hours = (normalized_deadline - now).total_seconds() / 3600
        if hours <= 0:
            return 1.0
        if hours <= 6:
            return 0.95
        if hours <= 24:
            return 0.7
        if hours <= 168:
            return 0.4
        return 0.1

    def _evidence_sufficiency(
        self,
        evidence: Iterable[EvidenceItemV1],
        minimum_quality: float,
    ) -> tuple[float, float]:
        items = list(evidence)
        if not items:
            return 0.0, 0.0
        contributions = []
        contradiction_weight = 0.0
        total_weight = 0.0
        for item in items:
            provenance = self.provenance_weights[item.provenance]
            independently_verified = (
                item.verified and item.verification_source != "none"
            )
            verification = 1.0 if independently_verified else 0.75
            quality = item.quality if item.quality >= minimum_quality else item.quality * 0.5
            contribution = item.relevance * quality * provenance * verification
            contributions.append(contribution)
            total_weight += max(item.quality, 0.01)
            if item.contradictory:
                contradiction_weight += max(item.quality, 0.01)
        contradiction = contradiction_weight / total_weight if total_weight else 0.0
        sufficiency = sum(contributions) / len(contributions)
        sufficiency *= 1.0 - min(contradiction, 0.8)
        return self._clamp(sufficiency), self._clamp(contradiction)

    @staticmethod
    def _authority_complete(request: DecisionCreateRequestV1) -> bool:
        if not request.available_agents:
            return False
        tenant_tools = {
            item.tool_id
            for item in request.available_tools
            if item.org_id == request.tenant.org_id and item.available
        }
        return set(request.task.required_tools).issubset(tenant_tools)

    def classify(
        self,
        request: DecisionCreateRequestV1,
        evidence: Iterable[EvidenceItemV1],
        now: datetime | None = None,
    ) -> ClassifiedTask:
        resolved_now = now or datetime.now(timezone.utc)
        ambiguity, reasons = self._ambiguity(request)
        stakeholder = self._stakeholder_sensitivity(request)
        consequence = self._consequence(request)
        deadline = self._deadline_pressure(request, resolved_now)
        sufficiency, contradiction = self._evidence_sufficiency(
            evidence,
            request.research_policy.minimum_evidence_quality,
        )
        evidence_need = self._clamp(
            ambiguity * 0.4 + stakeholder * 0.25 + consequence * 0.35
        )
        evidence_gap = max(0.0, evidence_need - sufficiency)
        uncertainty = self._clamp(
            ambiguity * 0.5
            + evidence_gap * 0.25
            + contradiction * 0.15
            + deadline * 0.1
        )

        policy = request.research_policy
        cost_penalty = 0.0
        if policy.maximum_research_cost and policy.estimated_research_cost is not None:
            cost_penalty = min(
                policy.estimated_research_cost / policy.maximum_research_cost,
                2.0,
            ) * 0.15
        latency_penalty = 0.0
        if (
            policy.maximum_research_latency_ms
            and policy.estimated_research_latency_ms is not None
        ):
            latency_penalty = min(
                policy.estimated_research_latency_ms
                / policy.maximum_research_latency_ms,
                2.0,
            ) * 0.1
        value_of_information = self._clamp(
            ambiguity * 0.35
            + evidence_gap * 0.35
            + stakeholder * 0.15
            + consequence * 0.15
            - cost_penalty
            - latency_penalty
        )
        authority_complete = self._authority_complete(request)
        if not authority_complete:
            reasons.append("verified catalogue lacks assignable authority or required tools")
        if contradiction:
            reasons.append("available evidence contains contradictory items")
        return ClassifiedTask(
            ambiguity=ambiguity,
            evidence_sufficiency=sufficiency,
            evidence_need=evidence_need,
            contradiction=contradiction,
            stakeholder_sensitivity=stakeholder,
            consequence=consequence,
            deadline_pressure=deadline,
            uncertainty=uncertainty,
            value_of_information=value_of_information,
            authority_complete=authority_complete,
            reasons=tuple(reasons),
        )
