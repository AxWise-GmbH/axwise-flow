from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import QueuePool
import os
import logging
import sys
from urllib.parse import quote_plus

# Add project root to Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.infrastructure.config.settings import Settings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Base instance
Base = declarative_base()

# Get database configuration from centralized settings
settings = Settings()
db_user = settings.db_user
db_password = settings.db_password
db_host = settings.db_host
db_port = settings.db_port
db_name = settings.db_name

# Determine database type from environment or platform
platform_name = os.name  # 'posix' for Mac/Linux, 'nt' for Windows

# Get database URL from settings
DATABASE_URL = settings.database_url
EXPLICIT_DATABASE_URL = os.getenv("DATABASE_URL")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"


def _database_backend(url: str) -> str:
    """Return the SQLAlchemy backend name without logging credential material."""

    scheme = str(url or "").partition(":")[0].strip().lower()
    return scheme.split("+", 1)[0]


if IS_PRODUCTION and (
    not EXPLICIT_DATABASE_URL
    or _database_backend(EXPLICIT_DATABASE_URL) != "postgresql"
):
    raise RuntimeError(
        "Production requires an explicit PostgreSQL DATABASE_URL; "
        "SQLite and implicit database fallbacks are disabled"
    )

# If DATABASE_URL is explicitly set to PostgreSQL, use it
if DATABASE_URL and _database_backend(DATABASE_URL) == "postgresql":
    try:
        # Mask password if present
        masked = DATABASE_URL
        if "@" in DATABASE_URL and ":" in DATABASE_URL.split("@", 1)[0]:
            creds, rest = DATABASE_URL.split("@", 1)
            user = creds.split("//", 1)[-1].split(":", 1)[0]
            masked = f"postgresql://{user}:***@{rest}"
        logger.info(f"Using explicitly configured PostgreSQL database: {masked}")
    except Exception:
        logger.info("Using explicitly configured PostgreSQL database")
# Otherwise, determine based on platform and credentials
else:
    # On any platform, try to use PostgreSQL if credentials are provided
    if db_user:
        if db_password:
            safe_password = quote_plus(db_password)
            DATABASE_URL = (
                f"postgresql://{db_user}:{safe_password}@{db_host}:{db_port}/{db_name}"
            )
        else:
            DATABASE_URL = f"postgresql://{db_user}@{db_host}:{db_port}/{db_name}"
        logger.info(
            f"Using PostgreSQL database on {platform_name} with URL: {DATABASE_URL}"
        )
    # If no PostgreSQL credentials, fall back to SQLite
    else:
        DATABASE_URL = "sqlite:///./axwise.db"  # File-based instead of in-memory
        logger.info(f"Using SQLite database as fallback on {platform_name} platform")

# Database engine configuration
DB_POOL_SIZE = settings.db_pool_size
DB_MAX_OVERFLOW = settings.db_max_overflow
DB_POOL_TIMEOUT = settings.db_pool_timeout

