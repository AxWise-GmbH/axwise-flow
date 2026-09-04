"""Content-addressed immutable references used by execution snapshots."""

from __future__ import annotations

from typing import Literal

from backend.domain.agentic.base import (
    AgenticContractModel,
    CanonicalKey,
    DescriptorKey,
    OpaqueReference,
    Sha256Digest,
    VersionIdentifier,
)


class DescriptorVersionRefV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    descriptor_key: DescriptorKey
    schema_version: VersionIdentifier
    content_hash: Sha256Digest


class ExecutorBindingVersionRefV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    binding_key: CanonicalKey
    binding_version: VersionIdentifier
    content_hash: Sha256Digest


class PersonaVersionRefV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    persona_id: OpaqueReference
    persona_version: VersionIdentifier
    content_hash: Sha256Digest


class ContentReferenceV1(AgenticContractModel):
    """Opaque content-addressed input; it never embeds customer file bytes."""

    reference_id: OpaqueReference
    content_hash: Sha256Digest
    media_type: str | None = None


# The longer name is useful at call sites that distinguish a full descriptor
# document from its immutable identity.
ExecutionDescriptorVersionRefV1 = DescriptorVersionRefV1


__all__ = [
    "ContentReferenceV1",
    "DescriptorVersionRefV1",
    "ExecutionDescriptorVersionRefV1",
    "ExecutorBindingVersionRefV1",
    "PersonaVersionRefV1",
]
