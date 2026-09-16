# Orchestrator — Project Documentation

> **Use in Notion:** Import this file via **Import** → **Markdown** or copy-paste sections into pages. Formatting (headings, tables, code blocks) will be preserved.

---

## Overview

**Orchestrator** is a partner management application built with **React (Vite)** and **Supabase**. It helps teams manage partners, meetings, workflows, tasks, and AI-driven insights. The app runs as a React SPA with Vercel serverless APIs for transcription and email.

| Item | Description |
|------|-------------|
| **Frontend** | React 19, Vite 7, MUI 7 |
| **Backend / DB** | Supabase (Postgres, Auth) |
| **APIs** | Vercel serverless (transcribe, send-email, health) |
| **Deployment** | Vercel (production), local dev with `npm run dev` |

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React (Vite)   │────▶│  Vercel API      │────▶│  External APIs  │
│  Client         │     │  transcribe,      │     │  Groq, Resend,  │
│                 │     │  send-email      │     │  AssemblyAI     │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         │ direct
         ▼
┌─────────────────┐
│  Supabase       │
│  Postgres, Auth │
└─────────────────┘
```

**Data flow:**

1. **Auth** — Supabase Auth (or local fallback). JWT used for API calls.
2. **Partners, meetings, workflows, history** — Client → Supabase (RLS per user).
3. **Transcription** — Client → `POST /api/transcribe` (Bearer JWT) → Groq Whisper / AssemblyAI → structured meeting data.
4. **Email** — Client → `POST /api/send-email` (Bearer JWT) → Resend.

---

## Key Features

- **Dashboard** — Period-based KPIs, funnel counts, task stats, profitability.
- **Partners** — CRUD, campaigns, tasks, meetings, notes.
- **Task Manager** — Cross-partner tasks and priorities.
- **Workflow** — Visual workflow editor (React Flow).
- **AI Let's Talk** — Voice and text commands: navigate, create partners/tasks, run operator cycles, ask about metrics.
- **Meeting transcription** — Record meetings; transcribe and structure with AI (topics, action items, summary).
- **Notifications** — AI-driven alerts and action center.
- **Settings** — Profile, theme, preferences.

---

## AI Agent Integration (Safe Mode)

Orchestrator supports external automation/agents primarily for **report ingestion** and **read-only discovery**.

**Allowed for agents:**

- **Report ingestion:** `POST /api/report-ingest` with `x-report-token` (session token; 24h TTL)
- **Polling:** `GET /api/report-ingest?token=...`
- **Discovery (read-only):** `GET /api/data-topology`

**Forbidden for agents (admin-only, human approval required):**

- Creating/updating/deleting roles or permissions (`/roles`)
- Inviting/deleting/blocking users, changing user roles, resetting passwords, disabling MFA (for example `POST/DELETE /api/invite-user`)
- Creating/rotating/revoking/deleting API keys (`/documentation` → API Keys)

**Important:** The `x-report-token` only authorizes `report-ingest` and does not grant any other access.

---

## Project Structure

| Path | Purpose |
|------|---------|
| `src/` | React app (pages, components, services, hooks, utils) |
| `src/pages/` | Dashboard, Partners, PartnerDetail, TaskManager, Workflow, Settings, etc. |
| `src/components/` | Layout, VoiceControl, Search, common UI |
| `src/services/` | partnerService, meetingService, workflowService, operatorOrchestratorService, etc. |
| `src/hooks/` | usePartners, useVoiceControl, useMeetings, etc. |
| `api/` | Vercel serverless handlers (transcribe, send-email, health, transcribe-status) |
| `api/lib/` | Shared API utilities (cors, auth, validate, errors, rate-limit, fetch) |
| `supabase/migrations/` | SQL migrations (partners, meetings, workflows, RLS) |
| `server/` | Local dev server that mounts API routes (e.g. `npm run dev:api`) |
| `docs/` | Architecture, OpenAPI, Postman, this Notion doc |

---

## API Reference

Base URL (production): `https://orchestratori.vercel.app`  
Base URL (local API): `http://localhost:3001`

**Authentication:** Where required, send Supabase JWT in header:

```
Authorization: Bearer <supabase_access_token>
```

---

### GET /api/health

**Auth:** None.

**Description:** Health check.

**Response (200):**

```json
{ "ok": true }
```

---

### GET /api/transcribe-status

**Auth:** None.

**Description:** Returns whether transcription is configured (no keys exposed). Use before recording to show setup instructions.

**Response (200):**

```json
{
  "configured": true,
  "provider": "groq-whisper",
  "hint": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `configured` | boolean | Whether at least one transcription provider is configured |
| `provider` | string | `groq-whisper` \| `assemblyai` \| `none` |
| `hint` | string \| null | Setup hint when not configured |

---

### POST /api/transcribe

**Auth:** Bearer token (required when Supabase is configured).

**Description:** Transcribe meeting audio and return raw transcript plus structured metadata (topics, action items, summary). Uses Groq Whisper first; falls back to AssemblyAI. Rate limit: 6 requests/minute (configurable).

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audioBase64` | string | Yes | Base64-encoded audio; max ~6M chars (~3–4 min) |
| `mimeType` | string | No | Default `audio/webm`. Use `audio/mp4` for MP4 |

