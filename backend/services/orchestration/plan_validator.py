"""Deterministic graph, authority, approval, collaboration, and budget validation."""

from __future__ import annotations

from dataclasses import dataclass

from backend.domain.orchestration.enums import AgentAvailability
from backend.domain.orchestration.models import (
    ApprovalGate,
    DecisionCreateRequestV1,
    ExecutionPlan,
    PlanFeasibilityRejectionV1,
)
from backend.services.orchestration.capability_registry import CapabilityRegistry
from backend.domain.orchestration.validation import classification_allows, risk_allows


@dataclass(frozen=True)
class PlanValidationResult:
    valid: bool
    rejections: list[PlanFeasibilityRejectionV1]
    total_estimated_cost: float | None
    critical_path_latency_ms: int | None


class PlanValidator:
    def __init__(self, registry: CapabilityRegistry | None = None):
        self.registry = registry or CapabilityRegistry()

    @staticmethod
    def _critical_path(plan: ExecutionPlan) -> int | None:
        if not plan.nodes or any(node.estimated_latency_ms is None for node in plan.nodes):
            return None
        nodes = {node.node_id: node for node in plan.nodes}
        if any(
            dependency not in nodes
            for node in plan.nodes
            for dependency in node.dependencies
        ):
            return None
        memo: dict[str, int] = {}

        def duration(node_id: str) -> int:
            if node_id in memo:
                return memo[node_id]
            node = nodes[node_id]
            before = max((duration(dep) for dep in node.dependencies), default=0)
            memo[node_id] = before + int(node.estimated_latency_ms or 0)
            return memo[node_id]

        return max((duration(node_id) for node_id in nodes), default=0)

    @staticmethod
    def _has_cycle(plan: ExecutionPlan) -> bool:
        graph = {node.node_id: node.dependencies for node in plan.nodes}
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(node_id: str) -> bool:
            if node_id in visiting:
                return True
            if node_id in visited:
                return False
            visiting.add(node_id)
            for dependency in graph.get(node_id, []):
                if dependency in graph and visit(dependency):
                    return True
            visiting.remove(node_id)
            visited.add(node_id)
            return False

        return any(visit(node_id) for node_id in graph)

    @staticmethod
    def _reject(
        reason: str,
        node_id: str | None = None,
        agent_id: str | None = None,
        tool_id: str | None = None,
        code: str = "invalid_plan",
    ) -> PlanFeasibilityRejectionV1:
        return PlanFeasibilityRejectionV1(
            code=code,
            reason=reason,
            node_id=node_id,
            agent_id=agent_id,
            tool_id=tool_id,
        )

    def validate(
        self,
        request: DecisionCreateRequestV1,
        plan: ExecutionPlan,
        approval_points: list[ApprovalGate],
    ) -> PlanValidationResult:
        rejections: list[PlanFeasibilityRejectionV1] = []
        node_ids = [node.node_id for node in plan.nodes]
        known_nodes = set(node_ids)
        if not plan.nodes:
            rejections.append(self._reject("an executable team plan requires at least one node"))
        if len(node_ids) != len(known_nodes):
            rejections.append(self._reject("plan node identifiers must be unique"))
        for node in plan.nodes:
            unknown = set(node.dependencies) - known_nodes
            if unknown:
                rejections.append(
                    self._reject(
                        "node references unknown dependencies: " + ", ".join(sorted(unknown)),
                        node.node_id,
                    )
                )
            dependency_outputs = set(node.input_contract.get("dependency_outputs", []))
            if not set(node.dependencies).issubset(dependency_outputs):
                rejections.append(
                    self._reject(
                        "input contract does not declare every dependency output",
                        node.node_id,
                    )
                )
            if not node.input_contract or not node.output_contract:
                rejections.append(
                    self._reject("node input and output contracts must be non-empty", node.node_id)
                )
            if not node.completion_criteria:
                rejections.append(
                    self._reject("node requires an explicit completion signal", node.node_id)
                )
            if not node.failure_paths:
                rejections.append(self._reject("node requires a failure path", node.node_id))
            elif not any(
                path.action in {"request_replan", "escalate_to_human"}
                for path in node.failure_paths
            ):
                rejections.append(
                    self._reject("node failure paths require a reachable terminal fallback", node.node_id)
                )
        if self._has_cycle(plan):
            rejections.append(self._reject("plan dependency graph must be acyclic"))

        agents = {agent.agent_id: agent for agent in request.available_agents}
        tools = {tool.tool_id: tool for tool in request.available_tools}
        gates = {gate.gate_id: gate for gate in approval_points}
        approval_actions = set(
            self.registry.normalize_many(request.policy_context.human_approval_required_for)
        )
        planning = request.planning
        steps = {step.step_id: step for step in planning.steps} if planning else {}
        for node in plan.nodes:
            owner = agents.get(node.assigned_agent_id)
            if not owner:
                rejections.append(
                    self._reject(
                        "node owner is outside the supplied tenant catalogue",
                        node.node_id,
                        node.assigned_agent_id,
                        code="agent_not_owned",
                    )
                )
                continue
            if owner.availability != AgentAvailability.AVAILABLE:
                rejections.append(
                    self._reject(
                        "node owner is not currently available",
                        node.node_id,
                        owner.agent_id,
                        code="agent_unavailable",
                    )
                )
            if owner.agent_id in request.policy_context.denied_agent_ids:
                rejections.append(
                    self._reject(
                        "node owner is denied by policy",
                        node.node_id,
                        owner.agent_id,
                        code="agent_not_authorized",
                    )
                )
            if not classification_allows(
                owner.max_data_classification,
                request.task.data_classification,
            ) or not risk_allows(owner.max_risk_level, request.task.risk_level):
                rejections.append(
                    self._reject(
                        "node owner lacks required data or risk clearance",
                        node.node_id,
                        owner.agent_id,
                        code="agent_not_authorized",
                    )
                )
            owner_capabilities = set(
                self.registry.normalize_many(owner.capabilities)
            )
            if not set(node.required_capabilities).issubset(owner_capabilities):
                rejections.append(
                    self._reject(
                        "node owner lacks a required capability",
                        node.node_id,
                        owner.agent_id,
                        code="agent_not_authorized",
                    )
                )
            allowed_actions: set[str] = set()
            for tool_id in node.tool_ids:
                tool = tools.get(tool_id)
                if not tool or tool.org_id != request.tenant.org_id:
                    rejections.append(
                        self._reject(
                            "node tool is outside the tenant catalogue",
                            node.node_id,
                            owner.agent_id,
                            tool_id,
                            "tool_not_authorized",
                        )
                    )
                elif tool_id not in owner.tool_ids:
                    rejections.append(
                        self._reject(
                            "node owner is not authorized for the required tool",
                            node.node_id,
                            owner.agent_id,
                            tool_id,
                            "tool_not_authorized",
                        )
                    )
                else:
                    if not tool.available or tool_id in request.policy_context.denied_tool_ids:
                        rejections.append(
                            self._reject(
                                "node tool is unavailable or denied by policy",
                                node.node_id,
                                owner.agent_id,
                                tool_id,
                                "tool_unavailable",
                            )
                        )
                    if request.task.data_classification not in tool.allowed_data_classifications:
                        rejections.append(
                            self._reject(
                                "node tool cannot handle the task data classification",
                                node.node_id,
                                owner.agent_id,
                                tool_id,
                                "tool_not_authorized",
                            )
                        )
                    allowed_actions.update(
                        self.registry.normalize_many(tool.allowed_actions)
                    )
            if node.reviewer_agent_id == node.assigned_agent_id:
                rejections.append(
                    self._reject(
                        "a distinct reviewer cannot be the node owner",
                        node.node_id,
                        owner.agent_id,
                        code="policy_rejected",
                    )
                )
            elif node.reviewer_agent_id:
                reviewer = agents.get(node.reviewer_agent_id)
                if not reviewer or reviewer.org_id != request.tenant.org_id:
                    rejections.append(
                        self._reject(
                            "reviewer is outside the supplied tenant catalogue",
                            node.node_id,
                            node.reviewer_agent_id,
                            code="agent_not_owned",
                        )
                    )
            step = steps.get(node.node_id)
            actions = (
                set(self.registry.normalize_many(step.requested_actions)) if step else set()
            )
            prohibited = actions.intersection(
                self.registry.normalize_many(owner.prohibited_actions)
            )
            if prohibited:
                rejections.append(
                    self._reject(
                        "node owner is prohibited from a requested action",
                        node.node_id,
                        owner.agent_id,
                        code="agent_not_authorized",
                    )
                )
            if actions and node.tool_ids and not actions.issubset(allowed_actions):
                rejections.append(
                    self._reject(
                        "node tools do not authorize every requested action",
                        node.node_id,
                        owner.agent_id,
                        code="tool_not_authorized",
                    )
                )
            applicable_gates = {
                gate_id
                for gate_id in node.approval_gate_ids
                if gate_id in gates
                and gates[gate_id].required_before in {node.node_id, "execution"}
            }
            if actions.intersection(approval_actions) and not applicable_gates:
                rejections.append(
                    self._reject(
                        "consequential action is missing its configured approval gate",
                        node.node_id,
                        owner.agent_id,
                        code="policy_rejected",
                    )
                )
            if (
                planning
                and planning.pattern == "human_controlled"
                and not applicable_gates
            ):
                rejections.append(
                    self._reject(
                        "human-controlled node is missing its applicable approval gate",
                        node.node_id,
                        owner.agent_id,
                        code="policy_rejected",
                    )
                )
            if not set(node.approval_gate_ids).issubset(gates):
                rejections.append(
                    self._reject("node references an unknown approval gate", node.node_id)
                )

        if planning:
            owners = {node.node_id: node.assigned_agent_id for node in plan.nodes}
            for rule in planning.separation_of_duty_rules:
                assigned = [owners.get(step_id) for step_id in rule.step_ids]
                assigned = [agent_id for agent_id in assigned if agent_id]
                if len(assigned) != len(set(assigned)):
                    rejections.append(
                        self._reject(
                            f"separation-of-duty rule {rule.rule_id} was violated: {rule.reason}",
                            code="policy_rejected",
                        )
                    )
            members = {
                member
                for node in plan.nodes
                for member in [node.assigned_agent_id, node.reviewer_agent_id]
                if member
            }
            if len(members) > planning.maximum_team_size:
                rejections.append(
                    self._reject(
                        "selected team exceeds maximum_team_size",
                        code="policy_rejected",
                    )
                )
            required_tags = set(
                self.registry.normalize_many(planning.required_collaboration_tags)
            )
            for member_id in members:
                member = agents.get(member_id)
                if member and not required_tags.issubset(
                    self.registry.normalize_many(member.collaboration_tags)
                ):
                    rejections.append(
                        self._reject(
                            "team member lacks required collaboration tags",
                            agent_id=member_id,
                            code="policy_rejected",
                        )
                    )
            for member_id in members:
                member = agents.get(member_id)
                if member and set(member.incompatible_agent_ids).intersection(members):
                    rejections.append(
                        self._reject(
                            "team contains explicitly incompatible agents",
                            agent_id=member_id,
                            code="policy_rejected",
                        )
                    )

        costs = [node.estimated_cost for node in plan.nodes]
        total_cost = None if any(value is None for value in costs) else round(sum(costs), 6)
        critical_latency = None if self._has_cycle(plan) else self._critical_path(plan)
        budgets = [("request", request.budget)]
        if planning and planning.total_budget:
            budgets.append(("planning", planning.total_budget))
            if planning.total_budget.currency != request.budget.currency:
                rejections.append(
                    self._reject(
                        "planning and request budgets must use the same currency",
                        code="budget_exceeded",
                    )
                )
        for label, budget in budgets:
            if budget.maximum_cost is not None:
                if total_cost is None:
                    rejections.append(
                        self._reject(
                            f"plan cost cannot be proven within {label} budget",
                            code="budget_exceeded",
                        )
                    )
                elif total_cost > budget.maximum_cost:
                    rejections.append(
                        self._reject(
                            f"plan estimated cost exceeds {label} budget",
                            code="budget_exceeded",
                        )
                    )
            if budget.maximum_latency_ms is not None:
                if critical_latency is None:
                    rejections.append(
                        self._reject(
                            f"plan latency cannot be proven within {label} budget",
                            code="budget_exceeded",
                        )
                    )
                elif critical_latency > budget.maximum_latency_ms:
                    rejections.append(
                        self._reject(
                            f"plan critical path exceeds {label} latency budget",
                            code="budget_exceeded",
                        )
                    )
        return PlanValidationResult(
            valid=not rejections,
            rejections=rejections,
            total_estimated_cost=total_cost,
            critical_path_latency_ms=critical_latency,
        )
