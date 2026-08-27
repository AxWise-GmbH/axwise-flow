from __future__ import annotations

import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
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
if "test" not in make_url(DATABASE_URL).database:
    pytest.skip("refusing to mutate a database not named as a test DB", allow_module_level=True)


def role_url(role: str) -> str:
    return make_url(DATABASE_URL).set(username=role, password=None).render_as_string(
        hide_password=False
    )


@pytest.fixture(scope="session")
def engines():
    admin = create_engine(DATABASE_URL)
    with admin.begin() as connection:
        assert connection.execute(
            text("SELECT to_regclass('axwise.cognitive_operations') IS NOT NULL")
        ).scalar_one()
        connection.exec_driver_sql(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axwise_v2_api_test') THEN
                CREATE ROLE axwise_v2_api_test LOGIN;
              END IF;
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axwise_v2_worker_test') THEN
                CREATE ROLE axwise_v2_worker_test LOGIN;
              END IF;
            END
            $$;
            GRANT axwise_v2_api TO axwise_v2_api_test;
            GRANT axwise_v2_worker TO axwise_v2_worker_test;
            """
        )
    api = create_engine(role_url("axwise_v2_api_test"))
    worker = create_engine(role_url("axwise_v2_worker_test"))
    with api.connect() as connection:
        assert connection.execute(text("SELECT current_user")).scalar_one() == "axwise_v2_api_test"
        assert connection.execute(
            text(
                "SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname = current_user"
            )
        ).scalar_one()
    with worker.connect() as connection:
        assert connection.execute(text("SELECT current_user")).scalar_one() == "axwise_v2_worker_test"
        assert connection.execute(
            text(
                "SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname = current_user"
            )
        ).scalar_one()
    yield admin, api, worker
    api.dispose()
    worker.dispose()
    admin.dispose()


@pytest.fixture
def stores(engines):
    admin, api, worker = engines
    with admin.begin() as connection:
        connection.execute(text("TRUNCATE axwise.cognitive_operations"))
    return (
        admin,
        PostgresOperationStore(api),
        PostgresOperationStore(worker),
    )


def envelope(
    request_text: str = "Create an Estonia cat-food launch PRD.",
    *,
    operation_id: str = "00000000-0000-4000-8000-000000000101",
    tenant_id: str = "00000000-0000-4000-8000-000000000102",
    attempt_id: str = "00000000-0000-4000-8000-000000000105",
):
    input_payload = {
        "type": "CompileScopeV2",
        "request": request_text,
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
            "operationId": operation_id,
            "operationType": "CompileScopeV2",
            "owner": {
                "tenantId": tenant_id,
                "organizationId": None,
                "userId": "user_pgstoretest123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000103",
                "stageId": "00000000-0000-4000-8000-000000000104",
                "stageAttemptId": attempt_id,
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )


def completion_result() -> dict:
    return {
        "resultType": "scope_compiled",
        "artifact": {
            "artifactId": "00000000-0000-4000-8000-000000000106",
            "artifactHash": "a" * 64,
            "kind": "scope",
            "contentType": "application/json",
            "payload": {"schemaVersion": "axwise.scope.v2"},
            "markdown": None,
            "sourceArtifactIds": [],
        },
    }


def test_same_id_and_hash_adopts_while_changed_input_or_stage_slot_conflicts(stores) -> None:
    _admin, api, _worker = stores
    operation = envelope()
    first = api.adopt_or_create(operation)
    assert first.status == "accepted"
    assert api.adopt_or_create(operation) == first

    with pytest.raises(OperationConflict, match="changed input"):
        api.adopt_or_create(envelope("Create a Latvia cat-food launch PRD."))
    with pytest.raises(OperationConflict, match="stage attempt"):
        api.adopt_or_create(
            envelope(operation_id="00000000-0000-4000-8000-000000000109")
        )


def test_tenant_b_cannot_read_tenant_a_and_api_worker_cannot_directly_update(stores) -> None:
    _admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    tenant_b = UUID("00000000-0000-4000-8000-000000000199")

    assert api.get(tenant_b, operation.operation_id) is None
    with api.engine.begin() as connection:
        connection.execute(
            text("SELECT set_config('axwise.tenant_id', :tenant, true)"),
            {"tenant": str(tenant_b)},
        )
        assert connection.execute(
            text("SELECT count(*) FROM axwise.cognitive_operations")
        ).scalar_one() == 0
        with pytest.raises(DBAPIError):
            connection.execute(
                text("UPDATE axwise.cognitive_operations SET status = 'failed'")
            )
    with worker.engine.begin() as connection, pytest.raises(DBAPIError):
        connection.execute(
            text("UPDATE axwise.cognitive_operations SET status = 'failed'")
        )


def test_expired_lease_reclaims_same_operation_and_stale_owner_cannot_finalize(stores) -> None:
    admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    first_token = uuid4()
    first = worker.claim_next(first_token, 30)
    assert first.envelope.operation_id == operation.operation_id
    assert worker.renew(
        operation.owner.tenant_id, operation.operation_id, first_token, 30
    )

    with admin.begin() as connection:
        connection.execute(
            text(
                "UPDATE axwise.cognitive_operations "
                "SET lease_expires_at = clock_timestamp() "
                "WHERE operation_id = :operation_id"
            ),
            {"operation_id": operation.operation_id},
        )
    second_token = uuid4()
    second = worker.claim_next(second_token, 30)
    assert second.envelope.operation_id == operation.operation_id

    with pytest.raises(StaleOperationLease):
        worker.complete(
            operation.owner.tenant_id,
            operation.operation_id,
            first_token,
            completion_result(),
        )
    worker.complete(
        operation.owner.tenant_id,
        operation.operation_id,
        second_token,
        completion_result(),
    )
    adopted = api.adopt_or_create(operation)
    assert adopted.status == "completed"
    assert adopted.result_payload == completion_result()
    with admin.connect() as connection:
        assert connection.execute(
            text(
                "SELECT execution_count FROM axwise.cognitive_operations "
                "WHERE operation_id = :operation_id"
            ),
            {"operation_id": operation.operation_id},
        ).scalar_one() == 2


def test_schema_treats_exact_lease_boundary_as_expired(stores) -> None:
    admin, _api, _worker = stores
    with admin.connect() as connection:
        claim_definition = connection.execute(
            text(
                "SELECT pg_get_functiondef("
                "'axwise.claim_cognitive_operation(uuid,integer)'::regprocedure)"
            )
        ).scalar_one()
        for signature in (
            "axwise.renew_cognitive_operation(uuid,uuid,uuid,integer)",
            "axwise.complete_cognitive_operation(uuid,uuid,uuid,jsonb)",
            "axwise.fail_cognitive_operation(uuid,uuid,uuid,boolean,text)",
        ):
            definition = connection.execute(
                text("SELECT pg_get_functiondef(CAST(:signature AS regprocedure))"),
                {"signature": signature},
            ).scalar_one()
            assert "lease_expires_at > clock_timestamp()" in definition
    assert "lease_expires_at <= clock_timestamp()" in claim_definition


def test_terminal_row_and_result_are_immutable(stores) -> None:
    admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    token = uuid4()
    assert worker.claim_next(token, 30)
    worker.complete(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
        completion_result(),
    )

    with pytest.raises(StaleOperationLease):
        worker.complete(
            operation.owner.tenant_id,
            operation.operation_id,
            token,
            completion_result(),
        )
    with admin.begin() as connection, pytest.raises(DBAPIError):
        connection.execute(
            text("DELETE FROM axwise.cognitive_operations WHERE operation_id = :id"),
            {"id": operation.operation_id},
        )
