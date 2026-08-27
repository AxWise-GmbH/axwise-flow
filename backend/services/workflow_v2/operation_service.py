from __future__ import annotations

import asyncio
from typing import Protocol
from uuid import UUID, uuid4

from pydantic_ai.exceptions import ModelHTTPError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    OperationAccepted,
    OperationCompleted,
    OperationFailed,
    OperationResponse,
)
from backend.services.workflow_v2.operation_store import OperationRecord


class CognitiveExecutionFailure(RuntimeError):
    def __init__(self, error_class: str, *, retryable: bool) -> None:
        super().__init__(error_class)
        self.error_class = error_class
        self.retryable = retryable


class CognitiveExecutor(Protocol):
    async def execute(self, envelope: AxWiseOperationEnvelope) -> CompletionResult: ...


class OperationStore(Protocol):
    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord: ...
    def get(self, operation_id: UUID) -> OperationRecord | None: ...
    def claim(self, operation_id: UUID, lease_token: UUID, lease_seconds: int = 600) -> bool: ...
    def complete(self, operation_id: UUID, lease_token: UUID, result: dict) -> None: ...
    def fail(
        self,
        operation_id: UUID,
        lease_token: UUID,
        *,
        retryable: bool,
        error_class: str,
    ) -> None: ...


def response_for(record: OperationRecord, status_url: str) -> OperationResponse:
    common = {
        "operation_id": record.operation_id,
        "canonical_input_hash": record.canonical_input_hash,
    }
    if record.status == "completed":
        return OperationCompleted(
            **common,
            status="completed",
            result=CompletionResult.model_validate(record.result_payload),
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
    def __init__(
        self,
        store: OperationStore,
        executor: CognitiveExecutor,
        *,
        lease_seconds: int = 600,
    ) -> None:
        self.store = store
        self.executor = executor
        self.lease_seconds = lease_seconds

    async def submit(
        self,
        envelope: AxWiseOperationEnvelope,
        status_url: str,
    ) -> OperationResponse:
        record = await asyncio.to_thread(self.store.adopt_or_create, envelope)
        if record.status in {"completed", "failed"}:
            return response_for(record, status_url)

        lease_token = uuid4()
        claimed = await asyncio.to_thread(
            self.store.claim,
            envelope.operation_id,
            lease_token,
            self.lease_seconds,
        )
        if not claimed:
            current = await asyncio.to_thread(self.store.get, envelope.operation_id)
            if current is None:
                raise RuntimeError("adopted operation disappeared")
            return response_for(current, status_url)

        try:
            result = await self.executor.execute(envelope)
        except asyncio.CancelledError:
            raise
        except CognitiveExecutionFailure as error:
            await asyncio.to_thread(
                self.store.fail,
                envelope.operation_id,
                lease_token,
                retryable=error.retryable,
                error_class=error.error_class,
            )
        except ModelHTTPError as error:
            status = error.status_code
            await asyncio.to_thread(
                self.store.fail,
                envelope.operation_id,
                lease_token,
                retryable=status in {408, 429} or status >= 500,
                error_class=f"AXWISE_MODEL_HTTP_{status}",
            )
        except Exception:
            await asyncio.to_thread(
                self.store.fail,
                envelope.operation_id,
                lease_token,
                retryable=True,
                error_class="AXWISE_EXECUTION_ERROR",
            )
        else:
            await asyncio.to_thread(
                self.store.complete,
                envelope.operation_id,
                lease_token,
                result.model_dump(mode="json", by_alias=True),
            )

        terminal = await asyncio.to_thread(self.store.get, envelope.operation_id)
        if terminal is None:
            raise RuntimeError("terminal operation disappeared")
        return response_for(terminal, status_url)

    async def status(self, operation_id: UUID, status_url: str) -> OperationResponse | None:
        record = await asyncio.to_thread(self.store.get, operation_id)
        return response_for(record, status_url) if record else None
