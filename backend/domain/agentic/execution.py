"""Provider-neutral executor envelopes, acknowledgements and effect proof."""

from __future__ import annotations

from typing import Dict, Literal, Tuple

from pydantic import (
    AwareDatetime,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from backend.domain.agentic.base import (
    RFC8785_V1,
    AgenticContractModel,
    CanonicalKey,
    OpaqueReference,
    Sha256Digest,
    canonical_json_sha256,
)
from backend.domain.agentic.enums import (
    DispatchStatus,
    EffectExternality,
    EffectOutcome,
    StepKind,
)
from backend.domain.agentic.profiles import DataEgressProfileV1, EffectProfileV1
from backend.domain.agentic.references import (
    ContentReferenceV1,
    DescriptorVersionRefV1,
    ExecutorBindingVersionRefV1,
    PersonaVersionRefV1,
)


class ExecutionLimitsV1(AgenticContractModel):
    maximum_turns: int = Field(default=1, ge=1, le=1_000)
    maximum_tokens: int = Field(default=1_000, ge=1, le=100_000_000)
    maximum_tool_calls: int = Field(default=0, ge=0, le=10_000)
    maximum_runtime_seconds: int = Field(..., ge=1, le=86_400)
    maximum_attempts: int = Field(default=1, ge=1, le=10)
    maximum_cost_minor: int = Field(..., ge=0, le=9_007_199_254_740_991)
    currency: str = Field(..., pattern=r"^[A-Z]{3}$")


class EffectTargetV1(AgenticContractModel):
    target_type: CanonicalKey
    target_reference: OpaqueReference
    target_hash: Sha256Digest | None = None


class ExternalPreconditionV1(AgenticContractModel):
    precondition_type: CanonicalKey
    target_reference: OpaqueReference
    expected_state_hash: Sha256Digest


class ExternalObjectReferenceV1(AgenticContractModel):
    reference_type: CanonicalKey
    reference_value: OpaqueReference


class ObservedCostV1(AgenticContractModel):
    amount_minor: int = Field(..., ge=0)
    currency: str = Field(..., pattern=r"^[A-Z]{3}$")


class ExecutionEnvelopeV1(AgenticContractModel):
    version: Literal["orqaly_execution_envelope_v1"] = "orqaly_execution_envelope_v1"
    contract_version: Literal["1.0"] = "1.0"
    canonicalization: Literal["rfc8785_v1"] = RFC8785_V1
    org_id: OpaqueReference
    workspace_id: OpaqueReference
    principal_id: OpaqueReference
    agent_id: OpaqueReference
    persona_version: PersonaVersionRefV1
    run_id: OpaqueReference
    step_id: OpaqueReference
    attempt_id: OpaqueReference
    step_kind: StepKind
    descriptor: DescriptorVersionRefV1
    executor_binding: ExecutorBindingVersionRefV1
    canonical_input: Dict[str, JsonValue]
    canonical_input_hash: Sha256Digest
    effect_profile: EffectProfileV1 = Field(default_factory=EffectProfileV1)
    data_egress_profile: DataEgressProfileV1 = Field(
        default_factory=DataEgressProfileV1
    )
    sealed_context_references: Tuple[ContentReferenceV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    artifact_references: Tuple[ContentReferenceV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    limits: ExecutionLimitsV1
    issued_at: AwareDatetime
    deadline: AwareDatetime
    callback_reference: OpaqueReference
    policy_digest: Sha256Digest
    action_intent_id: OpaqueReference | None = None
    action_intent_hash: Sha256Digest | None = None
    approval_binding_hash: Sha256Digest | None = None
    idempotency_scope: CanonicalKey | None = None
    idempotency_key: OpaqueReference | None = None
    effect_id: OpaqueReference | None = None
    targets: Tuple[EffectTargetV1, ...] = Field(default_factory=tuple, max_length=100)
    external_preconditions: Tuple[ExternalPreconditionV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    connection_references: Tuple[OpaqueReference, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    grant_reference: OpaqueReference | None = None

    @field_validator(
        "sealed_context_references",
        "artifact_references",
    )
    @classmethod
    def content_references_are_unique(
        cls, values: Tuple[ContentReferenceV1, ...]
    ) -> Tuple[ContentReferenceV1, ...]:
        identities = [(item.reference_id, item.content_hash) for item in values]
        if len(identities) != len(set(identities)):
            raise ValueError("content references must be unique")
        return values

    @field_validator("targets")
    @classmethod
    def targets_are_unique(
        cls, values: Tuple[EffectTargetV1, ...]
    ) -> Tuple[EffectTargetV1, ...]:
        identities = [
            (item.target_type, item.target_reference, item.target_hash)
            for item in values
        ]
        if len(identities) != len(set(identities)):
            raise ValueError("effect targets must be unique")
        return values

    @field_validator("external_preconditions")
    @classmethod
    def preconditions_are_unique(
        cls, values: Tuple[ExternalPreconditionV1, ...]
    ) -> Tuple[ExternalPreconditionV1, ...]:
        identities = [
            (
                item.precondition_type,
                item.target_reference,
                item.expected_state_hash,
            )
            for item in values
        ]
        if len(identities) != len(set(identities)):
            raise ValueError("external preconditions must be unique")
        return values

    @field_validator("connection_references")
    @classmethod
    def connections_are_canonical(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("connection references must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_envelope(self) -> "ExecutionEnvelopeV1":
        if canonical_json_sha256(self.canonical_input) != self.canonical_input_hash:
            raise ValueError("canonical_input_hash does not match canonical_input")
        if self.deadline <= self.issued_at:
            raise ValueError("execution deadline must be after issued_at")
        if (self.idempotency_scope is None) != (self.idempotency_key is None):
            raise ValueError("idempotency scope and key must be supplied together")
        if (self.action_intent_id is None) != (self.action_intent_hash is None):
            raise ValueError("action intent ID and hash must be supplied together")

        externality = self.effect_profile.externality
        if (
            self.step_kind == StepKind.CONNECTOR_READ
            and externality != EffectExternality.READ
        ):
            raise ValueError("connector_read execution requires read externality")
        if (
            self.step_kind == StepKind.CONNECTOR_WRITE
            and externality != EffectExternality.WRITE
        ):
            raise ValueError("connector_write execution requires write externality")

        external_fields_present = any(
            (
                self.effect_id is not None,
                bool(self.targets),
                bool(self.external_preconditions),
                bool(self.connection_references),
                self.grant_reference is not None,
                self.idempotency_key is not None,
                self.action_intent_id is not None,
                self.approval_binding_hash is not None,
            )
        )
        if externality == EffectExternality.NONE and external_fields_present:
            raise ValueError(
                "a non-external step cannot carry external authority fields"
            )
        if externality == EffectExternality.WRITE:
            if self.effect_id is None:
                raise ValueError("a write execution requires effect_id")
            if not self.targets:
                raise ValueError("a write execution requires at least one target")
            if self.grant_reference is None:
                raise ValueError("a write execution requires an opaque grant reference")
            if self.approval_binding_hash is None:
                raise ValueError("a write execution requires an exact approval binding")
            if self.idempotency_key is None:
                raise ValueError("a write execution requires an idempotency binding")
        if externality != EffectExternality.NONE and self.action_intent_id is None:
            raise ValueError(
                "external execution requires an immutable action intent binding"
            )
        if self.external_preconditions and externality != EffectExternality.WRITE:
            raise ValueError("external preconditions are valid only for writes")
        return self


class GatewayEffectAttestationV1(AgenticContractModel):
    """Unmodified signed observation from the authority-bearing gateway."""

    contract_version: Literal["1.0"] = "1.0"
    org_id: OpaqueReference
    workspace_id: OpaqueReference
    run_id: OpaqueReference
    step_id: OpaqueReference
    effect_id: OpaqueReference
    attempt_id: OpaqueReference
    descriptor: DescriptorVersionRefV1
    canonical_input_hash: Sha256Digest
    precondition_hash: Sha256Digest | None = None
    outcome: EffectOutcome
    external_references: Tuple[ExternalObjectReferenceV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    output_hash: Sha256Digest | None = None
    observed_cost: ObservedCostV1 | None = None
    observed_at: AwareDatetime
    receipt_hash: Sha256Digest
    signature_key_id: CanonicalKey
    signature: str = Field(
        ...,
        min_length=16,
        max_length=8_192,
        pattern=r"^[A-Za-z0-9_-]+={0,2}$",
    )

    @field_validator("external_references")
    @classmethod
    def external_references_are_unique(
        cls, values: Tuple[ExternalObjectReferenceV1, ...]
    ) -> Tuple[ExternalObjectReferenceV1, ...]:
        identities = [(item.reference_type, item.reference_value) for item in values]
        if len(identities) != len(set(identities)):
            raise ValueError("external references must be unique")
        return values


class DispatchReceiptV1(AgenticContractModel):
    """Executor status; external success additionally requires Gateway proof."""

    contract_version: Literal["1.0"] = "1.0"
    org_id: OpaqueReference
    workspace_id: OpaqueReference
    run_id: OpaqueReference
    step_id: OpaqueReference
    attempt_id: OpaqueReference
    descriptor: DescriptorVersionRefV1
    executor_binding: ExecutorBindingVersionRefV1
    status: DispatchStatus
    observed_at: AwareDatetime
    executor_reference: OpaqueReference | None = None
    effect_id: OpaqueReference | None = None
    gateway_effect_attestation: GatewayEffectAttestationV1 | None = None
    error_code: CanonicalKey | None = None
    sanitized_error: str | None = Field(default=None, max_length=2_000)

    @model_validator(mode="after")
    def validate_receipt(self) -> "DispatchReceiptV1":
        if self.status in {DispatchStatus.ACCEPTED, DispatchStatus.RUNNING}:
            if self.executor_reference is None:
                raise ValueError(
                    "accepted or running dispatch requires executor_reference"
                )
        if self.status in {DispatchStatus.FAILED, DispatchStatus.REJECTED}:
            if self.error_code is None:
                raise ValueError("failed or rejected dispatch requires error_code")
        elif self.error_code is not None or self.sanitized_error is not None:
            raise ValueError(
                "error fields are valid only for failed or rejected dispatch"
            )

        attestation = self.gateway_effect_attestation
        terminal_effect_statuses = {
            DispatchStatus.SUCCEEDED,
            DispatchStatus.FAILED,
            DispatchStatus.OUTCOME_UNKNOWN,
        }
        if self.effect_id is not None and self.status in terminal_effect_statuses:
            if attestation is None:
                raise ValueError(
                    "a terminal external effect requires Gateway attestation"
                )
        if attestation is not None:
            if self.effect_id is None:
                raise ValueError("Gateway attestation requires effect_id")
            if self.status not in terminal_effect_statuses:
                raise ValueError(
                    "Gateway attestation is valid only for a terminal effect status"
                )
            expected_identity = (
                self.org_id,
                self.workspace_id,
                self.run_id,
                self.step_id,
                self.effect_id,
                self.attempt_id,
                self.descriptor,
            )
            attested_identity = (
                attestation.org_id,
                attestation.workspace_id,
                attestation.run_id,
                attestation.step_id,
                attestation.effect_id,
                attestation.attempt_id,
                attestation.descriptor,
            )
            if expected_identity != attested_identity:
                raise ValueError("Gateway attestation does not match dispatch identity")
            status_to_outcome = {
                DispatchStatus.SUCCEEDED: EffectOutcome.SUCCEEDED,
                DispatchStatus.FAILED: EffectOutcome.FAILED,
                DispatchStatus.OUTCOME_UNKNOWN: EffectOutcome.OUTCOME_UNKNOWN,
            }
            expected_outcome = status_to_outcome.get(self.status)
            if expected_outcome is not None and attestation.outcome not in {
                expected_outcome,
                EffectOutcome.NOT_APPLIED
                if self.status == DispatchStatus.FAILED
                else expected_outcome,
            }:
                raise ValueError("Gateway outcome does not match dispatch status")
        return self


__all__ = [
    "DispatchReceiptV1",
    "EffectTargetV1",
    "ExecutionEnvelopeV1",
    "ExecutionLimitsV1",
    "ExternalObjectReferenceV1",
    "ExternalPreconditionV1",
    "GatewayEffectAttestationV1",
    "ObservedCostV1",
]
