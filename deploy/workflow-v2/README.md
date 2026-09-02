# AxWise workflow v2 services

The one workflow-v2 image has two deliberately separate Cloud Run entrypoints.
Set `AXWISE_PROCESS_ROLE=api` for the IAM-only persist/status API and
`AXWISE_PROCESS_ROLE=worker` for the durable PostgreSQL queue consumer. The API
container never imports the cognitive executor and must not receive Gemini or
authority-seal secrets.

Preview and Production each require distinct Cloud SQL databases, login roles,
service accounts, Secret Manager values, services, and data. Apply
the pinned migration chain in order: `001_cognitive_operations.sql` establishes
the durable operation queue and least-privilege roles,
`002_assistant_turn.sql` adds the Assistant operation contract,
`003_assistant_runtime.sql` adds retry timing and safe failure diagnostics, and
`004_operation_events.sql` adds append-only lifecycle events and cooperative
cancellation. Every migration SHA-256 must match `SCHEMA_SHA256`; skipping or
reordering a migration is unsupported. The login roles are provisioned outside
the chain, then `preview-role-bindings.sql` grants the narrow API and worker
roles. Preview uses the literal `orqaly-v2-preview-001-pg` /
`axwise_v2_preview_001` target and release-specific `axwise_v2_001_*` logins.
The apply helper requires an exact numeric admin-secret version. On a fresh
database it installs migrations 001-004, role bindings, and the immutable
release marker in one transaction; on an exactly marked prior stage it applies
only the missing ordered additive migrations. It rejects unknown or partially
marked schema states and revokes public database CONNECT.

Required API configuration:

- `AXWISE_PROCESS_ROLE=api`
- `AXWISE_SERVICE_URL` as the exact canonical API origin
- `AXWISE_OPERATION_DATABASE_URL` for the API login
- `AXWISE_OPERATION_DATABASE_POOL_SIZE` from 1 to 8 (recommended: 3)

Required worker configuration:

- `AXWISE_PROCESS_ROLE=worker`
- `AXWISE_SERVICE_URL` (the same canonical API origin)
- `AXWISE_OPERATION_DATABASE_URL` for the worker login
- `GEMINI_API_KEY` and `AXWISE_AUTHORITY_SEAL_KEY`
- `GEMINI_MODEL=models/gemini-3.7-flash`
- `GEMINI_SEARCH_MODEL=gemini-3.7-flash`
- `GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS=750000`
- `GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS=3750000`
- `GEMINI_SEARCH_COST_MICROS_PER_QUERY=14000`
- `SEARXNG_URL` as the canonical private auxiliary-search origin
- `SEARXNG_AUTH_MODE=google_identity`
- bounded research, lease, heartbeat, idle and pool settings as needed

The private SearXNG route is a bounded discovery fallback for transient Gemini
Google Search failures. It is stateless and has no workflow authority. Search
snippets are never accepted directly as verified claims; workflow-v2 fetches and
hashes selected source material before typed claim extraction.

`estimatedCostMicros` covers configured Gemini input/output token rates plus a
conservative worst-case list-price charge for every provider-reported grounded
web-search query. `searchCalls` is the sum of Gemini
`groundingMetadata.webSearchQueries`, not HTTP attempts. The search estimate is
intentionally before monthly free-tier and billing reconciliation; reconcile
the durable metrics against the Google invoice for final accounting.

Cloud Run safeguards are part of the service configuration, not application
defaults. Keep the API at a small capped scale (for example max 4 instances).
Run the worker with one minimum/maximum instance, concurrency 1, startup CPU
boost and `--no-cpu-throttling`; otherwise request-based CPU suspension can stop
durable queue polling and heartbeats. Use distinct least-privilege service
accounts, internal ingress, authenticated invocation, and no Gemini/seal secrets
on the API service. Do not point either service at the historical Supabase
project or the legacy Orqaly schema.

Orqaly's coordinated release tooling owns deployment of the five application
services, immutable application-image selection, service names and runtime
origin checks. This AxWise repository does not independently deploy those five
services. Its Preview-only
`scripts/deploy-workflow-v2-searxng-cloud-run.sh` helper is narrower: it builds
and deploys only the stateless auxiliary search transport, refuses every target
outside Preview 001, authorizes only the pinned v2 worker identity, and outputs
the canonical endpoint. The coordinated Orqaly deployment owns the worker's
`SEARXNG_URL` and `SEARXNG_AUTH_MODE=google_identity` configuration; the helper
never mutates the worker service or its container image.

The dedicated image installs `backend/workflow_v2_requirements.lock`. The
path-scoped workflow-v2 CI gate uses the same lock, verifies the pinned 001-004
checksums and PostgreSQL invariants, and builds the image without invoking
deployment.
