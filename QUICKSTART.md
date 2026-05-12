# AxWise Flow OSS - Quick Start Guide

Get up and running with AxWise Flow in minutes!

## 🐳 Quick Start with Docker (Recommended)

The fastest way to get AxWise running — just Docker and a Gemini API key.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A **Gemini API Key** — get one free at [Google AI Studio](https://aistudio.google.com/app/api_keys)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/AxWise-GmbH/axwise-flow.git
cd axwise-flow

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env and add your Gemini API key
#    Replace 'your_gemini_api_key_here' with your actual key

# 4. Start everything
docker compose up
```

That's it! Once the containers are running:

- 🌐 **Frontend**: [http://localhost:3000](http://localhost:3000)
- 🔌 **Backend API**: [http://localhost:8000](http://localhost:8000)
- 📖 **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

> **Tip:** Run `docker compose up -d` to start in the background, and `docker compose logs -f` to follow logs.

To stop everything: `docker compose down`
To stop and remove all data: `docker compose down -v`

---

## Manual Setup (Alternative)

If you prefer running without Docker, follow the steps below.

## Step 1: Prerequisites Check

Ensure you have:
- ✅ **Python 3.11** installed (not 3.13 - pandas 2.1.4 requires 3.11)
- ✅ **Node.js 18+** and npm (for frontend)
- ✅ **PostgreSQL 12+** running
- ✅ **Gemini API Key** from Google

### Get a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/api_keys)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

## Step 2: Database Setup

Create the PostgreSQL database:

```bash
# Option 1: Using createdb command
createdb axwise

# Option 2: Using psql
psql -U postgres -c "CREATE DATABASE axwise;"

# Verify the database was created
psql -U postgres -l | grep axwise
```

## Step 3: Configure Environment

Edit `backend/.env.oss` and add your Gemini API key:

```bash
# Replace 'your_gemini_api_key_here' with your actual API key
GEMINI_API_KEY=your_gemini_api_key_here
```

The default database configuration is:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
DB_USER=postgres
DB_PASSWORD=postgres
```

If you need different database credentials, update these values in `backend/.env.oss`.

## Step 4: Install Dependencies

### Backend Dependencies

```bash
# Navigate to backend directory
cd backend

# Create virtual environment with Python 3.11
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install Python packages
pip install -r requirements.txt

# Return to repo root
cd ..
```

### Frontend Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install npm packages
npm install

# Return to repo root
cd ..
```

## Step 5: Start the Backend

```bash
# From repository root
scripts/oss/run_backend_oss.sh
```

You should see output like:

```
========================================
  AxWise Flow OSS - Backend Startup
========================================

Repository root: /path/to/axwise-flow
Backend directory: /path/to/axwise-flow/backend

Ensuring axwise environment (venv + .env) is loaded...
✓ Environment variables present
✓ OSS_MODE: true
✓ DATABASE_URL: postgresql://postgres:postgres@localhost:5432/axwise
✓ GEMINI_API_KEY: AIzaSyAWUU...

========================================
  Starting Backend Server
========================================
Server will be available at: http://localhost:8000
Health check endpoint: http://localhost:8000/health
API documentation: http://localhost:8000/docs

INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

## Step 6: Test the Backend

Open a new terminal and run:

```bash
curl -s http://localhost:8000/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2025-10-20T18:30:00.000000+00:00"
}
```

## Step 7: Explore the API

Open your browser and visit:

- **API Documentation (Swagger UI)**: http://localhost:8000/docs
- **API Documentation (ReDoc)**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## Next Steps

### Try the API

1. Go to http://localhost:8000/docs
2. Explore the available endpoints
3. Try the "Try it out" feature on any endpoint

### Set Up the Frontend

The frontend provides a web UI for uploading interviews, viewing analysis results, and exploring personas.

**Start the frontend:**

```bash
# From repository root
cd frontend

# Copy the OSS environment configuration
cp .env.local.oss .env.local

# Start the development server
npm run dev
```

The frontend will be available at **http://localhost:3000**

**Key features:**
- 📊 **Unified Dashboard** - Overview of all research activities
- 💬 **Research Chat** - Interactive AI-powered research assistant
- 🎭 **Interview Simulation** - Simulate stakeholder interviews
- 📤 **Upload & Analyze** - Upload customer interviews for analysis
- 📈 **Visualizations** - View personas, insights, and themes
- 📜 **Activity History** - Track all analysis activities

## Troubleshooting

### Issue: "Cannot connect to PostgreSQL"

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# If not running, start it
# macOS (Homebrew):
brew services start postgresql

# Linux (systemd):
sudo systemctl start postgresql

# Windows:
# Start PostgreSQL service from Services app
```

### Issue: "Database 'axwise' does not exist"

**Solution:**
```bash
createdb axwise
```

### Issue: "GEMINI_API_KEY not set"

**Solution:**
Edit `backend/.env.oss` and ensure the GEMINI_API_KEY line is present and uncommented.

### Issue: "Port 8000 already in use"

**Solution:**
Either stop the process using port 8000, or change the port in `backend/.env.oss`:
```bash
UVICORN_PORT=8001
```

### Issue: "Module not found" errors

**Solution:**
```bash
cd backend
source venv/bin/activate  # Activate virtual environment
pip install -r requirements.txt
```

## Environment Variables Reference

Key variables in `backend/.env.oss`:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `OSS_MODE` | Enable OSS mode | `true` |
| `GEMINI_API_KEY` | Google Gemini API key | *Provided* |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://USER:PASS@HOST:PORT/DB |
| `UVICORN_PORT` | Backend server port | `8000` |
| `ENABLE_CLERK_VALIDATION` | Enable authentication | `false` (disabled in OSS) |

## Manual Start (Alternative)

If the script doesn't work, you can start the backend manually:

```bash
# From repository root
cd backend

# Load environment variables
export $(grep -v '^#' .env.oss | xargs)

# Start the server
python -m uvicorn backend.api.app:app --host 0.0.0.0 --port 8000 --reload
```

## Getting Help

- 📖 Read the full [README.md](README.md)
- 📚 Check [scripts/oss/README.md](scripts/oss/README.md)
- 🐛 Report issues on [GitHub](https://github.com/AxWise-GmbH/axwise-flow/issues)

---

**Success!** 🎉 You now have AxWise Flow running locally!

