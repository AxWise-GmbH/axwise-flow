# Orqaly - Project Documentation

> Long-form reference for the Orqaly platform. Formatting (headings, tables, code
> blocks) is preserved if you import this Markdown into Notion or another editor.

---

## Overview

**Orqaly** is an autonomous AI agent orchestration platform (built on the
**Orchestratori** engine). You hand it a goal; an AI board turns that goal into a
plan, decomposes it into tasks, assembles a team of AI agents led by a team lead,
executes the work through tools and multiple LLM providers, and evaluates the
result - all under an organization hierarchy, with usage/cost tracking and an
append-only source of truth.

Work flows through five layers:

```
Orchestration → Consilium (AI board) → Teams (with a team lead) → Agents → Tools (MCP)
```

**Goal lifecycle:** a goal is handed to the Consilium, which writes a PRD,
decomposes it into tasks, forms a team, picks tools and LLMs (in-house first,
external services only when justified), executes, evaluates (5-star), iterates,
and completes. Everything is recorded in the Communicator and the Knowledge Base.

**Hierarchy:** Organization (holding) → directions (e-commerce, fintech,
marketing, data-center) → a Consilium attached at each level, with a main
Consilium at the top.

**Principles:** profit over sophistication; minimize cost with a local-LLM-first
hybrid (local by default, cloud for hard planning); never harm the creator
(enforced by immutable constraints + a supervisor layer, not prompts); total
transparency through an immutable, append-only record agents cannot edit or delete.

---

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite 7 + Material UI 7 (SPA) |
| **Backend** | Vercel serverless (Node.js) |
| **Database** | Supabase (Postgres + Auth + Storage), RLS everywhere, pgvector |
| **AI** | Groq / OpenAI / Anthropic / Gemini / GLM / Qwen / DeepSeek / OpenRouter / local (Ollama) |
| **Payments** | Stripe Connect (marketplace, 85/15 split) |
| **Hosting** | Vercel (app + API) + Supabase |

Dev port: **5176**.

---

## Architecture

The backend is a set of **Vercel serverless dispatchers**. Each request carries a
`?path=<name>` query parameter that the dispatcher maps to a statically imported
handler module. The frontend never imports server code or talks to the database
directly.

| Dispatcher | Route | Auth | Purpose |
|-----------|-------|------|---------|
| `app` | `/api/app?path=<name>` (90) | JWT per handler | General app surface: auth, email, KB, workflows, goals, marketplace, assistants, orgs, storage |
| `agent` | `/api/agent?path=<name>` (8) | JWT or `WORKER_SECRET` | Agent job queue: enqueue, status, process-next, heal-goal |
| `concilium` | `/api/concilium?path=<name>` (15) | JWT per handler | Boards, members, criteria, consensus, agents, teams, blueprints, supervisor |
| `communicator` | `/api/communicator?path=<name>` (8) | JWT per handler | Rooms, controller, activity feed, webhooks, Telegram |
| `ops` | `/api/ops?path=<name>` (15) | JWT per handler | Topology, reports, ingest, campaigns, goal-trace, usage analytics |
| `invest` | `/api/invest?path=<name>` (5) | JWT at dispatcher (60/min) | Investors, deals, commitments, pools, documents |
| public | `/api/invest-public`, `/api/contact` | Public (rate-limited) | Sanitized deal snapshot; contact form |

That is roughly **141 `?path=` handlers** across six dispatchers plus two public
endpoints.

**Every handler follows the same pattern:**

1. `cors(res, req)` (return 200 on OPTIONS) + security headers.
2. `verifySupabaseToken(getBearerToken(req))` → **401** if no user.
3. `checkRateLimit({ key, limit, windowMs })` + `applyRateLimitHeaders` → **429** if blocked.
4. Validate the body with a Zod schema from `api/_lib/validate.js` → **400** if invalid.
5. Run logic via `buildSupabaseAdminClient()`, always filtered by `user.id`.
6. Wrap in try/catch → `handleApiError(res, err, '<name>')`.

---

## Core domains

- **Consilium (AI board).** Members with distinct roles - chairman, evaluator,
  auditor, specialist, observer - each able to run on a different LLM. They
  evaluate work in parallel and reach a decision through consensus rules
  (unanimous / majority / weighted) with security scanning, fraud detection, and
  quarantine. Security levels: minimal, standard, strict, paranoid.
- **Teams & team leads.** The Consilium forms a team of agents per goal and
  appoints a lead who coordinates tasks and reports progress.
