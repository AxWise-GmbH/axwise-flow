from __future__ import annotations

import asyncio
from typing import Protocol
from uuid import UUID

from pydantic import TypeAdapter

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    OperationAccepted,
    OperationCompleted,
    OperationFailed,
    OperationResponse,
)
from backend.services.workflow_v2.operation_store import OperationRecord


_COMPLETION_RESULT_ADAPTER = TypeAdapter(CompletionResult)


class CognitiveExecutionFailure(RuntimeError):
    def __init__(self, error_class: str, *, retryable: bool) -> None:
        super().__init__(error_class)
        self.error_class = error_class
        self.retryable = retryable


class OperationStore(Protocol):
    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord: ...

    def get(self, tenant_id: UUID, operation_id: UUID) -> OperationRecord | None: ...


def response_for(record: OperationRecord, status_url: str) -> OperationResponse:
    common = {
        "operation_id": record.operation_id,
        "canonical_input_hash": record.canonical_input_hash,
    }
    if record.status == "completed":
        return OperationCompleted(
            **common,
            status="completed",
            result=_COMPLETION_RESULT_ADAPTER.validate_python(record.result_payload),
        )
    if record.status == "failed":
        return OperationFailed(
            **common,
            status="failed",
            retryable=bool(record.retryable),
            error_class=record.error_class or "AXWISE_FAILED",
        )
    return OperationAccepted(
        **common,
        status="running" if record.status == "running" else "accepted",
        status_url=status_url,
        retry_after_seconds=2,
    )


class OperationService:
    """Persist/adopt only; the dedicated worker owns all cognition."""

    def __init__(self, store: OperationStore) -> None:
        self.store = store

    async def submit(
        self,
        envelope: AxWiseOperationEnvelope,
        status_url: str,
    ) -> OperationResponse:
        record = await asyncio.to_thread(self.store.adopt_or_create, envelope)
        return response_for(record, status_url)

    async def status(
        self, tenant_id: UUID, operation_id: UUID, status_url: str
    ) -> OperationResponse | None:
        record = await asyncio.to_thread(self.store.get, tenant_id, operation_id)
        return response_for(record, status_url) if record else None
