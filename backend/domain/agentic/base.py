"""Shared primitives for provider-neutral delegated-Agent contracts."""

from __future__ import annotations

import hashlib
from enum import Enum
from typing import Annotated, Any, Final

import rfc8785
from pydantic import BaseModel, ConfigDict, Field


RFC8785_V1: Final[str] = "rfc8785_v1"


class AgenticContractModel(BaseModel):
    """Fail-closed immutable boundary used by the agentic execution domain."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )


CanonicalKey = Annotated[
    str,
    Field(
        min_length=1,
        max_length=200,
        pattern=r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$",
    ),
]
DescriptorKey = Annotated[
    str,
    Field(
        min_length=1,
        max_length=200,
        pattern=r"^[a-z0-9]+(?:_[a-z0-9]+)*$",
    ),
]
VersionIdentifier = Annotated[
    str,
    Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
    ),
]
Sha256Digest = Annotated[
    str,
    Field(pattern=r"^[a-f0-9]{64}$"),
]
OpaqueReference = Annotated[
    str,
    Field(
        min_length=1,
        max_length=512,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$",
    ),
]


def _normalize_canonical_json(value: Any) -> Any:
    """Normalize supported domain values before RFC 8785 serialization."""

    if isinstance(value, Enum):
        return _normalize_canonical_json(value.value)
    if isinstance(value, BaseModel):
        return _normalize_canonical_json(
            value.model_dump(mode="json", exclude_none=True)
        )
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise rfc8785.CanonicalizationError("object keys must be strings")
        return {key: _normalize_canonical_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_canonical_json(item) for item in value]
    return value


def canonical_json_bytes(value: Any) -> bytes:
    """Serialize a JSON-shaped value using RFC 8785/JCS canonical bytes."""

    return rfc8785.dumps(_normalize_canonical_json(value))


def canonical_json_sha256(value: Any) -> str:
    """Hash JSON using the ``rfc8785_v1`` cross-runtime representation.

    Enum values and Pydantic models retain the normalization supported by the
    original helper. All remaining values must be valid in the RFC 8785 JSON
    domain.
    """

    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


__all__ = [
    "AgenticContractModel",
    "CanonicalKey",
    "DescriptorKey",
    "OpaqueReference",
    "RFC8785_V1",
    "Sha256Digest",
    "VersionIdentifier",
    "canonical_json_bytes",
    "canonical_json_sha256",
]
