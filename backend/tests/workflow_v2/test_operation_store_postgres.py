import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope, canonical_hash
from backend.services.workflow_v2.operation_store import (
    OperationConflict,
    PostgresOperationStore,
    StaleOperationLease,
)


pytestmark = pytest.mark.contract
DATABASE_URL = os.getenv("AXWISE_V2_TEST_DATABASE_URL")
if not DATABASE_URL:
    pytest.skip("AXWISE_V2_TEST_DATABASE_URL is not configured", allow_module_level=True)


def envelope(request_text="Create an Estonia cat-food launch PRD."):
    input_payload = {
        "type": "CompileScopeV2",
        "request": request_text,
        "mode": "simple",
        "objectiveOnlyContext": [],
        "safeDefaults": {},
    }
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000101",
            "operationType": "CompileScopeV2",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000102",
                "organizationId": None,
                "userId": "user_pgstoretest123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000103",
                "stageId": "00000000-0000-4000-8000-000000000104",
                "stageAttemptId": "00000000-0000-4000-8000-000000000105",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )


@pytest.fixture
def store():
    engine = create_engine(DATABASE_URL)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE axwise.cognitive_operations"))
    yield PostgresOperationStore(engine)
    engine.dispose()


def test_same_id_hash_adopts_result_and_changed_input_conflicts(store):
    operation = envelope()
    first = store.adopt_or_create(operation)
    assert first.status == "accepted"
    assert store.adopt_or_create(operation) == first

    changed = envelope("Create a Latvia cat-food launch PRD.")
    with pytest.raises(OperationConflict):
        store.adopt_or_create(changed)


def test_terminal_result_is_immutable_and_stale_lease_cannot_finalize(store):
    operation = envelope()
    store.adopt_or_create(operation)
    lease = uuid4()
    assert store.claim(operation.operation_id, lease)
    result = {
        "artifact": {
            "artifactId": "00000000-0000-4000-8000-000000000106",
            "artifactHash": "a" * 64,
            "kind": "scope",
            "contentType": "application/json",
            "payload": {"schemaVersion": "axwise.scope.v2"},
            "markdown": None,
            "sourceArtifactIds": [],
        },
        "evidenceReadiness": None,
        "planning": None,
        "executionOutputContractSatisfied": None,
        "directPromotionArtifact": None,
    }
    store.complete(operation.operation_id, lease, result)
    adopted = store.adopt_or_create(operation)
    assert adopted.status == "completed"
    assert adopted.result_payload == result

    with pytest.raises(StaleOperationLease):
        store.complete(operation.operation_id, lease, result)
    with store.engine.begin() as connection, pytest.raises(DBAPIError):
        connection.execute(
            text("DELETE FROM axwise.cognitive_operations WHERE operation_id = :id"),
            {"id": operation.operation_id},
        )
