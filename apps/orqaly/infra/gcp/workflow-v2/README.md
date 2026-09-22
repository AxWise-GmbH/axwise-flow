# Workflow v2 Google Preview

This directory provisions only the isolated Preview boundary. It never reads from or
writes to the legacy Supabase project, and it contains no Production provision command.

Resources use the `orqaly-v2-preview` / `axwise-v2-preview` prefix:

- one dedicated `orqaly-v2-preview-001-pg` Cloud SQL PostgreSQL 16 instance with fresh
  `orqaly_v2_preview_001` and `axwise_v2_preview_001` databases and
  least-privilege application logins; existing diagnostic v2 databases are not
  reused or mutated by the release;
- separate Orqaly API/worker and AxWise API/worker service accounts;
- a dedicated Preview VPC subnet with Private Google Access and Cloud NAT; the
  Orqaly API and worker route through it so Assistant and workflow calls to
  AxWise satisfy internal ingress;
- a dedicated Artifact Registry repository and artifact bucket;
- independent Secret Manager entries for database credentials, Clerk Development,
  Gemini, TypeSafe JEV, and the AxWise authority seal. The Orqaly API and AxWise
  worker can read the TypeSafe key, the Orqaly API and AxWise worker can read
  Gemini, only the AxWise worker can read the authority seal, and the AxWise API
  can read only its database URL.

The Orqaly worker alone receives bucket-scoped objectCreator and objectViewer roles,
never object delete or update authority. Final Markdown object names bind tenant, run,
artifact ID, and artifact content hash. Create-only generation preconditions prevent
overwrites; exact replays require matching metadata and matching downloaded bytes.

`provision-preview.sh` is idempotent for the exact Preview 001 target. It generates
release-specific database credentials and the AxWise authority seal directly into Secret
Manager without printing them. It never reads the externally managed TypeSafe key
payload. A database URL version is reused only when its complete
value already matches the dedicated instance, database and login. The script prints only
non-secret numeric versions. Clerk Development and Gemini secrets are created without
versions; deployment fails closed until those values are supplied through an authenticated
operator session and their numeric versions are explicitly selected. The existing
`axwise-v2-preview-001-typesafe-api-key` is likewise selected only through the required
numeric `TYPESAFE_API_KEY_SECRET_VERSION` deploy input; it is mounted on
`orqaly-v2-api-preview` and `axwise-v2-worker-preview` as `TYPESAFE_API_KEY` and is
explicitly absent from the AxWise API.
Cloud SQL connector enforcement is `REQUIRED`, and authorized networks are cleared and
asserted empty; services and operator verification use only approved Cloud SQL connectors.
Provisioning also requires the effective organization policies that skip default-network
creation, disable automatic IAM grants to default service accounts, and disable service
account key creation/upload. It refuses a `default` or any other non-v2 VPC; only the
dedicated custom-mode `workflow-v2-preview` network is admissible.

