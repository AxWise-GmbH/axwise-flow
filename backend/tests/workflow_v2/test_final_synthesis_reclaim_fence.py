"""No-network regressions for the single final-repair execution claim budget."""

from __future__ import annotations

import asyncio
import copy
import json
import socket
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import TypeAdapter
from pydantic_ai.exceptions import ModelHTTPError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    canonical_hash,
)
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    OperationService,
)
from backend.services.workflow_v2.operation_store import (
    ClaimedOperation,
    PostgresOperationStore,
    StaleOperationLease,
    _stored_envelope_payload,
    single_execution_reclaim_error,
)
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.test_operation_service import MemoryStore, envelope
from backend.tests.workflow_v2.test_operation_worker import Store as WorkerStore


pytestmark = pytest.mark.contract
CASES = {
    case["name"]: case
    for case in json.loads(
        (
            Path(__file__).with_name("fixtures") / "synthesize_artifact_v1_golden.json"
        ).read_text()
    )["cases"]
}
FINAL_RECLAIM_ERROR = "AXWISE_FINAL_SYNTHESIS_RECLAIM_FORBIDDEN"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("reclaim fence regressions must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def synthesis_operation(case_name="final_synthesis"):
    value = envelope().model_dump(mode="json", by_alias=True)
    payload = copy.deepcopy(CASES[case_name]["input"])
    value.update(
        operationType="SynthesizeArtifactV1",
        input=payload,
        canonicalInputHash=canonical_hash(payload),
    )
    return AxWiseOperationEnvelope.model_validate(value)


def completion(case_name="final_synthesis"):
    return TypeAdapter(CompletionResult).validate_python(CASES[case_name]["result"])


class ExecutorSpy:
    def __init__(self, case_name="final_synthesis"):
        self.case_name = case_name
        self.calls = self.writer_calls = self.reviewer_calls = 0

    async def execute(self, operation):
        self.calls += 1
        if operation.input.purpose == "final_synthesis":
            self.writer_calls += 1
            self.reviewer_calls += 1
        return completion(self.case_name)


def fixed_claim_store(operation, count, **kwargs):
    store = WorkerStore(**kwargs)
    store.claim = replace(
        store.claim,
        envelope=operation,
        execution_count=count,
        record=replace(
            store.claim.record,
            operation_id=operation.operation_id,
            tenant_id=operation.owner.tenant_id,
            canonical_input_hash=operation.canonical_input_hash,
        ),
    )
    return store


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [2, 3, None, 0, -1, True, False, "1", 1.0])
async def test_reclaimed_or_untrusted_final_count_cannot_start_writer_or_reviewer(
    count,
):
    store = fixed_claim_store(synthesis_operation(), count)
    spy = ExecutorSpy()
    worker = OperationWorker(store, spy, lease_seconds=30, heartbeat_seconds=5)
    assert await worker.run_once() is True
    assert spy.calls == spy.writer_calls == spy.reviewer_calls == 0
    assert store.completed is None
    assert store.failed["error_class"] == FINAL_RECLAIM_ERROR
    assert store.failed["retryable"] is False
    assert store.failed["retry_at"] is None


@pytest.mark.asyncio
async def test_exact_first_final_claim_runs_writer_and_reviewer_once():
    store = fixed_claim_store(synthesis_operation(), 1)
    spy = ExecutorSpy()
    worker = OperationWorker(store, spy, lease_seconds=30, heartbeat_seconds=5)
    assert await worker.run_once() is True
    assert spy.calls == spy.writer_calls == spy.reviewer_calls == 1
    assert store.failed is None
    assert store.completed["resultType"] == "artifact_synthesized"
    assert await worker.run_once() is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case_name", ["execute_task", "evaluate_output_repair", "blocked_report"]
)
@pytest.mark.parametrize("count", [None, 2])
async def test_other_synthesis_purposes_keep_existing_reclaim_behavior(
    case_name, count
):
    operation = synthesis_operation(case_name)
    assert single_execution_reclaim_error(operation) is None
    store = fixed_claim_store(operation, count)
    spy = ExecutorSpy(case_name)
    assert await OperationWorker(store, spy).run_once() is True
    assert spy.calls == 1
    assert store.failed is None
    assert store.completed is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [2, None, True])
async def test_final_cancellation_wins_before_reclaim_fence(count):
    store = fixed_claim_store(synthesis_operation(), count)
    store.claim = replace(
        store.claim, record=replace(store.claim.record, status="cancel_requested")
    )
    spy = ExecutorSpy()
    assert await OperationWorker(store, spy).run_once() is True
    assert store.cancelled is True
    assert store.failed is store.completed is None
    assert spy.calls == 0


