from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from backend.api.routes.workflow_v2_operations import get_operation_service, router
from backend.domain.workflow_v2.contracts import canonical_hash
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import (
    OperationEventBatch,
    OperationEventRecord,
    OperationRecord,
)
from backend.tests.workflow_v2.factories import scope_completion_result


pytestmark = pytest.mark.contract
SCOPE_COMPLETION_GOLDEN = (
    Path(__file__).with_name("fixtures") / "scope_completion_result_v2.json"
)


class Store:
    def __init__(self) -> None:
        self.record = None
        self.events = []

    def adopt_or_create(self, envelope):
        if self.record is None:
            self.record = OperationRecord(
                operation_id=envelope.operation_id,
                tenant_id=envelope.owner.tenant_id,
                canonical_input_hash=envelope.canonical_input_hash,
                status="accepted",
                result_payload=None,
                retryable=None,
                error_class=None,
            )
            self.events.append(
                OperationEventRecord(
                    operation_id=envelope.operation_id,
                    sequence=1,
                    event_type="accepted",
                    status="accepted",
                    occurred_at="2026-09-02T10:15:00Z",
                )
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

    def request_cancel(self, tenant_id, operation_id):
        record = self.get(tenant_id, operation_id)
        if record is None:
            return None
        if record.status == "accepted":
            self._append_event("cancel_requested", "cancel_requested")
            self._append_event("cancelled", "cancelled")
            self.record = replace(record, status="cancelled")
        elif record.status == "running":
            self._append_event("cancel_requested", "cancel_requested")
            self.record = replace(record, status="cancel_requested")
        return self.record

    def _append_event(self, event_type, event_status):
        self.events.append(
            OperationEventRecord(
                operation_id=self.record.operation_id,
                sequence=len(self.events) + 1,
                event_type=event_type,
                status=event_status,
                occurred_at="2026-09-02T10:15:01Z",
            )
        )

    def events_after(self, tenant_id, operation_id, *, after, limit):
        if self.get(tenant_id, operation_id) is None:
            return OperationEventBatch(events=(), has_more=False)
        selected = [event for event in self.events if event.sequence > after]
        return OperationEventBatch(
            events=tuple(selected[:limit]),
            has_more=len(selected) > limit,
        )


def operation_payload():
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
    return {
        "operationId": "00000000-0000-4000-8000-000000000202",
        "operationType": "CompileScopeV2",
        "owner": {
            "tenantId": "00000000-0000-4000-8000-000000000203",
            "organizationId": None,
            "userId": "user_operationapi123",
        },
        "workflow": {
            "runId": "00000000-0000-4000-8000-000000000204",
            "stageId": "00000000-0000-4000-8000-000000000205",
            "stageAttemptId": "00000000-0000-4000-8000-000000000206",
        },
        "contractVersion": "axwise.operation.v2",
        "canonicalInputHash": canonical_hash(input_payload),
        "input": input_payload,
    }


def completed_result() -> dict:
    return scope_completion_result()


@pytest.mark.asyncio
async def test_api_immediately_accepts_and_status_url_uses_canonical_origin(
    monkeypatch,
) -> None:
    monkeypatch.setenv("AXWISE_SERVICE_URL", "https://axwise.preview.test/")
    app = FastAPI()
    app.include_router(router)
    store = Store()
    app.dependency_overrides[get_operation_service] = lambda: OperationService(store)
    payload = operation_payload()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="https://host-header.invalid"
    ) as client:
        conflict = await client.post(
            "/v2/operations", headers={"Idempotency-Key": "wrong"}, json=payload
        )
        assert conflict.status_code == 409

        accepted = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": payload["operationId"]},
            json=payload,
        )
        assert accepted.status_code == 202
        assert accepted.headers["retry-after"] == "2"
        body = accepted.json()
        assert body["status"] == "accepted"
        assert body["statusUrl"] == (
            f"https://axwise.preview.test/v2/operations/{payload['operationId']}"
            f"?tenantId={payload['owner']['tenantId']}"
        )

        missing_tenant = await client.get(f"/v2/operations/{payload['operationId']}")
        assert missing_tenant.status_code == 422
        wrong_tenant = await client.get(
            f"/v2/operations/{payload['operationId']}",
            params={"tenantId": "00000000-0000-4000-8000-000000000299"},
        )
        assert wrong_tenant.status_code == 404

        store.record = replace(
            store.record, status="completed", result_payload=completed_result()
        )
        terminal = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": payload["operationId"]},
            json=payload,
        )
        assert terminal.status_code == 200
        assert terminal.json()["result"] == completed_result()
    assert terminal.json()["result"] == json.loads(
        SCOPE_COMPLETION_GOLDEN.read_text(encoding="utf-8")
    )


@pytest.mark.asyncio
async def test_api_exposes_cursor_events_and_idempotent_cancellation(monkeypatch) -> None:
    monkeypatch.setenv("AXWISE_SERVICE_URL", "https://axwise.preview.test")
    app = FastAPI()
    app.include_router(router)
    store = Store()
    app.dependency_overrides[get_operation_service] = lambda: OperationService(store)
    payload = operation_payload()
    tenant_id = payload["owner"]["tenantId"]
    operation_id = payload["operationId"]
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="https://axwise.preview.test"
    ) as client:
        accepted = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": operation_id},
            json=payload,
        )
        assert accepted.status_code == 202
        store.record = replace(store.record, status="running")
        store._append_event("running", "running")

        first_page = await client.get(
            f"/v2/operations/{operation_id}/events",
            params={"tenantId": tenant_id, "after": 0, "limit": 2},
        )
        assert first_page.status_code == 200
        assert [event["eventType"] for event in first_page.json()["events"]] == [
            "accepted",
            "running",
        ]
        assert first_page.json()["nextAfter"] == 2

        cancelled = await client.post(
            f"/v2/operations/{operation_id}/cancel",
            params={"tenantId": tenant_id},
        )
        duplicate = await client.post(
            f"/v2/operations/{operation_id}/cancel",
            params={"tenantId": tenant_id},
        )
        resubmitted = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": operation_id},
            json=payload,
        )
        assert cancelled.status_code == 202
        assert cancelled.headers["retry-after"] == "2"
        assert cancelled.json()["status"] == "cancel_requested"
        assert duplicate.status_code == 202
        assert resubmitted.status_code == 202
        assert resubmitted.headers["retry-after"] == "2"
        assert len(
            [event for event in store.events if event.event_type == "cancel_requested"]
        ) == 1

        next_page = await client.get(
            f"/v2/operations/{operation_id}/events",
            params={"tenantId": tenant_id, "after": 2},
        )
        assert next_page.json()["nextAfter"] == 3
        assert next_page.json()["hasMore"] is False
        assert next_page.json()["events"][0]["status"] == "cancel_requested"

        hidden = await client.get(
            f"/v2/operations/{operation_id}/events",
            params={"tenantId": "00000000-0000-4000-8000-000000000299"},
        )
        assert hidden.status_code == 404
