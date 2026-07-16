"""Deterministic validation helpers shared by orchestration services."""

import hashlib
import json
from typing import Any

from pydantic import BaseModel

from backend.domain.orchestration.enums import (
    CLASSIFICATION_ORDER,
    RISK_ORDER,
    DataClassification,
    RiskLevel,
)


def canonical_request_hash(value: BaseModel) -> str:
    """Hash the exact validated input using a stable JSON representation."""
    payload = value.model_dump(mode="json", by_alias=True, exclude_none=False)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def classification_allows(
    maximum: DataClassification, requested: DataClassification
) -> bool:
    return CLASSIFICATION_ORDER[maximum] >= CLASSIFICATION_ORDER[requested]


def risk_allows(maximum: RiskLevel, requested: RiskLevel) -> bool:
    return RISK_ORDER[maximum] >= RISK_ORDER[requested]


def canonical_json(value: Any) -> Any:
    """Round-trip through canonical JSON before storing an immutable snapshot."""
    return json.loads(json.dumps(value, sort_keys=True, separators=(",", ":")))
