# Task-to-Solution authoring — 5 September 2026

## Scope and customer outcome

This slice connects an explicit task instruction to an AxWise-prepared native n8n
draft, durable clarification, customer review and the existing executable Solution
lifecycle. It supports `webhook_transform_v1`, not arbitrary n8n nodes or software
development. Provider accounts, credentials, registration, SMS, CRM, schedules and
code-execution workers remain unavailable. Unsupported tasks must say why; they
must not become an unrelated example workflow.

```text
Existing task + selected Agent
  → explicit “Build workflow from this task” instruction
  → owner-scoped Build Request + pinned source/Agent profile
  → AxWise PrepareSolutionV1
      ├─ unsupported → explain missing capability; no substitute workflow
      ├─ needs_input → actual native draft + “Needs you”
      │                 → saved answer → same request, new input version
      └─ candidate → inspect/edit native draft → review exact saved version
  → create reviewed Solution (immutable initial snapshot, no execution)
  → approve deployment → real n8n test → activate → actual result/history
```

The native canvas is the real pinned n8n frontend. Before deployment it reads and
saves only the selected Orqaly Build Request, not a workflow inside an existing
customer Solution. Its asset source is resolved under the signed-in owner's scope.
An asset connection does not reserve a deployment environment or grant access to
upstream workflow, execution, credential or administration APIs.

The previously working contact Solution and original SMS research are preservation
checkpoints. The user separately approved one additional isolated preview
environment for the fresh-task acceptance test, with Cloud Run min 0/max 1, its own
database/user on the existing Cloud SQL instance, and separately scoped secrets.
There is no Supabase access/import or GitHub push in this release.

## Persistence and authority

- Additive Orqaly migration 013 stores Build Requests, design attempts and
  append-only events. Tenant and owner are both required by row-level policies.
- The source task and Agent profile are immutable snapshots. Old research approval
  remains reference context, never permission for deployment or external effects.
- AxWise migration 006 adds the typed preparation operation. The existing model
  stack interprets the scoped instruction and answers; no new provider or agent
  execution framework is introduced.
- Questions, answers, operation IDs, input hashes and leases survive restarts.
  Retry reuses ambiguous operation identity. Late results cannot overwrite a newer
  input version or native edit. Unknown field names are not invented.
- Native saves check version, checksum and prior draft hash. Review is invalidated
  by edits. Atomic handoff reserves the Build Request ID as Solution ID and inserts
  the exact reviewed native snapshot, hash, spec and pinned Agent identity.
- Deployment offers only an unassigned owner-scoped environment. The existing
  unique assignment constraint rejects concurrent attempts to reuse a slot.

## UX changes

The existing Assistant task card and Agent task list expose the explicit build
entry. Saved build cards, the Build Request page and Notifications project the same
durable state. The canvas and next action are adjacent on desktop; mobile includes
a direct, keyboard-accessible jump to the pending answer field.

The page states what is preparing, what needs the customer, what is saved, and what
is not runnable yet. Reconnect, stale-version, unsupported and failure states do
not imply success. Mapping illustrations are explicitly non-executing; only the
Solution's real n8n results are execution evidence. Existing design components,
typography and workspace navigation are retained.

## Verification before preview rollout

- 903 relevant Orqaly unit/component/contract tests passed at the first integrated
  checkpoint, including the new build HTTP boundary and native authoring target.
- A later selected regression run passed 777 tests across 51 files during final
  API/web rollout preparation. This is a selected suite, not a claim that every
  repository test or every live acceptance step passed.
- Real local PostgreSQL 17 + pinned n8n 2.37.10 lifecycle acceptance passed:
  deployment/test/activation, actual distinct outputs, persisted history, owner
  isolation, pause, idempotency, native revisions and immutable release snapshots.
- The build-specific real PostgreSQL acceptance passed with separate restricted
  API and worker pools: lease recovery, durable question/answer, exact handoff,
  stale-result rejection and unchanged historical task hashes. Its model and
  Agent are fixtures; it is not the live-model/browser acceptance.
- Synthetic UI-only desktop 1280px and mobile 390px checks passed without horizontal
  overflow, unlabelled visible fields or application error overlays. These checks
  intentionally did not simulate proof of native execution.

## Preview acceptance

**The fresh-task webhook journey passed end to end in isolated environment 002:**
live authoring, clarification, native editing, exact reviewed handoff, approved
deployment, real test, activation, production call, pause rejection and persisted
history. This completes P4 for `webhook_transform_v1`, not the broader capabilities
in P5. The evidence below comes from the fresh Solution, not older executions.

### Signed-in customer journey and independent database proof

