"""Add bounded proposal retry scheduling for scope corrections.

Revision ID: 20260825_scope_proposal_retries
Revises: 20260825_pipeline_leases
Create Date: 2026-08-25 03:00:00+00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260825_scope_proposal_retries"
down_revision = "20260825_pipeline_leases"
branch_labels = None
depends_on = None


TABLE_NAME = "orchestration_scope_corrections"
ACTIVE_SOURCE_INDEX = "uq_scope_correction_active_source"
NEXT_ATTEMPT_INDEX = (
    "ix_orchestration_scope_corrections_proposal_next_attempt_at"
)
ACTIVE_SOURCE_COLUMNS = (
    "partner_id",
    "external_org_id",
    "external_user_id",
    "task_id",
    "upstream_decision_id",
    "source_scope_hash",
)
OLD_ACTIVE_STATUSES = (
    "queued",
    "interpreting",
    "proposal_pending",
    "proposal_persisting",
    "proposal_failed",
    "compiled",
    "needs_material_clarification",
    "accepted",
)
ACTIVE_STATUSES = (*OLD_ACTIVE_STATUSES[:5], "proposal_dead_lettered", *OLD_ACTIVE_STATUSES[5:])


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _predicate(statuses: tuple[str, ...]) -> sa.TextClause:
    return sa.text(
        "status IN ({})".format(
            ", ".join(f"'{status}'" for status in statuses)
        )
    )


def _recreate_active_source_index(statuses: tuple[str, ...]) -> None:
    indexes = {item["name"] for item in _inspector().get_indexes(TABLE_NAME)}
    if ACTIVE_SOURCE_INDEX in indexes:
        op.drop_index(ACTIVE_SOURCE_INDEX, table_name=TABLE_NAME)
    where = _predicate(statuses)
    op.create_index(
        ACTIVE_SOURCE_INDEX,
        TABLE_NAME,
        list(ACTIVE_SOURCE_COLUMNS),
        unique=True,
        postgresql_where=where,
        sqlite_where=where,
    )


def upgrade() -> None:
    if TABLE_NAME not in _inspector().get_table_names():
        raise RuntimeError(
            "orchestration_scope_corrections must exist before retry scheduling"
        )
    existing = {column["name"] for column in _inspector().get_columns(TABLE_NAME)}
    specs = (
        sa.Column(
            "proposal_attempt_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "proposal_next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "proposal_dead_lettered_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    for column in specs:
        if column.name not in existing:
            op.add_column(TABLE_NAME, column)
            existing.add(column.name)

    # A failed row from an interrupted partial rollout becomes eligible once,
    # rather than being hot-looped or stranded with an unknown retry time.
    op.execute(
        sa.text(
            f"UPDATE {TABLE_NAME} "
            "SET proposal_next_attempt_at = updated_at "
            "WHERE status = 'proposal_failed' "
            "AND proposal_next_attempt_at IS NULL"
        )
    )

    indexes = {item["name"] for item in _inspector().get_indexes(TABLE_NAME)}
    if NEXT_ATTEMPT_INDEX not in indexes:
        op.create_index(
            NEXT_ATTEMPT_INDEX,
            TABLE_NAME,
            ["proposal_next_attempt_at"],
            unique=False,
        )
    _recreate_active_source_index(ACTIVE_STATUSES)


def downgrade() -> None:
    if TABLE_NAME not in _inspector().get_table_names():
        return
    indexes = {item["name"] for item in _inspector().get_indexes(TABLE_NAME)}
    if NEXT_ATTEMPT_INDEX in indexes:
        op.drop_index(NEXT_ATTEMPT_INDEX, table_name=TABLE_NAME)
    _recreate_active_source_index(OLD_ACTIVE_STATUSES)
    existing = {column["name"] for column in _inspector().get_columns(TABLE_NAME)}
    for name in (
        "proposal_dead_lettered_at",
        "proposal_next_attempt_at",
        "proposal_attempt_count",
    ):
        if name in existing:
            op.drop_column(TABLE_NAME, name)
            existing.remove(name)
