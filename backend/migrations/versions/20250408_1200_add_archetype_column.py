"""add archetype column to personas table

Revision ID: 20250408_1200
Revises: 20250407_1125
Create Date: 2025-04-08 12:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20250408_1200"
down_revision = "20250407_1125"
branch_labels = None
depends_on = None


def _persona_columns() -> list[sa.Column]:
    return [
        sa.Column("archetype", sa.String(), nullable=True),
        # `demographics` belongs to initial_schema. It is repaired here for old
        # partial installs, but intentionally survives this revision's downgrade.
        sa.Column("demographics", sa.JSON(), nullable=True),
        sa.Column("goals_and_motivations", sa.JSON(), nullable=True),
        sa.Column("skills_and_expertise", sa.JSON(), nullable=True),
        sa.Column("workflow_and_environment", sa.JSON(), nullable=True),
        sa.Column("challenges_and_frustrations", sa.JSON(), nullable=True),
        sa.Column("needs_and_desires", sa.JSON(), nullable=True),
        sa.Column("technology_and_tools", sa.JSON(), nullable=True),
        sa.Column("attitude_towards_research", sa.JSON(), nullable=True),
        sa.Column("attitude_towards_ai", sa.JSON(), nullable=True),
        sa.Column("key_quotes", sa.JSON(), nullable=True),
        sa.Column("overall_confidence", sa.Float(), nullable=True),
        sa.Column("supporting_evidence_summary", sa.JSON(), nullable=True),
    ]


def _existing_columns() -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("personas")
    }


def upgrade() -> None:
    existing = _existing_columns()
    for column in _persona_columns():
        if column.name not in existing:
            op.add_column("personas", column)
            existing.add(column.name)


def downgrade() -> None:
    existing = _existing_columns()
    # Reverse dependency order and preserve demographics, which is owned by the
    # initial schema rather than by this revision.
    owned_columns = [
        column.name
        for column in reversed(_persona_columns())
        if column.name != "demographics"
    ]
    for column_name in owned_columns:
        if column_name in existing:
            op.drop_column("personas", column_name)
            existing.remove(column_name)
