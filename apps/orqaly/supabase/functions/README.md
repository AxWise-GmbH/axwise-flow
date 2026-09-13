# Supabase Edge Functions

These functions were migrated from Vercel Serverless Functions to stay within Vercel's free tier (10s timeout, no cron jobs).

## Functions

| Function | Purpose | Trigger |
|---|---|---|
| `backup-database` | Daily DB backup → Supabase Storage | pg_cron (03:00 UTC) or manual |
| `ai-analyze-partners` | AI partner analysis via Groq LLM | pg_cron (05:00 UTC) or manual |
| `transcribe` | Audio transcription + LLM structuring | Frontend POST request |

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Link to your project

```bash
cd orchestratori
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Deploy all functions

```bash
supabase functions deploy backup-database --no-verify-jwt
supabase functions deploy ai-analyze-partners --no-verify-jwt
supabase functions deploy transcribe --no-verify-jwt
```

> `--no-verify-jwt` is used because these functions handle their own auth (BACKUP_SECRET or Supabase JWT verification).

### 4. Set secrets

```bash
supabase secrets set BACKUP_SECRET=your_backup_secret_value
supabase secrets set GROQ_API_KEY=your_groq_api_key
supabase secrets set ASSEMBLYAI_API_KEY=your_assemblyai_key  # optional
supabase secrets set GROQ_MODEL=llama-3.1-8b-instant         # optional, for structuring
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available inside Edge Functions.

### 5. Set up pg_cron (scheduled jobs)

Run migration `015_pg_cron_edge_functions.sql` in the Supabase SQL Editor, then configure the app settings:

```sql
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.settings.backup_secret = 'YOUR_BACKUP_SECRET_VALUE';
```

Or set up cron jobs manually via the Supabase Dashboard (Database → Extensions → pg_cron).

### 6. Test manually

```bash
# Backup
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/backup-database \
  -H "Authorization: Bearer YOUR_BACKUP_SECRET" \
  -H "Content-Type: application/json"

# AI Analysis
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ai-analyze-partners \
  -H "Authorization: Bearer YOUR_BACKUP_SECRET" \
  -H "Content-Type: application/json"

# Transcribe status
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/transcribe
```

## What stays on Vercel

These functions remain on Vercel (all fit within the 10s free tier limit):

| Function | Duration | Notes |
|---|---|---|
| `health.js` | <1s | Simple status check |
| `invite-user.js` | <5s | Supabase admin operations |
| `send-notification.js` | <5s | Email via Resend |
| `send-email.js` | <5s | Email via Resend |
| `public-book.js` | <5s | Public booking |
| `public-availability.js` | <3s | Public availability |
| `data-topology.js` | <10s | Optimized with parallel external calls |
| `reports.js` | <10s | Parallel DB queries + 45s cache |
| `campaigns.js` | <10s | 5-min response cache added |
| `report-ingest.js` | <5s | In-memory only |
