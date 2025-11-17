"""Add pipeline_runs table for AxPersona pipeline execution history

Revision ID: add_pipeline_runs_table
Revises: add_simulation_data_table
Create Date: 2025-11-16 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql, sqlite


# revision identifiers, used by Alembic.
revision = 'add_pipeline_runs_table'
down_revision = 'add_simulation_data_table'
branch_labels = None
depends_on = None


def _is_sqlite():
    """Check if the database is SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    """Create pipeline_runs table for storing AxPersona pipeline execution history."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Choose JSON type appropriate for the backend
    JSONType = sa.JSON
    if _is_sqlite():
        JSONType = sqlite.JSON
    else:
        # Prefer JSONB on Postgres for efficiency
        JSONType = postgresql.JSONB

    tables = inspector.get_table_names()
    if "pipeline_runs" in tables:
        # Already exists - skip creating
        return

    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        # Status tracking
        sa.Column("status", sa.String(), nullable=True, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        # Input configuration
        sa.Column("business_context", JSONType, nullable=False),
        # Execution details
        sa.Column("execution_trace", JSONType, nullable=True),
        sa.Column("total_duration_seconds", sa.Float(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        # Results
        sa.Column("dataset", JSONType, nullable=True),
        # Quick access metadata (denormalized for query performance)
        sa.Column("questionnaire_stakeholder_count", sa.Integer(), nullable=True),
        sa.Column("simulation_id", sa.String(), nullable=True),
        sa.Column("analysis_id", sa.String(), nullable=True),
        sa.Column("persona_count", sa.Integer(), nullable=True),
        sa.Column("interview_count", sa.Integer(), nullable=True),
        # Foreign keys
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], name="fk_pipeline_runs_user_id"),
        sa.UniqueConstraint("job_id", name="uq_pipeline_runs_job_id"),
    )

    # Create indexes for efficient querying
    op.create_index(
        "ix_pipeline_runs_job_id",
        "pipeline_runs",
        ["job_id"],
        unique=True,
    )
    op.create_index(
        "ix_pipeline_runs_user_id",
        "pipeline_runs",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_pipeline_runs_status",
        "pipeline_runs",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_pipeline_runs_created_at",
        "pipeline_runs",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Drop pipeline_runs table and indexes."""
    # Drop indexes first
    try:
        op.drop_index("ix_pipeline_runs_created_at", table_name="pipeline_runs")
    except Exception:
        pass
    try:
        op.drop_index("ix_pipeline_runs_status", table_name="pipeline_runs")
    except Exception:
        pass
    try:
        op.drop_index("ix_pipeline_runs_user_id", table_name="pipeline_runs")
    except Exception:
        pass
    try:
        op.drop_index("ix_pipeline_runs_job_id", table_name="pipeline_runs")
    except Exception:
        pass
    
    # Drop table
    op.drop_table("pipeline_runs")

