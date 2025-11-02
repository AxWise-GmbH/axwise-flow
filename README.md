# AxWise Flow OSS

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow-oss.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow-oss/stargazers)

Your AI co‑pilot from raw customer input to actionable product plans.

This OSS repo contains the actual code we run locally:
- FastAPI backend to analyze interviews, generate evidence‑linked personas and insights, and expose a documented API (see /health and /docs when running)
- Next.js frontend (optional) for local exploration of results
- OSS scripts to bootstrap the environment quickly for self‑hosting and development

Authentication is disabled in OSS mode to streamline local setup; production deployments can enable Clerk auth.
## Overview

AxWise Flow OSS is an open‑source, API‑first backend with an optional Next.js UI that turns user interviews and customer feedback into evidence‑linked insights and context‑engineered personas. It clusters themes, surfaces sentiment, and keeps every finding traceable to source quotes. Self‑hosted by default and built for product discovery and UX research.

### At a glance
- Evidence‑linked insights and personas (trace conclusions to original quotes)
- Automated themes/topics and sentiment across transcripts and notes
- Simulates context‑engineered personas to explore stakeholder perspectives and scenarios

- REST API with interactive docs at /docs; integrate without the UI
- PostgreSQL + Alembic; FastAPI + Uvicorn; optional Next.js frontend
- OSS mode runs locally without auth; production can enable Clerk


## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 12+
- Node.js 18+ (for frontend)
- Gemini API Key ([Get one here](https://aistudio.google.com/app/api-keys))

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/AxWise-GmbH/axwise-flow-oss.git
   cd axwise-flow-oss
   ```

2. **Set up PostgreSQL database**
   ```bash
   createdb axwise
   ```

3. **Configure environment variables**

   Edit `backend/.env.oss` and add your Gemini API key:
   ```bash
   GEMINI_API_KEY=***REMOVED***
   ```

   Or export environment variables:
   ```bash
   export OSS_MODE=true \
     DATABASE_URL=***REDACTED*** \
     GEMINI_API_KEY=***REMOVED***
   ```

4. **Install Python dependencies**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

5. **Run the backend**
   ```bash
   scripts/oss/run_backend_oss.sh
   ```

6. **Verify the backend is running**
   ```bash
   # In another terminal
   curl -s http://localhost:8000/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2025-10-20T..."
   }
   ```

### Frontend Setup (Optional)

Option A (recommended)
```bash
# From repository root
scripts/oss/run_frontend_oss.sh
```
This will:
- Copy frontend/.env.local.oss to frontend/.env.local
- Ensure NEXT_PUBLIC_...=***REMOVED***
- Install npm deps if needed
- Start Next.js on http://localhost:3000

Option B (manual)
```bash
cd frontend
npm install
cp .env.local.oss .env.local
# Ensure:
# NEXT_PUBLIC_...=***REMOVED***
npm run dev
```

Open http://localhost:3000 in your browser

### Minimal environment you need for a local showcase (no per‑file edits)

You do not need to set environment variables inside each `route.ts` or `page.tsx`. The code reads configuration from the env files and shared helpers.

- Backend (edit `backend/.env.oss`):
  - `OSS_MODE=true`
  - `DATABASE_URL=***REDACTED***
  - `GEMINI_API_KEY=***REMOVED***

- Frontend (edit `frontend/.env.local.oss`):
  - `NEXT_PUBLIC_...=***REMOVED***
  - `NEXT_PUBLIC_...=***REMOVED***
  - `NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED***
  - Optional: `NEXT_PUBLIC_...=***REMOVED*** (defaults to `DEV_TOKEN_REDACTED` if omitted)

Notes:
- In OSS mode the backend accepts development tokens that start with `dev_test_token_`; the frontend injects this token automatically into API calls via shared helpers.
- No changes to individual routes/pages are required for auth in OSS mode.


## 📚 Documentation

- [Backend Documentation](backend/README.md)
- [OSS Scripts Documentation](scripts/oss/README.md)
- [API Documentation](http://localhost:8000/docs) (when backend is running)

## 🏗️ Architecture

```
axwise-flow-oss/
├── backend/              # FastAPI backend
│   ├── api/             # API routes and endpoints
│   ├── services/        # Business logic
│   ├── models/          # Data models
│   ├── infrastructure/  # Configuration and utilities
│   └── .env.oss        # OSS environment configuration
├── frontend/            # Next.js frontend
│   ├── app/            # Next.js app directory
│   ├── components/     # React components
│   └── lib/            # Utilities and helpers
└── scripts/
    └── oss/            # OSS-specific scripts
        └── run_backend_oss.sh
```
## 📸 Screenshots

<table>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.01.png" alt="Dashboard / Overview" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.14.png" alt="Upload / Data Input" width="420"/></td>
  </tr>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.23.png" alt="Analysis Results" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.42.png" alt="Personas" width="420"/></td>
  </tr>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.51.png" alt="Insights / Themes" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.20.10.png" alt="Evidence Linking" width="420"/></td>
  </tr>
</table>


## 🔑 Key Features

- **AI-Powered Analysis**: Leverage Google Gemini for intelligent user research analysis
- **Persona Generation**: Automatically generate user personas from interview data
- **Multi-Stakeholder Analysis**: Analyze perspectives from different stakeholder groups
- **Evidence Linking**: Connect insights to source material with traceability
- **Export Capabilities**: Export results in various formats

## 🛠️ Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: SQL toolkit and ORM
- **PostgreSQL**: Relational database
- **Google Gemini**: LLM for AI capabilities
- **Pydantic**: Data validation

### Frontend
- **Next.js 14**: React framework
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **Clerk**: Authentication (disabled in OSS mode)

## 🔧 Configuration

### OSS Mode

OSS mode disables authentication and uses simplified configuration suitable for local development and self-hosting.

Key differences from production mode:
- ✅ No authentication required
- ✅ Simplified CORS settings
- ✅ Local database configuration
- ✅ Development-friendly defaults

### Environment Variables

See `backend/.env.oss` for all available configuration options.

Essential variables:
- `OSS_MODE=true` - Enable OSS mode
- `DATABASE_URL` - PostgreSQL connection string
- `GEMINI_API_KEY` - Google Gemini API key

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## 🆘 Troubleshooting

### Backend won't start

1. Check PostgreSQL is running: `pg_isready`
2. Verify database exists: `psql -l | grep axwise`
3. Check Python dependencies: `pip install -r backend/requirements.txt`

##***REMOVED*** connection errors

1. Verify DATABASE_URL in `backend/.env.oss`
2. Check PostgreSQL credentials
3. Ensure database exists: `createdb axwise`

### API key errors

1. Verify GEMINI_API_KEY is set in `backend/.env.oss`
2. Check API key is valid at [Google AI Studio](https://aistudio.google.com/app/api-keys)

## 📞 Support

- 📧 Email: support@axwise.de
- 🐛 Issues: [GitHub Issues](https://github.com/AxWise-GmbH/axwise-flow-oss/issues)
- 📖 Documentation: [Wiki](https://github.com/AxWise-GmbH/axwise-flow-oss/wiki)

## 🙏 Acknowledgments

Built with ❤️ by the AxWise team and contributors.

---

**Note**: This is the open-source version of AxWise Flow. For the hosted version with additional features, visit [axwise.de](https://axwise.de).

