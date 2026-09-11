from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest

from backend.domain.workflow_v2.contracts import ScopeCompiledResult
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

    def fail(self, _tenant, _operation, _token, *, retryable, error_class):
        self.failed = (retryable, error_class)


class SlowExecutor:
    async def execute(self, _operation):
        await asyncio.sleep(0.035)
        return result()


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
async def test_worker_losing_lease_cannot_finalize() -> None:
    store = Store(renews=False)
    worker = OperationWorker(store, SlowExecutor(), lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01

    assert await worker.run_once() is True
    assert store.renew_calls == 1
    assert store.completed is None
    assert store.failed is None


@pytest.mark.asyncio
async def test_worker_classifies_retryable_cognitive_failure_without_result() -> None:
    class FailingExecutor:
        async def execute(self, _operation):
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_DEADLINE", retryable=True)

    store = Store()
    worker = OperationWorker(store, FailingExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.failed == (True, "AXWISE_RESEARCH_DEADLINE")
    assert store.completed is None


@pytest.mark.asyncio
async def test_stale_finalize_is_rejected_without_overwriting_winner() -> None:
    class FastExecutor:
        async def execute(self, _operation):
            return result()

    store = Store(stale_finalize=True)
    worker = OperationWorker(store, FastExecutor(), lease_seconds=30, heartbeat_seconds=5)

    assert await worker.run_once() is True
    assert store.completed is None