The real preview browser created Build Request
`8b606adc-91ba-46e5-86da-ece609df9c7d` from the fresh task in thread
`c2ccb4ca-d282-43c5-a429-4d718061297d`, source run
`c1cb54ec-00f5-5106-b7ff-16acf5640c07`, using B2B Ops Agent
`1155b480-afad-471f-aa05-ffa4046b4168`. This was a live `PrepareSolutionV1`
operation, not the local test's Agent/model fixtures.

The browser showed the actual native three-node workflow before deployment.
The live model requested the missing output field names. That same persisted
question appeared in Notifications and linked back to the same Build Request.
The customer-side answer supplied `customer_name` for the trimmed name and
`email` for the lowercased email. The next design attempt included that answer
and produced a complete candidate. Native layout/edit saves survived reload;
editing after review invalidated that review before a new review and handoff.

Two independent read-only audits verified the persisted records under the
existing restricted API role and exact tenant/owner scope. The first observed
the concurrent post-review edit as `draft`, row version 7/input version 5; it
correctly did **not** report the old review as current. The second verified the
final frozen Build Request at row version 9/input version 5:

| Checkpoint     | Verified persisted evidence                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| First design   | Operation `d83de782-a560-53bf-8ba7-e5845ec65e06`, input version 1, completed with `needs_input`                                   |
| Clarification  | Question `output_field_names`; answer event `7a2b7212-6f58-4192-9697-f689ebd8f265`, input version 3                               |
| Resumed design | Operation `df1311c6-9106-511c-b0dd-dc223199e16a`, input version 3, completed with `candidate` and the saved answer                |
| Native editing | Three persisted native saves; final input version 5; changed content invalidated review                                           |
| Exact handoff  | Event `c30a10cf-a652-496e-a3c0-23bd95485a99`; Build Request and Solution share ID `8b606adc-91ba-46e5-86da-ece609df9c7d`          |
| Frozen state   | Build Request `completed`; resulting Solution `draft`; no pending questions; exact reviewed workflow and Agent snapshot preserved |
| Isolation      | Another tenant and another owner cannot read the Build Request, attempts or events                                                |

The final workflow SHA-256 is
`b115e3ae3bca9084d3ef2115764ecbeeaa2d7757a68df571e8aa526275f7ab78`.
The first operation input hash is
`e2b6db718de9e8d23d4222e1e4fca517ad062103b661d9acaae724c463fd4872`;
the resumed operation input hash is
`d2309e69a47eb5e1189fef4e56acc31c48b3643ec0eaa7c37eb7569c39001517`.
Both hashes were recomputed from their stored typed inputs and matched the
operation ID, Build Request ID, input version, source, Agent and answer records.
Worker claim counts include polling and are not counts of model generations.

Source task hash:
`11a60f72fe2fe0f2ddc6adf04cc983370fccbb7b2b2519c6ed3c275ad3ab80ca`.
Pinned context hash:
`fb7291f2530f372f190ad950cd9dbfee722115a9c1ce5ba8fc1943f8228db6fc`.
The Agent profile is version 1, snapshot hash
`c91f1d6fcb52f0ef5f6d29b14fb2d62df3d2aece51edaae715ae030376ecf4b6`,
with profile reference `61b409b3-1862-40f3-afa2-77849fa22a9d` retained through
handoff. The audit proves these immutable pins and operation linkages; it does
not re-read the separate AxWise database or independently attest browser pixels.
Native rendering and interaction were verified in the signed-in browser journey.

### Authoring checkpoint and remaining capability limits

- At the initial authoring checkpoint, environment 002 setup paused for separate
  approval to remove PUBLIC `CONNECT` on existing database 001. That exact approval
  was subsequently received and applied, preserving owner permissions and PUBLIC
  `TEMP`. Both owners can connect to their own database, and both cross-database
  connections fail with PostgreSQL `42501`. The new environment's ACL is also
  verified as its actual owner; an administrative-role warning/no-op is not accepted
  as evidence of a successful revoke.
- The subsequent signed-in browser journey approved this exact deployment, tested
  it with Ada, activated it and made a distinct Grace production call. Actual
  receipts and the pause/reload check are recorded below.
- Native authentication could exceed the earlier 30-second timeout after a
  scale-to-zero cold start. Fix `cf9a0214` allows a bounded 60-second initial login
  while keeping ordinary reads at 30 seconds. At the authoring checkpoint, that
  code was deployed with API revision `orqaly-v2-api-preview-native-bd6c3de5`; a fresh deliberately induced
  slow cold start has not been tested, so its timing behavior is not independently
  live-verified. Browser reconnect successfully loaded the native graph during
  authoring and after the reviewed handoff.
