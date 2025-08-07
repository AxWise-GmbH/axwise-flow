"""Add stakeholder intelligence support

Revision ID: add_stakeholder_intelligence
Revises: add_research_sessions
Create Date: 2024-01-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_stakeholder_intelligence'
down_revision = 'add_research_sessions'
branch_labels = None
depends_on = None


def upgrade():
    """Add stakeholder intelligence column to analysis_results table"""
    # Add stakeholder_intelligence column to analysis_results table
    op.add_column('analysis_results', 
                  sa.Column('stakeholder_intelligence', sa.JSON(), nullable=True))
    
    # Add index for stakeholder intelligence queries (for PostgreSQL)
    # Note: This will be a regular index for SQLite compatibility
    try:
        # Try PostgreSQL-specific GIN index first
        op.execute("""
            CREATE INDEX CONCURRENTLY idx_analysis_stakeholder_intelligence
            ON analysis_results USING GIN (stakeholder_intelligence)
            WHERE stakeholder_intelligence IS NOT NULL
        """)
    except Exception:
        # Fallback to regular index for SQLite and other databases
        op.create_index('idx_analysis_stakeholder_intelligence', 
                       'analysis_results', 
                       ['stakeholder_intelligence'])
    
    # Add index for multi-stakeholder analysis queries
    try:
        # Try PostgreSQL-specific expression index
        op.execute("""
            CREATE INDEX CONCURRENTLY idx_analysis_multi_stakeholder
            ON analysis_results ((stakeholder_intelligence->>'total_stakeholders')::int)
            WHERE stakeholder_intelligence IS NOT NULL
        """)
    except Exception:
        # For SQLite, we'll skip this complex index
        pass


def downgrade():
    """Remove stakeholder intelligence support"""
    # Drop indexes
    try:
        op.drop_index('idx_analysis_multi_stakeholder', table_name='analysis_results')
    except Exception:
        pass
    
    try:
        op.drop_index('idx_analysis_stakeholder_intelligence', table_name='analysis_results')
    except Exception:
        pass
    
    # Drop column
    op.drop_column('analysis_results', 'stakeholder_intelligence')
