"""Phase 3 deterministic team construction and plan-validation tests."""

from __future__ import annotations

from copy import deepcopy

import pytest
from pydantic import ValidationError

from backend.domain.orchestration.enums import RoutingMode
from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    ExecutionPlan,
    PlanNode,
)
from backend.domain.orchestration.scope_models import ToolActionGrantV1
from backend.services.orchestration.plan_validator import PlanValidator
from backend.services.orchestration.scope_contract_service import build_scope_packet
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


def sealed_consequential_request(
    action: str = "draft_output",
) -> DecisionCreateRequestV1:
    payload = planning_payload()
    payload["task"]["required_tools"] = ["records_read", "records_write"]
    payload["task"]["requested_actions"] = ["analyze_records", "draft_output"]
    payload["policy_context"]["human_approval_required_for"] = []
    payload["scope_state"] = {
        "admission": {
            "requested_actions": [
                {
                    "action": action,
                    "mode": "execute",
                    "side_effect": "reversible",
                    "requires_authorization": True,
                }
            ]
        }
    }
    unsealed = DecisionCreateRequestV1.model_validate(payload)
    return unsealed.model_copy(update={"scope_packet": build_scope_packet(unsealed)})


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("step_id", "research step", "string_pattern_mismatch"),
        ("required_tools", ["records read"], "string_pattern_mismatch"),
        ("dependencies", ["invalid dependency"], "string_pattern_mismatch"),
        (
            "dependencies",
            ["draft", "draft"],
            "plan step dependencies must be unique",
        ),
        (
            "required_tools",
            ["records_read", "records_read"],
            "plan step required_tools must be unique",
        ),
    ],
)
def test_planning_source_rejects_unrepresentable_or_duplicate_ids(
    field,
    value,
    expected,
):
    payload = planning_payload()
    payload["planning"]["steps"][0][field] = value

    with pytest.raises(ValidationError, match=expected):
        DecisionCreateRequestV1.model_validate(payload)


def test_planning_source_rejects_duplicate_step_ids():
    payload = planning_payload()
    payload["planning"]["steps"][1]["step_id"] = payload["planning"]["steps"][
        0
    ]["step_id"]

    with pytest.raises(ValidationError, match="unique step_id"):
        DecisionCreateRequestV1.model_validate(payload)


def test_agent_catalogue_rejects_unrepresentable_agent_id():
    payload = planning_payload()
    payload["available_agents"][0]["agent_id"] = "agent with spaces"

    with pytest.raises(ValidationError, match="string_pattern_mismatch"):
        DecisionCreateRequestV1.model_validate(payload)


@pytest.mark.parametrize(
    ("updates", "expected"),
    [
        ({"node_id": "node with spaces"}, "string_pattern_mismatch"),
        ({"assigned_agent_id": "agent with spaces"}, "string_pattern_mismatch"),
        ({"reviewer_agent_id": "reviewer with spaces"}, "string_pattern_mismatch"),
        ({"tool_ids": ["tool with spaces"]}, "string_pattern_mismatch"),
        ({"dependencies": ["invalid dependency"]}, "string_pattern_mismatch"),
        (
            {"dependencies": ["draft", "draft"]},
            "plan node dependencies must be unique",
        ),
        (
            {"tool_ids": ["records_read", "records_read"]},
            "plan node tool_ids must be unique",
        ),
    ],
)
def test_plan_node_rejects_unrepresentable_or_duplicate_ids(updates, expected):
    payload = {
        "node_id": "research",
        "title": "Collect evidence",
        "assigned_agent_id": "agent-research",
        "tool_action_grants": [],
        **updates,
    }

    with pytest.raises(ValidationError, match=expected):
        PlanNode.model_validate(payload)


def test_execution_plan_rejects_duplicate_node_ids():
    node = PlanNode(
        node_id="research",
        title="Collect evidence",
        assigned_agent_id="agent-research",
        tool_action_grants=[],
    )

    with pytest.raises(ValidationError, match="unique node_id"):
        ExecutionPlan(
            mode=RoutingMode.SEQUENTIAL,
            nodes=[node, node.model_copy()],
        )


