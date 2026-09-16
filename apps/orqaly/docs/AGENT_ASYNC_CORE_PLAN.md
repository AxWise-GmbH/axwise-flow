# Agent Async Core – Implementation Plan

## Goal
Add an **Agent Async Core** so AI/agent and multi-API flows never run inside the 10s serverless limit: request → validate → enqueue → return 202; a worker (later) runs the job.

## Scope (this implementation)
1. **api/agent.js** – New serverless entry; dispatches by `path` to agent handlers.
2. **lib/agent-handlers/** – Handlers that only enqueue (write job to DB) and return 202 + `job_id`.
3. **Supabase table `agent_jobs`** – Store job payload and status; enables polling and future worker.
4. **vercel.json** – Rewrites for `/api/agent` and `/api/agent/enqueue` (and optional `/api/agent/status/:id` later).
5. **No external queue yet** – Enqueue = insert into `agent_jobs`; worker can be added later (Inngest, Trigger.dev, or cron polling).

## Steps

| # | Task | Details |
|---|------|--------|
| 1 | Migration | Add `supabase/migrations/017_agent_jobs.sql`: table `agent_jobs` (id, status, payload, created_at, updated_at). RLS: service role only or authenticated read own. |
| 2 | Agent handler: enqueue | `lib/agent-handlers/enqueue.js`: POST only; optional auth; parse body; insert into `agent_jobs` with status `queued`; return 202 + `{ job_id, status: 'queued' }`. |
| 3 | Agent handler: status (optional) | `lib/agent-handlers/status.js`: GET job by id; return 200 with status + result or 404. |
| 4 | api/agent.js | Import enqueue + status; HANDLERS map; dispatch by `req.query.path`; CORS + errors like app.js. |
| 5 | vercel.json | Add `api/agent.js` to `functions`; add rewrites: `/api/agent/enqueue` → `/api/agent?path=enqueue`, `/api/agent/status` → `/api/agent?path=status` (id in query). |
| 6 | Test | Run dev; POST /api/agent/enqueue with body `{}` or `{ "type": "test" }` → expect 202 + job_id. GET /api/agent/status?id=<job_id> → expect 200 + status. |
| 7 | Fix & document | Fix any errors; add short doc or comment on how to plug in a real queue/worker later. |

## Out of scope (later)
- Real queue (Inngest/Trigger.dev) and worker process.
- Moving transcribe/backup/report-ingest from ops to agent enqueue (can do incrementally).

## Success criteria
- POST to `/api/agent/enqueue` returns 202 with `job_id` (or 503 if migration not run).
- Row appears in `agent_jobs` with status `queued` once migration 017 is applied.
- GET `/api/agent/status?id=<job_id>` returns job status (or 404/503).
- No regression on existing app/ops routes.

## Deploy checklist
1. Run migration in Supabase: `supabase/migrations/017_agent_jobs.sql`.
2. Deploy to Vercel; ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
3. Local dev: `npm run dev:api` (or `node server/transcribe-server.js`) includes agent routes.

## Recommendations (post-implementation)
- **Run migration 017** in the Supabase SQL Editor so `/api/agent/enqueue` returns 202 and writes to `agent_jobs`; until then the API returns 503 with a clear message.
- **Add auth** to enqueue when you expose it to the frontend: verify Supabase JWT and optionally store `user_id` on the job for RLS and auditing.
- **Add a worker** when you need execution: use Inngest or Trigger.dev to poll `agent_jobs` (or listen via webhook), run the job (AI/APIs), then update `status`/`result`/`error`; or use Supabase Edge/pg_cron to invoke a long-running function.
- **Keep agent handlers thin**: only validate, enqueue, and return 202; never do long-running or multi-API work inside the serverless function.
