# Orqaly lean GCP module manifest

Status: implementation boundary for the Vercel-free GCP migration
Decision date: 2026-08-31
Canonical authentication: Clerk

## Decision

The first complete GCP release keeps the public Orqaly website and the retained
personal workspace: Home, Assistant, Goals, Workspace, Intelligence, History,
Notifications, Activity & Usage, and Settings. Intelligence contains Agents,
Capabilities, Knowledge, and Results. It does not migrate every historical business
vertical. Optional modules remain in source until their data and production usage have
been checked, but they are not part of the first GCP runtime.

The release must have no runtime dependency on Vercel. Clerk remains the identity
provider. Preview reuses the existing AxWise Clerk Development instance; it does not
create another Clerk application and does not use Clerk Organizations. There are no
Supabase users or Supabase-authenticated accounts to preserve. Supabase may remain
temporarily as a data and storage system, but Supabase Auth is removed rather than
bridged or migrated.

Clerk owns authentication only. Orqaly owns its tenant, agent catalogue, workflow, and
domain data in Cloud SQL. The durable Orqaly tenant boundary is keyed from the verified
personal Clerk user subject without making Clerk the system of record for Orqaly data.

## Classification

- **KEEP**: required in the first full GCP release.
- **REPLACE**: preserve the user capability through Workflow v2 or Clerk, then remove
  the legacy implementation after parity verification.
- **MERGE**: preserve the capability inside a smaller core module rather than as a
  separate navigation area.
- **DEFER**: exclude from the first GCP runtime and hide from navigation; retain data
  and source until a later product decision.
- **REMOVE**: demo, showcase, placeholder, or compatibility-only surface that can be
  removed after reference and traffic checks.

## Verified inventory

| Surface                                          |           Current size | Evidence                                                              |
| ------------------------------------------------ | ---------------------: | --------------------------------------------------------------------- |
| Frontend routes                                  | 94 including catch-all | `src/routes.jsx`                                                      |
| Main API dispatcher handlers                     |                     97 | `api/app.js`                                                          |
| Agent handlers                                   |                      9 | `api/agent.js`                                                        |
| Operations handlers                              |                     16 | `api/ops.js`                                                          |
| Consilium handlers                               |                     16 | `api/concilium.js`                                                    |
| Communicator handlers                            |                      8 | `api/communicator.js`                                                 |
| Investment handlers                              |                      5 | `api/invest.js`                                                       |
| Dispatcher selectors                             |                    151 | Six dispatcher maps                                                   |
| Production API routes including direct endpoints |                    154 | Selectors plus contact, OAuth callback and public investment endpoint |
| Scheduled jobs                                   |                      7 | `vercel.json`                                                         |
| Non-test handler/support files                   |                    218 | Dispatcher handler directories including usage handlers               |
| Historical Supabase migrations                   |                    229 | `supabase/migrations`                                                 |
| Existing Workflow v2 runtime                     |   5 Cloud Run services | Web, Orqaly API/worker, AxWise API/worker                             |

The 151 selectors are not 151 independently deployed functions. They are routed
through six Vercel dispatcher entry points plus a few public endpoints. The large
surface still matters because every imported handler is bundled, configured, secured,
tested, and supported.

## Target product modules

