from dataclasses import replace
from uuid import UUID

import pytest
from pydantic_ai.exceptions import ModelHTTPError

from backend.domain.workflow_v2.contracts import (
    ArtifactFact,
    AxWiseOperationEnvelope,
    CompletionResult,
    canonical_hash,
)
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import OperationConflict, OperationRecord

pytestmark = pytest.mark.contract


def envelope() -> AxWiseOperationEnvelope:
    input_payload = {
        "type": "CompileScopeV2",
        "request": "Create an Estonia cat-food launch PRD.",
        "mode": "simple",
        "objectiveOnlyContext": [],
        "safeDefaults": {},
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


class MemoryStore:
    def __init__(self):
        self.record = None
        self.envelope_payload = None
        self.lease = None

    def adopt_or_create(self, value):
        payload = value.model_dump(mode="json", by_alias=True)
        if self.record:
            if payload != self.envelope_payload:
                raise OperationConflict("changed envelope")
            return self.record
        self.envelope_payload = payload
        self.record = OperationRecord(
            value.operation_id, value.canonical_input_hash, "accepted", None, None, None
        )
        return self.record

    def get(self, _operation_id):
        return self.record

    def claim(self, _operation_id, lease_token, _lease_seconds):
        if self.lease:
            return False
        self.lease = lease_token
        self.record = replace(self.record, status="running")
        return True

    def complete(self, _operation_id, lease_token, result):
        assert lease_token == self.lease
        self.record = replace(self.record, status="completed", result_payload=result)

    def fail(self, _operation_id, lease_token, *, retryable, error_class):
        assert lease_token == self.lease
        self.record = replace(
            self.record,
            status="failed",
            retryable=retryable,
            error_class=error_class,
        )


class Executor:
    def __init__(self):
        self.calls = 0

    async def execute(self, _envelope):
        self.calls += 1
        payload = {"schemaVersion": "axwise.scope.v2", "objective": "test"}
        return CompletionResult(
            artifact=ArtifactFact(
                artifactId="00000000-0000-4000-8000-000000000020",
                artifactHash=canonical_hash(payload),
                kind="scope",
                payload=payload,
            )
        )


@pytest.mark.asyncio
async def test_lost_post_response_adopts_same_immutable_result():
    store = MemoryStore()
    executor = Executor()
    service = OperationService(store, executor)
    operation = envelope()

    first = await service.submit(operation, "https://axwise.test/v2/operations/11")
    second = await service.submit(operation, "https://axwise.test/v2/operations/11")

    assert first == second
    assert first.status == "completed"
    assert executor.calls == 1
    assert set(store.record.result_payload) == {"artifact"}


@pytest.mark.asyncio
async def test_invalid_model_request_is_terminal_and_not_provider_retried():
    class InvalidRequestExecutor:
        async def execute(self, _envelope):
            raise ModelHTTPError(400, "models/gemini-3.7-flash", {"status": "INVALID_ARGUMENT"})

    store = MemoryStore()
    service = OperationService(store, InvalidRequestExecutor())
    result = await service.submit(envelope(), "https://axwise.test/v2/operations/11")

    assert result.status == "failed"
    assert result.retryable is False
    assert result.error_class == "AXWISE_MODEL_HTTP_400"
