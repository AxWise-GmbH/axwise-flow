from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Base instance
Base = declarative_base()

# PostgreSQL URL
REDACTED_DATABASE_URL=***REDACTED***

try:
    # Create engine for PostgreSQL
    engine = create_engine(REDACTED_DATABASE_URL)

    # Test the connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        logger.info("Successfully connected to the PostgreSQL database")
except Exception as e:
    logger.error(f"Error connecting to the database: {str(e)}")
    raise

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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
    try:
        # Import models here to avoid circular imports
        from .models import User, InterviewData, AnalysisResult, Persona  # noqa
        
        Base.metadata.create_all(bind=engine)
        logger.info("Successfully created all database tables")
    except Exception as e:
        logger.error(f"Error creating tables: {str(e)}")
        raise

def init_db():
    """
    Initialize the database, creating all tables.
    Call this when setting up the application.
    """
    create_tables()