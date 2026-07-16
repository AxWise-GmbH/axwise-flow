"""Phase 3 cross-domain plan execution and immutable recovery integration tests."""

from __future__ import annotations

from copy import deepcopy

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    PlanFeasibilityRejectionV1,
    PlanFeasibilityResultV1,
    ReplanRequestV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
)
from backend.models import OrchestrationDecisionSnapshot, OrchestrationEvent, User
from backend.services.orchestration.decision_service import (
    IdempotencyConflict,
    OrchestrationDecisionService,
    ReplanError,
)
from backend.tests.orchestration.unit.test_team_planner import planning_payload


pytestmark = [pytest.mark.contract, pytest.mark.integration]


class OrqalyExecutionDouble:
    """Small authority-preserving executor for plan contract acceptance tests."""

    def execute(self, decision) -> list[str]:
        assert decision.requires_orqaly_authorization is True
        assert decision.execution_plan.executable is True
        approved_gates = {gate.gate_id for gate in decision.approval_points}
        completed: list[str] = []
        pending = {node.node_id: node for node in decision.execution_plan.nodes}
        while pending:
            ready = [
                node
                for node in pending.values()
                if set(node.dependencies).issubset(completed)
            ]
            if not ready:
                raise AssertionError("plan cannot reach its remaining nodes")
            for node in ready:
                assert node.assigned_agent_id in decision.execution_plan.team_member_ids
                assert set(node.approval_gate_ids).issubset(approved_gates)
                assert node.input_contract
                assert node.output_contract
                assert node.completion_criteria
                assert node.failure_paths
                completed.append(node.node_id)
                pending.pop(node.node_id)
        return completed


class RejectingOrqalyFeasibilityDouble:
    def validate(self, request, plan):
        return PlanFeasibilityResultV1(
            feasible=False,
            source="orqaly_live_state",
            rejections=[
                PlanFeasibilityRejectionV1(
                    code="agent_unavailable",
                    reason="Orqaly live state reports that the selected owner is busy",
                    node_id=plan.nodes[0].node_id,
                    agent_id=plan.nodes[0].assigned_agent_id,
                )
            ],
        )


@pytest.fixture
def decision_store(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/phase3.db")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            OrchestrationDecisionSnapshot.__table__,
            OrchestrationEvent.__table__,
        ],
    )
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add(User(user_id="axwise-user", email="phase3@example.com", usage_data={}))
    session.commit()
    yield session
    session.close()
    engine.dispose()


def request(pattern: str = "sequential", domain: str = "operations"):
    payload = planning_payload(pattern, domain)
    payload["tenant"] = {"userId": "orqaly-user", "orgId": "orqaly-org-example"}
    return DecisionCreateRequestV1.model_validate(payload)


@pytest.mark.parametrize(
    ("domain", "pattern"),
    [
        ("software_operations", "sequential"),
        ("customer_support", "parallel"),
        ("finance", "supervisor"),
    ],
)
def test_three_cross_domain_team_plans_execute_end_to_end_in_orqaly_double(
    decision_store,
    domain,
    pattern,
):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))

    record = service.create(
        request(pattern, domain),
        "axwise-user",
        f"phase3-{domain}",
    )
    completed = OrqalyExecutionDouble().execute(record)

    assert record.routing_mode.value == pattern
    assert len(record.recommended_agents) >= 2
    assert len(completed) == len(record.execution_plan.nodes)
    assert record.plan_feasibility.feasible is True
    assert record.plan_feasibility_request.decision_id == record.decision_id
    assert record.plan_feasibility_request.plan == record.execution_plan


def test_live_orqaly_feasibility_rejection_blocks_execution(decision_store):
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        plan_feasibility_port=RejectingOrqalyFeasibilityDouble(),
    )

    record = service.create(request(), "axwise-user", "phase3-live-rejection")

    assert record.routing_mode.value == "human_controlled"
    assert record.execution_plan.executable is False
    assert record.recommended_agents == []
    assert record.plan_feasibility.source == "orqaly_live_state"
    assert record.plan_feasibility.rejections[0].code == "agent_unavailable"


