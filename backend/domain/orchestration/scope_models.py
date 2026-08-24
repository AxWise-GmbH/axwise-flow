"""Compact, truth-preserving scope and quality contracts for Orqaly handoff."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import List, Literal, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.domain.market_scope import MARKET_COUNTRY_CODES


SCOPE_PACKET_VERSION = "axwise_scope_packet_v1"
QUALITY_CONTRACT_VERSION = "axwise_quality_contract_v1"


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
            if existing is not None and existing != normalized:
                raise ValueError(
                    f"requested action {normalized.action!r} "
                    "has conflicting definitions"
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


class ScopePacketV1(ScopeContractModel):
    version: Literal["axwise_scope_packet_v1"] = SCOPE_PACKET_VERSION
    scope_ref: str = Field(..., min_length=1, max_length=255)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
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
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def validate_integrity(self) -> "ScopePacketV1":
        ledger = self.ledger
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


__all__ = [
    "QualityContractV1",
    "ScopeAcceptanceSeedV1",
    "ScopeAcceptanceV1",
    "ScopeAdmissionV1",
    "ScopeContractBindingV1",
    "ScopeDocumentIntentV1",
    "ScopeEvidenceContractV1",
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
    "ScopePacketV1",
    "ScopeQualityCheckV1",
    "ScopeRequestedActionV1",
    "ScopeRequirementSeedV1",
    "ScopeRequirementV1",
    "ScopeStateV1",
    "ScopeValidationReportV1",
    "ScopeWorkTypeV1",
    "TrustedRuntimeMetadataV1",
    "TruthPolicyV1",
]
