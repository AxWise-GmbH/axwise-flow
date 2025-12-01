#!/bin/bash

# AxWise Flow OSS - Backend Startup Script
# This script starts the backend in OSS mode with the appropriate configuration

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AxWise Flow OSS - Backend Startup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo -e "${GREEN}Repository root:${NC} $REPO_ROOT"
echo -e "${GREEN}Backend directory:${NC} $BACKEND_DIR"
echo ""
# Ensure axwise venv and env are loaded
echo -e "${GREEN}Ensuring axwise environment (venv + .env) is loaded...${NC}"
set +e  # Temporarily disable exit on error
AXWISE_FORCE_ACTIVATE=1 source "$REPO_ROOT/scripts/oss/activate_env.sh" >/dev/null 2>&1
set -e  # Re-enable exit on error
echo -e "${GREEN}Using python:${NC} $(command -v python)"


# Check if .env.oss exists
if [ ! -f "$BACKEND_DIR/.env.oss" ]; then
    echo -e "${RED}Error: .env.oss file not found in backend directory${NC}"
    echo -e "${YELLOW}Please create backend/.env.oss with the required configuration${NC}"
    echo ""
    echo "Example configuration:"
    echo "  OSS_MODE=true"
    echo "  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise"
    echo "  GEMINI_API_KEY=your_api_key_here"
    exit 1
fi

# Environment should now be loaded by activate_env.sh; just verify required vars
if [ -z "${OSS_MODE:-}" ]; then
  echo -e "${YELLOW}Warning: OSS_MODE not set; defaulting to true${NC}"
  export OSS_MODE=true
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo -e "${RED}Error: GEMINI_API_KEY not set. Update backend/.env.oss with a valid key.${NC}"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}Error: DATABASE_URL not set. Update backend/.env.oss.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Environment variables present${NC}"
echo -e "${GREEN}✓ OSS_MODE:${NC} ${OSS_MODE:-false}"
echo -e "${GREEN}✓ DATABASE_URL:${NC} ${DATABASE_URL}"
echo -e "${GREEN}✓ GEMINI_API_KEY:${NC} ${GEMINI_API_KEY:0:10}..."
echo ""

# Reminder: minimal OSS setup (no per-file edits needed)
echo -e "${BLUE}OSS showcase setup:${NC} Set OSS_MODE, DATABASE_URL, GEMINI_API_KEY in backend/.env.oss"
echo -e "${BLUE}Auth in OSS mode:${NC} Backend accepts dev tokens starting with ${YELLOW}dev_test_token_${NC}"
echo -e "${BLUE}Frontend token:${NC} Provided via NEXT_PUBLIC_DEV_AUTH_TOKEN or defaults to ${YELLOW}dev_test_token_${NC}"


# Check if PostgreSQL is running and ensure database exists
echo -e "${BLUE}Checking PostgreSQL connection...${NC}"
if command -v psql &> /dev/null; then
    # Convert SQLAlchemy URL to psql format: postgresql://USER:PASS@HOST:PORT/DB
    PSQL_URL=$(echo "$DATABASE_URL" | sed 's/postgresql+psycopg2:/postgresql:/')

    # Try to connect to the target DB first
    if psql "$PSQL_URL" -c "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}✓ PostgreSQL is running and database is accessible${NC}"
    else
        echo -e "${YELLOW}⚠ Cannot connect to target database. Will try to create it...${NC}"
        # Derive admin URL by switching to the 'postgres' DB on same server
        DB_NAME_RAW="${PSQL_URL##*/}"
        DB_NAME="${DB_NAME_RAW%%\?*}"
        ADMIN_URL="${PSQL_URL%/*}/postgres"

        set +e
        # Check if we can reach the server via 'postgres' DB
        if psql "$ADMIN_URL" -tAc "SELECT 1" &> /dev/null; then
            EXISTS=$(psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | tr -d '[:space:]')
            if [ "$EXISTS" != "1" ]; then
                echo -e "${BLUE}Creating database '${DB_NAME}'...${NC}"
                psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\";" &> /dev/null
                if [ "$?" -eq 0 ]; then
                    echo -e "${GREEN}✓ Created database '${DB_NAME}'${NC}"
                else
                    echo -e "${YELLOW}⚠ Failed to create database '${DB_NAME}'. You may need to run:${NC}"
                    echo -e "${YELLOW}   createdb ${DB_NAME}${NC}"
                fi
            else
                echo -e "${GREEN}✓ Database '${DB_NAME}' already exists${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ Cannot reach PostgreSQL server to create database. Continuing...${NC}"
        fi
        set -e

        # Re-check connection to target DB
        if psql "$PSQL_URL" -c "SELECT 1" &> /dev/null; then
            echo -e "${GREEN}✓ PostgreSQL is running and database is accessible${NC}"
        else
            echo -e "${YELLOW}⚠ Still cannot connect to PostgreSQL database. Migrations may fail; continuing...${NC}"
            echo ""
        fi
    fi