`deploy-preview.sh` accepts only role-specific Preview Artifact Registry `@sha256:` image
references and requires every
numeric Secret Manager version as an explicit input; it never resolves `latest`. It deploys
five logical roles: web, Orqaly API, Orqaly worker,
AxWise API, and the dedicated durable AxWise worker. Both workers run one always-CPU
instance at concurrency one. The Orqaly API receives the pinned Goose OAuth client,
Gemini and TypeSafe JEV configuration; only the AxWise worker receives the authority seal.
Capability work is explicitly enabled on both the Orqaly API and worker. AxWise
capability generators are explicitly disabled on the AxWise API and enabled on its
durable worker. Candidate and final runtime verification require these exact flags,
selected secret versions, and direct
accessor policies. The baseline updates only the Orqaly keys it owns; it preserves
independently managed evaluation, control-plane, coding, solution, and other extension
overlays instead of replacing the services' entire environment or secret map. Exact
verification still fails if an owned Goose, JEV, capability, database, Clerk, gateway, or
AxWise binding is missing or changed. The separate stateless
`axwise-v2-search-preview` discovery service must already
exist and its live Cloud Run `status.url` must be supplied as the canonical HTTPS
`AXWISE_SEARCH_URL`. Before mutation, deployment proves that URL belongs to the exact
Preview project/region service and that only `axwise-v2-worker-preview` can invoke it.
The worker candidate always receives that URL as `SEARXNG_URL` together with
`SEARXNG_AUTH_MODE=google_identity`; candidate and final runtime verification reject a
missing or changed binding, so a later full `--set-env-vars` deployment cannot silently
erase the fallback route. Every candidate deploys with zero traffic and explicit startup, readiness, and
liveness probes. The script verifies all five candidate specs, exact secret versions,
service/bucket/repository IAM, VPC/NAT routing, and image digests before promoting
backward-compatible Orqaly consumers, then the AxWise producer, and the browser last;
it then requires 100% traffic on the tested revisions.
Before its first mutation it validates the build attestation against both clean repository
HEADs, image digests, web origin and Clerk publishable-key version. It captures all five
effective traffic allocations and promotes exact candidate revision names. Existing
zero-percent tagged URLs are preserved but excluded from rollback allocation arguments.
Any promotion, final verification, or runtime-attestation failure restores all five
pre-cutover allocations; malformed or ambiguous positive traffic configurations fail
before mutation.
`resolve-preview-origins.sh` computes the three deterministic Cloud Run URLs from the
hard-pinned project number before any service exists. Build and deploy both require those
exact URLs, so a fresh project needs no placeholder service or unaudited bootstrap image.
The API runtime pins Clerk Development instance `ins_2vHl8PVNUNRJVv23OVqAcYOkVRK`;
release evidence must resolve the selected key versions to that exact instance, so the
separate Production Clerk instance is never an admissible Preview target.
AxWise API ingress is internal and IAM-authenticated; only the Preview Orqaly
API and worker service accounts receive `run.invoker`.

`build-preview-images.sh` refuses dirty source trees, builds only extracted tracked HEAD
archives (ignored/untracked files cannot enter), uses the dedicated
`workflow-v2-preview-build` service account, tags each image by the exact repository
commit (the web tag additionally binds its API origin and Clerk input hash), requires the
Clerk publishable-key version used by the web build,
and prints the three resolved digest references needed by `deploy-preview.sh`. The build
identity has only repository-scoped writer, the selected build-secret accessor, and log
writer permissions; Cloud Build's service agent may impersonate it, but the broad default
Cloud Build builder role is forbidden.

Build and runtime attestation outputs are required create-only paths outside both release
repositories. Build provenance downloads the exact Cloud Build storage-source generation,
compares its normalized file tree with the tracked HEAD archive, and verifies executed
steps/options, builder digests, substitutions, resulting image digest, and Artifact
Registry descriptor. Runtime attestation executes the exact committed verifier itself
with pinned images, origins and numeric secret versions; hashing an unvalidated service or
IAM document is not a passing release gate.
Runtime verification uses one bounded Cloud Asset IAM search at the organization root (or
project root when no organization exists), alongside live resource-policy checks. It fails
on unresolved custom/conditional access or principals outside the named v2 identities,
exact Google service agents, and explicit user entries in
`PREVIEW_ALLOWED_ADMIN_PRINCIPALS`.

