"""Deterministic Phase 3 team construction and plan-template selection."""

from __future__ import annotations

from dataclasses import dataclass

from backend.domain.orchestration.enums import RoutingMode
from backend.domain.orchestration.models import (
    AgentCandidateV1,
    AgentRanking,
    ApprovalGate,
    BudgetV1,
    DecisionCreateRequestV1,
    ExecutionPlan,
    NodeFailurePathV1,
    PlanNode,
    PlanStepV1,
)
from backend.services.orchestration.action_authority import (
    exact_tool_action_grants,
    normalized_action_ids,
    sealed_consequential_action_ids,
)
from backend.services.orchestration.assignment_scorer import AssignmentScorer
from backend.services.orchestration.plan_validator import (
    PlanValidationResult,
    PlanValidator,
)


@dataclass(frozen=True)
class TeamPlanResult:
    plan: ExecutionPlan
    recommended_agents: list[AgentRanking]
    approval_points: list[ApprovalGate]
    validation: PlanValidationResult


class TeamPlanner:
    def __init__(
        self,
        scorer: AssignmentScorer | None = None,
        validator: PlanValidator | None = None,
    ):
        self.scorer = scorer or AssignmentScorer()
        self.validator = validator or PlanValidator(self.scorer.registry)

    @staticmethod
    def default_failure_paths() -> list[NodeFailurePathV1]:
        return [
            NodeFailurePathV1(
                trigger="transient_failure",
                action="retry",
                maximum_attempts=1,
                reason="retry one bounded transient failure",
            ),
            NodeFailurePathV1(
                trigger="agent_unavailable",
                action="substitute_agent",
                reason="request a currently eligible substitute",
            ),
            NodeFailurePathV1(
                trigger="tool_failure",
                action="request_replan",
                reason="tool authority or workflow must change immutably",
            ),
            NodeFailurePathV1(
                trigger="approval_rejected",
                action="escalate_to_human",
                reason="a rejected consequential action cannot continue autonomously",
            ),
        ]

    @staticmethod
    def _pattern_mode(pattern: str, base_mode: RoutingMode) -> RoutingMode:
        return {
            "single": base_mode,
            "sequential": RoutingMode.SEQUENTIAL,
            "parallel": RoutingMode.PARALLEL,
            "supervisor": RoutingMode.SUPERVISOR,
            "human_controlled": RoutingMode.HUMAN_CONTROLLED,
        }[pattern]

    def _compatible_candidates(
        self,
        request: DecisionCreateRequestV1,
        selected_ids: set[str],
        forbidden_ids: set[str],
    ) -> list[AgentCandidateV1]:
        planning = request.planning
        required_tags = set(
            self.scorer.registry.normalize_many(
                planning.required_collaboration_tags if planning else []
            )
        )
        selected = {
            agent.agent_id: agent
            for agent in request.available_agents
            if agent.agent_id in selected_ids
        }
        candidates = []
        for agent in request.available_agents:
            tags = set(self.scorer.registry.normalize_many(agent.collaboration_tags))
            if agent.agent_id in forbidden_ids or not required_tags.issubset(tags):
                continue
            if set(agent.incompatible_agent_ids).intersection(selected_ids):
                continue
            if any(
                agent.agent_id in member.incompatible_agent_ids
                for member in selected.values()
            ):
                continue
            candidates.append(agent)
        return candidates

    @staticmethod
    def _effective_budget(
        request: DecisionCreateRequestV1,
        step: PlanStepV1,
    ) -> BudgetV1:
        if step.budget.maximum_cost is not None or step.budget.maximum_latency_ms is not None:
            return step.budget
        return request.budget

    def _step_request(
        self,
        request: DecisionCreateRequestV1,
        step: PlanStepV1,
        candidates: list[AgentCandidateV1],
        reviewer: bool = False,
    ) -> DecisionCreateRequestV1:
        required = (
            step.reviewer_capabilities or step.required_capabilities
            if reviewer
            else step.required_capabilities
        )
        task = request.task.model_copy(
            update={
                "objective": (
                    f"Review the output of {step.title}" if reviewer else step.objective
                ),
                "desired_outcome": (
                    "An explicit approved or rejected review decision"
                    if reviewer
                    else "; ".join(step.completion_criteria)
                ),
                "required_capabilities": required,
                "preferred_capabilities": [] if reviewer else step.preferred_capabilities,
                "required_tools": [] if reviewer else step.required_tools,
                "requested_actions": [] if reviewer else step.requested_actions,
            }
        )
        return request.model_copy(
            update={
                "task": task,
                "available_agents": candidates,
                "budget": self._effective_budget(request, step),
                "planning": None,
            }
        )

    @staticmethod
    def _agent(request: DecisionCreateRequestV1, agent_id: str) -> AgentCandidateV1:
        return next(agent for agent in request.available_agents if agent.agent_id == agent_id)

    def _separation_forbidden(
        self,
        request: DecisionCreateRequestV1,
        step_id: str,
        owners: dict[str, str],
    ) -> set[str]:
        planning = request.planning
        if not planning:
            return set()
        forbidden: set[str] = set()
        for rule in planning.separation_of_duty_rules:
            if step_id in rule.step_ids:
                forbidden.update(
                    owners[related]
                    for related in rule.step_ids
                    if related in owners
                )
        return forbidden

    def _select(
        self,
        request: DecisionCreateRequestV1,
        step: PlanStepV1,
        selected_ids: set[str],
        forbidden_ids: set[str],
        reviewer: bool = False,
    ) -> AgentRanking | None:
        candidates = self._compatible_candidates(
            request,
            selected_ids,
            forbidden_ids,
        )
        return self.scorer.score(
            self._step_request(request, step, candidates, reviewer=reviewer)
        ).selected

    def build(
        self,
        request: DecisionCreateRequestV1,
        base_mode: RoutingMode,
    ) -> TeamPlanResult:
        planning = request.planning
        if not planning:
            raise ValueError("team planning requires planning inputs")
        selected_ids: set[str] = set()
        owners: dict[str, str] = {}
        rankings: dict[str, AgentRanking] = {}
        nodes: list[PlanNode] = []
        approvals: list[ApprovalGate] = []
        planning_errors = []
        approval_actions = set(
            self.scorer.registry.normalize_many(
                request.policy_context.human_approval_required_for
            )
        )
        consequential_actions = sealed_consequential_action_ids(
            request,
            self.scorer.registry,
        )
        gated_actions = approval_actions.union(consequential_actions)

        for index, step in enumerate(planning.steps):
            forbidden = self._separation_forbidden(request, step.step_id, owners)
            owner = self._select(request, step, selected_ids, forbidden)
            if not owner:
                planning_errors.append(
                    f"step {step.step_id} has no eligible owner after team constraints"
                )
                continue
            owners[step.step_id] = owner.agent_id
            selected_ids.add(owner.agent_id)
            rankings.setdefault(owner.agent_id, owner)

            reviewer = None
            if step.requires_distinct_reviewer:
                reviewer = self._select(
                    request,
                    step,
                    selected_ids,
                    {owner.agent_id},
                    reviewer=True,
                )
                if not reviewer:
                    planning_errors.append(
                        f"step {step.step_id} has no eligible distinct reviewer"
                    )
                    continue
                selected_ids.add(reviewer.agent_id)
                rankings.setdefault(reviewer.agent_id, reviewer)

            dependencies = list(step.dependencies)
            if planning.pattern == "sequential" and index and not dependencies:
                dependencies = [planning.steps[index - 1].step_id]
            input_contract = dict(step.input_contract)
            input_contract["dependency_outputs"] = list(
                dict.fromkeys(
                    [*input_contract.get("dependency_outputs", []), *dependencies]
                )
            )
            actions = normalized_action_ids(
                step.requested_actions,
                self.scorer.registry,
            )
            needs_approval = bool(actions.intersection(gated_actions)) or (
                planning.pattern == "human_controlled"
            )
            gate_ids: list[str] = []
            if needs_approval:
                gate_id = f"gate-{step.step_id}"
                gate_ids.append(gate_id)
                approvals.append(
                    ApprovalGate(
                        gate_id=gate_id,
                        reason=(
                            "sealed consequential action requires Orqaly approval"
                            if actions.intersection(consequential_actions)
                            else "configured action requires Orqaly approval"
                            if actions.intersection(approval_actions)
                            else "human-controlled plan requires authorization before every node"
                        ),
                        required_before=step.step_id,
                    )
                )
            owner_agent = self._agent(request, owner.agent_id)
            reviewer_agent = (
                self._agent(request, reviewer.agent_id) if reviewer else None
            )
            cost_values = [owner_agent.estimated_cost]
            latency_values = [owner_agent.estimated_latency_ms]
            if reviewer_agent:
                cost_values.append(reviewer_agent.estimated_cost)
                latency_values.append(reviewer_agent.estimated_latency_ms)
            estimated_cost = (
                None
                if any(value is None for value in cost_values)
                else round(sum(float(value) for value in cost_values), 6)
            )
            estimated_latency = (
                None
                if any(value is None for value in latency_values)
                else sum(int(value) for value in latency_values)
            )
            tool_action_grants = exact_tool_action_grants(
                request,
                step.required_tools,
                step.requested_actions,
                self.scorer.registry,
            )
            if {grant.tool_id for grant in tool_action_grants} != set(
                step.required_tools
            ):
                planning_errors.append(
                    f"step {step.step_id} attaches a tool without an exact requested-action grant"
                )
                continue
            nodes.append(
                PlanNode(
                    node_id=step.step_id,
                    title=step.title,
                    assigned_agent_id=owner.agent_id,
                    required_capabilities=self.scorer.registry.normalize_many(
                        step.required_capabilities
                    ),
                    tool_ids=step.required_tools,
                    tool_action_grants=tool_action_grants,
                    dependencies=dependencies,
                    input_contract=input_contract,
                    output_contract=step.output_contract,
                    completion_criteria=step.completion_criteria,
                    approval_gate_ids=gate_ids,
                    reviewer_agent_id=reviewer.agent_id if reviewer else None,
                    review_rules=step.review_rules,
                    budget=self._effective_budget(request, step),
                    estimated_cost=estimated_cost,
                    estimated_latency_ms=estimated_latency,
                    failure_paths=self.default_failure_paths(),
                )
            )

        if planning.pattern == "supervisor" and not planning_errors:
            terminal_ids = {
                node.node_id for node in nodes
            } - {dependency for node in nodes for dependency in node.dependencies}
            supervisor_step = PlanStepV1(
                step_id="supervisor-review",
                title="Supervise and accept the team outputs",
                objective="Review every terminal output and issue an acceptance decision",
                required_capabilities=planning.supervisor_capabilities,
                input_contract={"dependency_outputs": sorted(terminal_ids)},
                output_contract={"review_decision": "approved_or_rejected"},
                completion_criteria=["Every terminal output is approved or rejected with reasons"],
            )
            supervisor = self._select(request, supervisor_step, selected_ids, set())
            if not supervisor:
                planning_errors.append("supervisor pattern has no eligible supervisor")
            else:
                selected_ids.add(supervisor.agent_id)
                rankings.setdefault(supervisor.agent_id, supervisor)
                agent = self._agent(request, supervisor.agent_id)
                nodes.append(
                    PlanNode(
                        node_id=supervisor_step.step_id,
                        title=supervisor_step.title,
                        assigned_agent_id=supervisor.agent_id,
                        required_capabilities=self.scorer.registry.normalize_many(
                            supervisor_step.required_capabilities
                        ),
                        tool_action_grants=[],
                        dependencies=sorted(terminal_ids),
                        input_contract=supervisor_step.input_contract,
                        output_contract=supervisor_step.output_contract,
                        completion_criteria=supervisor_step.completion_criteria,
                        review_rules=["Reject any output that violates a guardrail"],
                        estimated_cost=agent.estimated_cost,
                        estimated_latency_ms=agent.estimated_latency_ms,
                        failure_paths=self.default_failure_paths(),
                    )
                )

        mode = self._pattern_mode(planning.pattern, base_mode)
        ranked = [
            value.model_copy(update={"rank": index})
            for index, value in enumerate(
                sorted(rankings.values(), key=lambda value: (-value.score, value.agent_id)),
                1,
            )
        ]
        plan = ExecutionPlan(
            mode=mode,
            nodes=nodes,
            team_member_ids=sorted(selected_ids),
            currency=(planning.total_budget or request.budget).currency,
        )
        validation = self.validator.validate(request, plan, approvals)
        if planning_errors:
            validation = PlanValidationResult(
                valid=False,
                rejections=[
                    *validation.rejections,
                    *[
                        self.validator._reject(reason)
                        for reason in planning_errors
                    ],
                ],
                total_estimated_cost=validation.total_estimated_cost,
                critical_path_latency_ms=validation.critical_path_latency_ms,
            )
        plan = plan.model_copy(
            update={
                "total_estimated_cost": validation.total_estimated_cost,
                "critical_path_latency_ms": validation.critical_path_latency_ms,
                "executable": validation.valid,
            }
        )
        return TeamPlanResult(
            plan=plan,
            recommended_agents=ranked,
            approval_points=approvals,
            validation=validation,
        )
