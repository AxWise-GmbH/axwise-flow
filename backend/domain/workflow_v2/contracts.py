from __future__ import annotations

import base64
import binascii
import hashlib
import ipaddress
import math
import re
import unicodedata
from datetime import datetime
from typing import Annotated, Any, Literal, Union
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, UUID, uuid5

import rfc8785
from pydantic import (
    Field,
    StringConstraints,
    field_validator,
    model_serializer,
    model_validator,
)

from backend.domain.workflow_v2.wire import (
    ContractModel,
    StrictWireContractModel,
    _camel,
    canonical_hash,
    canonical_json,
    utf16_ordinal_sorted,
)
from backend.domain.workflow_v2.capability_limits import (
    CapabilityLimitsV1,
    validate_capability_structure,
)
from backend.domain.workflow_v2.qualitative_analysis import (
    AnalysisRequestV1,
    QualitativeAnalysisV1,
    validate_analysis_request,
)
from backend.domain.workflow_v2.simulation import SimulationRequestV1, SimulationV1
from backend.domain.workflow_v2.processing_consent import (
    CapabilityProcessingConsentV1,
    validate_processing_consent,
)
from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    TranscriptCorpusV1,
    _FrozenCorpusModel,
    _Sha256,
    _ordered_sequence,
    validate_transcript_corpus,
)

Sha256 = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
AssistantWireUuid = Annotated[
    str,
    StringConstraints(
        pattern=(
            r"^(?:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-8][0-9A-Fa-f]{3}-"
            r"[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}|"
            r"00000000-0000-0000-0000-000000000000)$"
        )
    ),
]
ClerkUserId = Annotated[str, StringConstraints(pattern=r"^user_[A-Za-z0-9]+$")]
ClerkOrganizationId = Annotated[str, StringConstraints(pattern=r"^org_[A-Za-z0-9]+$")]
Text120 = Annotated[str, StringConstraints(min_length=1, max_length=120)]
Text160 = Annotated[str, StringConstraints(min_length=1, max_length=160)]
Text300 = Annotated[str, StringConstraints(min_length=1, max_length=300)]
Text500 = Annotated[str, StringConstraints(min_length=1, max_length=500)]
Text1000 = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
Text2000 = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
Text4000 = Annotated[str, StringConstraints(min_length=1, max_length=4000)]
RequirementId = Annotated[
    str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,119}$")
]
SemanticRequirementId = Annotated[str, StringConstraints(pattern=r"^req-[a-f0-9]{16}$")]
SemanticAcceptanceCriterionId = Annotated[
    str, StringConstraints(pattern=r"^acc-[a-f0-9]{16}$")
]
DeliverableArtifactTypeV1 = Literal[
    "product_prd",
    "software_prd",
    "research_strategy",
    "content_artifact",
    "operational_plan",
    "launch_authorization",
    "general_artifact",
]
PlanRequirementCategoryV2 = Literal[
    "deliverable",
    "persona",
    "interview",
    "prd",
    "limit",
    "policy",
    "evidence",
]
Rfc3339Utc = Annotated[
    str,
    StringConstraints(
        pattern=(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}" r"(?:\.\d{1,6})?Z$")
    ),
]
EvidenceSourceType = Literal[
    "grounded_web",
    "government",
    "primary_law",
    "official_statistics",
    "academic",
    "standard",
    "industry",
]


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
    evidence_role: Literal[
        "grounded_claim",
        "selected_artifact_proof",
        "future_authorization_proof",
    ]
    verification_basis: Literal["grounded_claims", "selected_evidence"]
    applies_when: str = Field(min_length=1, max_length=1000)
    accepted_source_types: list[EvidenceSourceType] = Field(min_length=1, max_length=7)
    allowed_source_hosts: list[Text120] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def canonical_source_types(self) -> "EvidenceRequirement":
        expected_basis = (
            "grounded_claims"
            if self.evidence_role == "grounded_claim"
            else "selected_evidence"
        )
        if self.verification_basis != expected_basis:
            raise ValueError("evidenceRole must use its exact typed verificationBasis")
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
        if self.allowed_source_hosts != utf16_ordinal_sorted(
            set(self.allowed_source_hosts)
        ):
            raise ValueError("allowed source hosts must be sorted and unique")
        for host in self.allowed_source_hosts:
            if host != host.casefold() or any(
                character in host for character in ":/?#*"
            ):
                raise ValueError("allowed source hosts must be lowercase hostnames")
            if not is_canonical_public_https_url(f"https://{host}"):
                raise ValueError("allowed source host must be public and canonical")
            labels = host.split(".")
            if len(labels) < 2 or any(
                not label
                or len(label) > 63
                or not label[0].isalnum()
                or not label[-1].isalnum()
                or any(not char.isalnum() and char != "-" for char in label)
                for label in labels
            ):
                raise ValueError("allowed source host is not canonical")
        return self


class TopicAnchor(ContractModel):
    value: str = Field(min_length=1, max_length=300)
    source_spans: list[SourceSpan] = Field(min_length=1, max_length=12)


class ScopeAuthority(ContractModel):
    canonical_input_hash: Sha256
    seal: str = Field(min_length=32, max_length=512)


class AcceptedDeliverableProfileV1(ContractModel):
    schema_version: Literal["axwise.deliverable-profile.v1"]
    artifact_type: DeliverableArtifactTypeV1
    domain: Text500
    problem: Text2000
    desired_outcome: Text2000
    audiences: list[Text500] = Field(min_length=1, max_length=24)
    non_goals: list[Text1000] = Field(max_length=40)
    required_sections: list[Text300] = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def canonical_profile_lists(self) -> "AcceptedDeliverableProfileV1":
        for name, values in (
            ("audiences", self.audiences),
            ("nonGoals", self.non_goals),
            ("requiredSections", self.required_sections),
        ):
            if values != utf16_ordinal_sorted(set(values)):
                raise ValueError(
                    f"deliverable-profile {name} must be sorted and unique"
                )
        return self


class AcceptedDeliverableRequirementV1(ContractModel):
    id: SemanticRequirementId
    category: PlanRequirementCategoryV2
    description: Text2000
    priority: Literal["P0", "P1", "P2"]
    authority: Literal["owner", "safe_default", "axwise_derived"]

    @model_validator(mode="after")
    def exact_semantic_id(self) -> "AcceptedDeliverableRequirementV1":
        semantic = self.model_dump(mode="json", by_alias=True, exclude={"id"})
        if self.id != f"req-{canonical_hash(semantic)[:16]}":
            raise ValueError("deliverable requirement ID does not match its semantics")
        return self


class DeliverableAcceptanceCriterionV1(ContractModel):
    id: SemanticAcceptanceCriterionId
    given: Text2000
    when: Text2000
    then: Text2000
    supports: list[SemanticRequirementId] = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def exact_semantic_id(self) -> "DeliverableAcceptanceCriterionV1":
        if self.supports != utf16_ordinal_sorted(set(self.supports)):
            raise ValueError("acceptance-criterion supports must be sorted and unique")
        semantic = self.model_dump(mode="json", by_alias=True, exclude={"id"})
        if self.id != f"acc-{canonical_hash(semantic)[:16]}":
            raise ValueError("acceptance criterion ID does not match its semantics")
        return self


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
    deliverable_profile: AcceptedDeliverableProfileV1
    requirements: list[AcceptedDeliverableRequirementV1] = Field(
        min_length=1, max_length=120
    )
    acceptance_criteria: list[DeliverableAcceptanceCriterionV1] = Field(
        min_length=1, max_length=120
    )
    assumptions: list[Text1000] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(
        default=None, min_length=1, max_length=1000
    )
    research_input_hash: Sha256
    authority: ScopeAuthority

    @model_validator(mode="after")
    def exact_deliverable_contract(self) -> "ScopeArtifactV2":
        evidence_requirement_ids = [item.id for item in self.evidence_requirements]
        if len(evidence_requirement_ids) != len(set(evidence_requirement_ids)):
            raise ValueError("evidence requirements must have unique IDs")
        requirement_ids = [item.id for item in self.requirements]
        criterion_ids = [item.id for item in self.acceptance_criteria]
        if requirement_ids != utf16_ordinal_sorted(set(requirement_ids)):
            raise ValueError(
                "deliverable requirements must be sorted by unique semantic ID"
            )
        if criterion_ids != utf16_ordinal_sorted(set(criterion_ids)):
            raise ValueError(
                "deliverable acceptance criteria must be sorted by unique semantic ID"
            )
        supported = {
            requirement_id
            for criterion in self.acceptance_criteria
            for requirement_id in criterion.supports
        }
        if supported != set(requirement_ids):
            raise ValueError(
                "acceptance criteria must reference and cover every deliverable requirement"
            )
        expected_descriptions = sorted(
            [
                *(("deliverable", value) for value in self.deliverables),
                *(("persona", value) for value in self.personas),
                *(("interview", value) for value in self.interview_requirements),
                *(("prd", value) for value in self.prd_requirements),
                *(("limit", value) for value in self.limits),
                *(("policy", value) for value in self.policies),
                *(
                    ("evidence", value.description)
                    for value in self.evidence_requirements
                ),
            ],
            key=lambda item: (item[0].encode("utf-16-be"), item[1].encode("utf-16-be")),
        )
        actual_descriptions = sorted(
            [(item.category, item.description) for item in self.requirements],
            key=lambda item: (item[0].encode("utf-16-be"), item[1].encode("utf-16-be")),
        )
        if actual_descriptions != expected_descriptions:
            raise ValueError(
                "deliverable requirements must exactly project accepted scope semantic lists"
            )
        return self


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
    source_urls: list[
        Annotated[str, StringConstraints(min_length=1, max_length=4000)]
    ] = Field(min_length=1, max_length=20)
    source_types: list[EvidenceSourceType] = Field(min_length=1, max_length=7)
    provider_response_hash: Sha256 | None = None
    segment_start: int | None = Field(default=None, ge=0)
    segment_end: int | None = Field(default=None, gt=0)
    offset_unit: Literal["utf8_bytes"] | None = None

    @model_validator(mode="after")
    def exact_claim_identity(self) -> "EvidenceClaimV1":
        if any(not is_canonical_public_https_url(url) for url in self.source_urls):
            raise ValueError(
                "evidence claim source URLs must be canonical public HTTPS"
            )
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
    source_types_seen: list[EvidenceSourceType] = Field(
        default_factory=list, max_length=7
    )

    @model_validator(mode="after")
    def exact_provider_provenance(self) -> "EvidenceAcquisitionPassV1":
        response_bytes = self.provider_response_text.encode("utf-8")
        if hashlib.sha256(response_bytes).hexdigest() != self.provider_response_hash:
            raise ValueError(
                "provider response hash does not match stored acquisition text"
            )
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
                raise ValueError(
                    "acquisition claim must bind an exact provider response span"
                )
            try:
                segment = response_bytes[
                    claim.segment_start : claim.segment_end
                ].decode("utf-8")
            except UnicodeDecodeError as error:
                raise ValueError(
                    "acquisition claim span splits a UTF-8 sequence"
                ) from error
            if segment != claim.text:
                raise ValueError("acquisition claim span does not match claim text")
        return self


