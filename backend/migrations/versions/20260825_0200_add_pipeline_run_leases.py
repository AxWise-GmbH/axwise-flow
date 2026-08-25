"""Add fenced worker leases and paid-stage receipts to pipeline runs.

Revision ID: 20260825_pipeline_leases
Revises: 20260825_scope_corrections
Create Date: 2026-08-25 02:00:00+00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260825_pipeline_leases"
down_revision = "20260825_scope_corrections"
branch_labels = None
depends_on = None


TABLE_NAME = "pipeline_runs"
COLUMN_SPECS = (
    ("worker_lease_token", sa.String),
    ("worker_lease_expires_at", lambda: sa.DateTime(timezone=True)),
    ("worker_heartbeat_at", lambda: sa.DateTime(timezone=True)),
    ("paid_stage_receipts", sa.JSON),
)
INDEX_COLUMNS = ("worker_lease_token", "worker_lease_expires_at")


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def upgrade() -> None:
    if TABLE_NAME not in _inspector().get_table_names():
        raise RuntimeError("pipeline_runs must exist before adding worker leases")
    existing = {column["name"] for column in _inspector().get_columns(TABLE_NAME)}
    for name, type_factory in COLUMN_SPECS:
        if name not in existing:
            op.add_column(
                TABLE_NAME,
                sa.Column(name, type_factory(), nullable=True),
            )
            existing.add(name)
    indexes = {
        item["name"]: item for item in _inspector().get_indexes(TABLE_NAME)
    }
    for column in INDEX_COLUMNS:
        name = f"ix_{TABLE_NAME}_{column}"
        reflected = indexes.get(name)
        if reflected is not None and (
            tuple(reflected.get("column_names") or ()) != (column,)
            or bool(reflected.get("unique"))
        ):
            op.drop_index(name, table_name=TABLE_NAME)
            reflected = None
        if reflected is None:
            op.create_index(name, TABLE_NAME, [column], unique=False)


def downgrade() -> None:
    if TABLE_NAME not in _inspector().get_table_names():
        return
    indexes = {item["name"] for item in _inspector().get_indexes(TABLE_NAME)}
    for column in reversed(INDEX_COLUMNS):
        name = f"ix_{TABLE_NAME}_{column}"
        if name in indexes:
            op.drop_index(name, table_name=TABLE_NAME)
    existing = {column["name"] for column in _inspector().get_columns(TABLE_NAME)}
    for name, _ in reversed(COLUMN_SPECS):
        if name in existing:
            op.drop_column(TABLE_NAME, name)
