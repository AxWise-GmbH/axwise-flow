"""Apply verified execution-state changes to an immutable planning snapshot."""

from __future__ import annotations

from dataclasses import dataclass

from backend.domain.orchestration.enums import AgentAvailability, ReplanTrigger
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    PlanStepV1,
    PlanningRequirementsV1,
    ReplanContextV1,
    ReplanRequestV1,
)


@dataclass(frozen=True)
class ReplanApplication:
    request: DecisionCreateRequestV1
    context: ReplanContextV1


class ReplanningService:
    @staticmethod
    def _planning(request: DecisionCreateRequestV1) -> PlanningRequirementsV1:
        if request.planning:
            return request.planning
        task = request.task
        return PlanningRequirementsV1(
            pattern="single",
            steps=[
                PlanStepV1(
                    step_id="node-direct-assignment",
                    title=task.objective,
                    objective=task.objective,
                    required_capabilities=task.required_capabilities,
                    preferred_capabilities=task.preferred_capabilities,
                    required_tools=task.required_tools,
                    requested_actions=task.requested_actions,
                    input_contract={"task_id": task.task_id},
                    output_contract={"desired_outcome": task.desired_outcome},
                    completion_criteria=[task.desired_outcome],
                )
            ],
        )

    def apply(
        self,
        request: DecisionCreateRequestV1,
        change: ReplanRequestV1,
    ) -> ReplanApplication:
        planning = self._planning(request)
        step_ids = {step.step_id for step in planning.steps}
        if change.failed_node_id and change.failed_node_id not in step_ids:
            raise ValueError("failed_node_id is outside the parent plan")
        if change.trigger == ReplanTrigger.AGENT_UNAVAILABLE:
            known_agents = {agent.agent_id for agent in request.available_agents}
            if not set(change.unavailable_agent_ids).issubset(known_agents):
                raise ValueError("unavailable_agent_ids are outside the parent catalogue")
        if change.trigger == ReplanTrigger.TOOL_FAILURE:
            known_tools = {tool.tool_id for tool in request.available_tools}
            if not set(change.failed_tool_ids).issubset(known_tools):
                raise ValueError("failed_tool_ids are outside the parent catalogue")
        if change.trigger == ReplanTrigger.OUTPUT_REJECTED and not set(
            change.rejected_output_node_ids
        ).issubset(step_ids):
            raise ValueError("rejected_output_node_ids are outside the parent plan")

        agents = {
            agent.agent_id: agent
            for agent in request.available_agents
            if agent.agent_id not in change.unavailable_agent_ids
        }
        for agent_id in change.unavailable_agent_ids:
            if agent_id in agents:
                agents[agent_id] = agents[agent_id].model_copy(
                    update={"availability": AgentAvailability.OFFLINE}
                )
        for replacement in change.replacement_agents:
            agents[replacement.agent_id] = replacement

        tools = {tool.tool_id: tool for tool in request.available_tools}
        for tool_id in change.failed_tool_ids:
            if tool_id in tools:
                tools[tool_id] = tools[tool_id].model_copy(update={"available": False})
        for replacement in change.replacement_tools:
            tools[replacement.tool_id] = replacement

        if change.trigger == ReplanTrigger.OUTPUT_REJECTED:
            rejected = set(change.rejected_output_node_ids)
            planning = planning.model_copy(
                update={
                    "steps": [
                        step.model_copy(
                            update={
                                "requires_distinct_reviewer": True,
                                "reviewer_capabilities": (
                                    step.reviewer_capabilities or ["review"]
                                ),
                                "review_rules": list(
                                    dict.fromkeys(
                                        [
                                            *step.review_rules,
                                            "Independently review the previously rejected output",
                                        ]
                                    )
                                ),
                            }
                        )
                        if step.step_id in rejected
                        else step
                        for step in planning.steps
                    ]
                }
            )
        if change.trigger == ReplanTrigger.HUMAN_OVERRIDE:
            planning = planning.model_copy(update={"pattern": "human_controlled"})

        facts = list(
            dict.fromkeys(
                [
                    *change.changed_facts,
                    f"replan trigger: {change.trigger.value}",
                    change.reason,
                ]
            )
        )
        constraints = list(request.task.constraints)
        if change.human_instruction:
            constraints.append(f"authorized human instruction: {change.human_instruction}")
        task = request.task.model_copy(
            update={"constraints": list(dict.fromkeys(constraints))}
        )
        policy = request.research_policy.model_copy(
            update={"allow_hybrid_research": False}
        )
        updated = request.model_copy(
            update={
                "task": task,
                "available_agents": list(agents.values()),
                "available_tools": list(tools.values()),
                "budget": change.updated_budget or request.budget,
                "planning": planning,
                "research_policy": policy,
            }
        )
        context = ReplanContextV1(
            trigger=change.trigger,
            reason=change.reason,
            failed_node_id=change.failed_node_id,
            unavailable_agent_ids=change.unavailable_agent_ids,
            failed_tool_ids=change.failed_tool_ids,
            rejected_output_node_ids=change.rejected_output_node_ids,
            changed_facts=facts,
        )
        return ReplanApplication(request=updated, context=context)
