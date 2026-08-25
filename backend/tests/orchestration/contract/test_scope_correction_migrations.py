"""Focused migration guards for the production scope-correction envelope."""

from __future__ import annotations

import importlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from backend.domain.orchestration.scope_models import (
    SCOPE_ACTIVE_REVISION_STATUSES,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]


def test_active_revision_status_contract_keeps_dead_letters_as_current_head():
    assert SCOPE_ACTIVE_REVISION_STATUSES == (
        "queued",
        "interpreting",
        "proposal_pending",
        "proposal_persisting",
        "proposal_failed",
        "proposal_dead_lettered",
        "compiled",
        "needs_material_clarification",
        "accepted",
    )


def _operations(connection) -> Operations:
    return Operations(MigrationContext.configure(connection))


def _prepare_scope_references(connection) -> None:
    connection.execute(sa.text("CREATE TABLE users (user_id VARCHAR PRIMARY KEY)"))
    connection.execute(
        sa.text(
            "CREATE TABLE orchestration_decisions "
            "(decision_id VARCHAR PRIMARY KEY)"
        )
    )


def _scope_schema(connection) -> dict[str, object]:
    inspector = sa.inspect(connection)
    table = "orchestration_scope_corrections"
    return {
        "columns": {column["name"] for column in inspector.get_columns(table)},
        "uniques": {
            constraint["name"]: tuple(constraint["column_names"])
            for constraint in inspector.get_unique_constraints(table)
        },
        "foreign_keys": {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in inspector.get_foreign_keys(table)
        },
        "indexes": {
            index["name"]: index for index in inspector.get_indexes(table)
        },
    }


def _acceptance_schema(connection) -> dict[str, object]:
    inspector = sa.inspect(connection)
    table = "orchestration_scope_acceptances"
    return {
        "columns": {column["name"] for column in inspector.get_columns(table)},
        "uniques": {
            constraint["name"]: tuple(constraint["column_names"])
            for constraint in inspector.get_unique_constraints(table)
        },
        "foreign_keys": {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in inspector.get_foreign_keys(table)
        },
        "indexes": {
            index["name"]: index for index in inspector.get_indexes(table)
        },
    }


EXPECTED_SCOPE_COLUMNS = {
    "id",
    "correction_id",
    "partner_id",
    "external_org_id",
    "external_user_id",
    "user_id",
    "task_id",
    "upstream_decision_id",
    "source_correction_id",
    "parent_correction_id",
    "clarification_answer_hash",
    "source_scope_hash",
    "source_scope_generation",
    "correction_hash",
    "idempotency_key",
    "raw_request_payload",
    "status",
    "compilation_payload",
    "acceptance_payload",
    "usage_payload",
    "attempt_count",
    "error_code",
    "interpretation_lease_token",
    "interpretation_lease_expires_at",
    "created_at",
    "updated_at",
}


EXPECTED_ACCEPTANCE_COLUMNS = {
    "id",
    "acceptance_id",
    "partner_id",
    "external_org_id",
    "external_user_id",
    "user_id",
    "task_id",
    "proposal_decision_id",
    "scope_generation",
    "scope_hash",
    "contract_hash",
    "proposal_hash",
    "proposal_inputs_hash",
    "research_execution_inputs_hash",
    "acceptance_payload",
    "created_at",
}


EXPECTED_PERSONA_COLUMNS = {
    "persona_id",
    "archetype",
    "demographics",
    "goals_and_motivations",
    "skills_and_expertise",
    "workflow_and_environment",
    "challenges_and_frustrations",
    "needs_and_desires",
    "technology_and_tools",
    "attitude_towards_research",
    "attitude_towards_ai",
    "key_quotes",
    "overall_confidence",
    "supporting_evidence_summary",
}


EXPECTED_PIPELINE_LEASE_COLUMNS = {
    "worker_lease_token",
    "worker_lease_expires_at",
    "worker_heartbeat_at",
    "paid_stage_receipts",
}


EXPECTED_SCOPE_PROPOSAL_RETRY_COLUMNS = {
    "proposal_attempt_count",
    "proposal_next_attempt_at",
    "proposal_dead_lettered_at",
}


