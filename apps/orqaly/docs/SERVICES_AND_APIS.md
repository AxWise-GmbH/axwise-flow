# Orchestrator — Services & APIs (Data Flow)

Short reference for investigation and professional solution design. **Free tiers first, with room to grow.**

---

## Core stack (data flow)

| Service | Role | Env / config | Free tier | Grows with |
|--------|------|--------------|-----------|------------|
| **Supabase** | Database (PostgreSQL), Auth (email + OAuth), Storage, RLS | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 500MB DB, 1GB storage, 50K MAU | Pro plan, dedicated DB |
| **Vercel** | Hosting, serverless API routes, env | `VERCEL_URL`, `VERCEL_ENV` | Hobby: 100GB bandwidth, serverless limits | Pro, team |
| **GitHub** | Repo, CI (optional), deploy triggers | `GITHUB_TOKEN`, `GITHUB_REPO` (for ops/topology) | Public/private repos | GitHub Actions, Teams |

---

## External APIs & AI

| Service | Role | Env | Free tier | Grows with |
|--------|------|-----|-----------|------------|
| **Resend** | Transactional email (password reset, notifications) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | 3K emails/mo, 100/day | Paid plans, domain verify |
| **Groq** | Primary: transcription (Whisper) + LLM for meeting structuring | `GROQ_API_KEY` | Free tier (rate limits) | Paid |
| **AssemblyAI** | Fallback transcription | `ASSEMBLYAI_API_KEY` | Free tier | Paid |
| **LibreTranslate** | Translation (optional) | `VITE_LIBRE_TRANSLATE_URL`, `VITE_LIBRE_TRANSLATE_API_KEY` | Public demo or self‑host | Self‑host / paid API |
| **Azure Speech** | Voice input fallback (e.g. Firefox) | `VITE_AZURE_SPEECH_KEY`, `VITE_AZURE_SPEECH_REGION` | 5 hours/mo | S0 tier |

---

## Optional / feature-specific

| Service | Role | Env | Free tier | Grows with |
|--------|------|-----|-----------|------------|
| **Keitaro** | Campaigns (tracker Admin API) | `KEITARO_TRACKER_URL`, `KEITARO_API_KEY` | Self‑host / vendor | Vendor plan |
| **Firebase** | (Optional) alternative auth / analytics | `VITE_FIREBASE_*` in .env.example | Spark plan | Blaze |
| **ipwho.is** | IP geolocation for audit log | No key (public) | Free, rate limits | Paid or replace |
| **Google Stitch** | Template sync for notifications | `STITCH_TEMPLATE_SYNC_TOKEN` | N/A | Vendor |
| **Vercel API** | Deployment status in ops/topology | `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` | With Vercel account | Same |

---

## Data flow (high level)

1. **Frontend** (React, Vite) → calls **Vercel serverless** `/api/*` or **Supabase client** (anon key).
2. **API routes** use `SUPABASE_SERVICE_ROLE_KEY` for admin/auth, Resend for email, Groq/AssemblyAI for transcription.
3. **Auth**: Supabase Auth (email + Google); password reset uses Resend (or manual link if Resend not configured).
4. **Storage**: Supabase Storage (buckets); backups → `db-backups` bucket.
5. **Cron / automation**: Supabase pg_cron (e.g. backup, AI partner analysis); optional Vercel Cron.
6. **Reports / ingest**: `POST /api/report-ingest` for external data; Reports page uses Supabase + optional external APIs.

---

## Env checklist (minimal for “free” run)

- **Required**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Email**: `RESEND_API_KEY` (and `RESEND_FROM_EMAIL` once domain verified)
- **Transcription**: `GROQ_API_KEY`; optional `ASSEMBLYAI_API_KEY`
- **Deploy**: Vercel linked to GitHub; add env in Vercel project
- **Optional**: `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (ops), `GITHUB_TOKEN` + `GITHUB_REPO` (ops), Keitaro, Azure Speech, LibreTranslate

---

## Growth path (keep free, then scale)

- **Supabase**: Stay on free until limits; then Pro for more DB/storage/auth.
- **Vercel**: Hobby → Pro for more bandwidth and serverless.
- **Resend**: Free 3K/mo → verify domain and set `RESEND_FROM_EMAIL` → paid when needed.
- **Groq / AssemblyAI**: Free tiers → paid for higher volume.
- **Auth**: Supabase only (no Firebase) keeps one source of truth; add MFA/SSO on Supabase when needed.

All secrets belong in **Vercel Environment Variables** (and optionally `.env` for local dev); never commit real keys.