@pytest.mark.asyncio
async def test_stale_reclaim_failure_cannot_overwrite_current_lease():
    class StaleFailureStore(WorkerStore):
        def fail(self, *_args, **_kwargs):
            raise StaleOperationLease("a newer worker owns finalization")

    store = StaleFailureStore()
    configured = fixed_claim_store(synthesis_operation(), 2)
    store.claim = configured.claim
    spy = ExecutorSpy()
    assert await OperationWorker(store, spy).run_once() is True
    assert spy.calls == 0
    assert store.failed is store.completed is None


def executor_failure(kind):
    if kind.startswith("http_"):
        return ModelHTTPError(
            int(kind.removeprefix("http_")),
            "fixture-model",
            body="PRIVATE_UPSTREAM_PAYLOAD_716",
        )
    if kind == "cognitive":
        return CognitiveExecutionFailure(
            "AXWISE_TRANSIENT_FIXTURE_FAILURE",
            retryable=True,
            retry_at="2030-01-01T00:00:00Z",
            retry_after_seconds=17,
        )
    return RuntimeError("PRIVATE_UPSTREAM_PAYLOAD_716")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case_name",
    ["final_synthesis", "execute_task", "evaluate_output_repair", "blocked_report"],
)
@pytest.mark.parametrize(
    "failure",
    ["http_408", "http_429", "http_500", "http_400", "unexpected", "cognitive"],
)
async def test_final_failure_never_schedules_new_paid_attempt_other_purposes_unchanged(
    case_name, failure, caplog
):
    class FailingExecutor:
        async def execute(self, _operation):
            raise executor_failure(failure)

    store = fixed_claim_store(synthesis_operation(case_name), 1)
    worker = OperationWorker(store, FailingExecutor())
    assert await worker.run_once() is True
    assert store.completed is None
    expected_retry = case_name != "final_synthesis" and failure != "http_400"
    assert store.failed["retryable"] is expected_retry
    if case_name == "final_synthesis":
        assert store.failed["retry_at"] is None
        assert store.failed["retry_after_seconds"] is None
    elif failure == "cognitive":
        assert store.failed["retry_at"] == "2030-01-01T00:00:00Z"
        assert store.failed["retry_after_seconds"] == 17
    assert "PRIVATE_UPSTREAM_PAYLOAD_716" not in caplog.text
    assert "PRIVATE_UPSTREAM_PAYLOAD_716" not in json.dumps(store.failed)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["http_500", "unexpected", "cognitive"])