def test_historical_interview_primary_key_migration_repairs_and_replays(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20250407_1115_fix_pk"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE interview_data ("
                "data_id INTEGER PRIMARY KEY, payload VARCHAR)"
            )
        )
        connection.execute(
            sa.text(
                "CREATE TABLE analysis_results ("
                "result_id INTEGER PRIMARY KEY, data_id INTEGER, "
                "FOREIGN KEY(data_id) REFERENCES interview_data(data_id))"
            )
        )
        # A cancelled SQLite batch leaves this table behind and used to make
        # every retry fail before the actual repair could run.
        connection.execute(
            sa.text(
                "CREATE TABLE _alembic_tmp_interview_data "
                "(id INTEGER PRIMARY KEY)"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        upgraded_inspector = sa.inspect(connection)
        upgraded_columns = {
            column["name"]
            for column in upgraded_inspector.get_columns("interview_data")
        }
        upgraded_fks = upgraded_inspector.get_foreign_keys("analysis_results")

        migration.downgrade()
        migration.downgrade()
        downgraded_inspector = sa.inspect(connection)
        downgraded_columns = {
            column["name"]
            for column in downgraded_inspector.get_columns("interview_data")
        }
        downgraded_fks = downgraded_inspector.get_foreign_keys(
            "analysis_results"
        )

        migration.upgrade()
        replayed_inspector = sa.inspect(connection)
        replayed_columns = {
            column["name"]
            for column in replayed_inspector.get_columns("interview_data")
        }
        replayed_fks = replayed_inspector.get_foreign_keys("analysis_results")

    assert upgraded_columns == {"id", "payload"}
    assert upgraded_fks[0]["constrained_columns"] == ["data_id"]
    assert upgraded_fks[0]["referred_columns"] == ["id"]
    assert downgraded_columns == {"data_id", "payload"}
    assert downgraded_fks[0]["referred_columns"] == ["data_id"]
    assert replayed_columns == upgraded_columns
    assert replayed_fks[0]["referred_columns"] == ["id"]


def test_historical_persona_migration_preserves_initial_demographics(monkeypatch):
    migration = importlib.import_module(
        "backend.migrations.versions.20250408_1200_add_archetype_column"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE personas ("
                "persona_id INTEGER PRIMARY KEY, demographics JSON)"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        columns = {
            column["name"] for column in sa.inspect(connection).get_columns("personas")
        }
        migration.downgrade()
        downgraded_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("personas")
        }

    assert "demographics" in columns
    assert "archetype" in columns
    assert "supporting_evidence_summary" in columns
    assert downgraded_columns == {"persona_id", "demographics"}


def test_historical_persona_migration_repairs_each_missing_column_and_replays(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20250408_1200_add_archetype_column"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE personas ("
                "persona_id INTEGER PRIMARY KEY, demographics JSON, "
                "archetype VARCHAR, skills_and_expertise JSON)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO personas "
                "(persona_id, demographics, archetype, skills_and_expertise) "
                "VALUES (1, '{\"country\": \"EE\"}', 'operator', '[\"ops\"]')"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        upgraded_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("personas")
        }
        preserved = connection.execute(
            sa.text(
                "SELECT demographics, archetype, skills_and_expertise "
                "FROM personas WHERE persona_id = 1"
            )
        ).one()

        migration.downgrade()
        migration.downgrade()
        downgraded_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("personas")
        }
        migration.upgrade()
        replayed_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("personas")
        }

    assert upgraded_columns == EXPECTED_PERSONA_COLUMNS
    assert preserved == ('{"country": "EE"}', "operator", '["ops"]')
    assert downgraded_columns == {"persona_id", "demographics"}
    assert replayed_columns == EXPECTED_PERSONA_COLUMNS


def test_scope_correction_migration_creates_lease_and_exact_binding_columns(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        schema = _scope_schema(connection)
        acceptance_schema = _acceptance_schema(connection)

    assert EXPECTED_SCOPE_COLUMNS == schema["columns"]
    assert {
        "upstream_decision_id",
        "source_correction_id",
        "source_scope_hash",
        "source_scope_generation",
        "correction_hash",
        "usage_payload",
        "interpretation_lease_token",
        "interpretation_lease_expires_at",
    }.issubset(schema["columns"])
    assert schema["uniques"]["uq_scope_correction_raw_submission"] == (
        "partner_id",
        "external_org_id",
        "external_user_id",
        "task_id",
        "upstream_decision_id",
        "source_scope_hash",
        "correction_hash",
    )
    active_index = schema["indexes"]["uq_scope_correction_active_source"]
    assert active_index["unique"]
    assert tuple(active_index["column_names"]) == (
        "partner_id",
        "external_org_id",
        "external_user_id",
        "task_id",
        "upstream_decision_id",
        "source_scope_hash",
    )
    active_predicate = str(
        active_index["dialect_options"]["sqlite_where"]
    ).lower()
    assert "queued" in active_predicate
    assert "proposal_pending" in active_predicate
    assert "proposal_persisting" in active_predicate
    assert "proposal_failed" in active_predicate
    assert "needs_material_clarification" in active_predicate
    assert "accepted" in active_predicate
    assert acceptance_schema["columns"] == EXPECTED_ACCEPTANCE_COLUMNS
    assert acceptance_schema["uniques"][
        "uq_scope_acceptance_proposal_owner"
    ] == (
        "partner_id",
        "external_org_id",
        "external_user_id",
        "proposal_decision_id",
    )


def test_scope_correction_migration_repairs_partial_table_constraints_and_indexes(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        # Simulate DDL interruption after a few objects, including two objects
        # created under their final names but with the wrong definitions.
        connection.execute(
            sa.text(
                "CREATE TABLE orchestration_scope_corrections ("
                "id INTEGER PRIMARY KEY, correction_id VARCHAR NOT NULL, "
                "partner_id VARCHAR NOT NULL, "
                "CONSTRAINT uq_scope_correction_idempotency "
                "UNIQUE (partner_id))"
            )
        )
        connection.execute(
            sa.text(
                "CREATE INDEX uq_scope_correction_active_source "
                "ON orchestration_scope_corrections (partner_id)"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        schema = _scope_schema(connection)

    assert schema["columns"] == EXPECTED_SCOPE_COLUMNS
    assert schema["uniques"]["uq_scope_correction_id"] == ("correction_id",)
    assert schema["uniques"]["uq_scope_correction_idempotency"] == (
        "partner_id",
        "external_org_id",
        "external_user_id",
        "idempotency_key",
    )
    assert schema["uniques"]["uq_scope_correction_clarification_parent"] == (
        "parent_correction_id",
    )
    assert schema["foreign_keys"] == {
        (("user_id",), "users", ("user_id",)),
        (
            ("upstream_decision_id",),
            "orchestration_decisions",
            ("decision_id",),
        ),
        (
            ("parent_correction_id",),
            "orchestration_scope_corrections",
            ("correction_id",),
        ),
    }
    assert tuple(
        schema["indexes"]["uq_scope_correction_active_source"]["column_names"]
    ) == migration.ACTIVE_SOURCE_COLUMNS
    assert schema["indexes"]["uq_scope_correction_active_source"]["unique"]
    for column in migration.STANDARD_INDEX_COLUMNS:
        index = schema["indexes"][
            f"ix_orchestration_scope_corrections_{column}"
        ]
        assert tuple(index["column_names"]) == (column,)
        assert not index["unique"]


def test_scope_acceptance_migration_repairs_partial_table_constraints_and_indexes(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        monkeypatch.setattr(migration, "op", _operations(connection))
        migration.upgrade()
        migration.op.drop_table("orchestration_scope_acceptances")
        connection.execute(
            sa.text(
                "CREATE TABLE orchestration_scope_acceptances ("
                "id INTEGER PRIMARY KEY, acceptance_id VARCHAR NOT NULL, "
                "partner_id VARCHAR NOT NULL, "
                "CONSTRAINT uq_scope_acceptance_proposal_owner "
                "UNIQUE (partner_id))"
            )
        )
        connection.execute(
            sa.text(
                "CREATE INDEX ix_orchestration_scope_acceptances_proposal_hash "
                "ON orchestration_scope_acceptances (partner_id)"
            )
        )

        migration.upgrade()
        migration.upgrade()
        schema = _acceptance_schema(connection)

    assert schema["columns"] == EXPECTED_ACCEPTANCE_COLUMNS
    assert schema["uniques"]["uq_scope_acceptance_id"] == ("acceptance_id",)
    assert schema["uniques"]["uq_scope_acceptance_proposal_owner"] == (
        "partner_id",
        "external_org_id",
        "external_user_id",
        "proposal_decision_id",
    )
    assert schema["foreign_keys"] == {
        (("user_id",), "users", ("user_id",)),
        (
            ("proposal_decision_id",),
            "orchestration_decisions",
            ("decision_id",),
        ),
    }
    for column in migration.ACCEPTANCE_STANDARD_INDEX_COLUMNS:
        index = schema["indexes"][f"ix_orchestration_scope_acceptances_{column}"]
        assert tuple(index["column_names"]) == (column,)
        assert not index["unique"]


def test_scope_correction_migration_repairs_malformed_named_primary_key(monkeypatch):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        connection.execute(
            sa.text(
                "CREATE TABLE orchestration_scope_corrections ("
                "id INTEGER NOT NULL, correction_id VARCHAR NOT NULL, "
                "partner_id VARCHAR NOT NULL, "
                "CONSTRAINT pk_scope_corrections_interrupted "
                "PRIMARY KEY (correction_id))"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        primary_key = sa.inspect(connection).get_pk_constraint(
            "orchestration_scope_corrections"
        )

    assert tuple(primary_key["constrained_columns"]) == ("id",)


def test_postgresql_reflected_active_predicate_is_semantically_idempotent():
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    statuses = ", ".join(
        f"'{status}'::character varying"
        for status in migration.ACTIVE_SOURCE_STATUSES
    )
    reflected = {
        "dialect_options": {
            "postgresql_where": (
                f"((status)::text = ANY ((ARRAY[{statuses}])::text[]))"
            )
        }
    }
    inverted = {
        "dialect_options": {
            "postgresql_where": (
                f"NOT ((status)::text = ANY ((ARRAY[{statuses}])::text[]))"
            )
        }
    }

    assert migration._active_source_predicate_matches(reflected)
    assert not migration._active_source_predicate_matches(inverted)


def test_scope_correction_migration_upgrade_downgrade_upgrade_is_replay_safe(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        initial = _scope_schema(connection)
        initial_acceptance = _acceptance_schema(connection)
        migration.downgrade()
        migration.downgrade()
        table_names = sa.inspect(connection).get_table_names()
        assert "orchestration_scope_corrections" not in table_names
        assert "orchestration_scope_acceptances" not in table_names
        migration.upgrade()
        replayed = _scope_schema(connection)
        replayed_acceptance = _acceptance_schema(connection)

    assert replayed["columns"] == initial["columns"] == EXPECTED_SCOPE_COLUMNS
    assert set(replayed["uniques"]) == set(initial["uniques"])
    assert set(replayed["indexes"]) == set(initial["indexes"])
    assert replayed["foreign_keys"] == initial["foreign_keys"]
    assert (
        replayed_acceptance["columns"]
        == initial_acceptance["columns"]
        == EXPECTED_ACCEPTANCE_COLUMNS
    )
    assert set(replayed_acceptance["uniques"]) == set(
        initial_acceptance["uniques"]
    )
    assert set(replayed_acceptance["indexes"]) == set(
        initial_acceptance["indexes"]
    )
    assert (
        replayed_acceptance["foreign_keys"]
        == initial_acceptance["foreign_keys"]
    )


def test_pipeline_lease_migration_repairs_partial_columns_and_named_indexes(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0200_add_pipeline_run_leases"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE pipeline_runs ("
                "id INTEGER PRIMARY KEY, worker_lease_token VARCHAR)"
            )
        )
        connection.execute(
            sa.text(
                "CREATE INDEX ix_pipeline_runs_worker_lease_token "
                "ON pipeline_runs (id)"
            )
        )
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        migration.upgrade()
        inspector = sa.inspect(connection)
        columns = {
            column["name"] for column in inspector.get_columns("pipeline_runs")
        }
        indexes = {
            index["name"]: index
            for index in inspector.get_indexes("pipeline_runs")
        }

    assert EXPECTED_PIPELINE_LEASE_COLUMNS.issubset(columns)
    for column in migration.INDEX_COLUMNS:
        index = indexes[f"ix_pipeline_runs_{column}"]
        assert tuple(index["column_names"]) == (column,)
        assert not index["unique"]


def test_pipeline_lease_migration_upgrade_downgrade_upgrade_is_replay_safe(
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260825_0200_add_pipeline_run_leases"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE pipeline_runs (id INTEGER PRIMARY KEY)"))
        monkeypatch.setattr(migration, "op", _operations(connection))

        migration.upgrade()
        first_columns = {
            column["name"]
            for column in sa.inspect(connection).get_columns("pipeline_runs")
        }
        first_indexes = {
            index["name"]: tuple(index["column_names"])
            for index in sa.inspect(connection).get_indexes("pipeline_runs")
        }
        migration.downgrade()
        migration.downgrade()
        downgraded_columns = {
            column["name"]
            for column in sa.inspect(connection).get_columns("pipeline_runs")
        }
        migration.upgrade()
        replayed_columns = {
            column["name"]
            for column in sa.inspect(connection).get_columns("pipeline_runs")
        }
        replayed_indexes = {
            index["name"]: tuple(index["column_names"])
            for index in sa.inspect(connection).get_indexes("pipeline_runs")
        }

    assert first_columns == replayed_columns
    assert EXPECTED_PIPELINE_LEASE_COLUMNS.issubset(first_columns)
    assert downgraded_columns == {"id"}
    assert first_indexes == replayed_indexes


def test_scope_proposal_retry_migration_repairs_replays_and_updates_active_head(
    monkeypatch,
):
    scope_migration = importlib.import_module(
        "backend.migrations.versions.20260825_0100_add_scope_corrections"
    )
    retry_migration = importlib.import_module(
        "backend.migrations.versions.20260825_0300_add_scope_proposal_retries"
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _prepare_scope_references(connection)
        monkeypatch.setattr(scope_migration, "op", _operations(connection))
        scope_migration.upgrade()
        connection.execute(
            sa.text("INSERT INTO users (user_id) VALUES ('worker-owner')")
        )
        connection.execute(
            sa.text(
                "INSERT INTO orchestration_decisions (decision_id) "
                "VALUES ('proposal-root')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO orchestration_scope_corrections ("
                "correction_id, partner_id, external_org_id, external_user_id, "
                "user_id, task_id, upstream_decision_id, source_scope_hash, "
                "source_scope_generation, correction_hash, idempotency_key, "
                "raw_request_payload, status, compilation_payload, attempt_count, "
                "created_at, updated_at) VALUES ("
                "'scope-correction-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'orqaly', "
                "'org-a', 'owner-a', 'worker-owner', 'task-a', 'proposal-root', "
                "'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', "
                "0, "
                "'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', "
                "'retry-a', '{}', 'proposal_failed', '{}', 1, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        monkeypatch.setattr(retry_migration, "op", _operations(connection))

        retry_migration.upgrade()
        retry_migration.upgrade()
        inspector = sa.inspect(connection)
        first_columns = {
            column["name"]
            for column in inspector.get_columns("orchestration_scope_corrections")
        }
        first_indexes = {
            index["name"]: index
            for index in inspector.get_indexes("orchestration_scope_corrections")
        }
        retry_at = connection.execute(
            sa.text(
                "SELECT proposal_next_attempt_at FROM "
                "orchestration_scope_corrections"
            )
        ).scalar_one()

        retry_migration.downgrade()
        retry_migration.downgrade()
        downgraded_columns = {
            column["name"]
            for column in sa.inspect(connection).get_columns(
                "orchestration_scope_corrections"
            )
        }
        retry_migration.upgrade()
        replayed = _scope_schema(connection)

    assert EXPECTED_SCOPE_PROPOSAL_RETRY_COLUMNS.issubset(first_columns)
    assert retry_at is not None
    assert EXPECTED_SCOPE_PROPOSAL_RETRY_COLUMNS.isdisjoint(downgraded_columns)
    assert EXPECTED_SCOPE_PROPOSAL_RETRY_COLUMNS.issubset(replayed["columns"])
    assert retry_migration.NEXT_ATTEMPT_INDEX in first_indexes
    active_predicate = str(
        replayed["indexes"][retry_migration.ACTIVE_SOURCE_INDEX][
            "dialect_options"
        ]["sqlite_where"]
    )
    assert "proposal_dead_lettered" in active_predicate
