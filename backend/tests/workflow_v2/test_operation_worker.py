from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    OperationMetrics,
    ScopeCompiledResult,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import (
    ClaimedOperation,
    OperationRecord,
    StaleOperationLease,
)
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.factories import scope_completion_result
from backend.tests.workflow_v2.test_operation_service import envelope

pytestmark = pytest.mark.contract
COMPILE_SCOPE_V3_FIXTURE = (
    Path(__file__).with_name("fixtures") / "compile_scope_envelope_v3.json"
)


def result() -> ScopeCompiledResult:
    return ScopeCompiledResult.model_validate(
        scope_completion_result(
            artifact_id="00000000-0000-4000-8000-000000000301"
        )
    )


class Store:
    def __init__(self, *, renews: bool = True, stale_finalize: bool = False) -> None:
        operation = envelope()
        self.claim = ClaimedOperation(
            record=OperationRecord(
                operation_id=operation.operation_id,
                tenant_id=operation.owner.tenant_id,
                canonical_input_hash=operation.canonical_input_hash,
                status="running",
                result_payload=None,
                retryable=None,
                error_class=None,
            ),
            envelope=operation,
            lease_token=uuid4(),
        )
        self.renews = renews
        self.stale_finalize = stale_finalize
        self.renew_calls = 0
        self.completed = None
        self.failed = None
        self.claimed = False
        self.cancel_requested = False
        self.cancelled = False

    def claim_next(self, _token, _seconds):
        if self.claimed:
            return None
        self.claimed = True
        return self.claim

    def renew(self, *_args):
        self.renew_calls += 1
        return self.renews

    def complete(self, _tenant, _operation, _token, value):
        if self.stale_finalize:
            raise StaleOperationLease("stale")
        self.completed = value

    def cancellation_requested(self, *_args):
        return self.cancel_requested

    def cancel(self, *_args):
        if self.stale_finalize:
            raise StaleOperationLease("stale")
        self.cancelled = True

    def fail(
        self,
        _tenant,
        _operation,
        _token,
        *,
        retryable,
        error_class,
        retry_at=None,
        retry_after_seconds=None,
        failure_diagnostics=None,
    ):
        self.failed = {
            "retryable": retryable,
            "error_class": error_class,
            "retry_at": retry_at,
            "retry_after_seconds": retry_after_seconds,
            "failure_diagnostics": failure_diagnostics,
        }


class SlowExecutor:
    async def execute(self, _operation):
        await asyncio.sleep(0.035)
        return result()


class CancellationDefiantExecutor:
    def __init__(self, *, ignored_cancellations: int | None = 1) -> None:
        self.ignored_cancellations = ignored_cancellations
        self.cancellation_count = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.finished = asyncio.Event()
        self.close_started = asyncio.Event()
        self.closed = asyncio.Event()

    async def execute(self, _operation):
        self.started.set()
        try:
            while not self.release.is_set():
                try:
                    await self.release.wait()
                except asyncio.CancelledError:
                    self.cancellation_count += 1
                    if (
                        self.ignored_cancellations is not None
                        and self.cancellation_count > self.ignored_cancellations
                    ):
                        raise
            return result()
        finally:
            self.finished.set()

    async def close(self):
        self.close_started.set()
        await self.finished.wait()
        self.closed.set()


