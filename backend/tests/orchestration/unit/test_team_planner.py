"""Phase 3 deterministic team construction and plan-validation tests."""

from __future__ import annotations

from copy import deepcopy

import pytest

from backend.domain.orchestration.enums import RoutingMode
from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.services.orchestration.plan_validator import PlanValidator
from backend.services.orchestration.team_planner import TeamPlanner
from backend.tests.orchestration.unit.test_uncertainty_router import _payload


pytestmark = [pytest.mark.contract, pytest.mark.unit]


def planning_payload(pattern: str = "sequential", domain: str = "operations") -> dict:
    payload = deepcopy(_payload())
    payload["task"].update(
        {
            "domain": domain,
            "required_capabilities": ["research", "draft"],
            "required_tools": [],
            "requested_actions": [],
        }
    )
    payload["available_agents"] = [
        {
            "agent_id": "agent-research",
            "org_id": "orqaly-org-example",
            "name": "Research Specialist",
            "capabilities": ["research", "review"],
            "tool_ids": ["records_read"],
            "availability": "available",
            "success_rate": 0.84,
            "estimated_cost": 8,
            "estimated_latency_ms": 20000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "collaboration_tags": ["structured_handoff"],
        },
        {
            "agent_id": "agent-draft",
            "org_id": "orqaly-org-example",
            "name": "Draft Specialist",
            "capabilities": ["draft", "review"],
            "tool_ids": ["records_write"],
            "availability": "available",
            "success_rate": 0.82,
            "estimated_cost": 9,
            "estimated_latency_ms": 25000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "collaboration_tags": ["structured_handoff"],
        },
        {
            "agent_id": "agent-supervisor",
            "org_id": "orqaly-org-example",
            "name": "Supervisor",
            "capabilities": ["supervision", "review"],
            "tool_ids": [],
            "availability": "available",
            "success_rate": 0.9,
            "estimated_cost": 5,
            "estimated_latency_ms": 10000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "collaboration_tags": ["structured_handoff"],
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
        },
        {
            "tool_id": "records_write",
            "org_id": "orqaly-org-example",
            "name": "Records Write",
            "available": True,
            "allowed_actions": ["draft_output"],
            "allowed_data_classifications": ["internal", "confidential"],
        },
    ]
    payload["policy_context"] = {
        "human_approval_required_for": ["draft_output"],
        "maximum_risk_without_human": "medium",
    }
    payload["budget"] = {
        "currency": "EUR",
        "maximum_cost": 40,
        "maximum_latency_ms": 120000,
    }
    payload["planning"] = {
        "pattern": pattern,
        "maximum_team_size": 4,
        "required_collaboration_tags": ["structured_handoff"],
        "separation_of_duty_rules": [
            {
                "rule_id": "research-draft-separation",
                "step_ids": ["research", "draft"],
                "reason": "Evidence collection and final drafting require different owners",
            }
        ],
        "steps": [
            {
                "step_id": "research",
                "title": "Collect evidence",
                "objective": "Collect and structure the authorized operational evidence",
                "required_capabilities": ["research"],
                "required_tools": ["records_read"],
                "requested_actions": ["analyze_records"],
                "input_contract": {"task_context": "TaskEnvelopeV1"},
                "output_contract": {"evidence_summary": "EvidenceSummaryV1"},
                "completion_criteria": ["Every material claim has a source reference"],
            },
            {
                "step_id": "draft",
                "title": "Prepare deliverable",
                "objective": "Prepare the final deliverable from the evidence summary",
                "required_capabilities": ["draft"],
                "required_tools": ["records_write"],
                "requested_actions": ["draft_output"],
                "dependencies": [] if pattern == "parallel" else ["research"],
                "input_contract": {"task_context": "TaskEnvelopeV1"},
                "output_contract": {"deliverable": "DeliverableV1"},
                "completion_criteria": ["Deliverable satisfies the requested outcome"],
            },
        ],
    }
    return payload


