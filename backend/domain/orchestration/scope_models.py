"""Compact, truth-preserving scope and quality contracts for Orqaly handoff."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Tuple, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.domain.market_scope import MARKET_COUNTRY_CODES


SCOPE_PACKET_VERSION = "axwise_scope_packet_v1"
QUALITY_CONTRACT_VERSION = "axwise_quality_contract_v1"
SCOPE_CORRECTION_VERSION = "axwise_scope_correction_v1"
SCOPE_CONTINUATION_VERSION = "axwise_scope_continuation_v1"
SCOPE_ACTIVE_REVISION_STATUSES = (
    "queued",
    "interpreting",
    "proposal_pending",
    "proposal_persisting",
    "proposal_failed",
    "proposal_dead_lettered",
    "compiled",
    "needs_material_clarification",
    "accepted",
)


class ScopeContractModel(BaseModel):
    """Strict base used before data enters a prompt or immutable snapshot."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class ImmutableScopeContractModel(ScopeContractModel):
    """Frozen typed boundary; collection fields use tuples below."""

    model_config = ConfigDict(frozen=True)


def _unique_strings(values: List[str]) -> List[str]:
    result: List[str] = []
    seen: set[str] = set()
    for value in values:
        item = " ".join(value.split())
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _semantic_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _semantic_action_key(value: str) -> str:
    return re.sub(r"[_\W]+", " ", value, flags=re.UNICODE).strip().casefold()


def canonical_scope_action_id(value: str) -> str:
    """Derive one deterministic identifier without inferring action semantics."""

    return _semantic_action_key(value).replace(" ", "_")


def _semantic_id(prefix: str, payload: dict) -> str:
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return f"{prefix}-{hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:16]}"


class ScopeDeliverableSeedV1(ScopeContractModel):
    type: str = Field(..., min_length=1, max_length=120)
    count: int = Field(default=1, ge=1, le=20)
    title_prefix: Optional[str] = Field(default=None, max_length=255)
    required_sections: List[str] = Field(default_factory=list, max_length=100)
    presentation: Literal[
        "markdown_artifact",
        "structured_data",
        "chat_response",
        "mixed",
    ] = "markdown_artifact"

    @field_validator("required_sections")
    @classmethod
    def unique_sections(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


ScopeWorkTypeV1 = Literal[
    "research_analysis",
    "strategy_planning",
    "content_asset_creation",
    "software_development",
    "outreach_campaign",
    "external_service_operation",
    "procurement_logistics",
    "physical_operations",
    "mixed_custom",
]


ScopeDocumentIntentV1 = Literal[
    "commercial_market_launch",
    "operational_process",
    "product_strategy",
    "software_product",
    "custom",
]


ScopeResearchOutputV1 = Literal[
    "market_sources",
    "market_claims",
    "synthetic_participants",
    "interviews",
    "customer_personas",
    "persona_resolution",
    "research_prd",
    "research_bundle",
]


class ScopeEvidenceContractV1(ImmutableScopeContractModel):
    """Evidence acquisition intent kept separate from document and work shape."""

    mode: Literal["none", "existing", "synthetic", "grounded"] = "none"
    grounding_required: bool = False
    external_sources_required: bool = False
    required_outputs: Tuple[ScopeResearchOutputV1, ...] = Field(
        default_factory=tuple,
        max_length=8,
    )

    @field_validator("required_outputs")
    @classmethod
    def canonical_outputs(
        cls,
        values: Tuple[ScopeResearchOutputV1, ...],
    ) -> Tuple[ScopeResearchOutputV1, ...]:
        canonical = tuple(sorted(set(values)))
        if values != canonical:
            raise ValueError("required_outputs must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_mode(self) -> "ScopeEvidenceContractV1":
        if self.mode == "none" and self.required_outputs:
            raise ValueError("none evidence mode cannot request research outputs")
        if self.mode != "none" and "research_bundle" not in self.required_outputs:
            raise ValueError("research evidence modes must request research_bundle")
        if self.mode == "grounded" and not (
            self.grounding_required and self.external_sources_required
        ):
            raise ValueError(
                "grounded evidence requires grounding_required and "
                "external_sources_required"
            )
        if self.mode != "grounded" and (
            self.grounding_required or self.external_sources_required
        ):
            raise ValueError(
                "grounding or external-source requirements require grounded mode"
            )
        if self.external_sources_required and "market_sources" not in self.required_outputs:
            raise ValueError(
                "external-source requirements must include market_sources"
            )
        if self.mode == "synthetic" and {
            "market_sources",
            "market_claims",
        }.intersection(self.required_outputs):
            raise ValueError(
                "synthetic evidence cannot promise market sources or claims"
            )
        return self


class ScopeExecutorRoleSlotV1(ImmutableScopeContractModel):
    slot_id: str = Field(..., pattern=r"^role-[a-f0-9]{16}$")
    role: str = Field(..., min_length=2, max_length=255)
    required: Literal[True] = True


class ScopeResearchContractV1(ImmutableScopeContractModel):
    """Immutable semantic bridge from scope admission into research execution."""

    version: Literal["axwise_scope_research_contract_v1"] = (
        "axwise_scope_research_contract_v1"
    )
    document_intent: ScopeDocumentIntentV1
    work_types: Tuple[ScopeWorkTypeV1, ...] = Field(..., min_length=1, max_length=9)
    geographies: Tuple[str, ...] = Field(default_factory=tuple, max_length=64)
    evidence: ScopeEvidenceContractV1 = Field(default_factory=ScopeEvidenceContractV1)
    executor_role_slots: Tuple[ScopeExecutorRoleSlotV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @field_validator("work_types")
    @classmethod
    def canonical_work_types(
        cls,
        values: Tuple[ScopeWorkTypeV1, ...],
    ) -> Tuple[ScopeWorkTypeV1, ...]:
        canonical = tuple(sorted(set(values)))
        if values != canonical:
            raise ValueError("work_types must be sorted and unique")
        return values

    @field_validator("geographies")
    @classmethod
    def canonical_geographies(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        original = tuple(str(value).strip() for value in values if str(value).strip())
        normalized = tuple(
            str(value).strip().upper()
            for value in values
            if str(value).strip()
        )
        if any(not re.fullmatch(r"[A-Z]{2}", value) for value in normalized):
            raise ValueError("geographies must contain canonical ISO-2 country codes")
        if any(value not in MARKET_COUNTRY_CODES for value in normalized):
            raise ValueError("geographies must contain assigned ISO-2 country codes")
        canonical = tuple(sorted(set(normalized)))
        if original != normalized or normalized != canonical:
            raise ValueError("geographies must be uppercase, sorted, and unique")
        return normalized

    @field_validator("executor_role_slots")
    @classmethod
    def canonical_role_slots(
        cls,
        values: Tuple[ScopeExecutorRoleSlotV1, ...],
    ) -> Tuple[ScopeExecutorRoleSlotV1, ...]:
        by_id: dict[str, ScopeExecutorRoleSlotV1] = {}
        role_keys: set[str] = set()
        for value in values:
            if value.slot_id in by_id:
                raise ValueError("executor role slot IDs must be unique")
            role_key = _semantic_text(value.role)
            if role_key in role_keys:
                raise ValueError("executor roles must be unique")
            role_keys.add(role_key)
            by_id[value.slot_id] = value.model_copy(
                update={"role": _semantic_text(value.role)}
            )
        canonical = tuple(by_id[key] for key in sorted(by_id))
        if tuple(value.slot_id for value in values) != tuple(
            value.slot_id for value in canonical
        ):
            raise ValueError("executor role slots must be sorted by slot_id")
        for ordinal, value in enumerate(canonical):
            expected = (
                f"role-{ordinal:04x}"
                f"{hashlib.sha256(value.role.encode('utf-8')).hexdigest()[:12]}"
            )
            if value.slot_id != expected:
                raise ValueError(
                    "executor role slot IDs must bind canonical order and role"
                )
        return canonical

    @staticmethod
    def canonical_hash_for(payload: dict) -> str:
        value = dict(payload)
        value.pop("contract_hash", None)
        value["work_types"] = sorted(set(value.get("work_types") or []))
        value["geographies"] = sorted(
            set(str(item).strip().upper() for item in value.get("geographies") or [])
        )
        evidence = dict(value.get("evidence") or {})
        evidence["required_outputs"] = sorted(
            set(evidence.get("required_outputs") or [])
        )
        value["evidence"] = evidence
        value["executor_role_slots"] = sorted(
            value.get("executor_role_slots") or [],
            key=lambda item: str(item.get("slot_id") or ""),
        )
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_integrity(self) -> "ScopeResearchContractV1":
        expected = self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"contract_hash"})
        )
        if self.contract_hash != expected:
            raise ValueError("research contract_hash does not match its canonical content")
        if (
            self.document_intent == "commercial_market_launch"
            and "strategy_planning" not in self.work_types
        ):
            raise ValueError(
                "commercial market launch requires strategy_planning work"
            )
        if (
            self.evidence.external_sources_required
            and "research_analysis" not in self.work_types
        ):
            raise ValueError(
                "external-source evidence requires research_analysis work"
            )
        if (
            self.document_intent == "custom"
            and "research_prd" in self.evidence.required_outputs
        ):
            raise ValueError(
                "custom research PRDs require an explicit supported document schema"
            )
        if self.evidence.mode == "grounded" and not self.geographies:
            raise ValueError("grounded research requires at least one geography")
        if (
            self.executor_role_slots
            and self.evidence.mode != "none"
            and "persona_resolution" not in self.evidence.required_outputs
        ):
            raise ValueError(
                "research-backed executor roles require persona_resolution"
            )
        return self


class ScopeContractBindingV1(ImmutableScopeContractModel):
    """Exact packet-bound echo persisted through every research result."""

    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    version: Literal["axwise_scope_research_contract_v1"]
    document_intent: ScopeDocumentIntentV1
    work_types: Tuple[ScopeWorkTypeV1, ...] = Field(..., min_length=1, max_length=9)
    geographies: Tuple[str, ...] = Field(default_factory=tuple, max_length=64)
    evidence: ScopeEvidenceContractV1
    executor_role_slots: Tuple[ScopeExecutorRoleSlotV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @classmethod
    def from_packet(cls, packet: "ScopePacketV1") -> "ScopeContractBindingV1":
        if packet.research_contract is None:
            raise ValueError("scope packet does not carry a research contract")
        return cls(
            scope_hash=packet.scope_hash,
            **packet.research_contract.model_dump(mode="json"),
        )

    @model_validator(mode="after")
    def validate_contract_hash(self) -> "ScopeContractBindingV1":
        payload = self.model_dump(mode="json", exclude={"scope_hash"})
        canonical = ScopeResearchContractV1.model_validate(payload)
        if canonical.model_dump(mode="json") != payload:
            raise ValueError("scope binding contract fields are not canonical")
        return self


class ScopeProposalDisclosureV1(ImmutableScopeContractModel):
    """Compact, no-spend disclosure shown before any owner acceptance."""

    version: Literal["axwise_scope_proposal_disclosure_v1"] = (
        "axwise_scope_proposal_disclosure_v1"
    )
    acquisition_mode: Literal["none", "synthetic", "grounded"]
    research_required: bool
    grounding_required: bool
    external_sources_required: bool
    required_outputs: Tuple[str, ...] = Field(default_factory=tuple, max_length=20)
    geographies: Tuple[str, ...] = Field(default_factory=tuple, max_length=64)
    executor_roles: Tuple[str, ...] = Field(default_factory=tuple, max_length=20)
    currency: str = Field(..., min_length=3, max_length=3)
    maximum_research_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_research_cost: Optional[float] = Field(default=None, ge=0.0)
    maximum_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    estimated_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    maximum_research_iterations: int = Field(default=0, ge=0, le=3)
    maximum_evidence_items: int = Field(default=0, ge=0, le=100)
    provider: Optional[Literal["google"]] = None
    model_resource: Optional[Literal["models/gemini-3.7-flash"]] = None
    thinking_level: Optional[Literal["HIGH"]] = None

    @model_validator(mode="after")
    def validate_disclosure(self) -> "ScopeProposalDisclosureV1":
        if self.research_required != (self.acquisition_mode != "none"):
            raise ValueError("research_required contradicts acquisition_mode")
        if self.acquisition_mode == "none" and (
            self.grounding_required
            or self.external_sources_required
            or self.required_outputs
            or self.geographies
            or self.executor_roles
            or self.maximum_research_cost is not None
            or self.estimated_research_cost is not None
            or self.maximum_research_latency_ms is not None
            or self.estimated_research_latency_ms is not None
            or self.maximum_research_iterations != 0
            or self.maximum_evidence_items != 0
            or self.provider is not None
            or self.model_resource is not None
            or self.thinking_level is not None
        ):
            raise ValueError("mode none disclosure must expose zero research surface")
        if self.acquisition_mode == "grounded" and (
            not self.grounding_required
            or not self.external_sources_required
            or not self.geographies
        ):
            raise ValueError("grounded disclosure requires sources and geographies")
        if self.acquisition_mode == "synthetic" and (
            self.grounding_required or self.external_sources_required
        ):
            raise ValueError("synthetic disclosure cannot claim external grounding")
        if self.acquisition_mode != "none" and self.maximum_evidence_items < 1:
            raise ValueError("research disclosure requires a positive evidence cap")
        if self.acquisition_mode != "none" and (
            self.provider != "google"
            or self.model_resource != "models/gemini-3.7-flash"
            or self.thinking_level != "HIGH"
        ):
            raise ValueError("research disclosure requires its exact model boundary")
        return self


class ScopeProposalBindingV1(ImmutableScopeContractModel):
    """One immutable Gate-1 proposal identity, initial or corrected."""

    version: Literal["axwise_scope_proposal_v1"] = "axwise_scope_proposal_v1"
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    parent_decision_id: Optional[str] = Field(default=None, max_length=255)
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    scope_generation: int = Field(..., ge=0)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    research_execution_inputs_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )
    correction_id: Optional[str] = Field(
        default=None,
        pattern=r"^scope-correction-[a-f0-9]{32}$",
    )
    correction_hash: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    compiler_hash: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    disclosure: ScopeProposalDisclosureV1
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("proposal_hash", None)
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(value)

    @model_validator(mode="after")
    def validate_binding(self) -> "ScopeProposalBindingV1":
        corrected = self.scope_generation > 0
        if corrected != bool(
            self.correction_id and self.correction_hash and self.compiler_hash
        ):
            raise ValueError(
                "corrected proposal provenance must match its scope generation"
            )
        if self.disclosure.research_required != bool(
            self.research_execution_inputs_hash
        ):
            raise ValueError(
                "research execution hash must match the disclosed research boundary"
            )
        if self.proposal_hash != self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"proposal_hash"})
        ):
            raise ValueError("scope proposal hash is invalid")
        return self


