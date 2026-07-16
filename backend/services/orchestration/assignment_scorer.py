"""Versioned deterministic eligibility and weighted assignment scorer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from backend.domain.orchestration.enums import AgentAvailability, FactorStatus
from backend.domain.orchestration.models import (
    AgentCandidateV1,
    AgentRanking,
    AssignmentFactor,
    DecisionCreateRequestV1,
    SCORER_VERSION,
    ToolCandidateV1,
)
from backend.domain.orchestration.validation import classification_allows, risk_allows
from backend.services.orchestration.capability_registry import CapabilityRegistry


WEIGHTS = {
    "required_capability_coverage": 0.35,
    "preferred_capability_coverage": 0.15,
    "tool_readiness": 0.15,
    "relevant_success_rate": 0.15,
    "cost_efficiency": 0.08,
    "latency_efficiency": 0.05,
    "stakeholder_fit": 0.07,
}


@dataclass(frozen=True)
class ScoringResult:
    rankings: list[AgentRanking]
    required_capabilities: list[str]
    preferred_capabilities: list[str]

    @property
    def selected(self) -> AgentRanking | None:
        return next((ranking for ranking in self.rankings if ranking.eligible), None)


class AssignmentScorer:
    version = SCORER_VERSION

    def __init__(self, registry: CapabilityRegistry | None = None):
        self.registry = registry or CapabilityRegistry()

    @staticmethod
    def _factor(
        name: str,
        value: float | None,
        reason: str,
        status: FactorStatus | None = None,
    ) -> AssignmentFactor:
        weight = WEIGHTS[name]
        resolved_status = status or (
            FactorStatus.MISSING
            if value is None
            else FactorStatus.POSITIVE
            if value >= 0.5
            else FactorStatus.NEGATIVE
        )
        return AssignmentFactor(
            factor=name,
            weight=weight,
            value=value,
            contribution=round(weight * (value or 0.0), 6),
            status=resolved_status,
            reason=reason,
        )

    def _eligible_tools(
        self, request: DecisionCreateRequestV1
    ) -> dict[str, ToolCandidateV1]:
        return {
            tool.tool_id: tool
            for tool in request.available_tools
            if tool.org_id == request.tenant.org_id
        }

    def _score_agent(
        self,
        request: DecisionCreateRequestV1,
        agent: AgentCandidateV1,
        required: list[str],
        preferred: list[str],
        tools: dict[str, ToolCandidateV1],
    ) -> AgentRanking:
        task = request.task
        policy = request.policy_context
        budget = request.budget
        agent_capabilities = set(self.registry.normalize_many(agent.capabilities))
        agent_tools = set(agent.tool_ids)
        required_tools = set(task.required_tools)
        requested_actions = {self.registry.normalize(value) for value in task.requested_actions}
        exclusions: list[str] = []

        if agent.org_id != request.tenant.org_id:
            exclusions.append("agent belongs to a different tenant")
        if agent.availability != AgentAvailability.AVAILABLE:
            exclusions.append(f"agent availability is {agent.availability.value}")
        if agent.agent_id in policy.denied_agent_ids:
            exclusions.append("agent is denied by policy")
        if task.data_classification not in policy.allowed_data_classifications:
            exclusions.append("task data classification is denied by policy")
        missing_capabilities = sorted(set(required) - agent_capabilities)
        if missing_capabilities:
            exclusions.append(
                "missing required capabilities: " + ", ".join(missing_capabilities)
            )
        missing_agent_tools = sorted(required_tools - agent_tools)
        if missing_agent_tools:
            exclusions.append("agent lacks required tools: " + ", ".join(missing_agent_tools))
        if not classification_allows(
            agent.max_data_classification, task.data_classification
        ):
            exclusions.append("agent data-classification clearance is insufficient")
        if not risk_allows(agent.max_risk_level, task.risk_level):
            exclusions.append("agent risk clearance is insufficient")
        prohibited = requested_actions.intersection(
            self.registry.normalize_many(agent.prohibited_actions)
        )
        if prohibited:
            exclusions.append("agent is prohibited from actions: " + ", ".join(sorted(prohibited)))
        if budget.maximum_cost is not None and (
            agent.estimated_cost is not None
            and agent.estimated_cost > budget.maximum_cost
        ):
            exclusions.append("agent estimated cost exceeds the budget")
        if budget.maximum_latency_ms is not None and (
            agent.estimated_latency_ms is not None
            and agent.estimated_latency_ms > budget.maximum_latency_ms
        ):
            exclusions.append("agent estimated latency exceeds the budget")

        allowed_tool_actions: set[str] = set()
        for tool_id in required_tools:
            tool = tools.get(tool_id)
            if not tool:
                exclusions.append(f"required tool {tool_id} is outside the tenant catalogue")
                continue
            if not tool.available:
                exclusions.append(f"required tool {tool_id} is unavailable")
            if tool_id in policy.denied_tool_ids:
                exclusions.append(f"required tool {tool_id} is denied by policy")
            if task.data_classification not in tool.allowed_data_classifications:
                exclusions.append(
                    f"required tool {tool_id} cannot handle {task.data_classification.value} data"
                )
            allowed_actions = {
                self.registry.normalize(value) for value in tool.allowed_actions
            }
            allowed_tool_actions.update(allowed_actions)
        if (
            requested_actions
            and required_tools
            and not requested_actions.issubset(allowed_tool_actions)
        ):
            exclusions.append("required tools do not cover every requested action scope")

        required_coverage = (
            len(set(required).intersection(agent_capabilities)) / len(required)
            if required
            else 1.0
        )
        preferred_coverage = (
            len(set(preferred).intersection(agent_capabilities)) / len(preferred)
            if preferred
            else None
        )
        tool_coverage = (
            len(required_tools.intersection(agent_tools)) / len(required_tools)
            if required_tools
            else 1.0
        )
        cost_efficiency = None
        if budget.maximum_cost is not None and agent.estimated_cost is not None:
            cost_efficiency = max(
                0.0, 1.0 - (agent.estimated_cost / max(budget.maximum_cost, 0.000001))
            )
        latency_efficiency = None
        if budget.maximum_latency_ms and agent.estimated_latency_ms is not None:
            latency_efficiency = max(
                0.0, 1.0 - (agent.estimated_latency_ms / budget.maximum_latency_ms)
            )
        normalized_stakeholders = set(self.registry.normalize_many(task.stakeholders))
        stakeholder_tags = set(self.registry.normalize_many(agent.stakeholder_tags))
        stakeholder_fit = (
            len(normalized_stakeholders.intersection(stakeholder_tags))
            / len(normalized_stakeholders)
            if normalized_stakeholders
            else None
        )

        factors = [
            self._factor(
                "required_capability_coverage",
                required_coverage,
                f"covers {len(set(required).intersection(agent_capabilities))}/{len(required)} required capabilities"
                if required
                else "no explicit required capabilities",
            ),
            self._factor(
                "preferred_capability_coverage",
                preferred_coverage,
                "preferred capability data is absent"
                if preferred_coverage is None
                else f"covers {len(set(preferred).intersection(agent_capabilities))}/{len(preferred)} preferred capabilities",
            ),
            self._factor(
                "tool_readiness",
                tool_coverage,
                f"covers {len(required_tools.intersection(agent_tools))}/{len(required_tools)} required tools"
                if required_tools
                else "no tools are required",
            ),
            self._factor(
                "relevant_success_rate",
                agent.success_rate,
                "success history is missing"
                if agent.success_rate is None
                else "tenant-supplied relevant success rate",
            ),
            self._factor(
                "cost_efficiency",
                cost_efficiency,
                "cost or maximum budget is missing"
                if cost_efficiency is None
                else "estimated cost relative to maximum budget",
            ),
            self._factor(
                "latency_efficiency",
                latency_efficiency,
                "latency estimate or maximum latency is missing"
                if latency_efficiency is None
                else "estimated latency relative to maximum latency",
            ),
            self._factor(
                "stakeholder_fit",
                stakeholder_fit,
                "stakeholder fit data is missing"
                if stakeholder_fit is None
                else "overlap with requested stakeholder tags",
            ),
        ]
        eligible = not exclusions
        score = round(sum(factor.contribution for factor in factors), 6) if eligible else 0.0
        if not eligible:
            factors = [
                factor.model_copy(update={"status": FactorStatus.EXCLUDED})
                for factor in factors
            ]
        return AgentRanking(
            rank=1,
            agent_id=agent.agent_id,
            agent_name=agent.name,
            eligible=eligible,
            score=score,
            factors=factors,
            exclusion_reasons=list(dict.fromkeys(exclusions)),
        )

    def score(self, request: DecisionCreateRequestV1) -> ScoringResult:
        required, preferred = self.registry.requirements_for(request.task)
        tools = self._eligible_tools(request)
        rankings = [
            self._score_agent(request, agent, required, preferred, tools)
            for agent in request.available_agents
        ]
        rankings.sort(
            key=lambda item: (
                0 if item.eligible else 1,
                -item.score,
                item.agent_id,
            )
        )
        rankings = [item.model_copy(update={"rank": index}) for index, item in enumerate(rankings, 1)]
        return ScoringResult(
            rankings=rankings,
            required_capabilities=required,
            preferred_capabilities=preferred,
        )
