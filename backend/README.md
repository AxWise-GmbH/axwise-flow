---
type: "module-readme"
title: "AxWise Flow OSS — Backend"
description: "Core module readme representing AxWise Flow OSS — Backend."
tags:
  - axwise-flow-oss
  - backend-readme
  - backend
timestamp: "2026-07-04T10:00:00Z"
---
# AxWise Flow OSS — Backend

FastAPI backend that powers interview analysis, evidence-linked personas, insights, and an API-first workflow.

This is the code used by OSS mode when you run the project; it exposes `/health` and `/docs` locally.

## Getting Started

### Prerequisites

- Python 3.11+
- PostgreSQL 12+
- Gemini API Key ([create one](https://aistudio.google.com/app/api-keys))

### Install

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configure environment (OSS)

Preferred: use `backend/.env.oss` managed from repo root via `scripts/oss/run_backend_oss.sh`.
Minimum variables:
```bash
DATABASE_URL=***REDACTED***
GEMINI_API_KEY=***REMOVED***
OSS_MODE=true
```

### Run

Recommended (from repo root):
```bash
scripts/oss/run_backend_oss.sh
```

Or directly from backend:
```bash
uvicorn backend.api.app:app --host 0.0.0.0 --port 8000 --reload
```

Health: http://localhost:8000/health
Docs:   http://localhost:8000/docs

## Project Structure

- `api/`              — FastAPI app (entry is `backend.api.app:app`)
- `services/`         — Business/domain services
- `infrastructure/`   — Config, LLM providers, persistence, settings
- `models/`           — Pydantic/DB models
- `migrations/`, `alembic/` — Database migrations
- `run_migrations.py` — Helper to run Alembic migrations
- `requirements.txt`  — Pinned Python dependencies

## Key Capabilities

- Interview analysis and synthesis
- Evidence-linked personas
- Insights/themes, patterns, sentiment
- Multi-LLM support (Gemini by default)

See `backend/docs/` for deeper design notes.
## Backend Tech Stack

- FastAPI — modern Python web framework
- SQLAlchemy 2.x — ORM and SQL toolkit
- PostgreSQL + psycopg2-binary — primary database
- Alembic — database migrations
- Pydantic v2 — data validation and settings models
- Uvicorn — ASGI server
- google-genai — Gemini LLM integration (default provider)
- instructor — structured LLM outputs


## API

Browse and try the endpoints in the interactive docs when running locally:

- OpenAPI: `GET /docs`
- Health:   `GET /health`

All available endpoints and schemas are documented in the OpenAPI spec.

## Testing

```bash
pytest
# or
pytest -q backend/tests
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Submit a pull request

## License

This backend is part of AxWise Flow OSS and is licensed under the Apache License 2.0. See the repository root `LICENSE` file.
