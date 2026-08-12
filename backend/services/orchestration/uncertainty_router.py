"""Value-of-information router for direct, evidence, research, or clarification."""

from __future__ import annotations

import json
from pathlib import Path

from backend.domain.orchestration.enums import RoutingMode
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
    RoutingAssessmentV1,
    RoutingSignal,
)
from backend.services.orchestration.task_classifier import ClassifiedTask, TaskClassifier


DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "orchestration"
    / "routing.json"
)


class UncertaintyRouter:
    version = "deterministic-voi-v1.0.0"

    def __init__(self, config_path: Path = DEFAULT_CONFIG_PATH):
        with config_path.open("r", encoding="utf-8") as handle:
            self.config = json.load(handle)
        self.classifier = TaskClassifier(self.config["provenance_weights"])

    def _calibration_band(self, uncertainty: float) -> str:
        bands = self.config["calibration_bands"]
        if uncertainty <= bands["low_maximum"]:
            return "low"
        if uncertainty <= bands["medium_maximum"]:
            return "medium"
        return "high"

    @staticmethod
    def _research_budget_allows(request: DecisionCreateRequestV1) -> tuple[bool, list[str]]:
        policy = request.research_policy
        reasons: list[str] = []
        if not policy.allow_hybrid_research:
            reasons.append("hybrid research is not authorized")
        if not request.research_brief:
            reasons.append("research brief is missing")
        if policy.completed_research_iterations >= policy.maximum_research_iterations:
            reasons.append("maximum research expansion was reached")
        if policy.maximum_research_cost is None or policy.estimated_research_cost is None:
            reasons.append("research cost budget or estimate is missing")
        elif policy.estimated_research_cost > policy.maximum_research_cost:
            reasons.append("estimated research cost exceeds budget")
        if (
            policy.maximum_research_latency_ms is None
            or policy.estimated_research_latency_ms is None
        ):
            reasons.append("research latency budget or estimate is missing")
        elif policy.estimated_research_latency_ms > policy.maximum_research_latency_ms:
            reasons.append("estimated research latency exceeds budget")
        return not reasons, reasons

    def _select_mode(
        self,
        request: DecisionCreateRequestV1,
        classified: ClassifiedTask,
        evidence: list[EvidenceItemV1],
    ) -> tuple[RoutingMode, list[str]]:
        reasons = list(classified.reasons)
        high = self.config["high_consequence_ambiguity"]
        clarification = self.config["clarification"]
        policy = request.research_policy

        if not classified.authority_complete:
            reasons.append("missing authority requires human clarification")
            return RoutingMode.HUMAN_CLARIFICATION, reasons
        if (
            classified.ambiguity >= high["minimum_ambiguity"]
            and classified.consequence >= high["minimum_consequence"]
        ):
            reasons.append("high-consequence ambiguity cannot be researched autonomously")
            return RoutingMode.HUMAN_CLARIFICATION, reasons
        if (
            classified.contradiction > clarification["maximum_contradiction"]
            and classified.consequence >= 0.4
        ):
            reasons.append("consequential contradictory evidence requires human clarification")
            return RoutingMode.HUMAN_CLARIFICATION, reasons
        if policy.required:
            budget_allows, budget_reasons = self._research_budget_allows(request)
            if classified.deadline_pressure >= 0.7:
                budget_allows = False
                budget_reasons.append(
                    "task deadline is too close for the configured research path"
                )
            if budget_allows:
                reasons.append("research is explicitly required by the authorized policy")
                return RoutingMode.RESEARCH_ASSISTED, reasons
            reasons.extend(budget_reasons)
            reasons.append("required research cannot run within its authorized bounds")
            return RoutingMode.HUMAN_CLARIFICATION, list(dict.fromkeys(reasons))
        if (
            evidence
            and policy.allow_existing_evidence
            and classified.evidence_sufficiency
            >= policy.minimum_evidence_sufficiency
            and classified.contradiction <= clarification["maximum_contradiction"]
        ):
            reasons.append("existing evidence satisfies the configured threshold")
            return RoutingMode.EVIDENCE_ASSISTED, reasons

        budget_allows, budget_reasons = self._research_budget_allows(request)
        if classified.deadline_pressure >= 0.7:
            budget_allows = False
            budget_reasons.append(
                "task deadline is too close for the configured research path"
            )
        unresolved_gap = max(
            0.0,
            classified.evidence_need - classified.evidence_sufficiency,
        )
        if (
            budget_allows
            and classified.value_of_information
            >= policy.minimum_value_of_information
            and (classified.ambiguity >= 0.25 or unresolved_gap >= 0.2)
        ):
            reasons.append("expected information value exceeds configured cost and time threshold")
            return RoutingMode.RESEARCH_ASSISTED, reasons

        if (
            classified.ambiguity >= clarification["minimum_ambiguity"]
            or unresolved_gap > clarification["maximum_unresolved_evidence_gap"]
            or classified.contradiction > clarification["maximum_contradiction"]
        ):
            reasons.extend(budget_reasons)
            reasons.append("uncertainty remains too high for a direct recommendation")
            return RoutingMode.HUMAN_CLARIFICATION, list(dict.fromkeys(reasons))

        reasons.append("additional evidence has insufficient expected value")
        return RoutingMode.DIRECT, reasons

    def route(
        self,
        request: DecisionCreateRequestV1,
        evidence: list[EvidenceItemV1],
    ) -> RoutingAssessmentV1:
        classified = self.classifier.classify(request, evidence)
        mode, reasons = self._select_mode(request, classified, evidence)
        verified_operational_evidence = any(
            item.verified
            and item.verification_source != "none"
            and item.provenance in {"operational", "empirical"}
            for item in evidence
        )
        signals = [
            RoutingSignal(
                signal="ambiguity",
                value=classified.ambiguity,
                source="deterministic_rule",
                reason="derived from objective, outcome, capability, and stakeholder specificity",
            ),
            RoutingSignal(
                signal="evidence_sufficiency",
                value=classified.evidence_sufficiency,
                source=(
                    "verified_operational"
                    if verified_operational_evidence
                    else "unverified_input"
                ),
                reason="quality, relevance, verification, provenance, and contradiction adjusted",
            ),
            RoutingSignal(
                signal="consequence",
                value=classified.consequence,
                source="unverified_input",
                reason="derived from caller-supplied risk, reversibility, and requested actions",
            ),
            RoutingSignal(
                signal="value_of_information",
                value=classified.value_of_information,
                source="deterministic_rule",
                reason="expected decision value minus explicit research cost and latency penalties",
            ),
        ]
        return RoutingAssessmentV1(
            ambiguity=classified.ambiguity,
            evidence_sufficiency=classified.evidence_sufficiency,
            contradiction=classified.contradiction,
            stakeholder_sensitivity=classified.stakeholder_sensitivity,
            consequence=classified.consequence,
            deadline_pressure=classified.deadline_pressure,
            uncertainty=classified.uncertainty,
            value_of_information=classified.value_of_information,
            calibration_band=self._calibration_band(classified.uncertainty),
            selected_mode=mode,
            signals=signals,
            reasons=list(dict.fromkeys(reasons)),
        )
