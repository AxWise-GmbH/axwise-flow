"""
Add Stripe and subscription fields to User model.

Revision ID: add_stripe_fields
Revises: initial_schema
Create Date: 2023-10-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite, postgresql
import sys
import os

# Add the parent directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# revision identifiers, used by Alembic
revision = 'add_stripe_fields'
down_revision = 'initial_schema'
branch_labels = None
depends_on = None

# Determine if we're using SQLite or PostgreSQL
def get_url():
    return op.get_bind().engine.url

def is_sqlite():
    return get_url().drivername.startswith('sqlite')

def upgrade():
    # Use the appropriate JSON type based on the database
    JSONType = sa.JSON
    if is_sqlite():
        JSONType = sqlite.JSON
    else:
        JSONType = postgresql.JSONB
    
    # Add Stripe and subscription fields to User model if they don't exist
    # Check if columns exist first to avoid errors
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    # Add stripe_customer_id if it doesn't exist
    if 'stripe_customer_id' not in columns:
        op.add_column('users', sa.Column('stripe_customer_id', sa.String(), nullable=True))
    
    # Add subscription_status if it doesn't exist
    if 'subscription_status' not in columns:
        op.add_column('users', sa.Column('subscription_status', sa.String(), nullable=True))
    
    # Add subscription_id if it doesn't exist
    if 'subscription_id' not in columns:
        op.add_column('users', sa.Column('subscription_id', sa.String(), nullable=True))
    
    # Add usage_data if it doesn't exist
    if 'usage_data' not in columns:
        op.add_column('users', sa.Column('usage_data', JSONType, nullable=True))

def downgrade():
    # Remove Stripe and subscription fields from User model
    op.drop_column('users', 'stripe_customer_id')
    op.drop_column('users', 'subscription_status')
    op.drop_column('users', 'subscription_id')
    op.drop_column('users', 'usage_data')