- **Goal pipeline.** `feasibility → planning → team-formation → tool-provisioning
  → execute → evaluate → iterate → complete`, driven by
  `lib/goal-handlers/goal-orchestrator.js`.
- **Communicator.** Append-only feed of all agent activity and messages, organized
  into rooms/channels; connects to external messengers (Telegram). The source of
  truth agents cannot edit.
- **Knowledge Base.** Documents, research, and goal outputs stored with pgvector
  embeddings for semantic search; cloud sources (Dropbox, OneDrive, Google Drive).
- **Workflows.** Visual DAG automations: triggers, conditions, LLM, tools, HTTP,
  human approval, cost guards, sub-agents. Each node can pick its own model.
- **Task manager.** Team and human task boards with assignments, priorities, and
  approvals.
- **Marketplace.** Install agents, skill packs, tools, and team/org templates, or
  publish your own. Ratings + usage stats; Stripe Connect monetization (85/15
  split); import from Composio, OpenRouter, Hugging Face.
- **Investments.** Deals for AI and human investors: pools, commitments, ROI.

---

## LLM providers

Each agent, board member, and workflow node can pick its own model. If a provider
is slow or rate-limited, the executor automatically advances through the fallback
chain.

| Provider | Default model | Credential |
|----------|---------------|-----------|
| Groq | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| OpenAI | `gpt-4o-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-5` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-3.8-flash` | `GEMINI_API_KEY` (server-only) |
| GLM (Zhipu) | `glm-5.1` | `GLM_API_KEY` |
| Qwen (Alibaba) | `qwen-max` | `QWEN_API_KEY` |
| DeepSeek | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| OpenRouter | per-request | `OPENROUTER_API_KEY` |
| Ollama / local | `llama3` | `OLLAMA_BASE_URL` |
| Claude Code | `claude-opus-5` | localhost only (blocked on Vercel) |

- **Fallback chain (default):** `['glm', 'gemini', 'openai', 'groq', 'anthropic']`.
- **Usage & cost:** every call writes provider, model, tokens, duration, status,
  and entity links (goal/agent/team/org) to `llm_usage`; surfaced by
  `/api/ops?path=usage-analytics`.
- **BYOK encryption:** user keys use AES-256-GCM envelope encryption - a per-row
  data key wrapped by the root KEK (`ORQ_KEK_V1`), AAD-bound to
  `user:provider:slot`. User-context LLM calls require a user key; only
  system/cron jobs may fall back to platform env keys.

---

## API reference & how an agent creates a goal

**Base URL (production):** `https://app.orqaly.com`. Send the Supabase JWT as
`Authorization: Bearer <access_token>` where required.

Representative endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/app?path=health` | None | Health check |
| POST | `/api/app?path=goals` | Bearer (JWT) | Create a goal (auto-starts orchestration) |
| POST | `/api/app?path=knowledge-base` | Bearer | Add / search documents (pgvector) |
| POST | `/api/agent?path=enqueue` | Bearer | Enqueue a job → 202 + `job_id` |
| GET | `/api/agent?path=status&id=<job_id>` | Bearer | Poll job status |
| GET | `/api/concilium?path=boards` | Bearer | List boards + members + rules |
| GET | `/api/ops?path=usage-analytics` | Bearer | LLM usage + cost |

### Creating a goal

Goal creation is **REST-only** and requires a **Supabase JWT** (not an agent
tracking token):

```
POST /api/app?path=goals
Authorization: Bearer <SUPABASE_JWT>
Content-Type: application/json

