"""
Script to create database tables directly using SQLAlchemy.
Note: This script is kept for reference, but Alembic is the preferred method for schema management.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent.parent.absolute()
sys.path.append(str(project_root))

# Import database models
from backend.database import Base, engine
from backend.models import User, InterviewData, AnalysisResult, Persona


def create_tables():
    """Create all tables defined in the models."""
    print("Creating database tables...")
    print(f"Engine URL: {engine.url}")
    print(f"Tables to be created: {Base.metadata.tables.keys()}")
    Base.metadata.create_all(bind=engine)

    # Verify tables were created
    import psycopg2

    conn = psycopg2.connect("postgresql://postgres@localhost:5432/interview_insights")
    cur = conn.cursor()
    cur.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    tables = [row[0] for row in cur.fetchall()]
    print(f"Tables in database: {tables}")
    conn.close()

    print("Tables created successfully.")


if __name__ == "__main__":
    create_tables()
