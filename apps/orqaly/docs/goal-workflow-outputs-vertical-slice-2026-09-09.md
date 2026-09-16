# Selected-Goal Workflow & Outputs — local P1 slice

This is a local-only change based on `2945747adbfa3abcf180abf76553c96b7466c8d7`, on branch `codex/workflow-outputs-sep9`. It does not implement a global workflow/output catalog or alter execution authority.

## Read boundary

`GET /v2/workflow-views/goal-runs/:runId` inherits the existing `/v2` Clerk, browser-origin, and per-identity rate-limit middleware. It accepts a UUID path and no query options. Successful and service-error responses are `Cache-Control: no-store`.

The server resolves the personal tenant and explicitly filters the requested run by both tenant and owner user. A miss returns the same `RUN_NOT_FOUND` response for another owner, another tenant, or an unknown run. Caller-supplied tenant/owner/limit options are rejected. Legacy workflow and artifact read policies are unchanged.

Identity resolution is separately contained in an identity-pool `BEGIN READ ONLY` transaction. The existing identity role has the resolver EXECUTE grant, not a direct binding-table SELECT grant. The full migration `003_personal_tenant_jit.sql` was inspected: `ensure_personal_tenant` first SELECTs the binding and active tenant; only `IF NOT FOUND` enters the advisory-lock/provisioning branch. Existing users therefore use the SELECT-only branch and return `created: false`. The new wrapper rejects `created: true`, rolls back `25006` (read-only violation) or `42501` (inactive/denied identity), and returns an unbound-identity 403. It never falls back to ordinary JIT resolution. Existing session and legacy identity behavior remains unchanged. No grants or migrations are added.

The metadata reader uses the API pool only, in `REPEATABLE READ READ ONLY`, with the existing transaction-local tenant RLS setting. It performs exactly three metadata SELECTs for an owned run, or one for a miss, in addition to transaction control and the separate identity lookup:

1. One owned run and its final immutable artifact reference.
2. At most 64 stages, plus one overflow sentinel, with current output references.
3. One batched metadata query for at most 65 deduplicated referenced outputs, with at most 128 ordered lineage IDs per output plus one overflow sentinel.

Every metadata SELECT repeats explicit owner and tenant scope. Existing lineage foreign keys bind both target and source artifacts to the same tenant/run. Driver-row tenant/run mismatches and joined artifact pointer mismatches fail closed. Artifact ID/hash/kind conflicts, duplicate identities, malformed lineage, and inconsistent coverage also fail closed.

The response reuses `projectGoalWork` and adds a small shared, strict DTO validator with JSDoc types; the browser does not import the full command/authority schema runtime. Artifact bodies, attempt inputs, leases, transcripts, dependencies, approvals, and history are not fetched by the endpoint. The last five collections/content categories have explicit `not_loaded` coverage. `coverage.outputs.loaded` counts loaded immutable references, not metadata rows; missing metadata keeps nullable fields unknown and `complete: false`. Stage overflow also marks output coverage partial. Per-output lineage overflow is named explicitly. Unreferenced historical artifacts are outside this view.

## UI boundary

The existing MUI primitives and theme tokens provide a compact, scrollable selected-Goal panel adjacent to run status. No UI toolkit is installed or migrated. It shows recorded stage status and immutable output identities/lineage, and distinguishes empty, partial, loading, and unavailable states. Recorded completion is not described as verified business value.

There is no new timer or polling engine. Existing selected-Goal polls supply a stable primitive refresh key from run metadata and at most 120 public stage identity/version/status/input-hash/output-reference tuples. Stage-only transitions therefore refresh this read even when `run.rowVersion` is unchanged; identical snapshots do not add metadata requests. The key never reads artifact bodies, attempts, or history. A manual metadata retry is available on failure. Run, auth/session, client, selection-epoch, and metadata-key guards immediately hide stale results and reject late responses. Old GETs are aborted on cleanup. Output content is loaded only when explicitly opened, using the existing artifact client method and exact run/ID/hash/kind checks. Markdown additionally uses the existing metadata-returning Markdown loader, requires the exact `sha256-<artifactHash>` ETag, and requires the Markdown bytes to agree with the JSON artifact record. This is an API/immutable-ledger identity check, not a new client-side digest calculation. Late content responses cannot reappear across context changes.

Goal commands, approval/revision handlers, worker execution, and Assistant send/resume/retry/cancel and polling are unchanged.

## Local verification

