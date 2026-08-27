from __future__ import annotations

import hashlib
import ipaddress
import json
from typing import Annotated, Any, Literal, Union
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


Sha256 = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
ClerkUserId = Annotated[str, StringConstraints(pattern=r"^user_[A-Za-z0-9]+$")]
ClerkOrganizationId = Annotated[str, StringConstraints(pattern=r"^org_[A-Za-z0-9]+$")]
Text120 = Annotated[str, StringConstraints(min_length=1, max_length=120)]
Text160 = Annotated[str, StringConstraints(min_length=1, max_length=160)]
Text300 = Annotated[str, StringConstraints(min_length=1, max_length=300)]
Text500 = Annotated[str, StringConstraints(min_length=1, max_length=500)]
Text1000 = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
Text2000 = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
Text4000 = Annotated[str, StringConstraints(min_length=1, max_length=4000)]
EvidenceSourceType = Literal[
    "grounded_web",
    "government",
    "primary_law",
    "official_statistics",
    "academic",
    "standard",
    "industry",
]


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
    """Return the AxWise/Orqaly ``canonical-v1`` JSON representation.

    ``canonical-v1`` deliberately supports the JSON subset used by workflow
    contracts: null, booleans, strings, safe integers, arrays and objects.
    Object keys are ordered by UTF-16 code units, matching JavaScript's stable
    ordinal string ordering. Floats are rejected so Python and JavaScript can
    never disagree about exponent, trailing-zero, negative-zero or precision
    rendering.
    """

    if value is None or isinstance(value, bool):
        return "null" if value is None else ("true" if value else "false")
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 9_007_199_254_740_991:
            raise TypeError("canonical JSON integers must be JavaScript-safe")
        return str(value)
    if isinstance(value, float):
        raise TypeError("canonical JSON rejects floating-point numbers")
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as error:
            raise TypeError("canonical JSON rejects unpaired UTF-16 surrogates") from error
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if type(value) is list:
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if type(value) is dict:
        if any(not isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        keys = utf16_ordinal_sorted(value)
        return "{" + ",".join(
            f"{canonical_json(key)}:{canonical_json(value[key])}" for key in keys
        ) + "}"
    raise TypeError(f"canonical JSON does not support {type(value).__name__}")


def utf16_ordinal_sorted(values: Any) -> list[str]:
    normalized = list(values)
    for value in normalized:
        if not isinstance(value, str):
            raise TypeError("UTF-16 ordinal sorting requires strings")
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as error:
            raise TypeError("UTF-16 ordinal sorting rejects unpaired surrogates") from error
    return sorted(normalized, key=lambda value: value.encode("utf-16-be"))


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def is_canonical_public_https_url(value: str) -> bool:
    if (
        not value
        or len(value) > 4000
        or any(character.isspace() for character in value)
    ):
        return False
    try:
        parsed = urlsplit(value)
        port = parsed.port
        host = parsed.hostname or ""
        ascii_host = host.encode("ascii").decode("ascii").casefold()
    except (UnicodeError, ValueError):
        return False
    try:
        ipaddress.ip_address(ascii_host)
    except ValueError:
        pass
    else:
        return False
    labels = ascii_host.split(".")
    valid_labels = all(
        label
        and len(label) <= 63
        and label[0].isalnum()
        and label[-1].isalnum()
        and all(character.isalnum() or character == "-" for character in label)
        for label in labels
    )
    return bool(
        parsed.scheme == "https"
        and parsed.username is None
        and parsed.password is None
        and port is None
        and parsed.fragment == ""
        and "." in ascii_host
        and parsed.netloc == ascii_host
        and valid_labels
        and not ascii_host.endswith(".")
        and ascii_host != "localhost"
        and not ascii_host.endswith((".localhost", ".local", ".internal"))
    )


def artifact_content_hash(
    *,
    content_type: str,
    payload: dict[str, Any] | None,
    markdown: str | None,
) -> str:
    return canonical_hash(
        {
            "contentType": content_type,
            "payload": payload,
            "markdown": markdown,
        }
    )


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def utf16_slice(value: str, start: int, end: int) -> str:
    """Slice at JavaScript-compatible UTF-16 code-unit boundaries.

    Contract spans may not split a surrogate pair. Rejecting such a boundary
    gives both runtimes one exact, hashable substring rather than a lone
    surrogate that cannot be encoded safely as UTF-8.
    """

    if start < 0 or end <= start or end > utf16_length(value):
        raise ValueError("UTF-16 span is outside source text")
    encoded = value.encode("utf-16-le", "surrogatepass")
    try:
        return encoded[start * 2 : end * 2].decode("utf-16-le")
    except UnicodeDecodeError as error:
        raise ValueError("UTF-16 span splits a surrogate pair") from error


def python_index_to_utf16(value: str, index: int) -> int:
    if index < 0 or index > len(value):
        raise ValueError("Python index is outside source text")
    return utf16_length(value[:index])


class ArtifactRef(ContractModel):
    artifact_id: UUID
    artifact_hash: Sha256
    kind: Annotated[str, StringConstraints(min_length=1, max_length=120)]


class SourceSpan(ContractModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    offset_unit: Literal["utf16_code_units"] = "utf16_code_units"
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
    accepted_source_types: list[EvidenceSourceType] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def canonical_source_types(self) -> "EvidenceRequirement":
        if self.accepted_source_types != utf16_ordinal_sorted(
            set(self.accepted_source_types)
        ):
            raise ValueError("accepted source types must be sorted and unique")
        if self.criticality == "blocking" and not set(
            self.accepted_source_types
        ).intersection({"government", "primary_law", "standard", "academic"}):
            raise ValueError(
                "blocking evidence requires an authoritative accepted source class"
            )
        return self


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
    geography: list[Text160] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=12)
    deliverables: list[Text500] = Field(min_length=1, max_length=24)
    personas: list[Text500] = Field(default_factory=list, max_length=24)
    interview_requirements: list[Text1000] = Field(default_factory=list, max_length=24)
    prd_requirements: list[Text1000] = Field(default_factory=list, max_length=40)
    limits: list[Text1000] = Field(default_factory=list, max_length=40)
    policies: list[Text1000] = Field(default_factory=list, max_length=40)
    assumptions: list[Text1000] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(default=None, min_length=1, max_length=1000)
    research_input_hash: Sha256
    authority: ScopeAuthority


class EvidenceFinding(ContractModel):
    requirement_id: str = Field(min_length=1, max_length=120)
    status: Literal["verified", "missing", "conflicting", "not_applicable"]
    blocking: bool
    source_artifact_ids: list[UUID] = Field(default_factory=list, max_length=100)
    note: str = Field(min_length=1, max_length=4000)


class EvidenceClaimV1(ContractModel):
    claim_id: Sha256
    text: str = Field(min_length=1, max_length=12_000)
    text_sha256: Sha256
    source_urls: list[Annotated[str, StringConstraints(min_length=1, max_length=4000)]] = Field(
        min_length=1, max_length=20
    )
    source_types: list[EvidenceSourceType] = Field(min_length=1, max_length=7)
    provider_response_hash: Sha256 | None = None
    segment_start: int | None = Field(default=None, ge=0)
    segment_end: int | None = Field(default=None, gt=0)
    offset_unit: Literal["utf8_bytes"] | None = None

    @model_validator(mode="after")
    def exact_claim_identity(self) -> "EvidenceClaimV1":
        if any(not is_canonical_public_https_url(url) for url in self.source_urls):
            raise ValueError("evidence claim source URLs must be canonical public HTTPS")
        if self.source_urls != utf16_ordinal_sorted(set(self.source_urls)):
            raise ValueError("claim source URLs must be sorted and unique")
        if self.source_types != utf16_ordinal_sorted(set(self.source_types)):
            raise ValueError("claim source types must be sorted and unique")
        expected_text_hash = hashlib.sha256(self.text.encode("utf-8")).hexdigest()
        if self.text_sha256 != expected_text_hash:
            raise ValueError("evidence claim text hash is invalid")
        expected_claim_id = canonical_hash(
            {
                "text": self.text,
                "sourceTypes": utf16_ordinal_sorted(self.source_types),
                "sourceUrls": utf16_ordinal_sorted(self.source_urls),
            }
        )
        if self.claim_id != expected_claim_id:
            raise ValueError("evidence claim ID is invalid")
        span_values = (self.segment_start, self.segment_end, self.offset_unit)
        if any(value is not None for value in span_values):
            if any(value is None for value in span_values):
                raise ValueError("evidence claim span metadata must be complete")
            if self.segment_end is not None and self.segment_start is not None:
                if self.segment_end <= self.segment_start:
                    raise ValueError("evidence claim span is not ordered")
            if self.provider_response_hash is None:
                raise ValueError("evidence claim span requires provider response hash")
        return self


class EvidenceAcquisitionPassV1(ContractModel):
    requirement_id: Text120
    pass_number: Literal[0, 1]
    query_hash: Sha256
    provider_response_hash: Sha256
    provider_response_text: str = Field(max_length=200_000)
    claims: list[EvidenceClaimV1] = Field(default_factory=list, max_length=50)
    source_types_seen: list[EvidenceSourceType] = Field(default_factory=list, max_length=7)

    @model_validator(mode="after")
    def exact_provider_provenance(self) -> "EvidenceAcquisitionPassV1":
        response_bytes = self.provider_response_text.encode("utf-8")
        if hashlib.sha256(response_bytes).hexdigest() != self.provider_response_hash:
            raise ValueError("provider response hash does not match stored acquisition text")
        if self.source_types_seen != utf16_ordinal_sorted(set(self.source_types_seen)):
            raise ValueError("sourceTypesSeen must be unique and UTF-16 ordinal sorted")
        claim_ids: set[str] = set()
        for claim in self.claims:
            if claim.claim_id in claim_ids:
                raise ValueError("acquisition claims must have unique IDs")
            claim_ids.add(claim.claim_id)
            if (
                claim.provider_response_hash != self.provider_response_hash
                or claim.segment_start is None
                or claim.segment_end is None
                or claim.offset_unit != "utf8_bytes"
            ):
                raise ValueError("acquisition claim must bind an exact provider response span")
            try:
                segment = response_bytes[claim.segment_start : claim.segment_end].decode("utf-8")
            except UnicodeDecodeError as error:
                raise ValueError("acquisition claim span splits a UTF-8 sequence") from error
            if segment != claim.text:
                raise ValueError("acquisition claim span does not match claim text")
        return self


class SelectedEvidenceArtifactV1(ContractModel):
    schema_version: Literal["axwise.evidence.v1"] = "axwise.evidence.v1"
    requirement_id: Text120
    applicability: Literal["applicable", "not_applicable"] = "applicable"
    claims: list[EvidenceClaimV1] = Field(default_factory=list, max_length=100)
    conflicts: list[Text2000] = Field(default_factory=list, max_length=40)


class ResearchResultV2(ContractModel):
    schema_version: Literal["axwise.research.v2"] = "axwise.research.v2"
    accepted_scope_artifact_id: UUID
    accepted_scope_hash: Sha256
    research_input_hash: Sha256
    readiness: Literal["ready", "ready_with_gaps", "blocked"]
    findings: list[EvidenceFinding] = Field(max_length=200)
    bounded_repair_passes: int = Field(ge=0, le=1)
    assumptions: list[Text2000] = Field(max_length=80)
    gaps: list[Text2000] = Field(max_length=80)
    conflicts: list[Text2000] = Field(max_length=80)
    claim_ledger_artifact_id: UUID
    claim_ledger: list[EvidenceAcquisitionPassV1] = Field(default_factory=list, max_length=160)
    launch_ready: bool

    @model_validator(mode="after")
    def readiness_consistency(self) -> "ResearchResultV2":
        if len({finding.requirement_id for finding in self.findings}) != len(self.findings):
            raise ValueError("research findings must have unique requirement IDs")
        if len(
            {(entry.requirement_id, entry.pass_number) for entry in self.claim_ledger}
        ) != len(self.claim_ledger):
            raise ValueError("research acquisition passes must be unique per requirement")
        acquired_requirement_ids = {entry.requirement_id for entry in self.claim_ledger}
        for finding in self.findings:
            if (
                finding.requirement_id in acquired_requirement_ids
                and self.claim_ledger_artifact_id not in finding.source_artifact_ids
            ):
                raise ValueError("dynamically acquired finding must cite its claim ledger")
        unresolved_blocking = any(
            finding.blocking and finding.status in {"missing", "conflicting"}
            for finding in self.findings
        )
        unresolved_nonblocking = any(
            not finding.blocking and finding.status in {"missing", "conflicting"}
            for finding in self.findings
        )
        expected_readiness = (
            "blocked"
            if unresolved_blocking
            else "ready_with_gaps"
            if unresolved_nonblocking or self.assumptions
            else "ready"
        )
        if self.readiness != expected_readiness:
            raise ValueError("evidence readiness is not the deterministic finding result")
        if self.launch_ready != (self.readiness == "ready"):
            raise ValueError("launchReady must exactly follow evidence readiness")
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


class SafeScopeDefaultsV2(ContractModel):
    geography: list[Text160] = Field(default_factory=list, max_length=24)
    accepted_source_types: list[EvidenceSourceType] = Field(default_factory=list, max_length=7)
    assumptions: list[Text1000] = Field(default_factory=list, max_length=24)
    limits: list[Text1000] = Field(default_factory=list, max_length=40)
    policies: list[Text1000] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def canonical_source_types(self) -> "SafeScopeDefaultsV2":
        if self.accepted_source_types != utf16_ordinal_sorted(
            set(self.accepted_source_types)
        ):
            raise ValueError("default accepted source types must be sorted and unique")
        return self


class CompileScopeInputV2(ContractModel):
    type: Literal["CompileScopeV2"]
    request: str = Field(min_length=1, max_length=24_000)
    objective_only_context: list[ArtifactRef] = Field(default_factory=list, max_length=20)
    safe_defaults: SafeScopeDefaultsV2 = Field(default_factory=SafeScopeDefaultsV2)


class ReviseScopeInputV2(ContractModel):
    type: Literal["ReviseScopeV2"]
    accepted_scope: ArtifactRef
    correction: str = Field(min_length=1, max_length=6000)
    correction_source_spans: list[SourceSpan] = Field(min_length=1, max_length=24)

    @model_validator(mode="after")
    def exact_correction_spans(self) -> "ReviseScopeInputV2":
        for span in self.correction_source_spans:
            exact_text = utf16_slice(self.correction, span.start, span.end)
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


class SelectedAgentV2(ContractModel):
    id: UUID
    name: Text300
    capabilities: list[Text120] = Field(max_length=100)
    tool_ids: list[UUID] = Field(max_length=40)
    quality_score_micros: int = Field(ge=0, le=1_000_000)
    cost_per_run_cents: int = Field(ge=0)

    @model_validator(mode="after")
    def sorted_unique_public_capabilities(self) -> "SelectedAgentV2":
        if self.capabilities != utf16_ordinal_sorted(set(self.capabilities)):
            raise ValueError("agent capabilities must be sorted and unique")
        if self.tool_ids != sorted(set(self.tool_ids), key=str):
            raise ValueError("agent tool IDs must be sorted and unique")
        return self


class ExecutionTaskV2(ContractModel):
    stage_id: UUID
    stage_key: Annotated[
        str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,119}$")
    ]
    title: Text500
    input_hash: Sha256
    depends_on_stage_keys: list[Text120] = Field(max_length=40)
    agent_id: UUID | None
    tool_ids: list[UUID] = Field(max_length=40)
    budget_cents: int = Field(ge=0)
    data_boundary: list[Text500] = Field(max_length=40)

    @model_validator(mode="after")
    def exact_input_hash(self) -> "ExecutionTaskV2":
        core = self.model_dump(mode="json", by_alias=True, exclude={"input_hash"})
        if canonical_hash(core) != self.input_hash:
            raise ValueError("task inputHash does not match immutable task semantics")
        return self