def test_plan_node_requires_one_nonempty_action_grant_per_tool():
    with pytest.raises(ValidationError, match="exactly cover node tool_ids"):
        PlanNode(
            node_id="research",
            title="Collect evidence",
            assigned_agent_id="agent-research",
            tool_ids=["records_read"],
            tool_action_grants=[],
        )


@pytest.mark.parametrize(
    ("team_member_ids", "expected"),
    [
        (["agent with spaces"], "string_pattern_mismatch"),
        (["agent-research", "agent-research"], "team_member_ids must be unique"),
    ],
)
def test_execution_plan_rejects_unrepresentable_or_duplicate_team_members(
    team_member_ids,
    expected,
):
    with pytest.raises(ValidationError, match=expected):
        ExecutionPlan(
            mode=RoutingMode.SEQUENTIAL,
            team_member_ids=team_member_ids,
        )


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
    assert [grant.model_dump(mode="json") for grant in draft.tool_action_grants] == [
        {"tool_id": "records_write", "allowed_actions": ["draft_output"]}
    ]
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


def test_orqaly_commercial_roles_are_soft_preferences_not_missing_nodes():
    payload = planning_payload("parallel", "marketing")
    payload["task"]["required_capabilities"] = ["orqaly_goal_executor"]
    payload["task"]["preferred_capabilities"] = ["campaign strategy"]
    payload["task"]["required_tools"] = []
    payload["budget"]["maximum_cost"] = 100
    payload["available_tools"] = []
    payload["available_agents"] = [
        {
            **payload["available_agents"][0],
            "agent_id": "agent-marketing",
            "name": "Marketing Strategist",
            "capabilities": [
                "orqaly_goal_executor",
                "Marketing Strategist",
                "campaign strategy",
            ],
            "tool_ids": [],
        },
        {
            **payload["available_agents"][1],
            "agent_id": "agent-director",
            "name": "Managing Director",
            "capabilities": [
                "orqaly_goal_executor",
                "Managing Director",
                "commercial leadership",
            ],
            "tool_ids": [],
        },
    ]
    roles = [
        "Marketing Strategist",
        "Business Development Manager",
        "Sales Manager",
        "CFO",
        "Sales Manager",
        "Managing Director",
    ]
    payload["planning"]["separation_of_duty_rules"] = []
    payload["planning"]["steps"] = [
        {
            "step_id": f"commercial-{index}",
            "title": f"Commercial workstream {index}",
            "objective": f"Complete commercial workstream {index}",
            "required_capabilities": ["orqaly_goal_executor"],
            "preferred_capabilities": [role],
            "required_tools": [],
            "requested_actions": [],
            "dependencies": [] if index <= 2 else [f"commercial-{index - 2}"],
            "input_contract": {"task_context": "TaskEnvelopeV1"},
            "output_contract": {"deliverable": "CommercialDeliverableV1"},
            "completion_criteria": ["The commercial deliverable is reviewable"],
        }
        for index, role in enumerate(roles, 1)
    ]
    request = DecisionCreateRequestV1.model_validate(payload)

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    assert result.validation.valid is True
    assert result.plan.executable is True
    assert len(result.plan.nodes) == len(roles)
    assert {node.node_id for node in result.plan.nodes} == {
        f"commercial-{index}" for index in range(1, len(roles) + 1)
    }


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
    request = sealed_consequential_request()
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


