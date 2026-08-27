from dataclasses import replace

import httpx
import pytest
from fastapi import FastAPI

from backend.api.routes.workflow_v2_operations import get_operation_service, router
from backend.domain.workflow_v2.contracts import ArtifactFact, CompletionResult, canonical_hash
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import OperationRecord


pytestmark = pytest.mark.contract


class Store:
    def __init__(self):
        self.record = None
        self.lease = None

    def adopt_or_create(self, envelope):
        if not self.record:
            self.record = OperationRecord(
                envelope.operation_id,
                envelope.canonical_input_hash,
                "accepted",
                None,
                None,
                None,
            )
        return self.record

    def get(self, _operation_id):
        return self.record

    def claim(self, _operation_id, token, _seconds):
        if self.lease:
            return False
        self.lease = token
        self.record = replace(self.record, status="running")
        return True

    def complete(self, _operation_id, token, result):
        assert token == self.lease
        self.record = replace(self.record, status="completed", result_payload=result)

    def fail(self, *_args, **_kwargs):
        raise AssertionError("unexpected failure")


class Executor:
    async def execute(self, _envelope):
        payload = {"schemaVersion": "axwise.scope.v2"}
        return CompletionResult(
            artifact=ArtifactFact(
                artifactId="00000000-0000-4000-8000-000000000201",
                artifactHash=canonical_hash(payload),
                kind="scope",
                payload=payload,
            )
        )


def operation_payload():
    input_payload = {
        "type": "CompileScopeV2",
        "request": "Create an Estonia cat-food launch PRD.",
        "mode": "simple",
        "objectiveOnlyContext": [],
        "safeDefaults": {},
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


@pytest.mark.asyncio
async def test_operation_api_requires_exact_idempotency_key_and_adopts_result():
    app = FastAPI()
    app.include_router(router)
    executor = Executor()
    service = OperationService(Store(), executor)
    app.dependency_overrides[get_operation_service] = lambda: service
    transport = httpx.ASGITransport(app=app)
    payload = operation_payload()
    async with httpx.AsyncClient(transport=transport, base_url="https://axwise.test") as client:
        conflict = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": "wrong"},
            json=payload,
        )
        assert conflict.status_code == 409

        completed = await client.post(
            "/v2/operations",
            headers={"Idempotency-Key": payload["operationId"]},
            json=payload,
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == "completed"
        assert set(completed.json()["result"]) == {"artifact"}

        status_response = await client.get(f"/v2/operations/{payload['operationId']}")
        assert status_response.status_code == 200
        assert status_response.json() == completed.json()
