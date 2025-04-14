"""
Script to migrate data from SQLite to PostgreSQL.
"""

import os
import sys
import json
from pathlib import Path
import sqlite3
import psycopg2
from psycopg2.extras import Json

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.absolute()
sys.path.append(str(project_root))

# SQLite database path
SQLITE_DB_PATH = project_root / "app.db"

# PostgreSQL connection string
PG_REDACTED_CONNECTION_STRING = "postgresql://postgres@localhost:5432/interview_insights"

def connect_sqlite():
    """Connect to SQLite database."""
    if not SQLITE_DB_PATH.exists():
        print(f"SQLite database not found at {SQLITE_DB_PATH}")
        return None
    
    print(f"Connecting to SQLite database at {SQLITE_DB_PATH}")
    return sqlite3.connect(str(SQLITE_DB_PATH))

def connect_postgres():
    """Connect to PostgreSQL database."""
    print(f"Connecting to PostgreSQL database: {PG_REDACTED_CONNECTION_STRING}")
    return psycopg2.connect(PG_REDACTED_CONNECTION_STRING)

def get_table_names(sqlite_conn):
    """Get list of tables in SQLite database."""
    cursor = sqlite_conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]
    cursor.close()
    return tables

def get_column_names(sqlite_conn, table_name):
    """Get column names for a table in SQLite database."""
    cursor = sqlite_conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    cursor.close()
    return columns

def get_table_data(sqlite_conn, table_name):
    """Get all data from a table in SQLite database."""
    cursor = sqlite_conn.cursor()
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()
    cursor.close()
    return rows

def insert_data(pg_conn, table_name, columns, rows):
    """Insert data into PostgreSQL database."""
    cursor = pg_conn.cursor()
    
    # Skip if no data to insert
    if not rows:
        print(f"No data to insert for table {table_name}")
        return 0
    
    # Prepare placeholders for the INSERT statement
    placeholders = ", ".join(["%s"] * len(columns))
    columns_str = ", ".join(columns)
    
    # Prepare the INSERT statement
    insert_query = f"INSERT INTO {table_name} ({columns_str}) VALUES ({placeholders})"
    
    # Process JSON columns
    processed_rows = []
    for row in rows:
        processed_row = []
        for i, value in enumerate(row):
            # Try to parse JSON strings
            if isinstance(value, str) and (value.startswith('{') or value.startswith('[')):
                try:
                    json_value = json.loads(value)
                    processed_row.append(Json(json_value))
                except json.JSONDecodeError:
                    processed_row.append(value)
            else:
                processed_row.append(value)
        processed_rows.append(tuple(processed_row))
    
    # Execute the INSERT statement for each row
    try:
        cursor.executemany(insert_query, processed_rows)
        pg_conn.commit()
        print(f"Inserted {len(rows)} rows into {table_name}")
        return len(rows)
    except Exception as e:
        pg_conn.rollback()
        print(f"Error inserting data into {table_name}: {e}")
        return 0
    finally:
        cursor.close()

def migrate_data():
    """Migrate data from SQLite to PostgreSQL."""
    # Connect to databases
    sqlite_conn = connect_sqlite()
    if not sqlite_conn:
        print("Failed to connect to SQLite database. Exiting.")
        return
    
    pg_conn = connect_postgres()
    
    try:
        # Get list of tables
        tables = get_table_names(sqlite_conn)
        print(f"Found {len(tables)} tables in SQLite database: {tables}")
        
        # Migrate each table
        total_rows_migrated = 0
        for table_name in tables:
            # Skip alembic_version table
            if table_name == 'alembic_version':
                print(f"Skipping {table_name} table")
                continue
                
            print(f"\nMigrating table: {table_name}")
            
            # Get column names
            columns = get_column_names(sqlite_conn, table_name)
            print(f"Columns: {columns}")
            
            # Get data
            rows = get_table_data(sqlite_conn, table_name)
            print(f"Found {len(rows)} rows in {table_name}")
            
            # Insert data into PostgreSQL
            rows_inserted = insert_data(pg_conn, table_name, columns, rows)
            total_rows_migrated += rows_inserted
        
        print(f"\nMigration complete. Total rows migrated: {total_rows_migrated}")
        
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        sqlite_conn.close()
        pg_conn.close()

if __name__ == "__main__":
    migrate_data()