class PlanningResultV2(ContractModel):
    schema_version: Literal["orqaly.plan.v2"]
    accepted_scope_artifact: ArtifactRef
    research_artifact: ArtifactRef
    selected_agent: SelectedAgentV2 | None
    tasks: list[ExecutionTaskV2] = Field(min_length=1, max_length=100)
    plan_hash: Sha256

    @model_validator(mode="after")
    def exact_plan_hash(self) -> "PlanningResultV2":
        core = self.model_dump(mode="json", by_alias=True, exclude={"plan_hash"})
        if canonical_hash(core) != self.plan_hash:
            raise ValueError("planHash does not match immutable plan content")
        expected_agent_id = self.selected_agent.id if self.selected_agent else None
        expected_tools = (
            sorted(self.selected_agent.tool_ids, key=str) if self.selected_agent else []
        )
        expected_budget = self.selected_agent.cost_per_run_cents if self.selected_agent else 0
        for task in self.tasks:
            if (
                task.agent_id != expected_agent_id
                or task.tool_ids != expected_tools
                or task.budget_cents != expected_budget
            ):
                raise ValueError(
                    "task agent, tools and budget must equal selected agent snapshot"
                )
        return self


class TaskRequirementsV2(ContractModel):
    personas: list[Text500] = Field(max_length=24)
    interviews: list[Text1000] = Field(max_length=24)
    prd: list[Text1000] = Field(max_length=40)


