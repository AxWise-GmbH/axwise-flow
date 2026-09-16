# Explicit capability work: local integration readiness

Status: local, default-disabled implementation. **Not deployable or approved for activation.** No database migration, provider activation, live source transmission, cloud deployment, or production acceptance was performed by this implementation lane.

## Implemented boundary

- `capability_work_v1` is an explicit profile on the existing run/stage/attempt/event/outbox ledger. The existing Goal/PRD graph is unchanged. It does not reopen a legacy Goal or replace its final output.
- A fresh owner action discloses the exact purpose-only Google scope-compilation request. It creates only compile scope and scope approval; transcript bytes, research, planning, PRD production and Gate 2 are not prerequisites or implicit successors.
- The owner approves the exact immutable compiled scope and explicitly confirms its compatibility with the selected capability. Scope approval enters `awaiting_capability_input`; it is not processing consent.
- Primary Analysis work admits only explicitly supplied transcripts, model-free, then allows explicit analysis of a selected completed same-run corpus. Admission never implies Google consent. Primary Simulation work does not accept transcript uploads; it starts with an explicit bounded scenario. An initially authorized Simulation-to-Analysis continuation can analyze only that same work item's completed simulation artifact. Synthetic provenance is preserved.
- A read-only prepare command resolves owned immutable sources and computes the final operation/stage/attempt identities. It returns the exact whitelisted provider data, including source-text hashes or deterministic synthetic participant/market/OCEAN plan and selected passages, separately from authority/limit metadata. It does not create consent, events, attempts, outbox work, or provider calls.
- Only a separate authenticated owner confirmation creates `processingConsent.granted=true`. Confirmation binds the complete typed input, owner, run, operation, scope, source identities and exact disclosure. Changed input or row version requires a new review. An uncertain submission is not automatically retried; the UI requires explicit refresh and a fresh review.
- A completion creates no successor. Paid failures create no automatic new attempt or copied consent. A later owner-confirmed capability may append one new bounded stage; previous artifacts remain immutable and discoverable. Token receipts remain unknown when unavailable, and known per-invocation model-call/token usage must fit the requested limits. This is not lifetime spend accounting or a guarantee of exactly-once provider billing.
- There are no cross-run imports. New uploads cannot impersonate synthetic origin or attach foreign-run provenance. Any future cross-run reuse needs an explicit owned immutable import/provenance protocol.

## Read and runtime protections

- `ORQALY_CAPABILITY_WORK_ENABLED` is unset/false by default. Only the exact string `true` enables the local API/worker path. This work did not change an environment variable. Disabled readiness does not require migration 025; enabled readiness fails without its required database objects/state and role separation.
- The route-local corpus parser has an exact 1,000,000-byte ceiling, with CORS, Clerk identity, the existing limiter and disabled-feature check before parsing. The global 192 KiB parser remains unchanged.
- Capability snapshot responses omit source-bearing attempt inputs. The parent stops polling in the explicit idle state, suppresses legacy scope/PRD controls for this profile, and does not automatically load capability artifact bodies or request a Markdown rendering of JSON results. Bodies are opened only by explicit owner actions.
- Direct artifact reads apply an owner predicate at the SQL row selection for capability runs, including compiled scope and uploaded/synthetic source artifacts. The predicate is parameterized and correlated on exact tenant/run; it does not load attempt bodies. Ordinary legacy artifact semantics are retained.
- Overview counts, workflow/result/notification metadata and activity metadata apply the same capability-only authenticated owner predicate before aggregation, ordering or limiting. These paths do not expose another same-tenant user's private capability purpose, IDs or activity, while ordinary legacy rows and default internal helper signatures retain their prior behavior.
- Worker completion reads fetch only the at-most-four explicitly selected grounding artifact IDs, not every prior artifact. Duplicate source records, changed content identities and unsupported known invocation receipts fail closed.
- Capability structure validation runs before public input/envelope unions can traverse accessors. Getter-based inputs are rejected without invoking their getters; plain legacy wire vectors remain unchanged. Browser code imports only the lightweight capability primitives, not server schemas or Node crypto. The explicit web Docker COPY list includes that lightweight file.

## Blocked database target and required design correction

Automatic review rejected creation of the local file `database/workflow-v2/migrations/025_explicit_capability_work.sql` because the proposal adds a persistent run-status constraint, a `SECURITY DEFINER` owner-command wrapper and function privileges. **The file is absent. No SQL was executed, and no workaround was used.** Explicit authorization is required before this migration/security boundary can be implemented, and any subsequent database application needs its own authorized target and release gates.

The initial proposal would add `awaiting_capability_input` and an API-only `orqaly.apply_capability_transition(uuid,uuid,jsonb)` wrapper that persists the immutable profile only on a fresh run and checks exact tenant/owner identity. That wrapper alone is insufficient: existing migration 001 grants generic `orqaly.apply_transition` to both API and worker, and the generic function does not enforce owner-only event types. A worker could therefore attempt to forge a capability owner event on an existing run through the old RPC.

**Open pre-release security blocker:** the approved migration design must add database enforcement that rejects bypass of new owner-only capability events/profile mutations through the generic RPC, or explicitly authorize the necessary old-RPC change. No local JavaScript test establishes that database guarantee. The current default-off flag must not be activated on the strength of a wrapper alone.

Required subsequent database gates, on a newly authorized isolated synthetic database:

1. Apply 001–024, preserve old rows/grants/RLS/function behavior, then apply the approved 025. Exact replay must be safe; unexpected status constraints, function bodies or grants must fail closed rather than silently changing authority.
2. Use distinct non-superuser/non-BYPASSRLS API, worker and identity logins. Prove same-user/tenant/run ownership, explicit owner-event acceptance only through its authorized boundary, and denial of worker/identity/PUBLIC owner commands.
3. Directly call the old generic RPC as worker with forged `CapabilityRunRequested`, `CapabilityScopeApproved`, `CapabilityActivityRequested`, profile mutations and attempts that bypass consent. All must be denied atomically with no rows/events/outbox/artifact changes.
4. Exercise actual scope approval, model-free admission, separately confirmed analysis/simulation, exact replay, stale review/version, lease recovery and stale-completion rejection. Confirm old outputs remain immutable and no paid automatic retry occurs.
5. Verify direct scope/source artifact URLs deny a same-tenant different user before returning any bytes, and exact selected grounding reads remain bounded.

## Verification and handoff

Local tests use only synthetic fixtures, mocked provider results and an explicit sockets/fetch block; HTTP parser tests use in-memory streams without a listening socket. New focused coverage includes owner/profile commands, read-only preparation, per-operation consent, stale/mismatched reviews, typed results/usage bounds, no automatic paid retry, capability preflight getter rejection, API-only repository wiring, direct artifact owner predicates, browser commands, parent integration and the dedicated UI's exact disclosure/state-reset behavior. Independent reviews covered the shared schemas, provider payload parity, browser plan/hash checks and direct owner/result guards.

Final test reports and source pins are recorded in `recovery-artifacts/` and the final handoff; they are local/offline proof only. The separate P1 Workflow/Outputs release candidate remains pinned to `eacb316c44182945e35820073e2edf4539cf3dbf` in its independent clean release clone. This capability integration must not be substituted into that candidate.

Before activation: resolve the database blocker, independently review and freeze the full candidate, rerun the complete release/retained UI suites and clean API/web build gates, verify the approved AxWise consent/first-claim/provider implementation and schema are deployed together, then obtain any required deployment/provider activation authority. Real selected-source acceptance still requires each run's explicit owner review and Google consent; no blanket private-data egress approval is inferred.
