"""Immutable, cross-runtime execution-descriptor manifests."""

from __future__ import annotations

import re
from copy import deepcopy
from enum import Enum
from typing import Any, Literal, Mapping, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.domain.agentic.base import (
    RFC8785_V1,
    AgenticContractModel,
    CanonicalKey,
    Sha256Digest,
    VersionIdentifier,
    canonical_json_sha256,
)
from backend.domain.agentic.enums import (
    ApprovalPolicy,
    EffectExternality,
    StepKind,
)
from backend.domain.agentic.profiles import DataEgressProfileV1, EffectProfileV1
from backend.domain.agentic.references import (
    DescriptorVersionRefV1,
    ExecutorBindingVersionRefV1,
)


class DescriptorRetryPolicy(str, Enum):
    """Provider-neutral retry authority understood by the control plane."""

    NEVER = "never"
    PRE_ACCEPTANCE_ONLY = "pre_acceptance_only"


class ForbiddenDescriptorCostPolicyV1(AgenticContractModel):
    mode: Literal["forbidden"] = "forbidden"


class BoundedDescriptorCostPolicyV1(AgenticContractModel):
    mode: Literal["bounded"] = "bounded"
    maximum_cost_minor: int = Field(..., ge=0, le=9_007_199_254_740_991)
    currency: str = Field(..., pattern=r"^[A-Z]{3}$")


class DescriptorExecutionLimitPolicyV1(AgenticContractModel):
    maximum_turns: int = Field(..., ge=1, le=1_000)
    maximum_tokens: int = Field(..., ge=1, le=100_000_000)
    maximum_tool_calls: int = Field(..., ge=0, le=10_000)
    maximum_runtime_seconds: int = Field(..., ge=1, le=86_400)
    cost: ForbiddenDescriptorCostPolicyV1 | BoundedDescriptorCostPolicyV1 = Field(
        ...,
        discriminator="mode",
    )


class DescriptorProviderOperationVersionRefV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    operation_key: CanonicalKey
    operation_version: VersionIdentifier
    content_hash: Sha256Digest


class DescriptorReconciliationPolicyV1(AgenticContractModel):
    strategy: Literal["provider_idempotency", "authoritative_lookup", "manual"]
    lookup_operation: DescriptorProviderOperationVersionRefV1 | None = None

    @model_validator(mode="after")
    def validate_lookup(self) -> "DescriptorReconciliationPolicyV1":
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


class DescriptorCompensationPolicyV1(AgenticContractModel):
    strategy: Literal["none", "provider_operation", "manual"] = "none"
    operation: DescriptorProviderOperationVersionRefV1 | None = None

    @model_validator(mode="after")
    def validate_operation(self) -> "DescriptorCompensationPolicyV1":
        if self.strategy == "provider_operation" and self.operation is None:
            raise ValueError("provider compensation requires a pinned operation")
        if self.strategy != "provider_operation" and self.operation is not None:
            raise ValueError("only provider compensation may name an operation")
        return self


_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def _camel_to_snake_key(value: str) -> str:
    return _CAMEL_BOUNDARY.sub("_", value).lower()