class TaskEvidenceV2(ContractModel):
    requirement_id: Text120
    status: Literal["verified", "missing", "conflicting", "not_applicable"]
    note: Text4000
    claim_ids: list[Sha256] = Field(max_length=100)


class ExecutionReceiptV2(ContractModel):
    agent: SelectedAgentV2 | None
    tool_ids: list[UUID] = Field(max_length=40)
    budget_cents: int = Field(ge=0)
    data_boundary: list[Text500] = Field(max_length=40)


class TaskResultV2(ContractModel):
    schema_version: Literal["orqaly.task-result.v2"]
    task: ExecutionTaskV2
    accepted_scope: ArtifactRef
    research: ArtifactRef
    accepted_plan: ArtifactRef
    title: Text500
    markdown: str = Field(min_length=1)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    source_artifacts: list[ArtifactRef] = Field(min_length=3, max_length=200)
    requirements: TaskRequirementsV2
    evidence: list[TaskEvidenceV2] = Field(max_length=200)
    execution_receipt: ExecutionReceiptV2
    conclusions: list[Text4000] = Field(min_length=1, max_length=100)
    unknowns: list[Text4000] = Field(max_length=100)


class EvaluationResultV1(ContractModel):
    schema_version: Literal["orqaly.evaluation.v1"]
    task_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    output_contract_satisfied: bool
    promoted_artifact: ArtifactRef | None
    note: Text2000

    @model_validator(mode="after")
    def exact_promotion_fact(self) -> "EvaluationResultV1":
        if self.output_contract_satisfied != (self.promoted_artifact is not None):
            raise ValueError("promotion artifact must match output-contract satisfaction")
        return self


