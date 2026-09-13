from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

import pytest

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    canonical_hash,
)
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    OperationService,
    response_for,
)
from backend.services.workflow_v2.operation_store import (
    OperationConflict,
    OperationEventBatch,
    OperationEventRecord,
    OperationRecord,
)
from backend.tests.workflow_v2.factories import scope_completion_result


pytestmark = pytest.mark.contract


def envelope() -> AxWiseOperationEnvelope:
    input_payload = {
        "type": "CompileScopeV2",
        "request": "Create an Estonia cat-food launch PRD.",
        "objectiveOnlyContext": [],
        "safeDefaults": {
            "geography": [],
            "acceptedSourceTypes": [],
            "assumptions": [],
            "limits": [],
            "policies": [],
        },
    }
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000011",
            "operationType": "CompileScopeV2",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000012",
                "organizationId": None,
                "userId": "user_operationtest123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000013",
                "stageId": "00000000-0000-4000-8000-000000000014",
                "stageAttemptId": "00000000-0000-4000-8000-000000000015",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )


def terminal_result() -> dict:
    result = scope_completion_result(
        artifact_id="00000000-0000-4000-8000-000000000020"
    )
    result["metrics"] = {
        "latencyMs": 7,
        "provider": "google",
        "model": "gemini-3.8-flash",
        "modelVersion": "gemini-3.8-flash-001",
    }
    return result


class MemoryStore:
    def __init__(self) -> None:
        self.record: OperationRecord | None = None
        self.envelope_payload = None
        self.adoptions = 0

    def adopt_or_create(self, value: AxWiseOperationEnvelope) -> OperationRecord:
        self.adoptions += 1
        payload = value.model_dump(mode="json", by_alias=True)
        if self.record:
            if payload != self.envelope_payload:
                raise OperationConflict("changed envelope")
            return self.record
        self.envelope_payload = payload
        self.record = OperationRecord(
            operation_id=value.operation_id,
            tenant_id=value.owner.tenant_id,
            canonical_input_hash=value.canonical_input_hash,
            status="accepted",
            result_payload=None,
            retryable=None,
            error_class=None,
        )
        return self.record

    def get(self, tenant_id, operation_id):
        if (
            self.record
            and self.record.tenant_id == tenant_id
            and self.record.operation_id == operation_id
        ):
            return self.record
        return None


@pytest.mark.asyncio
async def test_submit_only_persists_and_duplicate_nonterminal_stays_202_shape() -> None:
    store = MemoryStore()
    service = OperationService(store)
    operation = envelope()
    status_url = (
        "https://axwise.test/v2/operations/00000000-0000-4000-8000-000000000011"
        "?tenantId=00000000-0000-4000-8000-000000000012"
    )

    first = await service.submit(operation, status_url)
    second = await service.submit(operation, status_url)

    assert first == second
    assert first.status == "accepted"
    assert first.status_url == status_url
    assert store.adoptions == 2


@pytest.mark.asyncio
async def test_lost_terminal_response_adopts_exact_stored_result_without_enqueue() -> None:
    store = MemoryStore()
    service = OperationService(store)
    operation = envelope()
    await service.submit(operation, "https://axwise.test/status")
    store.record = replace(
        store.record, status="completed", result_payload=terminal_result()
    )

    duplicate = await service.submit(operation, "https://attacker.invalid/ignored")
    polled = await service.status(
        operation.owner.tenant_id, operation.operation_id, "https://axwise.test/status"
    )

    assert duplicate.status == "completed"
    assert duplicate == polled
    assert duplicate.result.model_dump(
        mode="json", by_alias=True, exclude_unset=True
    ) == terminal_result()


@pytest.mark.asyncio
async def test_status_lookup_is_tenant_scoped() -> None:
    store = MemoryStore()
    service = OperationService(store)
    operation = envelope()
    await service.submit(operation, "https://axwise.test/status")

    assert await service.status(
        "00000000-0000-4000-8000-000000000099",
        operation.operation_id,
        "https://axwise.test/status",
    ) is None