class ResearchSourceV1(ContractModel):
    """Immutable human-readable metadata for one grounded source snapshot."""

    source_id: Sha256
    source_title: Text1000
    canonical_url: Annotated[str, StringConstraints(min_length=1, max_length=4000)]
    source_classes: list[EvidenceSourceType] = Field(min_length=1, max_length=7)
    retrieval_date: Rfc3339Utc
    supported_claim_ids: list[Sha256] = Field(min_length=1, max_length=400)

    @model_validator(mode="after")
    def exact_source_identity(self) -> "ResearchSourceV1":
        if not is_canonical_public_https_url(self.canonical_url):
            raise ValueError("research source URL must be canonical public HTTPS")
        if self.source_classes != utf16_ordinal_sorted(set(self.source_classes)):
            raise ValueError("research source classes must be sorted and unique")
        if self.supported_claim_ids != utf16_ordinal_sorted(
            set(self.supported_claim_ids)
        ):
            raise ValueError("supported claim IDs must be sorted and unique")
        try:
            datetime.fromisoformat(self.retrieval_date.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("retrievalDate must be a real UTC datetime") from error
        expected = canonical_hash(
            {
                "canonicalUrl": self.canonical_url,
                "retrievalDate": self.retrieval_date,
                "sourceClasses": self.source_classes,
                "sourceTitle": self.source_title,
            }
        )
        if self.source_id != expected:
            raise ValueError("research source ID does not match immutable metadata")
        return self


class SelectedEvidenceArtifactV1(ContractModel):
    schema_version: Literal["axwise.evidence.v1"] = "axwise.evidence.v1"
    requirement_id: Text120
    applicability: Literal["applicable", "not_applicable"] = "applicable"
    claims: list[EvidenceClaimV1] = Field(default_factory=list, max_length=100)
    conflicts: list[Text2000] = Field(default_factory=list, max_length=40)
    source_catalogue: list[ResearchSourceV1] = Field(max_length=400)

    @model_validator(mode="after")
    def exact_selected_source_catalogue(self) -> "SelectedEvidenceArtifactV1":
        if self.applicability == "not_applicable" and (
            self.claims or self.source_catalogue
        ):
            raise ValueError(
                "not-applicable evidence cannot carry claims or source metadata"
            )
        _validate_source_catalogue(self.claims, self.source_catalogue)
        return self


def _validate_source_catalogue(
    claims: list[EvidenceClaimV1], sources: list[ResearchSourceV1]
) -> None:
    if sources != sorted(sources, key=lambda source: source.source_id):
        raise ValueError("sourceCatalogue must be sorted by sourceId")
    if len({source.source_id for source in sources}) != len(sources):
        raise ValueError("sourceCatalogue source IDs must be unique")
    claim_by_id: dict[str, EvidenceClaimV1] = {}
    for claim in claims:
        prior = claim_by_id.get(claim.claim_id)
        if prior is not None and prior != claim:
            raise ValueError(
                "duplicate claim IDs must have identical immutable content"
            )
        claim_by_id[claim.claim_id] = claim
    covered_pairs: set[tuple[str, str]] = set()
    for source in sources:
        for claim_id in source.supported_claim_ids:
            claim = claim_by_id.get(claim_id)
            if claim is None or source.canonical_url not in claim.source_urls:
                raise ValueError(
                    "sourceCatalogue must link only ledger claims that cite its URL"
                )
            covered_pairs.add((claim_id, source.canonical_url))
    expected_pairs = {
        (claim.claim_id, url) for claim in claims for url in claim.source_urls
    }
    if covered_pairs != expected_pairs:
        raise ValueError("sourceCatalogue must cover every claim source URL exactly")


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
    claim_ledger: list[EvidenceAcquisitionPassV1] = Field(
        default_factory=list, max_length=160
    )
    selected_claims: list[EvidenceClaimV1] = Field(max_length=400)
    source_catalogue: list[ResearchSourceV1] = Field(max_length=400)

    @model_validator(mode="after")
    def readiness_consistency(self) -> "ResearchResultV2":
        if len({finding.requirement_id for finding in self.findings}) != len(
            self.findings
        ):
            raise ValueError("research findings must have unique requirement IDs")
        if len(
            {(entry.requirement_id, entry.pass_number) for entry in self.claim_ledger}
        ) != len(self.claim_ledger):
            raise ValueError(
                "research acquisition passes must be unique per requirement"
            )
        acquired_requirement_ids = {entry.requirement_id for entry in self.claim_ledger}
        all_claims = [
            *self.selected_claims,
            *[claim for entry in self.claim_ledger for claim in entry.claims],
        ]
        selected_ids = [claim.claim_id for claim in self.selected_claims]
        if selected_ids != utf16_ordinal_sorted(set(selected_ids)):
            raise ValueError("selectedClaims must be sorted by unique claim ID")
        _validate_source_catalogue(all_claims, self.source_catalogue)
        for finding in self.findings:
            if (
                finding.requirement_id in acquired_requirement_ids
                and self.claim_ledger_artifact_id not in finding.source_artifact_ids
            ):
                raise ValueError(
                    "dynamically acquired finding must cite its claim ledger"
                )
        # A verified conflict is never an optional gap: it means two accepted
        # evidence facts cannot simultaneously support the artifact.
        unresolved_blocking = any(
            finding.status == "conflicting"
            or (finding.blocking and finding.status == "missing")
            for finding in self.findings
        )
        unresolved_nonblocking = any(
            not finding.blocking and finding.status == "missing"
            for finding in self.findings
        )
        expected_gaps = [
            finding.note
            for finding in self.findings
            if not finding.blocking and finding.status == "missing"
        ]
        expected_conflicts = [
            finding.note for finding in self.findings if finding.status == "conflicting"
        ]
        if self.gaps != expected_gaps:
            raise ValueError(
                "research gaps must exactly summarize unresolved nonblocking findings"
            )
        if self.conflicts != expected_conflicts:
            raise ValueError(
                "research conflicts must exactly summarize conflicting findings"
            )
        expected_readiness = (
            "blocked"
            if unresolved_blocking
            else (
                "ready_with_gaps"
                if unresolved_nonblocking or self.assumptions
                else "ready"
            )
        )
        if self.readiness != expected_readiness:
            raise ValueError(
                "evidence readiness is not the deterministic finding result"
            )
        return self


class SourceAppendixEntryV1(ContractModel):
    claim_id: Sha256
    source_title: Text1000
    canonical_url: Annotated[str, StringConstraints(min_length=1, max_length=4000)]
    source_class: EvidenceSourceType
    retrieval_date: Rfc3339Utc
    supported_claim: str = Field(min_length=1, max_length=12_000)
    supported_section: Text500

    @model_validator(mode="after")
    def canonical_public_source(self) -> "SourceAppendixEntryV1":
        if not is_canonical_public_https_url(self.canonical_url):
            raise ValueError("source appendix URL must be canonical public HTTPS")
        try:
            datetime.fromisoformat(self.retrieval_date.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError(
                "source appendix retrievalDate must be a real UTC datetime"
            ) from error
        return self


class SafeScopeDefaultsV2(ContractModel):
    geography: list[Text160] = Field(default_factory=list, max_length=24)
    accepted_source_types: list[EvidenceSourceType] = Field(
        default_factory=list, max_length=7
    )
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
    objective_only_context: list[ArtifactRef] = Field(
        default_factory=list, max_length=20
    )
    safe_defaults: SafeScopeDefaultsV2 = Field(default_factory=SafeScopeDefaultsV2)


AssistantRouteV1 = Literal[
    "DIRECT_ANSWER",
    "DISCOVER",
    "AXWISE_ONE_SHOT",
    "PROPOSE_GOAL",
    "START_GOAL",
    "CONTINUE_GOAL",
]
AssistantContextAuthorityV1 = Literal["owner_prior", "assistant_reference"]
AssistantContextProvenanceV1 = Literal[
    "persisted_owner_message",
    "orqaly_local_output",
    "axwise_operation_output",
]
AssistantContextContentKindV1 = Literal["artifact", "text"]
ASSISTANT_CONTEXT_TRUNCATION_MARKER = "\n[assistant context truncated]"


class AssistantContextSourceSpanV1(StrictWireContractModel):
    start: int = Field(ge=0, strict=True)
    end: int = Field(gt=0, strict=True)
    offset_unit: Literal["utf16_code_units"]
    text: str = Field(min_length=1)
    sha256: Sha256

    @model_validator(mode="after")
    def ordered(self) -> "AssistantContextSourceSpanV1":
        if self.end <= self.start:
            raise ValueError("source span end must be greater than start")
        return self


class AssistantContextArtifactRefV1(StrictWireContractModel):
    artifact_id: AssistantWireUuid
    artifact_hash: Sha256
    kind: Annotated[str, StringConstraints(min_length=1, max_length=120)]

    @model_validator(mode="after")
    def bounded_utf16_kind(self) -> "AssistantContextArtifactRefV1":
        if utf16_length(self.kind) > 120:
            raise ValueError("artifact kind exceeds 120 UTF-16 code units")
        return self


class AssistantContextSafeScopeDefaultsV2(StrictWireContractModel):
    geography: list[Text160] = Field(default_factory=list, max_length=24)
    accepted_source_types: list[EvidenceSourceType] = Field(
        default_factory=list, max_length=7
    )
    assumptions: list[Text1000] = Field(default_factory=list, max_length=24)
    limits: list[Text1000] = Field(default_factory=list, max_length=40)
    policies: list[Text1000] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def canonical_source_types(self) -> "AssistantContextSafeScopeDefaultsV2":
        if self.accepted_source_types != utf16_ordinal_sorted(
            set(self.accepted_source_types)
        ):
            raise ValueError("default accepted source types must be sorted and unique")
        for value in self.geography:
            if utf16_length(value) > 160:
                raise ValueError("default geography exceeds 160 UTF-16 code units")
        for values, maximum, label in (
            (self.assumptions, 1000, "assumption"),
            (self.limits, 1000, "limit"),
            (self.policies, 1000, "policy"),
        ):
            if any(utf16_length(value) > maximum for value in values):
                raise ValueError(f"default {label} exceeds {maximum} UTF-16 code units")
        return self


class AssistantContextMessageV1(StrictWireContractModel):
    message_id: AssistantWireUuid
    turn_id: AssistantWireUuid
    authority: AssistantContextAuthorityV1
    provenance: AssistantContextProvenanceV1
    content_kinds: list[AssistantContextContentKindV1] = Field(
        min_length=1, max_length=2
    )
    content: str = Field(min_length=1, max_length=4000)
    content_sha256: Sha256
    source_span: AssistantContextSourceSpanV1
    source_message_hash: Sha256
    truncated: bool = Field(strict=True)

    @model_validator(mode="after")
    def exact_projection(self) -> "AssistantContextMessageV1":
        if utf16_length(self.content) > 4000:
            raise ValueError("assistant context content exceeds 4000 UTF-16 code units")
        canonical_kinds = [
            kind for kind in ("text", "artifact") if kind in set(self.content_kinds)
        ]
        if self.content_kinds != canonical_kinds:
            raise ValueError(
                "assistant context contentKinds must use canonical text/artifact order"
            )
        if self.authority == "owner_prior":
            if self.provenance != "persisted_owner_message":
                raise ValueError(
                    "owner context must come from a persisted owner message"
                )
        elif self.provenance not in {
            "orqaly_local_output",
            "axwise_operation_output",
        }:
            raise ValueError("assistant context must identify its output provenance")
        try:
            exact_hash = hashlib.sha256(self.content.encode("utf-8")).hexdigest()
        except UnicodeEncodeError as error:
            raise ValueError(
                "assistant context content must contain Unicode scalars"
            ) from error
        if self.content_sha256 != exact_hash:
            raise ValueError("assistant context content hash does not match content")
        if self.source_span.text != self.content:
            raise ValueError("assistant context source span text must equal content")
        if self.source_span.sha256 != exact_hash:
            raise ValueError(
                "assistant context source span hash must equal content hash"
            )
        if self.truncated != self.content.endswith(ASSISTANT_CONTEXT_TRUNCATION_MARKER):
            raise ValueError(
                "assistant context truncated flag must match its truncation marker"
            )
        return self


class AssistantContextTurnV1(StrictWireContractModel):
    root_turn_id: AssistantWireUuid
    route: AssistantRouteV1
    user: AssistantContextMessageV1
    assistant: AssistantContextMessageV1

    @model_validator(mode="after")
    def exact_completed_pair(self) -> "AssistantContextTurnV1":
        if self.user.authority != "owner_prior":
            raise ValueError("assistant context turn user must be owner_prior")
        if self.assistant.authority != "assistant_reference":
            raise ValueError(
                "assistant context turn assistant must be assistant_reference"
            )
        if self.root_turn_id != self.user.turn_id:
            raise ValueError("assistant context rootTurnId must equal the user turnId")
        if self.user.message_id == self.assistant.message_id:
            raise ValueError("assistant context pair message IDs must be distinct")
        expected_provenance = (
            "axwise_operation_output"
            if self.route in {"DIRECT_ANSWER", "DISCOVER", "AXWISE_ONE_SHOT"}
            else "orqaly_local_output"
        )
        if self.assistant.provenance != expected_provenance:
            raise ValueError(
                "assistant context provenance must match the persisted route"
            )
        return self


class AssistantContextInstructionV1(StrictWireContractModel):
    content: str = Field(min_length=1, max_length=24_000)
    authority: Literal["owner_current"]
    provenance: Literal["persisted_owner_message_projection"]
    source_span: AssistantContextSourceSpanV1

    @model_validator(mode="after")
    def bounded_utf16_content(self) -> "AssistantContextInstructionV1":
        if utf16_length(self.content) > 24_000:
            raise ValueError("assistant instruction exceeds 24000 UTF-16 code units")
        try:
            exact_hash = hashlib.sha256(self.content.encode("utf-8")).hexdigest()
        except UnicodeEncodeError as error:
            raise ValueError(
                "assistant instruction must contain Unicode scalars"
            ) from error
        if (
            self.source_span.text != self.content
            or self.source_span.sha256 != exact_hash
        ):
            raise ValueError("assistant instruction source span must match its content")
        return self


class AssistantContextEnvelopeV1(StrictWireContractModel):
    type: Literal["AssistantContextEnvelopeV1"]
    source: Literal["orqaly_assistant_thread"]
    purpose: Literal["resolve_deictic_goal_instruction"]
    thread_id: AssistantWireUuid
    current_message_id: AssistantWireUuid
    current_turn_id: AssistantWireUuid
    current_message_hash: Sha256
    instruction: AssistantContextInstructionV1
    selection_policy: Literal["recent_completed_pairs_retry_folded_utf16_v1"]
    authority_policy: Literal["current_over_prior_over_assistant_reference_v1"]
    turns: list[AssistantContextTurnV1] = Field(max_length=6)
    omitted_turn_count: int = Field(ge=0, strict=True)
    truncated_message_count: int = Field(ge=0, le=12, strict=True)
    envelope_hash: Sha256

    @model_validator(mode="after")
    def exact_envelope(self) -> "AssistantContextEnvelopeV1":
        message_ids = [
            message.message_id
            for turn in self.turns
            for message in (turn.user, turn.assistant)
        ]
        if len(message_ids) != len(set(message_ids)):
            raise ValueError("assistant context message IDs must be unique")
        if self.current_message_id in message_ids:
            raise ValueError("current assistant message cannot also be prior context")
        root_turn_ids = [turn.root_turn_id for turn in self.turns]
        if len(root_turn_ids) != len(set(root_turn_ids)):
            raise ValueError("assistant context root turn IDs must be unique")
        prior_turn_id_sets = [
            {turn.root_turn_id, turn.user.turn_id, turn.assistant.turn_id}
            for turn in self.turns
        ]
        seen_turn_ids = {self.current_turn_id}
        for turn_ids in prior_turn_id_sets:
            if seen_turn_ids.intersection(turn_ids):
                raise ValueError(
                    "assistant context current and completed turn identities must not overlap"
                )
            seen_turn_ids.update(turn_ids)
        exact_truncated_count = sum(
            int(message.truncated)
            for turn in self.turns
            for message in (turn.user, turn.assistant)
        )
        if self.truncated_message_count != exact_truncated_count:
            raise ValueError(
                "truncatedMessageCount must equal truncated projected messages"
            )
        payload = self.model_dump(mode="json", by_alias=True, exclude={"envelope_hash"})
        if self.envelope_hash != canonical_hash(payload):
            raise ValueError("assistant context envelope hash does not match envelope")
        return self


def render_assistant_context_request(context: AssistantContextEnvelopeV1) -> str:
    rendered = context.instruction.content
    for turn in context.turns:
        rendered += f"\n\nOWNER_PRIOR\n{turn.user.content}"
        rendered += f"\n\nASSISTANT_REFERENCE\n{turn.assistant.content}"
    return rendered


class ExecutionAgentSourceV1(StrictWireContractModel):
    thread_id: UUID
    turn_id: UUID
    task_hash: Sha256


class ExecutionAgentOwnerV1(StrictWireContractModel):
    tenant_id: UUID
    user_id: ClerkUserId


class ExecutionAgentAvatarV1(StrictWireContractModel):
    kind: Literal["icon", "emoji"]
    value: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=32),
    ]
    color: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            to_upper=True,
            pattern=r"^#[0-9A-Fa-f]{6}$",
        ),
    ]

    @model_validator(mode="after")
    def reviewed_avatar(self) -> "ExecutionAgentAvatarV1":
        icon_keys = {
            "smart_toy",
            "bolt",
            "science",
            "support_agent",
            "campaign",
            "code",
        }
        if self.kind == "icon" and self.value not in icon_keys:
            raise ValueError("unknown Agent avatar icon")
        if self.kind == "emoji":
            has_pictograph = any(
                unicodedata.category(character) == "So" for character in self.value
            )
            has_control = any(
                unicodedata.category(character) in {"Cc", "Cs"}
                for character in self.value
            )
            if not has_pictograph or has_control:
                raise ValueError("Agent emoji avatar must contain a printable emoji")
        return self


class ExecutionAgentProfileInputV1(StrictWireContractModel):
    version: Literal["orqaly_agent_profile_input_v1"]
    display_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=160),
    ]
    role_label: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=160),
    ]
    description: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=2_000),
    ]
    instructions: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=12_000),
    ]
    avatar: ExecutionAgentAvatarV1


class ExecutionAgentProfileVersionRefV1(StrictWireContractModel):
    version: Literal["orqaly_agent_profile_v1"]
    id: UUID
    agent_id: UUID
    version_number: int = Field(gt=0)
    content_hash: Sha256


