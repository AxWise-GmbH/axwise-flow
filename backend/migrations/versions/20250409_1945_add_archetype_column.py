"""add archetype column to personas table

Revision ID: 20250409_1945
Revises: 
Create Date: 2025-04-09 19:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '20250409_1945'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Check if the column exists before adding it
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('personas')]
    
    # Add archetype column if it doesn't exist
    if 'archetype' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN archetype VARCHAR"))
    
    # Add other missing columns if they don't exist
    if 'demographics' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN demographics TEXT"))
    
    if 'goals_and_motivations' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN goals_and_motivations TEXT"))
    
    if 'skills_and_expertise' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN skills_and_expertise TEXT"))
    
    if 'workflow_and_environment' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN workflow_and_environment TEXT"))
    
    if 'challenges_and_frustrations' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN challenges_and_frustrations TEXT"))
    
    if 'needs_and_desires' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN needs_and_desires TEXT"))
    
    if 'technology_and_tools' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN technology_and_tools TEXT"))
    
    if 'attitude_towards_research' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN attitude_towards_research TEXT"))
    
    if 'attitude_towards_ai' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN attitude_towards_ai TEXT"))
    
    if 'key_quotes' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN key_quotes TEXT"))
    
    if 'overall_confidence' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN overall_confidence FLOAT"))
    
    if 'supporting_evidence_summary' not in columns:
        op.execute(text("ALTER TABLE personas ADD COLUMN supporting_evidence_summary TEXT"))

def downgrade():
    # Remove the added columns
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('personas')]
    
    if 'archetype' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN archetype"))
    
    if 'demographics' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN demographics"))
    
    if 'goals_and_motivations' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN goals_and_motivations"))
    
    if 'skills_and_expertise' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN skills_and_expertise"))
    
    if 'workflow_and_environment' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN workflow_and_environment"))
    
    if 'challenges_and_frustrations' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN challenges_and_frustrations"))
    
    if 'needs_and_desires' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN needs_and_desires"))
    
    if 'technology_and_tools' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN technology_and_tools"))
    
    if 'attitude_towards_research' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN attitude_towards_research"))
    
    if 'attitude_towards_ai' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN attitude_towards_ai"))
    
    if 'key_quotes' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN key_quotes"))
    
    if 'overall_confidence' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN overall_confidence"))
    
    if 'supporting_evidence_summary' in columns:
        op.execute(text("ALTER TABLE personas DROP COLUMN supporting_evidence_summary"))
