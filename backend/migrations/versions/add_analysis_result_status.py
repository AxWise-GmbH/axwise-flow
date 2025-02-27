"""add analysis result status

Revision ID: add_analysis_result_status
Revises: initial_schema
Create Date: 2025-02-26 19:01:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_analysis_result_status'
down_revision = 'initial_schema'
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to analysis_results table
    op.add_column('analysis_results', sa.Column('completed_at', sa.DateTime(), nullable=True))
    op.add_column('analysis_results', sa.Column('status', sa.String(), server_default='processing'))

    # Update existing records to have 'completed' status
    op.execute("""
        UPDATE analysis_results 
        SET status = 'completed', 
            completed_at = analysis_date 
        WHERE results IS NOT NULL
    """)

    # Update failed records (those with error in results)
    op.execute("""
        UPDATE analysis_results 
        SET status = 'failed',
            completed_at = analysis_date
        WHERE results->>'error' IS NOT NULL
    """)

def downgrade():
    # Remove the new columns
    op.drop_column('analysis_results', 'status')
    op.drop_column('analysis_results', 'completed_at')