class ExecutionAgentProfileSnapshotV1(StrictWireContractModel):
    version: Literal["orqaly_execution_agent_profile_snapshot_v1"]
    profile_version: ExecutionAgentProfileVersionRefV1
    profile: ExecutionAgentProfileInputV1

    @model_validator(mode="after")
    def exact_profile_hash(self) -> "ExecutionAgentProfileSnapshotV1":
        profile_payload = self.profile.model_dump(mode="json", by_alias=True)
        if self.profile_version.content_hash != canonical_hash(profile_payload):
            raise ValueError(
                "execution Agent profile hash does not match its normalized contents"
            )
        return self


class ExecutionAgentExecutorPersonaV1(StrictWireContractModel):
    role: Literal["task_executor"]
    profile_version: Literal["axwise_executor_persona_v1"]
    provider: Literal["axwise"]
    binding: Literal["fixed_profile_contract"]


class ExecutionAgentMemoryV1(StrictWireContractModel):
    scope: Literal["thread_and_goal"]
    cross_thread: Literal[False]

    @field_validator("cross_thread", mode="before")
    @classmethod
    def strict_cross_thread_boolean(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("crossThread must be a JSON boolean")
        return value


class ExecutionAgentRuntimeV1(StrictWireContractModel):
    provider: Literal["orqaly_workflow_v2"]
    isolation: Literal["tenant_user"]


class ExecutionAgentCapabilitiesV1(StrictWireContractModel):
    research: Literal[True]
    planning: Literal[True]
    artifact_production: Literal[True]
    approval_gates: Literal[True]

    @field_validator(
        "research",
        "planning",
        "artifact_production",
        "approval_gates",
        mode="before",
    )
    @classmethod
    def strict_capability_booleans(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("execution Agent capabilities must be JSON booleans")
        return value


class ExecutionAgentToolsV1(StrictWireContractModel):
    external_actions: Literal[False]
    execution_provider: None

    @field_validator("external_actions", mode="before")
    @classmethod
    def strict_external_actions_boolean(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("externalActions must be a JSON boolean")
        return value


class ExecutionAgentV1(StrictWireContractModel):
    """The immutable, truthful Agent identity attached to one Orqaly Goal run.

    This is execution metadata, not owner authority and not a tool grant.  The
    closed literals deliberately prevent a task Agent from claiming broader
    memory, isolation, capabilities, or side-effect execution than the current
    Workflow v2 runtime actually provides.
    """

    schema_version: Literal["orqaly.execution-agent.v1"]
    id: UUID
    run_id: UUID
    owner: ExecutionAgentOwnerV1
    lifetime: Literal["temporary", "persistent"]
    source: ExecutionAgentSourceV1
    # Optional only for persisted pre-profile Agent runs. New first-class
    # Agent runs bind the exact immutable control-plane profile version here.
    profile_snapshot: ExecutionAgentProfileSnapshotV1 | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    executor_persona: ExecutionAgentExecutorPersonaV1
    memory: ExecutionAgentMemoryV1
    runtime: ExecutionAgentRuntimeV1
    capabilities: ExecutionAgentCapabilitiesV1
    tools: ExecutionAgentToolsV1

    @model_validator(mode="after")
    def profile_belongs_to_agent(self) -> "ExecutionAgentV1":
        if (
            self.profile_snapshot is not None
            and self.profile_snapshot.profile_version.agent_id != self.id
        ):
            raise ValueError(
                "execution Agent profile must belong to the bound Agent identity"
            )
        return self


class CompileScopeInputV3(StrictWireContractModel):
    type: Literal["CompileScopeV3"]
    request: str = Field(min_length=1, max_length=24_000)
    assistant_context: AssistantContextEnvelopeV1
    # Rolling recovery must continue to accept persisted pre-Agent V3 inputs.
    # ``exclude_if`` preserves their exact canonical JSON and replay hashes.
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    objective_only_context: list[AssistantContextArtifactRefV1] = Field(
        default_factory=list, max_length=20
    )
    safe_defaults: AssistantContextSafeScopeDefaultsV2 = Field(
        default_factory=AssistantContextSafeScopeDefaultsV2
    )

    @model_validator(mode="after")
    def exact_rendered_request(self) -> "CompileScopeInputV3":
        if utf16_length(self.request) > 24_000:
            raise ValueError("CompileScopeV3 request exceeds 24000 UTF-16 code units")
        if self.request != render_assistant_context_request(self.assistant_context):
            raise ValueError(
                "CompileScopeV3 request must equal the canonical assistant context rendering"
            )
        cursor = 0
        expected_spans: list[tuple[SourceSpan, int, int]] = []
        instruction = self.assistant_context.instruction
        instruction_end = utf16_length(instruction.content)
        expected_spans.append((instruction.source_span, cursor, instruction_end))
        cursor = instruction_end
        for turn in self.assistant_context.turns:
            cursor += utf16_length("\n\nOWNER_PRIOR\n")
            user_end = cursor + utf16_length(turn.user.content)
            expected_spans.append((turn.user.source_span, cursor, user_end))
            cursor = user_end
            cursor += utf16_length("\n\nASSISTANT_REFERENCE\n")
            assistant_end = cursor + utf16_length(turn.assistant.content)
            expected_spans.append((turn.assistant.source_span, cursor, assistant_end))
            cursor = assistant_end
        for span, expected_start, expected_end in expected_spans:
            if "offset_unit" not in span.model_fields_set:
                raise ValueError(
                    "assistant context source spans must declare offsetUnit"
                )
            if span.start != expected_start or span.end != expected_end:
                raise ValueError(
                    "assistant context source spans must identify exact rendered content offsets"
                )
        if self.execution_agent is not None:
            source = self.execution_agent.source
            instruction = self.assistant_context.instruction.content
            try:
                task_hash = hashlib.sha256(instruction.encode("utf-8")).hexdigest()
            except UnicodeEncodeError as error:
                raise ValueError(
                    "execution Agent task must contain Unicode scalars"
                ) from error
            if source.thread_id != UUID(self.assistant_context.thread_id):
                raise ValueError(
                    "execution Agent source threadId must equal assistant context threadId"
                )
            if source.turn_id != UUID(self.assistant_context.current_turn_id):
                raise ValueError(
                    "execution Agent source turnId must equal assistant context currentTurnId"
                )
            if source.task_hash != task_hash:
                raise ValueError(
                    "execution Agent taskHash must match the exact current instruction"
                )
        return self


class ReviseScopeInputV2(ContractModel):
    type: Literal["ReviseScopeV2"]
    accepted_scope: ArtifactRef
    correction: str = Field(min_length=1, max_length=6000)
    correction_source_spans: list[SourceSpan] = Field(min_length=1, max_length=24)
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @model_validator(mode="after")
    def exact_correction_spans(self) -> "ReviseScopeInputV2":
        for span in self.correction_source_spans:
            exact_text = utf16_slice(self.correction, span.start, span.end)
            if exact_text != span.text:
                raise ValueError(
                    "correction source span text does not match correction"
                )
            if hashlib.sha256(exact_text.encode("utf-8")).hexdigest() != span.sha256:
                raise ValueError(
                    "correction source span hash does not match correction"
                )
        return self


class ExecuteResearchInputV2(ContractModel):
    type: Literal["ExecuteResearchV2"]
    accepted_scope: ArtifactRef
    scope: ScopeArtifactV2
    selected_evidence: list[ArtifactRef] = Field(default_factory=list, max_length=200)
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @model_validator(mode="after")
    def exact_research_artifact_roles(self) -> "ExecuteResearchInputV2":
        if self.accepted_scope.kind != "scope":
            raise ValueError("acceptedScope must reference a scope artifact")
        if any(item.kind != "evidence" for item in self.selected_evidence):
            raise ValueError("selectedEvidence must reference only evidence artifacts")
        if self.selected_evidence != sorted(
            self.selected_evidence, key=lambda item: str(item.artifact_id)
        ):
            raise ValueError("selectedEvidence must be sorted by artifactId")
        if len({item.artifact_id for item in self.selected_evidence}) != len(
            self.selected_evidence
        ):
            raise ValueError("selectedEvidence artifact IDs must be unique")
        return self


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


class PlanRequirementV2(ContractModel):
    id: RequirementId
    category: PlanRequirementCategoryV2
    description: Text2000
    priority: Literal["P0", "P1", "P2"]
    authority: Literal["owner", "safe_default", "axwise_derived"]

    @model_validator(mode="after")
    def exact_typed_requirement(self) -> "PlanRequirementV2":
        semantic = self.model_dump(mode="json", by_alias=True, exclude={"id"})
        if self.id != f"req-{canonical_hash(semantic)[:16]}":
            raise ValueError("plan requirement ID does not match its semantics")
        return self


class WorkflowOutputContractV1(ContractModel):
    format: Literal["text/markdown"]
    artifact_type: DeliverableArtifactTypeV1
    required_sections: list[Text300] = Field(min_length=1, max_length=80)
    requirement_ids: list[RequirementId] = Field(min_length=1, max_length=120)
    rubric: list[Text1000] = Field(min_length=1, max_length=20)
    acceptance_criteria: list[DeliverableAcceptanceCriterionV1] = Field(
        min_length=1, max_length=120
    )
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    launch_ready_allowed: bool
    source_appendix_required: bool

    @model_validator(mode="after")
    def canonical_output_contract(self) -> "WorkflowOutputContractV1":
        if self.required_sections != utf16_ordinal_sorted(set(self.required_sections)):
            raise ValueError("requiredSections must be sorted and unique")
        if self.requirement_ids != utf16_ordinal_sorted(set(self.requirement_ids)):
            raise ValueError(
                "output-contract requirement IDs must be sorted and unique"
            )
        if self.rubric != utf16_ordinal_sorted(set(self.rubric)):
            raise ValueError("output-contract rubric must be sorted and unique")
        criterion_ids = [item.id for item in self.acceptance_criteria]
        if criterion_ids != utf16_ordinal_sorted(set(criterion_ids)):
            raise ValueError(
                "output-contract acceptance criteria must be sorted and unique"
            )
        supported = {
            requirement_id
            for criterion in self.acceptance_criteria
            for requirement_id in criterion.supports
        }
        if supported != set(self.requirement_ids):
            raise ValueError(
                "output-contract acceptance criteria must cover every requirement ID"
            )
        expected_launch_authority = (
            self.artifact_type == "launch_authorization"
            and self.evidence_readiness == "ready"
        )
        if self.launch_ready_allowed != expected_launch_authority:
            raise ValueError(
                "launchReadyAllowed requires ready launch_authorization evidence"
            )
        return self


class ReaderOutputFormatV1(ContractModel):
    value: Literal[
        "checklist", "template", "email", "message", "post", "script", "faq", "agenda"
    ]
    requirement_id: RequirementId


class ReaderWordLimitV1(ContractModel):
    maximum_words: int = Field(ge=1, le=120_000)
    basis: Literal["owner_explicit", "bounded_content_default_v1"]
    requirement_id: RequirementId


class ReaderItemLimitV1(ContractModel):
    exact_items: int = Field(ge=1, le=500)
    item_kind: Literal[
        "agenda_item",
        "checklist_item",
        "email_section",
        "faq_item",
        "message_section",
        "post_section",
        "script_step",
        "template_section",
    ]
    requirement_id: RequirementId


class ReaderOutputMeasurementV1(ContractModel):
    scope: Literal["reader_markdown_before_server_disclosures"]
    word_counter: Literal["unicode_words_v1"]
    item_counter: Literal["top_level_markdown_items_v1"]


class ReaderOutputContractV1(ContractModel):
    schema_version: Literal["orqaly.reader-output.v1"]
    reader_format: ReaderOutputFormatV1
    word_limit: ReaderWordLimitV1 | None
    item_limit: ReaderItemLimitV1 | None
    measurement: ReaderOutputMeasurementV1

    @model_validator(mode="after")
    def exact_reader_limits(self) -> "ReaderOutputContractV1":
        expected_item_kind = {
            "agenda": "agenda_item",
            "checklist": "checklist_item",
            "email": "email_section",
            "faq": "faq_item",
            "message": "message_section",
            "post": "post_section",
            "script": "script_step",
            "template": "template_section",
        }[self.reader_format.value]
        if (
            self.item_limit is not None
            and self.item_limit.item_kind != expected_item_kind
        ):
            raise ValueError("reader item kind must match the selected reader format")
        if (
            self.word_limit is not None
            and self.word_limit.basis == "bounded_content_default_v1"
            and self.word_limit.maximum_words != 250
        ):
            raise ValueError("bounded content default v1 is exactly 250 reader words")
        return self


class WorkflowOutputContractV2(WorkflowOutputContractV1):
    schema_version: Literal["orqaly.markdown-output-contract.v2"]
    reader_output: ReaderOutputContractV1 | None

    @model_validator(mode="after")
    def bounded_reader_output(self) -> "WorkflowOutputContractV2":
        if self.reader_output is not None and self.artifact_type not in {
            "content_artifact",
            "general_artifact",
        }:
            raise ValueError(
                "readerOutput is only valid for content or general artifacts"
            )
        if self.reader_output is not None:
            referenced = {
                self.reader_output.reader_format.requirement_id,
                *(
                    [self.reader_output.word_limit.requirement_id]
                    if self.reader_output.word_limit is not None
                    else []
                ),
                *(
                    [self.reader_output.item_limit.requirement_id]
                    if self.reader_output.item_limit is not None
                    else []
                ),
            }
            if not referenced.issubset(set(self.requirement_ids)):
                raise ValueError(
                    "readerOutput requirement IDs must belong to the output contract"
                )
        return self


WorkflowOutputContract = WorkflowOutputContractV1 | WorkflowOutputContractV2


class ExecutionTaskV2(ContractModel):
    stage_id: UUID
    stage_key: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,119}$")]
    title: Text500
    task_kind: Literal["core_draft", "specialist_analysis"]
    required_role: Text160
    lens: Text500
    required_capabilities: list[Text120] = Field(min_length=1, max_length=20)
    acceptance_requirement_ids: list[RequirementId] = Field(
        min_length=1, max_length=120
    )
    produces_full_contract: bool
    input_hash: Sha256
    depends_on_stage_keys: list[Text120] = Field(max_length=40)
    agent: SelectedAgentV2
    agent_id: UUID
    tool_ids: list[UUID] = Field(max_length=40)
    budget_cents: int = Field(ge=0)
    data_boundary: list[Text500] = Field(max_length=40)

    @model_validator(mode="after")
    def exact_input_hash(self) -> "ExecutionTaskV2":
        if self.required_capabilities != utf16_ordinal_sorted(
            set(self.required_capabilities)
        ):
            raise ValueError("requiredCapabilities must be sorted and unique")
        if self.acceptance_requirement_ids != utf16_ordinal_sorted(
            set(self.acceptance_requirement_ids)
        ):
            raise ValueError("acceptance requirement IDs must be sorted and unique")
        if self.depends_on_stage_keys != utf16_ordinal_sorted(
            set(self.depends_on_stage_keys)
        ):
            raise ValueError("task dependencies must be sorted and unique")
        if self.tool_ids != sorted(set(self.tool_ids), key=str):
            raise ValueError("task tool IDs must be sorted and unique")
        if self.data_boundary != utf16_ordinal_sorted(set(self.data_boundary)):
            raise ValueError("task data boundary must be sorted and unique")
        if self.agent_id != self.agent.id:
            raise ValueError("task agentId must equal its immutable agent snapshot")
        if not set(self.required_capabilities).issubset(self.agent.capabilities):
            raise ValueError("task capabilities must exist in its agent snapshot")
        if self.tool_ids != self.agent.tool_ids:
            raise ValueError("task tools must equal its agent snapshot")
        if self.budget_cents != self.agent.cost_per_run_cents:
            raise ValueError("task budget must equal its agent snapshot")
        if self.produces_full_contract != (self.task_kind == "core_draft"):
            raise ValueError("only the core draft may produce the full contract")
        core = self.model_dump(mode="json", by_alias=True, exclude={"input_hash"})
        if canonical_hash(core) != self.input_hash:
            raise ValueError("task inputHash does not match immutable task semantics")
        return self


class PlanningResultV2(ContractModel):
    schema_version: Literal["orqaly.plan.v2"]
    accepted_scope_artifact: ArtifactRef
    research_artifact: ArtifactRef
    work_shape: Literal[
        "product_prd",
        "software_prd",
        "research_strategy",
        "content_artifact",
        "operational_plan",
        "launch_authorization",
        "general_artifact",
    ]
    requirements: list[PlanRequirementV2] = Field(min_length=1, max_length=120)
    output_contract: WorkflowOutputContract
    tasks: list[ExecutionTaskV2] = Field(min_length=1, max_length=100)
    plan_hash: Sha256

    @model_validator(mode="after")
    def exact_plan_hash(self) -> "PlanningResultV2":
        core = self.model_dump(mode="json", by_alias=True, exclude={"plan_hash"})
        if canonical_hash(core) != self.plan_hash:
            raise ValueError("planHash does not match immutable plan content")
        requirement_ids = [item.id for item in self.requirements]
        if requirement_ids != utf16_ordinal_sorted(set(requirement_ids)):
            raise ValueError("plan requirements must be sorted by unique ID")
        if self.output_contract.requirement_ids != requirement_ids:
            raise ValueError("output contract must cover every plan requirement")
        if self.output_contract.artifact_type != self.work_shape:
            raise ValueError("output contract artifactType must equal plan workShape")
        if (
            isinstance(self.output_contract, WorkflowOutputContractV2)
            and self.output_contract.reader_output is not None
        ):
            requirements_by_id = {item.id: item for item in self.requirements}
            reader_output = self.output_contract.reader_output
            referenced = {
                reader_output.reader_format.requirement_id,
                *(
                    [reader_output.word_limit.requirement_id]
                    if reader_output.word_limit is not None
                    else []
                ),
                *(
                    [reader_output.item_limit.requirement_id]
                    if reader_output.item_limit is not None
                    else []
                ),
            }
            if any(
                requirements_by_id.get(requirement_id) is None
                or requirements_by_id[requirement_id].authority != "owner"
                or requirements_by_id[requirement_id].category
                not in {"deliverable", "limit", "policy"}
                for requirement_id in referenced
            ):
                raise ValueError(
                    "readerOutput constraints must reference owner-authored "
                    "deliverable, limit, or policy requirements"
                )
        if len({task.stage_id for task in self.tasks}) != len(self.tasks):
            raise ValueError("plan task stage IDs must be unique")
        if len({task.stage_key for task in self.tasks}) != len(self.tasks):
            raise ValueError("plan task stage keys must be unique")
        known_stage_keys = {task.stage_key for task in self.tasks}
        if any(
            not set(task.depends_on_stage_keys).issubset(known_stage_keys)
            or task.stage_key in task.depends_on_stage_keys
            for task in self.tasks
        ):
            raise ValueError("plan task dependencies must reference other plan tasks")
        unresolved_dependencies = {
            task.stage_key: set(task.depends_on_stage_keys) for task in self.tasks
        }
        while unresolved_dependencies:
            ready = {
                stage_key
                for stage_key, dependencies in unresolved_dependencies.items()
                if not dependencies
            }
            if not ready:
                raise ValueError("plan task dependencies must form an acyclic DAG")
            unresolved_dependencies = {
                stage_key: dependencies - ready
                for stage_key, dependencies in unresolved_dependencies.items()
                if stage_key not in ready
            }
        core_tasks = [task for task in self.tasks if task.task_kind == "core_draft"]
        if len(core_tasks) != 1 or not core_tasks[0].produces_full_contract:
            raise ValueError("plan requires exactly one full-contract core draft")
        if set(core_tasks[0].acceptance_requirement_ids) != set(requirement_ids):
            raise ValueError("core draft must cover every plan requirement")
        if any(
            not set(task.acceptance_requirement_ids).issubset(requirement_ids)
            for task in self.tasks
        ):
            raise ValueError("task acceptance IDs must reference plan requirements")
        specialists = [
            task for task in self.tasks if task.task_kind == "specialist_analysis"
        ]
        expected_specialists = 3 if self.work_shape == "software_prd" else 2
        if len(specialists) != expected_specialists:
            raise ValueError(
                f"{self.work_shape} plan requires exactly {expected_specialists} "
                "independent specialist analyses"
            )
        core = core_tasks[0]
        if any(task.depends_on_stage_keys for task in specialists):
            raise ValueError("specialist analyses must be independent")
        if set(core.depends_on_stage_keys) != {task.stage_key for task in specialists}:
            raise ValueError(
                "core draft must consume every independent specialist analysis"
            )
        return self


class RequirementCoverageV1(ContractModel):
    requirement_id: RequirementId
    status: Literal["satisfied", "gap", "not_applicable"]
    note: Text4000


class ExecutionReceiptV2(ContractModel):
    agent: SelectedAgentV2
    tool_ids: list[UUID] = Field(max_length=40)
    budget_cents: int = Field(ge=0)
    data_boundary: list[Text500] = Field(max_length=40)


class TaskCandidateAttestationV1(ContractModel):
    task: ExecutionTaskV2
    requirement_coverage: list[RequirementCoverageV1] = Field(
        min_length=1, max_length=120
    )
    execution_receipt: ExecutionReceiptV2

    @model_validator(mode="after")
    def exact_candidate_attestation(self) -> "TaskCandidateAttestationV1":
        coverage_ids = [item.requirement_id for item in self.requirement_coverage]
        if coverage_ids != self.task.acceptance_requirement_ids:
            raise ValueError(
                "candidate coverage must equal task acceptance requirements"
            )
        if (
            self.execution_receipt.agent != self.task.agent
            or self.execution_receipt.tool_ids != self.task.tool_ids
            or self.execution_receipt.budget_cents != self.task.budget_cents
            or self.execution_receipt.data_boundary != self.task.data_boundary
        ):
            raise ValueError("candidate receipt must equal its task permissions")
        return self


def _validate_source_appendix_order(values: list[SourceAppendixEntryV1]) -> None:
    keys = [
        "\0".join(
            (
                item.claim_id,
                item.canonical_url,
                item.retrieval_date,
                item.source_class,
                item.source_title,
                item.supported_section,
            )
        )
        for item in values
    ]
    if keys != utf16_ordinal_sorted(set(keys)):
        raise ValueError(
            "sourceAppendix must be sorted and unique by exact source snapshot"
        )


class FinalArtifactV1(ContractModel):
    schema_version: Literal["axwise.final-markdown.v1"] = "axwise.final-markdown.v1"
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)
    source_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    source_appendix: list[SourceAppendixEntryV1] = Field(max_length=400)
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    launch_ready: bool
    candidate_attestation: TaskCandidateAttestationV1 | None = None

    @model_validator(mode="after")
    def exact_final_artifact(self) -> "FinalArtifactV1":
        if self.evidence_readiness != "ready" and self.launch_ready:
            raise ValueError(
                "artifact with evidence gaps or blocks cannot be launch-ready"
            )
        _validate_source_appendix_order(self.source_appendix)
        if self.source_artifacts != sorted(
            self.source_artifacts, key=lambda item: str(item.artifact_id)
        ) or len({item.artifact_id for item in self.source_artifacts}) != len(
            self.source_artifacts
        ):
            raise ValueError("final source artifacts must be sorted and unique")
        return self


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
    requirement_coverage: list[RequirementCoverageV1] = Field(
        min_length=1, max_length=120
    )
    source_appendix: list[SourceAppendixEntryV1] = Field(max_length=400)
    execution_receipt: ExecutionReceiptV2
    conclusions: list[Text4000] = Field(min_length=1, max_length=100)
    unknowns: list[Text4000] = Field(max_length=100)

    @model_validator(mode="after")
    def exact_task_packet(self) -> "TaskResultV2":
        _validate_source_appendix_order(self.source_appendix)
        if self.source_artifacts != sorted(
            self.source_artifacts, key=lambda item: str(item.artifact_id)
        ) or len({item.artifact_id for item in self.source_artifacts}) != len(
            self.source_artifacts
        ):
            raise ValueError("task-result source artifacts must be sorted and unique")
        coverage_ids = [item.requirement_id for item in self.requirement_coverage]
        if coverage_ids != utf16_ordinal_sorted(set(coverage_ids)):
            raise ValueError(
                "requirementCoverage must be sorted by unique requirement ID"
            )
        if coverage_ids != self.task.acceptance_requirement_ids:
            raise ValueError("task result must cover every task acceptance requirement")
        if self.execution_receipt.agent != self.task.agent:
            raise ValueError("execution receipt agent must equal the task snapshot")
        if self.execution_receipt.tool_ids != self.task.tool_ids:
            raise ValueError("execution receipt tools must equal task permissions")
        if self.execution_receipt.budget_cents != self.task.budget_cents:
            raise ValueError("execution receipt budget must equal task permission")
        if self.execution_receipt.data_boundary != self.task.data_boundary:
            raise ValueError(
                "execution receipt data boundary must equal task permission"
            )
        return self


class EvaluationResultV1(ContractModel):
    schema_version: Literal["orqaly.evaluation.v1"]
    task_artifacts: list[ArtifactRef] = Field(min_length=1, max_length=200)
    source_artifacts: list[ArtifactRef] = Field(min_length=4, max_length=203)
    output_contract_hash: Sha256
    repair_pass: Literal[0]
    evidence_readiness: Literal["ready", "ready_with_gaps", "blocked"]
    unmet_requirement_ids: list[RequirementId] = Field(max_length=120)
    unresolved_source_markers: list[Text500] = Field(max_length=400)
    unsupported_precision: list[Text2000] = Field(max_length=40)
    contradictions: list[Text2000] = Field(max_length=40)
    stale_topic_references: list[Text2000] = Field(max_length=40)
    readiness_violations: list[Text2000] = Field(max_length=40)
    substantive_content_defects: list[Text2000] = Field(max_length=40)
    practicality_defects: list[Text2000] = Field(max_length=40)
    output_contract_satisfied: bool
    promoted_artifact: ArtifactRef | None
    repair_required: bool
    repair_instructions: list[Text2000] = Field(max_length=40)
    note: Text2000

    @model_validator(mode="after")
    def exact_promotion_fact(self) -> "EvaluationResultV1":
        if self.task_artifacts != sorted(
            self.task_artifacts, key=lambda item: str(item.artifact_id)
        ) or len({item.artifact_id for item in self.task_artifacts}) != len(
            self.task_artifacts
        ):
            raise ValueError("evaluation taskArtifacts must be sorted and unique")
        expected_core = []
        for kind in ("scope", "research", "plan"):
            matching = [item for item in self.source_artifacts if item.kind == kind]
            if len(matching) != 1:
                raise ValueError(
                    "evaluation sources require one exact scope, research and plan"
                )
            expected_core.extend(matching)
        expected_sources = sorted(
            [*expected_core, *self.task_artifacts],
            key=lambda item: str(item.artifact_id),
        )
        if self.source_artifacts != expected_sources or len(
            {item.artifact_id for item in self.source_artifacts}
        ) != len(self.source_artifacts):
            raise ValueError(
                "evaluation sourceArtifacts must exactly cover scope, research, plan and tasks"
            )
        for name, values in (
            ("unmetRequirementIds", self.unmet_requirement_ids),
            ("unresolvedSourceMarkers", self.unresolved_source_markers),
            ("unsupportedPrecision", self.unsupported_precision),
            ("contradictions", self.contradictions),
            ("staleTopicReferences", self.stale_topic_references),
            ("readinessViolations", self.readiness_violations),
            ("substantiveContentDefects", self.substantive_content_defects),
            ("practicalityDefects", self.practicality_defects),
            ("repairInstructions", self.repair_instructions),
        ):
            if values != utf16_ordinal_sorted(set(values)):
                raise ValueError(f"{name} must be sorted and unique")
        issue_count = sum(
            len(values)
            for values in (
                self.unmet_requirement_ids,
                self.unresolved_source_markers,
                self.unsupported_precision,
                self.contradictions,
                self.stale_topic_references,
                self.readiness_violations,
                self.substantive_content_defects,
                self.practicality_defects,
            )
        )
        candidates = [
            item for item in self.task_artifacts if item.kind == "final_markdown"
        ]
        if self.output_contract_satisfied != (
            issue_count == 0 and len(candidates) == 1
        ):
            raise ValueError("output-contract satisfaction must equal the issue facts")
        if self.repair_required == self.output_contract_satisfied:
            raise ValueError("repairRequired must be the inverse of satisfaction")
        if self.repair_required != bool(self.repair_instructions):
            raise ValueError(
                "repair instructions must exist exactly when repair is required"
            )
        if self.promoted_artifact is not None and not self.output_contract_satisfied:
            raise ValueError("direct promotion requires a fully satisfying candidate")
        if self.output_contract_satisfied:
            if (
                self.promoted_artifact != candidates[0]
                or self.promoted_artifact.kind != "final_markdown"
            ):
                raise ValueError(
                    "satisfied output must promote the sole exact final Markdown candidate"
                )
        elif self.promoted_artifact is not None:
            raise ValueError("unsatisfied output cannot promote an artifact")
        return self


class ImmutableArtifactContent(ContractModel):
    artifact: ArtifactRef
    content_type: Literal["application/json", "text/markdown"]
    payload: dict[str, Any] | None
    markdown: str | None

    @model_validator(mode="after")
    def exact_content_hash(self) -> "ImmutableArtifactContent":
        if self.content_type == "application/json":
            if self.payload is None or self.markdown is not None:
                raise ValueError(
                    "JSON artifact content requires payload and no Markdown"
                )
        else:
            if self.payload is None or not self.markdown:
                raise ValueError(
                    "Markdown artifact content requires payload and Markdown"
                )
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
    purpose: Literal[
        "execute_task", "evaluate_output", "final_synthesis", "blocked_report"
    ]
    accepted_scope: ArtifactRef
    research: ArtifactRef
    accepted_plan: ArtifactRef | None = None
    task: ExecutionTaskV2 | None = None
    source_artifacts: list[ArtifactRef] = Field(min_length=2, max_length=204)
    task_artifacts: list[ArtifactRef] | None = Field(default=None, max_length=200)
    evaluation: ArtifactRef | None = None
    repair_pass: Literal[0, 1]
    artifact_contents: list[ImmutableArtifactContent] = Field(
        min_length=2, max_length=204
    )
    output_contract: WorkflowOutputContract
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @model_validator(mode="after")
    def exact_selected_artifact_contents(self) -> "SynthesizeArtifactInputV1":
        if self.accepted_scope.kind != "scope" or self.research.kind != "research":
            raise ValueError(
                "cognitive activity requires scope and research artifact references"
            )
        forbidden_fields = {
            "execute_task": {"task_artifacts", "evaluation"},
            "evaluate_output": {"task", "evaluation"},
            "final_synthesis": {"task"},
            "blocked_report": {
                "accepted_plan",
                "task",
                "task_artifacts",
                "evaluation",
            },
        }[self.purpose]
        if forbidden_fields.intersection(self.model_fields_set):
            raise ValueError(
                "purpose-inapplicable synthesis fields must be omitted, not null"
            )
        plan = [self.accepted_plan] if self.accepted_plan is not None else []
        tasks = self.task_artifacts or []
        evaluation = [self.evaluation] if self.evaluation is not None else []
        if tasks and (
            tasks != sorted(tasks, key=lambda item: str(item.artifact_id))
            or len({item.artifact_id for item in tasks}) != len(tasks)
        ):
            raise ValueError("taskArtifacts must be sorted and unique")
        if self.purpose == "execute_task":
            if (
                self.accepted_plan is None
                or self.accepted_plan.kind != "plan"
                or self.task is None
                or self.task_artifacts is not None
                or self.evaluation is not None
                or self.repair_pass != 0
            ):
                raise ValueError(
                    "execute_task requires plan, task, sourceArtifacts and repairPass 0"
                )
            required_refs = [self.accepted_scope, self.research, *plan]
            if any(
                reference not in self.source_artifacts for reference in required_refs
            ) or any(
                item not in required_refs and item.kind != "task_result"
                for item in self.source_artifacts
            ):
                raise ValueError(
                    "execute_task sources must be scope, research, plan and task dependencies"
                )
        elif self.purpose == "evaluate_output":
            if (
                self.accepted_plan is None
                or self.accepted_plan.kind != "plan"
                or self.task is not None
                or not self.task_artifacts
                or any(
                    item.kind not in {"task_result", "final_markdown"} for item in tasks
                )
                or self.evaluation is not None
                or self.repair_pass != 0
            ):
                raise ValueError(
                    "evaluate_output requires plan, taskArtifacts and repairPass 0"
                )
            required_refs = [self.accepted_scope, self.research, *plan, *tasks]
        elif self.purpose == "final_synthesis":
            if (
                self.accepted_plan is None
                or self.accepted_plan.kind != "plan"
                or self.task is not None
                or not self.task_artifacts
                or any(
                    item.kind not in {"task_result", "final_markdown"} for item in tasks
                )
                or self.evaluation is None
                or self.evaluation.kind != "evaluation"
                or self.repair_pass != 1
            ):
                raise ValueError(
                    "final_synthesis requires plan, tasks, evaluation and repairPass 1"
                )
            required_refs = [
                self.accepted_scope,
                self.research,
                *plan,
                *tasks,
                *evaluation,
            ]
        else:
            if (
                self.accepted_plan is not None
                or self.task is not None
                or self.task_artifacts is not None
                or self.evaluation is not None
                or self.repair_pass != 0
                or self.output_contract.evidence_readiness != "blocked"
                or self.output_contract.launch_ready_allowed
            ):
                raise ValueError(
                    "blocked_report requires only blocked scope/research and repairPass 0"
                )
            required_refs = [self.accepted_scope, self.research]
        if self.source_artifacts != sorted(
            self.source_artifacts, key=lambda item: str(item.artifact_id)
        ):
            raise ValueError("sourceArtifacts must be sorted by artifactId")
        expected = {item.artifact_id: item for item in self.source_artifacts}
        if len(expected) != len(self.source_artifacts):
            raise ValueError("cognitive activity artifact references must be unique")
        if self.purpose != "execute_task" and self.source_artifacts != sorted(
            required_refs, key=lambda item: str(item.artifact_id)
        ):
            raise ValueError(
                "sourceArtifacts must exactly equal the purpose references"
            )
        if self.artifact_contents != sorted(
            self.artifact_contents, key=lambda item: str(item.artifact.artifact_id)
        ):
            raise ValueError("artifactContents must be sorted by artifactId")
        supplied: dict[UUID, ImmutableArtifactContent] = {}
        for item in self.artifact_contents:
            if item.artifact.artifact_id in supplied:
                raise ValueError("synthesis artifact content IDs must be unique")
            supplied[item.artifact.artifact_id] = item
        if set(supplied) != set(expected):
            raise ValueError(
                "artifactContents must exactly cover every selected immutable ref"
            )
        for artifact_id, reference in expected.items():
            if supplied[artifact_id].artifact != reference:
                raise ValueError(
                    "artifactContents reference does not match selected artifact"
                )
        research_content = supplied[self.research.artifact_id]
        source_catalogue = (research_content.payload or {}).get("sourceCatalogue")
        if self.output_contract.source_appendix_required != bool(source_catalogue):
            raise ValueError(
                "source appendix authority must equal the immutable research source catalogue"
            )
        return self


class AssistantConversationMessageV1(ContractModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=24_000)


class AssistantTurnInputV1(ContractModel):
    type: Literal["AssistantTurnV1"]
    response_mode: Literal["direct_answer", "discover", "one_shot"]
    message: str = Field(min_length=1, max_length=24_000)
    conversation: list[AssistantConversationMessageV1] = Field(
        default_factory=list, max_length=20
    )


AssistantImageAspectRatioV1 = Literal[
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "9:16",
    "16:9",
    "21:9",
]
AssistantImageMimeTypeV1 = Literal["image/png", "image/jpeg", "image/webp"]
AssistantCurrencyCodeV1 = Annotated[
    str, StringConstraints(pattern=r"^[A-Z]{3}$")
]
AssistantUnsignedDecimalV1 = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=31,
        pattern=r"^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?$",
    ),
]
AssistantMoneyAmountV1 = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=19,
        pattern=r"^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$",
    ),
]
AssistantTemperatureDecimalV1 = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=7,
        pattern=r"^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$",
    ),
]