class SynthesisOutputContract(ContractModel):
    format: Literal["text/markdown"]
    required_sections: list[Text300] = Field(max_length=80)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]


class ImmutableArtifactContent(ContractModel):
    artifact: ArtifactRef
    content_type: Literal["application/json", "text/markdown"]
    payload: dict[str, Any] | None
    markdown: str | None

    @model_validator(mode="after")
    def exact_content_hash(self) -> "ImmutableArtifactContent":
        if self.content_type == "application/json":
            if self.payload is None or self.markdown is not None:
                raise ValueError("JSON artifact content requires payload and no Markdown")
        else:
            if self.payload is None or not self.markdown:
                raise ValueError("Markdown artifact content requires payload and Markdown")
            if self.payload.get("markdown") != self.markdown:
                raise ValueError("Markdown artifact payload and body must match")
        expected = artifact_content_hash(
            content_type=self.content_type,
            payload=self.payload,
            markdown=self.markdown,
        )
        if self.artifact.artifact_hash != expected:
            raise ValueError("immutable artifact content hash does not match reference")
        return self


class SynthesizeArtifactInputV1(ContractModel):
    type: Literal["SynthesizeArtifactV1"]
    accepted_scope: ArtifactRef
    research: ArtifactRef
    accepted_plan: ArtifactRef
    task_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    evaluation: ArtifactRef
    artifact_contents: list[ImmutableArtifactContent] = Field(min_length=3, max_length=202)
    output_contract: SynthesisOutputContract

    @model_validator(mode="after")
    def exact_selected_artifact_contents(self) -> "SynthesizeArtifactInputV1":
        expected = {
            self.accepted_plan.artifact_id: self.accepted_plan,
            self.evaluation.artifact_id: self.evaluation,
            **{item.artifact_id: item for item in self.task_artifacts},
        }
        if len(expected) != len(self.task_artifacts) + 2:
            raise ValueError("synthesis artifact references must be unique")
        supplied: dict[UUID, ImmutableArtifactContent] = {}
        for item in self.artifact_contents:
            if item.artifact.artifact_id in supplied:
                raise ValueError("synthesis artifact content IDs must be unique")
            supplied[item.artifact.artifact_id] = item
        if set(supplied) != set(expected):
            raise ValueError("artifactContents must exactly cover plan, tasks, and evaluation")
        for artifact_id, reference in expected.items():
            if supplied[artifact_id].artifact != reference:
                raise ValueError("artifactContents reference does not match selected artifact")
        return self


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
        if self.content_type == "text/markdown":
            if not self.markdown:
                raise ValueError("Markdown artifacts require Markdown content")
            if self.payload.get("markdown") != self.markdown:
                raise ValueError("Markdown artifact payload and body must match")
        if self.content_type == "application/json" and self.markdown is not None:
            raise ValueError("JSON artifacts cannot carry Markdown")
        expected = artifact_content_hash(
            content_type=self.content_type,
            payload=self.payload,
            markdown=self.markdown,
        )
        if self.artifact_hash != expected:
            raise ValueError("artifact hash does not match exact immutable content")
        return self


