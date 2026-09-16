"""In-process permit checked before authorized capability payloads can leave.

Only the authenticated, owner-bound operation handler issues permits, after
owned-source validation. The permit is internal state, not provider input or a
replacement for operation ownership, lifecycle leases, or user opt-in capture.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import math
import time
from typing import Any
from uuid import UUID

from backend.domain.workflow_v2.capability_limits import (
    CapabilityLimitsV1,
    validate_capability_structure,
)
from backend.domain.workflow_v2.contracts import (
    AnalyzeEvidenceInputV1,
    AxWiseOperationEnvelope,
    SimulateInputV1,
    canonical_hash,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


_PERMIT_ISSUER = object()


@dataclass(frozen=True)
class CapabilityProcessingPermit:
    operation_id: UUID
    purpose: str
    binding_hash: str
    provider_payload_hash: str
    limits: CapabilityLimitsV1
    deadline: float
    _issuer: object = field(repr=False, compare=False)


def issue_processing_permit(
    envelope: AxWiseOperationEnvelope,
    *,
    provider_payload: dict[str, Any],
    deadline: float,
) -> CapabilityProcessingPermit:
    try:
        validate_capability_structure(envelope)
        checked = AxWiseOperationEnvelope.model_validate(
            envelope.model_dump(mode="json", by_alias=True, warnings="error")
        )
        if not isinstance(checked.input, (AnalyzeEvidenceInputV1, SimulateInputV1)):
            raise ValueError("capability processing purpose required")
        if type(deadline) not in (int, float) or not math.isfinite(deadline):
            raise ValueError("capability processing deadline required")
        if deadline > time.monotonic() + checked.input.limits.deadline_ms / 1000:
            raise ValueError("capability processing deadline exceeds consented input")
        validate_capability_structure(provider_payload)
        return CapabilityProcessingPermit(
            operation_id=checked.operation_id,
            purpose=checked.operation_type,
            binding_hash=checked.input.processing_consent.binding_hash,
            provider_payload_hash=canonical_hash(provider_payload),
            limits=checked.input.limits,
            deadline=deadline,
            _issuer=_PERMIT_ISSUER,
        )
    except (AttributeError, TypeError, ValueError, OverflowError) as error:
        raise CognitiveExecutionFailure(
            "AXWISE_CAPABILITY_PROCESSING_CONSENT_INVALID", retryable=False
        ) from error


def require_processing_permit(
    permit: CapabilityProcessingPermit | None,
    *,
    purpose: str,
    operation_id: UUID | None,
    provider_payload: dict[str, Any],
) -> None:
    try:
        validate_capability_structure(provider_payload)
        if (
            type(permit) is not CapabilityProcessingPermit
            or permit._issuer is not _PERMIT_ISSUER
            or permit.purpose != purpose
            or type(operation_id) is not UUID
            or permit.operation_id != operation_id
            or permit.provider_payload_hash != canonical_hash(provider_payload)
            or type(permit.deadline) not in (int, float)
            or not math.isfinite(permit.deadline)
            or permit.deadline <= time.monotonic()
        ):
            raise ValueError("matching owner-authorized processing permit required")
        CapabilityLimitsV1.model_validate(permit.limits)
    except (AttributeError, TypeError, ValueError, OverflowError) as error:
        raise CognitiveExecutionFailure(
            "AXWISE_CAPABILITY_PROCESSING_CONSENT_INVALID", retryable=False
        ) from error


__all__ = [
    "CapabilityProcessingPermit",
    "issue_processing_permit",
    "require_processing_permit",
]
