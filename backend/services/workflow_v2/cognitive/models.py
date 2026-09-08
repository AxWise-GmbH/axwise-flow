"""Internal draft models, ports and execution-profile prompt projection. No transport or provider construction."""

from __future__ import annotations
from backend.domain.workflow_v2.contracts import (
    AcceptedDeliverableRequirementV1,
    CompileScopeInputV2,
    CompileScopeInputV3,
    DeliverableAcceptanceCriterionV1,
    EvidenceRequirement,
    ImmutableArtifactContent,
    ReaderOutputContractV1,
    RequirementCoverageV1,
    ReviseScopeInputV2,
    ScopeArtifactV2,
    SynthesizeArtifactInputV1,
)
from dataclasses import dataclass
from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Generic, Literal, Protocol, TypeVar
from uuid import UUID
from backend.services.workflow_v2.cognitive.policy import (
    _MAX_EVIDENCE_REQUIREMENTS,
)


class _DraftModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DraftSpan(_DraftModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class DraftTopicAnchor(_DraftModel):
    value: str = Field(min_length=1, max_length=300)
    source_spans: list[DraftSpan] = Field(min_length=1, max_length=12)


class DraftDeliverableProfile(_DraftModel):
    schema_version: Literal["axwise.deliverable-profile.v1"] = (
        "axwise.deliverable-profile.v1"
    )
    artifact_type: Literal[
        "product_prd",
        "software_prd",
        "research_strategy",
        "content_artifact",
        "operational_plan",
        "launch_authorization",
        "general_artifact",
    ]
    domain: str = Field(min_length=1, max_length=500)
    problem: str = Field(min_length=1, max_length=2000)
    desired_outcome: str = Field(min_length=1, max_length=2000)
    audiences: list[str] = Field(min_length=1, max_length=24)
    non_goals: list[str] = Field(default_factory=list, max_length=40)
    required_sections: list[str] = Field(min_length=1, max_length=80)


class DraftAcceptanceCriterion(_DraftModel):
    id: str | None = Field(default=None, pattern=r"^acc-[a-f0-9]{16}$")
    given: str = Field(min_length=1, max_length=2000)
    when: str = Field(min_length=1, max_length=2000)
    then: str = Field(min_length=1, max_length=2000)
    # Drafts bind by exact generated ID, accepted description or category. The
    # compiler replaces these with generated semantic requirement IDs.
    supports: list[str] = Field(min_length=1, max_length=120)


class ScopeDraft(_DraftModel):
    objective: str = Field(min_length=1, max_length=6000)
    objective_source_spans: list[DraftSpan] = Field(min_length=1, max_length=24)
    topic_anchors: list[DraftTopicAnchor] = Field(min_length=1, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(
        max_length=_MAX_EVIDENCE_REQUIREMENTS
    )
    deliverables: list[str] = Field(min_length=1, max_length=24)
    personas: list[str] = Field(default_factory=list, max_length=24)
    interview_requirements: list[str] = Field(default_factory=list, max_length=24)
    prd_requirements: list[str] = Field(default_factory=list, max_length=40)
    limits: list[str] = Field(default_factory=list, max_length=40)
    policies: list[str] = Field(default_factory=list, max_length=40)
    deliverable_profile: DraftDeliverableProfile
    acceptance_criteria: list[DraftAcceptanceCriterion] = Field(
        min_length=1, max_length=120
    )
    assumptions: list[str] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(
        default=None, min_length=1, max_length=1000
    )


class ScopeDraftContext(_DraftModel):
    request: str


@dataclass(frozen=True)
class ScopeAuthoritySegmentV1:
    start: int
    end: int
    authority: Literal["owner_current", "owner_prior", "assistant_reference"]


@dataclass(frozen=True)
class ScopeV3DraftContext:
    request: str
    owner_authority_text: str
    source_segments: tuple[ScopeAuthoritySegmentV1, ...]
    safe_default_constraints: frozenset[str]
    # Auditable execution identity only. This is intentionally kept outside
    # owner_authority_text so an Agent persona can never manufacture scope or
    # permissions.
    execution_agent: dict[str, Any] | None


def _execution_agent_prompt_value(input_value: Any) -> dict[str, Any] | None:
    execution_agent = getattr(input_value, "execution_agent", None)
    return (
        execution_agent.model_dump(mode="json", by_alias=True)
        if execution_agent is not None
        else None
    )


def _with_execution_agent_prompt(
    payload: dict[str, Any], input_value: Any
) -> dict[str, Any]:
    execution_agent = _execution_agent_prompt_value(input_value)
    if execution_agent is not None:
        payload["EXECUTION_AGENT"] = execution_agent
    return payload


TModelOutput = TypeVar("TModelOutput")


@dataclass(frozen=True)
class ModelOutput(Generic[TModelOutput]):
    value: TModelOutput
    input_tokens: int = 0
    output_tokens: int = 0
    model_version: str | None = None


class ScopeDrafter(Protocol):
    async def draft(
        self,
        input_value: CompileScopeInputV2 | CompileScopeInputV3,
        objective_context: list[str],
    ) -> ModelOutput[ScopeDraft] | ScopeDraft: ...


class ScopeRevisionDraft(_DraftModel):
    objective_changed: bool
    objective: str | None = Field(default=None, min_length=1, max_length=6000)
    objective_source_spans: list[DraftSpan] = Field(default_factory=list, max_length=24)
    topic_changed: bool
    topic_anchors: list[DraftTopicAnchor] = Field(default_factory=list, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(
        max_length=_MAX_EVIDENCE_REQUIREMENTS
    )
    deliverables: list[str] = Field(min_length=1, max_length=24)
    personas: list[str] = Field(default_factory=list, max_length=24)
    interview_requirements: list[str] = Field(default_factory=list, max_length=24)
    prd_requirements: list[str] = Field(default_factory=list, max_length=40)
    limits: list[str] = Field(default_factory=list, max_length=40)
    policies: list[str] = Field(default_factory=list, max_length=40)
    deliverable_profile: DraftDeliverableProfile
    acceptance_criteria: list[DraftAcceptanceCriterion] = Field(
        min_length=1, max_length=120
    )
    assumptions: list[str] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(
        default=None, min_length=1, max_length=1000
    )


class ScopeRevisionContext(_DraftModel):
    correction: str
    accepted_scope: ScopeArtifactV2


class ScopeReviser(Protocol):
    async def revise(
        self, input_value: ReviseScopeInputV2, accepted_scope: ScopeArtifactV2
    ) -> ModelOutput[ScopeRevisionDraft] | ScopeRevisionDraft: ...


class ResearchRunner(Protocol):
    async def search(self, query: str) -> dict[str, Any]: ...


class ArtifactResolver(Protocol):
    def artifact_fact(
        self, tenant_id: UUID, artifact_id: UUID
    ) -> dict[str, Any] | None: ...


class SynthesisDraft(_DraftModel):
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)


class TaskDraft(_DraftModel):
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)
    requirement_coverage: list[RequirementCoverageV1] = Field(
        min_length=1, max_length=120
    )
    conclusions: list[str] = Field(min_length=1, max_length=100)
    unknowns: list[str] = Field(default_factory=list, max_length=100)


class EvaluationDraft(_DraftModel):
    unsupported_precision: list[str] = Field(default_factory=list, max_length=40)
    contradictions: list[str] = Field(default_factory=list, max_length=40)
    stale_topic_references: list[str] = Field(default_factory=list, max_length=40)
    readiness_violations: list[str] = Field(default_factory=list, max_length=40)
    substantive_content_defects: list[str] = Field(default_factory=list, max_length=40)
    practicality_defects: list[str] = Field(default_factory=list, max_length=40)
    repair_instructions: list[str] = Field(default_factory=list, max_length=40)
    note: str = Field(min_length=1, max_length=2000)


class FinalRepairTopology(_DraftModel):
    heading_levels: list[int] = Field(default_factory=list)
    table_rows_by_header: dict[str, int] = Field(default_factory=dict)
    list_item_count: int = Field(default=0, ge=0)
    gwt_roles: list[str] = Field(default_factory=list)
    requirement_ids: list[str] = Field(default_factory=list)
    numbered_labels: list[str] = Field(default_factory=list)


class SynthesisContext(_DraftModel):
    purpose: Literal[
        "execute_task", "evaluate_output", "final_synthesis", "blocked_report"
    ] = "final_synthesis"
    required_sections: list[str]
    evidence_readiness: str
    allowed_claim_ids: list[str]
    allowed_claim_texts: dict[str, str] = Field(default_factory=dict)
    required_gap_labels: list[str]
    unresolved_evidence_requirements: list[str] = Field(default_factory=list)
    acceptance_requirement_ids: list[str] = Field(default_factory=list)
    accepted_requirements: list[AcceptedDeliverableRequirementV1] = Field(
        default_factory=list
    )
    accepted_acceptance_criteria: list[DeliverableAcceptanceCriterionV1] = Field(
        default_factory=list
    )
    repair_pass: int = Field(default=0, ge=0, le=1)
    quality_gate_required: bool = False
    practical_output_required: bool = False
    reader_output: ReaderOutputContractV1 | None = None
    artifact_type: str | None = None
    final_repair_topology: FinalRepairTopology | None = None


class SynthesisWriter(Protocol):
    async def execute_task(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[TaskDraft] | TaskDraft: ...

    async def evaluate_output(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[EvaluationDraft] | EvaluationDraft: ...

    async def write(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft] | SynthesisDraft: ...

    async def write_blocked(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft] | SynthesisDraft: ...
