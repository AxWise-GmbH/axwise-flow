"""Operator-only, content-free evidence counters for an existing operation.

These facts are deliberately separate from the versioned failure response and
database diagnostics. They must never contain source content, URLs, prompts,
provider responses, free-form reasons, or additional identities.
"""

from __future__ import annotations

from typing import Any


_STAGES = frozenset({"context", "discovery", "admission", "fetch", "extraction"})
_COUNTS = (
    "discovery_result_count",
    "discovery_invalid_result_count",
    "candidate_count",
    "fetched_count",
    "fetch_error_count",
    "validation_incomplete_count",
    "rejected_candidate_count",
    "malformed_candidate_count",
    "omitted_candidate_count",
    "claim_count",
    "primary_provider_query_count",
)
_MAX_COUNT = 10_000
_MAX_FIELDS = 64


def plain_diagnostic_fields(value: Any) -> dict[str, Any] | None:
    """Return bounded plain-key fields for optional reads; values are untrusted."""
    # Inspect keys before any lookup: a custom non-string dictionary key with
    # a colliding hash could otherwise run its __eq__ even on a plain dict.
    if (
        type(value) is not dict
        or len(value) > _MAX_FIELDS
        or not all(type(key) is str for key in value)
    ):
        return None
    return value


def research_evidence_from_runtime_diagnostics(value: Any) -> dict[str, object] | None:
    """Extract the optional sidecar without evaluating provider-defined objects."""

    fields = plain_diagnostic_fields(value)
    if fields is None:
        return None
    return sanitize_research_evidence_diagnostics(fields.get("evidence"))


def sanitize_research_evidence_diagnostics(value: Any) -> dict[str, object] | None:
    """Snapshot known facts without coercion, clamping, or invented zeroes.

    The producer records the last boundary actually reached. A failure status
    alone cannot distinguish an admission failure from zero claims after
    extraction. Omitted/invalid facts stay unknown, and arbitrary extra keys
    never cross even the operator logging boundary.
    """

    # Observability is optional. Do not invoke arbitrary Mapping.get, truthiness
    # or coercion methods, which could turn an observation into a new failure.
    value = plain_diagnostic_fields(value)
    if value is None:
        return None
    stage = value.get("stage")
    if type(stage) is not str or stage not in _STAGES:
        return None
    result: dict[str, object] = {"stage": stage}
    query_complete = value.get("query_complete")
    if type(query_complete) is bool:
        result["query_complete"] = query_complete
    for field in _COUNTS:
        candidate = value.get(field)
        if type(candidate) is int and 0 <= candidate <= _MAX_COUNT:
            result[field] = candidate
    return result
