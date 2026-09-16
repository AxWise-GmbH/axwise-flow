# Google-native deployment boundary

Build one service image from `Dockerfile.service`. Run it with the default command
for the Clerk-authenticated command API and override the Cloud Run container command
to `node server/workflow-v2/worker-main.js` for the dedicated worker. Build the web
image separately with only the Clerk publishable key and Orqaly API URL as required
public Vite build arguments. The web image builds the reviewed `gcp-launch` graph,
copies only `public-gcp`, and serves React Router deep links through nginx. The browser
calls the explicit GCP API origin directly; nginx has no legacy `/api` proxy and no
Vercel runtime is part of this image.

The authenticated graph contains the retained personal workspace only: Home,
Assistant, Goals, Workspace, Agents, Capabilities, Knowledge, Results, History,
Notifications, Activity & Usage, and Clerk Settings. The responsive sidebar also owns
New chat, real Recents, browser-local Pinned items, and per-Clerk-user device-local
visibility/order/divider preferences. Deferred historical verticals are neither routed
nor bundled into this web image.

The GCP API supplies three bounded, tenant-scoped menu/page projections:
`GET /v2/workspace`, `GET /v2/overview`, and `GET /v2/activity`. They intentionally omit
internal tenant identifiers, identity claims, event payloads, receipts, leases, costs,
quality scores, and internal service URLs.

Validate the lean GCP browser artifact before release:

```sh
npm ci --ignore-scripts
VITE_CLERK_PUBLISHABLE_KEY=pk_test_build_only \
  VITE_ORQALY_API_URL=https://orqaly-v2-api-preview.example.run.app \
  npm run build:gcp
node deploy/workflow-v2/verify-gcp-web-build.mjs dist
npm audit --omit=dev
npm audit
```

The first audit covers dependencies bundled into the browser artifact. The second
also covers the build-only Vite toolchain. The final nginx image contains neither
dependency tree; release evidence should record both results separately.

Preview and Production each require their own:

- Cloud SQL PostgreSQL instance (or, initially, separate databases on an instance
  that is never shared across environments), database users, and connection secrets;
- Cloud Run web, API, worker, and AxWise services with distinct service accounts;
- Artifact Registry repository, Cloud Storage artifact bucket, and Secret Manager
  secrets;
- Clerk identity: Preview reuses the existing AxWise Clerk Development instance and
  Production uses the shared AxWise Production instance; Orqaly creates no new Clerk
  application and does not use Clerk Organizations;
- API browser-origin allowlist and Cloud Run IAM grants permitting only the environment's
  Orqaly API and worker service accounts to invoke AxWise. Both callers use the
  environment's Direct VPC egress path because AxWise accepts internal ingress only.

Clerk owns authentication only. Orqaly owns its personal tenant, default agent,
workflows, and application data separately in Cloud SQL. After Clerk sign-in, the web
application sends authenticated `POST /v2/session`; the Orqaly API idempotently creates
or adopts the personal tenant, Clerk-user binding, and default agent without a Clerk
Organizations dependency. The browser receives only the personal session readiness
projection, not the internal tenant UUID.

The worker service must have minimum instances `1`, CPU always allocated, and no
unauthenticated invoker. The API and web may scale to zero. The AxWise service is
internal/IAM-authenticated. Cloud SQL migrations are a separate release job; application
containers never run migrations on startup. Migration
`database/workflow-v2/migrations/003_personal_tenant_jit.sql` is additive and its exact
path, checksum, source commit, and database application must be recorded in release
attestation. It retains a temporary personal-only wrapper for the old resolver signature
so pre-cutover revisions can drain; non-null organization arguments fail closed. Remove
that compatibility signature only in a later contract migration.
`database/workflow-v2/migrations/004_assistant_retry_lineage.sql` is the next additive
release input and must be attested with the same exact path/checksum/commit boundary. It
adds immutable Assistant retry lineage and prevents duplicate children for one failed turn.
`database/workflow-v2/migrations/005_assistant_turn_events.sql` adds the append-only,
tenant-isolated Assistant lifecycle stream and is applied and attested in the same release
transaction before application revisions use the event endpoint.
`database/workflow-v2/migrations/006_assistant_turn_provenance.sql` adds nullable routing
and actual model provenance to immutable Assistant messages without rewriting historical
rows. Apply and attest it before deploying Orqaly API/worker revisions that insert the new
columns.
`database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql` widens only
the persisted routing-reason vocabulary to admit `grounded_sources_requested`; it keeps
all migration 006 provenance invariants and historical message bytes unchanged. Apply and
attest it before deploying Orqaly revisions that persist that route reason.
`database/workflow-v2/migrations/008_agentic_execution_preview.sql` adds the isolated
executable-action, one-time Gateway-grant, immutable effect-receipt, and operational-record
tables. It imports no Supabase data. Apply it before enabling `/v1/.../executable-actions`
or starting the Tool Gateway; the API fails closed while execution configuration is absent.
`infra/gcp/workflow-v2/bootstrap-preview-tenant.sh` remains optional
deterministic preseed/verification; it is not required for normal JIT provisioning.

