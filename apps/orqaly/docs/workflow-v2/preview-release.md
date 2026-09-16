# Clean workflow v2 Preview release evidence

Production promotion stays closed until a fresh Preview baseline passes the complete
vertical in both UI projections. Simple and Advanced call the same authenticated Orqaly
command API and persist the same state, artifact, approval, attempt, audit, and outbox
contracts. The UI mode changes disclosure only.

Preview reuses the existing AxWise Clerk Development instance. It does not require a
new Clerk application or Clerk Organizations. Clerk authenticates the personal user;
Orqaly separately owns the tenant, default agent, workflows, and application data in
Cloud SQL.

## Required Preview sequence

1. Apply the immutable Orqaly baseline
   `database/workflow-v2/migrations/001_clean_workflow_v2.sql`, then additive migrations
   `002_assistant_goal.sql`, `003_personal_tenant_jit.sql`,
   `004_assistant_retry_lineage.sql`, `005_assistant_turn_events.sql`, and
   `006_assistant_turn_provenance.sql`, and
   `007_assistant_grounded_sources_reason.sql` in numeric order. Apply the AxWise
   `001_cognitive_operations.sql` baseline followed by
   `002_assistant_turn.sql`, `003_assistant_runtime.sql`,
   `004_operation_events.sql`, and `005_compile_scope_v3.sql` in numeric order
   to a fresh AxWise database on
   `axwise-v2-preview-001:europe-west4:orqaly-v2-preview-001-pg`. The literal database
   names are `orqaly_v2_preview_001` and `axwise_v2_preview_001`; release scripts reject
   diagnostic names. Supply the numeric admin-password secret version explicitly. Each
   baseline apply commits the narrow login bindings, revoked cross-database CONNECT, and
   its in-database checksum/source-commit marker in one transaction. Record migrations
   002 through 007 in `workflow_v2_release.applied_additive_migrations`; every additive
   release input's exact path, checksum, source commit, and application must be attested.
   Migration 003 is the expand step: its temporary three-argument
   resolver wrapper accepts only a null organization and delegates to the personal JIT
   function, keeping an older draining API revision operational. Remove that legacy
   signature only in a later contract migration after every old revision is drained.
   The same migration explicitly converges the three service-login memberships to
   `ADMIN FALSE, INHERIT TRUE, SET TRUE`; the pools use those narrow inherited roles
   directly and never receive broad table grants or superuser attributes.
   Migration 004 adds the immutable parent-turn link and one-child uniqueness boundary
   used by explicit Assistant retry attempts.
   Migration 005 adds the immutable tenant-scoped Assistant lifecycle cursor used for
   progress wakeups, cancellation recovery, and future tool/approval activity.
   Migration 006 adds nullable, immutable per-turn routing and actual model provenance.
   Existing rows remain unmodified and replayable; new user turns must persist a complete
   routing decision while assistant responses may persist model identifiers actually
   reported by AxWise.
   Migration 007 widens only the immutable route-provenance check to admit
   `grounded_sources_requested`; every other migration 006 invariant stays unchanged.
   AxWise migration 005 admits the versioned `CompileScopeV3` envelope and tightens
   operation identity to one immutable operation per tenant/stage attempt; deploy the
   AxWise consumer and migration before any Orqaly revision can emit V3 input.
   Every adoption and live boundary check must match the exact commit-pinned PostgreSQL
   16 catalog fingerprint; relation names or ledger rows alone are not release evidence.
   Run `verify-preview-database-boundaries.sh` to read the baseline
   markers and prove all five release logins can connect only to their owning database.
   Run the real-PostgreSQL structural and RLS suites before building images.

   `infra/gcp/workflow-v2/bootstrap-preview-tenant.sh` is optional deterministic
   preseed/verification for a named Preview Clerk user. Normal first sign-in does not
   depend on this operator step: authenticated `POST /v2/session` idempotently provisions
   the user's personal Orqaly tenant, Clerk-user binding, and default agent in Cloud SQL.

2. Build and push web, Orqaly API, Orqaly worker, AxWise API, and AxWise worker images
   from exact tracked `git archive` snapshots. The build attestation independently
   downloads each immutable Cloud Build source generation, proves its normalized file
   tree equals the repository HEAD, verifies the executed build steps/options and builder
   digests against the tracked config, and binds the web API origin and Clerk key version.
   Record image URIs by immutable `@sha256:` digest. Runtime deployment must use those
   digests, not tags, and must use explicitly supplied numeric Secret Manager versions;
   resolving `latest` during build or deployment is forbidden. Builds use the dedicated
   Preview build service account and `CLOUD_LOGGING_ONLY`; that identity alone may write
   to the immutable Preview repository and read the selected Clerk publishable-key. It
   must not receive the broad project-level Cloud Build builder role.
   Deploy all five revisions with no traffic, require their startup/readiness/liveness
   probes and exact runtime/IAM/network/storage verification, then promote dependencies
   before API/browser traffic.