def _canonical_base64_bytes(value: str, *, maximum_bytes: int | None) -> bytes:
    if not value or len(value) % 4:
        raise ValueError("image data must be non-empty canonical base64")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("image data must be canonical base64") from error
    if base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError("image data must be canonical base64")
    if maximum_bytes is not None and len(decoded) > maximum_bytes:
        raise ValueError(f"image data must decode to at most {maximum_bytes} bytes")
    return decoded


def _validate_image_bytes(mime_type: str, data: bytes) -> None:
    signatures = {
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/webp": len(data) >= 12
        and data.startswith(b"RIFF")
        and data[8:12] == b"WEBP",
    }
    if not signatures.get(mime_type, False):
        raise ValueError("image bytes must match mimeType")


class AssistantTextCapabilityV2(ContractModel):
    kind: Literal["text"]
    jev_enabled: bool | None = Field(default=None, exclude_if=lambda value: value is None)


class AssistantImageGenerateCapabilityV2(ContractModel):
    kind: Literal["image_generate"]
    aspect_ratio: AssistantImageAspectRatioV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    image_size: Literal["1K"] = "1K"


class AssistantWeatherCapabilityV2(ContractModel):
    kind: Literal["weather"]
    location: Text500
    temp_unit: Literal["C", "F"]


