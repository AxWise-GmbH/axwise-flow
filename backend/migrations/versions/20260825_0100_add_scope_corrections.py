"""Add durable, idempotent semantic scope corrections.

Revision ID: 20260825_scope_corrections
Revises: 20260718_orchestration_outcomes
Create Date: 2026-08-25 01:00:00+00:00

The migration deliberately repairs one database object at a time. This keeps a
retry safe when a non-transactional DDL backend, or an operator, leaves behind a
partially-created table.
"""

from __future__ import annotations

from collections.abc import Iterable
import re

from alembic import op
import sqlalchemy as sa


revision = "20260825_scope_corrections"
down_revision = "20260718_orchestration_outcomes"
branch_labels = None
depends_on = None


TABLE_NAME = "orchestration_scope_corrections"
ACCEPTANCE_TABLE_NAME = "orchestration_scope_acceptances"
ACTIVE_SOURCE_INDEX = "uq_scope_correction_active_source"
ACTIVE_SOURCE_COLUMNS = (
    "partner_id",
    "external_org_id",
    "external_user_id",
    "task_id",
    "upstream_decision_id",
    "source_scope_hash",
)
ACTIVE_SOURCE_STATUSES = (
    "queued",
    "interpreting",
    "proposal_pending",
    "proposal_persisting",
    "proposal_failed",
    "compiled",
    "needs_material_clarification",
    "accepted",
)
ACTIVE_SOURCE_PREDICATE = "status IN ({})".format(
    ", ".join(f"'{status}'" for status in ACTIVE_SOURCE_STATUSES)
)