@pytest.mark.asyncio
async def test_worker_heartbeats_long_execution_and_persists_one_terminal_result() -> None:
    store = Store()
    worker = OperationWorker(store, SlowExecutor(), lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    assert await worker.run_once() is True
    assert store.renew_calls >= 2
    assert store.completed["resultType"] == "scope_compiled"
    assert store.completed["artifact"]["markdown"] is None
    assert store.completed["metrics"]["latencyMs"] >= 1
    assert await worker.run_once() is False


@pytest.mark.asyncio
async def test_worker_processes_compile_scope_v2_and_v3_claims_in_one_queue() -> None:
    class MixedStore(Store):
        def __init__(self) -> None:
            super().__init__()
            v3 = AxWiseOperationEnvelope.model_validate(
                json.loads(COMPILE_SCOPE_V3_FIXTURE.read_text(encoding="utf-8"))
            )
            self.claims = [
                self.claim,
                ClaimedOperation(
                    record=OperationRecord(
                        operation_id=v3.operation_id,
                        tenant_id=v3.owner.tenant_id,
                        canonical_input_hash=v3.canonical_input_hash,
                        status="running",
                        result_payload=None,
                        retryable=None,
                        error_class=None,
                    ),
                    envelope=v3,
                    lease_token=uuid4(),
                ),
            ]
            self.operation_types_by_id = {
                str(claim.envelope.operation_id): claim.envelope.operation_type
                for claim in self.claims
            }
            self.completed_types: list[str] = []

        def claim_next(self, _token, _seconds):
            return self.claims.pop(0) if self.claims else None

        def complete(self, _tenant, operation_id, _token, _value):
            self.completed_types.append(self.operation_types_by_id[str(operation_id)])

    class RecordingExecutor:
        def __init__(self) -> None:
            self.operation_types: list[str] = []

        async def execute(self, operation):
            self.operation_types.append(operation.operation_type)
            return result()

    store = MixedStore()
    executor = RecordingExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert await worker.run_once() is True
    assert await worker.run_once() is False
    assert executor.operation_types == ["CompileScopeV2", "CompileScopeV3"]
    assert store.completed_types == ["CompileScopeV2", "CompileScopeV3"]


@pytest.mark.asyncio
async def test_worker_losing_lease_cannot_finalize() -> None:
    store = Store(renews=False)
    worker = OperationWorker(store, SlowExecutor(), lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    assert await worker.run_once() is True
    assert store.renew_calls == 1
    assert store.completed is None
    assert store.failed is None


@pytest.mark.asyncio
async def test_lease_loss_boundedly_retains_defiant_execution() -> None:
    store = Store(renews=False)
    executor = CancellationDefiantExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    assert await asyncio.wait_for(worker.run_once(), timeout=0.25) is True
    assert store.renew_calls == 1
    assert worker._detached_executions
    store.claimed = False
    assert await worker.run_once() is False
    assert store.claimed is False

    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert executor.finished.is_set()
    assert executor.closed.is_set()


@pytest.mark.asyncio
async def test_worker_classifies_retryable_cognitive_failure_without_result() -> None:
    class FailingExecutor:
        async def execute(self, _operation):
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_DEADLINE", retryable=True)

    store = Store()
    worker = OperationWorker(store, FailingExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.failed == {
        "retryable": True,
        "error_class": "AXWISE_RESEARCH_DEADLINE",
        "retry_at": None,
        "retry_after_seconds": None,
        "failure_diagnostics": None,
    }
    assert store.completed is None


@pytest.mark.asyncio
async def test_worker_persists_safe_cooldown_metadata_from_cognitive_failure() -> None:
    class FailingExecutor:
        async def execute(self, _operation):
            raise CognitiveExecutionFailure(
                "AXWISE_RESEARCH_UNAVAILABLE",
                retryable=True,
                retry_at="2026-09-02T10:15:30Z",
                diagnostics={
                    "route": "gemini_google_search",
                    "status": "retry_exhausted",
                    "elapsed_ms": 0,
                    "call_count": 0,
                    "retry_count": 0,
                    "primary_skipped": True,
                    "retry_after_seconds": 23,
                    "raw_provider_response": "secret",
                },
            )

    store = Store()
    worker = OperationWorker(store, FailingExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.failed == {
        "retryable": True,
        "error_class": "AXWISE_RESEARCH_UNAVAILABLE",
        "retry_at": "2026-09-02T10:15:30Z",
        "retry_after_seconds": 23,
        "failure_diagnostics": {
            "route": "gemini_google_search",
            "status": "retry_exhausted",
            "elapsed_ms": 0,
            "call_count": 0,
            "retry_count": 0,
            "primary_skipped": True,
            "circuit_state": "open",
            "retry_after_seconds": 23,
        },
    }


@pytest.mark.asyncio
async def test_projection_failure_flows_through_worker_failure_boundary() -> None:
    class ProjectingExecutor:
        async def execute(self, _operation):
            return project_assistant_result(
                {
                    "text": "",
                    "runtime_diagnostics": {
                        "route": "gemini_google_search",
                        "status": "retry_exhausted",
                        "retry_after_seconds": 23,
                        "provider_body": "must not persist",
                    },
                },
                response_mode="one_shot",
                source_type_classifier=lambda _url, _title: set(),
                usage_reader=lambda _raw: (0, 0, 0, 0),
                metrics_factory=lambda **_values: OperationMetrics(latency_ms=0),
            )

    store = Store()
    worker = OperationWorker(
        store,
        ProjectingExecutor(),
        lease_seconds=30,
        heartbeat_seconds=5,
    )

    assert await worker.run_once() is True
    assert store.failed is not None
    assert store.failed["retryable"] is True
    assert store.failed["error_class"] == "AXWISE_ASSISTANT_EMPTY_RESPONSE"
    assert store.failed["retry_after_seconds"] == 23
    assert store.failed["retry_at"] is not None
    assert store.failed["failure_diagnostics"] == {
        "route": "gemini_google_search",
        "status": "retry_exhausted",
        "retry_after_seconds": 23,
    }


@pytest.mark.asyncio
async def test_stale_finalize_is_rejected_without_overwriting_winner() -> None:
    class FastExecutor:
        async def execute(self, _operation):
            return result()

    store = Store(stale_finalize=True)
    worker = OperationWorker(store, FastExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.completed is None


@pytest.mark.asyncio
async def test_worker_finalizes_claimed_cancel_without_starting_executor() -> None:
    class MustNotRun:
        async def execute(self, _operation):
            raise AssertionError("cancelled claims must not start cognition")

    store = Store()
    store.cancel_requested = True
    store.claim = ClaimedOperation(
        record=replace(store.claim.record, status="cancel_requested"),
        envelope=store.claim.envelope,
        lease_token=store.claim.lease_token,
    )
    worker = OperationWorker(store, MustNotRun(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.cancelled is True
    assert store.completed is None


@pytest.mark.asyncio
async def test_worker_cooperatively_cancels_running_executor() -> None:
    class BlockingExecutor:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.cancelled = asyncio.Event()

        async def execute(self, _operation):
            self.started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise

    store = Store()
    executor = BlockingExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    running = asyncio.create_task(worker.run_once())
    await executor.started.wait()
    store.cancel_requested = True

    assert await running is True
    assert executor.cancelled.is_set()
    assert store.cancelled is True
    assert store.completed is None
    assert store.failed is None


@pytest.mark.asyncio
async def test_worker_cancellation_does_not_wait_forever_for_defiant_provider() -> None:
    class DefiantExecutor:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def execute(self, _operation):
            self.started.set()
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                await self.release.wait()
            return result()

    store = Store()
    executor = DefiantExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    running = asyncio.create_task(worker.run_once())
    await executor.started.wait()
    store.cancel_requested = True

    assert await asyncio.wait_for(running, timeout=0.25) is True
    assert store.cancelled is True
    store.claimed = False
    assert await worker.run_once() is False
    assert store.claimed is False
    executor.release.set()
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_worker_retries_retained_task_cancellation_before_executor_close() -> None:
    class CloseOrderingExecutor:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.finished = asyncio.Event()
            self.closed = asyncio.Event()

        async def execute(self, _operation):
            self.started.set()
            try:
                try:
                    await asyncio.Event().wait()
                except asyncio.CancelledError:
                    await asyncio.Event().wait()
            finally:
                self.finished.set()

        async def close(self):
            await self.finished.wait()
            self.closed.set()

    store = Store()
    executor = CloseOrderingExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01
    running = asyncio.create_task(worker.run_once())
    await executor.started.wait()
    store.cancel_requested = True

    assert await asyncio.wait_for(running, timeout=0.25) is True
    assert worker._detached_executions
    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert executor.finished.is_set()
    assert executor.closed.is_set()
    assert not worker._detached_executions


@pytest.mark.asyncio
async def test_run_forever_cancellation_boundedly_retains_defiant_execution() -> None:
    store = Store()
    executor = CancellationDefiantExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01
    running = asyncio.create_task(worker.run_forever(idle_seconds=0.01))
    await executor.started.wait()

    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(running, timeout=0.25)

    assert worker._detached_executions
    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert executor.finished.is_set()
    assert executor.closed.is_set()


@pytest.mark.asyncio
async def test_heartbeat_exception_boundedly_retains_defiant_execution() -> None:
    class BrokenHeartbeatStore(Store):
        def renew(self, *_args):
            self.renew_calls += 1
            raise RuntimeError("database heartbeat unavailable")

    store = BrokenHeartbeatStore()
    executor = CancellationDefiantExecutor()
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    assert await asyncio.wait_for(worker.run_once(), timeout=0.25) is True
    assert worker._detached_executions
    assert store.failed is not None
    assert store.failed["error_class"] == "AXWISE_EXECUTION_ERROR"

    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert executor.finished.is_set()
    assert executor.closed.is_set()


@pytest.mark.asyncio
async def test_close_defers_executor_shutdown_while_task_ignores_repeated_cancel() -> None:
    store = Store()
    executor = CancellationDefiantExecutor(ignored_cancellations=None)
    worker = OperationWorker(store, executor, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01
    running = asyncio.create_task(worker.run_once())
    await executor.started.wait()
    store.cancel_requested = True

    assert await asyncio.wait_for(running, timeout=0.25) is True
    assert worker._detached_executions
    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert not executor.close_started.is_set()
    assert worker._detached_executions

    executor.release.set()
    await asyncio.wait_for(executor.finished.wait(), timeout=0.25)
    await asyncio.sleep(0)
    await asyncio.wait_for(worker.close(), timeout=0.25)
    assert executor.closed.is_set()


@pytest.mark.asyncio
async def test_cancel_request_wins_race_against_completion_finalize() -> None:
    class CompletionRaceStore(Store):
        def complete(self, *_args):
            self.cancel_requested = True
            raise StaleOperationLease("cancel won")

    class FastExecutor:
        async def execute(self, _operation):
            return result()

    store = CompletionRaceStore()
    worker = OperationWorker(store, FastExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.cancelled is True
    assert store.completed is None
