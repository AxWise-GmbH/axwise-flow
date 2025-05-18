"""
Add CachedPRD table for storing generated PRDs.

Revision ID: add_cached_prd_table
Revises: add_analysis_result_status
Create Date: 2025-04-15 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision = 'add_cached_prd_table'
down_revision = 'add_analysis_result_status'  # Adjust this to your latest migration
branch_labels = None
depends_on = None


def upgrade():
    # Create the cached_prds table
    op.create_table(
        'cached_prds',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('result_id', sa.Integer(), nullable=False),
        sa.Column('prd_type', sa.String(20), nullable=False),
        sa.Column('prd_data', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['result_id'], ['analysis_results.result_id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create an index for faster lookups
    op.create_index(
        'ix_cached_prds_result_id_prd_type', 
        'cached_prds', 
        ['result_id', 'prd_type'], 
        unique=True
    )


def downgrade():
    # Drop the index
    op.drop_index('ix_cached_prds_result_id_prd_type', table_name='cached_prds')
    
    # Drop the table
    op.drop_table('cached_prds')
