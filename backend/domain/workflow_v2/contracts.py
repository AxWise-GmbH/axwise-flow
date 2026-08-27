from __future__ import annotations

import hashlib
import json
from typing import Annotated, Any, Literal, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


Sha256 = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
ClerkUserId = Annotated[str, StringConstraints(pattern=r"^user_[A-Za-z0-9]+$")]
ClerkOrganizationId = Annotated[str, StringConstraints(pattern=r"^org_[A-Za-z0-9]+$")]


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="forbid",
    )


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class ArtifactRef(ContractModel):
    artifact_id: UUID
    artifact_hash: Sha256
    kind: Annotated[str, StringConstraints(min_length=1, max_length=120)]


class SourceSpan(ContractModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    text: str = Field(min_length=1)
    sha256: Sha256

    @model_validator(mode="after")
    def ordered(self) -> "SourceSpan":
        if self.end <= self.start:
            raise ValueError("source span end must be greater than start")
        return self


class EvidenceRequirement(ContractModel):
    id: str = Field(min_length=1, max_length=120)
    claim_type: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    criticality: Literal["blocking", "nonblocking"]
    applies_when: str = Field(min_length=1, max_length=1000)
    accepted_source_types: list[str] = Field(min_length=1, max_length=20)


class TopicAnchor(ContractModel):
    value: str = Field(min_length=1, max_length=300)
    source_spans: list[SourceSpan] = Field(min_length=1, max_length=12)


class ScopeAuthority(ContractModel):
    canonical_input_hash: Sha256
    seal: str = Field(min_length=32, max_length=512)


class ScopeArtifactV2(ContractModel):
    schema_version: Literal["axwise.scope.v2"] = "axwise.scope.v2"
    objective: str = Field(min_length=1, max_length=6000)
    objective_source_spans: list[SourceSpan] = Field(min_length=1, max_length=24)
    topic_anchors: list[TopicAnchor] = Field(min_length=1, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=80)
    deliverables: list[str] = Field(min_length=1, max_length=24)
    personas: list[str] = Field(default_factory=list, max_length=24)
    interview_requirements: list[str] = Field(default_factory=list, max_length=24)
    prd_requirements: list[str] = Field(default_factory=list, max_length=40)
    limits: list[str] = Field(default_factory=list, max_length=40)
    policies: list[str] = Field(default_factory=list, max_length=40)
    assumptions: list[str] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(default=None, min_length=1, max_length=1000)
    research_input_hash: Sha256
    authority: ScopeAuthority


class EvidenceFinding(ContractModel):
    requirement_id: str = Field(min_length=1, max_length=120)
    status: Literal["verified", "missing", "conflicting", "not_applicable"]
    blocking: bool
    source_artifact_ids: list[UUID] = Field(default_factory=list, max_length=100)
    note: str = Field(min_length=1, max_length=4000)


class ResearchResultV2(ContractModel):
    schema_version: Literal["axwise.research.v2"] = "axwise.research.v2"
    accepted_scope_artifact_id: UUID
    accepted_scope_hash: Sha256
    research_input_hash: Sha256
    readiness: Literal["ready", "ready_with_gaps", "blocked"]
    findings: list[EvidenceFinding] = Field(max_length=200)
    bounded_repair_passes: int = Field(ge=0, le=1)
    assumptions: list[str] = Field(max_length=80)
    gaps: list[str] = Field(max_length=80)
    conflicts: list[str] = Field(max_length=80)
    claim_ledger_artifact_id: UUID
    launch_ready: bool

    @model_validator(mode="after")
    def readiness_consistency(self) -> "ResearchResultV2":
        unresolved = any(
            finding.blocking and finding.status in {"missing", "conflicting"}
            for finding in self.findings
        )
        if unresolved and self.readiness != "blocked":
            raise ValueError("unresolved blocking evidence must block")
        if self.readiness != "ready" and self.launch_ready:
            raise ValueError("only evidence-ready research may be launch-ready")
        return self


class FinalArtifactV1(ContractModel):
    schema_version: Literal["axwise.final-markdown.v1"] = "axwise.final-markdown.v1"
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)
    source_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    launch_ready: bool

    @model_validator(mode="after")
    def no_false_launch_claim(self) -> "FinalArtifactV1":
        if self.evidence_readiness != "ready" and self.launch_ready:
            raise ValueError("artifact with evidence gaps or blocks cannot be launch-ready")
        return self


class CompileScopeInputV2(ContractModel):
    type: Literal["CompileScopeV2"]
    request: str = Field(min_length=1, max_length=24_000)
    mode: Literal["simple", "advanced"]
    objective_only_context: list[ArtifactRef] = Field(default_factory=list, max_length=20)
    safe_defaults: dict[str, Any] = Field(default_factory=dict)