class AssistantCurrencyCapabilityV2(ContractModel):
    kind: Literal["currency"]
    base: AssistantCurrencyCodeV1
    quote: AssistantCurrencyCodeV1
    amount: AssistantMoneyAmountV1


class AssistantQuickInfoCapabilityV2(ContractModel):
    kind: Literal["quick_info"]
    location: Text500 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    discovery_kind: Literal["news", "events", "current_facts"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    routing_mode: Literal["jev", "explicit"]


AssistantCapabilityV2 = Annotated[
    Union[
        AssistantTextCapabilityV2,
        AssistantImageGenerateCapabilityV2,
        AssistantWeatherCapabilityV2,
        AssistantCurrencyCapabilityV2,
        AssistantQuickInfoCapabilityV2,
    ],
    Field(discriminator="kind"),
]


class AssistantTurnInputV2(ContractModel):
    type: Literal["AssistantTurnV2"]
    response_mode: Literal["direct_answer", "discover", "one_shot"]
    message: str = Field(min_length=1, max_length=24_000)
    conversation: list[AssistantConversationMessageV1] = Field(
        default_factory=list, max_length=20
    )
    capability: AssistantCapabilityV2

    @model_validator(mode="after")
    def bounded_quick_info_query(self) -> "AssistantTurnInputV2":
        if self.capability.kind == "quick_info" and len(self.message) > 2000:
            raise ValueError("quick-info message must contain at most 2000 characters")
        return self


SolutionPreparationFieldNameV1 = Annotated[
    str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
]
SolutionPreparationQuestionIdV1 = Annotated[
    str, StringConstraints(pattern=r"^[a-z][a-z0-9_-]{0,79}$")
]
SolutionPreparationTransformV1 = Literal["copy", "trim", "lowercase", "uppercase"]
SolutionPreparationVersionV1 = Annotated[
    int, Field(strict=True, ge=1, le=9_007_199_254_740_991)
]


class SolutionPreparationFieldV1(ContractModel):
    source: SolutionPreparationFieldNameV1 | None
    target: SolutionPreparationFieldNameV1 | None
    transform: SolutionPreparationTransformV1 | None

    @model_validator(mode="after")
    def safe_field_names(self) -> "SolutionPreparationFieldV1":
        if self.source in {"constructor", "prototype", "__proto__"} or self.target in {
            "constructor",
            "prototype",
            "__proto__",
        }:
            raise ValueError("Reserved field names are not permitted")
        return self


class SolutionFieldV1(SolutionPreparationFieldV1):
    source: SolutionPreparationFieldNameV1
    target: SolutionPreparationFieldNameV1
    transform: SolutionPreparationTransformV1


class SolutionSpecV1(ContractModel):
    kind: Literal["webhook_transform_v1"]
    fields: list[SolutionFieldV1] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def unique_targets(self) -> "SolutionSpecV1":
        if len({field.target for field in self.fields}) != len(self.fields):
            raise ValueError("Output field names must be unique")
        return self


class SolutionPreparationDraftV1(ContractModel):
    kind: Literal["webhook_transform_v1"]
    fields: list[SolutionPreparationFieldV1] = Field(max_length=12)


class SolutionPreparationQuestionV1(ContractModel):
    id: SolutionPreparationQuestionIdV1
    kind: Literal["information"]
    prompt: Text1000
    reason: Text1000


class SolutionPreparationAnswerV1(ContractModel):
    question_id: SolutionPreparationQuestionIdV1
    value: Text2000


class SolutionPreparationAgentV1(ContractModel):
    id: UUID
    name: Text120
    profile_version: SolutionPreparationVersionV1
    role_label: Text120
    description: str = Field(max_length=2000)
    instructions: str = Field(max_length=12_000)
    profile_hash: Sha256


class SolutionPreparationSourceV1(ContractModel):
    run_id: UUID
    task_hash: Sha256
    title: Text500
    task_text: str = Field(min_length=1, max_length=24_000)
    context_hash: Sha256


class PrepareSolutionInputV1(ContractModel):
    type: Literal["PrepareSolutionV1"]
    build_request_id: UUID
    input_version: SolutionPreparationVersionV1
    instruction: str = Field(min_length=1, max_length=24_000)
    agent: SolutionPreparationAgentV1
    source: SolutionPreparationSourceV1
    answers: list[SolutionPreparationAnswerV1] = Field(max_length=32)
    draft: SolutionPreparationDraftV1 | None
    supported_capabilities: list[Literal["webhook_transform_v1"]] = Field(
        min_length=1, max_length=1
    )

    @model_validator(mode="after")
    def unique_answers(self) -> "PrepareSolutionInputV1":
        if len({answer.question_id for answer in self.answers}) != len(self.answers):
            raise ValueError("Solution answers must have unique question IDs")
        return self


class PrepareSolutionResponseV1(ContractModel):
    schema_version: Literal["axwise.solution-preparation.v1"]
    build_request_id: UUID
    input_version: SolutionPreparationVersionV1
    outcome: Literal["needs_input", "candidate", "unsupported"]
    name: Text120
    purpose: Text2000
    explanation: Text2000
    spec: SolutionSpecV1 | None
    partial_fields: list[SolutionPreparationFieldV1] = Field(max_length=12)
    questions: list[SolutionPreparationQuestionV1] = Field(max_length=8)
    unsupported_capabilities: list[Text120] = Field(max_length=8)

    @model_validator(mode="after")
    def exact_state(self) -> "PrepareSolutionResponseV1":
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("Solution questions must have unique IDs")
        partial = [field.model_dump() for field in self.partial_fields]
        complete = (
            [field.model_dump() for field in self.spec.fields] if self.spec else None
        )
        candidate = (
            self.outcome == "candidate"
            and self.spec is not None
            and partial == complete
            and not self.questions
            and not self.unsupported_capabilities
        )
        needs_input = (
            self.outcome == "needs_input"
            and self.spec is None
            and bool(self.questions)
            and not self.unsupported_capabilities
        )
        unsupported = (
            self.outcome == "unsupported"
            and self.spec is None
            and not self.partial_fields
            and not self.questions
            and bool(self.unsupported_capabilities)
        )
        if not (candidate or needs_input or unsupported):
            raise ValueError(
                "Solution preparation state does not match its bounded result"
            )
        return self


def native_canonical_json(value: Any) -> str:
    """V2-only RFC8785; native JSON numbers follow JavaScript IEEE754 semantics.

    Python's JSON parser retains large integer literals while JavaScript parses
    those literals as doubles. Normalize only native JSON numbers here, never
    identity/version fields or any legacy canonical-v1 payload.
    """

    def normalize(item: Any) -> Any:
        if type(item) is int and abs(item) > 9_007_199_254_740_991:
            return float(item)
        if type(item) is list:
            return [normalize(child) for child in item]
        if type(item) is dict:
            return {key: normalize(child) for key, child in item.items()}
        return item

    return rfc8785.dumps(normalize(value)).decode("utf-8")


def native_canonical_hash(value: Any) -> str:
    return hashlib.sha256(native_canonical_json(value).encode("utf-8")).hexdigest()


_NATIVE_SECRET = re.compile(
    r"\b(?:sk[-_](?:live[-_]|test[-_]|proj[-_])?[A-Za-z0-9_-]{12,}|"
    r"AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{12,}|"
    r"ya29\.[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{8,}\."
    r"[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9_.-]{12,}|"
    r"orqaly_app_[A-Za-z0-9_.-]{12,})|-----BEGIN [A-Z ]*PRIVATE KEY-----|"
    r"(?:password|api[_ -]?key|access[_ -]?token|client[_ -]?secret|authorization)"
    r"[\"']?\s*(?:[=:]|\bis\b)\s*[\"']?[^\s\"',;]{8,}",
    re.IGNORECASE,
)
_NATIVE_FORBIDDEN_KEYS = {"__proto__", "prototype", "constructor"}


def validate_native_json(
    value: Any,
    *,
    max_bytes: int = 512_000,
    max_depth: int = 24,
    max_entries: int = 20_000,
    secret_free: bool = True,
) -> Any:
    entries = 0
    seen: set[int] = set()

    def visit(item: Any, depth: int) -> None:
        nonlocal entries
        entries += 1
        if entries > max_entries or depth > max_depth:
            raise ValueError("Native JSON exceeds structural limits")
        if item is None or type(item) is bool:
            return
        if type(item) in (int, float):
            try:
                if math.isfinite(float(item)):
                    return
            except OverflowError:
                pass
            raise ValueError("Native JSON numbers must be finite")
        if type(item) is str:
            item.encode("utf-8")
            return
        if type(item) not in (list, dict) or id(item) in seen:
            raise ValueError("Expected plain finite native JSON")
        seen.add(id(item))
        if type(item) is dict:
            for key in item:
                if type(key) is not str or key in _NATIVE_FORBIDDEN_KEYS:
                    raise ValueError("Unsafe native JSON object key")
                key.encode("utf-8")
            children = item.values()
        else:
            children = item
        for child in children:
            visit(child, depth + 1)
        seen.remove(id(item))

    visit(value, 0)
    encoded = native_canonical_json(value)
    if len(encoded.encode("utf-8")) > max_bytes:
        raise ValueError("Native JSON exceeds its byte limit")
    if secret_free and _NATIVE_SECRET.search(encoded):
        raise ValueError("Native design must not contain embedded secrets")
    return value


NativeIdV2 = Annotated[
    str,
    StringConstraints(
        min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$"
    ),
]
NativeVersionV2 = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
NativeDataTypeV2 = Literal[
    "object", "array", "string", "number", "integer", "boolean", "null"
]


class NativeContractV2(ContractModel):
    @model_serializer(mode="wrap")
    def preserve_omitted_wire_fields(self, handler: Any, info: Any) -> Any:
        result = handler(self)
        # Required nulls stay explicit; optional fields absent on the incoming
        # wire must not appear as null and silently change the immutable hash.
        for name, field in type(self).model_fields.items():
            if not field.is_required() and name not in self.model_fields_set:
                result.pop(field.alias if info.by_alias else name, None)
        return result


def validate_native_data_schema(value: dict[str, Any]) -> dict[str, Any]:
    validate_native_json(value, max_bytes=64_000, max_depth=20)
    allowed = {
        "type",
        "description",
        "properties",
        "required",
        "additionalProperties",
        "items",
        "enum",
        "const",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
    }
    types = {"object", "array", "string", "number", "integer", "boolean", "null"}

    def visit(schema: Any) -> None:
        if (
            type(schema) is not dict
            or set(schema) - allowed
            or schema.get("type") not in types
        ):
            raise ValueError("Use the supported native data-schema subset")
        if "description" in schema and (
            type(schema["description"]) is not str or len(schema["description"]) > 1000
        ):
            raise ValueError("Invalid schema description")
        properties = schema.get("properties", {})
        if type(properties) is not dict or any(len(key) > 120 for key in properties):
            raise ValueError("Invalid schema properties")
        for child in properties.values():
            visit(child)
        required = schema.get("required", [])
        if (
            type(required) is not list
            or len(required) > 100
            or any(
                type(key) is not str or len(key) > 120 or key not in properties
                for key in required
            )
        ):
            raise ValueError("Required keys must have property schemas")
        if (
            "additionalProperties" in schema
            and type(schema["additionalProperties"]) is not bool
        ):
            raise ValueError("additionalProperties must be a boolean")
        if schema["type"] == "array" and "items" not in schema:
            raise ValueError("Array contracts require an item schema")
        if "items" in schema:
            visit(schema["items"])
        if "enum" in schema and (
            type(schema["enum"]) is not list or not 1 <= len(schema["enum"]) <= 100
        ):
            raise ValueError("Invalid schema enum")
        for key in ("minItems", "maxItems", "minLength", "maxLength"):
            if key in schema and (
                type(schema[key]) is not int
                or not 0 <= schema[key] <= (10_000 if key.endswith("Items") else 64_000)
            ):
                raise ValueError("Invalid schema bound")
        for key in ("minimum", "maximum"):
            if key in schema and type(schema[key]) not in (int, float):
                raise ValueError("Schema number bounds must be numbers")
        for minimum, maximum in (
            ("minItems", "maxItems"),
            ("minLength", "maxLength"),
            ("minimum", "maximum"),
        ):
            if (
                minimum in schema
                and maximum in schema
                and schema[minimum] > schema[maximum]
            ):
                raise ValueError("Schema minimum exceeds maximum")

    visit(value)
    return value


class NativeWorkflowAssertionV2(NativeContractV2):
    path: str = Field(max_length=1000, pattern=r"^(?:/(?:[^~]|~[01])*)*$")
    operator: Literal[
        "equals", "exists", "type", "contains", "length_gte", "length_lte"
    ]
    value: Any = None

    @model_validator(mode="after")
    def valid_assertion(self) -> "NativeWorkflowAssertionV2":
        validate_native_json(self.value)
        if self.operator != "exists" and "value" not in self.model_fields_set:
            raise ValueError("Assertion requires a value")
        if self.operator == "type" and self.value not in (
            "object",
            "array",
            "string",
            "number",
            "integer",
            "boolean",
            "null",
        ):
            raise ValueError("Invalid asserted type")
        if self.operator.startswith("length_") and (
            type(self.value) is not int or self.value < 0
        ):
            raise ValueError("Length assertions require a nonnegative integer")
        return self


class NativeWorkflowAcceptanceCaseV2(NativeContractV2):
    id: NativeIdV2
    description: Text1000
    requirement_ids: list[NativeIdV2] = Field(min_length=1, max_length=40)
    input: Any
    expected_output: Any = None
    expected_status: Annotated[int, Field(strict=True, ge=100, le=599)] | None = None
    assertions: list[NativeWorkflowAssertionV2] = Field(max_length=30)

    @model_validator(mode="after")
    def has_expectation(self) -> "NativeWorkflowAcceptanceCaseV2":
        validate_native_json(self.input)
        validate_native_json(self.expected_output)
        if "expected_status" in self.model_fields_set and self.expected_status is None:
            raise ValueError("Expected status must be a HTTP status code when present")
        if "expected_output" not in self.model_fields_set and not self.assertions:
            raise ValueError("A case needs an expected output or assertion")
        return self


class NativeWorkflowRequirementV2(NativeContractV2):
    id: NativeIdV2
    description: Text2000


class NativeWorkflowConnectionV2(NativeContractV2):
    id: NativeIdV2
    provider: Text120
    operation: Text120
    purpose: Text1000
    credential_type: Text120 | None
    node_ids: list[NativeIdV2] = Field(min_length=1, max_length=100)


class NativeWorkflowSpecV2(NativeContractV2):
    kind: Literal["n8n_workflow_v2"]
    requirements: list[NativeWorkflowRequirementV2] = Field(min_length=1, max_length=40)
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    acceptance_cases: list[NativeWorkflowAcceptanceCaseV2] = Field(
        min_length=1, max_length=20
    )
    connections: list[NativeWorkflowConnectionV2] = Field(max_length=30)
    runtime_profile: Literal[
        "request_automation",
        "durable_automation",
        "code_processing",
        "software_development",
    ]

    @field_validator("input_schema", "output_schema")
    @classmethod
    def schema_subset(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_native_data_schema(value)

    @model_validator(mode="after")
    def consistent_spec(self) -> "NativeWorkflowSpecV2":
        for values in (self.requirements, self.acceptance_cases, self.connections):
            if len({item.id for item in values}) != len(values):
                raise ValueError("Native spec IDs must be unique")
        ids = {item.id for item in self.requirements}
        if any(set(case.requirement_ids) - ids for case in self.acceptance_cases):
            raise ValueError("Acceptance case references an unknown requirement")
        validate_native_json(
            self.model_dump(mode="json", by_alias=True), max_bytes=64_000, max_depth=20
        )
        return self


class NativeWorkflowQuestionV2(NativeContractV2):
    id: NativeIdV2
    kind: Literal["information", "connection", "setup"]
    prompt: Text1000
    reason: Text1000
    node_id: NativeIdV2 | None = None
    connection_id: NativeIdV2 | None = None


class NativeWorkflowDependencyV2(NativeContractV2):
    id: NativeIdV2
    kind: Literal["node", "connection", "runtime"]
    description: Text2000
    node_id: NativeIdV2 | None = None


class NativeWorkflowSkillV2(NativeContractV2):
    id: NativeIdV2
    source_commit: str = Field(pattern=r"^[a-f0-9]{40}$")
    content_hash: Sha256
    content: str = Field(min_length=1, max_length=12_000)

    @model_validator(mode="after")
    def exact_content_hash(self) -> "NativeWorkflowSkillV2":
        if (
            hashlib.sha256(self.content.encode("utf-8")).hexdigest()
            != self.content_hash
        ):
            raise ValueError("Skill content does not match its pinned hash")
        return self


class NativeWorkflowNodeDefinitionV2(NativeContractV2):
    type: str = Field(min_length=1, max_length=200)
    type_version: Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
    definition: dict[str, Any]

    @field_validator("definition")
    @classmethod
    def safe_definition(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_native_json(value)


class NativeWorkflowKnowledgeV2(NativeContractV2):
    version: Text120
    skills: list[NativeWorkflowSkillV2] = Field(max_length=8)
    nodes: list[NativeWorkflowNodeDefinitionV2] = Field(max_length=40)
    catalog_hash: Sha256

    @model_validator(mode="after")
    def exact_catalog(self) -> "NativeWorkflowKnowledgeV2":
        nodes = [item.model_dump(mode="json", by_alias=True) for item in self.nodes]
        if native_canonical_hash(nodes) != self.catalog_hash:
            raise ValueError("Node definitions do not match their pinned catalog hash")
        if len({(item.type, item.type_version) for item in self.nodes}) != len(
            self.nodes
        ):
            raise ValueError("Node catalog must have unique type/version pairs")
        if len({item.id for item in self.skills}) != len(self.skills):
            raise ValueError("Selected skills must have unique IDs")
        return self


class NativeWorkflowDraftV2(NativeContractV2):
    workflow: dict[str, Any]
    spec: NativeWorkflowSpecV2
    workflow_hash: Sha256
    row_version: NativeVersionV2

    @model_validator(mode="after")
    def exact_draft(self) -> "NativeWorkflowDraftV2":
        validate_native_json(self.workflow)
        if native_canonical_hash(self.workflow) != self.workflow_hash:
            raise ValueError("Native draft does not match its exact hash")
        return self


class NativeWorkflowDiagnosticV2(NativeContractV2):
    code: NativeIdV2
    message: Text2000
    node_id: NativeIdV2 | None = None


class NativeWorkflowAnswerV2(NativeContractV2):
    question_id: NativeIdV2
    value: Text2000


class PrepareSolutionInputV2(NativeContractV2):
    type: Literal["PrepareSolutionV2"]
    build_request_id: UUID
    input_version: SolutionPreparationVersionV1
    instruction: str = Field(min_length=1, max_length=24_000)
    agent: SolutionPreparationAgentV1
    source: SolutionPreparationSourceV1
    answers: list[NativeWorkflowAnswerV2] = Field(max_length=32)
    knowledge: NativeWorkflowKnowledgeV2
    draft: NativeWorkflowDraftV2 | None
    diagnostics: list[NativeWorkflowDiagnosticV2] = Field(max_length=40)
    phase: Literal["design", "repair"]
    frozen_acceptance_cases: list[NativeWorkflowAcceptanceCaseV2] = Field(max_length=20)

    @model_validator(mode="after")
    def exact_request(self) -> "PrepareSolutionInputV2":
        if len({answer.question_id for answer in self.answers}) != len(self.answers):
            raise ValueError("Solution answers must have unique question IDs")
        if self.phase == "repair":
            if not self.draft or not self.frozen_acceptance_cases:
                raise ValueError(
                    "Repair requires an exact draft and frozen acceptance criteria"
                )
            frozen = [
                case.model_dump(mode="json", by_alias=True)
                for case in self.frozen_acceptance_cases
            ]
            draft_cases = [
                case.model_dump(mode="json", by_alias=True)
                for case in self.draft.spec.acceptance_cases
            ]
            if native_canonical_hash(frozen) != native_canonical_hash(draft_cases):
                raise ValueError(
                    "Repair acceptance criteria must match the current draft"
                )
        validate_native_json(
            self.model_dump(mode="json", by_alias=True),
            max_bytes=192_000,
            max_entries=30_000,
        )
        return self


class NativeWorkflowSemanticReviewV2(NativeContractV2):
    advisory: Literal[True]
    summary: Text4000
    concerns: list[Text2000] = Field(max_length=20)


class PrepareSolutionResponseV2(NativeContractV2):
    schema_version: Literal["axwise.solution-preparation.v2"]
    build_request_id: UUID
    input_version: SolutionPreparationVersionV1
    outcome: Literal["candidate", "needs_input", "dependencies"]
    name: Text120
    purpose: Text2000
    explanation: Text4000
    workflow: dict[str, Any] | None
    spec: NativeWorkflowSpecV2 | None
    questions: list[NativeWorkflowQuestionV2] = Field(max_length=8)
    dependencies: list[NativeWorkflowDependencyV2] = Field(max_length=40)
    base_workflow_hash: Sha256 | None
    semantic_review: NativeWorkflowSemanticReviewV2

    @model_validator(mode="after")
    def exact_state(self) -> "PrepareSolutionResponseV2":
        if (self.workflow is None) != (self.spec is None):
            raise ValueError("Native workflow and spec must be present together")
        if self.outcome == "candidate" and (
            self.workflow is None
            or self.spec is None
            or self.questions
            or self.dependencies
        ):
            raise ValueError(
                "Candidate requires a graph/spec without unresolved questions or dependencies"
            )
        if self.outcome == "needs_input" and not self.questions:
            raise ValueError("Needs-input requires a specific question")
        if self.outcome == "dependencies" and not self.dependencies:
            raise ValueError("Dependencies requires an explicit dependency")
        for values in (self.questions, self.dependencies):
            if len({item.id for item in values}) != len(values):
                raise ValueError("Questions and dependencies must have unique IDs")
        validate_native_json(
            self.model_dump(mode="json", by_alias=True), max_bytes=192_000
        )
        return self


MAX_CAPABILITY_INPUT_BYTES = 1_000_000
MAX_ADMISSION_ORIGIN_ARTIFACTS = 16


def _capability_input_bytes(value: ContractModel) -> None:
    payload = value.model_dump(mode="json", by_alias=True)
    if len(canonical_json(payload).encode("utf-8")) > MAX_CAPABILITY_INPUT_BYTES:
        raise ValueError("capability input exceeds its aggregate wire-byte limit")


class AdmitTranscriptCorpusInputV1(_FrozenCorpusModel):
    """Freeze supplied material; origin is acquisition metadata, not human proof."""

    type: Literal["AdmitTranscriptCorpusV1"]
    corpus: TranscriptCorpusV1
    admission_profile: Literal["supplied_transcript_v1"]
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )

    @model_validator(mode="before")
    @classmethod
    def bounded_input_structure(cls, value: Any) -> Any:
        validate_capability_structure(value)
        return value

    @model_validator(mode="after")
    def exact_admission_input(self) -> "AdmitTranscriptCorpusInputV1":
        corpus = validate_transcript_corpus(self.corpus)
        references: dict[UUID, tuple[str, str]] = {}
        for document in corpus.documents:
            for reference in document.origin_artifact_refs:
                identity = (reference.artifact_hash, reference.kind)
                if (
                    reference.artifact_id in references
                    and references[reference.artifact_id] != identity
                ):
                    raise ValueError("origin artifact identity cannot conflict")
                references[reference.artifact_id] = identity
        if len(references) > MAX_ADMISSION_ORIGIN_ARTIFACTS:
            raise ValueError("admission exceeds its aggregate origin-artifact limit")
        _capability_input_bytes(self)
        return self


class AnalyzeEvidenceInputV1(_FrozenCorpusModel):
    """Explicit qualitative analysis of one already-admitted transcript corpus."""

    type: Literal["AnalyzeEvidenceV1"]
    accepted_scope: ArtifactRef
    scope: ScopeArtifactV2
    source: ImmutableArtifactContent
    request: AnalysisRequestV1
    limits: CapabilityLimitsV1
    processing_consent: CapabilityProcessingConsentV1
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )

    @model_validator(mode="before")
    @classmethod
    def bounded_input_structure(cls, value: Any) -> Any:
        validate_capability_structure(value)
        return value

    @model_validator(mode="after")
    def exact_analysis_input(self) -> "AnalyzeEvidenceInputV1":
        if self.processing_consent.purpose != self.type:
            raise ValueError("processing consent purpose must match analysis")
        if self.accepted_scope.kind != "scope":
            raise ValueError("analysis requires an accepted scope artifact")
        if (
            self.source.artifact.kind not in {"transcript_corpus", "simulation"}
            or self.source.content_type != "application/json"
            or self.source.payload is None
        ):
            raise ValueError("qualitative_v1 requires an admitted corpus or typed simulation artifact")
        source = ImmutableArtifactContent.model_validate(
            self.source.model_dump(mode="json", by_alias=True)
        )
        corpus = (
            SimulationV1.model_validate(source.payload).corpus
            if source.artifact.kind == "simulation"
            else validate_transcript_corpus(source.payload)
        )
        validate_analysis_request(self.request, corpus)
        ScopeArtifactV2.model_validate(self.scope.model_dump(mode="json", by_alias=True))
        if self.accepted_scope.artifact_id == source.artifact.artifact_id:
            raise ValueError("scope and corpus artifacts must be distinct")
        _capability_input_bytes(self)
        return self


class SimulationGroundingSelectionV1(_FrozenCorpusModel):
    """Exact source entry identity; raw passage text is resolved by the worker."""

    artifact: CorpusArtifactRefV1
    entry_kind: Literal["claim", "quote"]
    entry_id: _Sha256


class SimulateInputV1(_FrozenCorpusModel):
    type: Literal["SimulateV1"]
    accepted_scope: ArtifactRef
    scope: ScopeArtifactV2
    request: SimulationRequestV1
    selected_grounding: tuple[SimulationGroundingSelectionV1, ...] = Field(max_length=16)
    limits: CapabilityLimitsV1
    processing_consent: CapabilityProcessingConsentV1
    execution_agent: ExecutionAgentV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )

    _selections = field_validator("selected_grounding", mode="before")(_ordered_sequence)

    @model_validator(mode="before")
    @classmethod
    def bounded_input_structure(cls, value: Any) -> Any:
        validate_capability_structure(value)
        return value

    @model_validator(mode="after")
    def exact_simulation_input(self) -> "SimulateInputV1":
        if self.processing_consent.purpose != self.type:
            raise ValueError("processing consent purpose must match simulation")
        if self.accepted_scope.kind != "scope":
            raise ValueError("simulation requires an accepted scope artifact")
        ScopeArtifactV2.model_validate(self.scope.model_dump(mode="json", by_alias=True))
        expected = {ref.artifact_id: ref for ref in self.request.grounding.source_artifacts}
        if self.accepted_scope.artifact_id in expected:
            raise ValueError("scope and simulation grounding artifacts must be distinct")
        used, keys = set(), set()
        for selection in self.selected_grounding:
            reference = selection.artifact
            if expected.get(reference.artifact_id) != reference:
                raise ValueError("selected grounding must match an exact requested artifact")
            if (reference.kind, selection.entry_kind) not in {
                ("research", "claim"), ("qualitative_analysis", "quote")
            }:
                raise ValueError("simulation grounding supports research claims or analysis quotes only")
            key = (reference.artifact_id, selection.entry_kind, selection.entry_id)
            if key in keys:
                raise ValueError("simulation grounding selections must be unique")
            keys.add(key)
            used.add(reference.artifact_id)
        if used != set(expected):
            raise ValueError("every requested grounding artifact requires an explicit entry selection")
        _capability_input_bytes(self)
        return self