- Full `test:workflow-v2:release` filter set: 1,975 passed, zero failed, 16 skipped across 125 files. The 16 skipped optional real n8n/coding-runtime cases exactly match the previous baseline's skipped cases; none are new skips. The candidate adds 120 tests to the baseline's 1,855 passing tests.
- Retained UI suite: 442/442 passed across the same 38 files as the prior retained-UI report.
- Initial focused run: 344/344 passed. The subsequent identity-driver-error, Markdown ETag/byte, and stage-only refresh regressions are included in the final release run. The stage refresh integration exercises the existing two-second Goal poll with unchanged run version, updated stage version/status/output, identical-snapshot request deduplication, and no output-body or command calls.
- A final formatting-only wrap in the refresh helper was followed by a 72/72 focused rerun on the final source bytes. Independent read-only review found the stage-only refresh issue, then re-reviewed the fix with no remaining findings and independently passed 131/131 API/UI/shared/packaging/view-model checks offline.
- All changed/new JavaScript and JSX files pass ESLint; all new source/test files pass Prettier; `git diff --check` passes.
- Final release report: `/private/tmp/orqanix-workflow-outputs-sep9.2EtUjA/release-tests-stage-refresh.json`, SHA-256 `8ff288df13015dfcbe3913539f480f875d138af8ce18ae1987e5b18a101bf5ed`.
- Retained UI report: `/private/tmp/orqanix-workflow-outputs-sep9.2EtUjA/retained-ui-tests-stage-refresh.json`, SHA-256 `7237f3bb7f2334a9dd4eb6a4baef0b847c80e10a8244a9e47e28c26c9fde4164`.
- Tests used existing dependencies from `/private/tmp/orqanix-workflow-artifacts-sep9/node_modules` through links in an owned local `node_modules` directory. Tool caches are local to this new clone; existing dependencies were not edited or installed.
- Unit/jsdom runners used a minimal `env -i`, Vite `envDir: false`, and a preload that denies socket connections and unmocked fetch. No environment files, live credentials, providers, browser, or cloud were used.

## Isolated browser verification

The parent task verified the final component in an owned loopback-only browser fixture with synthetic metadata/content. Default, partial, unavailable/manual-retry, and explicit-output states rendered correctly without console errors. Metadata browsing made no artifact-body requests. Opening Markdown made exactly the expected JSON and ETag-bound Markdown reads. An unchanged run row version with a changed stage refresh key caused exactly one additional metadata request, cleared the old opened content, and displayed the new output reference without additional body reads. This is fixture UI verification, not live Clerk/API acceptance. The owned browser tab was closed and fixture server stopped.

Final browser receipt: `/private/tmp/orqanix-goal-outputs-browser-sep9.TjmAGe/verification-stage-refresh.json`, SHA-256 `09e40911f248d3ef7731fbac5242e80f4c7b5cf88f054402399888f5fe701f43`. It binds component SHA-256 `45c718a3967fe3fdaf25cdeb93d18f34aca46e6faea302a377683907430d9981`, parent surface `5c0403d37590ffd75b3965b4cea2dc0d0efc37a193689d3a20f0db0d257e11dd`, and refresh helper `f833a21df514dda36d57b3f5361f1ef75958e85afe4cdc0aad50e4adb89c848a`.

## Disposable real PostgreSQL gate

After separate authorization for a new local database only, `scripts/workflow-v2-goal-view-postgres.mjs` passed 25/25 checks against PostgreSQL 16.15 with the exact unchanged migrations 001–024. It used an already-cached image, one newly owned bind directory, and `127.0.0.1:56391`. Separate non-superuser/non-BYPASSRLS API and identity login roles exercised actual RLS, same-tenant owner filtering, fixed query counts, stage/output/lineage bounds, composite lineage foreign keys, and concurrent repeatable-read behavior. It also proved that existing bound users succeed through the SELECT-first READ ONLY identity path, while missing/suspended identities return 403 without new tenant/binding/agent rows. Read operations left fixture counts unchanged; no events or outbox work were created.

The superuser was limited to migration, fixture/role setup, and audit. A connection guard permitted only the new loopback test port and denied HTTP/provider calls. The exact container was stopped with exit 0 and removed, its sole owned data directory was removed, and listener/container absence was verified. No existing container, image, volume, database, or live role was changed.

Receipt: `/private/tmp/orqanix-workflow-outputs-pg-sep9.254zSj/receipt.json`, SHA-256 `22c25ac1db140b74ce4f2798b7022e8cd9bdcd457d10221e5605f94b48cf9795`. Scope, source/migration hashes, checks, cleanup evidence, and retained log hashes are recorded there. This is local PostgreSQL evidence, not a Cloud SQL or deployed-service claim.

## API/web build-input closure

The local Docker COPY/`.gcloudignore` audit compares the candidate to recorded deployed source commits: API `ad022ad8e8c6dca2b2331bf5d0fa718f94e82e9b` and web `f5be712ee8afb12e2214764a072caff2a7a269f6`. It does not re-query cloud state.

- API COPY closure: 210 → 222 files, 17 added/modified paths, no package/lock or build-control changes. In addition to P1 files, this includes the already-local baseline's worker-engine/worker-read changes and shared `workflow-view.js` projection/tests; those are not newly authored by this slice. The service Dockerfile already copies the complete reviewed server/shared directories.
- Web COPY closure: 2,170 → 2,174 files, eight added/modified source paths, plus the explicit `Dockerfile.web` COPY-list addition for `goal-workflow-view-contract.js`. Both packaging tests were updated to require that exact browser-safe file; no full server contract graph or package/lock change was introduced.
- New API service/repository, the reused Goal projection, the shared DTO, and the new UI/client paths are included by both their Docker COPY closure and the existing upload allowlist. Tests copied by existing whole-directory COPY commands are counted honestly in these totals; they are not asserted to be runtime imports.

Detailed build-input audit: `/private/tmp/orqanix-workflow-outputs-sep9.2EtUjA/docker-copy-closure.json`. The release operator must independently recheck the clean committed-source export before image build. Production bundle and deployed endpoint/UI acceptance remain separate release work. This task has made no push, production migration, or deployment.
