"""Add MCP models

Revision ID: c0b1b8a2591d
Revises: add_pipeline_runs_table
Create Date: 2026-03-05 18:14:25.864059+00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c0b1b8a2591d'
down_revision = 'add_pipeline_runs_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('axwise_api_key', sa.String(), nullable=True))
    op.add_column('users', sa.Column('mcp_injection_count', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_users_axwise_api_key'), 'users', ['axwise_api_key'], unique=True)
    op.create_table('digital_twins',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.String(), nullable=True),
    sa.Column('role', sa.String(), nullable=True),
    sa.Column('seniority', sa.String(), nullable=True),
    sa.Column('company_context', sa.Text(), nullable=True),
    sa.Column('communication_flaws', sa.Text(), nullable=True),
    sa.Column('active_scopes', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )

def downgrade() -> None:
    op.drop_table('digital_twins')
    op.drop_index(op.f('ix_users_axwise_api_key'), table_name='users')
    op.drop_column('users', 'mcp_injection_count')
    op.drop_column('users', 'axwise_api_key')
    op.create_table('cached_prds',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('result_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('prd_type', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('prd_data', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['result_id'], ['analysis_results.result_id'], name='cached_prds_result_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='cached_prds_pkey')
    )
    op.create_index('ix_cached_prds_id', 'cached_prds', ['id'], unique=False)
    op.create_table('analysis_results',
    sa.Column('result_id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('data_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('analysis_date', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('completed_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('results', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('llm_provider', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('llm_model', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('status', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('error_message', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('stakeholder_intelligence', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('pydantic_insights', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('executive_summary', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['data_id'], ['interview_data.id'], name='analysis_results_data_id_fkey'),
    sa.PrimaryKeyConstraint('result_id', name='analysis_results_pkey')
    )
    op.create_table('interview_data',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('upload_date', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('filename', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('input_type', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('original_data', sa.TEXT(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], name='interview_data_user_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='interview_data_pkey')
    )
    op.create_table('pipeline_runs',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('job_id', sa.VARCHAR(), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('status', sa.VARCHAR(), server_default=sa.text("'pending'::character varying"), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=False),
    sa.Column('started_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('completed_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True),
    sa.Column('business_context', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False),
    sa.Column('execution_trace', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('total_duration_seconds', sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True),
    sa.Column('error', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('dataset', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('questionnaire_stakeholder_count', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('simulation_id', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('analysis_id', sa.VARCHAR(), autoincrement=False, nullable=True),
    sa.Column('persona_count', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('interview_count', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], name='fk_pipeline_runs_user_id'),
    sa.PrimaryKeyConstraint('id', name='pipeline_runs_pkey'),
    sa.UniqueConstraint('job_id', name='uq_pipeline_runs_job_id')
    )
    op.create_index('ix_pipeline_runs_user_id', 'pipeline_runs', ['user_id'], unique=False)
    op.create_index('ix_pipeline_runs_status', 'pipeline_runs', ['status'], unique=False)
    op.create_index('ix_pipeline_runs_job_id', 'pipeline_runs', ['job_id'], unique=True)
    op.create_index('ix_pipeline_runs_created_at', 'pipeline_runs', ['created_at'], unique=False)
    # ### end Alembic commands ###