def test_agent_unavailability_creates_linked_recovery_with_substitute(decision_store):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    parent = service.create(request(), "axwise-user", "replan-agent-parent")
    original_agent = next(
        node.assigned_agent_id
        for node in parent.execution_plan.nodes
        if node.node_id == "research"
    )
    replacement = next(
        agent for agent in parent.input_snapshot.available_agents if agent.agent_id == original_agent
    ).model_copy(
        update={
            "agent_id": "agent-research-substitute",
            "name": "Research Substitute",
        }
    )
    change = ReplanRequestV1(
        trigger="agent_unavailable",
        reason="assigned research agent went offline",
        failed_node_id="research",
        unavailable_agent_ids=[original_agent],
        replacement_agents=[replacement],
    )

    recovered = service.replan(
        parent.decision_id,
        change,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-agent-result",
    )
    retry = service.replan(
        parent.decision_id,
        change,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-agent-result",
    )

    owner = next(
        node.assigned_agent_id
        for node in recovered.execution_plan.nodes
        if node.node_id == "research"
    )
    assert recovered.parent_decision_id == parent.decision_id
    assert recovered.routing_mode.value == "recovery"
    assert recovered.execution_plan.template_mode.value == "sequential"
    assert owner == "agent-research-substitute"
    assert recovered.ranking_changes
    assert all(
        "execution-state" in change.reason
        for change in recovered.ranking_changes
    )
    assert retry.reused is True
    assert retry.decision_id == recovered.decision_id
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 2
    assert decision_store.query(OrchestrationEvent).count() == 2
    persisted_parent = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == parent.decision_id)
        .one()
    )
    assert persisted_parent.decision_payload["execution_plan"]["nodes"][0][
        "assigned_agent_id"
    ] == original_agent

    changed = change.model_copy(update={"reason": "a different execution change"})
    with pytest.raises(IdempotencyConflict):
        service.replan(
            parent.decision_id,
            changed,
            "orqaly-org-example",
            "orqaly-user",
            "axwise-user",
            "replan-agent-result",
        )


def test_output_rejection_adds_a_distinct_reviewer_and_recovery(decision_store):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    parent = service.create(request(), "axwise-user", "replan-output-parent")

    recovered = service.replan(
        parent.decision_id,
        ReplanRequestV1(
            trigger="output_rejected",
            reason="draft failed the factual review",
            failed_node_id="draft",
            rejected_output_node_ids=["draft"],
        ),
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-output-result",
    )

    node = next(node for node in recovered.execution_plan.nodes if node.node_id == "draft")
    assert recovered.routing_mode.value == "recovery"
    assert node.reviewer_agent_id
    assert node.reviewer_agent_id != node.assigned_agent_id
    assert "previously rejected" in " ".join(node.review_rules)


def test_tool_failure_can_change_plan_or_escalate_when_no_tool_is_available(
    decision_store,
):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    parent = service.create(request(), "axwise-user", "replan-tool-parent")
    current_tool = next(
        tool
        for tool in parent.input_snapshot.available_tools
        if tool.tool_id == "records_write"
    )
    recovered = service.replan(
        parent.decision_id,
        ReplanRequestV1(
            trigger="tool_failure",
            reason="writer endpoint failed and was replaced",
            failed_node_id="draft",
            failed_tool_ids=["records_write"],
            replacement_tools=[current_tool.model_copy(update={"available": True})],
        ),
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-tool-recovered",
    )
    escalated = service.replan(
        parent.decision_id,
        ReplanRequestV1(
            trigger="tool_failure",
            reason="writer endpoint failed without replacement",
            failed_node_id="draft",
            failed_tool_ids=["records_write"],
        ),
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-tool-escalated",
    )

    assert recovered.routing_mode.value == "recovery"
    assert escalated.routing_mode.value == "human_controlled"
    assert escalated.execution_plan.executable is False
    assert escalated.recommended_agents == []
    assert escalated.plan_feasibility.feasible is False


def test_budget_change_and_human_override_cannot_bypass_control(decision_store):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    parent = service.create(request(), "axwise-user", "replan-control-parent")
    budget = parent.input_snapshot.budget.model_copy(update={"maximum_cost": 10})
    over_budget = service.replan(
        parent.decision_id,
        ReplanRequestV1(
            trigger="budget_changed",
            reason="remaining execution budget was reduced",
            updated_budget=budget,
        ),
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-budget-result",
    )
    overridden = service.replan(
        parent.decision_id,
        ReplanRequestV1(
            trigger="human_override",
            reason="authorized operator requires manual checkpoints",
            human_instruction="Require approval before every remaining node",
        ),
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "replan-human-result",
    )

    assert over_budget.routing_mode.value == "human_controlled"
    assert over_budget.execution_plan.executable is False
    assert "budget" in " ".join(
        item.reason for item in over_budget.plan_feasibility.rejections
    )
    assert overridden.routing_mode.value == "human_controlled"
    assert overridden.replan_context.trigger.value == "human_override"
    assert overridden.execution_plan.nodes
    assert all(node.approval_gate_ids for node in overridden.execution_plan.nodes)


def test_replan_rejects_changed_state_outside_the_parent_snapshot(decision_store):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    parent = service.create(request(), "axwise-user", "replan-invalid-parent")
    change = ReplanRequestV1(
        trigger="output_rejected",
        reason="caller named a node that is not in the immutable parent",
        rejected_output_node_ids=["unknown-node"],
    )

    with pytest.raises(ReplanError, match="outside the parent plan"):
        service.replan(
            parent.decision_id,
            change,
            "orqaly-org-example",
            "orqaly-user",
            "axwise-user",
            "replan-invalid-result",
        )

    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 1