OperationInput = Annotated[
    Union[
        AssistantTurnInputV1,
        AssistantTurnInputV2,
        PrepareSolutionInputV1,
        PrepareSolutionInputV2,
        CompileScopeInputV2,
        CompileScopeInputV3,
        ReviseScopeInputV2,
        ExecuteResearchInputV2,
        SynthesizeArtifactInputV1,
        AdmitTranscriptCorpusInputV1,
        AnalyzeEvidenceInputV1,
        SimulateInputV1,
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
        "AssistantTurnV1",
        "AssistantTurnV2",
        "PrepareSolutionV1",
        "PrepareSolutionV2",
        "CompileScopeV2",
        "CompileScopeV3",
        "ReviseScopeV2",
        "ExecuteResearchV2",
        "SynthesizeArtifactV1",
        "AdmitTranscriptCorpusV1",
        "AnalyzeEvidenceV1",
        "SimulateV1",
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
        if (
            isinstance(self.input, (PrepareSolutionInputV1, PrepareSolutionInputV2))
            and self.input.source.run_id != self.workflow.run_id
        ):
            raise ValueError("Solution source run must match its workflow envelope")
        execution_agent = getattr(self.input, "execution_agent", None)
        if execution_agent is not None:
            if execution_agent.run_id != self.workflow.run_id:
                raise ValueError(
                    "execution Agent runId must equal the operation workflow runId"
                )
            if execution_agent.owner.tenant_id != self.owner.tenant_id:
                raise ValueError(
                    "execution Agent tenantId must equal the operation owner tenantId"
                )
            if execution_agent.owner.user_id != self.owner.user_id:
                raise ValueError(
                    "execution Agent userId must equal the operation owner userId"
                )
        input_payload = self.input.model_dump(mode="json", by_alias=True)
        if isinstance(self.input, (AnalyzeEvidenceInputV1, SimulateInputV1)):
            validate_processing_consent(
                self.input.processing_consent,
                operation_type=self.operation_type,
                operation_id=self.operation_id,
                owner=self.owner.model_dump(mode="json", by_alias=True),
                workflow=self.workflow.model_dump(mode="json", by_alias=True),
                contract_version=self.contract_version,
                input_value=input_payload,
            )
        if isinstance(self.input, SynthesizeArtifactInputV1):
            # Only the purpose-discriminated top-level keys are omitted on the wire.
            # Nested immutable artifact payloads preserve explicit nulls in their hashes.
            input_payload = {
                key: value for key, value in input_payload.items() if value is not None
            }
        input_hash = (
            native_canonical_hash(input_payload)
            if isinstance(self.input, PrepareSolutionInputV2)
            else canonical_hash(input_payload)
        )
        if input_hash != self.canonical_input_hash:
            raise ValueError("canonical input hash does not match typed input")
        return self


class ArtifactFact(ArtifactRef):
    content_type: Literal["application/json", "text/markdown"] = "application/json"
    payload: dict[str, Any] = Field(default_factory=dict)
    markdown: str | None = None
    source_artifact_ids: list[UUID] = Field(default_factory=list, max_length=204)

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


class TaskResultArtifactFact(ArtifactFact):
    kind: Literal["task_result"]
    content_type: Literal["text/markdown"] = "text/markdown"
    markdown: str

    @model_validator(mode="after")
    def exact_task_result_fact(self) -> "TaskResultArtifactFact":
        payload = TaskResultV2.model_validate(self.payload)
        expected_sources = _sorted_unique_artifact_ids(
            [item.artifact_id for item in payload.source_artifacts]
        )
        if len(expected_sources) != len(payload.source_artifacts):
            raise ValueError("task-result source artifacts must be unique")
        if self.source_artifact_ids != expected_sources:
            raise ValueError("task-result lineage must equal its source artifacts")
        return self


class EvaluationArtifactFact(ArtifactFact):
    kind: Literal["evaluation"]
    content_type: Literal["application/json"] = "application/json"
    markdown: None = None

    @model_validator(mode="after")
    def exact_evaluation_fact(self) -> "EvaluationArtifactFact":
        payload = EvaluationResultV1.model_validate(self.payload)
        expected_sources = [item.artifact_id for item in payload.source_artifacts]
        if self.source_artifact_ids != expected_sources:
            raise ValueError("evaluation lineage must equal its full sourceArtifacts")
        return self


class TranscriptCorpusArtifactFact(ArtifactFact):
    kind: Literal["transcript_corpus"]
    content_type: Literal["application/json"] = "application/json"

    @model_validator(mode="after")
    def exact_corpus_fact(self) -> "TranscriptCorpusArtifactFact":
        corpus = validate_transcript_corpus(self.payload)
        expected = sorted(
            {
                reference.artifact_id
                for document in corpus.documents
                for reference in document.origin_artifact_refs
            },
            key=str,
        )
        if self.source_artifact_ids != expected:
            raise ValueError("corpus artifact lineage must equal its origin references")
        return self


class QualitativeAnalysisArtifactFact(ArtifactFact):
    kind: Literal["qualitative_analysis"]
    content_type: Literal["application/json"] = "application/json"

    @model_validator(mode="after")
    def exact_analysis_fact(self) -> "QualitativeAnalysisArtifactFact":
        payload = QualitativeAnalysisV1.model_validate(self.payload)
        expected = sorted(
            {payload.accepted_scope.artifact_id}
            | {reference.artifact_id for reference in payload.source_artifacts},
            key=str,
        )
        if self.source_artifact_ids != expected:
            raise ValueError("analysis artifact lineage must equal its scope and sources")
        return self


class SimulationArtifactFact(ArtifactFact):
    kind: Literal["simulation"]
    content_type: Literal["application/json"] = "application/json"

    @model_validator(mode="after")
    def exact_simulation_fact(self) -> "SimulationArtifactFact":
        payload = SimulationV1.model_validate(self.payload)
        if self.artifact_id != uuid5(NAMESPACE_URL, f"axwise:{payload.operation_id}:simulation"):
            raise ValueError("simulation artifact ID must bind its producing operation")
        expected = sorted(
            {payload.accepted_scope.artifact_id}
            | {reference.artifact_id for reference in payload.source_artifacts},
            key=str,
        )
        if self.source_artifact_ids != expected:
            raise ValueError("simulation artifact lineage must equal its scope and sources")
        return self


class OperationMetrics(ContractModel):
    latency_ms: int = Field(ge=0)
    provider: Literal["google"] | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)
    # Exact provider-served model identifier when the runtime exposes it. This is
    # additive so persisted results written before modelVersion was captured still
    # replay through the same result contracts.
    model_version: str | None = Field(default=None, min_length=1, max_length=200)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    search_calls: int | None = Field(default=None, ge=0)
    estimated_cost_micros: int | None = Field(default=None, ge=0)


class CapabilityOperationMetrics(OperationMetrics):
    """Explicit capability invocation accounting; old metrics schemas stay intact."""

    model_calls: int = Field(strict=True, ge=0, le=32)
    usage_complete: bool = Field(strict=True)
    budget_scope: Literal["invocation"]
    input_tokens: int | None = Field(default=None, strict=True, ge=0, le=2_000_000)
    output_tokens: int | None = Field(default=None, strict=True, ge=0, le=2_000_000)
    total_tokens: int | None = Field(default=None, strict=True, ge=0, le=4_000_000)
    search_calls: int | None = Field(default=None, strict=True, ge=0)
    estimated_cost_micros: int | None = Field(default=None, strict=True, ge=0, le=9_007_199_254_740_991)

    @model_validator(mode="after")
    def exact_capability_metrics(self) -> "CapabilityOperationMetrics":
        known = self.input_tokens is not None and self.output_tokens is not None
        if self.usage_complete != known:
            raise ValueError("capability usage completeness must match token receipts")
        expected_total = self.input_tokens + self.output_tokens if known else None
        if self.total_tokens != expected_total:
            raise ValueError("capability total tokens must equal its known receipts")
        if not known and self.estimated_cost_micros is not None:
            raise ValueError("unknown capability token usage cannot establish a token cost")
        if self.search_calls != 0:
            raise ValueError("these capability invocations do not perform source search")
        if self.model_calls == 0 and (
            not known
            or expected_total != 0
            or any(value is not None for value in (self.provider, self.model, self.model_version))
        ):
            raise ValueError("model-free capability metrics must not claim model work")
        for value in (self.model, self.model_version):
            if value is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", value):
                raise ValueError("capability model identifiers must be safe bounded tokens")
        return self


class AssistantSourceV1(ContractModel):
    title: Text500
    canonical_url: str = Field(min_length=1, max_length=4000)
    source_types: list[EvidenceSourceType] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def canonical_source(self) -> "AssistantSourceV1":
        if not is_canonical_public_https_url(self.canonical_url):
            raise ValueError("assistant source URL must be canonical public HTTPS")
        if self.source_types != utf16_ordinal_sorted(set(self.source_types)):
            raise ValueError("assistant source types must be sorted and unique")
        return self


class AssistantFactV1(ContractModel):
    statement: Text4000
    source_urls: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def canonical_sources(self) -> "AssistantFactV1":
        if self.source_urls != utf16_ordinal_sorted(set(self.source_urls)):
            raise ValueError("assistant fact sources must be sorted and unique")
        if any(not is_canonical_public_https_url(value) for value in self.source_urls):
            raise ValueError("assistant fact sources must be canonical public HTTPS")
        return self


class AssistantRecommendationV1(ContractModel):
    kind: Literal["continue_conversation", "consider_goal"]
    summary: Text1000


class AssistantTurnV1(ContractModel):
    schema_version: Literal["axwise.assistant-turn.v1"] = "axwise.assistant-turn.v1"
    markdown: str = Field(min_length=1, max_length=120_000)
    sources: list[AssistantSourceV1] = Field(default_factory=list, max_length=10)
    facts: list[AssistantFactV1] = Field(default_factory=list, max_length=50)
    recommendations: list[AssistantRecommendationV1] = Field(
        default_factory=list, max_length=5
    )


class AssistantPresentationSourceV1(ContractModel):
    title: Text500
    url: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def canonical_source(self) -> "AssistantPresentationSourceV1":
        if not is_canonical_public_https_url(self.url):
            raise ValueError("presentation source URL must be canonical public HTTPS")
        return self


class AssistantGeneratedImagePresentationV1(ContractModel):
    schema_version: Literal["axwise.presentation.generated-image.v1"] = (
        "axwise.presentation.generated-image.v1"
    )
    kind: Literal["generated_image"]
    mime_type: AssistantImageMimeTypeV1
    data: str = Field(min_length=4, max_length=14_000_000)
    sha256: Sha256
    alt: Text1000
    model: Annotated[
        str,
        StringConstraints(
            min_length=1,
            max_length=200,
            pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$",
        ),
    ]

    @model_validator(mode="after")
    def exact_generated_image(self) -> "AssistantGeneratedImagePresentationV1":
        decoded = _canonical_base64_bytes(self.data, maximum_bytes=10_485_760)
        _validate_image_bytes(self.mime_type, decoded)
        if hashlib.sha256(decoded).hexdigest() != self.sha256:
            raise ValueError("generated image sha256 must match its decoded bytes")
        return self


class AssistantWeatherForecastV1(ContractModel):
    label: Text120
    condition: Text120
    high: AssistantTemperatureDecimalV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    low: AssistantTemperatureDecimalV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )


class AssistantWeatherPresentationV1(ContractModel):
    schema_version: Literal["axwise.presentation.weather.v1"] = (
        "axwise.presentation.weather.v1"
    )
    kind: Literal["weather"]
    location: Text500
    observed_at: Rfc3339Utc
    temperature_unit: Literal["C", "F"]
    temperature: AssistantTemperatureDecimalV1
    condition: Text120
    high: AssistantTemperatureDecimalV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    low: AssistantTemperatureDecimalV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    forecast: list[AssistantWeatherForecastV1] = Field(max_length=10)
    source: AssistantPresentationSourceV1


class AssistantCurrencyPresentationV1(ContractModel):
    schema_version: Literal["axwise.presentation.currency.v1"] = (
        "axwise.presentation.currency.v1"
    )
    kind: Literal["currency"]
    base: AssistantCurrencyCodeV1
    quote: AssistantCurrencyCodeV1
    amount: AssistantUnsignedDecimalV1
    converted_amount: AssistantUnsignedDecimalV1
    rate: AssistantUnsignedDecimalV1
    inverse_rate: AssistantUnsignedDecimalV1 | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    as_of: Rfc3339Utc
    source: AssistantPresentationSourceV1


AssistantPresentationV1 = Annotated[
    Union[
        AssistantGeneratedImagePresentationV1,
        AssistantWeatherPresentationV1,
        AssistantCurrencyPresentationV1,
    ],
    Field(discriminator="kind"),
]


