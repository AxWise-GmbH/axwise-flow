#!/bin/bash

# AxWise Flow OSS - Frontend Startup Script
# This script starts the frontend in OSS mode with the appropriate configuration

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AxWise Flow OSS - Frontend Startup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"

echo -e "${GREEN}Repository root:${NC} $REPO_ROOT"
echo -e "${GREEN}Frontend directory:${NC} $FRONTEND_DIR"
echo ""

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found${NC}"
    exit 1
fi

# Change to frontend directory
cd "$FRONTEND_DIR"

# Check if .env.local.oss exists
if [ ! -f "$FRONTEND_DIR/.env.local.oss" ]; then
    echo -e "${RED}Error: .env.local.oss file not found in frontend directory${NC}"
    echo -e "${YELLOW}Please create frontend/.env.local.oss with the required configuration${NC}"
    exit 1
fi

# Copy .env.local.oss to .env.local for Next.js to use
echo -e "${GREEN}Loading environment from .env.local.oss...${NC}"
cp "$FRONTEND_DIR/.env.local.oss" "$FRONTEND_DIR/.env.local"
echo -e "${GREEN}✓ Environment configuration copied to .env.local${NC}"
echo ""

# Load environment variables to display them
export $(grep -v '^#' "$FRONTEND_DIR/.env.local" | xargs)

echo -e "${GREEN}✓ Environment variables loaded${NC}"
echo -e "${GREEN}✓ NEXT_PUBLIC_...=***REMOVED*** ${NEXT_PUBLIC_...=***REMOVED***"
echo -e "${GREEN}✓ NEXT_PUBLIC_...=***REMOVED*** ${NEXT_PUBLIC_...=***REMOVED***"
echo -e "${GREEN}✓ NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** ${NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED***"
echo ""

# Reminder: minimal OSS setup (no per-file edits needed)
echo -e "${BLUE}OSS showcase setup:${NC} Configure ${YELLOW}frontend/.env.local.oss${NC}; script copies it to .env.local"
echo -e "${BLUE}Auth in OSS mode:${NC} Backend accepts dev tokens starting with ${YELLOW}dev_test_token_${NC}"
echo -e "${BLUE}Frontend token:${NC} Use NEXT_PUBLIC_DEV_AUTH_TOKEN or default ${YELLOW}DEV_TOKEN_REDACTED${NC}"


# Check if node_modules exists
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}⚠ Warning: node_modules not found${NC}"
    echo -e "${YELLOW}  Installing dependencies...${NC}"
    echo ""

    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        echo -e "${YELLOW}Please install Node.js and npm first${NC}"
        exit 1
    fi

    npm install
    echo ""
fi

# Check if backend is running
echo -e "${BLUE}Checking backend connection...${NC}"
if command -v curl &> /dev/null; then
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is running and accessible at http://localhost:8000${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Cannot connect to backend at http://localhost:8000${NC}"
        echo -e "${YELLOW}  Make sure the backend is running with: scripts/oss/run_backend_oss.sh${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}⚠ Warning: curl command not found, skipping backend check${NC}"
fi
echo ""

# Start the frontend server
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Starting Frontend Server${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Server will be available at:${NC} http://localhost:${PORT:-3000}"
echo -e "${GREEN}Backend API:${NC} ${NEXT_PUBLIC_...=***REMOVED***"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Start Next.js dev server
npm run dev

