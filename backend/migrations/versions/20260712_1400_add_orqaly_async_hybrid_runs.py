"""Add durable Orqaly async A+B hybrid-run persistence.

Revision ID: 20260712_orqaly_hybrid
Revises: c0b1b8a2591d
Create Date: 2026-07-12 14:00:00+00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260712_orqaly_hybrid"
down_revision = "c0b1b8a2591d"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    pipeline_columns = _columns("pipeline_runs")
    additions = [
        ("partner_id", sa.String(), True),
        ("external_org_id", sa.String(), True),
        ("external_user_id", sa.String(), True),
        ("pipeline_mode", sa.String(), True),
        ("current_stage", sa.String(), True),
        ("progress_percentage", sa.Integer(), True),
        ("request_id", sa.String(), True),
        ("idempotency_key", sa.String(), True),
        ("request_hash", sa.String(), True),
        ("request_payload", sa.JSON(), True),
        ("requested_outputs", sa.JSON(), True),
        ("callback_config", sa.JSON(), True),
        ("result_summary", sa.JSON(), True),
        ("warning", sa.Text(), True),
        ("attempt_count", sa.Integer(), True),
        ("updated_at", sa.DateTime(), True),
    ]
    for name, column_type, nullable in additions:
        if name not in pipeline_columns:
            op.add_column("pipeline_runs", sa.Column(name, column_type, nullable=nullable))

    op.execute(
        "UPDATE pipeline_runs SET pipeline_mode = 'hybrid_a_plus_b' "
        "WHERE pipeline_mode IS NULL"
    )
    op.execute(
        "UPDATE pipeline_runs SET current_stage = 'queued' "
        "WHERE current_stage IS NULL"
    )
    op.execute(
        "UPDATE pipeline_runs SET progress_percentage = 0 "
        "WHERE progress_percentage IS NULL"
    )
    op.execute(
        "UPDATE pipeline_runs SET attempt_count = 0 WHERE attempt_count IS NULL"
    )
    op.execute(
        "UPDATE pipeline_runs SET updated_at = created_at WHERE updated_at IS NULL"
    )

    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("pipeline_runs")}
    if "ix_pipeline_runs_partner_id" not in indexes:
        op.create_index("ix_pipeline_runs_partner_id", "pipeline_runs", ["partner_id"])
    if "ix_pipeline_runs_external_org_id" not in indexes:
        op.create_index(
            "ix_pipeline_runs_external_org_id", "pipeline_runs", ["external_org_id"]
        )
    if "ix_pipeline_runs_request_id" not in indexes:
        op.create_index("ix_pipeline_runs_request_id", "pipeline_runs", ["request_id"])
    if "uq_pipeline_runs_partner_org_idempotency" not in indexes:
        op.create_index(
            "uq_pipeline_runs_partner_org_idempotency",
            "pipeline_runs",
            ["partner_id", "external_org_id", "idempotency_key"],
            unique=True,
        )

    simulation_columns = _columns("simulation_data")
    if "empirical_personas" not in simulation_columns:
        op.add_column("simulation_data", sa.Column("empirical_personas", sa.JSON(), nullable=True))
    if "hybrid_metadata" not in simulation_columns:
        op.add_column("simulation_data", sa.Column("hybrid_metadata", sa.JSON(), nullable=True))

    if "orqaly_tenant_mappings" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "orqaly_tenant_mappings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("partner_id", sa.String(), nullable=False),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("external_user_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.UniqueConstraint(
                "partner_id",
                "external_org_id",
                "external_user_id",
                name="uq_orqaly_tenant_mapping",
            ),
        )
        op.create_index(
            "ix_orqaly_tenant_mappings_partner_id",
            "orqaly_tenant_mappings",
            ["partner_id"],
        )
        op.create_index(
            "ix_orqaly_tenant_mappings_external_org_id",
            "orqaly_tenant_mappings",
            ["external_org_id"],
        )
        op.create_index(
            "ix_orqaly_tenant_mappings_user_id",
            "orqaly_tenant_mappings",
            ["user_id"],
        )


def downgrade() -> None:
    if "orqaly_tenant_mappings" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("orqaly_tenant_mappings")

    for index_name in (
        "uq_pipeline_runs_partner_org_idempotency",
        "ix_pipeline_runs_request_id",
        "ix_pipeline_runs_external_org_id",
        "ix_pipeline_runs_partner_id",
    ):
        try:
            op.drop_index(index_name, table_name="pipeline_runs")
        except Exception:
            pass

    for column in ("hybrid_metadata", "empirical_personas"):
        try:
            op.drop_column("simulation_data", column)
        except Exception:
            pass

    for column in (
        "updated_at",
        "attempt_count",
        "warning",
        "result_summary",
        "callback_config",
        "requested_outputs",
        "request_payload",
        "request_hash",
        "idempotency_key",
        "request_id",
        "progress_percentage",
        "current_stage",
        "pipeline_mode",
        "external_user_id",
        "external_org_id",
        "partner_id",
    ):
        try:
            op.drop_column("pipeline_runs", column)
        except Exception:
            pass
