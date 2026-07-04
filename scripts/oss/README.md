---
type: "module-readme"
title: "AxWise Flow OSS - Scripts"
description: "Core module readme representing AxWise Flow OSS - Scripts."
tags:
  - axwise-flow-oss
  - oss-readme
  - scripts
  - oss
timestamp: "2026-07-04T10:00:00Z"
---
# AxWise Flow OSS - Scripts

AxWise Flow OSS is an open-source, API-first backend with an optional Next.js UI that turns user interviews and customer feedback into evidence-linked insights and context-engineered personas. It clusters themes, surfaces sentiment, and keeps every finding traceable to source quotes. Self-hosted by default.

This directory contains helper scripts for running AxWise Flow in OSS (Open Source Software) mode.

## Prerequisites

Before running AxWise Flow in OSS mode, ensure you have:

1. **Python 3.11** (not 3.13 - pandas 2.1.4 requires Python 3.11)
2. **PostgreSQL 12+** installed and running
3. **Node.js 18+** and npm (for frontend)
4. **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/api_keys)

## Quick Start

### 1. Set up the environment

Edit `backend/.env.oss` and add your Gemini API key:

```bash
# Get your API key from: https://aistudio.google.com/app/api_keys
GEMINI_API_KEY=your_gemini_api_key_here
```

The default database configuration is:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
DB_USER=postgres
DB_PASSWORD=postgres
```

### 2. Create the PostgreSQL database

```bash
# Create the database
createdb axwise

# Or using psql
psql -U postgres -c "CREATE DATABASE axwise;"
```

### 3. Install dependencies

**Backend:**
```bash
cd backend

# Create a virtual environment with Python 3.11
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

cd ..
```

**Frontend:**
```bash
cd frontend

# Install npm packages
npm install

cd ..
```

### 4. Run the backend

```bash
# From the repository root
scripts/oss/run_backend_oss.sh
```

### 5. Verify the backend is running

In another terminal:

```bash
curl -s http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-20T..."
}
```

## Configuration

### Environment Variables

The following environment variables are configured in `backend/.env.oss`:

| Variable | Description | Default |
|----------|-------------|---------|
| `OSS_MODE` | Enable OSS mode (disables authentication) | `true` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://USER:PASS@HOST:PORT/DB |
| `GEMINI_API_KEY` | Google Gemini API key | *Required* |
| `UVICORN_PORT` | Backend server port | `8000` |
| `ENABLE_CLERK_VALIDATION` | Enable Clerk authentication | `false` (disabled in OSS mode) |

### Database Configuration

The default database configuration expects:
- **Host**: localhost
- **Port**: 5432
- **Database**: axwise
- **User**: postgres
- **Password**: postgres

You can modify these in `backend/.env.oss` if your PostgreSQL setup is different.

### Frontend Configuration (Optional)

The Next.js frontend is configured via `frontend/.env.local.oss`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_CLERK_AUTH=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_OSS_MODE=true
NEXT_PUBLIC_DEV_AUTH_TOKEN=dev_test_token_local
```

**Notes:**
- No per-file edits required - all configuration is in environment files
- The frontend automatically attaches dev tokens via shared API helpers
- The backend accepts any token starting with `dev_test_token_` in OSS mode
- Authentication is disabled in OSS mode for simplified local development

## Troubleshooting

### PostgreSQL Connection Issues

If you see database connection errors:

1. Verify PostgreSQL is running:
   ```bash
   pg_isready
   ```

2. Check if the database exists:
   ```bash
   psql -U postgres -l | grep axwise
   ```

3. Create the database if it doesn't exist:
   ```bash
   createdb axwise
   ```

### Missing Dependencies

If you see import errors:

```bash
cd backend
pip install -r requirements.txt
```

### Port Already in Use

If port 8000 is already in use, you can change it in `backend/.env.oss`:

```bash
UVICORN_PORT=8001
```

## API Documentation

Once the backend is running, you can access:

- **Health Check**: http://localhost:8000/health
- **API Documentation (Swagger)**: http://localhost:8000/docs
- **API Documentation (ReDoc)**: http://localhost:8000/redoc

## Development

### Running with Auto-reload

The script runs with `--reload` flag by default, which automatically restarts the server when code changes are detected.

### Viewing Logs

The backend logs are printed to stdout. You can redirect them to a file:

```bash
scripts/oss/run_backend_oss.sh 2>&1 | tee backend.log
```

## Next Steps

After the backend is running:

1. Set up the frontend (see `frontend/README.md`)
2. Explore the API documentation at http://localhost:8000/docs
3. Try the example requests in the API docs

## Support

For issues and questions:
- Check the main [README.md](../../README.md)
- Open an issue on GitHub
- Review the [backend documentation](../../backend/README.md)