def _sorted_unique_artifact_ids(values: list[UUID]) -> list[UUID]:
    return sorted(set(values), key=str)


class ScopeArtifactFact(ArtifactFact):
    kind: Literal["scope"]
    content_type: Literal["application/json"] = "application/json"
    markdown: None = None

    @model_validator(mode="after")
    def exact_scope_fact(self) -> "ScopeArtifactFact":
        ScopeArtifactV2.model_validate(self.payload)
        if self.source_artifact_ids != _sorted_unique_artifact_ids(
            self.source_artifact_ids
        ):
            raise ValueError("scope artifact lineage must be sorted and unique")
        return self


class ResearchArtifactFact(ArtifactFact):
    kind: Literal["research"]
    content_type: Literal["application/json"] = "application/json"
    markdown: None = None

    @model_validator(mode="after")
    def exact_research_fact(self) -> "ResearchArtifactFact":
        payload = ResearchResultV2.model_validate(self.payload)
        if self.source_artifact_ids != [payload.accepted_scope_artifact_id]:
            raise ValueError("research artifact must cite only its accepted scope")
        return self


class FinalMarkdownArtifactFact(ArtifactFact):
    kind: Literal["final_markdown"]
    content_type: Literal["text/markdown"] = "text/markdown"
    markdown: str

    @model_validator(mode="after")
    def exact_final_fact(self) -> "FinalMarkdownArtifactFact":
        payload = FinalArtifactV1.model_validate(self.payload)
        expected_sources = _sorted_unique_artifact_ids(
            [item.artifact_id for item in payload.source_artifacts]
        )
        if len(expected_sources) != len(payload.source_artifacts):
            raise ValueError("final source artifacts must be unique")
        if self.source_artifact_ids != expected_sources:
            raise ValueError("final artifact lineage must equal its source artifacts")
        return self


