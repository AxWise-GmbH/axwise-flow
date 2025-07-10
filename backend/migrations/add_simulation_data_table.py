"""
Database migration to add simulation_data table for persistent simulation storage.
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from backend.database import engine
import logging

logger = logging.getLogger(__name__)


def upgrade():
    """Add simulation_data table."""

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS simulation_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        simulation_id VARCHAR UNIQUE NOT NULL,
        user_id VARCHAR,
        status VARCHAR DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        business_context JSON,
        questions_data JSON,
        simulation_config JSON,
        personas JSON,
        interviews JSON,
        insights JSON,
        formatted_data JSON,
        total_personas INTEGER DEFAULT 0,
        total_interviews INTEGER DEFAULT 0,
        error_message TEXT,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
    );
    """

    create_index_sql = """
    CREATE INDEX IF NOT EXISTS idx_simulation_data_simulation_id ON simulation_data(simulation_id);
    CREATE INDEX IF NOT EXISTS idx_simulation_data_user_id ON simulation_data(user_id);
    CREATE INDEX IF NOT EXISTS idx_simulation_data_status ON simulation_data(status);
    CREATE INDEX IF NOT EXISTS idx_simulation_data_created_at ON simulation_data(created_at);
    """

    try:
        with engine.connect() as conn:
            # Create table
            conn.execute(text(create_table_sql))
            logger.info("Created simulation_data table")

            # Create indexes
            for index_sql in create_index_sql.split(";"):
                if index_sql.strip():
                    conn.execute(text(index_sql.strip()))
            logger.info("Created indexes for simulation_data table")

            conn.commit()
            logger.info("Successfully added simulation_data table")

    except Exception as e:
        logger.error(f"Failed to create simulation_data table: {str(e)}")
        raise


def downgrade():
    """Remove simulation_data table."""

    drop_table_sql = "DROP TABLE IF EXISTS simulation_data;"

    try:
        with engine.connect() as conn:
            conn.execute(text(drop_table_sql))
            conn.commit()
            logger.info("Successfully removed simulation_data table")

    except Exception as e:
        logger.error(f"Failed to remove simulation_data table: {str(e)}")
        raise


if __name__ == "__main__":
    # Run migration
    print("Running simulation_data table migration...")
    upgrade()
    print("Migration completed successfully!")