3. Sign in through the existing AxWise Clerk Development instance and verify that
   authenticated `POST /v2/session` returns the personal workspace readiness projection
   without a tenant UUID or organization claim. Repeating the request must adopt the same
   personal tenant and default agent. Then run a new Estonia cat-food workflow in Simple
   and Advanced. Record each durable
   Gate 1/Gate 2 approval row and stage, its exact scope/plan artifact ID and hash,
   exact producer input hash, selected evidence, and canonical decision hash. Verify
   the final `.md`, evidence readiness and
   launch-ready rule, correlated logs, leases, retries, token usage, provider cost,
   end-to-end latency, and cross-tenant denial.
4. Prove every named fault gate in `REQUIRED_FAULT_GATES` from
   `scripts/workflow-v2-release-manifest.mjs`. Each case has a strict fact schema in
   `scripts/workflow-v2-evidence-reports.mjs`; unknown cases, generic facts, placeholders,
   and bare assertions fail. Create and create-only upload the typed report with:

   ```sh
   node scripts/workflow-v2-evidence-reports.mjs create \
     --input /absolute/path/to/verified-cases.json \
     --output /absolute/path/to/typed-report.json
   node scripts/workflow-v2-evidence-reports.mjs upload \
     --input /absolute/path/to/typed-report.json \
     --destination gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/release-evidence/<unique>.json \
     --output /absolute/path/to/report-references.json
   ```

5. Export the DB-authoritative final Markdown artifact through the Orqaly worker to the
   environment bucket. The object name includes tenant, run, artifact ID, and artifact
   content hash. The exporter uses `ifGenerationMatch=0`, records the artifact envelope
   hash and raw Markdown SHA-256 as metadata, and only adopts an exact replay. The worker
   service account receives bucket-scoped objectCreator and objectViewer roles, never
   object delete or update authority. Replay adoption verifies both metadata and bytes.
6. Capture the two exact live runs in one read-only database snapshot, then generate a
   create-only manifest. Both repositories must be exact clean worktree roots; tracked,
   staged, and untracked files all close this gate:

   ```sh
   ORQALY_RELEASE_DATABASE_URL='<read-only Preview URL>' \
     node scripts/workflow-v2-live-evidence.mjs \
       --tenant-id <UUID> --owner-user-id <Clerk user ID> \
       --simple-run-id <UUID> --advanced-run-id <UUID> \
       --output /absolute/path/to/live-evidence.json

   node scripts/workflow-v2-release-manifest.mjs \
     --input /absolute/path/to/preview-evidence.json \
     --live-evidence /absolute/path/to/live-evidence.json \
     --build-attestation /absolute/path/to/build-attestation.json \
     --runtime-attestation /absolute/path/to/runtime-attestation.json \
     --axwise-repository /absolute/path/to/axwise-flow-oss \
     --output /absolute/path/to/preview-release-manifest.json
   ```

The generated manifest binds both git commits, both baseline checksums, the ordered
Orqaly additive migrations (including migrations 003 and 004 paths, checksums, source
commits, and database application evidence), five runtime image digests, the Clerk issuer fingerprint
(never a key), Gemini model/reasoning, Cloud SQL instance and literal database names,
numeric secret versions, runtime/IAM/bucket verification evidence, both E2E runs, their
exact scope/plan approval artifact/input bindings and final artifacts, usage/cost/latency,
GCS generations/checksums, exact downloaded Markdown bytes, and all fault evidence.
Usage, search calls, estimated provider cost, and latency come from durable DB
events/timestamps, not supplemental values. It deliberately records
`productionPromotionAllowed: false`; a separate Production promotion may be implemented
only after Preview evidence is reviewed.

## Runtime boundaries

- `ORQALY_ARTIFACT_BUCKET` is required only by the Orqaly worker. The API and browser
  receive no GCS write identity; the database remains authoritative for reads.
- Preview and Production use different databases, buckets, service accounts, secret
  versions, and service names. Preview reuses the existing AxWise Clerk Development
  instance and Production uses its Production identity boundary; Orqaly creates no new
  Clerk application and has no Clerk Organizations dependency.
- Clerk owns authentication, while Orqaly owns its personal tenant and application data
  in Cloud SQL. Authenticated `POST /v2/session` is the idempotent JIT provisioning
  boundary and returns only session readiness, not the internal tenant UUID.
- Schema migration remains a separate operator action using the migration owner. The
  deterministic Preview tenant bootstrap is optional preseed/verification, not the
  normal account-provisioning path. API and worker logins retain only narrow
  `SECURITY DEFINER` RPC execution and tenant-scoped reads; neither path restores broad
  table DML grants.
- The web container emits CSP, HSTS, permissions, referrer, framing, and MIME-sniffing
  protections on HTML, assets, health, and readiness responses.
