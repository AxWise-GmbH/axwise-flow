"""Bounded, integer-only request limits shared by explicit cognitive capabilities.

These are invocation budgets, not a durable lifetime-spend or dollar-cost ledger.
Each capability intersects them with its own server policy before generation.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from backend.domain.workflow_v2.transcript_corpus import _FrozenCorpusModel


class CapabilityLimitsV1(_FrozenCorpusModel):
    deadline_ms: int = Field(strict=True, ge=1, le=900_000)
    max_model_calls: int = Field(strict=True, ge=1, le=32)
    max_input_tokens: int = Field(strict=True, ge=1, le=2_000_000)
    max_output_tokens: int = Field(strict=True, ge=1, le=2_000_000)


def effective_capability_limits(
    requested: CapabilityLimitsV1, policy: CapabilityLimitsV1
) -> CapabilityLimitsV1:
    request = CapabilityLimitsV1.model_validate(requested)
    maximum = CapabilityLimitsV1.model_validate(policy)
    return CapabilityLimitsV1.model_validate(
        {
            field.alias: min(getattr(request, name), getattr(maximum, name))
            for name, field in CapabilityLimitsV1.model_fields.items()
        }
    )


def validate_capability_structure(value: Any, *, max_bytes: int = 1_000_000) -> None:
    """Reject cycles, generators and excessive model-copy values before dumping.

    This is a defensive input preflight, not canonical serialization. The typed
    capability subsequently checks exact serialized bytes and semantic hashes.
    """
    remaining_nodes = 40_000
    remaining_bytes = max_bytes
    parents: set[int] = set()

    def visit(item: Any, depth: int) -> None:
        nonlocal remaining_nodes, remaining_bytes
        remaining_nodes -= 1
        if remaining_nodes < 0 or depth > 64:
            raise ValueError("capability input exceeds its structural limit")
        if item is None or type(item) is bool:
            return
        if type(item) is int:
            if abs(item) > 9_007_199_254_740_991:
                raise ValueError("capability integer is outside canonical-v1")
            return
        if type(item) is str:
            remaining_bytes -= len(item.encode("utf-8"))
            if remaining_bytes < 0:
                raise ValueError("capability input exceeds its aggregate byte limit")
            return
        identity = id(item)
        if identity in parents:
            raise ValueError("capability input cannot be cyclic")
        parents.add(identity)
        try:
            if isinstance(item, BaseModel):
                visit(object.__getattribute__(item, "__dict__"), depth + 1)
            elif type(item) is dict:
                if len(item) > remaining_nodes:
                    raise ValueError("capability input exceeds its structural limit")
                for key, child in item.items():
                    if type(key) is not str:
                        raise ValueError("capability object keys must be plain strings")
                    visit(key, depth + 1)
                    visit(child, depth + 1)
            elif type(item) in (list, tuple):
                if len(item) > remaining_nodes:
                    raise ValueError("capability input exceeds its structural limit")
                for child in item:
                    visit(child, depth + 1)
            elif type(item) is UUID:
                return
            else:
                raise ValueError("capability input requires bounded JSON-shaped values")
        finally:
            parents.remove(identity)

    visit(value, 0)


__all__ = [
    "CapabilityLimitsV1",
    "effective_capability_limits",
    "validate_capability_structure",
]