**Example:**

```json
{
  "audioBase64": "<base64-encoded-audio>",
  "mimeType": "audio/webm"
}
```

**Response (200):**

```json
{
  "transcriptRaw": "Full text of the meeting...",
  "transcriptStructured": {
    "meeting_topic": "Q1 campaign planning",
    "participants": ["Alice", "Bob"],
    "organizer": "Alice",
    "summary": "2-3 sentence executive summary.",
    "action_items": [{ "task": "...", "assignee": "...", "deadline": "..." }],
    "topics": ["..."],
    "key_discussion_points": ["..."],
    "next_steps": ["..."],
    "recommended_actions": [...],
    "communication_mentions": { "telegram": [], "email": [] }
  }
}
```

**Error responses:** 400 (invalid body), 401 (unauthorized), 413 (audio too large), 429 (rate limit), 503 (transcription not configured).

---

### POST /api/send-email

**Auth:** Bearer token (required).

**Description:** Send email via Resend. Rate limit: 12 requests/minute (configurable).

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string \| string[] | Yes | One or more valid emails (max 10) |
| `subject` | string | Yes | Subject (max 500 chars) |
| `text` | string | No | Plain text body (max 50000) |
| `html` | string | No | HTML body (max 50000). Provide at least one of `text` or `html` |

**Example:**

```json
{
  "to": "partner@example.com",
  "subject": "Follow-up from our meeting",
  "text": "Plain text body.",
  "html": "<p>Optional HTML body.</p>"
}
```

**Response (200):**

```json
{
  "success": true,
  "id": "<resend-message-id>"
}
```

**Error responses:** 400 (validation), 401 (unauthorized), 429 (rate limit), 500 (Resend not configured or error).

---

## Environment Variables

### Client (Vite)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_AZURE_SPEECH_KEY` | (Optional) Azure Speech for voice in Firefox |
| `VITE_AZURE_SPEECH_REGION` | (Optional) e.g. `eastus` |

### Server (Vercel / `.env` for local API)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL (for auth verification) |
| `GROQ_API_KEY` | Groq API key (Whisper + LLM for transcription) |
| `ASSEMBLYAI_API_KEY` | (Optional) AssemblyAI fallback for transcription |
| `GROQ_MODEL` | (Optional) e.g. `llama-3.1-8b-instant` |
| `RESEND_API_KEY` | Resend API key for send-email |
| `RESEND_FROM_EMAIL` | (Optional) From address, e.g. `Orchestrator <noreply@domain.com>` |
| `TRANSCRIBE_RATE_LIMIT_PER_MIN` | (Optional) Default 6 |
| `SEND_EMAIL_RATE_LIMIT_PER_MIN` | (Optional) Default 12 |

---

## Setup & Running

### Prerequisites

- Node.js 18+
- npm (or pnpm/yarn)

### Install

```bash
git clone <repo>
cd orchestratori
npm install
cp .env.example .env
```

Edit `.env` with Supabase and optional API keys (see `.env.example`).

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | App at http://localhost:5174 (API not included) |
| `npm run dev:api` | Local API server at http://localhost:3001 (transcribe, send-email, health) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

**Full local stack:** Run `npm run dev` in one terminal and `npm run dev:api` in another so the app can call `/api/transcribe` and `/api/send-email` locally.

### Supabase

1. Create a [Supabase](https://supabase.com) project.
2. Run SQL in **SQL Editor** from `supabase/migrations/` (e.g. `001_initial_schema.sql`, then user ownership migrations as needed).
3. In **Project Settings → API**, copy URL and anon key into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Deployment (Vercel)

1. Connect the repo to Vercel.
2. Add environment variables in **Settings → Environment Variables** (e.g. `GROQ_API_KEY`, `ASSEMBLYAI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_URL`).
3. Deploy. Production URL: `https://orchestratori.vercel.app` (or your custom domain).

---

## Postman

- **Collection:** `docs/postman/Orqaly-API.postman_collection.json`  
  Import in Postman via **Import** → select this file.
- **Environments:**  
  - `Orqaly-Local.postman_environment.json` — `baseUrl`: http://localhost:3001  
  - `Orqaly-Production.postman_environment.json` — `baseUrl`: https://orchestratori.vercel.app  

Set `supabaseAccessToken` in the environment to your Supabase JWT for authenticated requests (transcribe, send-email).

---

## Related Docs

- `docs/ARCHITECTURE.md` — Architecture and data flow
- `docs/openapi.yaml` — OpenAPI 3.0 spec
- `docs/VOICE_FEATURE_DEBUG.md` — AI Let's Talk / voice troubleshooting
- `README.md` — Quick start and Supabase setup

---

*Last updated for Orchestrator API and project structure.*