- Commit `bd6c3de5` adds read-only native viewing of a frozen, undeployed Solution
  when no deployment slot is available. It resolves only the same owner's frontend
  asset binding; edit/revision/deployed sessions still require their normal
  bindings. It also disables deployment without an available environment, clarifies
  the completed handoff and cold-start text, and avoids a later loading timeout
  overwriting an existing editor error. At the authoring checkpoint, the API
  fallback was deployed at 100% traffic and live-verified: signed-in Reconnect on the new frozen Solution
  rendered the actual native three-node graph despite no available deployment
  environment. The corresponding web revision was also promoted to 100% traffic with
  successful readiness/root checks. After both rollouts, a signed-in reload
  verified the "No isolated environment" message, disabled "Approve & deploy"
  control and actual native graph. Zoom to Fit exposed all three nodes in the
  captured view. No application console errors appeared; the only console
  noise was the pre-existing browser-extension `NoListener` error.
- Registration, verified provider connections, secure credential collection,
  provider-specific actions, arbitrary n8n nodes and software-development execution
  remain outside this webhook-only release. Information questions are live;
  other "Needs you" categories are not implicitly implemented by this proof.
- Arbitrary free-form Assistant messages do not yet automatically route into
  Build Requests. The implemented journey starts with the explicit build action
  on the existing task/Agent UI and a separate build instruction. General-purpose
  chat-intent routing remains an additional implementation step.

### Preservation checkpoints

The original SMS research final artifact
`84a1cd26-89ff-57fc-aaf6-8cde86131f22` retains its earlier attested hash
`3d88e4bd299f1a1f3560aa705664fb46f9bf1cb93463c86522cc0c61feeecf5a`.
Its source request hash
`3b12b341ca9ea2c3b5605eee4f1d91986422cbfd32159ccd709e35c4bb7814c1`
was captured separately read-only at `2026-09-05T16:43:56.392Z` before this fresh
acceptance and remains unchanged. This request checkpoint is pre-acceptance,
not a retroactively claimed pre-release baseline.

Old Solution `2031decc-b21e-48b5-9bd5-3ed3d4dfd024` remains active on v3,
revision `338f2717-c2ee-40e4-bb21-f811be12386f`, hash
`cc0090502d6e4c1a96371a16890c7ded3bd7d5a727e7d66ace0cc7637e3fb499`.
Its immutable v1, rejected v2, approved/deployed/tested v3 and original six history
rows all pass the earlier fixed checks: five successful receipts (execution IDs
1–5) and one pre-existing unknown outcome. The unknown outcome remains unknown.
Neither historical research authority nor environment 001 was repurposed to
execute the fresh Build Request.

### Final live execution acceptance

The same frozen Build Request and Solution ID
`8b606adc-91ba-46e5-86da-ece609df9c7d` now runs the unchanged reviewed hash
`b115e3ae3bca9084d3ef2115764ecbeeaa2d7757a68df571e8aa526275f7ab78`
in environment 002. No historical research approval was repurposed. The explicit
Build Request remains the separate source of build authority.

The operator used the signed-in customer controls in sequence: **Approve & deploy
workflow → Test workflow → Activate production endpoint → production call**.
Activation was unavailable until the successful test.

| Actual call | Input                                            | Returned output                                         | Evidence                                    |
| ----------- | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| Test        | `{"name":" Ada ","email":"ADA@EXAMPLE.COM"}`     | `{"email":"ada@example.com","customer_name":"Ada"}`     | n8n execution `1`; succeeded Orqaly receipt |
| Production  | `{"name":" Grace ","email":"GRACE@EXAMPLE.COM"}` | `{"email":"grace@example.com","customer_name":"Grace"}` | n8n execution `2`; succeeded Orqaly receipt |

The independent provider audit matched published workflow `3eAscwRxWyn2dxYl`,
version `3ab89c04-9163-4adb-821f-562a43ff3841`, and its approved graph/hash. Both
execution IDs matched that workflow and version. The workflow deliberately uses
`saveDataSuccessExecution=none` and `saveDataErrorExecution=none`: n8n's remaining
rows were soft-deleted pending pruning with stale running/finished fields. They
are **not** independent retained final-success records. The audit explicitly
reports `providerFinalSuccessRecordsVerified: false`; Orqaly's durable response
receipts are the success/output history. Retention was not changed for the test.

The browser then opened a second tab while active, paused production in the main
tab, and submitted a fresh Bob payload from the stale tab's still-enabled button.
The server rejected it with “Activate this solution before using its production
endpoint”. A post-reactivation read-only audit confirmed exactly two invocation
rows, with no Bob invocation or third invocation receipt. The provider audit reads
only the explicit execution IDs above, not a census of every provider row.
Reloading the main page retained
both successful history entries. The preview is left **active**. Pause blocks new
production calls, not already-running calls or explicit authorized tests.

The strict final audit also rechecked source/Agent pins, the question/answer and
native-save history, exact deployment approval and test-before-production order,
and preservation of the old Solution's six entries and original SMS hashes.

### Final rollout checkpoint

