from __future__ import annotations

import asyncio
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
    is_final_synthesis,
    single_execution_reclaim_error,
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


def _discard_task_result(task: asyncio.Task[CompletionResult]) -> None:
    try:
        task.result()
    except (asyncio.CancelledError, Exception):
        pass


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
        self._detached_executions: set[asyncio.Task[CompletionResult]] = set()

    async def close(self) -> None:
        if self._detached_executions:
            detached = set(self._detached_executions)
            for task in detached:
                task.cancel()
            done, _pending = await asyncio.wait(
                detached,
                timeout=self._cancellation_grace_seconds(),
            )
            for task in done:
                self._finish_detached_execution(task)
        if self._detached_executions:
            logger.warning(
                "axwise_workflow_v2 %s",
                {
                    "state": "executor_close_deferred",
                    "retainedExecutionCount": len(self._detached_executions),
                    "deploymentRevision": os.getenv("K_REVISION", "local"),
                },
            )
            return
        close = getattr(self.executor, "close", None)
        if callable(close):
            outcome = close()
            if inspect.isawaitable(outcome):
                try:
                    await asyncio.wait_for(
                        outcome,
                        timeout=self._cancellation_grace_seconds(),
                    )
                except asyncio.TimeoutError:
                    logger.error(
                        "axwise_workflow_v2 %s",
                        {
                            "state": "executor_close_timeout",
                            "deploymentRevision": os.getenv("K_REVISION", "local"),
                        },
                    )

    async def run_once(self) -> bool:
        # A provider coroutine that suppressed cancellation still consumes the
        # worker's one cognition slot. Never accumulate a second execution.
        if self._detached_executions:
            return False
        token = uuid4()
        claim = await asyncio.to_thread(self.store.claim_next, token, self.lease_seconds)
        if claim is None:
            return False
        _log_state(claim, "claimed")
        if await self._cancel_if_requested(claim):
            return True
        final_synthesis = is_final_synthesis(claim.envelope)
        reclaim_error = single_execution_reclaim_error(claim.envelope)
        if reclaim_error is not None and (
            type(claim.execution_count) is not int or claim.execution_count != 1
        ):
            # Even a crash before the first provider request cannot authorize a
            # second spend from an old capability opt-in or final-repair budget.
            # Only the durable counter from this exact locked claim is accepted;
            # unknown counts fail closed. This is not an exactly-once provider
            # guarantee or a lifetime token/dollar ledger for the first execution.
            await self._fail(
                claim,
                retryable=False,
                error_class=reclaim_error,
            )
            return True
        started = time.monotonic()
        execution = asyncio.create_task(self.executor.execute(claim.envelope))
        try:
            while not execution.done():
                try:
                    await asyncio.wait_for(
                        asyncio.shield(execution), timeout=self.heartbeat_seconds
                    )
                except asyncio.TimeoutError:
                    if await self._cancel_if_requested(claim, execution):
                        return True
                    renewed = await asyncio.to_thread(
                        self.store.renew,
                        claim.envelope.owner.tenant_id,
                        claim.envelope.operation_id,
                        claim.lease_token,
                        self.lease_seconds,
                    )
                    if not renewed:
                        if await self._cancel_if_requested(claim, execution):
                            return True
                        await self._cancel_and_drain_execution(
                            claim,
                            execution,
                            reason="lease_lost",
                        )
                        _log_state(claim, "lease_lost")
                        return True
                    _log_state(claim, "heartbeat")
            result = await execution
        except asyncio.CancelledError:
            await self._cancel_and_drain_execution(
                claim,
                execution,
                reason="worker_cancelled",
            )
            _log_state(claim, "worker_cancelled")
            raise
        except CognitiveExecutionFailure as error:
            if await self._cancel_if_requested(claim):
                return True
            await self._fail(
                claim,
                retryable=error.retryable and not final_synthesis,
                error_class=error.error_class,
                retry_at=error.retry_at if not final_synthesis else None,
                retry_after_seconds=(
                    error.retry_after_seconds if not final_synthesis else None
                ),
                failure_diagnostics=error.diagnostics,
                evidence_diagnostics=error.evidence_diagnostics,
            )
            return True
        except ModelHTTPError as error:
            if await self._cancel_if_requested(claim):
                return True
            status = error.status_code
            await self._fail(
                claim,
                retryable=not final_synthesis and (status in {408, 429} or status >= 500),
                error_class=f"AXWISE_MODEL_HTTP_{status}",
            )
            return True
        except Exception as error:
            if not execution.done():
                await self._cancel_and_drain_execution(
                    claim,
                    execution,
                    reason="unexpected_failure",
                )
            _log_state(
                claim,
                "unexpected_failure",
                errorType=type(error).__name__,
            )
            if await self._cancel_if_requested(claim):
                return True
            await self._fail(
                claim,
                retryable=not final_synthesis,
                error_class="AXWISE_EXECUTION_ERROR",
            )
            return True
        if await self._cancel_if_requested(claim):
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
            if await self._cancel_if_requested(claim):
                return True
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
        self,
        claim: ClaimedOperation,
        *,
        retryable: bool,
        error_class: str,
        retry_at: str | None = None,
        retry_after_seconds: int | None = None,
        failure_diagnostics: dict[str, object] | None = None,
        evidence_diagnostics: dict[str, object] | None = None,
    ) -> None:
        try:
            await asyncio.to_thread(
                self.store.fail,
                claim.envelope.owner.tenant_id,
                claim.envelope.operation_id,
                claim.lease_token,
                retryable=retryable,
                error_class=error_class,
                retry_at=retry_at,
                retry_after_seconds=retry_after_seconds,
                failure_diagnostics=failure_diagnostics,
            )
        except StaleOperationLease:
            if await self._cancel_if_requested(claim):
                return
            _log_state(claim, "stale_failure_rejected", errorClass=error_class)
            return
        _log_state(
            claim,
            "failed",
            retryable=retryable,
            errorClass=error_class,
            retryAfterSeconds=retry_after_seconds,
            **(
                {"evidenceDiagnostics": evidence_diagnostics}
                if evidence_diagnostics is not None
                else {}
            ),
        )

    async def _cancel_if_requested(
        self,
        claim: ClaimedOperation,
        execution: asyncio.Task[CompletionResult] | None = None,
    ) -> bool:
        requested = claim.record.status == "cancel_requested" or await asyncio.to_thread(
            self.store.cancellation_requested,
            claim.envelope.owner.tenant_id,
            claim.envelope.operation_id,
            claim.lease_token,
        )
        if not requested:
            return False
        if execution is not None and not execution.done():
            await self._cancel_and_drain_execution(
                claim,
                execution,
                reason="cancel_requested",
            )
        try:
            await asyncio.to_thread(
                self.store.cancel,
                claim.envelope.owner.tenant_id,
                claim.envelope.operation_id,
                claim.lease_token,
            )
        except StaleOperationLease:
            _log_state(claim, "stale_cancel_rejected")
            return True
        _log_state(claim, "cancelled")
        return True

    def _cancellation_grace_seconds(self) -> float:
        return min(1.0, max(0.01, self.heartbeat_seconds))

    async def _cancel_and_drain_execution(
        self,
        claim: ClaimedOperation,
        execution: asyncio.Task[CompletionResult],
        *,
        reason: str,
    ) -> bool:
        if execution.done():
            _discard_task_result(execution)
            return True
        execution.cancel()
        done, _pending = await asyncio.wait(
            {execution},
            timeout=self._cancellation_grace_seconds(),
        )
        if execution in done:
            _discard_task_result(execution)
            return True
        if execution not in self._detached_executions:
            self._detached_executions.add(execution)
            execution.add_done_callback(self._finish_detached_execution)
        _log_state(
            claim,
            "cancellation_grace_expired",
            cancellationReason=reason,
        )
        return False

    def _finish_detached_execution(
        self,
        task: asyncio.Task[CompletionResult],
    ) -> None:
        self._detached_executions.discard(task)
        _discard_task_result(task)

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
