# AxWise workflow v2 services

The one workflow-v2 image has two deliberately separate Cloud Run entrypoints.
Set `AXWISE_PROCESS_ROLE=api` for the IAM-only persist/status API and
`AXWISE_PROCESS_ROLE=worker` for the durable PostgreSQL queue consumer. The API
container never imports the cognitive executor and must not receive Gemini or
authority-seal secrets.

Preview and Production each require distinct Cloud SQL databases, login roles,
service accounts, Secret Manager values, services, and data. Apply
`001_cognitive_operations.sql` only after its SHA-256 equals `SCHEMA_SHA256`.
The login roles are provisioned outside the baseline, then
`preview-role-bindings.sql` grants the narrow API and worker roles. Preview uses
the literal `orqaly-v2-preview-001-pg` / `axwise_v2_preview_001` target and
release-specific `axwise_v2_001_*` logins. The apply helper requires an exact
numeric admin-secret version, installs the baseline and immutable checksum marker
in one transaction, and revokes public database CONNECT.

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
- bounded research, lease, heartbeat, idle and pool settings as needed

`estimatedCostMicros` covers configured Gemini input/output token rates. Google
Search tool charges are not available in the provider usage response, so they
remain separately identifiable via `searchCalls` and are not folded into that
estimate.

Cloud Run safeguards are part of the service configuration, not application
defaults. Keep the API at a small capped scale (for example max 4 instances).
Run the worker with one minimum/maximum instance, concurrency 1, startup CPU
boost and `--no-cpu-throttling`; otherwise request-based CPU suspension can stop
durable queue polling and heartbeats. Use distinct least-privilege service
accounts, internal ingress, authenticated invocation, and no Gemini/seal secrets
on the API service. Do not point either service at the historical Supabase
project or the legacy Orqaly schema.

Orqaly's coordinated release tooling owns service deployment, immutable image
selection, numeric secret versions, service names and runtime origin checks.
This AxWise repository intentionally supplies no independent Cloud Run deploy
command that could bypass those cross-service release gates.

The dedicated image installs `backend/workflow_v2_requirements.lock`. The
path-scoped workflow-v2 CI gate uses the same lock, verifies baseline checksum
and PostgreSQL invariants, and builds the image without invoking deployment.