The immutable database baseline remains
`database/workflow-v2/migrations/001_clean_workflow_v2.sql` with SHA-256
`05bc70f8c263bad766d2bbb251936d14a079678a5923870d13263305d139c75b`.
The exact additive release then applies `002_assistant_goal.sql` with SHA-256
`2bfac3fb1d342db03f55f157fb7f8be46e46fd7bb966c63e9f8d937640df38f5`
and `003_personal_tenant_jit.sql` with SHA-256
`95063a8aff45de731b6dbe472d7a413eab03a85a45df51947533968d05483d5a`,
then `004_assistant_retry_lineage.sql` with SHA-256
`753186fd0c43a0b41b6318582ba680dc150a213aa8b54e4d5a25fbd30c517823`,
then `005_assistant_turn_events.sql` with SHA-256
`6e2abfd9b07cc8360d485e0120e3be80fa8bc319940b3e16f08140a88179e6ee`,
then `006_assistant_turn_provenance.sql` with SHA-256
`1e64db4857083e85576b4b32bf6376f9e05fc482d88b1abb465eededbab3968e`,
then `007_assistant_grounded_sources_reason.sql` with SHA-256
`4ca1289eb45f75c877a3f6b2afaf3b0af0f8286fbc7a041e93643381d9aeccd5`.
`apply-preview-schema.sh` requires the numeric admin-password version and atomically
applies the baseline, all six additive migrations, release role bindings, database CONNECT
boundary, and in-DB checksum/source-commit markers. Additive migrations are recorded in
the ordered `workflow_v2_release.applied_additive_migrations` ledger; an exact existing
001, 001+002, or an exact ledger-backed intermediate database may advance atomically, while
partial, stale, or unknown states fail closed. Each row preserves its first-applied
commit/time separately from the latest exact release commit/time verification, so
re-attestation cannot erase initial migration provenance. Before accepting or
re-attesting any marked database, the rollout compares a
commit-pinned PostgreSQL 16 catalog fingerprint covering DDL, function bodies and ACLs,
RLS policies, constraints, indexes, triggers, role attributes/memberships, database ACLs,
role settings, and the pgcrypto dependency. This proves exact known upgrade states or the
full state instead of inferring migration identity from table names.
The fingerprint normalizes only the equivalent `postgres`/Cloud SQL `cloudsqladmin`
grantor identity; it retains the raw
PostgreSQL 16 membership options. Migration 003 explicitly sets the three narrow service
memberships to `INHERIT TRUE` because the runtime pools do not issue `SET ROLE`, while the
login roles themselves remain `NOINHERIT` and unprivileged. Apply the AxWise baseline with
its repository helper, then
run `verify-preview-database-boundaries.sh` with all five numeric login-password versions
and the exact AxWise commit. The verifier reads both markers and proves that each login can
connect only to its own database.
Both apply helpers first prove the target is truly fresh (apart from permitted
system/public extension objects), or an exact already-marked baseline with no extra user
schemas/tables. Exact baselines are adopted without mutation; partial, stale, or unknown
database contents fail closed.
Production provisioning is intentionally absent until Preview live-E2E gates pass.

The web and API reuse the existing AxWise Clerk Development instance; Orqaly does not
create a second Clerk application and does not use Clerk Organizations. On an authenticated
`POST /v2/session`, `003_personal_tenant_jit.sql` atomically resolves or creates one
Orqaly-owned personal tenant, one Clerk user binding, and the minimum default agent. The
operation is idempotent and concurrent first requests converge on the same tenant.
Migration 003 temporarily retains the old three-argument resolver as a personal-only
compatibility wrapper so revisions already draining during the expand/deploy rollout do
not fail; it rejects every non-null organization argument and delegates personal calls
to the same JIT function. A later contract migration may remove that signature after no
serving revision uses it.

Migration 004 adds immutable retry lineage to Assistant user turns. A retry is a new
turn linked by `retry_of_turn_id`; the unique tenant/thread/parent index permits only one
child attempt for a failed turn, so replaying the same retry request remains idempotent
while a later retry after another terminal failure extends the chain instead of rewriting
history.

`bootstrap-preview-tenant.sh` is now an optional deterministic preseed/verifier for a
known `CLERK_USER_ID`, not a normal sign-in requirement. It binds the personal Clerk
subject to a deterministic clean tenant and creates the minimum tenant-scoped agent
catalogue through the non-login `orqaly_bootstrap` role.
It verifies exact tenant, identity and agent rows on replay, refuses conflicts, targets
only `orqaly_v2_preview_001`, and does not alter the declarative schema checksum.
It requires a clean repository and verifies tracked HEAD bytes/checksums plus the applied
baseline and additive markers before seeding. The bootstrap accepts only the personal `CLERK_USER_ID`;
tenant/workspace ownership is app-owned and the nullable workflow organization owner
remains unset.
