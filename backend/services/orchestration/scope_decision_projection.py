"""Compact, hash-sealed planning and assignment outputs for Orqaly."""

from __future__ import annotations

from typing import Literal

from backend.domain.orchestration.models import OrchestrationDecisionV1
from backend.domain.orchestration.scope_models import (
    ScopeAssignmentDecisionProjectionV1,
    ScopeAssignmentSelectionV1,
    ScopePlanningDecisionProjectionV1,
    ScopePurposeDecisionProjectionV1,
)


def build_scope_decision_projection(
    result: OrchestrationDecisionV1,
    purpose: Literal["planning", "assignment"],
) -> ScopePurposeDecisionProjectionV1:
    """Project only bounded operational output, never a sealed input snapshot."""

    feasibility = result.plan_feasibility
    if feasibility is None:
        validation_status = "not_evaluated"
        rejections = []
    elif feasibility.feasible:
        validation_status = "feasible"
        rejections = []
    else:
        validation_status = "rejected"
        rejections = []
        seen_rejections = set()
        for item in feasibility.rejections:
            projected = {
                "code": item.code,
                "node_id": item.node_id,
                "agent_id": item.agent_id,
                "tool_id": item.tool_id,
            }
            key = tuple(projected.values())
            if key not in seen_rejections:
                seen_rejections.add(key)
                rejections.append(projected)
        rejections.sort(
            key=lambda item: tuple(
                str(item.get(field) or "")
                for field in ("code", "node_id", "agent_id", "tool_id")
            )
        )
    common = {
        "version": "axwise_scope_decision_projection_v1",
        "decision_id": result.decision_id,
        "decision_status": result.status.value,
        "routing_mode": result.routing_mode.value,
        "executable": result.execution_plan.executable,
        "validation_status": validation_status,
        "validation_rejections": rejections,
        "advisory_only": True,
    }
    if purpose == "planning":
        payload = {
            **common,
            "purpose": "planning",
            "nodes": [
                {
                    "node_id": node.node_id,
                    "title": node.title,
                    "assigned_agent_id": node.assigned_agent_id,
                    "required_capabilities": node.required_capabilities,
                    "tool_ids": node.tool_ids,
                    "dependencies": node.dependencies,
                    "input_contract": node.input_contract,
                    "output_contract": node.output_contract,
                    "completion_criteria": node.completion_criteria,
                    "approval_gate_ids": node.approval_gate_ids,
                    "reviewer_agent_id": node.reviewer_agent_id,
                    "review_rules": node.review_rules,
                    "budget": node.budget.model_dump(mode="json"),
                    "estimated_cost": node.estimated_cost,
                    "estimated_latency_ms": node.estimated_latency_ms,
                    "failure_policy": [
                        {
                            "trigger": failure.trigger,
                            "action": failure.action,
                            "maximum_attempts": failure.maximum_attempts,
                        }
                        for failure in node.failure_paths
                    ],
                }
                for node in result.execution_plan.nodes
            ],
            "team_member_ids": result.execution_plan.team_member_ids,
            "template_mode": (
                result.execution_plan.template_mode.value
                if result.execution_plan.template_mode is not None
                else None
            ),
            "total_estimated_cost": result.execution_plan.total_estimated_cost,
            "critical_path_latency_ms": result.execution_plan.critical_path_latency_ms,
            "currency": result.execution_plan.currency,
        }
        payload["projection_hash"] = (
            ScopePlanningDecisionProjectionV1.canonical_hash_for(payload)
        )
        return ScopePlanningDecisionProjectionV1.model_validate(payload)

    selected_agents = []
    for ranking in result.recommended_agents:
        nodes = [
            node
            for node in result.execution_plan.nodes
            if node.assigned_agent_id == ranking.agent_id
        ]
        selected_agents.append(
            ScopeAssignmentSelectionV1(
                agent_id=ranking.agent_id,
                node_ids=tuple(node.node_id for node in nodes),
                required_capabilities=tuple(
                    dict.fromkeys(
                        capability
                        for node in nodes
                        for capability in node.required_capabilities
                    )
                ),
                tool_ids=tuple(
                    dict.fromkeys(
                        tool_id for node in nodes for tool_id in node.tool_ids
                    )
                ),
                approval_gate_ids=tuple(
                    dict.fromkeys(
                        gate_id
                        for node in nodes
                        for gate_id in node.approval_gate_ids
                    )
                ),
            )
        )
    payload = {
        **common,
        "purpose": "assignment",
        "selected_agents": [item.model_dump(mode="json") for item in selected_agents],
    }
    payload["projection_hash"] = (
        ScopeAssignmentDecisionProjectionV1.canonical_hash_for(payload)
    )
    return ScopeAssignmentDecisionProjectionV1.model_validate(payload)


__all__ = ["build_scope_decision_projection"]