def test_failure_response_exposes_only_safe_persisted_retry_diagnostics() -> None:
    operation = envelope()
    failure = CognitiveExecutionFailure(
        "AXWISE_RESEARCH_UNAVAILABLE",
        retryable=True,
        retry_at="2026-09-02T10:15:30Z",
        diagnostics={
            "route": "searxng_direct_fetch",
            "status": "unavailable",
            "elapsed_ms": 81,
            "fallback_attempted": True,
            "raw_error": "provider response must never cross the boundary",
            "primary": {
                "route": "gemini_google_search",
                "status": "retry_exhausted",
                "elapsed_ms": 0,
                "call_count": 0,
                "retry_count": 0,
                "primary_skipped": True,
                "retry_after_seconds": 37,
                "prompt": "private input",
            },
            "fallback": {
                "route": "searxng_direct_fetch",
                "status": "unavailable",
                "response_body": "private upstream body",
                "discovery": {
                    "route": "searxng",
                    "status": "unavailable",
                    "call_count": 1,
                },
            },
        },
    )
    record = OperationRecord(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="failed",
        result_payload=None,
        retryable=failure.retryable,
        error_class=failure.error_class,
        retry_at=failure.retry_at,
        retry_after_seconds=failure.retry_after_seconds,
        failure_diagnostics=failure.diagnostics,
    )

    payload = response_for(
        record,
        "https://axwise.test/status",
        now=datetime(2026, 9, 2, 10, 15, 7, tzinfo=timezone.utc),
    ).model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )

    assert payload["retryAt"] == "2026-09-02T10:15:30Z"
    assert payload["retryAfterSeconds"] == 23
    assert payload["diagnostics"] == {
        "route": "searxng_direct_fetch",
        "status": "unavailable",
        "elapsedMs": 81,
        "fallbackAttempted": True,
        "primary": {
            "route": "gemini_google_search",
            "status": "retry_exhausted",
            "elapsedMs": 0,
            "callCount": 0,
            "retryCount": 0,
            "primarySkipped": True,
            "circuitState": "open",
            "retryAfterSeconds": 23,
        },
        "fallback": {
            "route": "searxng_direct_fetch",
            "status": "unavailable",
        },
        "discovery": {
            "route": "searxng",
            "status": "unavailable",
            "callCount": 1,
        },
    }
    serialized = str(payload)
    assert "private input" not in serialized
    assert "private upstream body" not in serialized
    assert "provider response" not in serialized


def test_legacy_failure_response_omits_additive_runtime_fields() -> None:
    operation = envelope()
    record = OperationRecord(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="failed",
        result_payload=None,
        retryable=False,
        error_class="AXWISE_INVALID_INPUT",
    )

    payload = response_for(record, "https://axwise.test/status").model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )

    assert payload == {
        "operationId": str(operation.operation_id),
        "status": "failed",
        "canonicalInputHash": operation.canonical_input_hash,
        "retryable": False,
        "errorClass": "AXWISE_INVALID_INPUT",
    }


def test_expired_absolute_retry_time_removes_stale_relative_guidance() -> None:
    operation = envelope()
    record = OperationRecord(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="failed",
        result_payload=None,
        retryable=True,
        error_class="AXWISE_RESEARCH_UNAVAILABLE",
        retry_at="2026-09-02T10:15:30Z",
        retry_after_seconds=450,
        failure_diagnostics={
            "route": "gemini_google_search",
            "status": "unavailable",
            "retry_after_seconds": 450,
        },
    )

    payload = response_for(
        record,
        "https://axwise.test/status",
        now=datetime(2026, 9, 2, 10, 16, tzinfo=timezone.utc),
    ).model_dump(mode="json", by_alias=True, exclude_unset=True)

    assert payload["retryAt"] == "2026-09-02T10:15:30Z"
    assert "retryAfterSeconds" not in payload
    assert "retryAfterSeconds" not in payload["diagnostics"]


