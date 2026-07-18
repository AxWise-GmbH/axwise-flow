"""Add Phase 4 outcomes, execution receipts, and governed scorer versions.

Revision ID: 20260718_orchestration_outcomes
Revises: 20260716_orchestration_v1
Create Date: 2026-07-18 10:00:00+00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260718_orchestration_outcomes"
down_revision = "20260716_orchestration_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "orchestration_outcomes" not in tables:
        op.create_table(
            "orchestration_outcomes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("outcome_id", sa.String(), nullable=False),
            sa.Column("decision_id", sa.String(), nullable=False),
            sa.Column("partner_id", sa.String(), nullable=False),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("external_user_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("idempotency_key", sa.String(), nullable=False),
            sa.Column("request_hash", sa.String(), nullable=False),
            sa.Column("contract_version", sa.String(), nullable=False),
            sa.Column("scorer_version", sa.String(), nullable=False),
            sa.Column("outcome_payload", sa.JSON(), nullable=False),
            sa.Column("evaluation_payload", sa.JSON(), nullable=False),
            sa.Column("authorization_status", sa.String(), nullable=False),
            sa.Column("execution_status", sa.String(), nullable=False),
            sa.Column("normalized_success", sa.Float(), nullable=False),
            sa.Column("quality_score", sa.Float(), nullable=True),
            sa.Column("stakeholder_acceptance", sa.Float(), nullable=True),
            sa.Column("cost", sa.Float(), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
            sa.Column("rework_count", sa.Integer(), nullable=False),
            sa.Column("escalation_count", sa.Integer(), nullable=False),
            sa.Column("human_override", sa.Boolean(), nullable=False),
            sa.Column(
                "received_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["decision_id"], ["orchestration_decisions.decision_id"]
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.UniqueConstraint(
                "external_org_id",
                "external_user_id",
                "outcome_id",
                name="uq_orchestration_outcome_tenant_id",
            ),
            sa.UniqueConstraint(
                "partner_id",
                "external_org_id",
                "external_user_id",
                "idempotency_key",
                name="uq_orchestration_outcome_idempotency",
            ),
        )
        for column in (
            "outcome_id",
            "decision_id",
            "partner_id",
            "external_org_id",
            "user_id",
        ):
            op.create_index(
                f"ix_orchestration_outcomes_{column}",
                "orchestration_outcomes",
                [column],
            )

    inspector = sa.inspect(op.get_bind())
    if "orchestration_execution_receipts" not in inspector.get_table_names():
        op.create_table(
            "orchestration_execution_receipts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("receipt_id", sa.String(), nullable=False),
            sa.Column("outcome_id", sa.String(), nullable=False),
            sa.Column("decision_id", sa.String(), nullable=False),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("external_user_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("node_id", sa.String(), nullable=False),
            sa.Column("agent_id", sa.String(), nullable=True),
            sa.Column("attempt", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("receipt_payload", sa.JSON(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["external_org_id", "external_user_id", "outcome_id"],
                [
                    "orchestration_outcomes.external_org_id",
                    "orchestration_outcomes.external_user_id",
                    "orchestration_outcomes.outcome_id",
                ],
                name="fk_orchestration_receipt_tenant_outcome",
            ),
            sa.ForeignKeyConstraint(
                ["decision_id"], ["orchestration_decisions.decision_id"]
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.UniqueConstraint(
                "external_org_id",
                "external_user_id",
                "receipt_id",
                name="uq_orchestration_receipt_tenant_id",
            ),
        )
        for column in (
            "receipt_id",
            "outcome_id",
            "decision_id",
            "external_org_id",
            "external_user_id",
            "user_id",
            "node_id",
            "agent_id",
        ):
            op.create_index(
                f"ix_orchestration_execution_receipts_{column}",
                "orchestration_execution_receipts",
                [column],
            )

    inspector = sa.inspect(op.get_bind())
    if "orchestration_scorer_versions" not in inspector.get_table_names():
        op.create_table(
            "orchestration_scorer_versions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("external_org_id", sa.String(), nullable=False),
            sa.Column("version", sa.String(), nullable=False),
            sa.Column("parent_version", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.Column("evaluation_report", sa.JSON(), nullable=True),
            sa.Column("reviewed_by", sa.String(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint(
                "external_org_id",
                "version",
                name="uq_orchestration_scorer_version_tenant",
            ),
        )
        for column in ("external_org_id", "version", "status"):
            op.create_index(
                f"ix_orchestration_scorer_versions_{column}",
                "orchestration_scorer_versions",
                [column],
            )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "orchestration_scorer_versions" in tables:
        op.drop_table("orchestration_scorer_versions")
    inspector = sa.inspect(op.get_bind())
    if "orchestration_execution_receipts" in inspector.get_table_names():
        op.drop_table("orchestration_execution_receipts")
    inspector = sa.inspect(op.get_bind())
    if "orchestration_outcomes" in inspector.get_table_names():
        op.drop_table("orchestration_outcomes")
