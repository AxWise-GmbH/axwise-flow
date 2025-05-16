***REMOVED*** Utility Scripts

This directory contains utility scripts for database management and maintenance.

## Scripts

### check_db.py

A diagnostic tool that connects to the PostgreSQL database and displays detailed information about the database schema, including:
- List of all tables
- Column definitions (name, type, nullability, default values)
- Foreign key relationships

**Usage:**
```bash
python -m backend.scripts.db_utils.check_db
```

### migrate_sqlite_to_pg.py

A migration tool to transfer data from a SQLite database to PostgreSQL. This is useful when switching database backends or when moving from development (SQLite) to production (PostgreSQL).

The script:
- Connects to both SQLite and PostgreSQL databases
- Extracts schema and data from SQLite
- Transforms data as needed (especially JSON fields)
- Loads data into PostgreSQL

**Usage:**
```bash
python -m backend.scripts.db_utils.migrate_sqlite_to_pg
```

### create_tables.py

**Note:** This script is kept for reference only. Alembic is the preferred method for schema management.

Creates database tables directly using SQLAlchemy model definitions. This bypasses Alembic migrations and should only be used in specific scenarios where Alembic is not suitable.

**Usage:**
```bash
python -m backend.scripts.db_utils.create_tables
```

## Best Practices

1. Always back up your database before running migration scripts
2. Use Alembic for schema changes whenever possible
3. Run these scripts from the project root directory to ensure proper path resolution
4. Check the console output for any errors during execution
