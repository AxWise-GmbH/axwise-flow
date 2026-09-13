# Vercel — Step-by-step setup

Use this checklist so your deployment has the right env vars and you can verify everything works.

---

## Step 1: Open your project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Open the project that contains **orchestratori** (the one connected to your GitHub repo).

---

## Step 2: Environment variables

1. In the project, go to **Settings** → **Environment Variables**.
2. Add the variables below. For each one:
   - **Key** = exact name (case-sensitive).
   - **Value** = your real value (no quotes).
   - **Environments** = tick **Production** (and **Preview** if you use preview deployments).
   - Click **Save**.

### Required for the app and worker to work

| Key                         | Where to get it                                        | Notes                                                                                |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`         | Supabase → Project Settings → API → Project URL        | Needed for frontend (auth, DB).                                                      |
| `VITE_SUPABASE_ANON_KEY`    | Supabase → Project Settings → API → anon public        | Same as above.                                                                       |
| `SUPABASE_URL`              | Same Supabase Project URL                              | Server-side API and worker connection.                                               |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service role       | Server-side only. Never prefix with `VITE_`.                                         |
| `WORKER_SECRET`             | Generate with `openssl rand -hex 32`                   | Authenticates server-only same-deployment wake-ups and local worker calls.           |
| `CRON_SECRET`               | Generate a different value with `openssl rand -hex 32` | Vercel sends this as the cron Bearer token. Scheduled routes fail closed without it. |
| `ORQ_KEK_V1`                | Generate as documented in `.env.example`               | Server-side root key for encrypted customer credentials.                             |

### Required LLM provider

For this release, pin the Google provider and exact model shown below. Do not
use the moving `gemini-flash-latest` alias for the platform default.

| Key                       | Required value                                                               |
| ------------------------- | ---------------------------------------------------------------------------- |
| `LLM_DEFAULT_PROVIDER`    | `gemini`                                                                     |
| `LLM_DEFAULT_MODEL`       | `gemini-3.8-flash`                                                           |
| `LLM_DEFAULT_CHEAP_MODEL` | `gemini-3.8-flash`                                                           |
| `GEMINI_REASONING_EFFORT` | `medium`                                                                     |
| `GEMINI_API_KEY`          | Production Google credential; server-only, never use a `VITE_`-prefixed name |

`npm run validate-env:strict` verifies that the selected provider has a
matching credential and that `ORQ_KEK_V1` is valid base64 decoding to exactly
32 bytes. The credentials belong only in Vercel runtime environment variables;
never add them to the repository or a frontend build argument.

### Meeting transcription (required only when enabled; pick one option)

**Option A — OpenAI (paid)**  
| Key | Where to get it |
|-----|------------------|
| `OPENAI_API_KEY` | [OpenAI API keys](https://platform.openai.com/api-keys) (starts with `sk-`) |

**Option B — Free (AssemblyAI + Groq)**  
| Key | Where to get it |
|-----|------------------|
| `ASSEMBLYAI_API_KEY` | [AssemblyAI](https://www.assemblyai.com/) dashboard |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/) (starts with `gsk_`) |

### AxWise integration (required when enabled)

| Key                                            | Value                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `AXWISE_ENABLE`                                | `true`                                                                  |
| `AXWISE_ENFORCE`                               | `shadow` for observation, then `authoritative` after acceptance testing |
| `AXWISE_API_URL`                               | Production AxWise API base URL                                          |
| `AXWISE_API_KEY`                               | Server-side AxWise credential                                           |
| `AXWISE_EVIDENCE_PROFILE_V2_ENABLED`           | `false` initially; `true` only during a typed-evidence canary           |
| `AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS`    | New-goal admission list, initially one economic model                   |
| `AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS`  | Pinned-goal dispatch list; retain until the queue drains                |
| `AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS` | Canonical UUID cohort for new-goal admission only                       |

AxWise routing is authoritative for whether the goal proceeds directly, uses
existing evidence, starts bounded research, or pauses for clarification. It
does not remove Orqaly's two human gates: context approval before planning and
execution approval before work, in both Simple and Advanced modes. Research
limits and evidence semantics are documented in `docs/axwise-integration.md`.

### Optional

| Key                 | When to set                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `RESEND_API_KEY`    | Only if you use “Send email” / Resend ([resend.com](https://resend.com)).                                                |
| `RESEND_FROM_EMAIL` | Production sender, e.g. `Orchestrator <noreply@yourdomain.com>`. Must be verified in Resend.                             |
| `GROQ_MODEL`        | Only if Groq deprecates the default; e.g. `llama-3.1-8b-instant`.                                                        |
| `ALLOWED_ORIGINS`   | Only if you need extra CORS origins (comma-separated list).                                                              |
| `BACKUP_SECRET`     | Optional independent service credential for backup/recovery automation. It is also accepted by protected service routes. |

The browser never calls the protected worker endpoint with this credential.
Server-side goal handlers use `WORKER_SECRET` only for direct calls to the
current Vercel deployment. Vercel Cron is the durable fallback and uses the
independent `CRON_SECRET`; no worker credential is forwarded through QStash.

---

## Step 3: Validate configuration and migrations

Before deploying, load the production values into the shell or a protected
local `.env.local`, then run:

```bash
npm ci
npm run validate-env:strict
node scripts/verify-migrations.mjs
node scripts/preflight-release-migrations.mjs
npm run test
npm run build
```

The migration verifier checks that the repository contains one contiguous,
non-empty, conflict-free migration sequence. Before changing either database,
take a timestamped backup and verify its restore procedure. The release
preflight is read-only and must be run against staging and then production. It
checks that release-critical columns/tables from migrations 176, 194, and 203
really exist in that database before checking the migration-191/192 data
conditions:

- Duplicate queued/running AxWise outcome jobs for one goal must be resolved;
  otherwise migration 191 cannot create its unique index.
- Duplicate active teams for one goal require explicit review. Migration 192
  deterministically keeps one active team and deactivates the others without
  deleting their historical membership rows.
- The v2 research run manifest columns and typed fact/calculation tables from
  migration 203 must exist before any typed-evidence profile is admitted.

Apply every unapplied file in `supabase/migrations/` in numeric order to staging
first, then production. Apply migrations before the new code receives traffic,
or in the same coordinated release window: the application calls the
migration-190 goal-organization RPC. Confirm production has reached the
repository's highest migration number before switching traffic.

Migration 194 must precede the credential-writing code. It rejects new
plaintext writes but deliberately leaves legacy rows in place. Existing OAuth
users must reconnect and tool users must re-enter credentials through Tool
Setup; both flows write encrypted Vault envelopes. SQL cannot safely encrypt a
legacy value because the KEK lives only in the application environment. Keep
backups restricted and do not validate migration-194's `NOT VALID` constraints
until an authorized cleanup has confirmed that no legacy plaintext remains.
Workflow credential execution remains disabled pending a destination-scoped
Vault release path.

---

## Step 4: Redeploy

Env vars are applied at **build** and **runtime**. After adding or changing any variable:

1. Go to **Deployments**.
2. Open the **⋯** menu on the latest deployment.
3. Click **Redeploy** (use same branch; no need to “Redeploy with existing Build Cache” unless you want a clean build).

Wait until the deployment status is **Ready**.

---

## Step 5: Verify

1. **Frontend**  
   Open your production URL (e.g. `https://orchestratori.vercel.app`).
   - You should see the app (login or dashboard).
   - If you see a blank page or “Connection Failed”, check the browser console and that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for Production (and that you redeployed).

