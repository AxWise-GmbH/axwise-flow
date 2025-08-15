"""Remove unused persona fields

Revision ID: 20250814_1200_remove_persona_fields
Revises: 20250813_1200_add_pydantic_insights_columns
Create Date: 2025-08-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250814_1200_remove_persona_fields'
down_revision = '20250813_1200_add_pydantic_insights_columns'
branch_labels = None
depends_on = None


def upgrade():
    """Remove unused persona fields from database."""
    # Remove the three fields that are no longer used in the UI/analysis
    op.drop_column('personas', 'needs_and_desires')
    op.drop_column('personas', 'attitude_towards_research')
    op.drop_column('personas', 'attitude_towards_ai')


def downgrade():
    """Add back the removed persona fields."""
    # Add back the columns if needed for rollback
    op.add_column('personas', sa.Column('needs_and_desires', sa.JSON(), nullable=True))
    op.add_column('personas', sa.Column('attitude_towards_research', sa.JSON(), nullable=True))
    op.add_column('personas', sa.Column('attitude_towards_ai', sa.JSON(), nullable=True))
