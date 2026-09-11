from __future__ import annotations

from dataclasses import replace

import pytest

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    canonical_hash,
)
from backend.services.workflow_v2.operation_service import OperationService
from backend.services.workflow_v2.operation_store import OperationConflict, OperationRecord
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
    result["metrics"] = {"latencyMs": 7, "provider": "google"}
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