async def test_cancellation_during_failed_final_execution_still_wins(failure):
    store = fixed_claim_store(synthesis_operation(), 1)

    class CancelThenFail:
        async def execute(self, _operation):
            store.cancel_requested = True
            raise executor_failure(failure)

    assert await OperationWorker(store, CancelThenFail()).run_once() is True
    assert store.cancelled is True
    assert store.failed is store.completed is None


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def first(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value


class ClaimConnection:
    """Recording fake for the real PostgresOperationStore claim mapping."""

    def __init__(self, operation, count):
        self.count = count
        self.calls = []
        self.active = False
        self.entered = self.exited = 0
        self.row = SimpleNamespace(
            operation_id=operation.operation_id,
            tenant_id=operation.owner.tenant_id,
            canonical_input_hash=operation.canonical_input_hash,
            input_payload=_stored_envelope_payload(operation),
            status="running",
            result_payload=None,
            retryable=None,
            error_class=None,
        )

    def __enter__(self):
        self.entered += 1
        self.active = True
        return self

    def __exit__(self, *_args):
        self.exited += 1
        self.active = False

    def execute(self, statement, parameters):
        assert self.active
        sql = str(statement)
        self.calls.append((sql, parameters))
        if "claim_cognitive_operation" in sql:
            return ScalarResult(self.row)
        if "set_config('axwise.tenant_id'" in sql:
            return ScalarResult(None)
        assert "SELECT execution_count" in sql
        return ScalarResult(self.count)


@pytest.mark.parametrize("count", [1, 2, None, 0, True])
def test_postgres_final_claim_reads_counter_inside_same_locked_transaction(count):
    operation = synthesis_operation()
    connection = ClaimConnection(operation, count)
    store = PostgresOperationStore(SimpleNamespace(begin=lambda: connection))
    token = uuid4()
    claim = store.claim_next(token, 30)
    assert type(claim.execution_count) is type(count)
    assert claim.execution_count == count
    assert connection.entered == connection.exited == 1
    assert len(connection.calls) == 3
    first, tenant, counter = connection.calls
    assert "claim_cognitive_operation" in first[0]
    assert tenant[1] == {"tenant_id": str(operation.owner.tenant_id)}
    assert counter[1] == {
        "tenant_id": operation.owner.tenant_id,
        "operation_id": operation.operation_id,
        "lease_token": token,
    }
    for predicate in (
        "tenant_id = :tenant_id",
        "operation_id = :operation_id",
        "lease_token = :lease_token",
        "status IN ('running', 'cancel_requested')",
        "lease_expires_at > clock_timestamp()",
    ):
        assert predicate in counter[0]


@pytest.mark.parametrize(
    "case_name", ["execute_task", "evaluate_output_repair", "blocked_report"]
)
def test_postgres_other_synthesis_claims_do_not_add_counter_query(case_name):
    operation = synthesis_operation(case_name)
    connection = ClaimConnection(operation, 2)
    store = PostgresOperationStore(SimpleNamespace(begin=lambda: connection))
    claim = store.claim_next(uuid4(), 30)
    assert claim.execution_count is None
    assert len(connection.calls) == 1


class MemoryLeaseStore(MemoryStore):
    """Test-only durable-row model; production continues using SQL004 unchanged."""

    def __init__(self, operation):
        super().__init__()
        self.operation = operation
        self.adopt_or_create(operation)
        self.execution_count = 0
        self.lease_token = None
        self.expired = False

    def claim_next(self, token, _seconds):
        if self.record.status not in {"accepted", "running", "cancel_requested"}:
            return None
        if self.record.status == "running" and not self.expired:
            return None
        self.execution_count += 1
        self.lease_token = token
        self.expired = False
        self.record = replace(self.record, status="running")
        return ClaimedOperation(
            record=self.record,
            envelope=self.operation,
            lease_token=token,
            execution_count=self.execution_count,
        )

    def _valid_lease(self, tenant, operation, token):
        if (
            tenant != self.record.tenant_id
            or operation != self.record.operation_id
            or token != self.lease_token
            or self.expired
            or self.record.status != "running"
        ):
            raise StaleOperationLease("stale lease")

    def fail(self, tenant, operation, token, **failure):
        self._valid_lease(tenant, operation, token)
        self.record = replace(
            self.record,
            status="failed",
            error_class=failure["error_class"],
            retryable=failure["retryable"],
        )

    def complete(self, tenant, operation, token, value):
        self._valid_lease(tenant, operation, token)
        self.record = replace(self.record, status="completed", result_payload=value)

    def cancellation_requested(self, *_args):
        return False

    def renew(self, tenant, operation, token, _seconds):
        try:
            self._valid_lease(tenant, operation, token)
        except StaleOperationLease:
            return False
        return True


@pytest.mark.asyncio
async def test_crash_before_provider_still_requires_new_final_operation():
    operation = synthesis_operation()
    store = MemoryLeaseStore(operation)
    first = store.claim_next(uuid4(), 30)
    assert first.execution_count == 1
    store.expired = True
    spy = ExecutorSpy()
    worker = OperationWorker(store, spy)
    assert await worker.run_once() is True
    assert store.execution_count == 2
    assert spy.calls == 0
    assert store.record.status == "failed"
    assert store.record.error_class == FINAL_RECLAIM_ERROR
    assert store.record.retryable is False
    with pytest.raises(StaleOperationLease):
        store.complete(
            operation.owner.tenant_id, operation.operation_id, first.lease_token, {}
        )
    replay = await OperationService(store).submit(
        operation, "https://local.invalid/status"
    )
    assert replay.status == "failed"
    assert replay.retryable is False
    assert await worker.run_once() is False


@pytest.mark.asyncio
async def test_reclaim_fences_second_provider_and_late_first_completion():
    class HeldExecutor(ExecutorSpy):
        def __init__(self):
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def execute(self, operation):
            self.started.set()
            await self.release.wait()
            return await super().execute(operation)

    store = MemoryLeaseStore(synthesis_operation())
    first, second = HeldExecutor(), ExecutorSpy()
    first_task = asyncio.create_task(OperationWorker(store, first).run_once())
    try:
        await asyncio.wait_for(first.started.wait(), timeout=1)
        store.expired = True
        assert await OperationWorker(store, second).run_once() is True
        assert store.record.error_class == FINAL_RECLAIM_ERROR
        first.release.set()
        assert await asyncio.wait_for(first_task, timeout=1) is True
    finally:
        first.release.set()
        if not first_task.done():
            first_task.cancel()
            await asyncio.gather(first_task, return_exceptions=True)
    assert first.calls == 1
    assert second.calls == 0
    assert store.record.status == "failed"
    assert store.record.result_payload is None


@pytest.mark.asyncio
async def test_normal_core_reclaim_still_completes_with_new_lease():
    store = MemoryLeaseStore(synthesis_operation("execute_task"))
    old = store.claim_next(uuid4(), 30)
    store.expired = True
    spy = ExecutorSpy("execute_task")
    assert await OperationWorker(store, spy).run_once() is True
    assert store.execution_count == 2
    assert spy.calls == 1
    assert store.record.status == "completed"
    with pytest.raises(StaleOperationLease):
        store.complete(
            store.operation.owner.tenant_id,
            store.operation.operation_id,
            old.lease_token,
            {},
        )