# Engine creation
try:
    # Detect SQLite connection
    is_sqlite = DATABASE_URL.startswith("sqlite:")

    # Configure engine based on database type
    if is_sqlite:
        # SQLite doesn't support connection pooling the same way
        engine = create_engine(
            DATABASE_URL, connect_args={"check_same_thread": False}, pool_pre_ping=True
        )
        logger.info("Using SQLite database")
    else:
        # Create engine for PostgreSQL with connection pooling
        try:
            engine = create_engine(
                DATABASE_URL,
                poolclass=QueuePool,
                pool_size=DB_POOL_SIZE,
                max_overflow=DB_MAX_OVERFLOW,
                pool_timeout=DB_POOL_TIMEOUT,
                pool_pre_ping=True,  # Verify connections before using them
                pool_reset_on_return="rollback",  # Always ROLLBACK on connection return
                connect_args={"application_name": "DesignAId Backend"},
            )
            logger.info("Using PostgreSQL database")
        except Exception as pg_error:
            # Specific error handling for PostgreSQL connection issues
            error_msg = str(pg_error).lower()
            if (
                "role 'postgres' does not exist" in error_msg
                or "password authentication failed" in error_msg
            ):
                logger.warning(f"PostgreSQL authentication error: {error_msg}")
                logger.warning(
                    "This may be due to missing PostgreSQL role or incorrect credentials"
                )
                logger.warning(
                    "On Mac/Linux, you may need to create the PostgreSQL role or use SQLite instead"
                )
                raise
            else:
                # Re-raise the original error for other PostgreSQL issues
                raise

    # Test the connection with proper text() usage
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        logger.info("Successfully connected to the database")
except Exception as e:
    if IS_PRODUCTION:
        logger.error("Production PostgreSQL connection failed")
        raise RuntimeError(
            "Production PostgreSQL connection failed; refusing SQLite fallback"
        ) from None
    logger.error(f"Error connecting to the database: {str(e)}")
    # Fall back to SQLite if PostgreSQL connection fails
    try:
        logger.warning("Falling back to SQLite file database")
        DATABASE_URL = "sqlite:///./axwise.db"  # File-based instead of in-memory
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
        logger.info("Successfully connected to SQLite fallback database")

        # Add database type to environment for other components to access
        os.environ["DATABASE_URL_TYPE"] = "sqlite"
    except Exception as fallback_error:
        logger.critical(
            f"Critical error: Failed to connect to fallback database: {str(fallback_error)}"
        )
        raise

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """
    Dependency function to get a database session.
    Ensures the connection is in a clean state (rolls back aborted transactions)
    and always closes the session. This prevents reusing a connection in
    'InFailedSqlTransaction' state which would break subsequent requests.

    Yields:
        Session: A SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        # Proactively clear any failed transaction state on the checked-out connection
        try:
            db.execute(text("SELECT 1"))
        except Exception as e:
            logger.warning(f"DB ping failed at session start; attempting rollback: {e}")
            try:
                db.rollback()
            except Exception as rb_e:
                logger.error(f"Rollback after ping failure also failed: {rb_e}")
            # After rollback, don't swallow the original error if ping still fails later

        yield db
    except Exception:
        # Make sure to rollback the session if any exception bubbles up through the dependency
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass


def run_migrations():
    """
    Run database migrations using Alembic.

    Returns:
        bool: True if migrations were applied successfully, False otherwise
    """
    try:
        import alembic.config
        import os
        from alembic import command

        # Get the absolute path to alembic.ini
        # In Docker container, the structure is /app/backend/database.py and /app/backend/alembic.ini
        backend_dir = os.path.dirname(__file__)  # /app/backend
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")

        # Create Alembic configuration
        alembic_cfg = alembic.config.Config(alembic_ini_path)

        # Set the SQLAlchemy URL
        alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

        # Run the migration
        command.upgrade(alembic_cfg, "head")

        logger.info("Database migrations applied successfully")
        return True
    except ImportError:
        logger.warning("Alembic not installed. Skipping migrations.")
        return False
    except Exception as e:
        logger.error(f"Error applying migrations: {e}")
        return False


def create_tables():
    """
    Creates all tables defined in the models.
    Should be called when the application starts.

    Returns:
        bool: True if tables were created successfully, False otherwise
    """
    try:
        # First try to run migrations
        migrations_applied = run_migrations()
        if migrations_applied:
            logger.info("Successfully applied migrations; ensuring any missing tables are created via metadata")
        else:
            environment = os.getenv("ENVIRONMENT", "development").lower()
            if environment == "production":
                raise RuntimeError(
                    "Database migrations failed in production; refusing direct schema creation"
                )
            # Direct creation remains available for local and test environments.
            logger.warning("Falling back to direct table creation outside production")

        # Import models using centralized import mechanism to avoid registry conflicts
        try:
            from backend.models import (
                User,
                InterviewData,
                AnalysisResult,
                SimulationData,
                PersonaKnowledgeChunk,
            )
        except ImportError:
            # Fallback: use dynamic import with the same unique module name
            try:
                # Avoid executing models.py directly via spec_from_file_location
                # to prevent duplicate SQLAlchemy mapper registrations.
                # Instead, import the centralized package which re-exports the models.
                import importlib

                backend_models = importlib.import_module("backend.models")
                User = backend_models.User
                InterviewData = backend_models.InterviewData
                AnalysisResult = backend_models.AnalysisResult
                SimulationData = backend_models.SimulationData
                PersonaKnowledgeChunk = backend_models.PersonaKnowledgeChunk
            except Exception as e:
                logger.warning(
                    f"Could not import SQLAlchemy models for table creation via package: {e}"
                )
            except Exception as e:
                logger.warning(
                    f"Could not import SQLAlchemy models for table creation: {e}"
                )

        # Import research session models directly to avoid conflicts
        from backend.models.research_session import ResearchSession, ResearchExport

        # Create tables
        Base.metadata.create_all(bind=engine)

        # Verify tables were created
        with engine.connect() as conn:
            if "sqlite" in DATABASE_URL:
                # For SQLite, we need to explicitly create tables
                # Check if users table exists
                result = conn.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
                    )
                )
                if not result.fetchone():
                    # Create users table
                    conn.execute(
                        text(
                            """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id VARCHAR(255) PRIMARY KEY,
                        email VARCHAR(255),
                        first_name VARCHAR(255),
                        last_name VARCHAR(255),
                        stripe_customer_id VARCHAR(255),
                        subscription_status VARCHAR(50),
                        subscription_id VARCHAR(255),
                        usage_data TEXT
                    )
                    """
                        )
                    )
                    conn.commit()
                    logger.info("Manually created users table for SQLite")

                # Check if interview_data table exists
                result = conn.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='interview_data'"
                    )
                )
                if not result.fetchone():
                    # Create interview_data table
                    conn.execute(
                        text(
                            """
                    CREATE TABLE IF NOT EXISTS interview_data (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id VARCHAR(255),
                        upload_date TIMESTAMP,
                        filename VARCHAR(255),
                        input_type VARCHAR(50),
                        original_data TEXT,
                        transformed_data TEXT,
                        FOREIGN KEY (user_id) REFERENCES users(user_id)
                    )
                    """
                        )
                    )
                    conn.commit()
                    logger.info("Manually created interview_data table for SQLite")

                # Check if analysis_results table exists
                result = conn.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_results'"
                    )
                )
                if not result.fetchone():
                    # Create analysis_results table
                    conn.execute(
                        text(
                            """
                    CREATE TABLE IF NOT EXISTS analysis_results (
                        result_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        data_id INTEGER,
                        analysis_date TIMESTAMP,
                        completed_at TIMESTAMP,
                        results TEXT,
                        llm_provider VARCHAR(50),
                        llm_model VARCHAR(50),
                        status VARCHAR(50),
                        error_message TEXT,
                        FOREIGN KEY (data_id) REFERENCES interview_data(id)
                    )
                    """
                        )
                    )
                    conn.commit()
                    logger.info("Manually created analysis_results table for SQLite")

                # Check if personas table exists
                result = conn.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='personas'"
                    )
                )
                if not result.fetchone():
                    # Create personas table
                    conn.execute(
                        text(
                            """
                    CREATE TABLE IF NOT EXISTS personas (
                        persona_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        result_id INTEGER,
                        name VARCHAR(255),
                        description TEXT,
                        role_context TEXT,
                        key_responsibilities TEXT,
                        tools_used TEXT,
                        collaboration_style TEXT,
                        analysis_approach TEXT,
                        pain_points TEXT,
                        patterns TEXT,
                        confidence FLOAT,
                        evidence TEXT,
                        persona_metadata TEXT,
                        FOREIGN KEY (result_id) REFERENCES analysis_results(result_id)
                    )
                    """
                        )
                    )
                    conn.commit()
                    logger.info("Manually created personas table for SQLite")

        logger.info("Successfully created all database tables")
        return True
    except Exception as e:
        logger.error(f"Error creating database tables: {str(e)}")
        return False


def verify_model_registry() -> bool:
    """Lightweight check to detect duplicate SQLAlchemy model registrations.

    Returns True if no issues detected; logs warnings and returns False otherwise.
    """
    try:
        # Import expected models from the centralized package
        from backend.models import User, InterviewData, AnalysisResult, SimulationData

        issues = []

        # 1) Verify models resolve to the expected module path
        for cls in (User, InterviewData, AnalysisResult, SimulationData):
            if cls is None:
                issues.append(
                    "One or more models could not be imported from backend.models"
                )
                continue
            mod = getattr(cls, "__module__", "")
            if mod != "backend.models":
                issues.append(
                    f"{cls.__name__}.__module__={mod} (expected 'backend.models')"
                )

        # 2) Check registry for duplicate mapped classes by (module, name)
        try:
            registry = getattr(Base, "registry", None)
            class_registry = (
                getattr(registry, "_class_registry", {}) if registry else {}
            )
            seen = {}
            dups = []
            for name, cls in class_registry.items():
                # Filter out non-class placeholders
                if not hasattr(cls, "__name__") or not hasattr(cls, "__module__"):
                    continue
                key = (cls.__module__, cls.__name__)
                if key in seen and seen[key] is not cls:
                    dups.append(key)
                else:
                    seen[key] = cls
            if dups:
                issues.append(f"Duplicate mapped classes detected: {dups}")
        except Exception as e:
            logger.debug(f"Could not introspect SQLAlchemy class registry: {e}")

        if issues:
            logger.warning(
                "Model registry integrity check found potential issues:\n - "
                + "\n - ".join(issues)
            )
            return False

        logger.info(
            "Model registry integrity check passed: no duplicate mappers detected"
        )
        return True
    except Exception as e:
        logger.warning(f"Model registry integrity check failed to run: {e}")
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
