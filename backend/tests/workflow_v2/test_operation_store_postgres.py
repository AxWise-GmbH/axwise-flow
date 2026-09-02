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


def grant_owner_visibility(connection) -> None:
    """Expose FORCE-RLS rows to Cloud SQL's non-superuser test administrator."""

    connection.exec_driver_sql("GRANT axwise_v2_owner TO CURRENT_USER")


def revoke_owner_visibility(connection) -> None:
    connection.exec_driver_sql("REVOKE axwise_v2_owner FROM CURRENT_USER")


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
        connection.execute(
            text("TRUNCATE axwise.operation_events, axwise.cognitive_operations")
        )
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


def assistant_envelope(
    *,
    operation_id: str = "00000000-0000-4000-8000-000000000111",
    tenant_id: str = "00000000-0000-4000-8000-000000000102",
    attempt_id: str = "00000000-0000-4000-8000-000000000105",
):
    input_payload = {
        "type": "AssistantTurnV1",
        "responseMode": "direct_answer",
        "message": "Explain the launch constraints.",
        "conversation": [],
    }
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": operation_id,
            "operationType": "AssistantTurnV1",
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
    with pytest.raises(OperationConflict, match="stage attempt"):
        api.adopt_or_create(assistant_envelope())


def test_latest_schema_allows_compile_scope_v3_and_one_operation_per_attempt(
    stores,
) -> None:
    admin, _api, _worker = stores
    with admin.connect() as connection:
        constraints = connection.execute(
            text(
                "SELECT contype, pg_get_constraintdef(oid) AS definition "
                "FROM pg_constraint "
                "WHERE conrelid = 'axwise.cognitive_operations'::regclass"
            )
        ).mappings()
        definitions = [
            (row["contype"], row["definition"])
            for row in constraints
        ]

    operation_type_checks = [
        definition
        for constraint_type, definition in definitions
        if constraint_type == "c" and "operation_type" in definition
    ]
    uniqueness = {
        definition
        for constraint_type, definition in definitions
        if constraint_type == "u"
    }
    assert len(operation_type_checks) == 1
    assert "CompileScopeV3" in operation_type_checks[0]
    assert "UNIQUE (tenant_id, stage_attempt_id)" in uniqueness
    assert "UNIQUE (tenant_id, stage_attempt_id, operation_type)" not in uniqueness


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
        grant_owner_visibility(connection)
        expired = connection.execute(
            text(
                "UPDATE axwise.cognitive_operations "
                "SET lease_expires_at = clock_timestamp() "
                "WHERE operation_id = :operation_id"
            ),
            {"operation_id": operation.operation_id},
        )
        assert expired.rowcount == 1
        revoke_owner_visibility(connection)
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
    with admin.begin() as connection:
        grant_owner_visibility(connection)
        execution_count = connection.execute(
            text(
                "SELECT execution_count FROM axwise.cognitive_operations "
                "WHERE operation_id = :operation_id"
            ),
            {"operation_id": operation.operation_id},
        ).scalar_one()
        revoke_owner_visibility(connection)
    assert execution_count == 2


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
            "axwise.fail_cognitive_operation(uuid,uuid,uuid,boolean,text,"
            "timestamp with time zone,integer,jsonb)",
            "axwise.cancel_cognitive_operation(uuid,uuid,uuid)",
        ):
            definition = connection.execute(
                text("SELECT pg_get_functiondef(CAST(:signature AS regprocedure))"),
                {"signature": signature},
            ).scalar_one()
            assert (
                "lease_expires_at > clock_timestamp()" in definition
                or "lease_expires_at > event_time" in definition
                or "lease_expires_at > terminal_time" in definition
            )
    assert "lease_expires_at <= clock_timestamp()" in claim_definition