def _columns() -> list[sa.Column]:
    """Return fresh Column objects so repair retries never reuse table state."""

    return [
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("correction_id", sa.String(), nullable=False),
        sa.Column("partner_id", sa.String(), nullable=False),
        sa.Column("external_org_id", sa.String(), nullable=False),
        sa.Column("external_user_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("upstream_decision_id", sa.String(), nullable=False),
        sa.Column("source_correction_id", sa.String(), nullable=True),
        sa.Column("parent_correction_id", sa.String(), nullable=True),
        sa.Column("clarification_answer_hash", sa.String(), nullable=True),
        sa.Column("source_scope_hash", sa.String(), nullable=False),
        sa.Column("source_scope_generation", sa.Integer(), nullable=False),
        sa.Column("correction_hash", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("raw_request_payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("compilation_payload", sa.JSON(), nullable=True),
        sa.Column("acceptance_payload", sa.JSON(), nullable=True),
        sa.Column("usage_payload", sa.JSON(), nullable=True),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("interpretation_lease_token", sa.String(), nullable=True),
        sa.Column(
            "interpretation_lease_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    ]


def _acceptance_columns() -> list[sa.Column]:
    """Return the unified initial/corrected proposal-acceptance schema."""

    return [
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("acceptance_id", sa.String(), nullable=False),
        sa.Column("partner_id", sa.String(), nullable=False),
        sa.Column("external_org_id", sa.String(), nullable=False),
        sa.Column("external_user_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("proposal_decision_id", sa.String(), nullable=False),
        sa.Column("scope_generation", sa.Integer(), nullable=False),
        sa.Column("scope_hash", sa.String(), nullable=False),
        sa.Column("contract_hash", sa.String(), nullable=False),
        sa.Column("proposal_hash", sa.String(), nullable=False),
        sa.Column("proposal_inputs_hash", sa.String(), nullable=False),
        sa.Column("research_execution_inputs_hash", sa.String(), nullable=True),
        sa.Column("acceptance_payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    ]


UNIQUE_CONSTRAINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("uq_scope_correction_id", ("correction_id",)),
    (
        "uq_scope_correction_idempotency",
        ("partner_id", "external_org_id", "external_user_id", "idempotency_key"),
    ),
    (
        "uq_scope_correction_raw_submission",
        (
            "partner_id",
            "external_org_id",
            "external_user_id",
            "task_id",
            "upstream_decision_id",
            "source_scope_hash",
            "correction_hash",
        ),
    ),
    (
        "uq_scope_correction_clarification_parent",
        ("parent_correction_id",),
    ),
)

FOREIGN_KEYS: tuple[
    tuple[str, tuple[str, ...], str, tuple[str, ...]], ...
] = (
    ("fk_scope_correction_user", ("user_id",), "users", ("user_id",)),
    (
        "fk_scope_correction_upstream_decision",
        ("upstream_decision_id",),
        "orchestration_decisions",
        ("decision_id",),
    ),
    (
        "fk_scope_correction_clarification_parent",
        ("parent_correction_id",),
        TABLE_NAME,
        ("correction_id",),
    ),
)

STANDARD_INDEX_COLUMNS = (
    "correction_id",
    "partner_id",
    "external_org_id",
    "user_id",
    "task_id",
    "upstream_decision_id",
    "source_correction_id",
    "parent_correction_id",
    "clarification_answer_hash",
    "source_scope_hash",
    "correction_hash",
    "interpretation_lease_token",
)

ACCEPTANCE_UNIQUE_CONSTRAINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("uq_scope_acceptance_id", ("acceptance_id",)),
    (
        "uq_scope_acceptance_proposal_owner",
        (
            "partner_id",
            "external_org_id",
            "external_user_id",
            "proposal_decision_id",
        ),
    ),
)

ACCEPTANCE_FOREIGN_KEYS: tuple[
    tuple[str, tuple[str, ...], str, tuple[str, ...]], ...
] = (
    ("fk_scope_acceptance_user", ("user_id",), "users", ("user_id",)),
    (
        "fk_scope_acceptance_proposal_decision",
        ("proposal_decision_id",),
        "orchestration_decisions",
        ("decision_id",),
    ),
)

ACCEPTANCE_STANDARD_INDEX_COLUMNS = (
    "acceptance_id",
    "partner_id",
    "external_org_id",
    "user_id",
    "task_id",
    "proposal_decision_id",
    "scope_hash",
    "proposal_hash",
)


def _inspector() -> sa.Inspector:
    # Inspectors cache metadata. A fresh instance is required after every DDL
    # repair so the next guard observes the object just created.
    return sa.inspect(op.get_bind())


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _create_table() -> None:
    op.create_table(
        TABLE_NAME,
        *_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_scope_correction_user",
        ),
        sa.ForeignKeyConstraint(
            ["upstream_decision_id"],
            ["orchestration_decisions.decision_id"],
            name="fk_scope_correction_upstream_decision",
        ),
        sa.ForeignKeyConstraint(
            ["parent_correction_id"],
            [f"{TABLE_NAME}.correction_id"],
            name="fk_scope_correction_clarification_parent",
        ),
        *(
            sa.UniqueConstraint(*columns, name=name)
            for name, columns in UNIQUE_CONSTRAINTS
        ),
    )


def _create_acceptance_table() -> None:
    op.create_table(
        ACCEPTANCE_TABLE_NAME,
        *_acceptance_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_scope_acceptance_user",
        ),
        sa.ForeignKeyConstraint(
            ["proposal_decision_id"],
            ["orchestration_decisions.decision_id"],
            name="fk_scope_acceptance_proposal_decision",
        ),
        *(
            sa.UniqueConstraint(*columns, name=name)
            for name, columns in ACCEPTANCE_UNIQUE_CONSTRAINTS
        ),
    )


def _add_missing_columns(
    table_name: str,
    expected_columns: list[sa.Column],
) -> None:
    existing = _column_names(table_name)
    missing = [column for column in expected_columns if column.name not in existing]
    if not missing:
        return

    if _is_sqlite():
        # SQLite cannot add every required default/constraint shape in place.
        # Recreate once, rather than once per missing column.
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            for column in missing:
                batch_op.add_column(column)
        return

    for column in missing:
        op.add_column(table_name, column)


def _column_tuple(value: Iterable[str] | None) -> tuple[str, ...]:
    return tuple(value or ())


def _ensure_primary_key(table_name: str, name: str) -> None:
    primary_key = _inspector().get_pk_constraint(table_name)
    columns = _column_tuple(primary_key.get("constrained_columns"))
    if columns == ("id",):
        return
    if _is_sqlite():
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            if columns:
                existing_name = primary_key.get("name")
                if not existing_name:
                    raise RuntimeError(
                        f"cannot safely repair unnamed primary key on {table_name}"
                    )
                batch_op.drop_constraint(existing_name, type_="primary")
            batch_op.create_primary_key(name, ["id"])
    else:
        if columns:
            existing_name = primary_key.get("name")
            if not existing_name:
                raise RuntimeError(
                    f"cannot safely repair unnamed primary key on {table_name}"
                )
            op.drop_constraint(existing_name, table_name, type_="primary")
        op.create_primary_key(name, table_name, ["id"])


def _ensure_unique_constraint(
    table_name: str,
    name: str,
    columns: tuple[str, ...],
) -> None:
    constraints = _inspector().get_unique_constraints(table_name)
    exact = next((item for item in constraints if item.get("name") == name), None)
    if exact is not None and _column_tuple(exact.get("column_names")) == columns:
        return

    if _is_sqlite():
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            if exact is not None:
                batch_op.drop_constraint(name, type_="unique")
            batch_op.create_unique_constraint(name, list(columns))
        return

    if exact is not None:
        op.drop_constraint(name, table_name, type_="unique")
    op.create_unique_constraint(name, table_name, list(columns))


def _ensure_foreign_key(
    table_name: str,
    name: str,
    columns: tuple[str, ...],
    referred_table: str,
    referred_columns: tuple[str, ...],
) -> None:
    foreign_keys = _inspector().get_foreign_keys(table_name)
    semantic_match = next(
        (
            item
            for item in foreign_keys
            if _column_tuple(item.get("constrained_columns")) == columns
            and item.get("referred_table") == referred_table
            and _column_tuple(item.get("referred_columns")) == referred_columns
        ),
        None,
    )
    if semantic_match is not None:
        return

    same_name = next((item for item in foreign_keys if item.get("name") == name), None)
    if _is_sqlite():
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            if same_name is not None:
                batch_op.drop_constraint(name, type_="foreignkey")
            batch_op.create_foreign_key(
                name,
                referred_table,
                list(columns),
                list(referred_columns),
            )
        return

    if same_name is not None:
        op.drop_constraint(name, table_name, type_="foreignkey")
    op.create_foreign_key(
        name,
        table_name,
        referred_table,
        list(columns),
        list(referred_columns),
    )


def _ensure_standard_index(table_name: str, column: str) -> None:
    name = f"ix_{table_name}_{column}"
    existing = next(
        (
            item
            for item in _inspector().get_indexes(table_name)
            if item["name"] == name
        ),
        None,
    )
    if (
        existing is not None
        and _column_tuple(existing.get("column_names")) == (column,)
        and not existing.get("unique", False)
    ):
        return
    if existing is not None:
        op.drop_index(name, table_name=table_name)
    op.create_index(name, table_name, [column], unique=False)


def _normalized_sql(value: object) -> str:
    rendered = "" if value is None else str(value)
    return " ".join(rendered.lower().split()).replace('"', "").replace("`", "")


def _partial_predicate(index: dict) -> str:
    options = index.get("dialect_options") or {}
    predicate = options.get("postgresql_where")
    if predicate is None:
        predicate = options.get("sqlite_where")
    return _normalized_sql(predicate)


def _active_source_predicate_matches(index: dict) -> bool:
    """Compare SQLite text and PostgreSQL's reflected ``= ANY(ARRAY[])`` form."""

    predicate = _partial_predicate(index)
    expected = _normalized_sql(ACTIVE_SOURCE_PREDICATE)
    if predicate.strip("() ") == expected:
        return True

    # PostgreSQL normalizes ``status IN (...)`` while reflecting it, commonly as
    # ``(status)::text = ANY ((ARRAY['queued'::varchar, ...])::text[])``.
    # Compare the exact literal set and the positive equality operator so a
    # semantically identical index remains idempotent without accepting NOT-IN.
    reflected_statuses = re.findall(r"'([^']+)'", predicate)
    return (
        "status" in predicate
        and "= any" in predicate
        and re.search(r"\bnot\b", predicate) is None
        and len(reflected_statuses) == len(ACTIVE_SOURCE_STATUSES)
        and set(reflected_statuses) == set(ACTIVE_SOURCE_STATUSES)
    )


def _ensure_active_source_index() -> None:
    existing = next(
        (
            item
            for item in _inspector().get_indexes(TABLE_NAME)
            if item["name"] == ACTIVE_SOURCE_INDEX
        ),
        None,
    )
    if (
        existing is not None
        and _column_tuple(existing.get("column_names")) == ACTIVE_SOURCE_COLUMNS
        and bool(existing.get("unique"))
        and _active_source_predicate_matches(existing)
    ):
        return
    if existing is not None:
        op.drop_index(ACTIVE_SOURCE_INDEX, table_name=TABLE_NAME)
    predicate = sa.text(ACTIVE_SOURCE_PREDICATE)
    op.create_index(
        ACTIVE_SOURCE_INDEX,
        TABLE_NAME,
        list(ACTIVE_SOURCE_COLUMNS),
        unique=True,
        postgresql_where=predicate,
        sqlite_where=predicate,
    )


def upgrade() -> None:
    if TABLE_NAME not in _inspector().get_table_names():
        _create_table()
    else:
        _add_missing_columns(TABLE_NAME, _columns())
        _ensure_primary_key(TABLE_NAME, "pk_orchestration_scope_corrections")

    for name, columns in UNIQUE_CONSTRAINTS:
        _ensure_unique_constraint(TABLE_NAME, name, columns)
    for name, columns, referred_table, referred_columns in FOREIGN_KEYS:
        _ensure_foreign_key(
            TABLE_NAME,
            name,
            columns,
            referred_table,
            referred_columns,
        )
    for column in STANDARD_INDEX_COLUMNS:
        _ensure_standard_index(TABLE_NAME, column)
    _ensure_active_source_index()

    if ACCEPTANCE_TABLE_NAME not in _inspector().get_table_names():
        _create_acceptance_table()
    else:
        _add_missing_columns(ACCEPTANCE_TABLE_NAME, _acceptance_columns())
        _ensure_primary_key(
            ACCEPTANCE_TABLE_NAME,
            "pk_orchestration_scope_acceptances",
        )
    for name, columns in ACCEPTANCE_UNIQUE_CONSTRAINTS:
        _ensure_unique_constraint(ACCEPTANCE_TABLE_NAME, name, columns)
    for name, columns, referred_table, referred_columns in ACCEPTANCE_FOREIGN_KEYS:
        _ensure_foreign_key(
            ACCEPTANCE_TABLE_NAME,
            name,
            columns,
            referred_table,
            referred_columns,
        )
    for column in ACCEPTANCE_STANDARD_INDEX_COLUMNS:
        _ensure_standard_index(ACCEPTANCE_TABLE_NAME, column)


def downgrade() -> None:
    if ACCEPTANCE_TABLE_NAME in _inspector().get_table_names():
        op.drop_table(ACCEPTANCE_TABLE_NAME)
    if TABLE_NAME in _inspector().get_table_names():
        op.drop_table(TABLE_NAME)
