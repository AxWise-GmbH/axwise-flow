from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
from pathlib import Path

# Create the backend directory if it doesn't exist
backend_dir = Path(__file__).parent
db_path = backend_dir / "interview_data.db"

# SQLite URL - use absolute path to avoid any path resolution issues
REDACTED_DATABASE_URL=***REDACTED***

# Create engine with check_same_thread=False to allow multiple threads (needed for FastAPI)
engine = create_engine(
    REDACTED_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Import Base from models to ensure all models are registered
from .models import Base

def get_db():
    """
    Dependency function to get a database session.
    Used with FastAPI's dependency injection system.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    """
    Creates all tables defined in the models.
    Should be called when the application starts.
    """
    Base.metadata.create_all(bind=engine)

def init_db():
    """
    Initialize the database, creating all tables.
    Call this when setting up the application.
    """
    create_tables()