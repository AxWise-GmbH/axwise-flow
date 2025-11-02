# AxWise Flow OSS - Scripts

AxWise Flow OSS is an open-source, API-first backend with an optional Next.js UI that turns user interviews and customer feedback into evidence-linked insights and context-engineered personas. It clusters themes, surfaces sentiment, and keeps every finding traceable to source quotes. Self-hosted by default.

This directory contains helper scripts for running AxWise Flow in OSS (Open Source Software) mode.

## Prerequisites

Before running the backend in OSS mode, ensure you have:

1. **Python 3.11+** installed
2. **PostgreSQL** installed and running
3. **Gemini API Key** from Google AI Studio

## Quick Start

### 1. Set up the environment

The `.env.oss` file in the `backend/` directory contains the configuration for OSS mode. Update it with your credentials:

```bash
# In repo root
export OSS_MODE=true \
  DATABASE_URL=***REDACTED*** \
  GEMINI_API_KEY=***REMOVED***
```

Or edit `backend/.env.oss` directly with your Gemini API key.

### 2. Create the PostgreSQL database

```bash
# Create the database
createdb axwise

# Or using psql
psql -U postgres -c "CREATE DATABASE axwise;"
```

### 3. Install Python dependencies

```bash
# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt
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

##***REMOVED*** Configuration

The default database configuration expects:
- **Host**: localhost
- **Port**: 5432
- **Database**: axwise
- **User**: postgres
- **Password**: postgres

You can modify these in `backend/.env.oss` if your PostgreSQL setup is different.


### Frontend environment (optional)

For the Next.js UI you also do not need to touch individual `route.ts`/`page.tsx` files. Configure only `frontend/.env.local.oss` and the scripts will copy it to `.env.local`:

- `NEXT_PUBLIC_...=***REMOVED***
- `NEXT_PUBLIC_...=***REMOVED***
- `NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED***
- Optional: `NEXT_PUBLIC_...=***REMOVED*** (defaults to `DEV_TOKEN_REDACTED`)

Notes:
- The frontend automatically attaches the dev token via shared API helpers; the backend accepts any token starting with `dev_test_token_` in OSS mode.
- No per-file edits are required to enable auth-less OSS mode.

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

