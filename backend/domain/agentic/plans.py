"""Immutable universal execution-plan DAG contracts."""

from __future__ import annotations

from typing import Any, Literal, Tuple

from pydantic import AwareDatetime, Field, field_validator, model_validator

from backend.domain.agentic.base import (
    RFC8785_V1,
    AgenticContractModel,
    OpaqueReference,
    Sha256Digest,
    canonical_json_sha256,
)
from backend.domain.agentic.actions import ExternalActionSpecV1
from backend.domain.agentic.enums import EffectExternality, MutationKind, StepKind
from backend.domain.agentic.execution import ExecutionLimitsV1
from backend.domain.agentic.profiles import DataEgressProfileV1, EffectProfileV1
from backend.domain.agentic.references import (
    DescriptorVersionRefV1,
    ExecutorBindingVersionRefV1,
    PersonaVersionRefV1,
)


class ExecutionPlanNodeV1(AgenticContractModel):
    node_id: OpaqueReference
    title: str = Field(..., min_length=1, max_length=500)
    objective: str = Field(..., min_length=1, max_length=4_000)
    step_kind: StepKind
    descriptor: DescriptorVersionRefV1
    executor_binding: ExecutorBindingVersionRefV1
    assigned_agent_id: OpaqueReference
    persona_version: PersonaVersionRefV1
    reviewer_agent_id: OpaqueReference | None = None
    requires_distinct_reviewer: bool = False
    dependencies: Tuple[OpaqueReference, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    canonical_input_hash: Sha256Digest
    expected_output_schema_hash: Sha256Digest
    effect_profile: EffectProfileV1 = Field(default_factory=EffectProfileV1)
    data_egress_profile: DataEgressProfileV1 = Field(
        default_factory=DataEgressProfileV1
    )
    external_action: ExternalActionSpecV1 | None = None
    limits: ExecutionLimitsV1
    deadline: AwareDatetime | None = None

    @field_validator("dependencies")
    @classmethod
    def dependencies_are_canonical(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("node dependencies must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_node(self) -> "ExecutionPlanNodeV1":
        if self.node_id in self.dependencies:
            raise ValueError("a plan node cannot depend on itself")
        if self.reviewer_agent_id == self.assigned_agent_id:
            raise ValueError("a plan node reviewer must differ from its executor")
        if self.requires_distinct_reviewer and self.reviewer_agent_id is None:
            raise ValueError("a distinct reviewer is required but was not assigned")
        if (
            self.step_kind == StepKind.CONNECTOR_READ
            and self.effect_profile.externality != EffectExternality.READ
        ):
            raise ValueError("connector_read plan nodes require read externality")
        if (
            self.step_kind == StepKind.CONNECTOR_WRITE
            and self.effect_profile.externality != EffectExternality.WRITE
        ):
            raise ValueError("connector_write plan nodes require write externality")
        if (
            self.effect_profile.externality == EffectExternality.NONE
            and self.external_action is not None
        ):
            raise ValueError(
                "a non-external plan node cannot declare an external action"
            )
        if (
            self.effect_profile.externality != EffectExternality.NONE
            and self.external_action is None
        ):
            raise ValueError(
                "an external plan node requires a complete external action "
                "specification"
            )
        if (
            self.effect_profile.externality == EffectExternality.READ
            and self.external_action is not None
            and self.external_action.external_preconditions
        ):
            raise ValueError("external preconditions are valid only for writes")
        if (
            self.effect_profile.externality == EffectExternality.WRITE
            and self.effect_profile.mutation
            in {MutationKind.UPDATE, MutationKind.DELETE}
            and self.external_action is not None
            and not self.external_action.external_preconditions
        ):
            raise ValueError(
                "update and delete actions require an exact external precondition"
            )
        return self


class ExecutionPlanV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    canonicalization: Literal["rfc8785_v1"] = RFC8785_V1
    plan_id: OpaqueReference
    plan_version: int = Field(..., ge=1)
    content_hash: Sha256Digest
    owning_agent_id: OpaqueReference
    team_id: OpaqueReference
    team_member_ids: Tuple[OpaqueReference, ...] = Field(
        ...,
        min_length=1,
        max_length=5,
    )
    nodes: Tuple[ExecutionPlanNodeV1, ...] = Field(..., min_length=1, max_length=200)
    created_at: AwareDatetime

    @field_validator("team_member_ids")
    @classmethod
    def team_members_are_canonical(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("plan team_member_ids must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_dag(self) -> "ExecutionPlanV1":
        node_ids = [node.node_id for node in self.nodes]
        known = set(node_ids)
        if len(node_ids) != len(known):
            raise ValueError("execution plan nodes must have unique node_id values")
        for node in self.nodes:
            unknown = set(node.dependencies) - known
            if unknown:
                raise ValueError(
                    f"node {node.node_id} references unknown dependencies: "
                    + ", ".join(sorted(unknown))
                )

        visiting: set[str] = set()
        visited: set[str] = set()
        dependencies = {node.node_id: node.dependencies for node in self.nodes}

        def visit(node_id: str) -> None:
            if node_id in visiting:
                raise ValueError(
                    "execution plan dependencies must form an acyclic graph"
                )
            if node_id in visited:
                return
            visiting.add(node_id)
            for dependency_id in dependencies[node_id]:
                visit(dependency_id)
            visiting.remove(node_id)
            visited.add(node_id)

        for node_id in node_ids:
            visit(node_id)

        if self.owning_agent_id not in self.team_member_ids:
            raise ValueError("owning_agent_id must be a declared team member")
        for node in self.nodes:
            if node.assigned_agent_id not in self.team_member_ids:
                raise ValueError(
                    f"node {node.node_id} is assigned outside the plan team"
                )
            if (
                node.reviewer_agent_id is not None
                and node.reviewer_agent_id not in self.team_member_ids
            ):
                raise ValueError(
                    f"node {node.node_id} reviewer is outside the plan team"
                )
        expected_hash = canonical_json_sha256(
            self.model_dump(
                mode="json",
                exclude={"content_hash"},
                exclude_none=True,
            )
        )
        if self.content_hash != expected_hash:
            raise ValueError("plan content_hash does not match RFC 8785 plan bytes")
        return self

    def topological_order(self) -> Tuple[str, ...]:
        """Return a deterministic dependency-first node order."""

        dependencies = {node.node_id: node.dependencies for node in self.nodes}
        visited: set[str] = set()
        ordered: list[str] = []

        def visit(node_id: str) -> None:
            if node_id in visited:
                return
            for dependency_id in dependencies[node_id]:
                visit(dependency_id)
            visited.add(node_id)
            ordered.append(node_id)

        for node_id in sorted(dependencies):
            visit(node_id)
        return tuple(ordered)


ExecutionPlanDAGV1 = ExecutionPlanV1
PlanNodeV1 = ExecutionPlanNodeV1


def build_execution_plan_v1(**values: Any) -> ExecutionPlanV1:
    """Construct a plan whose source hash covers every effective execution limit."""

    payload = {
        "contract_version": "1.0",
        "canonicalization": RFC8785_V1,
        **values,
    }
    # Use the contract's JSON serializer before hashing so values such as
    # timezone-aware datetimes have exactly the same representation here and
    # in the model-level integrity check.
    candidate = ExecutionPlanV1.model_construct(
        content_hash="0" * 64,
        **payload,
    )
    content_hash = canonical_json_sha256(
        candidate.model_dump(
            mode="json",
            exclude={"content_hash"},
            exclude_none=True,
        )
    )
    return ExecutionPlanV1(content_hash=content_hash, **payload)


__all__ = [
    "ExecutionPlanDAGV1",
    "ExecutionPlanNodeV1",
    "ExecutionPlanV1",
    "PlanNodeV1",
    "build_execution_plan_v1",
]