class ReviseScopeInputV2(ContractModel):
    type: Literal["ReviseScopeV2"]
    accepted_scope: ArtifactRef
    correction: str = Field(min_length=1, max_length=6000)
    correction_source_spans: list[SourceSpan] = Field(min_length=1, max_length=24)

    @model_validator(mode="after")
    def exact_correction_spans(self) -> "ReviseScopeInputV2":
        for span in self.correction_source_spans:
            if span.end > len(self.correction):
                raise ValueError("correction source span is outside correction text")
            exact_text = self.correction[span.start : span.end]
            if exact_text != span.text:
                raise ValueError("correction source span text does not match correction")
            if hashlib.sha256(exact_text.encode("utf-8")).hexdigest() != span.sha256:
                raise ValueError("correction source span hash does not match correction")
        return self


class ExecuteResearchInputV2(ContractModel):
    type: Literal["ExecuteResearchV2"]
    accepted_scope: ArtifactRef
    scope: ScopeArtifactV2
    selected_evidence: list[ArtifactRef] = Field(default_factory=list, max_length=200)


class SynthesisOutputContract(ContractModel):
    format: Literal["text/markdown"]
    required_sections: list[str] = Field(max_length=80)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]


class SynthesizeArtifactInputV1(ContractModel):
    type: Literal["SynthesizeArtifactV1"]
    accepted_scope: ArtifactRef
    research: ArtifactRef
    accepted_plan: ArtifactRef
    task_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    evaluation: ArtifactRef
    output_contract: SynthesisOutputContract


OperationInput = Annotated[
    Union[
        CompileScopeInputV2,
        ReviseScopeInputV2,
        ExecuteResearchInputV2,
        SynthesizeArtifactInputV1,
    ],
    Field(discriminator="type"),
]


class OperationOwner(ContractModel):
    tenant_id: UUID
    organization_id: ClerkOrganizationId | None
    user_id: ClerkUserId


class WorkflowReference(ContractModel):
    run_id: UUID
    stage_id: UUID
    stage_attempt_id: UUID


class AxWiseOperationEnvelope(ContractModel):
    operation_id: UUID
    operation_type: Literal[
        "CompileScopeV2",
        "ReviseScopeV2",
        "ExecuteResearchV2",
        "SynthesizeArtifactV1",
    ]
    owner: OperationOwner
    workflow: WorkflowReference
    contract_version: Literal["axwise.operation.v2"]
    canonical_input_hash: Sha256
    input: OperationInput

    @model_validator(mode="after")
    def exact_input_identity(self) -> "AxWiseOperationEnvelope":
        if self.operation_type != self.input.type:
            raise ValueError("operation type must match typed input")
        input_payload = self.input.model_dump(mode="json", by_alias=True)
        if canonical_hash(input_payload) != self.canonical_input_hash:
            raise ValueError("canonical input hash does not match typed input")
        return self


class ArtifactFact(ArtifactRef):
    content_type: Literal["application/json", "text/markdown"] = "application/json"
    payload: dict[str, Any] = Field(default_factory=dict)
    markdown: str | None = None
    source_artifact_ids: list[UUID] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def content_shape(self) -> "ArtifactFact":
        if self.content_type == "text/markdown" and not self.markdown:
            raise ValueError("Markdown artifacts require Markdown content")
        if self.content_type == "application/json" and self.markdown is not None:
            raise ValueError("JSON artifacts cannot carry Markdown")
        return self


class CompletionResult(ContractModel):
    artifact: ArtifactFact
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"] | None = None
    planning: dict[str, Any] | None = None
    execution_output_contract_satisfied: bool | None = None
    direct_promotion_artifact: ArtifactRef | None = None


class OperationAccepted(ContractModel):
    operation_id: UUID
    status: Literal["accepted", "running"]
    canonical_input_hash: Sha256
    status_url: str
    retry_after_seconds: int = Field(default=2, ge=1, le=300)


class OperationCompleted(ContractModel):
    operation_id: UUID
    status: Literal["completed"]
    canonical_input_hash: Sha256
    result: CompletionResult


class OperationFailed(ContractModel):
    operation_id: UUID
    status: Literal["failed"]
    canonical_input_hash: Sha256
    retryable: bool
    error_class: str = Field(min_length=1, max_length=200)


OperationResponse = Annotated[
    Union[OperationAccepted, OperationCompleted, OperationFailed],
    Field(discriminator="status"),
]