class ScopeResearchAcceptanceBindingV1(ImmutableScopeContractModel):
    """Owner acceptance bound to one proposal and execution-input snapshot."""

    version: Literal["orqaly_scope_research_acceptance_v1"] = (
        "orqaly_scope_research_acceptance_v1"
    )
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    goal_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    execution_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    acceptance_id: str = Field(..., min_length=36, max_length=36)
    accepted_at: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
    )
    accepted_by_user_id: str = Field(..., min_length=1, max_length=255)
    binding_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict) -> str:
        value = dict(payload)
        value.pop("binding_hash", None)
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_acceptance(self) -> "ScopeResearchAcceptanceBindingV1":
        try:
            UUID(self.acceptance_id)
        except ValueError as exc:
            raise ValueError("acceptance_id must be a UUID") from exc
        try:
            datetime.strptime(self.accepted_at, "%Y-%m-%dT%H:%M:%S.%fZ")
        except ValueError as exc:
            raise ValueError("accepted_at must be a valid canonical UTC timestamp") from exc
        if self.user_id != self.accepted_by_user_id:
            raise ValueError("research scope acceptance must be by the goal owner")
        expected = self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"binding_hash"})
        )
        if self.binding_hash != expected:
            raise ValueError("scope research acceptance binding_hash is invalid")
        return self


class ScopeProposalAcceptanceRequestV1(ImmutableScopeContractModel):
    """Owner's exact compare-and-set acknowledgement of one Gate-1 proposal."""

    version: Literal["orqaly_scope_proposal_acceptance_request_v1"] = (
        "orqaly_scope_proposal_acceptance_request_v1"
    )
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    scope_generation: int = Field(..., ge=0)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    research_execution_inputs_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )


class ScopeProposalAcceptanceV1(ImmutableScopeContractModel):
    """Server-issued first-success acceptance for initial and corrected scopes."""

    version: Literal["axwise_scope_proposal_acceptance_v1"] = (
        "axwise_scope_proposal_acceptance_v1"
    )
    acceptance_id: str = Field(..., pattern=r"^scope-acceptance-[a-f0-9]{32}$")
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    scope_generation: int = Field(..., ge=0)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    contract_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    research_execution_inputs_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )
    accepted_at: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
    )
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_acceptance_id(payload: dict[str, Any]) -> str:
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return "scope-acceptance-" + canonical_hash(payload)[:32]

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("acceptance_hash", None)
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(value)

    @model_validator(mode="after")
    def validate_acceptance_hash(self) -> "ScopeProposalAcceptanceV1":
        identity = {
            "org_id": self.org_id,
            "user_id": self.user_id,
            "task_id": self.task_id,
            "proposal_decision_id": self.proposal_decision_id,
            "scope_generation": self.scope_generation,
            "scope_hash": self.scope_hash,
            "contract_hash": self.contract_hash,
            "proposal_hash": self.proposal_hash,
            "proposal_inputs_hash": self.proposal_inputs_hash,
            "research_execution_inputs_hash": self.research_execution_inputs_hash,
        }
        if self.acceptance_id != self.canonical_acceptance_id(identity):
            raise ValueError("scope proposal acceptance_id is invalid")
        try:
            datetime.strptime(self.accepted_at, "%Y-%m-%dT%H:%M:%S.%fZ")
        except ValueError as exc:
            raise ValueError("accepted_at must be canonical UTC") from exc
        if self.acceptance_hash != self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"acceptance_hash"})
        ):
            raise ValueError("scope proposal acceptance_hash is invalid")
        return self


class ScopeRequestedActionV1(ScopeContractModel):
    """Domain-neutral execution intent; authorization remains with Orqaly."""

    action: str = Field(..., min_length=1, max_length=500)
    mode: Literal["advise", "prepare", "execute"] = "prepare"
    side_effect: Literal["none", "reversible", "irreversible"] = "none"
    requires_authorization: bool = False

    @model_validator(mode="after")
    def execution_never_implies_authorization(self) -> "ScopeRequestedActionV1":
        if (
            self.mode == "execute" or self.side_effect != "none"
        ) and not self.requires_authorization:
            raise ValueError(
                "execute actions and side effects require Orqaly authorization"
            )
        return self


class ScopeAdmissionV1(ScopeContractModel):
    """Universal work shape admitted by AxWise before Orqaly selects a playbook."""

    version: Literal["axwise_scope_admission_v1"] = "axwise_scope_admission_v1"
    work_types: List[ScopeWorkTypeV1] = Field(default_factory=list, max_length=9)
    geographies: List[str] = Field(default_factory=list, max_length=100)
    channels: List[str] = Field(default_factory=list, max_length=100)
    success_criteria: List[str] = Field(default_factory=list, max_length=200)
    required_capabilities: List[str] = Field(default_factory=list, max_length=100)
    requested_actions: List[ScopeRequestedActionV1] = Field(
        default_factory=list,
        max_length=100,
    )

    @field_validator(
        "work_types",
        "geographies",
        "channels",
        "success_criteria",
        "required_capabilities",
    )
    @classmethod
    def canonical_admission_values(cls, values: List[str]) -> List[str]:
        return sorted(
            _unique_strings(values),
            key=lambda value: (value.casefold(), value),
        )

    @field_validator("requested_actions")
    @classmethod
    def canonical_requested_actions(
        cls,
        values: List[ScopeRequestedActionV1],
    ) -> List[ScopeRequestedActionV1]:
        by_action: dict[str, ScopeRequestedActionV1] = {}
        for value in values:
            key = _semantic_action_key(value.action)
            normalized = value.model_copy(
                update={"action": _semantic_text(value.action)}
            )
            existing = by_action.get(key)
            if existing is not None:
                if existing != normalized:
                    raise ValueError(
                        f"requested action {normalized.action!r} "
                        "has conflicting definitions"
                    )
                raise ValueError(
                    f"requested action {normalized.action!r} has a duplicate "
                    "semantic action ID"
                )
            by_action[key] = normalized
        return [by_action[key] for key in sorted(by_action)]


class ScopeRequirementSeedV1(ScopeContractModel):
    text: str = Field(..., min_length=3, max_length=4000)
    priority: Literal["P0", "P1", "P2"] = "P0"
    authority: Literal[
        "user",
        "system_policy",
        "trusted_runtime",
        "verified_evidence",
        "accepted_assumption",
    ] = "user"
    source_refs: List[str] = Field(default_factory=list, max_length=100)

    @field_validator("source_refs")
    @classmethod
    def unique_source_refs(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeFactSeedV1(ScopeContractModel):
    claim: str = Field(..., min_length=3, max_length=4000)
    verification: Literal["verified", "unverified", "disputed"]
    source_refs: List[str] = Field(default_factory=list, max_length=100)
    source_authority_ids: List[str] = Field(default_factory=list, max_length=100)
    verbatim_excerpt: Optional[str] = Field(default=None, max_length=8000)
    content_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )

    @field_validator("source_refs", "source_authority_ids")
    @classmethod
    def unique_fact_refs(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)

    @model_validator(mode="after")
    def verified_facts_require_exact_authority(self) -> "ScopeFactSeedV1":
        if self.verification == "verified" and not (
            self.source_refs
            and self.source_authority_ids
            and self.verbatim_excerpt
            and self.content_hash
        ):
            raise ValueError(
                "verified facts require source_refs, source_authority_ids, "
                "verbatim_excerpt, and content_hash"
            )
        return self