else
    echo -e "${YELLOW}⚠ Warning: psql command not found, skipping database check${NC}"
fi

# Check if Python virtual environment is active and recognized
if [ -z "${VIRTUAL_ENV:-}" ]; then
    echo -e "${YELLOW}⚠ Warning: No virtual environment active${NC}"
    echo -e "${YELLOW}  The script will continue, but it's recommended to activate:${NC}"
    echo -e "${YELLOW}    source \"$REPO_ROOT/scripts/oss/activate_env.sh\"${NC}"
    echo ""
else
    echo -e "${GREEN} Using venv:${NC} $VIRTUAL_ENV"
fi

# Change to backend directory
cd "$BACKEND_DIR"

# Check if dependencies are installed
echo -e "${BLUE}Checking Python dependencies...${NC}"
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}⚠ Warning: FastAPI not found${NC}"
    echo -e "${YELLOW}  Installing dependencies from requirements.txt...${NC}"
    python -m pip install -r requirements.txt
    echo ""
fi
# Ensure Alembic is available for migrations
if ! python -c "import alembic" 2>/dev/null; then
    echo -e "${YELLOW}⚠ Warning: Alembic not found${NC}"
    echo -e "${YELLOW}  Installing dependencies from requirements.txt...${NC}"
    pip install -r requirements.txt
    echo ""
fi


# Run database migrations
echo -e "${BLUE}Running database migrations...${NC}"
if [ -f "$BACKEND_DIR/run_migrations.py" ]; then
    python run_migrations.py || echo -e "${YELLOW}⚠ Warning: Migration failed (this may be normal for first run)${NC}"
else
    echo -e "${YELLOW}⚠ Warning: run_migrations.py not found, skipping migrations${NC}"
fi
echo ""

# Start the backend server
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Starting Backend Server${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Server will be available at:${NC} http://localhost:${UVICORN_PORT:-8000}"
echo -e "${GREEN}Health check endpoint:${NC} http://localhost:${UVICORN_PORT:-8000}/health"
echo -e "${GREEN}API documentation:${NC} http://localhost:${UVICORN_PORT:-8000}/docs"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Start uvicorn with the backend app
# Set PYTHONPATH to include the repository root so imports work correctly
export PYTHONPATH="$REPO_ROOT:$PYTHONPATH"

# Determine log level for uvicorn from environment (defaults to info)
UVICORN_LOG_LEVEL="${LOG_LEVEL:-INFO}"
UVICORN_LOG_LEVEL_LOWER=$(echo "$UVICORN_LOG_LEVEL" | tr '[:upper:]' '[:lower:]')

echo -e "${GREEN}Starting uvicorn with log level:${NC} $UVICORN_LOG_LEVEL"
echo ""

python -m uvicorn backend.api.app:app \
    --host "${UVICORN_HOST:-0.0.0.0}" \
    --port "${UVICORN_PORT:-8000}" \
    --log-level "$UVICORN_LOG_LEVEL_LOWER" \
    --reload

