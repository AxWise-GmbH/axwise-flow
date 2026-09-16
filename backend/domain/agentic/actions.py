"""Provider-neutral external-action authority carried by an AxWise plan."""

from __future__ import annotations

from typing import Literal, Tuple
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from backend.domain.agentic.base import (
    AgenticContractModel,
    CanonicalKey,
    OpaqueReference,
    Sha256Digest,
    VersionIdentifier,
)
from backend.domain.agentic.execution import EffectTargetV1, ExternalPreconditionV1


class ProviderOperationVersionRefV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    operation_key: CanonicalKey
    operation_version: VersionIdentifier
    content_hash: Sha256Digest


class ConnectionReferenceV1(AgenticContractModel):
    connection_reference: OpaqueReference
    provider_key: CanonicalKey
    credential_owner_principal_id: OpaqueReference
    requested_scopes: Tuple[CanonicalKey, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )

    @field_validator("requested_scopes")
    @classmethod
    def scopes_are_canonical(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("requested connection scopes must be sorted and unique")
        return values


class IdempotencyBindingV1(AgenticContractModel):
    scope: CanonicalKey
    key: OpaqueReference


class ReconciliationPolicyV1(AgenticContractModel):
    strategy: Literal["provider_idempotency", "authoritative_lookup", "manual"]
    lookup_operation: ProviderOperationVersionRefV1 | None = None

    @model_validator(mode="after")
    def validate_lookup(self) -> "ReconciliationPolicyV1":
        if self.strategy == "authoritative_lookup" and self.lookup_operation is None:
            raise ValueError(
                "authoritative lookup reconciliation requires a pinned operation"
            )
        if (
            self.strategy != "authoritative_lookup"
            and self.lookup_operation is not None
        ):
            raise ValueError(
                "only authoritative lookup reconciliation may name an operation"
            )
        return self


class CompensationPolicyV1(AgenticContractModel):
    strategy: Literal["none", "provider_operation", "manual"] = "none"
    operation: ProviderOperationVersionRefV1 | None = None

    @model_validator(mode="after")
    def validate_operation(self) -> "CompensationPolicyV1":
        if self.strategy == "provider_operation" and self.operation is None:
            raise ValueError("provider compensation requires a pinned operation")
        if self.strategy != "provider_operation" and self.operation is not None:
            raise ValueError("only provider compensation may name an operation")
        return self


class ExternalActionSpecV1(AgenticContractModel):
    """Complete immutable external effect proposed by the advisory planner.

    This object describes requested authority. Orqaly still narrows it through
    descriptor resolution, policy, connection grants and exact approval before
    any executor envelope can be issued.
    """

    version: Literal["orqaly_external_action_spec_v1"] = (
        "orqaly_external_action_spec_v1"
    )
    effect_id: UUID
    provider_operation: ProviderOperationVersionRefV1
    connection: ConnectionReferenceV1
    targets: Tuple[EffectTargetV1, ...] = Field(..., min_length=1, max_length=100)
    external_preconditions: Tuple[ExternalPreconditionV1, ...] = Field(
        default_factory=tuple,
        max_length=100,
    )
    idempotency: IdempotencyBindingV1
    reconciliation: ReconciliationPolicyV1
    compensation: CompensationPolicyV1 = Field(default_factory=CompensationPolicyV1)

    @field_validator("targets")
    @classmethod
    def targets_are_canonical(
        cls, values: Tuple[EffectTargetV1, ...]
    ) -> Tuple[EffectTargetV1, ...]:
        identities = [
            (item.target_type, item.target_reference, item.target_hash or "")
            for item in values
        ]
        if identities != sorted(set(identities)):
            raise ValueError("external targets must be sorted and unique")
        return values

    @field_validator("external_preconditions")
    @classmethod
    def preconditions_are_canonical(
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
        if identities != sorted(set(identities)):
            raise ValueError("external preconditions must be sorted and unique")
        return values


__all__ = [
    "CompensationPolicyV1",
    "ConnectionReferenceV1",
    "ExternalActionSpecV1",
    "IdempotencyBindingV1",
    "ProviderOperationVersionRefV1",
    "ReconciliationPolicyV1",
]
