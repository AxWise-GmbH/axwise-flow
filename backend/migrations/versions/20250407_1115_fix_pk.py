"""rename interview data primary key

Revision ID: 20250407_1115
Revises: add_analysis_result_status
Create Date: 2025-04-07 11:15:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250407_1115"
down_revision = "add_analysis_result_status"
branch_labels = None
depends_on = None


def upgrade():
    # Use batch mode for SQLite compatibility
    from sqlalchemy.engine.reflection import Inspector
    from sqlalchemy.exc import NoSuchTableError

    # Get the database connection
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    # Check if tables exist before attempting migration
    tables = inspector.get_table_names()
    if "interview_data" not in tables or "analysis_results" not in tables:
        return

    # Use batch mode for interview_data table
    with op.batch_alter_table("interview_data") as batch_op:
        batch_op.alter_column("data_id", new_column_name="id")

    # Use batch mode for analysis_results table
    try:
        with op.batch_alter_table("analysis_results") as batch_op:
            # Try to drop the constraint if it exists
            try:
                batch_op.drop_constraint(
                    "analysis_results_data_id_fkey", type_="foreignkey"
                )
            except Exception:
                # Constraint might not exist or have a different name in SQLite
                pass

            # Create the new foreign key
            batch_op.create_foreign_key(
                "analysis_results_data_id_fkey", "interview_data", ["data_id"], ["id"]
            )
    except NoSuchTableError:
        # Table might not exist yet
        pass


def downgrade():
    # Use batch mode for SQLite compatibility
    from sqlalchemy.engine.reflection import Inspector
    from sqlalchemy.exc import NoSuchTableError

    # Get the database connection
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    # Check if tables exist before attempting migration
    tables = inspector.get_table_names()
    if "interview_data" not in tables or "analysis_results" not in tables:
        return

    # Use batch mode for analysis_results table
    try:
        with op.batch_alter_table("analysis_results") as batch_op:
            # Try to drop the constraint if it exists
            try:
                batch_op.drop_constraint(
                    "analysis_results_data_id_fkey", type_="foreignkey"
                )
            except Exception:
                # Constraint might not exist or have a different name in SQLite
                pass

            # Create the new foreign key
            batch_op.create_foreign_key(
                "analysis_results_data_id_fkey",
                "interview_data",
                ["data_id"],
                ["data_id"],
            )
    except NoSuchTableError:
        # Table might not exist yet
        pass

    # Use batch mode for interview_data table
    with op.batch_alter_table("interview_data") as batch_op:
        batch_op.alter_column("id", new_column_name="data_id")