class ScopeAssumptionSeedV1(ScopeContractModel):
    text: str = Field(..., min_length=3, max_length=4000)
    materiality: Literal["material", "non_material"] = "non_material"
    owner_confirmed: bool = False
    truth_status: Literal["assumption"] = "assumption"
    source_refs: List[str] = Field(default_factory=list, max_length=100)

    @field_validator("source_refs")
    @classmethod
    def unique_assumption_refs(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeDecisionSeedV1(ScopeContractModel):
    question: str = Field(..., min_length=3, max_length=4000)
    status: Literal["open", "proposed", "accepted", "rejected"] = "open"
    materiality: Literal["material", "non_material"] = "material"
    proposal: Optional[str] = Field(default=None, max_length=4000)
    resolved_choice: Optional[str] = Field(default=None, max_length=4000)
    source_refs: List[str] = Field(default_factory=list, max_length=100)

    @field_validator("source_refs")
    @classmethod
    def unique_decision_refs(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)

    @model_validator(mode="after")
    def decision_state_is_explicit(self) -> "ScopeDecisionSeedV1":
        if self.status == "proposed" and not self.proposal:
            raise ValueError("proposed decisions require a proposal")
        if self.status == "accepted" and not (self.resolved_choice or self.proposal):
            raise ValueError("accepted decisions require a resolved choice or proposal")
        if self.status in {"open", "proposed"} and self.resolved_choice:
            raise ValueError("unresolved decisions cannot have a resolved choice")
        if self.materiality == "non_material" and self.status == "open" and not self.proposal:
            raise ValueError(
                "non-material open decisions need a proposed assumption so the user can proceed"
            )
        return self


class ScopeConstraintSeedV1(ScopeContractModel):
    text: str = Field(..., min_length=3, max_length=4000)
    kind: Literal[
        "policy",
        "security",
        "privacy",
        "budget",
        "time",
        "technical",
        "product",
        "other",
    ] = "other"
    authority: Literal["user", "system_policy", "trusted_runtime"] = "user"
    source_refs: List[str] = Field(default_factory=list, max_length=100)

    @field_validator("source_refs")
    @classmethod
    def unique_constraint_refs(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeAcceptanceSeedV1(ScopeContractModel):
    given: str = Field(..., min_length=3, max_length=2000)
    when: str = Field(..., min_length=3, max_length=2000)
    then: List[str] = Field(..., min_length=1, max_length=30)
    supports: List[str] = Field(default_factory=list, max_length=100)
    data_class: Literal["synthetic", "production_safe", "manual_review"] = "synthetic"

    @field_validator("then", "supports")
    @classmethod
    def unique_acceptance_values(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeStateV1(ScopeContractModel):
    """Optional explicit scope state layered over the existing task contract."""

    requirements: List[ScopeRequirementSeedV1] = Field(default_factory=list, max_length=200)
    facts: List[ScopeFactSeedV1] = Field(default_factory=list, max_length=200)
    assumptions: List[ScopeAssumptionSeedV1] = Field(default_factory=list, max_length=200)
    decisions: List[ScopeDecisionSeedV1] = Field(default_factory=list, max_length=100)
    constraints: List[ScopeConstraintSeedV1] = Field(default_factory=list, max_length=200)
    acceptance: List[ScopeAcceptanceSeedV1] = Field(default_factory=list, max_length=200)
    audiences: List[str] = Field(default_factory=list, max_length=100)
    non_goals: List[str] = Field(default_factory=list, max_length=100)
    deliverable: Optional[ScopeDeliverableSeedV1] = None
    admission: Optional[ScopeAdmissionV1] = None
    research_contract: Optional[ScopeResearchContractV1] = None

    @field_validator("audiences", "non_goals")
    @classmethod
    def unique_scope_strings(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeRequirementV1(ScopeRequirementSeedV1):
    requirement_id: str = Field(..., pattern=r"^req-[a-f0-9]{16}$")


class ScopeFactV1(ScopeFactSeedV1):
    fact_id: str = Field(..., pattern=r"^fact-[a-f0-9]{16}$")


class ScopeAssumptionV1(ScopeAssumptionSeedV1):
    assumption_id: str = Field(..., pattern=r"^asm-[a-f0-9]{16}$")


class ScopeDecisionV1(ScopeDecisionSeedV1):
    decision_id: str = Field(..., pattern=r"^dec-[a-f0-9]{16}$")


class ScopeConstraintV1(ScopeConstraintSeedV1):
    constraint_id: str = Field(..., pattern=r"^con-[a-f0-9]{16}$")


class ScopeAcceptanceV1(ScopeAcceptanceSeedV1):
    acceptance_id: str = Field(..., pattern=r"^acc-[a-f0-9]{16}$")


class ScopeIntentV1(ScopeContractModel):
    objective: str = Field(..., min_length=3, max_length=8000)
    problem: str = Field(..., min_length=3, max_length=4000)
    desired_outcome: str = Field(..., min_length=3, max_length=8000)
    audiences: List[str] = Field(default_factory=list, max_length=100)
    non_goals: List[str] = Field(default_factory=list, max_length=100)

    @field_validator("audiences", "non_goals")
    @classmethod
    def unique_intent_values(cls, values: List[str]) -> List[str]:
        return _unique_strings(values)


class ScopeLedgerV1(ScopeContractModel):
    requirements: List[ScopeRequirementV1] = Field(..., min_length=1, max_length=200)
    facts: List[ScopeFactV1] = Field(default_factory=list, max_length=200)
    assumptions: List[ScopeAssumptionV1] = Field(default_factory=list, max_length=200)
    decisions: List[ScopeDecisionV1] = Field(default_factory=list, max_length=100)
    constraints: List[ScopeConstraintV1] = Field(default_factory=list, max_length=200)
    acceptance: List[ScopeAcceptanceV1] = Field(..., min_length=1, max_length=200)


class TrustedRuntimeMetadataV1(ScopeContractModel):
    runtime_contract_version: Literal["axwise_gemini_runtime_v1"] = (
        "axwise_gemini_runtime_v1"
    )
    runtime_authority_id: Literal["axwise.runtime.gemini-research.v1"] = (
        "axwise.runtime.gemini-research.v1"
    )
    provider: Literal["google"] = "google"
    model: Literal["gemini-3.7-flash"] = "gemini-3.7-flash"
    model_resource: Literal["models/gemini-3.7-flash"] = (
        "models/gemini-3.7-flash"
    )
    reasoning_mode: Literal["high"] = "high"
    context_window: Literal[1048576] = 1048576
    max_output_tokens: Literal[65536] = 65536
    output_policy: Literal["provider_maximum_no_workflow_cap"] = (
        "provider_maximum_no_workflow_cap"
    )
    configuration_sources: List[str] = Field(
        default_factory=lambda: [
            "backend.services.llm.gemini_runtime",
            "backend.services.llm.config.genai_config",
            "backend.infrastructure.data.config.MODEL_CAPABILITIES",
        ],
        min_length=3,
        max_length=3,
    )


class TruthPolicyV1(ScopeContractModel):
    external_facts: Literal["verified_evidence_only"] = "verified_evidence_only"
    unsupported_numbers: Literal["target_hypothesis_or_assumption"] = (
        "target_hypothesis_or_assumption"
    )
    unsettled_technology: Literal["label_proposed"] = "label_proposed"
    owner_confirmation: Literal["assumption_never_fact"] = "assumption_never_fact"
    open_decisions: Literal["force_draft"] = "force_draft"
    side_effects: Literal["explicit_orqaly_approval_required"] = (
        "explicit_orqaly_approval_required"
    )


class QualityContractV1(ScopeContractModel):
    version: Literal["axwise_quality_contract_v1"] = QUALITY_CONTRACT_VERSION
    # Integers are intentional: JSON has one number type, while Python's `1.0`
    # and JavaScript's `1` serialize differently and would break the shared
    # canonical scope hash even though they mean the same 100% coverage.
    minimum_requirement_coverage: Literal[1] = 1
    minimum_p0_test_coverage: Literal[1] = 1
    require_requirement_test_traceability: Literal[True] = True
    require_verified_fact_authority: Literal[True] = True
    require_verbatim_evidence: Literal[True] = True
    require_runtime_truth: Literal[True] = True
    reject_fact_assumption_overlap: Literal[True] = True
    reject_stale_scope_hash: Literal[True] = True
    unresolved_decisions_force_draft: Literal[True] = True
    targeted_repair_before_regeneration: Literal[True] = True
    output_token_limit_policy: Literal["do_not_artificially_cap"] = (
        "do_not_artificially_cap"
    )


ScopeSemanticFieldV1 = Literal[
    "objective",
    "problem",
    "desired_outcome",
    "audiences",
    "non_goals",
    "geographies",
    "channels",
    "success_criteria",
    "document_intent",
    "deliverable_title_prefix",
    "deliverable_sections",
    "evidence_preference",
    "work_goals",
    "operation_intents",
    "role_requirements",
]

ScopeSemanticEditOperationV1 = Literal["replace", "add", "remove", "clear"]
ScopeSemanticLiteralV1 = Annotated[str, Field(min_length=1, max_length=1000)]

ScopeEvidencePreferenceV1 = Literal[
    "none",
    "synthetic",
    "grounded",
]

ScopeSemanticWorkGoalV1 = Literal[
    "investigate",
    "plan",
    "create_assets",
    "build_software",
    "run_outreach",
    "operate_external_service",
    "manage_supply_chain",
    "perform_physical_work",
    "custom_delivery",
]

ScopeSemanticOperationIntentV1 = Literal[
    "contact_external_party",
    "send_sms",
    "send_email",
    "spend_money",
    "publish",
    "deploy",
    "procure",
    "ship",
    "create_content",
    "write_software",
]


class ScopeSourceSpanV1(ImmutableScopeContractModel):
    """Exact Python character offsets into the owner's correction text."""

    start: int = Field(..., ge=0, le=8000)
    end: int = Field(..., ge=1, le=8000)
    text: str = Field(..., min_length=1, max_length=8000)

    @model_validator(mode="after")
    def ordered_offsets(self) -> "ScopeSourceSpanV1":
        if self.end <= self.start:
            raise ValueError("source span end must be greater than start")
        return self


class ScopeSemanticFieldEditV1(ImmutableScopeContractModel):
    """A semantic observation only; it carries no execution authority."""

    edit_id: str = Field(..., pattern=r"^edit-[a-f0-9]{16}$")
    field: ScopeSemanticFieldV1
    operation: ScopeSemanticEditOperationV1
    text_value: Optional[str] = Field(default=None, min_length=1, max_length=8000)
    item_values: Tuple[ScopeSemanticLiteralV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    document_intent: Optional[ScopeDocumentIntentV1] = None
    evidence_preference: Optional[ScopeEvidencePreferenceV1] = None
    work_goals: Tuple[ScopeSemanticWorkGoalV1, ...] = Field(
        default_factory=tuple,
        max_length=9,
    )
    operation_intents: Tuple[ScopeSemanticOperationIntentV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )
    source_span: ScopeSourceSpanV1
    confidence: float = Field(..., ge=0.0, le=1.0)
    depends_on: Tuple[str, ...] = Field(default_factory=tuple, max_length=20)

    @field_validator(
        "item_values", "work_goals", "operation_intents", "depends_on"
    )
    @classmethod
    def canonical_tuple_values(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        normalized = tuple(
            sorted(set(values), key=lambda value: (value.casefold(), value))
        )
        if values != normalized:
            raise ValueError("semantic edit tuple values must be sorted and unique")
        return values

    @model_validator(mode="after")
    def exactly_one_typed_value(self) -> "ScopeSemanticFieldEditV1":
        allowed_operations = {
            "objective": {"replace"},
            "problem": {"replace"},
            "desired_outcome": {"replace"},
            "document_intent": {"replace"},
            "evidence_preference": {"replace"},
            "deliverable_title_prefix": {"replace", "clear"},
            "audiences": {"replace", "add", "remove", "clear"},
            "non_goals": {"replace", "add", "remove", "clear"},
            "geographies": {"replace", "add", "remove", "clear"},
            "channels": {"replace", "add", "remove", "clear"},
            "success_criteria": {"replace", "add", "remove", "clear"},
            "deliverable_sections": {"replace", "add", "remove", "clear"},
            "role_requirements": {"replace", "add", "remove", "clear"},
            "work_goals": {"replace", "add", "remove", "clear"},
            "operation_intents": {"replace", "add", "remove", "clear"},
        }
        if self.operation not in allowed_operations[self.field]:
            raise ValueError(
                f"{self.field} does not support semantic operation {self.operation}"
            )
        populated = {
            "text": self.text_value is not None,
            "items": bool(self.item_values),
            "document": self.document_intent is not None,
            "evidence": self.evidence_preference is not None,
            "work": bool(self.work_goals),
            "operation": bool(self.operation_intents),
        }
        expected = {
            "objective": "text",
            "problem": "text",
            "desired_outcome": "text",
            "deliverable_title_prefix": "text",
            "audiences": "items",
            "non_goals": "items",
            "geographies": "items",
            "channels": "items",
            "success_criteria": "items",
            "deliverable_sections": "items",
            "role_requirements": "items",
            "document_intent": "document",
            "evidence_preference": "evidence",
            "work_goals": "work",
            "operation_intents": "operation",
        }[self.field]
        if self.operation == "clear":
            if any(populated.values()):
                raise ValueError("clear semantic edits cannot carry a value")
        elif populated[expected] is not True or sum(populated.values()) != 1:
            raise ValueError(
                f"{self.field} semantic edit requires only its typed value"
            )
        if self.operation == "remove" and self.field in {
            "objective",
            "problem",
            "desired_outcome",
            "document_intent",
        }:
            raise ValueError(f"{self.field} cannot be removed without replacement")
        return self


class ScopeSemanticAmbiguityV1(ImmutableScopeContractModel):
    ambiguity_id: str = Field(..., pattern=r"^amb-[a-f0-9]{16}$")
    field: Optional[ScopeSemanticFieldV1] = None
    reason: str = Field(..., min_length=3, max_length=1000)
    material_question: str = Field(..., min_length=3, max_length=1000)
    source_span: ScopeSourceSpanV1


class ScopeSemanticDeltaV1(ImmutableScopeContractModel):
    """Native structured model output before server-owned provenance wrapping."""

    edits: Tuple[ScopeSemanticFieldEditV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    ambiguities: Tuple[ScopeSemanticAmbiguityV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )

    @model_validator(mode="after")
    def canonical_graph(self) -> "ScopeSemanticDeltaV1":
        edit_ids = tuple(edit.edit_id for edit in self.edits)
        ambiguity_ids = tuple(item.ambiguity_id for item in self.ambiguities)
        expected_edit_ids = tuple(
            f"edit-{ordinal:016x}" for ordinal in range(1, len(edit_ids) + 1)
        )
        expected_ambiguity_ids = tuple(
            f"amb-{ordinal:016x}" for ordinal in range(1, len(ambiguity_ids) + 1)
        )
        if edit_ids != expected_edit_ids:
            raise ValueError("semantic edits must have canonical ordinal edit IDs")
        if ambiguity_ids != expected_ambiguity_ids:
            raise ValueError("semantic ambiguities must have canonical ordinal IDs")
        known = set(edit_ids)
        dependencies: dict[str, set[str]] = {}
        for edit in self.edits:
            if edit.edit_id in edit.depends_on or set(edit.depends_on) - known:
                raise ValueError("semantic edit dependencies must reference other edits")
            dependencies[edit.edit_id] = set(edit.depends_on)

        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(edit_id: str) -> None:
            if edit_id in visiting:
                raise ValueError("semantic edit dependencies must be acyclic")
            if edit_id in visited:
                return
            visiting.add(edit_id)
            for dependency in dependencies[edit_id]:
                visit(dependency)
            visiting.remove(edit_id)
            visited.add(edit_id)

        for edit_id in edit_ids:
            visit(edit_id)
        return self


class ScopeCorrectionInterpretationV1(ImmutableScopeContractModel):
    """Server wrapper sealing one model parse to exact code/model contracts."""

    version: Literal["axwise_scope_correction_interpretation_v1"] = (
        "axwise_scope_correction_interpretation_v1"
    )
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    source_scope_generation: int = Field(..., ge=0)
    correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    parser_version: str = Field(..., min_length=1, max_length=120)
    parser_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    model_resource: Literal["models/gemini-3.7-flash"] = "models/gemini-3.7-flash"
    model_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    prompt_version: str = Field(..., min_length=1, max_length=120)
    prompt_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    schema_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    delta: ScopeSemanticDeltaV1
    delta_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_delta_hash(delta: ScopeSemanticDeltaV1) -> str:
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(delta.model_dump(mode="json"))

    @model_validator(mode="after")
    def validate_delta_hash(self) -> "ScopeCorrectionInterpretationV1":
        if self.delta_hash != self.canonical_delta_hash(self.delta):
            raise ValueError("delta_hash does not match the structured semantic delta")
        return self


class ScopeAuthoritySnapshotV1(ImmutableScopeContractModel):
    """Authority/security surface corrections may preserve or narrow, never expand."""

    version: Literal["axwise_scope_authority_snapshot_v1"] = (
        "axwise_scope_authority_snapshot_v1"
    )
    required_tools: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    denied_tools: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    denied_agent_ids: Tuple[str, ...] = Field(
        default_factory=tuple,
        max_length=100,
        exclude_if=lambda value: not value,
    )
    approval_actions: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    guardrails: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    allowed_data_classifications: Tuple[str, ...] = Field(
        default_factory=tuple,
        max_length=10,
    )
    task_data_classification: str = Field(..., min_length=1, max_length=40)
    task_risk_level: str = Field(..., min_length=1, max_length=40)
    task_reversibility: str = Field(..., min_length=1, max_length=40)
    task_domain: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
        exclude_if=lambda value: value is None,
    )
    task_class: Optional[str] = Field(
        default=None,
        max_length=120,
        exclude_if=lambda value: value is None,
    )
    task_capability_profile: Optional[str] = Field(
        default=None,
        max_length=120,
        exclude_if=lambda value: value is None,
    )
    task_preferred_capabilities: Tuple[str, ...] = Field(
        default_factory=tuple,
        max_length=100,
        exclude_if=lambda value: not value,
    )
    task_constraints: Tuple[str, ...] = Field(
        default_factory=tuple,
        max_length=100,
        exclude_if=lambda value: not value,
    )
    task_context_reference_hashes: Tuple[str, ...] = Field(
        default_factory=tuple,
        max_length=100,
        exclude_if=lambda value: not value,
    )
    task_urgency: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=40,
        exclude_if=lambda value: value is None,
    )
    task_deadline: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=80,
        exclude_if=lambda value: value is None,
    )
    maximum_risk_without_human: str = Field(
        default="medium",
        min_length=1,
        max_length=40,
        exclude_if=lambda value: value == "medium",
    )
    budget_currency: str = Field(
        default="EUR",
        min_length=3,
        max_length=3,
        exclude_if=lambda value: value == "EUR",
    )
    budget_maximum_cost: Optional[float] = Field(
        default=None,
        ge=0.0,
        exclude_if=lambda value: value is None,
    )
    budget_maximum_latency_ms: Optional[int] = Field(
        default=None,
        ge=1,
        exclude_if=lambda value: value is None,
    )
    research_allow_hybrid: bool = Field(
        default=False,
        exclude_if=lambda value: value is False,
    )
    research_fail_closed: bool = Field(
        default=True,
        exclude_if=lambda value: value is True,
    )
    research_allowed_source_types: Optional[Tuple[str, ...]] = Field(
        default=None,
        min_length=1,
        max_length=20,
        exclude_if=lambda value: value is None,
    )
    research_maximum_cost: Optional[float] = Field(
        default=None,
        ge=0.0,
        exclude_if=lambda value: value is None,
    )
    research_maximum_latency_ms: Optional[int] = Field(
        default=None,
        ge=1,
        exclude_if=lambda value: value is None,
    )
    research_maximum_iterations: int = Field(
        default=0,
        ge=0,
        le=3,
        exclude_if=lambda value: value == 0,
    )
    research_maximum_evidence_items: int = Field(
        default=25,
        ge=1,
        le=100,
        exclude_if=lambda value: value == 25,
    )
    research_minimum_evidence_sufficiency: float = Field(
        default=0.65,
        ge=0.0,
        le=1.0,
        exclude_if=lambda value: value == 0.65,
    )
    research_minimum_value_of_information: float = Field(
        default=0.35,
        ge=0.0,
        le=1.0,
        exclude_if=lambda value: value == 0.35,
    )
    research_minimum_evidence_quality: float = Field(
        default=0.55,
        ge=0.0,
        le=1.0,
        exclude_if=lambda value: value == 0.55,
    )
    executor_role_cap: Literal[8] = Field(
        default=8,
        exclude_if=lambda value: value == 8,
    )

    @field_validator(
        "required_tools",
        "denied_tools",
        "denied_agent_ids",
        "approval_actions",
        "guardrails",
        "allowed_data_classifications",
    )
    @classmethod
    def canonical_authority_values(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        canonical = tuple(
            sorted(set(values), key=lambda value: (value.casefold(), value))
        )
        if values != canonical:
            raise ValueError("authority snapshot values must be sorted and unique")
        return values

    @field_validator("research_allowed_source_types")
    @classmethod
    def canonical_optional_authority_values(
        cls, values: Optional[Tuple[str, ...]]
    ) -> Optional[Tuple[str, ...]]:
        if values is None:
            return None
        canonical = tuple(
            sorted(set(values), key=lambda value: (value.casefold(), value))
        )
        if values != canonical:
            raise ValueError("authority snapshot values must be sorted and unique")
        return values

    @field_validator("budget_currency")
    @classmethod
    def canonical_budget_currency(cls, value: str) -> str:
        if value != value.upper():
            raise ValueError("budget currency must be uppercase")
        return value


class ScopePacketV1(ScopeContractModel):
    version: Literal["axwise_scope_packet_v1"] = SCOPE_PACKET_VERSION
    scope_ref: str = Field(..., min_length=1, max_length=255)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    generation: int = Field(default=0, ge=0, exclude_if=lambda value: value == 0)
    source_scope_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
        exclude_if=lambda value: value is None,
    )
    correction_interpretation: Optional[ScopeCorrectionInterpretationV1] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    intent: ScopeIntentV1
    deliverable: ScopeDeliverableSeedV1
    # Optional so persisted pre-admission v1 packets keep their original hash.
    # New packets built by the service always populate this field.
    admission: Optional[ScopeAdmissionV1] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    # Optional only so immutable pre-contract packets can still be inspected.
    # Every newly-built packet contains this field and validation fails closed
    # before research when it is absent.
    research_contract: Optional[ScopeResearchContractV1] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    authority_snapshot: Optional[ScopeAuthoritySnapshotV1] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    ledger: ScopeLedgerV1
    runtime: TrustedRuntimeMetadataV1
    truth_policy: TruthPolicyV1 = Field(default_factory=TruthPolicyV1)
    quality_contract: QualityContractV1 = Field(default_factory=QualityContractV1)
    document_status: Literal["Draft", "Ready for review"]

    @staticmethod
    def canonical_hash_for(payload: dict) -> str:
        value = dict(payload)
        value.pop("scope_hash", None)
        # ``admission`` was added additively to v1.  Its absence and an
        # explicit null are equivalent for legacy packet verification.
        if value.get("admission") is None:
            value.pop("admission", None)
        if value.get("research_contract") is None:
            value.pop("research_contract", None)
        if value.get("authority_snapshot") is None:
            value.pop("authority_snapshot", None)
        if value.get("generation", 0) == 0:
            value.pop("generation", None)
        if value.get("source_scope_hash") is None:
            value.pop("source_scope_hash", None)
        if value.get("correction_interpretation") is None:
            value.pop("correction_interpretation", None)
        # Scope packets cross the Python/TypeScript boundary.  In particular,
        # authority costs and semantic confidence values can be integral
        # floats, which Python renders as ``25.0`` while JSON.stringify renders
        # them as ``25``.  Reuse the shared ECMAScript-compatible serializer so
        # both runtimes seal the same bytes.
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(value)

    @model_validator(mode="after")
    def validate_integrity(self) -> "ScopePacketV1":
        ledger = self.ledger
        if self.generation == 0:
            if (
                self.source_scope_hash is not None
                or self.correction_interpretation is not None
            ):
                raise ValueError(
                    "initial scope packets cannot carry correction provenance"
                )
        else:
            interpretation = self.correction_interpretation
            if self.source_scope_hash is None or interpretation is None:
                raise ValueError(
                    "corrected scope packets require exact correction provenance"
                )
            if interpretation.source_scope_hash != self.source_scope_hash:
                raise ValueError("correction provenance source hash is inconsistent")
            if interpretation.source_scope_generation != self.generation - 1:
                raise ValueError("scope generation must advance exactly once")
        if self.admission is not None and (
            not self.admission.work_types or not self.admission.success_criteria
        ):
            raise ValueError(
                "populated scope admission requires work_types and success_criteria"
            )
        if self.research_contract is not None and self.admission is not None:
            if list(self.research_contract.work_types) != self.admission.work_types:
                raise ValueError(
                    "research contract work_types must equal scope admission work_types"
                )
            if list(self.research_contract.geographies) != self.admission.geographies:
                raise ValueError(
                    "research contract geographies must equal scope admission geographies"
                )
        for values, label in (
            ([item.requirement_id for item in ledger.requirements], "requirement"),
            ([item.fact_id for item in ledger.facts], "fact"),
            ([item.assumption_id for item in ledger.assumptions], "assumption"),
            ([item.decision_id for item in ledger.decisions], "decision"),
            ([item.constraint_id for item in ledger.constraints], "constraint"),
            ([item.acceptance_id for item in ledger.acceptance], "acceptance"),
        ):
            if len(values) != len(set(values)):
                raise ValueError(f"{label} IDs must be unique")

        expected_ids = {
            "requirement": [
                _semantic_id(
                    "req",
                    {"text": _semantic_text(item.text).lower()},
                )
                for item in ledger.requirements
            ],
            "fact": [
                _semantic_id(
                    "fact",
                    {
                        "claim": _semantic_text(item.claim).lower(),
                        "source_refs": sorted(item.source_refs),
                        "source_authority_ids": sorted(item.source_authority_ids),
                    },
                )
                for item in ledger.facts
            ],
            "assumption": [
                _semantic_id(
                    "asm",
                    {
                        "text": _semantic_text(item.text).lower(),
                        "materiality": item.materiality,
                    },
                )
                for item in ledger.assumptions
            ],
            "decision": [
                _semantic_id(
                    "dec",
                    {
                        "question": _semantic_text(item.question).lower(),
                        "materiality": item.materiality,
                    },
                )
                for item in ledger.decisions
            ],
            "constraint": [
                _semantic_id(
                    "con",
                    {
                        "text": _semantic_text(item.text).lower(),
                        "kind": item.kind,
                        "authority": item.authority,
                    },
                )
                for item in ledger.constraints
            ],
            "acceptance": [
                _semantic_id(
                    "acc",
                    item.model_dump(mode="json", exclude={"acceptance_id"}),
                )
                for item in ledger.acceptance
            ],
        }
        actual_ids = {
            "requirement": [item.requirement_id for item in ledger.requirements],
            "fact": [item.fact_id for item in ledger.facts],
            "assumption": [item.assumption_id for item in ledger.assumptions],
            "decision": [item.decision_id for item in ledger.decisions],
            "constraint": [item.constraint_id for item in ledger.constraints],
            "acceptance": [item.acceptance_id for item in ledger.acceptance],
        }
        for label, expected in expected_ids.items():
            if actual_ids[label] != expected or expected != sorted(expected):
                raise ValueError(f"{label} IDs are not canonical and deterministically ordered")

        fact_claims = {_semantic_text(item.claim).casefold() for item in ledger.facts}
        assumption_claims = {
            _semantic_text(item.text).casefold() for item in ledger.assumptions
        }
        if fact_claims.intersection(assumption_claims):
            raise ValueError("the same claim cannot be both a fact and an assumption")

        requirement_ids = {item.requirement_id for item in ledger.requirements}
        covered: set[str] = set()
        for acceptance in ledger.acceptance:
            unknown = set(acceptance.supports) - requirement_ids
            if unknown:
                raise ValueError(
                    "acceptance criteria reference unknown requirements: "
                    + ", ".join(sorted(unknown))
                )
            covered.update(acceptance.supports)
        if covered != requirement_ids:
            missing = requirement_ids - covered
            raise ValueError(
                "every requirement must be linked to acceptance criteria: "
                + ", ".join(sorted(missing))
            )

        unresolved = any(
            item.status in {"open", "proposed"} for item in ledger.decisions
        )
        expected_status = "Draft" if unresolved else "Ready for review"
        if self.document_status != expected_status:
            raise ValueError(
                f"document_status must be {expected_status!r} for the decision ledger"
            )

        expected_sources = [
            "backend.services.llm.gemini_runtime",
            "backend.services.llm.config.genai_config",
            "backend.infrastructure.data.config.MODEL_CAPABILITIES",
        ]
        if self.runtime.configuration_sources != expected_sources:
            raise ValueError("trusted runtime configuration sources are not canonical")

        expected_hash = self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"scope_hash"})
        )
        if self.scope_hash != expected_hash:
            raise ValueError("scope_hash does not match the canonical packet")
        return self


class ScopeQualityCheckV1(ScopeContractModel):
    check_id: str = Field(..., min_length=1, max_length=120)
    passed: bool
    blocking: bool = True
    message: str = Field(..., min_length=3, max_length=1000)


class ScopeValidationReportV1(ScopeContractModel):
    version: Literal["axwise_scope_validation_v1"] = "axwise_scope_validation_v1"
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    valid: bool
    ready_for_synthesis: bool
    checks: List[ScopeQualityCheckV1] = Field(..., min_length=1, max_length=20)
    requirement_count: int = Field(ge=1)
    acceptance_count: int = Field(ge=1)
    unresolved_decision_count: int = Field(ge=0)


class ScopeConfirmationV1(ScopeContractModel):
    status: Literal["proceed_or_edit", "needs_material_input"]
    message: str = Field(..., min_length=3, max_length=1200)
    primary_action: Literal["proceed", "answer"]
    secondary_action: Literal["edit scope"] = "edit scope"
    material_question: Optional[str] = Field(default=None, max_length=4000)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    authorizes_external_actions: Literal[False] = False


class ScopeProposalCorrectionRequestV1(ImmutableScopeContractModel):
    """Compact public request to revise one immutable Gate-1 proposal."""

    version: Literal["orqaly_scope_proposal_correction_v1"] = (
        "orqaly_scope_proposal_correction_v1"
    )
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_generation: int = Field(..., ge=0)
    correction_text: str = Field(..., min_length=1, max_length=8000)
    correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_correction_hash(correction_text: str) -> str:
        return hashlib.sha256(correction_text.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_correction(self) -> "ScopeProposalCorrectionRequestV1":
        if not self.correction_text.strip():
            raise ValueError("correction_text cannot be blank")
        if self.correction_hash != self.canonical_correction_hash(
            self.correction_text
        ):
            raise ValueError("correction_hash does not match correction_text")
        return self


class ScopeClarificationResolutionContextV1(ImmutableScopeContractModel):
    """Compact private binding for resolving one stored clarification.

    The child request deliberately does not retain the parent's raw correction
    or full interpretation.  The material clarification identity binds this
    compact envelope to those durable parent records without making either
    payload available to the child model request.
    """

    version: Literal["axwise_scope_clarification_context_v1"] = (
        "axwise_scope_clarification_context_v1"
    )
    parent_correction_id: str = Field(
        ..., pattern=r"^scope-correction-[a-f0-9]{32}$"
    )
    clarification_id: str = Field(
        ..., pattern=r"^scope-clarification-[a-f0-9]{32}$"
    )
    clarification_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    reason_code: Literal[
        "ambiguous",
        "contradictory",
        "unsupported",
        "dependency_invalidated",
        "low_confidence",
    ]
    question: str = Field(..., min_length=3, max_length=1200)
    fields: Tuple[ScopeSemanticFieldV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    source_scope_generation: int = Field(..., ge=0)
    original_correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    answer_text: str = Field(..., min_length=1, max_length=8000)
    answer_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @field_validator("fields")
    @classmethod
    def canonical_fields(
        cls,
        values: Tuple[ScopeSemanticFieldV1, ...],
    ) -> Tuple[ScopeSemanticFieldV1, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("clarification fields must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_resolution_context(self) -> "ScopeClarificationResolutionContextV1":
        if self.answer_hash != hashlib.sha256(
            self.answer_text.encode("utf-8")
        ).hexdigest():
            raise ValueError("clarification answer hash is invalid")
        clarification_payload = {
            "version": "axwise_scope_material_clarification_v1",
            "reason_code": self.reason_code,
            "question": self.question,
            "fields": self.fields,
            "source_scope_hash": self.source_scope_hash,
            "correction_hash": self.original_correction_hash,
        }
        from backend.services.orqaly_research_bundle_service import canonical_hash

        expected_hash = canonical_hash(clarification_payload)
        expected_id = "scope-clarification-" + expected_hash[:32]
        if (
            self.clarification_hash != expected_hash
            or self.clarification_id != expected_id
        ):
            raise ValueError("clarification resolution identity is invalid")
        return self


class ScopeClarificationAnswerRequestV1(ImmutableScopeContractModel):
    """Owner answer bound to one exact durable clarification."""

    version: Literal["orqaly_scope_clarification_answer_v1"] = (
        "orqaly_scope_clarification_answer_v1"
    )
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    parent_correction_id: str = Field(
        ..., pattern=r"^scope-correction-[a-f0-9]{32}$"
    )
    clarification_id: str = Field(
        ..., pattern=r"^scope-clarification-[a-f0-9]{32}$"
    )
    clarification_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    answer_text: str = Field(..., min_length=1, max_length=8000)
    answer_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_answer(self) -> "ScopeClarificationAnswerRequestV1":
        if not self.answer_text.strip():
            raise ValueError("answer_text cannot be blank")
        if self.answer_hash != hashlib.sha256(
            self.answer_text.encode("utf-8")
        ).hexdigest():
            raise ValueError("answer_hash does not match answer_text")
        return self


class ScopeCorrectionRequestV1(ScopeContractModel):
    """Raw owner correction bound to one immutable tenant/task decision snapshot."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=False,
    )

    version: Literal["axwise_scope_correction_request_v1"] = (
        "axwise_scope_correction_request_v1"
    )
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    upstream_decision_id: str = Field(..., min_length=1, max_length=255)
    source_correction_id: Optional[str] = Field(
        default=None,
        pattern=r"^scope-correction-[a-f0-9]{32}$",
    )
    source_proposal_decision_id: Optional[str] = Field(
        default=None, min_length=1, max_length=255
    )
    source_proposal_hash: Optional[str] = Field(
        default=None, pattern=r"^[a-f0-9]{64}$"
    )
    source_scope_packet: ScopePacketV1
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    source_scope_generation: int = Field(..., ge=0)
    correction_text: str = Field(..., min_length=1, max_length=8000)
    correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    clarification_context: Optional[ScopeClarificationResolutionContextV1] = None

    @field_validator("org_id", "user_id", "task_id", "upstream_decision_id")
    @classmethod
    def exact_binding_strings(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("scope correction binding IDs cannot contain outer whitespace")
        return value

    @staticmethod
    def canonical_correction_hash(correction_text: str) -> str:
        return hashlib.sha256(correction_text.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_exact_source(self) -> "ScopeCorrectionRequestV1":
        if not self.correction_text.strip():
            raise ValueError("correction_text cannot be blank")
        if self.source_scope_packet.scope_ref != self.task_id:
            raise ValueError("source scope belongs to a different task")
        if self.source_scope_packet.scope_hash != self.source_scope_hash:
            raise ValueError("source_scope_hash does not match source_scope_packet")
        if self.source_scope_packet.generation != self.source_scope_generation:
            raise ValueError("source scope generation does not match the packet")
        if self.source_scope_generation == 0 and self.source_correction_id is not None:
            raise ValueError("generation-zero scope cannot name a source correction")
        if self.source_scope_generation > 0 and self.source_correction_id is None:
            raise ValueError("corrected source scope requires source_correction_id")
        if bool(self.source_proposal_decision_id) != bool(self.source_proposal_hash):
            raise ValueError("source proposal identity must be supplied atomically")
        if self.correction_hash != self.canonical_correction_hash(
            self.correction_text
        ):
            raise ValueError("correction_hash does not match correction_text")
        context = self.clarification_context
        if context is not None and (
            context.answer_text != self.correction_text
            or context.answer_hash != self.correction_hash
            or context.source_scope_hash != self.source_scope_hash
            or context.source_scope_generation != self.source_scope_generation
        ):
            raise ValueError("clarification resolution context is inconsistent")
        return self


class ScopeMaterialClarificationV1(ImmutableScopeContractModel):
    version: Literal["axwise_scope_material_clarification_v1"] = (
        "axwise_scope_material_clarification_v1"
    )
    reason_code: Literal[
        "ambiguous",
        "contradictory",
        "unsupported",
        "dependency_invalidated",
        "low_confidence",
    ]
    question: str = Field(..., min_length=3, max_length=1200)
    fields: Tuple[ScopeSemanticFieldV1, ...] = Field(
        default_factory=tuple,
        max_length=20,
    )
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    clarification_id: str = Field(
        ..., pattern=r"^scope-clarification-[a-f0-9]{32}$"
    )
    clarification_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("clarification_id", None)
        value.pop("clarification_hash", None)
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(value)

    @model_validator(mode="after")
    def validate_clarification_identity(self) -> "ScopeMaterialClarificationV1":
        payload = self.model_dump(
            mode="json", exclude={"clarification_id", "clarification_hash"}
        )
        expected_hash = self.canonical_hash_for(payload)
        expected_id = "scope-clarification-" + expected_hash[:32]
        if (
            self.clarification_hash != expected_hash
            or self.clarification_id != expected_id
        ):
            raise ValueError("material clarification identity is invalid")
        return self


class ScopeCorrectionResearchDisclosureV1(ImmutableScopeContractModel):
    version: Literal["axwise_scope_correction_research_disclosure_v1"] = (
        "axwise_scope_correction_research_disclosure_v1"
    )
    acquisition_mode: Literal["none", "synthetic", "grounded"]
    research_required: bool
    grounding_required: bool
    external_sources_required: bool
    required_outputs: Tuple[str, ...] = Field(default_factory=tuple, max_length=20)
    geographies: Tuple[str, ...] = Field(default_factory=tuple, max_length=64)
    executor_roles: Tuple[str, ...] = Field(default_factory=tuple, max_length=20)
    currency: str = Field(..., min_length=3, max_length=3)
    maximum_research_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_research_cost: Optional[float] = Field(default=None, ge=0.0)
    maximum_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    estimated_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    maximum_research_iterations: int = Field(default=0, ge=0, le=3)
    maximum_evidence_items: int = Field(default=25, ge=1, le=100)
    provider: Literal["google"] = "google"
    model_resource: Literal["models/gemini-3.7-flash"] = (
        "models/gemini-3.7-flash"
    )
    thinking_level: Literal["HIGH"] = "HIGH"

    @model_validator(mode="after")
    def validate_research_boundary(self) -> "ScopeCorrectionResearchDisclosureV1":
        expected_required = self.acquisition_mode != "none"
        if self.research_required != expected_required:
            raise ValueError("research_required contradicts acquisition_mode")
        if self.acquisition_mode == "grounded" and (
            not self.grounding_required
            or not self.external_sources_required
            or not self.geographies
        ):
            raise ValueError("grounded disclosure requires sources and geographies")
        if self.acquisition_mode != "grounded" and (
            self.grounding_required or self.external_sources_required
        ):
            raise ValueError("non-grounded disclosure cannot require external grounding")
        return self


class ScopeCorrectionProposalV1(ImmutableScopeContractModel):
    """Correction provenance around the unified Gate-1 proposal companion."""

    version: Literal["axwise_scope_correction_proposal_v1"] = (
        "axwise_scope_correction_proposal_v1"
    )
    correction_id: str = Field(..., pattern=r"^scope-correction-[a-f0-9]{32}$")
    upstream_decision_id: str = Field(..., min_length=1, max_length=255)
    scope_proposal: ScopeProposalBindingV1

    @property
    def proposal_id(self) -> str:
        return self.scope_proposal.proposal_decision_id

    @property
    def scope_hash(self) -> str:
        return self.scope_proposal.scope_hash

    @property
    def contract_hash(self) -> str:
        return self.scope_proposal.contract_hash

    @property
    def research_execution_inputs_hash(self) -> Optional[str]:
        return self.scope_proposal.research_execution_inputs_hash

    @property
    def proposal_hash(self) -> str:
        return self.scope_proposal.proposal_hash

    @model_validator(mode="after")
    def validate_proposal(self) -> "ScopeCorrectionProposalV1":
        if (
            self.scope_proposal.correction_id != self.correction_id
            or self.scope_proposal.parent_decision_id != self.upstream_decision_id
        ):
            raise ValueError("scope correction proposal companion is inconsistent")
        return self


class ScopeCorrectionCompilationV1(ImmutableScopeContractModel):
    version: Literal["axwise_scope_correction_compilation_v1"] = (
        "axwise_scope_correction_compilation_v1"
    )
    status: Literal["compiled", "needs_material_clarification"]
    compiler_version: str = Field(..., min_length=1, max_length=120)
    compiler_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    interpretation: ScopeCorrectionInterpretationV1
    scope_packet: Optional[ScopePacketV1] = None
    scope_validation: Optional[ScopeValidationReportV1] = None
    scope_confirmation: Optional[ScopeConfirmationV1] = None
    scope_contract_binding: Optional[ScopeContractBindingV1] = None
    quality_contract: Optional[QualityContractV1] = None
    proposal: Optional[ScopeCorrectionProposalV1] = None
    clarification: Optional[ScopeMaterialClarificationV1] = None

    @model_validator(mode="after")
    def exactly_one_result(self) -> "ScopeCorrectionCompilationV1":
        companions = (
            self.scope_validation,
            self.scope_confirmation,
            self.scope_contract_binding,
            self.quality_contract,
            self.proposal,
        )
        if self.status == "compiled" and (
            self.scope_packet is None
            or self.clarification is not None
            or any(item is None for item in companions)
        ):
            raise ValueError(
                "compiled corrections require a packet and all canonical companions"
            )
        if self.status == "needs_material_clarification" and (
            self.clarification is None
            or self.scope_packet is not None
            or any(item is not None for item in companions)
        ):
            raise ValueError(
                "blocked corrections require only one material clarification"
            )
        if self.scope_packet is not None:
            packet = self.scope_packet
            if (
                self.scope_validation.scope_hash != packet.scope_hash
                or not self.scope_validation.valid
                or self.scope_confirmation.scope_hash != packet.scope_hash
                or self.scope_contract_binding.scope_hash != packet.scope_hash
                or self.scope_contract_binding.contract_hash
                != packet.research_contract.contract_hash
                or self.quality_contract != packet.quality_contract
                or self.proposal.scope_hash != packet.scope_hash
                or self.proposal.contract_hash
                != packet.research_contract.contract_hash
            ):
                raise ValueError(
                    "compiled correction companions do not match the scope packet"
                )
        return self


class ScopeCorrectionAcceptanceV1(ImmutableScopeContractModel):
    version: Literal["axwise_scope_correction_acceptance_v1"] = (
        "axwise_scope_correction_acceptance_v1"
    )
    correction_id: str = Field(..., pattern=r"^scope-correction-[a-f0-9]{32}$")
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    upstream_decision_id: str = Field(..., min_length=1, max_length=255)
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    result_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    delta_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    proposal_id: str = Field(..., pattern=r"^scope-proposal-[a-f0-9]{32}$")
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    research_execution_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("acceptance_hash", None)
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_hash(self) -> "ScopeCorrectionAcceptanceV1":
        if self.acceptance_hash != self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"acceptance_hash"})
        ):
            raise ValueError("correction acceptance hash is invalid")
        return self


ScopeContinuationPurposeV1 = Literal[
    "planning",
    "assignment",
    "research",
    "synthesis",
    "execution",
]


_DURABLE_REFERENCE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$"


class ScopeResearchConsumerPayloadV1(ImmutableScopeContractModel):
    """Research consumes only AxWise's sealed proposal snapshot."""


class ScopeResearchCompletionRefV1(ImmutableScopeContractModel):
    """AxWise-minted proof of one usable, scope-bound research result."""

    version: Literal["axwise_scope_research_completion_ref_v1"] = (
        "axwise_scope_research_completion_ref_v1"
    )
    completion_id: str = Field(..., pattern=r"^scope-research-[a-f0-9]{32}$")
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    acceptance_id: str = Field(..., pattern=r"^scope-acceptance-[a-f0-9]{32}$")
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    research_decision_id: str = Field(..., min_length=1, max_length=255)
    result_decision_id: str = Field(..., min_length=1, max_length=255)
    research_job_id: str = Field(..., min_length=1, max_length=255)
    research_status: Literal["completed", "partial"]
    research_continuation_binding_hash: str = Field(
        ...,
        pattern=r"^[a-f0-9]{64}$",
    )
    research_consumer_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    evidence_catalogue_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    evidence_count: int = Field(..., ge=1, le=500)
    completion_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("completion_hash", None)
        return ScopeConsumerInputsV1.canonical_hash_for(value)

    @staticmethod
    def canonical_id_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("completion_id", None)
        value.pop("completion_hash", None)
        return "scope-research-" + ScopeConsumerInputsV1.canonical_hash_for(value)[:32]

    @model_validator(mode="after")
    def validate_completion_seal(self) -> "ScopeResearchCompletionRefV1":
        payload = self.model_dump(mode="json")
        if self.completion_id != self.canonical_id_for(payload):
            raise ValueError("research completion ID is invalid")
        if self.completion_hash != self.canonical_hash_for(payload):
            raise ValueError("research completion hash is invalid")
        return self


class ScopePlanningProjectionRefV1(ImmutableScopeContractModel):
    """Exact prior planning output consumed by staged assignment."""

    version: Literal["axwise_scope_planning_projection_ref_v1"] = (
        "axwise_scope_planning_projection_ref_v1"
    )
    planning_decision_id: str = Field(..., min_length=1, max_length=255)
    planning_continuation_binding_hash: str = Field(
        ...,
        pattern=r"^[a-f0-9]{64}$",
    )
    planning_consumer_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    planning_projection_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")


class ScopePlanningConsumerPayloadV1(ImmutableScopeContractModel):
    """Typed plan and catalogue overlay; both are validated by DecisionCreate."""

    planning: Dict[str, Any]
    catalogue: Dict[str, Any]
    research_completion_ref: Optional[ScopeResearchCompletionRefV1] = None


class ScopeAssignmentConsumerPayloadV1(ImmutableScopeContractModel):
    """Typed agent/tool catalogue overlay for one assignment decision."""

    authority_kind: Literal["planning_projection"]
    catalogue: Dict[str, Any]
    planning_projection_ref: ScopePlanningProjectionRefV1


class ScopeArtifactReferenceV1(ImmutableScopeContractModel):
    """Opaque durable artifact identity; content never crosses this boundary."""

    reference_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    content_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")


class ScopeSynthesisOutputContractV1(ImmutableScopeContractModel):
    """Exact accepted deliverable projection for synthesis."""

    type: str = Field(..., min_length=1, max_length=120)
    count: int = Field(default=1, ge=1, le=20)
    title_prefix: Optional[str] = Field(default=None, max_length=255)
    required_sections: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    presentation: Literal[
        "markdown_artifact",
        "structured_data",
        "chat_response",
        "mixed",
    ] = "markdown_artifact"

    @field_validator("required_sections")
    @classmethod
    def unique_required_sections(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        cleaned = tuple(_unique_strings(list(values)))
        if cleaned != values:
            raise ValueError("required_sections must be normalized and unique")
        return values


class ScopeSynthesisConsumerPayloadV1(ImmutableScopeContractModel):
    """Artifact-only synthesis preflight with no prompt or inline content."""

    artifact_refs: Tuple[ScopeArtifactReferenceV1, ...] = Field(
        ...,
        min_length=1,
        max_length=200,
    )
    output_contract: ScopeSynthesisOutputContractV1

    @model_validator(mode="after")
    def unique_artifact_references(self) -> "ScopeSynthesisConsumerPayloadV1":
        identities = [item.reference_id for item in self.artifact_refs]
        if len(identities) != len(set(identities)):
            raise ValueError("artifact_refs must have unique reference_id values")
        return self


class ScopeExecutionInputReferenceV1(ImmutableScopeContractModel):
    """Bounded typed input identity; raw values and free-form prompts are forbidden."""

    reference_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    reference_type: Literal[
        "artifact",
        "research_bundle",
        "task_output",
        "document",
        "structured_input",
    ]
    content_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")


class ScopeExecutionActionInputV1(ImmutableScopeContractModel):
    """One exact Orqaly child-work manifest admitted for Gate-2 preflight."""

    action_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    task_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    job_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    agent_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
    )
    team_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
        exclude_if=lambda value: value is None,
    )
    concilium_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
        exclude_if=lambda value: value is None,
    )
    workflow_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
        exclude_if=lambda value: value is None,
    )
    workflow_execution_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=_DURABLE_REFERENCE_PATTERN,
        exclude_if=lambda value: value is None,
    )
    input_refs: Tuple[ScopeExecutionInputReferenceV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    tool_grant_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)

    @field_validator("tool_grant_ids")
    @classmethod
    def bounded_unique_tool_grants(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        for value in values:
            if not re.fullmatch(_DURABLE_REFERENCE_PATTERN, value):
                raise ValueError("tool_grant_ids must contain only durable IDs")
        if len(values) != len(set(values)):
            raise ValueError("tool_grant_ids must be unique")
        return values

    @model_validator(mode="after")
    def unique_input_references(self) -> "ScopeExecutionActionInputV1":
        identities = [item.reference_id for item in self.input_refs]
        if len(identities) != len(set(identities)):
            raise ValueError("input_refs must have unique reference_id values")
        return self


class ScopeExecutionConsumerPayloadV1(ImmutableScopeContractModel):
    """Non-authorizing action preflight later bound to Orqaly Gate 2."""

    action_inputs: Tuple[ScopeExecutionActionInputV1, ...] = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    @model_validator(mode="after")
    def unique_action_manifests(self) -> "ScopeExecutionConsumerPayloadV1":
        identities = [
            (item.action_id, item.task_id, item.job_id)
            for item in self.action_inputs
        ]
        if len(identities) != len(set(identities)):
            raise ValueError("action_inputs must have unique action/task/job tuples")
        return self


ScopeConsumerPayloadV1 = (
    ScopeResearchConsumerPayloadV1
    | ScopePlanningConsumerPayloadV1
    | ScopeAssignmentConsumerPayloadV1
    | ScopeSynthesisConsumerPayloadV1
    | ScopeExecutionConsumerPayloadV1
)


class ScopeConsumerInputsV1(ImmutableScopeContractModel):
    """Compact commitment to one exact downstream consumer request.

    ``payload`` is a purpose-specific compact delta over AxWise's sealed
    proposal snapshot.  It is never a client reconstruction of the task,
    research brief, policy, budget, or scope packet.
    """

    version: Literal["orqaly_scope_consumer_inputs_v1"] = (
        "orqaly_scope_consumer_inputs_v1"
    )
    purpose: ScopeContinuationPurposeV1
    consumer_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_generation: int = Field(..., ge=0)
    payload: ScopeConsumerPayloadV1 = Field(
        default_factory=ScopeResearchConsumerPayloadV1
    )
    payload_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(payload)

    @property
    def consumer_inputs_hash(self) -> str:
        return self.canonical_hash_for(self.model_dump(mode="json"))

    @model_validator(mode="after")
    def validate_compact_payload(self) -> "ScopeConsumerInputsV1":
        expected_type = {
            "research": ScopeResearchConsumerPayloadV1,
            "planning": ScopePlanningConsumerPayloadV1,
            "assignment": ScopeAssignmentConsumerPayloadV1,
            "synthesis": ScopeSynthesisConsumerPayloadV1,
            "execution": ScopeExecutionConsumerPayloadV1,
        }[self.purpose]
        if not isinstance(self.payload, expected_type):
            raise ValueError("consumer payload does not match its exact purpose schema")
        payload = self.payload.model_dump(mode="json", exclude_none=True)
        if self.payload_hash != self.canonical_hash_for(payload):
            raise ValueError("consumer payload_hash is invalid")
        from backend.services.orqaly_research_bundle_service import canonical_json_string

        if len(canonical_json_string(payload).encode("utf-8")) > 262_144:
            raise ValueError("consumer payload exceeds the compact boundary")
        return self

    @property
    def payload_dict(self) -> Dict[str, Any]:
        return self.payload.model_dump(mode="json", exclude_none=True)


class ScopeContinuationBindingV1(ImmutableScopeContractModel):
    """Single-purpose capability for one exact accepted-scope consumer."""

    version: Literal["axwise_scope_continuation_v1"] = SCOPE_CONTINUATION_VERSION
    org_id: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=255)
    task_id: str = Field(..., min_length=1, max_length=255)
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    acceptance_id: str = Field(..., pattern=r"^scope-acceptance-[a-f0-9]{32}$")
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_generation: int = Field(..., ge=0)
    correction_id: Optional[str] = Field(
        default=None, pattern=r"^scope-correction-[a-f0-9]{32}$"
    )
    purpose: ScopeContinuationPurposeV1
    consumer_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    binding_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("binding_hash", None)
        from backend.services.orqaly_research_bundle_service import canonical_hash

        return canonical_hash(value)

    @model_validator(mode="after")
    def validate_binding_hash(self) -> "ScopeContinuationBindingV1":
        if (self.scope_generation > 0) != bool(self.correction_id):
            raise ValueError("corrected continuation provenance is invalid")
        if self.binding_hash != self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"binding_hash"})
        ):
            raise ValueError("scope continuation binding hash is invalid")
        return self


