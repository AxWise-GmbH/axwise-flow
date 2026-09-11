from __future__ import annotations

import asyncio
import contextlib
import hashlib
import inspect
import logging
import os
import time
from typing import Protocol
from uuid import UUID, uuid4

from pydantic_ai.exceptions import ModelHTTPError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    OperationMetrics,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import (
    ClaimedOperation,
    PostgresOperationStore,
    StaleOperationLease,
)


logger = logging.getLogger(__name__)


class CognitiveExecutor(Protocol):
    async def execute(self, envelope: AxWiseOperationEnvelope) -> CompletionResult: ...


def _lease_fingerprint(token: UUID) -> str:
    return hashlib.sha256(str(token).encode("ascii")).hexdigest()[:12]


def _log_state(claim: ClaimedOperation, state: str, **values: object) -> None:
    envelope = claim.envelope
    fields = {
        "tenantId": str(envelope.owner.tenant_id),
        "runId": str(envelope.workflow.run_id),
        "stageId": str(envelope.workflow.stage_id),
        "stageAttemptId": str(envelope.workflow.stage_attempt_id),
        "operationId": str(envelope.operation_id),
        "operationType": envelope.operation_type,
        "state": state,
        "leaseFingerprint": _lease_fingerprint(claim.lease_token),
        "deploymentRevision": os.getenv("K_REVISION", "local"),
        **values,
    }
    logger.info("axwise_workflow_v2 %s", fields)


class OperationWorker:
    def __init__(
        self,
        store: PostgresOperationStore,
        executor: CognitiveExecutor,
        *,
        lease_seconds: int = 600,
        heartbeat_seconds: int = 30,
    ) -> None:
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("worker lease must be between 30 and 3600 seconds")
        if not 5 <= heartbeat_seconds < lease_seconds // 2:
            raise ValueError("heartbeat must be at least 5s and less than half the lease")
        self.store = store
        self.executor = executor
        self.lease_seconds = lease_seconds
        self.heartbeat_seconds = heartbeat_seconds

    async def close(self) -> None:
        close = getattr(self.executor, "close", None)
        if callable(close):
            outcome = close()
            if inspect.isawaitable(outcome):
                await outcome

    async def run_once(self) -> bool:
        token = uuid4()
        claim = await asyncio.to_thread(self.store.claim_next, token, self.lease_seconds)
        if claim is None:
            return False
        _log_state(claim, "claimed")
        started = time.monotonic()
        execution = asyncio.create_task(self.executor.execute(claim.envelope))
        lease_lost = False
        try:
            while not execution.done():
                try:
                    await asyncio.wait_for(
                        asyncio.shield(execution), timeout=self.heartbeat_seconds
                    )
                except asyncio.TimeoutError:
                    renewed = await asyncio.to_thread(
                        self.store.renew,
                        claim.envelope.owner.tenant_id,
                        claim.envelope.operation_id,
                        claim.lease_token,
                        self.lease_seconds,
                    )
                    if not renewed:
                        lease_lost = True
                        execution.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await execution
                        _log_state(claim, "lease_lost")
                        return True
                    _log_state(claim, "heartbeat")
            result = await execution
        except asyncio.CancelledError:
            execution.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await execution
            _log_state(claim, "worker_cancelled")
            raise
        except CognitiveExecutionFailure as error:
            await self._fail(claim, retryable=error.retryable, error_class=error.error_class)
            return True
        except ModelHTTPError as error:
            status = error.status_code
            await self._fail(
                claim,
                retryable=status in {408, 429} or status >= 500,
                error_class=f"AXWISE_MODEL_HTTP_{status}",
            )
            return True
        except Exception as error:
            if not execution.done():
                execution.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await execution
            _log_state(
                claim,
                "unexpected_failure",
                errorType=type(error).__name__,
            )
            await self._fail(
                claim, retryable=True, error_class="AXWISE_EXECUTION_ERROR"
            )
            return True
        if lease_lost:
            return True

        latency_ms = max(1, round((time.monotonic() - started) * 1000))
        metrics = result.metrics or OperationMetrics(latency_ms=latency_ms)
        metrics = metrics.model_copy(update={"latency_ms": latency_ms})
        result = result.model_copy(update={"metrics": metrics})
        try:
            await asyncio.to_thread(
                self.store.complete,
                claim.envelope.owner.tenant_id,
                claim.envelope.operation_id,
                claim.lease_token,
                result.model_dump(mode="json", by_alias=True, exclude_unset=True),
            )
        except StaleOperationLease:
            _log_state(claim, "stale_finalize_rejected", latencyMs=latency_ms)
            return True
        _log_state(
            claim,
            "completed",
            latencyMs=latency_ms,
            inputTokens=metrics.input_tokens,
            outputTokens=metrics.output_tokens,
            totalTokens=metrics.total_tokens,
            searchCalls=metrics.search_calls,
            estimatedCostMicros=metrics.estimated_cost_micros,
        )
        return True

    async def _fail(
        self, claim: ClaimedOperation, *, retryable: bool, error_class: str
    ) -> None:
        try:
            await asyncio.to_thread(
                self.store.fail,
                claim.envelope.owner.tenant_id,
                claim.envelope.operation_id,
                claim.lease_token,
                retryable=retryable,
                error_class=error_class,
            )
        except StaleOperationLease:
            _log_state(claim, "stale_failure_rejected", errorClass=error_class)
            return
        _log_state(
            claim, "failed", retryable=retryable, errorClass=error_class
        )

    async def run_forever(
        self, *, stop: asyncio.Event | None = None, idle_seconds: float = 1.0
    ) -> None:
        stop_event = stop or asyncio.Event()
        while not stop_event.is_set():
            try:
                worked = await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.error(
                    "axwise_workflow_v2 %s",
                    {
                        "state": "worker_loop_error",
                        "errorType": type(error).__name__,
                        "deploymentRevision": os.getenv("K_REVISION", "local"),
                    },
                )
                worked = False
            if not worked:
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=idle_seconds)
                except asyncio.TimeoutError:
                    pass