2. **Health check (API)**  
   Open in the browser or with curl:

   ```text
   https://YOUR_VERCEL_URL.vercel.app/api/health
   ```

   - Expected: `{"ok":true}` and status 200.
   - If 404 or 500, the API route isn’t running or env is wrong; redeploy and check Vercel function logs.

3. **Transcription**
   - Sign in, then go to **Partners** → open a partner → **Meetings** → **Record**.
   - Record a short clip and stop.
   - If you see the yellow “sample data” warning, transcription isn’t active: check that either `OPENAI_API_KEY` or both `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` are set for **Production** and that you **redeployed**.

4. **Supabase data**
   - Create or edit a partner and confirm it appears (or check Supabase table).
   - If data doesn’t persist, check Supabase project URL and anon key (and that they’re set in Vercel for the environment you’re using).

---

## Quick checklist (copy and tick)

- [ ] `VITE_SUPABASE_URL` added, Production (and Preview if needed) selected, saved.
- [ ] `VITE_SUPABASE_ANON_KEY` added, Production (and Preview) selected, saved.
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` added as server-only values.
- [ ] Independent `WORKER_SECRET` and `CRON_SECRET` values added.
- [ ] `ORQ_KEK_V1` added as a server-only value.
- [ ] Google default, exact `gemini-3.8-flash` default/cheap model, and server-only `GEMINI_API_KEY` added.
- [ ] Transcription: either `OPENAI_API_KEY` **or** both `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` added, Production (and Preview) selected, saved.
- [ ] If AxWise is enabled, all four `AXWISE_*` values are set and the desired enforcement mode is explicit.
- [ ] If typed evidence v2 is enabled, admission models are a subset of execution models and the resolved-org UUID cohort is explicit; rollback closes admission, redeploys, drains pinned goals, then closes execution and redeploys again.
- [ ] The AxWise and Google variables include the **Production** scope, not only Preview.
- [ ] `npm run validate-env:strict` passes against production-equivalent values.
- [ ] A timestamped database backup exists and its restore procedure is verified.
- [ ] The read-only release migration preflight passes, or every reported migration-192 team deactivation has been explicitly reviewed.
- [ ] All migrations through the repository's highest number are applied in staging and production.
- [ ] **Redeploy** done after changing env vars.
- [ ] Production URL loads the app.
- [ ] `/api/health` returns `{"ok":true}`.
- [ ] A signed-in goal reaches both human approvals, Agent Hub assignment, execution, and AxWise outcome delivery.
- [ ] Recording a meeting gives a real transcript (no “sample data” warning) if transcription keys are set.

If any step fails, check **Vercel → Project → Deployments → [latest] → Logs / Functions** and the browser console for errors.
