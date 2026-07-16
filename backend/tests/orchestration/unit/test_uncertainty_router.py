"""Phase 2 deterministic uncertainty and value-of-information routing tests."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import pytest

from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import DecisionCreateRequestV1, EvidenceItemV1
from backend.services.orchestration.uncertainty_router import UncertaintyRouter


pytestmark = [pytest.mark.contract, pytest.mark.unit]


def _payload() -> dict:
    payload = deepcopy(ORCHESTRATION_DECISION_EXAMPLES["software_incident"]["value"])
    payload["task"].update(
        {
            "domain": "general_operations",
            "objective": "Reconcile approved operational records using documented deterministic rules",
            "desired_outcome": "A reconciled report containing every mismatch and its source record",
            "required_capabilities": ["core operation"],
            "preferred_capabilities": [],
            "required_tools": ["records_read"],
            "requested_actions": ["analyze_records"],
            "stakeholders": ["operations"],
        }
    )
    payload["available_agents"] = [
        {
            "agent_id": "agent-a",
            "org_id": "orqaly-org-example",
            "name": "Evidence Specialist",
            "capabilities": ["core_operation", "discovered_capability"],
            "tool_ids": ["records_read"],
            "availability": "available",
            "success_rate": 0.5,
            "estimated_cost": 8,
            "estimated_latency_ms": 30000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "stakeholder_tags": ["operations"],
        },
        {
            "agent_id": "agent-b",
            "org_id": "orqaly-org-example",
            "name": "Performance Specialist",
            "capabilities": ["core_operation"],
            "tool_ids": ["records_read"],
            "availability": "available",
            "success_rate": 0.9,
            "estimated_cost": 8,
            "estimated_latency_ms": 30000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "stakeholder_tags": ["operations"],
        },
    ]
    payload["available_tools"] = [
        {
            "tool_id": "records_read",
            "org_id": "orqaly-org-example",
            "name": "Records Read",
            "available": True,
            "allowed_actions": ["analyze_records"],
            "allowed_data_classifications": ["internal", "confidential"],
        }
    ]
    payload["policy_context"] = {"maximum_risk_without_human": "medium"}
    return payload


def _ambiguous_research_payload() -> dict:
    payload = _payload()
    payload["task"]["objective"] = "Analyze this"
    payload["task"]["desired_outcome"] = "Make it better"
    payload["research_policy"] = {
        "allow_hybrid_research": True,
        "minimum_value_of_information": 0.35,
        "maximum_research_cost": 100,
        "estimated_research_cost": 20,
        "maximum_research_latency_ms": 600000,
        "estimated_research_latency_ms": 300000,
        "maximum_research_iterations": 1,
    }
    payload["research_brief"] = {
        "business_idea": "Operational record reconciliation",
        "target_stakeholders": "Operations analysts",
        "problem": "The correct assignment depends on unresolved stakeholder needs",
        "research_questions": ["Which specialist capabilities are actually required?"],
    }
    return payload


@pytest.mark.parametrize(
    "example_name",
    [
        "software_incident",
        "customer_escalation",
        "compliance_review",
        "marketing_preparation",
        "finance_analysis",
    ],
)
def test_clear_cross_domain_tasks_never_default_to_research(example_name):
    request = DecisionCreateRequestV1.model_validate(
        ORCHESTRATION_DECISION_EXAMPLES[example_name]["value"]
    )

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value != "research_assisted"


def test_research_requires_positive_value_and_explicit_bounded_authorization():
    request = DecisionCreateRequestV1.model_validate(_ambiguous_research_payload())

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "research_assisted"
    assert assessment.value_of_information >= 0.35
    assert "cost and time threshold" in assessment.reasons[-1]


def test_published_bounded_research_example_selects_research():
    request = DecisionCreateRequestV1.model_validate(
        ORCHESTRATION_DECISION_EXAMPLES["bounded_research"]["value"]
    )

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "research_assisted"


def test_research_over_budget_falls_back_to_human_clarification():
    payload = _ambiguous_research_payload()
    payload["research_policy"]["estimated_research_cost"] = 101
    request = DecisionCreateRequestV1.model_validate(payload)

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "human_clarification"
    assert "estimated research cost exceeds budget" in assessment.reasons


def test_research_over_latency_budget_falls_back_to_human_clarification():
    payload = _ambiguous_research_payload()
    payload["research_policy"]["estimated_research_latency_ms"] = 600001
    request = DecisionCreateRequestV1.model_validate(payload)

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "human_clarification"
    assert "estimated research latency exceeds budget" in assessment.reasons


def test_research_iteration_limit_prevents_unbounded_expansion():
    payload = _ambiguous_research_payload()
    payload["research_policy"]["completed_research_iterations"] = 1
    request = DecisionCreateRequestV1.model_validate(payload)

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "human_clarification"
    assert "maximum research expansion was reached" in assessment.reasons


def test_research_stops_when_task_deadline_is_too_close():
    payload = _ambiguous_research_payload()
    payload["task"]["deadline"] = (
        datetime.now(timezone.utc) + timedelta(hours=2)
    ).isoformat()
    request = DecisionCreateRequestV1.model_validate(payload)

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "human_clarification"
    assert "task deadline is too close" in " ".join(assessment.reasons)


def test_sufficient_existing_evidence_is_used_without_starting_research():
    request = DecisionCreateRequestV1.model_validate(_ambiguous_research_payload())
    evidence = [
        EvidenceItemV1(
            reference_id="operational:approved-records",
            provenance="operational",
            relevance=1.0,
            quality=0.9,
            verified=True,
            verification_source="orqaly_asserted",
        )
    ]

    assessment = UncertaintyRouter().route(request, evidence)

    assert assessment.selected_mode.value == "evidence_assisted"
    assert assessment.evidence_sufficiency == 0.9


def test_provenance_weights_do_not_treat_inferred_or_synthetic_as_operational():
    request = DecisionCreateRequestV1.model_validate(_ambiguous_research_payload())
    router = UncertaintyRouter()

    def sufficiency(provenance: str) -> float:
        evidence = [
            EvidenceItemV1(
                reference_id=f"{provenance}:fixture",
                provenance=provenance,
                relevance=1.0,
                quality=0.9,
                verified=True,
                verification_source="axwise_audit",
            )
        ]
        return router.route(request, evidence).evidence_sufficiency

    operational = sufficiency("operational")
    empirical = sufficiency("empirical")
    inferred = sufficiency("inferred")
    synthetic = sufficiency("synthetic")

    assert operational == empirical
    assert operational > inferred > synthetic


def test_contradictory_consequential_evidence_requires_clarification():
    payload = _ambiguous_research_payload()
    payload["task"]["risk_level"] = "high"
    request = DecisionCreateRequestV1.model_validate(payload)
    evidence = [
        EvidenceItemV1(
            reference_id="empirical:contradiction",
            provenance="empirical",
            relevance=1.0,
            quality=0.9,
            verified=True,
            verification_source="orqaly_asserted",
            contradictory=True,
        )
    ]

    assessment = UncertaintyRouter().route(request, evidence)

    assert assessment.selected_mode.value == "human_clarification"
    assert assessment.contradiction == 1.0


def test_high_consequence_ambiguity_escalates_even_when_research_is_affordable():
    payload = _ambiguous_research_payload()
    payload["task"]["risk_level"] = "critical"
    payload["task"]["reversibility"] = "irreversible"
    request = DecisionCreateRequestV1.model_validate(payload)

    assessment = UncertaintyRouter().route(request, [])

    assert assessment.selected_mode.value == "human_clarification"
    assert "cannot be researched autonomously" in assessment.reasons[-1]


def test_labeled_calibration_fixtures_stay_inside_versioned_bands():
    path = (
        Path(__file__).resolve().parents[3]
        / "config"
        / "orchestration"
        / "calibration_fixtures.json"
    )
    fixtures = json.loads(path.read_text(encoding="utf-8"))["fixtures"]
    router = UncertaintyRouter()
    for fixture in fixtures:
        if fixture["name"] == "clear_direct":
            payload = _payload()
        else:
            payload = _ambiguous_research_payload()
        if fixture["name"] == "high_consequence_ambiguity":
            payload["task"]["risk_level"] = "critical"
            payload["task"]["reversibility"] = "irreversible"
        assessment = router.route(
            DecisionCreateRequestV1.model_validate(payload),
            [],
        )
        assert assessment.selected_mode.value == fixture["expected_mode"]
        assert assessment.calibration_band == fixture["expected_band"]
        assert fixture["minimum_uncertainty"] <= assessment.uncertainty
        assert assessment.uncertainty <= fixture["maximum_uncertainty"]
