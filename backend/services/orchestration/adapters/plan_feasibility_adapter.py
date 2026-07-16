"""Orqaly-facing feasibility contract over the current authenticated catalogue."""

from __future__ import annotations

from backend.domain.orchestration.enums import AgentAvailability
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    ExecutionPlan,
    PlanFeasibilityRejectionV1,
    PlanFeasibilityResultV1,
)


class CataloguePlanFeasibilityAdapter:
    """Revalidate a recommendation against the latest Orqaly-supplied state."""

    def validate(
        self,
        request: DecisionCreateRequestV1,
        plan: ExecutionPlan,
    ) -> PlanFeasibilityResultV1:
        agents = {agent.agent_id: agent for agent in request.available_agents}
        tools = {tool.tool_id: tool for tool in request.available_tools}
        rejections: list[PlanFeasibilityRejectionV1] = []
        for node in plan.nodes:
            owner = agents.get(node.assigned_agent_id)
            if not owner or owner.org_id != request.tenant.org_id:
                rejections.append(
                    PlanFeasibilityRejectionV1(
                        code="agent_not_owned",
                        reason="node owner is no longer in the authenticated tenant catalogue",
                        node_id=node.node_id,
                        agent_id=node.assigned_agent_id,
                    )
                )
                continue
            if owner.availability != AgentAvailability.AVAILABLE:
                rejections.append(
                    PlanFeasibilityRejectionV1(
                        code="agent_unavailable",
                        reason=f"node owner availability is {owner.availability.value}",
                        node_id=node.node_id,
                        agent_id=owner.agent_id,
                    )
                )
            if node.reviewer_agent_id:
                reviewer = agents.get(node.reviewer_agent_id)
                if not reviewer or reviewer.org_id != request.tenant.org_id:
                    rejections.append(
                        PlanFeasibilityRejectionV1(
                            code="agent_not_owned",
                            reason="reviewer is no longer in the authenticated tenant catalogue",
                            node_id=node.node_id,
                            agent_id=node.reviewer_agent_id,
                        )
                    )
                elif reviewer.availability != AgentAvailability.AVAILABLE:
                    rejections.append(
                        PlanFeasibilityRejectionV1(
                            code="agent_unavailable",
                            reason=f"reviewer availability is {reviewer.availability.value}",
                            node_id=node.node_id,
                            agent_id=reviewer.agent_id,
                        )
                    )
            for tool_id in node.tool_ids:
                tool = tools.get(tool_id)
                if not tool or tool.org_id != request.tenant.org_id:
                    rejections.append(
                        PlanFeasibilityRejectionV1(
                            code="tool_not_authorized",
                            reason="required tool is outside the authenticated tenant catalogue",
                            node_id=node.node_id,
                            agent_id=owner.agent_id,
                            tool_id=tool_id,
                        )
                    )
                elif not tool.available:
                    rejections.append(
                        PlanFeasibilityRejectionV1(
                            code="tool_unavailable",
                            reason="required tool is currently unavailable",
                            node_id=node.node_id,
                            agent_id=owner.agent_id,
                            tool_id=tool_id,
                        )
                    )
        return PlanFeasibilityResultV1(
            feasible=not rejections,
            source="catalogue_snapshot",
            rejections=rejections,
        )