def test_security_definer_ownership_drops_temporary_migration_privileges(stores) -> None:
    admin, _api, _worker = stores
    signatures = (
        "axwise.claim_cognitive_operation(uuid,integer)",
        "axwise.renew_cognitive_operation(uuid,uuid,uuid,integer)",
        "axwise.complete_cognitive_operation(uuid,uuid,uuid,jsonb)",
        "axwise.fail_cognitive_operation(uuid,uuid,uuid,boolean,text)",
        "axwise.fail_cognitive_operation(uuid,uuid,uuid,boolean,text,"
        "timestamp with time zone,integer,jsonb)",
        "axwise.cancel_cognitive_operation(uuid,uuid,uuid)",
    )
    with admin.connect() as connection:
        for signature in signatures:
            assert connection.execute(
                text(
                    "SELECT pg_get_userbyid(proowner) "
                    "FROM pg_proc WHERE oid = CAST(:signature AS regprocedure)"
                ),
                {"signature": signature},
            ).scalar_one() == "axwise_v2_owner"
            assert not connection.execute(
                text(
                    "SELECT has_function_privilege("
                    "'public', CAST(:signature AS regprocedure), 'EXECUTE')"
                ),
                {"signature": signature},
            ).scalar_one()
            assert connection.execute(
                text(
                    "SELECT has_function_privilege("
                    "'axwise_v2_worker', CAST(:signature AS regprocedure), 'EXECUTE')"
                ),
                {"signature": signature},
            ).scalar_one()

        request_cancel_signature = (
            "axwise.request_cognitive_operation_cancel(uuid,uuid)"
        )
        assert connection.execute(
            text(
                "SELECT pg_get_userbyid(proowner) FROM pg_proc "
                "WHERE oid = CAST(:signature AS regprocedure)"
            ),
            {"signature": request_cancel_signature},
        ).scalar_one() == "axwise_v2_owner"
        assert connection.execute(
            text(
                "SELECT has_function_privilege("
                "'axwise_v2_api', CAST(:signature AS regprocedure), 'EXECUTE')"
            ),
            {"signature": request_cancel_signature},
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT has_function_privilege("
                "'axwise_v2_worker', CAST(:signature AS regprocedure), 'EXECUTE')"
            ),
            {"signature": request_cancel_signature},
        ).scalar_one()

        assert not connection.execute(
            text("SELECT has_schema_privilege('axwise_v2_owner', 'axwise', 'CREATE')")
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT EXISTS ("
                "SELECT 1 FROM pg_auth_members membership "
                "JOIN pg_roles granted ON granted.oid = membership.roleid "
                "JOIN pg_roles member ON member.oid = membership.member "
                "WHERE granted.rolname = 'axwise_v2_owner' "
                "AND member.rolname = current_user "
                "AND membership.set_option)"
            )
        ).scalar_one()


def test_readiness_requires_latest_schema_surface_and_role_grants(stores) -> None:
    admin, api, worker = stores
    assert api.ready()
    assert worker.ready()

    with admin.begin() as connection:
        connection.exec_driver_sql(
            "REVOKE SELECT ON axwise.operation_events FROM axwise_v2_api"
        )
    try:
        assert not api.ready()
        assert worker.ready()
    finally:
        with admin.begin() as connection:
            connection.exec_driver_sql(
                "GRANT SELECT ON axwise.operation_events TO axwise_v2_api"
            )

    with admin.begin() as connection:
        connection.exec_driver_sql(
            "REVOKE SELECT ON axwise.cognitive_operations FROM axwise_v2_worker"
        )
    try:
        assert api.ready()
        assert not worker.ready()
        with pytest.raises(DBAPIError):
            worker.cancellation_requested(uuid4(), uuid4(), uuid4())
    finally:
        with admin.begin() as connection:
            connection.exec_driver_sql(
                "GRANT SELECT ON axwise.cognitive_operations TO axwise_v2_worker"
            )

    with admin.begin() as connection:
        grant_owner_visibility(connection)
        connection.exec_driver_sql(
            "ALTER TABLE axwise.operation_events RENAME TO operation_events_unready"
        )
        revoke_owner_visibility(connection)
    try:
        assert not api.ready()
        assert not worker.ready()
    finally:
        with admin.begin() as connection:
            grant_owner_visibility(connection)
            connection.exec_driver_sql(
                "ALTER TABLE axwise.operation_events_unready RENAME TO operation_events"
            )
            revoke_owner_visibility(connection)

    assert api.ready()
    assert worker.ready()