class ScopeContinuationRequestV1(ScopeContractModel):
    version: Literal["orqaly_scope_continuation_request_v1"] = (
        "orqaly_scope_continuation_request_v1"
    )
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    acceptance_id: str = Field(..., pattern=r"^scope-acceptance-[a-f0-9]{32}$")
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    consumer_inputs: ScopeConsumerInputsV1

    @property
    def purpose(self) -> ScopeContinuationPurposeV1:
        return self.consumer_inputs.purpose


ScopeDecisionStatusV1 = Literal["recommended", "escalated", "pending_research"]
ScopeRoutingModeV1 = Literal[
    "direct",
    "evidence_assisted",
    "research_assisted",
    "human_clarification",
    "sequential",
    "parallel",
    "supervisor",
    "human_controlled",
    "recovery",
]
ScopePlanValidationStatusV1 = Literal["feasible", "rejected", "not_evaluated"]
ScopePlanRejectionCodeV1 = Literal[
    "agent_unavailable",
    "agent_not_owned",
    "agent_not_authorized",
    "tool_unavailable",
    "tool_not_authorized",
    "budget_exceeded",
    "policy_rejected",
    "invalid_plan",
]


class ScopePlanRejectionProjectionV1(ImmutableScopeContractModel):
    code: ScopePlanRejectionCodeV1
    node_id: Optional[str] = Field(default=None, max_length=255)
    agent_id: Optional[str] = Field(default=None, max_length=255)
    tool_id: Optional[str] = Field(default=None, max_length=255)