Required API environment:

- `ORQALY_ENVIRONMENT`
- `ORQALY_IDENTITY_DATABASE_URL`
- `ORQALY_API_DATABASE_URL`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `ORQALY_BROWSER_ORIGINS`
- `AXWISE_SERVICE_URL`

Enabling the self-hosted n8n action path additionally requires all three values. Supplying
only a subset or an invalid manifest/key set fails API startup instead of falling back to
direct execution:

- `ORQALY_N8N_BASE_URL`: private n8n Cloud Run origin;
- `ORQALY_N8N_BINDING_MANIFEST_PATH`: `/app/n8n/executor-bindings.json` in the service image;
- `ORQALY_GATEWAY_PUBLIC_KEYS_JSON`: JSON object from signing-key ID to Ed25519 public-key
  PEM (or base64-encoded PEM).

`ORQALY_N8N_TIMEOUT_MS` defaults to `90000`: this is transport/cold-start headroom only.
The signed envelope still caps n8n execution at 30 seconds and one attempt, while the
one-operation Gateway grant expires after 85 seconds.

Required worker environment adds `ORQALY_WORKER_DATABASE_URL` and
`ORQALY_ARTIFACT_BUCKET`. The Orqaly worker exports only
committed final Markdown artifacts, with create-only GCS generation preconditions;
the database artifact remains authoritative. AxWise requires `AXWISE_OPERATION_DATABASE_URL`,
`GEMINI_API_KEY`, `GEMINI_MODEL=models/gemini-3.8-flash`, and an independent
`AXWISE_AUTHORITY_SEAL_KEY`.

See `docs/workflow-v2/preview-release.md` for the exact Preview evidence manifest and
Production stop gate.

## Native n8n solution editor

The native editor is mounted through the **existing authenticated API origin** at
`/native-n8n`, not a new public n8n origin. The customer n8n service remains private
to Cloud Run IAM. Its UI assets must be enabled (`N8N_DISABLE_UI=false`); this does
not grant anonymous invocation. Do not replace its image, database, service account,
node allowlist, maximum-instance limit or network policy merely to enable the UI.

Apply and attest additive migration
`database/workflow-v2/migrations/012_solution_revisions.sql` before deploying this
API. Existing workflows remain version 1; revisions use separate workflow IDs and
webhook paths. The API never changes an approved workflow in place.

Optional native editor configuration is all-or-nothing:

- `ORQALY_NATIVE_N8N_GATEWAY_ORIGIN`: the existing HTTPS API origin, distinct from
  the web origin;
- `ORQALY_NATIVE_N8N_BINDINGS`: Secret Manager JSON array of
  `{environmentId, origin, email, password, useIdToken}`. Every binding must match
  an existing `ORQALY_SOLUTION_ENVIRONMENTS` entry exactly. These are existing
  self-hosted n8n login credentials, never browser build arguments;
- `ORQALY_NATIVE_N8N_SIGNING_KEY`: independent Secret Manager random key of at
  least 32 bytes, never a n8n license key or browser build argument.

The bounded preview operator exposes `migrate-revisions` and `configure-native`.
The migration command requires the exact migration bytes at HEAD. Configuration
creates/reuses two secrets for the already-approved single preview environment
and grants only the existing API service account access. It does not deploy services
or expose n8n publicly. Use incremental Cloud Run environment/secret updates; the
older broad fleet deployment script must not erase these bindings. Preserve the
API database secret at `orqaly-v2-preview-001-db-api-url:2` (version 1 is disabled).

The browser obtains a 30-second signed launch grant and POSTs it into a sandboxed
iframe. The gateway issues a 10-minute HttpOnly, Secure, partitioned session cookie
scoped to its unique mount path. Every workflow read/save rechecks ownership and
revision state. The iframe receives no Clerk bearer token, n8n owner password,
management API key or Google identity token. The server uses genuine native n8n
authentication only for allowlisted frontend assets and metadata.

Native saves persist only Orqaly draft JSON. Native execution, publish, credentials,
user-management and arbitrary workflow APIs are denied at the gateway. Review,
approval, deployment, testing and activation remain authenticated Orqaly commands.
Embedding styles are UX affordances, not the security boundary. Capabilities are
currently restricted to reviewed webhook field transformations; this is not a
general-purpose unrestricted n8n editor or software-code execution sandbox.

The web CSP allows frame/form delivery only to the exact existing API origin.
Changing that origin requires changing and reviewing the CSP. Do not enable a
wildcard, forward the entire n8n REST API, disable n8n authentication, or send
customer workflows to a public third-party viewer. Commercial/OEM distribution
approval remains a separate release prerequisite; this adapter does not unlock
enterprise token exchange or bypass n8n licensing checks.