def _snake_to_camel_key(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _map_document_keys(value: Any, mapper: Any) -> Any:
    if isinstance(value, BaseModel):
        return _map_document_keys(
            value.model_dump(mode="json", exclude_none=False),
            mapper,
        )
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for raw_key, item in value.items():
            if not isinstance(raw_key, str):
                raise ValueError("descriptor manifest object keys must be strings")
            key = mapper(raw_key)
            if key in result:
                raise ValueError("descriptor manifest contains ambiguous field casing")
            result[key] = _map_document_keys(item, mapper)
        return result
    if isinstance(value, (list, tuple)):
        return [_map_document_keys(item, mapper) for item in value]
    return value


class _ExecutionDescriptorShapeV1(AgenticContractModel):
    version: Literal["orqaly_execution_descriptor_manifest_v1"]
    contract_version: Literal["1.0"]
    canonicalization: Literal["rfc8785_v1"]
    reference: DescriptorVersionRefV1
    step_kind: StepKind
    effect_profile: EffectProfileV1
    data_egress_profile: DataEgressProfileV1
    input_schema_hash: Sha256Digest
    output_schema_hash: Sha256Digest
    supported_executor_bindings: Tuple[ExecutorBindingVersionRefV1, ...] = Field(
        ...,
        min_length=1,
        max_length=50,
    )
    approval_policy: ApprovalPolicy
    retry_policy: DescriptorRetryPolicy
    reconciliation_policy: DescriptorReconciliationPolicyV1 | None
    compensation_policy: DescriptorCompensationPolicyV1 | None
    maximum_attempts: int = Field(..., ge=1, le=10)
    default_timeout_seconds: int = Field(..., ge=1, le=86_400)
    limit_policy: DescriptorExecutionLimitPolicyV1

    @model_validator(mode="before")
    @classmethod
    def accept_exact_cross_runtime_wire_fields(cls, value: Any) -> Any:
        if isinstance(value, Mapping):
            return _map_document_keys(value, _camel_to_snake_key)
        return value

    @field_validator("supported_executor_bindings")
    @classmethod
    def bindings_are_canonical(
        cls,
        bindings: Tuple[ExecutorBindingVersionRefV1, ...],
    ) -> Tuple[ExecutorBindingVersionRefV1, ...]:
        identities = [
            (item.binding_key, item.binding_version, item.content_hash)
            for item in bindings
        ]
        if identities != sorted(set(identities)):
            raise ValueError("executor bindings must be sorted and unique")
        return bindings

    @model_validator(mode="after")
    def validate_descriptor(self) -> "_ExecutionDescriptorShapeV1":
        if (
            self.step_kind == StepKind.CONNECTOR_READ
            and self.effect_profile.externality != EffectExternality.READ
        ):
            raise ValueError("connector_read descriptors require read externality")
        if (
            self.step_kind == StepKind.CONNECTOR_WRITE
            and self.effect_profile.externality != EffectExternality.WRITE
        ):
            raise ValueError("connector_write descriptors require write externality")

        is_external = self.effect_profile.externality != EffectExternality.NONE
        if is_external and self.reconciliation_policy is None:
            raise ValueError("external descriptors require a reconciliation policy")
        if is_external and self.compensation_policy is None:
            raise ValueError("external descriptors require a compensation policy")
        if not is_external and self.reconciliation_policy is not None:
            raise ValueError("local descriptors cannot declare external reconciliation")
        if not is_external and self.compensation_policy is not None:
            raise ValueError("local descriptors cannot declare external compensation")
        if (
            self.retry_policy == DescriptorRetryPolicy.NEVER
            and self.maximum_attempts != 1
        ):
            raise ValueError("a no-retry descriptor must permit exactly one attempt")
        if self.default_timeout_seconds > self.limit_policy.maximum_runtime_seconds:
            raise ValueError(
                "default timeout cannot exceed the descriptor runtime ceiling"
            )
        return self


class ExecutionDescriptorManifestV1(_ExecutionDescriptorShapeV1):
    """Exact content-addressed manifest shared with Orqaly's control plane."""

    @model_validator(mode="after")
    def verify_content_hash(self) -> "ExecutionDescriptorManifestV1":
        if self.reference.content_hash != execution_descriptor_content_hash(self):
            raise ValueError(
                "descriptor content_hash does not match RFC 8785 manifest bytes"
            )
        return self


# Compatibility name retained for the original AxWise domain surface.
ExecutionDescriptorV1 = ExecutionDescriptorManifestV1


def execution_descriptor_wire_document(
    descriptor: _ExecutionDescriptorShapeV1 | Mapping[str, Any],
) -> dict[str, Any]:
    """Return the exact lower-camel-case Orqaly descriptor wire document."""

    if isinstance(descriptor, _ExecutionDescriptorShapeV1):
        value: Any = descriptor.model_dump(mode="json", exclude_none=False)
    else:
        value = deepcopy(dict(descriptor))
    document = _map_document_keys(value, _snake_to_camel_key)
    if not isinstance(document, dict):  # pragma: no cover - defensive type guard
        raise TypeError("descriptor manifest must be an object")
    return document


def execution_descriptor_hash_payload(
    descriptor: _ExecutionDescriptorShapeV1 | Mapping[str, Any],
) -> dict[str, Any]:
    """Return the canonical manifest payload, excluding its self hash only."""

    payload = execution_descriptor_wire_document(descriptor)
    reference = dict(payload["reference"])
    reference.pop("contentHash", None)
    payload["reference"] = reference
    return payload


def execution_descriptor_content_hash(
    descriptor: _ExecutionDescriptorShapeV1 | Mapping[str, Any],
) -> str:
    return canonical_json_sha256(execution_descriptor_hash_payload(descriptor))


def build_execution_descriptor_manifest_v1(
    **values: Any,
) -> ExecutionDescriptorManifestV1:
    """Validate, materialize defaults and seal one descriptor manifest."""

    normalized = _map_document_keys(values, _camel_to_snake_key)
    normalized.setdefault("version", "orqaly_execution_descriptor_manifest_v1")
    normalized.setdefault("contract_version", "1.0")
    normalized.setdefault("canonicalization", RFC8785_V1)

    reference = normalized.get("reference")
    if isinstance(reference, DescriptorVersionRefV1):
        reference = reference.model_dump(mode="json")
    if not isinstance(reference, Mapping):
        raise ValueError("descriptor builder requires a reference object")
    normalized["reference"] = {**reference, "content_hash": "0" * 64}

    candidate = _ExecutionDescriptorShapeV1.model_validate(normalized)
    content_hash = execution_descriptor_content_hash(candidate)
    sealed = candidate.model_dump(mode="json", exclude_none=False)
    sealed["reference"] = {
        **sealed["reference"],
        "content_hash": content_hash,
    }
    return ExecutionDescriptorManifestV1.model_validate(sealed)


build_execution_descriptor_v1 = build_execution_descriptor_manifest_v1


__all__ = [
    "BoundedDescriptorCostPolicyV1",
    "DescriptorCompensationPolicyV1",
    "DescriptorExecutionLimitPolicyV1",
    "DescriptorProviderOperationVersionRefV1",
    "DescriptorReconciliationPolicyV1",
    "DescriptorRetryPolicy",
    "ExecutionDescriptorManifestV1",
    "ExecutionDescriptorV1",
    "ForbiddenDescriptorCostPolicyV1",
    "build_execution_descriptor_manifest_v1",
    "build_execution_descriptor_v1",
    "execution_descriptor_content_hash",
    "execution_descriptor_hash_payload",
    "execution_descriptor_wire_document",
]
