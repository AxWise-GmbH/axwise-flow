"""New operations reuse API adoption, cancellation, leases and typed result replay."""

from __future__ import annotations

import asyncio
import socket
from dataclasses import replace

import httpx
import pytest
from fastapi import FastAPI

from backend.api.routes.workflow_v2_operations import get_operation_service, router
from backend.api.workflow_v2_app import app as production_app
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import (
    OperationService,
    response_for,
)
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    Generator,
    Resolver,
    admission_input,
    analysis_input,
    corpus_fact,
    envelope,
    scope_fact,
    uid,
)
from backend.tests.workflow_v2.test_operation_api import Store as ApiStore
from backend.tests.workflow_v2.test_operation_worker import Store as WorkerStore
from backend.tests.workflow_v2.simulation_test_support import (
    SimulationGenerator,
    simulation_input,
)


pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("analysis lifecycle tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)
    monkeypatch.setenv("AXWISE_SERVICE_URL", "http://capability.test")


def local_executor(generator=None):
    return GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=Resolver(scope_fact(), corpus_fact()),
        analysis_generator=generator,
        simulation_generator=SimulationGenerator() if generator is not None else None,
    )


def worker_store(operation, **kwargs):
    store = WorkerStore(**kwargs)
    store.claim = replace(
        store.claim,
        envelope=operation,
        execution_count=1,
        record=replace(
            store.claim.record,
            operation_id=operation.operation_id,
            tenant_id=operation.owner.tenant_id,
            canonical_input_hash=operation.canonical_input_hash,
        ),
    )
    return store


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input,result_type",
    [
        (admission_input, "transcript_corpus_admitted"),
        (analysis_input, "evidence_analyzed"),
        (simulation_input, "simulation_completed"),
    ],
)
async def test_private_api_adopts_new_types_then_replays_exact_typed_completion(
    make_input, result_type
):
    operation = envelope(make_input())
    payload = operation.model_dump(mode="json", by_alias=True)
    store = ApiStore()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_operation_service] = lambda: OperationService(store)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://capability.test"
    ) as client:
        response = await client.post(
            "/v2/operations",
            json=payload,
            headers={"Idempotency-Key": str(operation.operation_id)},
        )
        assert response.status_code == 202
        assert response.json()["canonicalInputHash"] == operation.canonical_input_hash
        completed = await local_executor(Generator()).execute(operation)
        store.record = replace(
            store.record,
            status="completed",
            result_payload=completed.model_dump(mode="json", by_alias=True),
        )
        status = await client.get(
            f"/v2/operations/{operation.operation_id}",
            params={"tenantId": str(operation.owner.tenant_id)},
        )
        assert status.status_code == 200
        assert status.json()["result"]["resultType"] == result_type
        assert status.json()["result"]["artifact"] == completed.artifact.model_dump(
            mode="json", by_alias=True
        )
        events = await client.get(
            f"/v2/operations/{operation.operation_id}/events",
            params={"tenantId": str(operation.owner.tenant_id)},
        )
        assert events.json()["events"][0]["eventType"] == "accepted"
        other = await client.get(
            f"/v2/operations/{operation.operation_id}", params={"tenantId": uid(999)}
        )
        assert other.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input", [admission_input, analysis_input, simulation_input]
)
async def test_new_api_types_keep_idempotency_header_and_pending_cancel_behavior(
    make_input,
):
    operation = envelope(make_input())
    store = ApiStore()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_operation_service] = lambda: OperationService(store)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://capability.test"
    ) as client:
        payload = operation.model_dump(mode="json", by_alias=True)
        wrong = await client.post(
            "/v2/operations", json=payload, headers={"Idempotency-Key": uid(998)}
        )
        assert wrong.status_code == 409 and store.record is None
        await client.post(
            "/v2/operations",
            json=payload,
            headers={"Idempotency-Key": str(operation.operation_id)},
        )
        cancelled = await client.post(
            f"/v2/operations/{operation.operation_id}/cancel",
            params={"tenantId": str(operation.owner.tenant_id)},
        )
        assert cancelled.json()["status"] == "cancelled"
        assert store.record.status == "cancelled"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input", [admission_input, analysis_input, simulation_input]
)
async def test_actual_operation_worker_persists_one_typed_capability_artifact(
    make_input, caplog
):
    operation = envelope(make_input())
    store = worker_store(operation)
    worker = OperationWorker(
        store, local_executor(Generator()), lease_seconds=30, heartbeat_seconds=5
    )
    assert await worker.run_once() is True
    assert store.completed is not None and store.failed is None
    assert isinstance(store.completed["artifact"], dict)
    assert "artifacts" not in store.completed
    assert store.completed["metrics"]["budgetScope"] == "invocation"
    assert store.completed["metrics"]["latencyMs"] >= 1
    record = replace(
        store.claim.record, status="completed", result_payload=store.completed
    )
    assert response_for(record, "http://capability.test/status").status == "completed"
    assert "I prefer clear updates" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input", [admission_input, analysis_input, simulation_input]
)
async def test_new_types_cannot_finalize_a_stale_lease(make_input):
    store = worker_store(envelope(make_input()), stale_finalize=True)
    worker = OperationWorker(
        store, local_executor(Generator()), lease_seconds=30, heartbeat_seconds=5
    )
    assert await worker.run_once() is True
    assert store.completed is None and store.failed is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input", [admission_input, analysis_input, simulation_input]
)
async def test_cancelled_before_execution_prevents_new_capability_work(make_input):
    store = worker_store(envelope(make_input()))
    store.cancel_requested = True
    generator = Generator()
    run = local_executor(generator)
    worker = OperationWorker(store, run, lease_seconds=30, heartbeat_seconds=5)
    assert await worker.run_once() is True
    assert store.cancelled is True and store.completed is None
    assert not generator.calls and not run.artifact_resolver.calls


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input,code",
    [
        (analysis_input, "AXWISE_ANALYSIS_GENERATION_DISABLED"),
        (simulation_input, "AXWISE_SIMULATION_GENERATOR_UNAVAILABLE"),
    ],
)
async def test_disabled_capability_is_terminal_failure_not_empty_success(
    make_input, code
):
    store = worker_store(envelope(make_input()))
    worker = OperationWorker(
        store, local_executor(), lease_seconds=30, heartbeat_seconds=5
    )
    assert await worker.run_once() is True
    assert store.completed is None
    assert store.failed["error_class"] == code
    assert store.failed["retryable"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "make_input", [admission_input, analysis_input, simulation_input]
)
async def test_invalid_capability_request_never_echoes_transcript_content(make_input):
    operation = envelope(make_input())
    payload = operation.model_dump(mode="json", by_alias=True)
    payload["input"][
        "private-transcript-marker-never-echo"
    ] = "private-transcript-marker-never-echo"
    store = ApiStore()
    production_app.dependency_overrides[get_operation_service] = (
        lambda: OperationService(store)
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=production_app),
            base_url="http://capability.test",
        ) as client:
            response = await client.post(
                "/v2/operations",
                json=payload,
                headers={"Idempotency-Key": str(operation.operation_id)},
            )
        assert response.status_code == 422
        assert "private-transcript-marker-never-echo" not in response.text
        assert store.record is None
    finally:
        production_app.dependency_overrides.pop(get_operation_service, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
@pytest.mark.parametrize("event", ["cancel", "lease_lost"])
async def test_worker_cancellation_or_lease_loss_stops_inflight_capability(
    make_input, event
):
    class WaitingGenerator:
        def __init__(self):
            self.started = asyncio.Event()
            self.cancelled = asyncio.Event()

        async def analyze(self, *_args, **_kwargs):
            self.started.set()
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled.set()

        generate = analyze

    generator = WaitingGenerator()
    run = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=Resolver(scope_fact(), corpus_fact()),
        analysis_generator=generator,
        simulation_generator=generator,
    )
    store = worker_store(envelope(make_input()))
    worker = OperationWorker(store, run, lease_seconds=30, heartbeat_seconds=5)
    worker.heartbeat_seconds = 0.01
    task = asyncio.create_task(worker.run_once())
    await asyncio.wait_for(generator.started.wait(), timeout=1)
    if event == "cancel":
        store.cancel_requested = True
    else:
        store.renews = False
    assert await asyncio.wait_for(task, timeout=1) is True
    assert generator.cancelled.is_set()
    assert store.completed is store.failed is None
    assert store.cancelled is (event == "cancel")