{
  "title": "Launch the Q3 landing page",   // required
  "description": "...",
  "budget_usd": 50,                          // 0.01 to 1000, default 10
  "executor_type": "consilium",              // organization | consilium | team | agent
  "executor_id": "<uuid>",
  "concilium_id": "<board_uuid>"             // optional
}
```

Creating the goal row **internally enqueues** an `agent_jobs` record
(`type: "orchestrate-goal"`, `action: "feasibility-analysis"`), which starts the
pipeline. Callers do not enqueue `orchestrate-goal` themselves.

> **Agents & MCP.** An agent connects over the Model Context Protocol using a
> platform-issued tracking token (`cagt_…`). That token is scoped to
> domain-tools, so **goal creation is not available over MCP** - an agent must
> hold its owner's Supabase JWT and call the REST endpoint directly, or have the
> owner create the goal. This is deliberate: creating a goal is a user-scoped,
> RLS-protected write that also commits budget.
>
> **MCP tools exposed:** `agent_check_in`, `submit_report`, `list_boards`,
> `manage_task`, `manage_workflow`, `manage_project`, `execute_tool`,
> `list_tools`, `enqueue_job`, `get_job_status`, `execute_domain_tool`.
> `enqueue_job` accepts `run-llm | agent | evaluate | concilium-evaluate |
> execute-workflow` (there is no goal tool).

---

## Database

Supabase Postgres with **~85 tables** across **176 migrations**
(`supabase/migrations/NNN_description.sql`, applied in order). **Row Level
Security is enabled on every table.** User-scoped tables use
`auth.uid() = user_id` (with a `service_role` bypass for backend workers); shared
tables use `auth.role() = 'authenticated'`. The Knowledge Base uses **pgvector**
for embeddings.

Representative tables by domain:

- **Consilium:** `concilium`, `concilium_members`, `concilium_criteria`,
  `concilium_consensus_rules`, `concilium_agents`, `concilium_teams`,
  `agent_blueprints`.
- **Goals:** `goals`, `goal_log`, `goal_messages`, `goal_kpis`, `goal_artifacts`.
- **Agents:** `agents`, `agent_jobs`, `agent_teams`, `agent_ratings`,
  `agent_profiles`.
- **Workflows:** `workflows`, `workflow_executions`, `workflow_step_results`.
- **Knowledge Base:** `knowledge_documents` (pgvector), `kb_connections`.
- **Communication:** `communication_logs`, `communication_channels`,
  `agent_personas`.
- **Marketplace / Investments:** `marketplace_listings`, `marketplace_reviews`,
  `investment_deals`, `investment_commitments`.
- **Usage / audit:** `llm_usage`, `tool_executions`, `audit_log` (immutable,
  append-only).
- **Security / org:** `user_api_keys` (envelope-encrypted), `organizations`.

---

## Authentication

1. **Provider:** `AuthProvider` (AuthContext) subscribes to the Supabase session.
2. **Session shape:** `{ uid, email, displayName, photoURL }`.
3. **Protected routes:** `ProtectedRoute` checks `isAuthenticated`; otherwise
   redirects to `/login`.
4. **Login / register:** `signInWithPassword` / `signUp`, or
   `signInWithOAuth({ provider: 'google' })`.
5. **API auth:** every request sends `Authorization: Bearer <access_token>`;
   handlers call `verifySupabaseToken()` (401 if invalid), then rate-limit and
   validate.
6. **RLS:** queries run under Row Level Security, so users only ever see their own
   rows.
7. **MFA:** TOTP and WebAuthn available in Settings when Supabase MFA is enabled.

---

## Environment variables

**Core (required):**

- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET`,
  `CRON_SECRET`, `ORQ_KEK_V1` (32-byte base64 root KEK for BYOK)
- Release LLM default: `LLM_DEFAULT_PROVIDER=gemini`,
  `LLM_DEFAULT_MODEL=gemini-3.8-flash`,
  `LLM_DEFAULT_CHEAP_MODEL=gemini-3.8-flash`, and server-only
  `GEMINI_API_KEY`. Never expose provider credentials through a `VITE_` name.

**Optional (feature-gated):** LLM provider keys (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GLM_API_KEY`, `QWEN_API_KEY`,
`DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`); email
(`RESEND_API_KEY`); payments (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`);
OAuth/integrations (`DROPBOX_CLIENT_ID`, `ONEDRIVE_CLIENT_ID`, `GITHUB_TOKEN`,
`VT_API_KEY`). See `.env.example` for the full list.

---

## Setup & commands

```
npm install
cp .env.example .env.local     # fill in the Core vars
npm run validate-env

npm run dev                    # frontend on http://localhost:5176
npm run dev:local              # full local stack (API + web + worker)
npm run build                  # production build
npm run test                   # vitest (single run)
npm run lint                   # eslint
```

---

## Security

- **RLS on every table** - users only see their own rows; backend workers use a
  `service_role` policy.
- **Auth on every handler** - a valid Supabase JWT is verified before any work.
- **Rate limiting** - every endpoint is rate-limited (default 60 req/min per user).
- **BYOK encryption** - provider keys are AES-256-GCM envelope-encrypted and bound
  to the owner; system fallback to platform keys is refused in user context.
- **Immutable audit** - an append-only `audit_log` and Communicator feed that
  agents cannot edit or delete.
- **No secrets in the frontend**, no `eval()`, no direct DB access from the client.

---

*Current project documentation for the Orqaly platform. Import this Markdown into
Notion or your editor of choice for a shareable copy.*
