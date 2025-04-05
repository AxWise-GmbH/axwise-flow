import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import create_engine

from alembic import context

import os
import sys
from pathlib import Path

# Add the parent directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

# Import database models
from database import Base

# Import load_env to load environment variables
try:
    from load_env import load_dotenv
    load_dotenv()
except ImportError:
    pass

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Override sqlalchemy.url with environment variable if available
DATABASE_URL=***REDACTED***

# Check if we should use SQLite
use_sqlite = os.getenv("ALEMBIC_USE_SQLITE", "false").lower() == "true"
if use_sqlite:
    DATABASE_URL=***REDACTED*** + str(project_root / "app.db")

# Set the sqlalchemy.url in the config
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set up logger
logger = logging.getLogger("alembic.env")

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    try:
        url = config.get_main_option("sqlalchemy.url")
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
        )

        with context.begin_transaction():
            context.run_migrations()
            logger.info("Offline migrations completed successfully")
    except Exception as e:
        logger.error(f"Error during offline migrations: {str(e)}")
        raise

def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    try:
        # Log the configuration being used
        logger.info("Starting online migrations")
        DATABASE_URL=***REDACTED***
        logger.info(f"Using database URL: {database_url}")

        # Check if using SQLite
        is_sqlite = database_url.startswith('sqlite:')

        if is_sqlite:
            # Special handling for SQLite
            logger.info("Using SQLite database")
            connectable = create_engine(
                database_url,
                connect_args={"check_same_thread": False} if is_sqlite else {},
            )
        else:
            # Standard handling for PostgreSQL and other databases
            connectable = engine_from_config(
                config.get_section(config.config_ini_section, {}),
                prefix="sqlalchemy.",
                poolclass=pool.NullPool,
            )

        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                # These options help with SQLite foreign key support
                render_as_batch=is_sqlite,
                compare_type=True
            )

            with context.begin_transaction():
                context.run_migrations()
                logger.info("Online migrations completed successfully")
    except Exception as e:
        logger.error(f"Error during online migrations: {str(e)}")
        raise

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
