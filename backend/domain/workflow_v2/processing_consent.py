"""Explicit owner-command processing consent bound to one exact operation.

The authenticated caller attests the owner's opt-in. These pure checks bind that
attestation to its destination, purpose, operation and complete immutable input;
they do not invent consent, prove a UI interaction, or establish a spend ledger.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import field_validator

from backend.domain.workflow_v2.capability_limits import validate_capability_structure
from backend.domain.workflow_v2.transcript_corpus import (
    _FrozenCorpusModel,
    _Sha256,
    _uuid_value,
)
from backend.domain.workflow_v2.wire import canonical_hash


ProcessingPurpose = Literal["AnalyzeEvidenceV1", "SimulateV1"]
PROCESSING_NOTICE_VERSION = "google-selected-sources-v1"


class CapabilityProcessingConsentV1(_FrozenCorpusModel):
    schema_version: Literal["axwise.processing-consent.v1"]
    granted: Literal[True]
    provider: Literal["google"]
    purpose: ProcessingPurpose
    operation_id: UUID
    binding_hash: _Sha256
    notice_version: Literal["google-selected-sources-v1"]

    _operation = field_validator("operation_id", mode="before")(_uuid_value)

    @field_validator("granted", mode="before")
    @classmethod
    def explicit_true_only(cls, value: Any) -> bool:
        if type(value) is not bool or value is not True:
            raise ValueError("processing consent requires an explicit true boolean")
        return value


def processing_consent_binding_hash(
    *,
    operation_type: str,
    operation_id: UUID | str,
    owner: dict[str, Any],
    workflow: dict[str, Any],
    contract_version: str,
    input_value: dict[str, Any],
) -> str:
    """Hash validated wire input, omitting only its top-level consent member.

    Nested fields named processingConsent remain part of the exact input. Owner
    and workflow identity also participate: operation UUIDs are not consent
    authority across owners or managed work. This payload is never model input.
    """
    if (
        operation_type not in {"AnalyzeEvidenceV1", "SimulateV1"}
        or contract_version != "axwise.operation.v2"
        or type(owner) is not dict
        or type(workflow) is not dict
        or type(input_value) is not dict
        or input_value.get("type") != operation_type
    ):
        raise ValueError("processing consent requires exact capability wire input")
    payload = {
        "schemaVersion": "axwise.processing-consent-binding.v1",
        "provider": "google",
        "purpose": operation_type,
        "operationId": str(UUID(str(operation_id))),
        "owner": owner,
        "workflow": workflow,
        "contractVersion": contract_version,
        "input": {
            key: value
            for key, value in input_value.items()
            if key != "processingConsent"
        },
    }
    validate_capability_structure(payload)
    return canonical_hash(payload)


def validate_processing_consent(
    consent: CapabilityProcessingConsentV1,
    *,
    operation_type: str,
    operation_id: UUID | str,
    owner: dict[str, Any],
    workflow: dict[str, Any],
    contract_version: str,
    input_value: dict[str, Any],
) -> CapabilityProcessingConsentV1:
    checked = CapabilityProcessingConsentV1.model_validate(consent)
    if (
        checked.operation_id != UUID(str(operation_id))
        or checked.purpose != operation_type
        or checked.binding_hash
        != processing_consent_binding_hash(
            operation_type=operation_type,
            operation_id=operation_id,
            owner=owner,
            workflow=workflow,
            contract_version=contract_version,
            input_value=input_value,
        )
    ):
        raise ValueError("processing consent does not bind this exact operation")
    return checked


__all__ = [
    "CapabilityProcessingConsentV1",
    "PROCESSING_NOTICE_VERSION",
    "ProcessingPurpose",
    "processing_consent_binding_hash",
    "validate_processing_consent",
]