@pytest.mark.asyncio
async def test_cancel_and_event_cursor_map_persisted_lifecycle_contracts() -> None:
    class LifecycleStore(MemoryStore):
        def request_cancel(self, tenant_id, operation_id):
            if self.get(tenant_id, operation_id) is None:
                return None
            self.record = replace(self.record, status="cancel_requested")
            return self.record

        def events_after(self, tenant_id, operation_id, *, after, limit):
            assert self.get(tenant_id, operation_id) is not None
            rows = (
                OperationEventRecord(
                    operation_id=operation_id,
                    sequence=2,
                    event_type="running",
                    status="running",
                    occurred_at="2026-09-02T10:15:00Z",
                ),
                OperationEventRecord(
                    operation_id=operation_id,
                    sequence=3,
                    event_type="cancel_requested",
                    status="cancel_requested",
                    occurred_at="2026-09-02T10:15:01Z",
                ),
            )
            selected = tuple(row for row in rows if row.sequence > after)
            return OperationEventBatch(events=selected[:limit], has_more=False)

    store = LifecycleStore()
    service = OperationService(store)
    operation = envelope()
    await service.submit(operation, "https://axwise.test/status")

    cancelled = await service.cancel(
        operation.owner.tenant_id,
        operation.operation_id,
        "https://axwise.test/status",
    )
    page = await service.events(
        operation.owner.tenant_id,
        operation.operation_id,
        after=1,
        limit=10,
    )

    assert cancelled is not None and cancelled.status == "cancel_requested"
    assert page is not None
    assert page.next_after == 3
    assert [event.event_type for event in page.events] == [
        "running",
        "cancel_requested",
    ]


@pytest.mark.asyncio
async def test_failed_event_recomputes_relative_cooldown_from_absolute_time() -> None:
    operation = envelope()

    class FailedEventStore(MemoryStore):
        def events_after(self, tenant_id, operation_id, *, after, limit):
            return OperationEventBatch(
                events=(
                    OperationEventRecord(
                        operation_id=operation_id,
                        sequence=4,
                        event_type="failed",
                        status="failed",
                        occurred_at="2026-09-02T10:15:00Z",
                        retryable=True,
                        error_class="AXWISE_RESEARCH_UNAVAILABLE",
                        retry_at="2026-09-02T10:15:30Z",
                        retry_after_seconds=450,
                        failure_diagnostics={
                            "route": "gemini_google_search",
                            "status": "unavailable",
                            "retry_after_seconds": 450,
                            "fallback": {
                                "route": "searxng_direct_fetch",
                                "status": "unavailable",
                                "retry_after_seconds": 450,
                            },
                            "discovery": {
                                "route": "searxng",
                                "status": "unavailable",
                                "retry_after_seconds": 450,
                            },
                        },
                    ),
                ),
                has_more=False,
            )

    store = FailedEventStore()
    store.record = OperationRecord(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="failed",
        result_payload=None,
        retryable=True,
        error_class="AXWISE_RESEARCH_UNAVAILABLE",
    )
    page = await OperationService(store).events(
        operation.owner.tenant_id,
        operation.operation_id,
        after=3,
        limit=10,
        now=datetime(2026, 9, 2, 10, 16, tzinfo=timezone.utc),
    )

    assert page is not None
    payload = page.events[0].model_dump(mode="json", by_alias=True, exclude_unset=True)
    assert payload["retryAt"] == "2026-09-02T10:15:30Z"
    assert "retryAfterSeconds" not in payload
    assert "retryAfterSeconds" not in payload["diagnostics"]
    assert "retryAfterSeconds" not in payload["diagnostics"]["fallback"]
    assert "retryAfterSeconds" not in payload["diagnostics"]["discovery"]
