"""rename interview data primary key

Revision ID: 20250407_1115
Revises: add_analysis_result_status
Create Date: 2025-04-07 11:15:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20250407_1115"
down_revision = "add_analysis_result_status"
branch_labels = None
depends_on = None


_SQLITE_FK_NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
}


def _drop_stale_sqlite_batch_tables(connection) -> None:
    """Repair an interrupted non-transactional SQLite batch migration."""

    if connection.dialect.name != "sqlite":
        return
    for table_name in (
        "_alembic_tmp_interview_data",
        "_alembic_tmp_analysis_results",
    ):
        connection.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}"'))


def _columns(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _foreign_keys(inspector) -> list[dict]:
    return [
        foreign_key
        for foreign_key in inspector.get_foreign_keys("analysis_results")
        if foreign_key.get("constrained_columns") == ["data_id"]
    ]


def _reflected_fk_name(connection, foreign_key: dict) -> str:
    name = foreign_key.get("name")
    if name:
        return name
    if connection.dialect.name == "sqlite":
        return "fk_analysis_results_data_id_interview_data"
    raise RuntimeError(
        "Cannot safely replace an unnamed analysis_results.data_id foreign key"
    )


def _replace_analysis_result_foreign_key(connection, *, target_column: str) -> None:
    inspector = sa.inspect(connection)
    foreign_keys = _foreign_keys(inspector)
    naming_convention = (
        _SQLITE_FK_NAMING_CONVENTION
        if connection.dialect.name == "sqlite"
        else None
    )
    batch_kwargs = (
        {"naming_convention": naming_convention} if naming_convention else {}
    )
    with op.batch_alter_table("analysis_results", **batch_kwargs) as batch_op:
        for foreign_key in foreign_keys:
            batch_op.drop_constraint(
                _reflected_fk_name(connection, foreign_key),
                type_="foreignkey",
            )
        batch_op.create_foreign_key(
            "analysis_results_data_id_fkey",
            "interview_data",
            ["data_id"],
            [target_column],
        )


def upgrade():
    connection = op.get_bind()
    _drop_stale_sqlite_batch_tables(connection)
    inspector = sa.inspect(connection)
    tables = set(inspector.get_table_names())
    if "interview_data" not in tables or "analysis_results" not in tables:
        return

    interview_columns = _columns(inspector, "interview_data")
    if "id" not in interview_columns:
        if "data_id" not in interview_columns:
            raise RuntimeError(
                "interview_data has neither the source data_id nor target id column"
            )
        with op.batch_alter_table("interview_data") as batch_op:
            batch_op.alter_column("data_id", new_column_name="id")

    # Re-inspect after the batch rebuild, then replace every reflected data_id
    # foreign key. SQLite's initial schema leaves this FK unnamed, so the batch
    # naming convention supplies a deterministic name for the drop operation.
    _replace_analysis_result_foreign_key(connection, target_column="id")


def downgrade():
    connection = op.get_bind()
    _drop_stale_sqlite_batch_tables(connection)
    inspector = sa.inspect(connection)
    tables = set(inspector.get_table_names())
    if "interview_data" not in tables or "analysis_results" not in tables:
        return

    interview_columns = _columns(inspector, "interview_data")
    if "data_id" not in interview_columns:
        if "id" not in interview_columns:
            raise RuntimeError(
                "interview_data has neither the source data_id nor target id column"
            )
        with op.batch_alter_table("interview_data") as batch_op:
            batch_op.alter_column("id", new_column_name="data_id")

    _replace_analysis_result_foreign_key(
        connection,
        target_column="data_id",
    )