@pytest.mark.parametrize(
    ("pattern", "expected_mode", "expected_nodes"),
    [
        ("sequential", RoutingMode.SEQUENTIAL, 2),
        ("parallel", RoutingMode.PARALLEL, 2),
        ("supervisor", RoutingMode.SUPERVISOR, 3),
        ("human_controlled", RoutingMode.HUMAN_CONTROLLED, 2),
    ],
)
def test_team_planner_builds_supported_templates(pattern, expected_mode, expected_nodes):
    request = DecisionCreateRequestV1.model_validate(planning_payload(pattern))

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    assert result.validation.valid is True
    assert result.plan.mode == expected_mode
    assert result.plan.executable is True
    assert len(result.plan.nodes) == expected_nodes
    assert result.plan.total_estimated_cost is not None
    assert result.plan.critical_path_latency_ms is not None
    assert {node.assigned_agent_id for node in result.plan.nodes[:2]} == {
        "agent-research",
        "agent-draft",
    }
    draft = next(node for node in result.plan.nodes if node.node_id == "draft")
    assert draft.approval_gate_ids
    assert draft.failure_paths


def test_plan_validator_rejects_cycles_missing_fallback_and_unauthorized_tool():
    request = DecisionCreateRequestV1.model_validate(planning_payload())
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    research, draft = built.plan.nodes
    invalid_research = research.model_copy(
        update={
            "dependencies": ["draft"],
            "input_contract": {"dependency_outputs": ["draft"]},
            "tool_ids": ["records_write"],
            "failure_paths": [],
        }
    )
    invalid = built.plan.model_copy(update={"nodes": [invalid_research, draft]})

    result = PlanValidator().validate(request, invalid, built.approval_points)

    reasons = " ".join(item.reason for item in result.rejections)
    assert result.valid is False
    assert "acyclic" in reasons
    assert "failure path" in reasons
    assert "not authorized" in reasons


def test_plan_validator_rejects_total_budget_violation():
    payload = planning_payload()
    payload["planning"]["total_budget"] = {
        "currency": "EUR",
        "maximum_cost": 10,
        "maximum_latency_ms": 120000,
    }
    request = DecisionCreateRequestV1.model_validate(payload)

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    reasons = " ".join(item.reason for item in result.validation.rejections)
    assert result.validation.valid is False
    assert "cost" in reasons


def test_team_planner_rejects_missing_collaboration_compatibility():
    payload = planning_payload()
    payload["available_agents"][1]["collaboration_tags"] = []
    request = DecisionCreateRequestV1.model_validate(payload)

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    reasons = " ".join(item.reason for item in result.validation.rejections)
    assert result.validation.valid is False
    assert "no eligible owner" in reasons


def test_planning_budget_cannot_widen_the_top_level_request_budget():
    payload = planning_payload()
    payload["budget"]["maximum_cost"] = 10
    payload["planning"]["total_budget"] = {
        "currency": "EUR",
        "maximum_cost": 100,
        "maximum_latency_ms": 120000,
    }
    request = DecisionCreateRequestV1.model_validate(payload)

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    reasons = " ".join(item.reason for item in result.validation.rejections)
    assert result.validation.valid is False
    assert "request budget" in reasons


def test_published_multi_agent_example_builds_an_approval_gated_plan():
    request = DecisionCreateRequestV1.model_validate(
        ORCHESTRATION_DECISION_EXAMPLES["multi_agent_plan"]["value"]
    )

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    assert result.validation.valid is True
    assert result.plan.mode == RoutingMode.SEQUENTIAL
    assert len(result.recommended_agents) == 2
    delivery = next(
        node for node in result.plan.nodes if node.node_id == "response-draft"
    )
    assert delivery.approval_gate_ids


def test_plan_validator_rejects_a_removed_or_misbound_consequential_gate():
    request = DecisionCreateRequestV1.model_validate(planning_payload())
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    nodes = [
        node.model_copy(update={"approval_gate_ids": []})
        if node.node_id == "draft"
        else node
        for node in built.plan.nodes
    ]

    result = PlanValidator().validate(
        request,
        built.plan.model_copy(update={"nodes": nodes}),
        built.approval_points,
    )

    assert result.valid is False
    assert "consequential action" in " ".join(
        rejection.reason for rejection in result.rejections
    )


def test_plan_validator_returns_structured_rejection_for_unknown_dependency():
    request = DecisionCreateRequestV1.model_validate(planning_payload())
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    first = built.plan.nodes[0].model_copy(
        update={
            "dependencies": ["missing-node"],
            "input_contract": {"dependency_outputs": ["missing-node"]},
        }
    )
    invalid = built.plan.model_copy(update={"nodes": [first, *built.plan.nodes[1:]]})

    result = PlanValidator().validate(request, invalid, built.approval_points)

    assert result.valid is False
    assert result.critical_path_latency_ms is None
    assert "unknown dependencies" in " ".join(
        rejection.reason for rejection in result.rejections
    )