def test_readiness_returns_false_for_an_unmigrated_database() -> None:
    unmigrated_engine = create_engine(
        make_url(DATABASE_URL).set(database="postgres")
    )
    try:
        assert not PostgresOperationStore(unmigrated_engine).ready()
    finally:
        unmigrated_engine.dispose()


def test_retryable_failure_persists_safe_runtime_metadata(stores) -> None:
    _admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    token = uuid4()
    assert worker.claim_next(token, 30)
    diagnostics = {
        "route": "gemini_google_search",
        "status": "retry_exhausted",
        "elapsed_ms": 0,
        "call_count": 0,
        "retry_count": 0,
        "primary_skipped": True,
        "circuit_state": "open",
        "retry_after_seconds": 23,
    }

    worker.fail(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
        retryable=True,
        error_class="AXWISE_RESEARCH_UNAVAILABLE",
        retry_at="2026-09-02T10:15:30Z",
        retry_after_seconds=23,
        failure_diagnostics=diagnostics,
    )

    failed = api.get(operation.owner.tenant_id, operation.operation_id)
    assert failed is not None
    assert failed.status == "failed"
    assert failed.retry_at == "2026-09-02T10:15:30Z"
    assert failed.retry_after_seconds == 23
    assert failed.failure_diagnostics == diagnostics


@pytest.mark.parametrize(
    "unsafe_diagnostics",
    [
        {},
        {"route": "gemini_google_search"},
        {"route": None, "status": "unavailable"},
        {"route": "gemini_google_search", "status": None},
        {
            "route": "gemini_google_search",
            "status": "unavailable",
            "primary": {},
        },
        {
            "route": "gemini_google_search",
            "status": "unavailable",
            "prompt": "private user content",
        },
    ],
)
def test_database_rejects_raw_failure_content(stores, unsafe_diagnostics) -> None:
    _admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    token = uuid4()
    assert worker.claim_next(token, 30)

    with pytest.raises(DBAPIError, match="safe bounded schema"):
        worker.fail(
            operation.owner.tenant_id,
            operation.operation_id,
            token,
            retryable=True,
            error_class="AXWISE_RESEARCH_UNAVAILABLE",
            failure_diagnostics=unsafe_diagnostics,
        )

    unchanged = api.get(operation.owner.tenant_id, operation.operation_id)
    assert unchanged is not None
    assert unchanged.status == "running"


def test_lifecycle_events_are_monotonic_atomic_and_cursor_addressable(stores) -> None:
    _admin, api, worker = stores
    operation = envelope()
    accepted = api.adopt_or_create(operation)
    first_page = api.events_after(
        operation.owner.tenant_id,
        operation.operation_id,
        after=0,
        limit=1,
    )
    assert accepted.status == "accepted"
    assert [(event.sequence, event.event_type) for event in first_page.events] == [
        (1, "accepted")
    ]
    assert first_page.has_more is False

    token = uuid4()
    assert worker.claim_next(token, 30)
    assert worker.renew(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
        30,
    )
    worker.complete(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
        completion_result(),
    )

    tail = api.events_after(
        operation.owner.tenant_id,
        operation.operation_id,
        after=1,
        limit=2,
    )
    assert [(event.sequence, event.event_type) for event in tail.events] == [
        (2, "running"),
        (3, "heartbeat"),
    ]
    assert tail.has_more is True
    terminal = api.events_after(
        operation.owner.tenant_id,
        operation.operation_id,
        after=tail.events[-1].sequence,
        limit=10,
    )
    assert [(event.sequence, event.event_type) for event in terminal.events] == [
        (4, "completed")
    ]
    assert api.get(operation.owner.tenant_id, operation.operation_id).status == "completed"


