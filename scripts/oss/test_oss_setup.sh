#!/bin/bash

# AxWise Flow OSS - Setup Test Script
# This script verifies that the OSS setup is correct

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AxWise Flow OSS - Setup Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo -e "${GREEN}Repository root:${NC} $REPO_ROOT"
echo ""

# Test 1: Check if .env.oss exists
echo -e "${BLUE}Test 1: Checking .env.oss file...${NC}"
if [ -f "$BACKEND_DIR/.env.oss" ]; then
    echo -e "${GREEN}✓ .env.oss file exists${NC}"
else
    echo -e "${RED}✗ .env.oss file not found${NC}"
    exit 1
fi
echo ""

# Test 2: Check if required environment variables are set
echo -e "${BLUE}Test 2: Checking environment variables...${NC}"
source "$BACKEND_DIR/.env.oss"

if [ -n "${GEMINI_API_KEY:-}" ]; then
    echo -e "${GREEN}✓ GEMINI_API_KEY is set${NC}"
    echo -e "  Value: [configured; hidden]"
else
    echo -e "${RED}✗ GEMINI_API_KEY is not set${NC}"
    exit 1
fi

if [ -n "${DATABASE_URL:-}" ]; then
    echo -e "${GREEN}✓ DATABASE_URL is set${NC}"
    echo -e "  Value: $DATABASE_URL"
else
    echo -e "${RED}✗ DATABASE_URL is not set${NC}"
    exit 1
fi

if [ "${OSS_MODE:-}" = "true" ]; then
    echo -e "${GREEN}✓ OSS_MODE is enabled${NC}"
else
    echo -e "${YELLOW}⚠ OSS_MODE is not set to true${NC}"
fi
echo ""

# Test 3: Check PostgreSQL connection
echo -e "${BLUE}Test 3: Checking PostgreSQL...${NC}"
if command -v pg_isready &> /dev/null; then
    if pg_isready &> /dev/null; then
        echo -e "${GREEN}✓ PostgreSQL is running${NC}"
    else
        echo -e "${RED}✗ PostgreSQL is not running${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ pg_isready command not found, skipping PostgreSQL check${NC}"
fi
echo ""

# Test 4: Check if database exists
echo -e "${BLUE}Test 4: Checking database...${NC}"
if command -v psql &> /dev/null; then
    if psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw axwise; then
        echo -e "${GREEN}✓ Database 'axwise' exists${NC}"
    else
        echo -e "${YELLOW}⚠ Database 'axwise' does not exist${NC}"
        echo -e "${YELLOW}  Create it with: createdb axwise${NC}"
    fi
else
    echo -e "${YELLOW}⚠ psql command not found, skipping database check${NC}"
fi
echo ""

# Test 5: Check Python dependencies
echo -e "${BLUE}Test 5: Checking Python dependencies...${NC}"
cd "$BACKEND_DIR"
if python3 -c "import fastapi; import uvicorn; import sqlalchemy" 2>/dev/null; then
    echo -e "${GREEN}✓ Core Python dependencies are installed${NC}"
else
    echo -e "${YELLOW}⚠ Some Python dependencies are missing${NC}"
    echo -e "${YELLOW}  Install them with: pip install -r requirements.txt${NC}"
fi
echo ""

# Test 6: Check if run script exists and is executable
echo -e "${BLUE}Test 6: Checking run script...${NC}"
if [ -f "$REPO_ROOT/scripts/oss/run_backend_oss.sh" ]; then
    echo -e "${GREEN}✓ run_backend_oss.sh exists${NC}"
    if [ -x "$REPO_ROOT/scripts/oss/run_backend_oss.sh" ]; then
        echo -e "${GREEN}✓ run_backend_oss.sh is executable${NC}"
    else
        echo -e "${YELLOW}⚠ run_backend_oss.sh is not executable${NC}"
        echo -e "${YELLOW}  Make it executable with: chmod +x scripts/oss/run_backend_oss.sh${NC}"
    fi
else
    echo -e "${RED}✗ run_backend_oss.sh not found${NC}"
    exit 1
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Test Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Your OSS setup looks good!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Start the backend: ${BLUE}scripts/oss/run_backend_oss.sh${NC}"
echo -e "  2. Test the health endpoint: ${BLUE}curl http://localhost:8000/health${NC}"
echo -e "  3. View API docs: ${BLUE}http://localhost:8000/docs${NC}"
echo ""
