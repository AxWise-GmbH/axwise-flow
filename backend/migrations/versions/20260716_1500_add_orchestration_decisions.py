"""Add immutable Phase 1 orchestration decisions and audit events.

Revision ID: 20260716_orchestration_v1
Revises: 20260712_orqaly_hybrid
Create Date: 2026-07-16 15:00:00+00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260716_orchestration_v1"
down_revision = "20260712_orqaly_hybrid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "orchestration_decisions" not in tables:
        op.create_table(
            "orchestration_decisions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("decision_id", sa.String(), nullable=False),
            sa.Column("partner_id", sa.String(), nullable=False),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("external_user_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("idempotency_key", sa.String(), nullable=False),
            sa.Column("request_id", sa.String(), nullable=False),
            sa.Column("request_hash", sa.String(), nullable=False),
            sa.Column("contract_version", sa.String(), nullable=False),
            sa.Column("scorer_version", sa.String(), nullable=False),
            sa.Column("input_snapshot", sa.JSON(), nullable=False),
            sa.Column("decision_payload", sa.JSON(), nullable=False),
            sa.Column("routing_mode", sa.String(), nullable=False),
            sa.Column("selected_agent_id", sa.String(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("parent_decision_id", sa.String(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("retention_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.ForeignKeyConstraint(
                ["parent_decision_id"], ["orchestration_decisions.decision_id"]
            ),
            sa.UniqueConstraint("decision_id", name="uq_orchestration_decision_id"),
            sa.UniqueConstraint(
                "partner_id",
                "external_org_id",
                "idempotency_key",
                name="uq_orchestration_decision_idempotency",
            ),
        )
        op.create_index(
            "ix_orchestration_decisions_decision_id",
            "orchestration_decisions",
            ["decision_id"],
        )
        op.create_index(
            "ix_orchestration_decisions_partner_id",
            "orchestration_decisions",
            ["partner_id"],
        )
        op.create_index(
            "ix_orchestration_decisions_external_org_id",
            "orchestration_decisions",
            ["external_org_id"],
        )
        op.create_index(
            "ix_orchestration_decisions_user_id",
            "orchestration_decisions",
            ["user_id"],
        )
        op.create_index(
            "ix_orchestration_decisions_request_id",
            "orchestration_decisions",
            ["request_id"],
        )

    inspector = sa.inspect(op.get_bind())
    if "orchestration_events" not in inspector.get_table_names():
        op.create_table(
            "orchestration_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("decision_id", sa.String(), nullable=False),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("event_payload", sa.JSON(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["decision_id"], ["orchestration_decisions.decision_id"]
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.UniqueConstraint("event_id", name="uq_orchestration_event_id"),
        )
        op.create_index(
            "ix_orchestration_events_event_id",
            "orchestration_events",
            ["event_id"],
        )
        op.create_index(
            "ix_orchestration_events_decision_id",
            "orchestration_events",
            ["decision_id"],
        )
        op.create_index(
            "ix_orchestration_events_external_org_id",
            "orchestration_events",
            ["external_org_id"],
        )
        op.create_index(
            "ix_orchestration_events_user_id",
            "orchestration_events",
            ["user_id"],
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "orchestration_events" in inspector.get_table_names():
        op.drop_table("orchestration_events")
    inspector = sa.inspect(op.get_bind())
    if "orchestration_decisions" in inspector.get_table_names():
        op.drop_table("orchestration_decisions")