def test_plan_validator_rejects_consequential_action_without_same_node_tool():
    request = sealed_consequential_request()
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    nodes = [
        node.model_copy(update={"tool_ids": [], "tool_action_grants": []})
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
    assert "same-node tool authorization" in " ".join(
        rejection.reason for rejection in result.rejections
    )


def test_plan_validator_allows_a_logical_action_without_a_tool():
    request = DecisionCreateRequestV1.model_validate(planning_payload())
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    logical_steps = [
        step.model_copy(update={"requested_actions": ["prepare_specification"]})
        if step.step_id == "research"
        else step
        for step in request.planning.steps
    ]
    logical_request = request.model_copy(
        update={
            "planning": request.planning.model_copy(
                update={"steps": logical_steps}
            )
        }
    )

    nodes = [
        node.model_copy(update={"tool_ids": [], "tool_action_grants": []})
        if node.node_id == "research"
        else node
        for node in built.plan.nodes
    ]
    result = PlanValidator().validate(
        logical_request,
        built.plan.model_copy(update={"nodes": nodes}),
        built.approval_points,
    )

    assert result.valid is True


def test_sealed_consequential_action_gets_exact_grant_and_gate_without_policy_hint():
    request = sealed_consequential_request()

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    draft = next(node for node in result.plan.nodes if node.node_id == "draft")
    assert result.validation.valid is True
    assert draft.approval_gate_ids == ["gate-draft"]
    assert [grant.model_dump(mode="json") for grant in draft.tool_action_grants] == [
        {"tool_id": "records_write", "allowed_actions": ["draft_output"]}
    ]


def test_sealed_consequential_action_requires_an_ascii_semantic_id():
    request = sealed_consequential_request("发短信")

    with pytest.raises(
        ValueError,
        match="sealed consequential action must have an ASCII semantic action ID",
    ):
        TeamPlanner().build(request, RoutingMode.DIRECT)


def test_plan_must_represent_every_sealed_consequential_action():
    request = sealed_consequential_request()
    steps = [
        step.model_copy(update={"required_tools": [], "requested_actions": []})
        if step.step_id == "draft"
        else step
        for step in request.planning.steps
    ]
    request = request.model_copy(
        update={"planning": request.planning.model_copy(update={"steps": steps})}
    )

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    assert result.validation.valid is False
    assert "sealed consequential actions are absent from plan nodes: draft_output" in (
        " ".join(rejection.reason for rejection in result.validation.rejections)
    )


def test_plan_validator_rejects_unrelated_attached_tool_on_action_node():
    request = DecisionCreateRequestV1.model_validate(planning_payload())
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    nodes = [
        node.model_copy(update={"tool_ids": [*node.tool_ids, "records_write"]})
        if node.node_id == "research"
        else node
        for node in built.plan.nodes
    ]

    result = PlanValidator().validate(
        request,
        built.plan.model_copy(update={"nodes": nodes}),
        built.approval_points,
    )

    assert result.valid is False
    assert "unrelated tools: records_write" in " ".join(
        rejection.reason for rejection in result.rejections
    )


def test_plan_validator_rejects_a_shape_valid_but_unsealed_action_grant():
    request = sealed_consequential_request()
    built = TeamPlanner().build(request, RoutingMode.DIRECT)
    nodes = [
        node.model_copy(
            update={
                "tool_action_grants": [
                    ToolActionGrantV1(
                        tool_id="records_write",
                        allowed_actions=("send_sms",),
                    )
                ]
            }
        )
        if node.node_id == "draft"
        else node
        for node in built.plan.nodes
    ]

    result = PlanValidator().validate(
        request,
        built.plan.model_copy(update={"nodes": nodes}),
        built.approval_points,
    )

    reasons = " ".join(rejection.reason for rejection in result.rejections)
    assert result.valid is False
    assert "do not exactly match" in reasons
    assert "same-node tool authorization" in reasons


def test_team_planner_rejects_support_tool_without_requested_action():
    payload = planning_payload()
    payload["planning"]["steps"][0]["requested_actions"] = []
    request = DecisionCreateRequestV1.model_validate(payload)

    result = TeamPlanner().build(request, RoutingMode.DIRECT)

    assert result.validation.valid is False
    assert all(node.node_id != "research" for node in result.plan.nodes)
    assert "without an exact requested-action grant" in " ".join(
        rejection.reason for rejection in result.validation.rejections
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