def test_accepted_cancel_is_immediate_idempotent_and_append_only(stores) -> None:
    admin, api, _worker = stores
    operation = envelope()
    api.adopt_or_create(operation)

    first = api.request_cancel(operation.owner.tenant_id, operation.operation_id)
    second = api.request_cancel(operation.owner.tenant_id, operation.operation_id)

    assert first is not None and first.status == "cancelled"
    assert second == first
    events = api.events_after(
        operation.owner.tenant_id,
        operation.operation_id,
        after=0,
        limit=10,
    )
    assert [(event.sequence, event.event_type) for event in events.events] == [
        (1, "accepted"),
        (2, "cancel_requested"),
        (3, "cancelled"),
    ]
    with pytest.raises(DBAPIError, match="append-only"):
        with admin.begin() as connection:
            grant_owner_visibility(connection)
            connection.execute(
                text(
                    "UPDATE axwise.operation_events SET event_type = 'heartbeat' "
                    "WHERE operation_id = :operation_id AND sequence = 1"
                ),
                {"operation_id": operation.operation_id},
            )


def test_running_cancel_cooperates_with_lease_and_wins_terminal_race(stores) -> None:
    _admin, api, worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    token = uuid4()
    assert worker.claim_next(token, 30)

    requested = api.request_cancel(operation.owner.tenant_id, operation.operation_id)
    assert requested is not None and requested.status == "cancel_requested"
    assert worker.cancellation_requested(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
    )
    with pytest.raises(StaleOperationLease):
        worker.complete(
            operation.owner.tenant_id,
            operation.operation_id,
            token,
            completion_result(),
        )
    worker.cancel(
        operation.owner.tenant_id,
        operation.operation_id,
        token,
    )

    assert api.get(operation.owner.tenant_id, operation.operation_id).status == "cancelled"
    events = api.events_after(
        operation.owner.tenant_id,
        operation.operation_id,
        after=0,
        limit=10,
    )
    assert [event.event_type for event in events.events] == [
        "accepted",
        "running",
        "cancel_requested",
        "cancelled",
    ]


def test_event_reads_are_tenant_isolated(stores) -> None:
    _admin, api, _worker = stores
    operation = envelope()
    api.adopt_or_create(operation)

    hidden = api.events_after(
        UUID("00000000-0000-4000-8000-000000000199"),
        operation.operation_id,
        after=0,
        limit=10,
    )

    assert hidden.events == ()
    assert hidden.has_more is False


def test_api_cancel_definer_rejects_cross_tenant_argument(stores) -> None:
    _admin, api, _worker = stores
    operation = envelope()
    api.adopt_or_create(operation)
    other_tenant = UUID("00000000-0000-4000-8000-000000000199")

    with api.engine.begin() as connection:
        connection.execute(
            text("SELECT set_config('axwise.tenant_id', :tenant_id, true)"),
            {"tenant_id": str(other_tenant)},
        )
        result = connection.execute(
            text(
                "SELECT axwise.request_cognitive_operation_cancel("
                ":tenant_id, :operation_id)"
            ),
            {
                "tenant_id": operation.owner.tenant_id,
                "operation_id": operation.operation_id,
            },
        ).scalar_one_or_none()

    assert result is None
    assert api.get(operation.owner.tenant_id, operation.operation_id).status == "accepted"


def test_event_foreign_key_rejects_cross_tenant_operation_ownership(stores) -> None:
    admin, api, _worker = stores
    operation = envelope()
    api.adopt_or_create(operation)

    with pytest.raises(DBAPIError):
        with admin.begin() as connection:
            grant_owner_visibility(connection)
            connection.execute(
                text(
                    "INSERT INTO axwise.operation_events "
                    "(tenant_id, operation_id, sequence, event_type, status) "
                    "VALUES (:tenant_id, :operation_id, 2, 'accepted', 'accepted')"
                ),
                {
                    "tenant_id": UUID("00000000-0000-4000-8000-000000000199"),
                    "operation_id": operation.operation_id,
                },
            )


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
    with pytest.raises(DBAPIError):
        with admin.begin() as connection:
            grant_owner_visibility(connection)
            connection.execute(
                text("DELETE FROM axwise.cognitive_operations WHERE operation_id = :id"),
                {"id": operation.operation_id},
            )