| Target module              | Responsibility                                                  | Decision | Source being retained or replaced                                                                |
| -------------------------- | --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Public website             | Landing, product explanation, pricing, legal, contact and docs  | KEEP     | `src/pages/Landing`, `src/pages/Public`                                                          |
| Clerk identity             | Sign-in, sign-up, personal-user session and account menu        | KEEP     | `src/main.jsx`; replace legacy auth pages/context                                                |
| Home                       | Current goals, approvals, recent outcomes and alerts            | KEEP     | `src/pages/Home`; simplify data sources                                                          |
| Assistant                  | Conversation that clarifies intent and proposes/starts Goals    | REPLACE  | `src/pages/WorkflowV2`; retire legacy Assistant console                                          |
| Goals                      | Durable execution, stages, approvals, artifacts and status      | REPLACE  | Workflow v2 API/worker/state machine                                                             |
| Requests                   | Human approvals, interventions and resumptions                  | MERGE    | Merge Job Pool and human task inbox into Goals                                                   |
| Agents                     | Tenant agents, configuration, reports and execution assignment  | KEEP     | Agent Hub plus Workflow v2 `tenant_agents`                                                       |
| Consilium                  | Multi-agent teams, supervision and deliberation                 | MERGE    | Selected capabilities move under Agents                                                          |
| Capabilities               | Tools, credentials, provider catalogue and marketplace installs | MERGE    | Combine Tools and the personal catalogue                                                         |
| Knowledge                  | Documents, connections, ingestion and retrieval                 | KEEP     | Knowledge Base; migrate its auth/data boundary                                                   |
| Results                    | Reports, artifacts, usage and outcome dashboards                | MERGE    | Combine Reports and Dashboards                                                                   |
| Workspaces                 | App-owned tenant membership, roles, groups and permissions      | KEEP     | Internal PostgreSQL tenant binding keyed by the Clerk user ID; no Clerk Organizations dependency |
| Notifications              | Alerts, completion messages and human-task escalation           | KEEP     | Notifications plus worker/scheduler integration                                                  |
| Audit and usage            | Security activity, workflow trace and model/tool usage          | KEEP     | Audit Log, usage handlers and Workflow v2 events                                                 |
| Settings                   | Profile, organization, keys, storage and UI preferences         | KEEP     | Collapse current settings pages                                                                  |
| Communicator               | Telegram, agent rooms and organization communication            | DEFER    | Entire communicator dispatcher and UI                                                            |
| Partners/CRM               | Partners, suppliers, warehouses and contacts                    | DEFER    | Partners and Partners Hub                                                                        |
| Gambling operations        | Finances, campaigns and injection tooling                       | DEFER    | Current BUSINESS module                                                                          |
| Affiliate marketing        | Audience, content, acquisition and retention                    | DEFER    | Current MARKETING module                                                                         |
| Investments                | Investors, deals, pools, commitments and documents              | DEFER    | Investments UI/API                                                                               |
| Replicators/Page Builder   | Reusable custom pages, landing pages and design review          | DEFER    | Replicators, Page Builder, Brand Kit                                                             |
| Booking/Public profiles    | Public profile, availability and scheduling                     | DEFER    | Booking/profile routes and APIs                                                                  |
| Arena/Strategy experiments | Model experiments and strategy workbench                        | DEFER    | Arena and Strategy Center                                                                        |
| E-commerce/Crypto          | Product placeholders with no navigation implementation          | REMOVE   | Entries in `src/config/businessModules.js`                                                       |

## Frontend route manifest

### KEEP: public and legal surface

| Routes                                                   | Responsibility                     | Primary source                      |
| -------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| `/`                                                      | Main landing site                  | `src/pages/Landing/LandingRoot.jsx` |
| `/about`, `/pricing`, `/features`, `/how-it-works`       | Product marketing                  | `src/pages/Public`                  |
| `/contact`, `/faq`, `/search`                            | Public support and discovery       | `src/pages/Public`                  |
| `/privacy`, `/terms`, `/cookies`, `/security`, `/status` | Legal, trust and status            | `src/pages/Public`                  |
| `/docs`, `/solutions/:industry`                          | Public documentation and solutions | `src/pages/Public`                  |
| `*`                                                      | Not-found handling                 | `src/pages/NotFound`                |

### REPLACE: authentication

| Current routes   | Target behavior                                                                                         | Legacy source                       |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `/login`         | Clerk `SignIn` or Clerk-hosted sign-in                                                                  | `src/pages/Auth/Login.jsx`          |
| `/signup`        | Clerk `SignUp`; stop storing a fake signup request in local storage                                     | `src/pages/Public/Signup.jsx`       |
| `/auth/callback` | Clerk callback/redirect handling                                                                        | `src/pages/Auth/InviteCallback.jsx` |
| `/pin`           | Remove as a login gate; retain only a narrowly defined privileged-action confirmation if still required | `src/pages/Auth/PinGate.jsx`        |
| `/setup`         | Clerk-aware first-run personal-workspace onboarding flow                                                | `src/pages/Setup/SetupPage.jsx`     |

