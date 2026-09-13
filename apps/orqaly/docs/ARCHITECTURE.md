# Orchestrator – Architecture

## Overview

Orchestrator is a **React SPA** with **Supabase** (database + auth) and **Vercel serverless** APIs.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React (Vite)   │────▶│  Vercel API      │────▶│  External APIs  │
│  Client         │     │  (transcribe,    │     │  OpenAI, Resend,│
│                 │     │   notification)  │     │  AssemblyAI,     │
│                 │     │                  │     │  Google Stitch   │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         │ direct
         ▼
┌─────────────────┐
│  Supabase       │
│  (Postgres,     │
│   Auth)         │
└─────────────────┘
```

## Data Flow

1. **Auth:** Supabase Auth (or local fallback). JWT used for API calls.
2. **Partners, meetings, workflows, history:** Client → Supabase (RLS per user).
3. **Profile notes/todos:** Client → Supabase (user_id scoped).
4. **Transcription:** Client → `/api/transcribe` (Supabase JWT) → OpenAI/AssemblyAI.
5. **Email notifications:** Domain event → `/api/send-notification` (Supabase JWT) → DB preference check + template resolution → Resend.
6. **Template upload:** Google Stitch → `/api/send-notification` (template-sync mode via shared secret) → `email_templates` table.
7. **Delivery telemetry:** Resend webhook → `/api/send-notification` (webhook mode via shared secret) → `email_notification_events` table.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/` | React app (pages, components, services, hooks) |
| `api/` | Vercel serverless handlers |
| `api/lib/` | Shared API utilities (cors, auth, validate, errors, fetch) |
| `supabase/migrations/` | SQL migrations |
| `server/` | Local dev proxy for transcribe |

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | No | Health check |
| `/api/transcribe` | POST | Supabase JWT (when configured) | Transcribe audio |
| `/api/send-email` | POST | Supabase JWT | Send email via Resend |
| `/api/send-notification` | POST | Supabase JWT / shared secret modes | Send notification emails, sync Stitch templates, ingest Resend events |

## Database (Supabase)

- **partners, meetings, workflows, partner_history:** user_id scoped (RLS).
- **profile_notes, profile_todos:** user_id scoped (RLS).
- **email_notification_preferences:** per-user action toggles for email sends.
- **email_templates:** provider-synced versioned templates (active by action key).
- **email_notification_events:** delivery and failure telemetry for notification operations.
- Run migrations 001, 002, 003 in Supabase SQL Editor.

## Environment

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` – Supabase (client)
- `OPENAI_API_KEY` or `ASSEMBLYAI_API_KEY` (optional `GROQ_API_KEY`) – Transcription
- `RESEND_API_KEY` – Email (Vercel env)
- `RESEND_WEBHOOK_SECRET` – Resend delivery webhook auth
- `STITCH_TEMPLATE_SYNC_TOKEN` – Google Stitch template sync auth
- `SUPABASE_SERVICE_ROLE_KEY` – Required for template sync writes
