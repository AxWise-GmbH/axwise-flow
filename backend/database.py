from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import QueuePool
import os
import logging
import sys
from urllib.parse import quote_plus

# Add project root to Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from infrastructure.config.settings import Settings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Base instance
Base = declarative_base()

# Get database configuration from centralized settings
settings = Settings()
db_user = settings.db_user
db_REDACTED_PASSWORD = settings.db_REDACTED_PASSWORD
db_host = settings.db_host
db_port = settings.db_port
db_name = settings.db_name

# Construct database URL
if db_REDACTED_PASSWORD:
    safe_REDACTED_PASSWORD = quote_plus(db_REDACTED_PASSWORD)
    REDACTED_DATABASE_URL=***REDACTED***
else:
    REDACTED_DATABASE_URL=***REDACTED***

# Override with full URL if provided in settings
REDACTED_DATABASE_URL=***REDACTED*** if settings.database_url else REDACTED_DATABASE_URL

# If no REDACTED_DATABASE_URL provided, fallback to file-based SQLite database
if not REDACTED_DATABASE_URL:
    logger.warning("No REDACTED_DATABASE_URL provided, using SQLite file database")
    REDACTED_DATABASE_URL=***REDACTED***  # File-based instead of in-memory

***REMOVED*** engine configuration
DB_POOL_SIZE = settings.db_pool_size
DB_MAX_OVERFLOW = settings.db_max_overflow
DB_POOL_TIMEOUT = settings.db_pool_timeout

# Engine creation
try:
    # Detect SQLite connection
    is_sqlite = REDACTED_DATABASE_URL.startswith('sqlite:')
    
    # Configure engine based on database type
    if is_sqlite:
        # SQLite doesn't support connection pooling the same way
        engine = create_engine(
            REDACTED_DATABASE_URL,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True
        )
        logger.info("Using SQLite database")
    else:
        # Create engine for PostgreSQL with connection pooling
        engine = create_engine(
            REDACTED_DATABASE_URL,
            poolclass=QueuePool,
            pool_size=DB_POOL_SIZE,
            max_overflow=DB_MAX_OVERFLOW,
            pool_timeout=DB_POOL_TIMEOUT,
            pool_pre_ping=True,  # Verify connections before using them
            connect_args={"application_name": "DesignAId Backend"}
        )
        logger.info("Using PostgreSQL database")

    # Test the connection with proper text() usage
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        logger.info("Successfully connected to the database")
except Exception as e:
    logger.error(f"Error connecting to the database: {str(e)}")
    # Fall back to SQLite if PostgreSQL connection fails
    try:
        logger.warning("Falling back to SQLite file database")
        REDACTED_DATABASE_URL=***REDACTED***  # File-based instead of in-memory
        engine = create_engine(
            REDACTED_DATABASE_URL,
            connect_args={"check_same_thread": False}
        )
        logger.info("Successfully connected to SQLite fallback database")
    except Exception as fallback_error:
        logger.critical(f"Critical error: Failed to connect to fallback database: {str(fallback_error)}")
        raise

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """
    Dependency function to get a database session.
    Used with FastAPI's dependency injection system.
    
    Yields:
        Session: A SQLAlchemy database session
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
    
    Returns:
        bool: True if tables were created successfully, False otherwise
    """
    try:
        # Import models here to avoid circular imports
        from .models import User, InterviewData, AnalysisResult, Persona  # noqa
        
        # Create tables
        Base.metadata.create_all(bind=engine)
        logger.info("Successfully created all database tables")
        return True
    except Exception as e:
        logger.error(f"Error creating database tables: {str(e)}")
        return False

def init_db():
    """
    Initialize the database connection and tables.
    
    Returns:
        bool: True if initialization was successful, False otherwise
    """
    try:
        # Test the database connection with proper text() usage
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Create the tables
        return create_tables()
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        return False