`src/main.jsx` installs `ClerkProvider`; the active full-app boundary now uses Clerk
through `src/context/AuthContext.jsx` and `src/components/Auth/ProtectedRoute.jsx`.
The retired `src/lib/auth.js` implementation remains reachable only from dormant,
unrouted source and is not a second supported identity system.

### KEEP or REPLACE: core authenticated surface

| Current routes                                                              | Target module                                                       | Decision      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| `/home`                                                                     | Home                                                                | KEEP          |
| `/assistant`                                                                | Assistant v2 inside the full `MainLayout`                           | REPLACE       |
| `/workflows-v2`                                                             | Redirect to `/assistant`; no isolated product shell                 | REPLACE       |
| `/goals/:id`                                                                | Goal v2 detail, approvals and artifacts                             | REPLACE       |
| `/job-pool`                                                                 | Goals/Requests list                                                 | MERGE         |
| `/agent-hub`, `/agent-hub/:id/reports`                                      | Agents                                                              | KEEP          |
| `/my-agents`                                                                | Consumer projection of Agents or redirect to Agent Hub              | MERGE         |
| `/tools`                                                                    | Capabilities                                                        | KEEP          |
| `/marketplace`, `/marketplace/browse`, `/marketplace/import`                | Personal catalogue within Capabilities                              | MERGE         |
| `/knowledge-base`                                                           | Knowledge                                                           | KEEP          |
| `/workspace`                                                                | App-owned personal workspace and tenant readiness                   | KEEP          |
| `/organizations`                                                            | Compatibility redirect to `/workspace`                              | MERGE         |
| `/notification-center`                                                      | Notifications and requests                                          | KEEP          |
| `/reports`, `/reports/builder`                                              | Results                                                             | KEEP/MERGE    |
| `/dashboards`, `/dashboards/new`, `/dashboards/:id`, `/dashboards/:id/edit` | Results layouts                                                     | MERGE         |
| `/llm-usage`                                                                | Admin usage view inside Results                                     | MERGE         |
| `/audit-log`                                                                | Audit                                                               | KEEP          |
| `/settings`, `/settings/keys`, `/settings/storage`                          | Settings                                                            | KEEP          |
| `/roles`, `/settings/groups`                                                | App-owned roles/groups behind the GCP API; hidden until implemented | REPLACE/DEFER |
| `/documentation`                                                            | Redirect or merge with `/docs`                                      | MERGE         |
| `/axwise-analytics`                                                         | Admin diagnostics on Goal detail                                    | MERGE         |
| `/data`                                                                     | Admin-only topology/diagnostics, excluded from ordinary navigation  | MERGE         |

### MERGE: duplicate navigation surfaces

| Current routes                            | Destination                    |
| ----------------------------------------- | ------------------------------ |
| `/dashboard`, `/hub`                      | `/home`                        |
| `/task-manager`, `/workflow`, `/projects` | Goals and Requests             |
| `/consilium`                              | Agent Hub team/supervision tab |
| `/pulse`, `/prompt-lab`                   | Existing Agent Hub tabs        |

### DEFER: not in the first GCP runtime

| Module                        | Routes                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Public profiles and booking   | `/p/:slug`, `/book/:slug`, `/schedule/:token`, `/settings/booking`                                         |
| Partner/CRM                   | `/partners`, `/partners/:id`, `/partners-hub`, `/partners-hub/:section`                                    |
| Gambling operations           | `/finances`, `/campaigns`, `/injection-hub`                                                                |
| Affiliate marketing           | `/marketing/:pageId`                                                                                       |
| Investments                   | `/investments`, `/investments/investor/:id`, `/investments/deal/:id`, `/investors`                         |
| Replicators and page building | `/replicators`, `/replicators/:replicatorSlug/:pageSlug?`, `/page-builder/:pageId?`, `/settings/brand-kit` |
| Communication channels        | `/communicator`, `/communicator/connect-telegram`                                                          |
| Strategy/experiments          | `/strategy-center`, `/arena`                                                                               |
| Businesses                    | `/businesses`                                                                                              |
| Optional public campaigns     | `/earn`, `/marketplace-preview`                                                                            |
| Dynamic public catalog pages  | `/instruments/:slug`, `/control/:slug`                                                                     |
| Engineering utilities         | `/visuacore`, `/github-pushes`                                                                             |