class ScopePlanBudgetProjectionV1(ImmutableScopeContractModel):
    currency: str = Field(..., min_length=3, max_length=3)
    maximum_cost: Optional[float] = Field(default=None, ge=0.0)
    maximum_latency_ms: Optional[int] = Field(default=None, ge=1)


class ScopePlanFailurePolicyV1(ImmutableScopeContractModel):
    trigger: Literal[
        "transient_failure",
        "agent_unavailable",
        "tool_failure",
        "output_rejected",
        "budget_exceeded",
        "approval_rejected",
    ]
    action: Literal[
        "retry",
        "substitute_agent",
        "request_replan",
        "escalate_to_human",
    ]
    maximum_attempts: int = Field(default=0, ge=0, le=5)


class ScopePlanningNodeProjectionV1(ImmutableScopeContractModel):
    """Operational plan node Orqaly can materialize without sealed inputs."""

    node_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    assigned_agent_id: str = Field(..., min_length=1, max_length=255)
    required_capabilities: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    tool_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    dependencies: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    input_contract: Dict[str, Any] = Field(..., min_length=1)
    output_contract: Dict[str, Any] = Field(..., min_length=1)
    completion_criteria: Tuple[str, ...] = Field(..., min_length=1, max_length=50)
    approval_gate_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    reviewer_agent_id: Optional[str] = Field(default=None, max_length=255)
    review_rules: Tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    budget: ScopePlanBudgetProjectionV1
    estimated_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_latency_ms: Optional[int] = Field(default=None, ge=0)
    failure_policy: Tuple[ScopePlanFailurePolicyV1, ...] = Field(
        default_factory=tuple,
        max_length=10,
    )

    @model_validator(mode="after")
    def validate_bounded_contracts(self) -> "ScopePlanningNodeProjectionV1":
        encoded = json.dumps(
            {"input": self.input_contract, "output": self.output_contract},
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        if len(encoded) > 32 * 1024:
            raise ValueError("projected node contracts exceed 32 KiB")
        return self


class ScopeAssignmentSelectionV1(ImmutableScopeContractModel):
    """One selected eligible agent without scores or ranking rationale."""

    agent_id: str = Field(..., min_length=1, max_length=255)
    node_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    required_capabilities: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    tool_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=100)
    approval_gate_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=50)