class OperationMetrics(ContractModel):
    latency_ms: int = Field(ge=0)
    provider: Literal["google"] | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    search_calls: int | None = Field(default=None, ge=0)
    estimated_cost_micros: int | None = Field(default=None, ge=0)


class ScopeCompiledResult(ContractModel):
    result_type: Literal["scope_compiled"]
    artifact: ScopeArtifactFact
    metrics: OperationMetrics | None = None


class ResearchCompletedResult(ContractModel):
    result_type: Literal["research_completed"]
    artifact: ResearchArtifactFact
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    metrics: OperationMetrics | None = None

    @model_validator(mode="after")
    def exact_readiness(self) -> "ResearchCompletedResult":
        payload = ResearchResultV2.model_validate(self.artifact.payload)
        if self.evidence_readiness != payload.readiness:
            raise ValueError("research completion readiness must equal its artifact")
        return self


class ArtifactSynthesizedResult(ContractModel):
    result_type: Literal["artifact_synthesized"]
    artifact: FinalMarkdownArtifactFact
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    metrics: OperationMetrics | None = None

    @model_validator(mode="after")
    def exact_readiness(self) -> "ArtifactSynthesizedResult":
        payload = FinalArtifactV1.model_validate(self.artifact.payload)
        if self.evidence_readiness != payload.evidence_readiness:
            raise ValueError("synthesis readiness must equal its artifact")
        return self


CompletionResult = Annotated[
    Union[ScopeCompiledResult, ResearchCompletedResult, ArtifactSynthesizedResult],
    Field(discriminator="result_type"),
]


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
