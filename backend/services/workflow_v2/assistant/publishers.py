"""Load reviewed publisher identity data, separate from generic admission rules."""

from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path

from backend.domain.workflow_v2.contracts import is_canonical_public_https_url
from backend.services.workflow_v2.assistant.source_policy import (
    MAX_REVIEWED_BINDINGS,
    ReviewedPublisherBinding,
)


@lru_cache(maxsize=1)
def reviewed_publisher_bindings() -> tuple[ReviewedPublisherBinding, ...]:
    """No discovery, title inference, mutable remote config, or universal allowlist.

    Entries only resolve an explicit request for that publisher's documentation.
    Unknown publishers remain unresolved. Changes require a reviewed deployment.
    """
    source = Path(__file__).with_name("reviewed_publishers.json")
    if source.stat().st_size > 200_000:
        raise ValueError("Reviewed publisher data exceeds its bound")
    payload = json.loads(source.read_text(encoding="utf-8"))
    if (
        not isinstance(payload, dict)
        or set(payload) != {"schema_version", "publishers"}
        or type(payload["schema_version"]) is not int
        or payload["schema_version"] != 1
        or not isinstance(payload["publishers"], list)
        or len(payload["publishers"]) > MAX_REVIEWED_BINDINGS
    ):
        raise ValueError("Reviewed publisher data is invalid")
    bindings: list[ReviewedPublisherBinding] = []
    for entry in payload["publishers"]:
        if not isinstance(entry, dict) or set(entry) != {
            "publisher",
            "aliases",
            "documentation_roots",
            "reviewed_on",
            "review_basis",
            "review_sources",
        }:
            raise ValueError("Reviewed publisher entry has invalid fields")
        if (
            not isinstance(entry["aliases"], list)
            or not isinstance(entry["documentation_roots"], list)
            or not isinstance(entry["review_basis"], str)
            or not 1 <= len(entry["review_basis"]) <= 1_000
            or not isinstance(entry["review_sources"], list)
            or not 1 <= len(entry["review_sources"]) <= 10
            or not all(
                isinstance(url, str) and is_canonical_public_https_url(url)
                for url in entry["review_sources"]
            )
        ):
            raise ValueError("Reviewed publisher evidence is invalid")
        date.fromisoformat(entry["reviewed_on"])
        bindings.append(
            ReviewedPublisherBinding(
                publisher=entry["publisher"],
                aliases=tuple(entry["aliases"]),
                documentation_roots=tuple(entry["documentation_roots"]),
            )
        )
    return tuple(bindings)


__all__ = ["reviewed_publisher_bindings"]