### REMOVE after reference check

| Routes                        | Reason                       |
| ----------------------------- | ---------------------------- |
| `/icon-library`, `/mui-icons` | Internal component showcases |
| `/llm-usage-demo`             | Demo-only route              |

## Backend handler manifest

### KEEP: platform, organization and settings

Dispatcher `api/app.js`:

- `health`
- `send-email`, `send-notification`, `notifications`
- `organizations`, `org-vault`
- `user-prefs`
- `user-api-keys`, `user-api-keys-test`, `user-api-keys-providers`
- `provider-catalog`
- `import-keys-preview`, `import-keys-apply`, `import-keys-cancel`
- `cleanup-imports` while imports remain enabled

These handlers must authenticate Clerk tokens. Existing calls to
`verifySupabaseToken` are legacy even when the handler itself is retained.

### KEEP: capabilities, agents and catalogue

Dispatcher `api/app.js`:

- `execute-tool`, `test-tool-connection`, `tool-setup`, `composio-connect`
- `marketplace`, `marketplace-imports`, `marketplace-library-items`
- `agent-skills`, `skill-forge`
- `agent-profiles`, `agent-enhancements`, `agent-libraries`, `agent-chat`
- `github-agents-import` only as an import adapter, not as a standalone product page

Candidates to add later rather than first-release requirements:
`ratings`, `generate-agent-avatar`, `seed-agent-profiles`, and
`huggingface-models`.

### KEEP: knowledge

Dispatcher `api/app.js`:

- `knowledge-base`, `company-brief`, `kb-bulk-upload`
- `kb-connections`, `kb-oauth`
- `storage-connections`, `storage-monitor`
- `obsidian-sync`, `notion-sync`, `ai-chat-import`

The public OAuth callback in `api/oauth-callback.js` remains only for enabled
knowledge providers and must redirect to the GCP domain.

### KEEP/MERGE: results, usage and diagnostics

Dispatcher `api/ops.js`:

- `reports`, `report-insights`, `report-ingest`
- `snapshot-report-kpis`
- `usage-analytics`, `usage-directory`
- `goal-trace`
- `read-source`, `table-preview` when required by Results ingestion
- `toggle-feature` as an admin-only operation

`data-topology` and `process-maps` are admin diagnostics, not customer navigation.

### REPLACE with Clerk

The following legacy authentication/account handlers are not migrated as-is:

- `request-password-reset`
- `invite-user`
- `delete-mfa-factor`
- `login-guard`
- `verify-pin`, `setup-pin`

Clerk owns sign-in, recovery, invitations, MFA and sessions. Any retained privileged
action confirmation must be implemented against Clerk session/MFA claims rather than
maintaining a parallel PIN login.

### REPLACE with Assistant/Workflow v2

Dispatcher `api/app.js`:

- `team-tasks`, `workflows`, `projects`, `pipeline`, `goals`
- `assistant-chat`, `assistant-stream`, `assistant-home-summary`, `assistant-tools`
- `assistant-setup`, `assistants`, `assistant-history`
- `assistant-chat-sync`, `assistant-first-steps`, `assistant-ingest` call paths
- `goal-lead-chat`
- `human-task-complete`, `human-tasks-escalate`

Dispatcher `api/agent.js`:

- `enqueue`, `status`, `process-next`, `webhook-process`, `heal-goal`

Replacement runtime:

- `server/workflow-v2/assistant-service.js`
- `server/workflow-v2/command-service.js`
- `server/workflow-v2/worker-engine.js`
- `server/workflow-v2/postgres-repository.js`
- `lib/workflow-v2/state-machine.js`
- `database/workflow-v2/migrations/001_clean_workflow_v2.sql`
- `database/workflow-v2/migrations/002_assistant_goal.sql`
- `database/workflow-v2/migrations/003_personal_tenant_jit.sql`
- `database/workflow-v2/migrations/004_assistant_retry_lineage.sql`
- `database/workflow-v2/migrations/005_assistant_turn_events.sql`
- `database/workflow-v2/migrations/006_assistant_turn_provenance.sql`
- `database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql`

No legacy handler in this group is deleted until the full shell uses v2, active legacy
jobs are drained or cancelled deliberately, required data is exported, and parity tests
pass.

### MERGE into Agents later

The standalone Consilium dispatcher is not part of the first navigation. These
capabilities may be selectively migrated under Agents:

- `agent-blueprints`, `agent-tool-whitelist`, `domain-tools`
- `agent-factory`, `agent-tool-scout`, `supervisor`
- `agent-reports`, `teams`, `analytics`

Standalone board-management operations are deferred:

- `boards`, `members`, `criteria`, `consensus-rules`
- `agents`, `agent-rollback`, `consilium-topology`

### DEFER: optional business and experimental APIs

Dispatcher `api/app.js`:

- Booking/profile: `public-book`, `public-availability`
- Partners/CRM: `ai-analyze-partners`, `contacts`, `partner-entities`
- Gambling/finance: `financial`, `budget-requests`
- Page creation: `render-deck`, `landing-pages`, `design-comments`, `brand-kit`,
  `deliverable-refine`, `replicators`
- Business modules: `businesses`, `business-modules`
- Dashboards as a separate product: `dashboard-templates`, `dashboards`,
  `dashboard-query`, `dashboard-auto`
- Experiments: `pulses`, `arena`, `library-calibration`, `local-llm-models`
- Payments: `stripe-connect`
- Standalone team messaging: `team-chat`

Dispatcher `api/ops.js`:

- `campaigns`, `pulse-tick`, `scan-library-endpoints`
- `browser-task` unless a retained Agent/Tool needs it

Dispatcher `api/agent.js`:

- `optimize-prompts`, `evaluate-variants`, `research-github`, `copilot`

Entire deferred dispatchers:

- `api/communicator.js`: `agent-room`, `controller`, `consilium-log`,
  `webhook-receiver`, `activity-feed`, `org-communication`, `link-code`,
  `telegram-register`
- `api/invest.js`: `investors`, `deals`, `commitments`, `pools`, `documents`
- `api/invest-public.js`

Direct endpoints retained by the lean boundary:

- `api/contact.js` for the public contact form; its current implementation only
  validates, rate-limits and logs, so delivery/persistence still needs implementation.
- `api/oauth-callback.js` for enabled Knowledge providers; signed state and redirects
  must use the app-owned tenant resolved from the Clerk user ID and the GCP origin.

### Optional media helpers

`transcribe`, `speech-token`, `tts`, and `translate` support voice and language
features. They are not required to prove Assistant-to-Goal. Keep them behind a feature
flag if voice remains in the first release; otherwise defer them together.

## Scheduled-job manifest

| Current schedule   | Current job                  | Decision                | GCP target                                               |
| ------------------ | ---------------------------- | ----------------------- | -------------------------------------------------------- |
| Every minute       | `agent/process-next`         | REPLACE                 | Continuous Workflow v2 worker; no scheduler polling      |
| Daily 02:00        | `agent/optimize-prompts`     | DEFER                   | Cloud Scheduler only if optimizer is restored            |
| Every 3 days 03:00 | `agent/evaluate-variants`    | DEFER                   | Cloud Scheduler only if experiments are restored         |
| Sunday 04:00       | `ops/scan-library-endpoints` | DEFER                   | Cloud Scheduler only with library calibration            |
| Daily 03:00        | `app/cleanup-imports`        | KEEP if imports enabled | Authenticated Cloud Scheduler call or Cloud Run Job      |
| Every minute       | `app/human-tasks-escalate`   | REPLACE                 | Durable deadline/outbox processing in Workflow v2 worker |
| Daily 00:15        | `ops/snapshot-report-kpis`   | KEEP                    | Authenticated Cloud Scheduler call or Cloud Run Job      |