class _ScopeDecisionProjectionBaseV1(ImmutableScopeContractModel):
    version: Literal["axwise_scope_decision_projection_v1"] = (
        "axwise_scope_decision_projection_v1"
    )
    purpose: Literal["planning", "assignment"]
    decision_id: str = Field(..., min_length=1, max_length=255)
    decision_status: ScopeDecisionStatusV1
    routing_mode: ScopeRoutingModeV1
    executable: bool
    validation_status: ScopePlanValidationStatusV1
    validation_rejections: Tuple[ScopePlanRejectionProjectionV1, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    advisory_only: Literal[True] = True
    projection_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @staticmethod
    def canonical_hash_for(payload: dict[str, Any]) -> str:
        value = dict(payload)
        value.pop("projection_hash", None)
        return ScopeConsumerInputsV1.canonical_hash_for(value)

    @model_validator(mode="after")
    def validate_projection_hash(self) -> "_ScopeDecisionProjectionBaseV1":
        if self.validation_status == "rejected":
            if not self.validation_rejections:
                raise ValueError("rejected plan projection requires rejections")
        elif self.validation_rejections:
            raise ValueError("only rejected plan projections expose rejections")
        rejection_keys = [
            (item.code, item.node_id, item.agent_id, item.tool_id)
            for item in self.validation_rejections
        ]
        if len(rejection_keys) != len(set(rejection_keys)):
            raise ValueError("projected plan rejections must be unique")
        expected = self.canonical_hash_for(
            self.model_dump(mode="json", exclude={"projection_hash"})
        )
        if self.projection_hash != expected:
            raise ValueError("scope decision projection hash is invalid")
        if len(
            json.dumps(
                self.model_dump(mode="json"),
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        ) > 128 * 1024:
            raise ValueError("scope decision projection exceeds 128 KiB")
        return self


class ScopePlanningDecisionProjectionV1(_ScopeDecisionProjectionBaseV1):
    purpose: Literal["planning"] = "planning"
    nodes: Tuple[ScopePlanningNodeProjectionV1, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    team_member_ids: Tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    template_mode: Optional[ScopeRoutingModeV1] = None
    total_estimated_cost: Optional[float] = Field(default=None, ge=0.0)
    critical_path_latency_ms: Optional[int] = Field(default=None, ge=0)
    currency: str = Field(..., min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_plan_graph(self) -> "ScopePlanningDecisionProjectionV1":
        node_ids = [node.node_id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("projected plan nodes must be unique")
        known = set(node_ids)
        for node in self.nodes:
            if node.node_id in node.dependencies or not set(node.dependencies).issubset(
                known
            ):
                raise ValueError("projected plan dependency graph is invalid")
        return self


class ScopeAssignmentDecisionProjectionV1(_ScopeDecisionProjectionBaseV1):
    purpose: Literal["assignment"] = "assignment"
    selected_agents: Tuple[ScopeAssignmentSelectionV1, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )

    @model_validator(mode="after")
    def validate_selected_agents(self) -> "ScopeAssignmentDecisionProjectionV1":
        agent_ids = [selection.agent_id for selection in self.selected_agents]
        if len(agent_ids) != len(set(agent_ids)):
            raise ValueError("projected selected agents must be unique")
        return self


ScopePurposeDecisionProjectionV1 = Annotated[
    Union[
        ScopePlanningDecisionProjectionV1,
        ScopeAssignmentDecisionProjectionV1,
    ],
    Field(discriminator="purpose"),
]


class ScopeConsumerDispatchV1(ScopeContractModel):
    """Compact public receipt; private proposal inputs never echo to Orqaly."""

    version: Literal["axwise_scope_consumer_dispatch_v1"] = (
        "axwise_scope_consumer_dispatch_v1"
    )
    receipt_id: str = Field(..., pattern=r"^scope-consumer-[a-f0-9]{32}$")
    proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    acceptance_id: str = Field(..., pattern=r"^scope-acceptance-[a-f0-9]{32}$")
    acceptance_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    purpose: ScopeContinuationPurposeV1
    consumer_inputs_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    continuation: ScopeContinuationBindingV1
    status: Literal[
        "preflight_validated",
        "decision_created",
        "research_dispatched",
    ]
    decision_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    decision_status: Optional[str] = Field(default=None, min_length=1, max_length=80)
    decision_projection: Optional[ScopePurposeDecisionProjectionV1] = None
    research_job_id: Optional[str] = Field(default=None, max_length=255)
    research_job_status: Optional[str] = Field(default=None, max_length=80)
    reused: bool = False

    @staticmethod
    def canonical_receipt_id(payload: dict[str, Any]) -> str:
        return "scope-consumer-" + ScopeConsumerInputsV1.canonical_hash_for(payload)[
            :32
        ]

    @model_validator(mode="after")
    def validate_receipt_shape(self) -> "ScopeConsumerDispatchV1":
        identity = {
            "proposal_decision_id": self.proposal_decision_id,
            "proposal_hash": self.proposal_hash,
            "acceptance_id": self.acceptance_id,
            "acceptance_hash": self.acceptance_hash,
            "scope_hash": self.scope_hash,
            "purpose": self.purpose,
            "consumer_inputs_hash": self.consumer_inputs_hash,
            "continuation_binding_hash": self.continuation.binding_hash,
        }
        if self.receipt_id != self.canonical_receipt_id(identity):
            raise ValueError("scope consumer receipt_id is invalid")
        if self.status == "preflight_validated" and (
            self.purpose not in {"synthesis", "execution"}
            or self.decision_id is not None
            or self.decision_status is not None
            or self.decision_projection is not None
            or self.research_job_id is not None
            or self.research_job_status is not None
        ):
            raise ValueError("preflight receipt cannot claim downstream execution")
        if self.status == "decision_created" and (
            self.purpose not in {"planning", "assignment"}
            or self.decision_id is None
            or self.decision_status is None
            or self.decision_projection is None
            or self.decision_projection.purpose != self.purpose
            or self.decision_projection.decision_id != self.decision_id
            or self.decision_projection.decision_status != self.decision_status
            or self.research_job_id is not None
            or self.research_job_status is not None
        ):
            raise ValueError("decision receipt shape contradicts its purpose")
        if self.status == "research_dispatched" and (
            self.purpose != "research"
            or self.decision_id is None
            or self.decision_status is None
            or self.decision_projection is not None
            or self.research_job_id is None
            or self.research_job_status is None
        ):
            raise ValueError("research receipt requires its bounded job handle")
        return self


class ScopeCorrectionRecordV1(ScopeContractModel):
    """Durable raw submission plus the first successful compiled interpretation."""

    version: Literal["axwise_scope_correction_record_v1"] = (
        "axwise_scope_correction_record_v1"
    )
    correction_id: str = Field(..., pattern=r"^scope-correction-[a-f0-9]{32}$")
    request: ScopeCorrectionRequestV1
    status: Literal[
        "queued",
        "interpreting",
        "failed",
        "proposal_pending",
        "proposal_persisting",
        "proposal_failed",
        "proposal_dead_lettered",
        "compiled",
        "needs_material_clarification",
        "clarification_answered",
        "accepted",
    ]
    compilation: Optional[ScopeCorrectionCompilationV1] = None
    acceptance: Optional[ScopeCorrectionAcceptanceV1] = None
    usage: Optional["ScopeCorrectionUsageV1"] = None
    interpretation_attempt_count: int = Field(default=0, ge=0)
    proposal_attempt_count: int = Field(default=0, ge=0)
    next_retry_at: Optional[datetime] = None
    error_code: Optional[str] = Field(default=None, max_length=120)
    reused: bool = False

    @model_validator(mode="after")
    def validate_state(self) -> "ScopeCorrectionRecordV1":
        if self.status in {
            "proposal_pending",
            "proposal_persisting",
            "proposal_failed",
            "proposal_dead_lettered",
            "compiled",
            "needs_material_clarification",
            "clarification_answered",
            "accepted",
        }:
            if self.compilation is None:
                raise ValueError("terminal correction state requires compilation")
        elif self.compilation is not None:
            raise ValueError("unfinished correction cannot carry compilation")
        if self.status == "accepted":
            if self.acceptance is None or self.compilation is None:
                raise ValueError("accepted correction requires acceptance and compilation")
        elif self.acceptance is not None:
            raise ValueError("only accepted correction can carry acceptance")
        if self.status == "proposal_failed" and self.next_retry_at is None:
            raise ValueError("retryable proposal failure requires next_retry_at")
        if self.status != "proposal_failed" and self.next_retry_at is not None:
            raise ValueError("only retryable proposal failure can carry next_retry_at")
        return self


class ScopeCorrectionUsageV1(ScopeContractModel):
    """Bounded model-only telemetry; never participates in scope authority hashes."""

    version: Literal["axwise_scope_correction_usage_v1"] = (
        "axwise_scope_correction_usage_v1"
    )
    model_resource: Literal["models/gemini-3.7-flash"] = (
        "models/gemini-3.7-flash"
    )
    thinking_level: Literal["HIGH"] = "HIGH"
    requests: int = Field(default=0, ge=0, le=10)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    duration_ms: int = Field(..., ge=0)
    terminal_status: Literal[
        "compiled", "needs_material_clarification", "failed"
    ]
    estimated_cost: Optional[float] = Field(default=None, ge=0.0)

    @model_validator(mode="after")
    def validate_token_total(self) -> "ScopeCorrectionUsageV1":
        if self.total_tokens < self.input_tokens + self.output_tokens:
            raise ValueError("total_tokens cannot be less than input plus output")
        return self


class ScopeCorrectionPollV1(ImmutableScopeContractModel):
    """Compact correction status; the sealed source request never echoes."""

    version: Literal["axwise_scope_correction_poll_v1"] = (
        "axwise_scope_correction_poll_v1"
    )
    correction_id: str = Field(..., pattern=r"^scope-correction-[a-f0-9]{32}$")
    source_proposal_decision_id: str = Field(..., min_length=1, max_length=255)
    source_proposal_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    task_id: str = Field(..., min_length=1, max_length=255)
    source_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    source_scope_generation: int = Field(..., ge=0)
    correction_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    status: Literal[
        "queued",
        "interpreting",
        "failed",
        "proposal_pending",
        "proposal_persisting",
        "proposal_failed",
        "proposal_dead_lettered",
        "compiled",
        "needs_material_clarification",
        "clarification_answered",
    ]
    result_scope_packet: Optional[ScopePacketV1] = None
    result_proposal: Optional[ScopeProposalBindingV1] = None
    clarification: Optional[ScopeMaterialClarificationV1] = None
    usage: Optional[ScopeCorrectionUsageV1] = None
    interpretation_attempt_count: int = Field(default=0, ge=0)
    proposal_attempt_count: int = Field(default=0, ge=0)
    next_retry_at: Optional[datetime] = None
    error_code: Optional[str] = Field(default=None, max_length=120)
    reused: bool = False

    @model_validator(mode="after")
    def validate_projection(self) -> "ScopeCorrectionPollV1":
        compiled = self.status == "compiled"
        if compiled != bool(self.result_scope_packet and self.result_proposal):
            raise ValueError("compiled poll state requires exactly one result proposal")
        if self.status == "needs_material_clarification":
            if self.clarification is None:
                raise ValueError("clarification poll state requires its exact question")
        elif self.clarification is not None:
            raise ValueError("only clarification poll state can expose a question")
        if self.result_scope_packet is not None and (
            self.result_scope_packet.scope_hash != self.result_proposal.scope_hash
            or self.result_scope_packet.generation
            != self.result_proposal.scope_generation
        ):
            raise ValueError("poll proposal does not match its scope packet")
        if self.status == "proposal_failed" and self.next_retry_at is None:
            raise ValueError("retryable proposal failure requires next_retry_at")
        if self.status != "proposal_failed" and self.next_retry_at is not None:
            raise ValueError("only retryable proposal failure can carry next_retry_at")
        return self


__all__ = [
    "SCOPE_ACTIVE_REVISION_STATUSES",
    "canonical_scope_action_id",
    "QualityContractV1",
    "ScopeAcceptanceSeedV1",
    "ScopeAcceptanceV1",
    "ScopeAdmissionV1",
    "ScopeAuthoritySnapshotV1",
    "ScopeArtifactReferenceV1",
    "ScopeAssignmentDecisionProjectionV1",
    "ScopeAssignmentSelectionV1",
    "ScopeAssignmentConsumerPayloadV1",
    "ScopeContinuationBindingV1",
    "ScopeConsumerInputsV1",
    "ScopeConsumerDispatchV1",
    "ScopeExecutionActionInputV1",
    "ScopeExecutionConsumerPayloadV1",
    "ScopeExecutionInputReferenceV1",
    "ScopeContinuationRequestV1",
    "ScopeContractBindingV1",
    "ScopeCorrectionAcceptanceV1",
    "ScopeClarificationAnswerRequestV1",
    "ScopeClarificationResolutionContextV1",
    "ScopeCorrectionCompilationV1",
    "ScopeCorrectionInterpretationV1",
    "ScopeCorrectionPollV1",
    "ScopeCorrectionRecordV1",
    "ScopeCorrectionRequestV1",
    "ScopeCorrectionUsageV1",
    "ScopeDocumentIntentV1",
    "ScopeEvidenceContractV1",
    "ScopeEvidencePreferenceV1",
    "ScopeExecutorRoleSlotV1",
    "ScopeResearchContractV1",
    "ScopeResearchAcceptanceBindingV1",
    "ScopeResearchOutputV1",
    "ScopeAssumptionSeedV1",
    "ScopeAssumptionV1",
    "ScopeConfirmationV1",
    "ScopeConstraintSeedV1",
    "ScopeConstraintV1",
    "ScopeDecisionSeedV1",
    "ScopeDecisionV1",
    "ScopeDeliverableSeedV1",
    "ScopeFactSeedV1",
    "ScopeFactV1",
    "ScopeIntentV1",
    "ScopeLedgerV1",
    "ScopeMaterialClarificationV1",
    "ScopePacketV1",
    "ScopeProposalBindingV1",
    "ScopeProposalCorrectionRequestV1",
    "ScopeProposalDisclosureV1",
    "ScopeProposalAcceptanceRequestV1",
    "ScopeProposalAcceptanceV1",
    "ScopePlanningConsumerPayloadV1",
    "ScopePlanningProjectionRefV1",
    "ScopePlanningDecisionProjectionV1",
    "ScopePlanningNodeProjectionV1",
    "ScopePlanBudgetProjectionV1",
    "ScopePlanFailurePolicyV1",
    "ScopePlanRejectionProjectionV1",
    "ScopePurposeDecisionProjectionV1",
    "ScopeQualityCheckV1",
    "ScopeResearchConsumerPayloadV1",
    "ScopeResearchCompletionRefV1",
    "ScopeRequestedActionV1",
    "ScopeRequirementSeedV1",
    "ScopeRequirementV1",
    "ScopeSemanticAmbiguityV1",
    "ScopeSemanticDeltaV1",
    "ScopeSemanticFieldEditV1",
    "ScopeSemanticFieldV1",
    "ScopeSemanticOperationIntentV1",
    "ScopeSemanticWorkGoalV1",
    "ScopeSourceSpanV1",
    "ScopeStateV1",
    "ScopeSynthesisConsumerPayloadV1",
    "ScopeSynthesisOutputContractV1",
    "ScopeValidationReportV1",
    "ScopeWorkTypeV1",
    "TrustedRuntimeMetadataV1",
    "TruthPolicyV1",
]
