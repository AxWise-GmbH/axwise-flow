"""initial schema

Revision ID: initial_schema
Revises: 
Create Date: 2025-02-26 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = 'initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Create users table
    op.create_table('users',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('subscription_status', sa.String(), nullable=True),
        sa.Column('subscription_id', sa.String(), nullable=True),
        sa.Column('usage_data', sqlite.JSON, nullable=True),
        sa.PrimaryKeyConstraint('user_id')
    )

    # Create interview_data table
    op.create_table('interview_data',
        sa.Column('data_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('upload_date', sa.DateTime(), nullable=True),
        sa.Column('filename', sa.String(), nullable=True),
        sa.Column('input_type', sa.String(), nullable=True),
        sa.Column('original_data', sa.Text(), nullable=True),
        sa.Column('transformed_data', sqlite.JSON, nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('data_id')
    )

    # Create analysis_results table
    op.create_table('analysis_results',
        sa.Column('result_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('data_id', sa.Integer(), nullable=True),
        sa.Column('analysis_date', sa.DateTime(), nullable=True),
        sa.Column('results', sqlite.JSON, nullable=True),
        sa.Column('llm_provider', sa.String(), nullable=True),
        sa.Column('llm_model', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['data_id'], ['interview_data.data_id'], ),
        sa.PrimaryKeyConstraint('result_id')
    )

    # Create personas table
    op.create_table('personas',
        sa.Column('persona_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('result_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('demographics', sqlite.JSON, nullable=True),
        sa.Column('goals', sqlite.JSON, nullable=True),
        sa.Column('pain_points', sqlite.JSON, nullable=True),
        sa.Column('behaviors', sqlite.JSON, nullable=True),
        sa.Column('quotes', sqlite.JSON, nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['result_id'], ['analysis_results.result_id'], ),
        sa.PrimaryKeyConstraint('persona_id')
    )

def downgrade():
    op.drop_table('personas')
    op.drop_table('analysis_results')
    op.drop_table('interview_data')
    op.drop_table('users')