| Component | Exact release reference                                                                               | Verified state                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| API       | Revision `orqaly-v2-api-preview-runtime-3a735758`; Cloud Build `783b0d10-ef8e-4314-bca9-656da03a8ae0` | 100% traffic; readiness HTTP 200; both approved 001/002 bindings; live deploy/test/production/pause verified |
| Web       | Revision `orqaly-v2-web-preview-ux-bd6c3de5`; Cloud Build `2f49c880-f9da-4481-9a57-05e8ea8aac79`      | Unchanged; native viewer and customer controls live; history survives reload                                 |
| n8n 002   | Revision `orqaly-solution-n8n-preview-002-00001-ng6`; pinned n8n `2.37.10`                            | Private service; authenticated settings HTTP 200, anonymous HTTP 403; actual executions 1 and 2              |

API image digest:
`e0c92dd2a6a37fc260604be741dd21e198290b48a7b4788b3e2b10f830884c74`.
Web image digest:
`d80d1c00c8ed1936af754b6d8beb7846d562af7f234ae3e20f86cf453bbaa096`.
n8n image digest:
`848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`.

Environment 002 uses a dedicated service account, database/login and secret set,
Cloud Run min 0/max 1, concurrency 1 and a 1 CPU/1 GiB limit. Its only service-level
`roles/run.invoker` binding is the existing Orqaly API identity. The existing 001 environment records and
signing key were preserved. The 002 management API key has a 30-day expiry;
automatic key renewal is not implemented. This is an isolated preview slot for
one Solution, not a claim of an unbounded production provisioning platform.
Customer endpoint access currently requires an authenticated Orqaly session;
long-lived application keys and anonymous/public customer webhooks are not provided.

Cold-start fixes allow 60 seconds for management GET verification; management
writes remain at 15 seconds and webhook POSTs at 45 seconds, without automatic
write retries. Deployment status/reconciliation share a 240-second window and
invocation status uses 150 seconds, avoiding premature unknown status while those
bounded reads are still pending. Automated deferred-read tests passed; no
deliberately induced slow-cold-start latency/SLA claim is made. The selected final
workflow/GCP suite passed 796 tests across 52 files. Provider/audit tests passed
43 tests across two files; these counts are not the entire repository suite.

One nonblocking wording follow-up remains: for a draft that has an available
deployment slot, the current UI calls it an "Assigned environment" even though
reservation occurs only when deployment is approved. "Available environment"
would be more precise. The fresh Solution is now genuinely deployed to 002;
the earlier no-slot native viewing fallback did not reserve the older runtime.

### Reproduce the read-only audit

Use the existing authorized Google login, leave local port 19485 free, and run
from the repository:

```sh
node scripts/task-to-solution-preview-evidence.mjs 8b606adc-91ba-46e5-86da-ece609df9c7d
```

The script reads only the existing API database secret version 2 into process
memory, owns and closes its local proxy, and rolls back every read-only
repeatable-read transaction. Output contains safe IDs/hashes and explicitly
states the verified release boundary. It requires exactly one explicit new Build
Request ID and an active Solution. Never paste credentials
into a command, environment variable, log or chat.

Full mode requires the same-ID Solution in
environment 002 and actual distinct test/production receipts tied to the exact
workflow hash and provider version. It does not execute workflows itself. The
audit's 24 unit/negative tests pass; those tests use separate synthetic records
and are not part of the live proof above.

`scripts/solution-preview-002-provider-evidence.mjs` adds independent read-only
checks of the exact published provider workflow/version and execution IDs above.
It explicitly distinguishes matched execution metadata from retained final-success
records. Its 19 unit/negative tests pass. Do not loosen save-none retention or
invoke additional workflows merely to populate provider history.

### Matched production build gate

The first web container build correctly failed because its explicit browser-safe
shared file list omitted the new dependency-free input guard. The list and a
packaging regression test now include it; the full server contract tree is not
copied into the web build.

The initial local 1,124,849-byte result omitted production authentication settings
and is **not** a production size comparison. An independent comparison used
Node 22.23.2, identical dependencies/lockfile and the same production public Clerk
key/API URL: baseline `db1cb806` is 1,155,341 bytes (23 chunks), and task authoring
`cdc93284` is 1,178,362 bytes (29 chunks), matching Cloud Build exactly. The increase
is 23,021 bytes (1.993%), with only 1,777 added to the main entry; the new authoring
page is lazy-loaded. The JavaScript ceiling is explicitly raised by 20,000 bytes
to 1,180,000. All retained-route and forbidden-runtime checks remain unchanged.

The final deployed `bd6c3de5` web build is 1,178,603 bytes across 29 chunks and passes
that same explicitly approved 1,180,000-byte ceiling. The extra 241 bytes versus
the matched `cdc93284` feature build above are the final UX fixes, not another
budget increase.
