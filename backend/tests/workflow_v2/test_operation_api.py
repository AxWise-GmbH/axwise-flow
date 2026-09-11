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
from backend.services.workflow_v2.operation_store import OperationRecord
from backend.tests.workflow_v2.factories import scope_completion_result


pytestmark = pytest.mark.contract
SCOPE_COMPLETION_GOLDEN = (
    Path(__file__).with_name("fixtures") / "scope_completion_result_v2.json"
)


class Store:
    def __init__(self) -> None:
        self.record = None

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
        return self.record

    def get(self, tenant_id, operation_id):
        if (
            self.record
            and self.record.tenant_id == tenant_id
            and self.record.operation_id == operation_id
        ):
            return self.record
        return None


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