class AssistantTurnV2(ContractModel):
    schema_version: Literal["axwise.assistant-turn.v2"] = "axwise.assistant-turn.v2"
    markdown: str = Field(min_length=1, max_length=120_000)
    sources: list[AssistantSourceV1] = Field(default_factory=list, max_length=10)
    facts: list[AssistantFactV1] = Field(default_factory=list, max_length=50)
    recommendations: list[AssistantRecommendationV1] = Field(
        default_factory=list, max_length=5
    )
    presentations: list[AssistantPresentationV1] = Field(min_length=1, max_length=8)


class AssistantTurnCompletedResult(ContractModel):
    result_type: Literal["assistant_turn_completed"]
    response: Annotated[
        Union[AssistantTurnV1, AssistantTurnV2],
        Field(discriminator="schema_version"),
    ]
    metrics: OperationMetrics | None = None


class PrepareSolutionCompletedResult(ContractModel):
    result_type: Literal["solution_prepared"]
    response: Annotated[
        Union[PrepareSolutionResponseV1, PrepareSolutionResponseV2],
        Field(discriminator="schema_version"),
    ]
    metrics: OperationMetrics | None = None


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
        if payload.candidate_attestation is not None:
            raise ValueError(
                "synthesized final artifact cannot carry task-candidate attestation"
            )
        return self


class TaskCompletedResult(ContractModel):
    result_type: Literal["task_completed"]
    artifact: TaskResultArtifactFact | FinalMarkdownArtifactFact
    evidence_readiness: Literal["ready", "ready_with_gaps"]
    metrics: OperationMetrics | None = None

    @model_validator(mode="after")
    def exact_task_readiness(self) -> "TaskCompletedResult":
        payload = (
            TaskResultV2.model_validate(self.artifact.payload)
            if self.artifact.kind == "task_result"
            else FinalArtifactV1.model_validate(self.artifact.payload)
        )
        if self.evidence_readiness != payload.evidence_readiness:
            raise ValueError("task completion readiness must equal its artifact")
        if (
            self.artifact.kind == "final_markdown"
            and payload.candidate_attestation is None
        ):
            raise ValueError(
                "task-completed final Markdown requires candidate attestation"
            )
        return self


class EvaluationCompletedResult(ContractModel):
    result_type: Literal["evaluation_completed"]
    artifact: EvaluationArtifactFact
    execution_output_contract_satisfied: bool
    direct_promotion_artifact: ArtifactRef | None
    metrics: OperationMetrics | None = None

    @model_validator(mode="after")
    def exact_evaluation_completion(self) -> "EvaluationCompletedResult":
        payload = EvaluationResultV1.model_validate(self.artifact.payload)
        if (
            self.execution_output_contract_satisfied
            != payload.output_contract_satisfied
            or self.direct_promotion_artifact != payload.promoted_artifact
        ):
            raise ValueError("evaluation completion facts must equal its artifact")
        return self


class TranscriptCorpusAdmittedResult(ContractModel):
    result_type: Literal["transcript_corpus_admitted"]
    artifact: TranscriptCorpusArtifactFact
    metrics: CapabilityOperationMetrics | None = None

    @model_validator(mode="after")
    def model_free_admission(self) -> "TranscriptCorpusAdmittedResult":
        if self.metrics is not None and self.metrics.model_calls != 0:
            raise ValueError("corpus admission cannot claim a model generation")
        return self


class EvidenceAnalyzedResult(ContractModel):
    result_type: Literal["evidence_analyzed"]
    artifact: QualitativeAnalysisArtifactFact
    metrics: CapabilityOperationMetrics | None = None

    @model_validator(mode="after")
    def generation_receipt(self) -> "EvidenceAnalyzedResult":
        if self.metrics is not None and self.metrics.model_calls < 1:
            raise ValueError("analysis completion requires its generation receipt")
        return self


class SimulationCompletedResult(ContractModel):
    result_type: Literal["simulation_completed"]
    artifact: SimulationArtifactFact
    metrics: CapabilityOperationMetrics | None = None

    @model_validator(mode="after")
    def generation_receipt(self) -> "SimulationCompletedResult":
        if self.metrics is not None and self.metrics.model_calls < 1:
            raise ValueError("simulation completion requires its generation receipt")
        return self


CompletionResult = Annotated[
    Union[
        AssistantTurnCompletedResult,
        PrepareSolutionCompletedResult,
        ScopeCompiledResult,
        ResearchCompletedResult,
        TaskCompletedResult,
        EvaluationCompletedResult,
        ArtifactSynthesizedResult,
        TranscriptCorpusAdmittedResult,
        EvidenceAnalyzedResult,
        SimulationCompletedResult,
    ],
    Field(discriminator="result_type"),
]


OperationStatus = Literal[
    "accepted",
    "running",
    "cancel_requested",
    "cancelled",
    "completed",
    "failed",
]
OperationEventType = Literal[
    "accepted",
    "running",
    "heartbeat",
    "cancel_requested",
    "cancelled",
    "completed",
    "failed",
]


class OperationAccepted(ContractModel):
    operation_id: UUID
    status: Literal["accepted", "running", "cancel_requested"]
    canonical_input_hash: Sha256
    status_url: str
    retry_after_seconds: int = Field(default=2, ge=1, le=300)


class OperationCompleted(ContractModel):
    operation_id: UUID
    status: Literal["completed"]
    canonical_input_hash: Sha256
    result: CompletionResult


DiagnosticToken = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Za-z0-9_:-]{1,100}$"),
]


class OperationFailurePhaseDiagnostics(ContractModel):
    """Content-free runtime facts safe to return across the API boundary."""

    route: DiagnosticToken
    status: DiagnosticToken
    elapsed_ms: int | None = Field(default=None, ge=0, le=900_000)
    call_count: int | None = Field(default=None, ge=0, le=100)
    retry_count: int | None = Field(default=None, ge=0, le=100)
    upstream_status_code: int | None = Field(default=None, ge=100, le=599)
    primary_skipped: bool | None = None
    circuit_state: Literal["open"] | None = None
    retry_after_seconds: int | None = Field(default=None, ge=1, le=900)
    input_tokens: int | None = Field(default=None, ge=0, le=2_000_000)
    output_tokens: int | None = Field(default=None, ge=0, le=2_000_000)
    total_tokens: int | None = Field(default=None, ge=0, le=2_000_000)
    reasoning_tokens: int | None = Field(default=None, ge=0, le=2_000_000)
    limit_kind: (
        Literal[
            "request",
            "per_request_input",
            "input",
            "output",
            "total",
            "provider_output",
            "deadline",
            "unknown",
        ]
        | None
    ) = None
    usage_complete: bool | None = None

    @model_validator(mode="after")
    def exact_open_circuit_facts(self) -> "OperationFailurePhaseDiagnostics":
        if self.primary_skipped is True and self.circuit_state != "open":
            raise ValueError("a skipped primary must identify the open circuit")
        if self.circuit_state == "open" and self.primary_skipped is not True:
            raise ValueError("an open circuit must identify the skipped primary")
        return self


class OperationFailureDiagnostics(OperationFailurePhaseDiagnostics):
    primary_status: DiagnosticToken | None = None
    fallback_attempted: bool | None = None
    fallback_used: bool | None = None
    primary: OperationFailurePhaseDiagnostics | None = None
    fallback: OperationFailurePhaseDiagnostics | None = None
    discovery: OperationFailurePhaseDiagnostics | None = None


class OperationFailed(ContractModel):
    operation_id: UUID
    status: Literal["failed"]
    canonical_input_hash: Sha256
    retryable: bool
    error_class: str = Field(min_length=1, max_length=200)
    retry_at: Rfc3339Utc | None = None
    retry_after_seconds: int | None = Field(default=None, ge=1, le=900)
    diagnostics: OperationFailureDiagnostics | None = None

    @model_validator(mode="after")
    def retry_guidance_requires_retryable_failure(self) -> "OperationFailed":
        if not self.retryable and (
            self.retry_at is not None or self.retry_after_seconds is not None
        ):
            raise ValueError("retry timing requires a retryable failure")
        return self


class OperationCancelled(ContractModel):
    operation_id: UUID
    status: Literal["cancelled"]
    canonical_input_hash: Sha256


class OperationEvent(ContractModel):
    operation_id: UUID
    sequence: int = Field(ge=1)
    event_type: OperationEventType
    status: OperationStatus
    occurred_at: Rfc3339Utc
    retryable: bool | None = None
    error_class: str | None = Field(default=None, min_length=1, max_length=200)
    retry_at: Rfc3339Utc | None = None
    retry_after_seconds: int | None = Field(default=None, ge=1, le=900)
    diagnostics: OperationFailureDiagnostics | None = None

    @model_validator(mode="after")
    def exact_lifecycle_event(self) -> "OperationEvent":
        allowed_statuses = {
            "accepted": {"accepted"},
            "running": {"running"},
            "heartbeat": {"running", "cancel_requested"},
            "cancel_requested": {"cancel_requested"},
            "cancelled": {"cancelled"},
            "completed": {"completed"},
            "failed": {"failed"},
        }[self.event_type]
        if self.status not in allowed_statuses:
            raise ValueError("event type and operation status are inconsistent")
        failure_fields = (
            self.retryable,
            self.error_class,
            self.retry_at,
            self.retry_after_seconds,
            self.diagnostics,
        )
        if self.event_type == "failed":
            if self.retryable is None or self.error_class is None:
                raise ValueError("failed events require the failure disposition")
            if not self.retryable and (
                self.retry_at is not None or self.retry_after_seconds is not None
            ):
                raise ValueError("retry timing requires a retryable failed event")
        elif any(value is not None for value in failure_fields):
            raise ValueError("only failed events may carry failure details")
        return self


class OperationEventPage(ContractModel):
    operation_id: UUID
    after: int = Field(ge=0)
    next_after: int = Field(ge=0)
    has_more: bool
    events: list[OperationEvent] = Field(max_length=200)

    @model_validator(mode="after")
    def monotonic_cursor_page(self) -> "OperationEventPage":
        sequences = [event.sequence for event in self.events]
        if any(event.operation_id != self.operation_id for event in self.events):
            raise ValueError("event page operation IDs must match")
        if sequences != sorted(set(sequences)):
            raise ValueError("event sequences must be strictly increasing")
        if sequences and sequences[0] <= self.after:
            raise ValueError("event page must begin after the supplied cursor")
        expected_next = sequences[-1] if sequences else self.after
        if self.next_after != expected_next:
            raise ValueError("nextAfter must equal the last delivered sequence")
        return self


OperationResponse = Annotated[
    Union[
        OperationAccepted,
        OperationCompleted,
        OperationFailed,
        OperationCancelled,
    ],
    Field(discriminator="status"),
]

OperationCancelResponse = OperationResponse