## Clerk migration boundary

Clerk is the active full-app identity boundary. The Phase 2 session foundation keeps
identity and application tenancy deliberately separate:

- `src/main.jsx` installs `ClerkProvider`.
- `src/pages/WorkflowV2/WorkflowV2.jsx` uses Clerk `useAuth`, `SignIn`, and
  `UserButton` without depending on Clerk Organizations.
- `server/workflow-v2/http-app.js` validates Clerk sessions.
- Preview reuses the existing AxWise Clerk Development instance. No new Clerk
  application or Clerk Organizations configuration is part of this release.
- After Clerk sign-in, the browser calls authenticated `POST /v2/session`. The API
  idempotently ensures a personal Orqaly tenant, personal Clerk-user binding, and
  default tenant agent in Cloud SQL, then returns only the personal session readiness
  projection. Repeated or concurrent calls adopt the same rows rather than creating
  duplicate workspaces or agents.
- Orqaly remains the system of record for its tenant and data. Clerk supplies the
  verified personal user subject; it does not store Orqaly tenant membership, agent,
  workflow, or domain records.
- `database/workflow-v2/migrations/003_personal_tenant_jit.sql` is additive to the
  immutable migration 001 baseline and migration 002. Its exact path, checksum, source
  commit, and application must be attested with the other release evidence.
- `database/workflow-v2/migrations/004_assistant_retry_lineage.sql` is the subsequent
  additive Assistant retry-lineage release input and carries the same attestation
  requirements.
- `database/workflow-v2/migrations/005_assistant_turn_events.sql` is the subsequent
  additive Assistant lifecycle-event release input and carries the same attestation
  requirements.
- `database/workflow-v2/migrations/006_assistant_turn_provenance.sql` is the subsequent
  additive Assistant routing/model-provenance release input. It preserves legacy rows and
  carries the same attestation requirements.
- `database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql` is the
  subsequent additive constraint-widening release input. It admits the
  `grounded_sources_requested` reason while preserving every other provenance invariant
  and carries the same attestation requirements.
- `infra/gcp/workflow-v2/bootstrap-preview-tenant.sh` is optional deterministic
  preseed/verification for an operator-selected Preview user. It is not required for
  normal sign-in and is not the primary provisioning path.
- The full app login boundary now uses Clerk through `src/context/AuthContext.jsx` and
  `src/components/Auth/ProtectedRoute.jsx`. The unused legacy helper
  `src/lib/auth.js` and many domain-service token lookups still need pruning or
  conversion before those domains can be enabled on GCP.
- `src/context/PartnerAccessContext.jsx` no longer loads a Supabase/local user
  directory. A signed-in personal Clerk user receives an owner-shaped compatibility
  role for UI presentation only; Cloud Run remains responsible for authorization.
- Agent role labels use a static system-agent catalogue and do not load user roles or
  imply access for the signed-in Clerk identity.
- The remaining frontend contains 97 `supabase.auth.getSession()` call sites in 82
  files and 72 `supabase.auth.getUser()` call sites in 47 files. Active shell token
  calls are being replaced with Clerk; deferred modules remain source-only.
- 128 non-test backend handlers still consume `verifySupabaseToken`; the verifier
  itself calls Supabase `/auth/v1/user` and cannot validate a Clerk-only session.
- Historical migrations contain 850 auth/RLS references across 148 files and 180
  foreign keys to `auth.users` across 103 files. Those UUID ownership assumptions are
  domain-schema migration work, not user-account migration work.

Supabase officially supports Clerk as a third-party identity provider and accepts
Clerk session tokens through the Supabase client `accessToken` option. There are no
Supabase users to link or backfill, so retained empty/new data structures can be changed
directly to Clerk text subjects, or the retained domain can move directly to Cloud SQL.
Historical UUID ownership policies do not create an account-migration requirement,
but retained domain rows still need inventory and either app-owned Clerk-subject
ownership in Cloud SQL or a Clerk-aware backend boundary before those modules ship.

For the lean GCP release:

1. Clerk supplies the only browser identity session.
2. A central browser API/token client replaces one-off `supabase.auth.getSession()`
   calls and establishes the Orqaly workspace through authenticated
   `POST /v2/session`.
3. Cloud Run validates the Clerk JWT and idempotently creates or resolves an app-owned
   personal tenant and default agent from the personal Clerk user ID.
4. Workflow v2 stores the Clerk user ID directly. Its nullable organization field is
   not required and remains null for this deployment.
5. Kept data domains use Clerk-native ownership or Cloud SQL from the start; no legacy
   Supabase-user identity map is needed.
6. Deferred Supabase tables remain unavailable from the lean UI and may be removed
   later with their deferred modules.

References:

- [Clerk: integrate Supabase with Clerk](https://clerk.com/docs/guides/development/integrations/databases/supabase)
- [Supabase: Clerk third-party authentication](https://supabase.com/docs/guides/auth/third-party/clerk)

## GCP runtime manifest

### KEEP

- Workflow v2 Orqaly API and worker.
- AxWise API and worker.
- Workflow v2 state machine, contracts, PostgreSQL repository and database migrations.
- Artifact export to GCS with immutable object creation.
- Cloud SQL, Secret Manager, Artifact Registry and isolated service accounts.
- Existing security-header and immutable-image release requirements.

### BUILD OR CHANGE

1. Build the reviewed `gcp-launch` Vite graph in
   `deploy/workflow-v2/Dockerfile.web`; copy only `public-gcp` and reject legacy
   runtime imports during bundling.
2. Mount the retained workspace inside the lean Clerk-protected GCP shell. The shell
   owns New chat, Recents, Pinned, the consolidated module navigation, and responsive
   sidebar customization; the legacy `MainLayout` is outside the launch bundle.
3. Replace legacy login/signup/protected-route behavior with Clerk components/hooks.
4. Add a Clerk-authenticated GCP API host for only the KEEP handlers. Do not deploy all
   151 legacy operations by default.
5. Move remaining scheduled jobs from Vercel Cron to Cloud Scheduler or Cloud Run Jobs.
6. Replace `@vercel/functions` `waitUntil`, Vercel deployment-scope logic, hard-coded
   `*.vercel.app` URLs, Vercel CORS defaults, and Vercel request/log assumptions.
7. Use direct model providers on GCP. Do not depend on Vercel AI Gateway or
   `VERCEL_OIDC_TOKEN`.
8. Put server secrets in Secret Manager; only publishable Clerk and public API/data
   settings may enter the Vite bundle.
9. Serve the lean SPA from its approved GCP origin. The browser calls the explicit
   GCP API origin under its CORS allowlist; nginx does not provide a legacy `/api`
   compatibility bridge.
10. Replace the routing layer instead of copying its defects: the current
    `/api/seed-tool-credentials` rewrite targets no registered handler, `/api/notion-sync`
    has no friendly rewrite, and the local compatibility server omits the contact
    endpoint.

### Implemented launch navigation contract

- **Primary:** New chat, Recents, Pinned, Home, Assistant, Goals, Workspace.
- **Intelligence:** Agents, Capabilities, Knowledge, Results.
- **History:** Assistant Chats, Goal Runs, Results & Artifacts.
- **Footer:** Notifications, Activity & Usage, Settings, Edit sidebar.
- Requests, Task Tracker, Work Projects, Process Flow, and Job Pool resolve to Goals.
- Consilium resolves to Agents; marketplace/tool catalogues resolve to Capabilities;
  reports/dashboards resolve to Results; workspace/organization surfaces resolve to
  Workspace; diagnostics and usage resolve to Activity & Usage.
- Pins, visibility, ordering, and optional dividers are versioned per Clerk user in
  that browser. They are explicitly device-local until a GCP preference store is
  introduced.
- Knowledge currently exposes durable Goal outputs and an explicit migration-readiness
  state. Document upload, provider connections, and retrieval stay disabled until their
  Clerk-bound GCP data path is implemented.
- Activity is live from redacted workflow events. Aggregate model-token and tool-call
  totals remain unavailable rather than displaying synthetic values.
- Retained modules with incomplete management or data paths remain navigable and show a
  launch-visible `In progress` contract. Each contract lists what is live now and the
  concrete work still required; it is removed only after that remaining scope is
  implemented and tested. The current contracts cover Workspace, Agents, Capabilities,
  Knowledge, Results, History, Notifications, and Activity & Usage.

The root `Dockerfile` is not currently sufficient: its production image serves only
static assets and explicitly leaves API/worker execution on Vercel/Supabase.
`scripts/local-api-server.js` proves that the dispatcher handlers can run under Express,
but it is a development compatibility host and should not become production unchanged.

## Implementation order and gates

### Phase 1: full shell on GCP

Implementation status: complete in the release candidate. The retained responsive
shell and route graph must pass immutable Preview deployment and browser verification
before this phase is closed.

- Build the complete public site and lean authenticated workspace shell in the GCP web
  image.
- Replace `/login` and `/signup` with Clerk.
- Keep `/assistant` as the canonical Assistant route and redirect `/workflows-v2`.
- Hide deferred modules from navigation and routing without deleting data.

Gate: landing, sign-in, sign-up, sign-out, account management, protected-route
redirects, refresh, and direct deep links all pass on the GCP preview origin.

### Phase 2: lean core API/data

Implementation status: the personal tenant boundary plus safe Workspace, Overview,
and Activity projections are complete. Knowledge ingestion, detailed usage totals,
and preference synchronization remain later data cutovers.

- Reuse the existing AxWise Clerk Development instance for Preview; do not create a
  separate Clerk app or add Clerk Organizations.
- Use authenticated `POST /v2/session` as the idempotent JIT boundary for the personal
  Cloud SQL tenant, Clerk-user binding, and default agent.
- Expose only the KEEP platform APIs and purpose-built safe read projections on Cloud
  Run. Do not expose internal tenant IDs, Clerk claims, workflow payloads, receipts,
  leases, costs, quality scores, or internal service URLs.
- Establish app-owned tenant/user ownership for each retained data domain from the
  personal Clerk user ID, without a Supabase-user compatibility layer.
- Keep service-role access server-only and preserve tenant isolation.
- Treat migration 003 as an additive migration and require its release attestation;
  keep deterministic Preview bootstrap available only as optional preseed/verification.

Gate: repeated and concurrent session bootstrap calls adopt one personal tenant and
one default agent; two distinct app-owned tenants cannot read or mutate each other's
records; migration 003 is attested; and no browser request carries a Supabase Auth
session. No Supabase account-linking flow or Clerk Organizations feature is required.

### Phase 3: Assistant and Goals cutover

Implementation status: the Assistant/Goal UI and durable control-plane path are
implemented; live two-gate Preview evidence remains the release gate.

- Embed Assistant v2 and Goal v2 in the full UI.
- Route approvals, artifacts and requests to the durable Workflow v2 API/worker.
- Drain or explicitly close legacy jobs.

Gate: a real Clerk user completes Assistant clarification, starts a Goal, approves both
gates, observes retries/status, and downloads the immutable final artifact.

### Phase 4: runtime pruning

- Stop deploying REPLACE and DEFER handlers/jobs.
- Remove Vercel-only packages/configuration and hard-coded Vercel URLs.
- Physically delete legacy source only after reference, data-export and parity checks.

Gate: repository and built artifacts contain no required Vercel runtime token, Vercel
API endpoint, Vercel cron, or Vercel serverless import. Browser/API smoke tests show no
requests to `*.vercel.app`.

### Phase 5: domain cutover

- Verify the full GCP release through its immutable preview revision.
- Configure the production custom domain only after the previous gates pass.
- Keep rollback at the traffic/DNS layer until production observation is complete.

## Explicit non-goals for the first GCP release

- Full parity for every historical business vertical.
- Migrating deferred module data merely because its tables exist.
- Keeping Supabase Auth as a hidden secondary login.
- Recreating Vercel Cron one-for-one when the durable worker replaces polling.
- Deleting data or source before the replacement path is verified.
