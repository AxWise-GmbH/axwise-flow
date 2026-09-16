# n8n customer-control completion — 7 September 2026

## Latest verified product checkpoint (14:45 UTC)

The original chat and native n8n side panel complete the preview acceptance
journey: change the same draft through chat, save a native edit, review, approve,
deploy inactive and run all three agreed cases in actual n8n. The candidate is
**ready to activate**, not activated. Live v1 and its paused schedule are unchanged.
No customer/provider key, real email/SMS delivery or Supabase was used.

API and worker are both at 100% on `controls-e6bd4f0d`, from commit
`e6bd4f0da3866c31a79a22a45e25c8433a045e69` and Cloud Build
`dba48679-224b-42eb-8ec2-0d9e74881484`. Image:
`sha256:f4afd2c9ffaad01bc5a6f3f3dcef39dbc3b8ffa85d028f6c56cdeeecb8be019a`.
Web remains on `f5be712e`; configuration, IAM, capacities, old tags and environment
binding2 were preserved. Exact build and rollout receipts are in
`/private/tmp/orqaly-controls-e6bd4f0d.ixrSjx`.

Final browser testing found and fixed an additional real defect: conversation
selection was restricted to editable rows, preventing even questions about a
tested candidate. Exact owner-scoped selected-version reads are now independent
of edit authority. Ask and auto-routed questions work on frozen versions; explicit
changes, proposal application and setup continuation cannot mutate them. The
assistant directs the customer to **Fix this version** for an unapproved revision
of the same workflow. Existing approval, tests and deployment are not inherited
by that new revision. No schema or frontend change was needed for this correction.

Final request `088306d8-fda3-4a69-96ca-0c2ed600ab82` was submitted in the original
chat and completed at 14:43:38 UTC as `auto` → `ask`. Its three bullets correctly
named **Fix this version**, **Test all agreed cases** and **Activate v2**, rather
than directing the customer to an internal webhook. This is guidance, not an
executed edit/test/activation. Editing creates a new unapproved revision, which
must pass its own review, approval and tests before that changed version goes live.

The independent read-only audit at 14:45:06 UTC verified the exact new worker
completion, selected v2 row11 and source/spec hashes, unchanged executions11/12/13,
their recomputed acceptance coverage and cleanup, live v1 row6 and paused schedule
row4. It confirmed no new source build, workflow, revision or separate chat. The
selected run-data checkbox stayed off. The model received current status and
coverage metadata, not raw invocation input/output or credentials. Browser review
confirmed the actual five-node n8n canvas, an empty composer and no captured
JavaScript errors. The viewport override was reset and the preview tab retained.

Verification: 109 focused conversation/control tests passed; the post-fix broader
suite passed 96 files / 1,582 tests with 16 explicit environment-gated skips. The
88 preview-operator tests and 58 final-audit guard tests also passed. Earlier
missing-file gate and production owned-handler limitations below still apply;
this checkpoint is not proof of real external-provider delivery or production
error-handler readiness.

The checkpoints below retain their historical status. In particular, the b325
rollout was completed before the e6bd selection fix; its earlier pending notes
are not the current deployment state.

## Earlier verified product checkpoint (13:34 UTC)

The original chat → same v2 draft → native edit → review → approval → inactive
deployment → real n8n acceptance flow passed on GCP. Both API and worker now use
`controls-670f82d4`, image `sha256:bac5988ce8c320e749dc4f7cb307196f9693f7fec07bac98da18599886b3f020`;
web stays on the verified `f5be712e` build. Configuration, IAM, capacities and
environment binding2 are unchanged. The successor worker passed the ordinary
zero-error gate and completed original-chat request
`c355ac14-e58e-45e2-8019-f3779a063c6f` on that exact worker revision.

| Candidate case | Actual n8n execution | Verified response |
|---|---|---|
| `padded-text` | `11` | HTTP200, `{"text":"preview schedule"}` |
| `missing-text` | `12` | HTTP400, `{"error":"text must be a string"}` |
| `numeric-text` | `13` | HTTP400, the same explicit error |

These are actual executions of the approved customer candidate, not substituted
fixture executions. The UI shows3/3 cases passed and **Ready to activate**.
Activation was not clicked.
The independent read-only audit at13:34:24Z verified all three stored inputs,
outputs, exact-candidate hashes, real distinct execution IDs, recomputed
acceptance and removed temporary test artifacts. V2 is ready,row11, deployed
inactive; v1 remains active,row6, with its original hash and null revision pointer.
Its schedule remains paused,row4. There is still one revision for this original
build, no new source build or chat, and only the explicitly verified Ask turn was
added after the last source-edit request. This audit uses canonical execution
receipts; it does not claim independent provider-inventory inspection.

The acceptance is scoped to Solution
`637fcfaf-3864-468b-ad36-47337b80c484`, its existing v2 revision
`c965af4f-b784-402b-b65f-585a71b43124`, and approved workflow hash
`74f388ed7bd16fd0d6f4ae4b8cd2e8b998a433fe38e59c4539367475d8c187e0`.
The active v1 hash remains
`aa8f04bbc9074dae28333eb49e6c81648311e6c5906078d9aa337f676c849ca6`.
No email, provider delivery, production activation or additional scheduled run
is proved or authorized by these three tests.

One further UX defect was found: the model's completed Ask recommended calling
the internal draft webhook externally instead of the visible Orqaly test controls.
Completion is not proof that advice is correct. The Orqaly-only correction now
supplies the selected version's real state, receipt-derived coverage and the exact
review/approve/deploy/test/activate controls to Ask and auto routing. It omits
native webhook paths from explanation context only, preserves original owner
text and executable graph bytes, and never treats advice as permission.84 focused
tests pass; this final guidance correction is awaiting its own backend rollout.

### Final guidance correction — source `b325b33d` (verification pending)

The frozen correction is
`b325b33dfe07e99c3e3e61a67f801e782edfaaa7`. It changes the Orqaly conversation
service and adds a small server-owned control-state helper. Both Ask and automatic
routing still use the deployed `AssistantTurnV1` wire contract: no AxWise image,
model call, schema migration, frontend or executable workflow change is required
for this correction.

The model now receives the selected version's actual status/version, available
review evidence, recorded deployment presence, exact-version acceptance coverage
and unresolved-result state. A selected draft no longer borrows the live
Solution's status. Deployment presence is not labelled provider activation or
unpublication. Advice names the existing controls: **Review changes → Approve vN
→ Deploy approved version → Test all agreed cases**, with **Activate vN** a
separate decision after verified coverage and runtime/setup checks. Unknown
outcomes never imply permission for a fresh retry. Saved keys, review, deployment
and a test timestamp alone are not acceptance proof.

Only native webhook paths are removed from explanation/routing node parameters;
canonical graph/spec bytes and outbound destination evidence are preserved.
Original owner text is JSON-delimited, not silently rewritten. The guidance says
that native paths are internal managed transport, not customer invocation URLs;
external applications must use the separately configured Orqaly application
access endpoint and key for an active release. These are explanation rules, not
new permissions or a replacement for server-side approval gates.

Local verification passed84 tests across the control-state, conversation,
setup-resume and HTTP suites; formatting and ESLint passed. Cases cover unknown
state, selected drafts, failed reviews, approval, deployment, missing coverage,
uncertain outcomes, paused/live states, exact UI labels, original text retention,
path omission and unchanged executable bytes.

Cloud Build `1a03ff8a-7e07-408a-b478-3ec677b88977` produced
`sha256:3cb5b70b9532d164b038bf6ff61664f26549f401fa664d1fe689377b008fabc3`.
The worker candidate `orqaly-v2-worker-preview-controls-b325b33d` was deployed
without traffic. Stage recording stopped because the startup log was not yet
visible; the deployment was not repeated. A separate read-only recorder is being
used to recheck the exact existing candidate against the original zero-error
log gate, image/configuration/IAM, old tags,670 canonical traffic and retained web.
Its original helper, source manifest and baseline evidence remain unchanged.

**Pending at this documentation checkpoint:** successful stage recording,
worker/API promotion receipts, then one completed read-only explanation from the
exact new worker and signed-in review of its actual next-step advice. Neither
readiness nor source/unit tests establish that the final advice was correct in
the live product. This document does not yet claim b325 is promoted or that final
guidance is live-verified. Activation of customer v2 remains unperformed.

## Earlier live checkpoint (13:08 UTC)

The original chat and the real native n8n side panel are deployed. A chat request
updated the existing v2, and a native edit renamed its processing node to
`Trim text`; both changes remain in that same draft. Fresh request
`b94c1d46-35b2-48f4-a880-7665dc28bfb0` verified the corrected auto-route → design
handoff on backend `c6d0b61f`, with distinct persisted operation and attempt IDs.
The sharing checkbox is off and explicitly concerns selected run data, not edit
permission. The live browser check captured no JavaScript errors.
At390px, the actual deployed page had390px document width and one composer;
opening/closing the workflow preserved an unsent message. The synthetic unsent
text was cleared and the temporary viewport override reset after the check.

Active API/worker traffic remains on `c6d0b61f`; web remains on `f5be712e`.
Backend `3ea1732f` was built and staged for worker only, but **not promoted**:
one pre-readiness iteration error and subsequent shutdown errors failed the
release gate. Inspection found that shutdown closed the database pool while the
queue loop was still running. Startup/shutdown lifecycle correction is in
progress. This failed deployment evidence is retained, not reclassified as a
successful worker execution.

The exact GCP v2 still needs review → approval → inactive deployment → its three
recorded acceptance tests. Active v1 and its paused schedule are unchanged.
Local real-n8n tests passed for the intended 200/400/400 cases; that is not yet
customer-candidate execution proof on GCP.

The separate synthetic preview003 error-handler runtime probe **passed** after
an explicitly reviewed recovery from the editor-only catalog authentication
stop. Failed parent execution9 triggered successful handler execution10 with
the matching parent ID. Exactly two temporary workflows were created and then
removed; the pre-existing workflow inventory was preserved. Evidence:
`/private/tmp/orqaly-handler-runtime-003-recovered-sep7.json`. This proves only
the isolated fixture runtime: not customer v2 handler support, email delivery,
or production handler readiness. Aggregate binding3 remains unattached to
Orqaly, and production owned handlers remain disabled.

The sections below are chronological checkpoints; earlier “not deployed” or
“pending” statements describe their recorded time, not this latest state.

## Customer experience

Keep the original Assistant conversation and one composer. The workflow opens in
the existing side panel; mobile users close the panel to return to the same chat.
The selected draft has one next-step summary. Optional handler checks stay
collapsed. On mobile the next-step card scrolls normally rather than covering the
canvas. Technical bundle hashes remain in evidence rather than the primary step.

Required connections are set up in that panel with a secure dialog, never by
pasting keys into chat. The customer confirms the exact destination and operation.
Saving clears input fields immediately, refreshes the same draft, closes setup,
and invalidates prior review/test approval. It does not run, activate or resume
work automatically. A saved connection is explicitly **not tested**.

Native n8n edits remain draft-only. A linked error workflow can be viewed in the
same canvas, scoped to the selected bundle. It is read-only here. Native edits,
draft switching and conversation changes are fenced while setup or handler-test
confirmation owns the candidate. Production pause is a separate customer action.

## Implemented boundaries

- Revision-owned credential metadata, exact member/owner/environment foreign keys,
  scope confirmation and request deduplication. Credential values go only to the
  existing self-hosted n8n credential adapter; PostgreSQL stores metadata, not keys.
- Exact cleanup/revocation of draft-owned n8n credential records. Inherited live
  credentials are read-only. This never creates/revokes keys at external providers.
- Lost create responses are not retried automatically. Cleanup requires provider
  metadata absence evidence, with a bounded attempt count.
- Explicit conversation setup-resume only after server-side verification of the
  exact saved selectors, current draft and available runtime capability.
- A separately authorized isolated error-handler probe: an intentionally failing
  temporary parent invokes this candidate's actual unchanged pure handler.
  Source/version/bundle and execution-parent/child evidence are pinned. Temporary
  workflows must be removed before a success is shown. This is handler-only proof,
  not main-workflow acceptance, connected-service delivery or release approval.
- Additive migrations022–023, forced tenant-and-owner RLS, narrow role privileges,
  guarded state transitions and startup readiness checks. No Supabase import/use.

## Local acceptance evidence

| Check | Result and limits |
|---|---|
| Pinned real n8n2.37.10 bundle runtime | 11/11 passed, including failed parent → actual handler and cleanup; local disposable n8n |
| Real PostgreSQL001–023 probe service | 12 groups passed; source forgery, isolation, suspension, unknown outcomes and concurrent cleanup readback |
| Real PostgreSQL + real n8n credential lifecycle | Main and child create → bind → metadata read → restart → revoke passed; exactly2 creates/2 deletes; no workflow execution/provider calls |
| Migration release operator | 9 source/ledger tests and7 real PG16 groups passed; atomic rollback, exact privileges/function bodies and preserved data |
| UI/API controls | Separate unit/integration suites cover consent, same-candidate locks, child view, timeout/duplicate protection, setup-resume and source-bound receipts |
| Browser | Actual product chat/panel components with clearly labelled synthetic API/native surfaces: setup, same draft, handler confirmation, mobile panel return;390px viewport/document width, one composer and one iframe |

Local screenshots: `/private/tmp/orqaly-n8n-controls-desktop.png` and
`/private/tmp/orqaly-n8n-controls-mobile.png`. These are UI fixture evidence, not
screenshots of a live deployed n8n test. Disposable containers are removed after
each acceptance run. No real customer/provider credential was used.

The final product suite passed **124 files / 1,876 tests**, with15 explicitly
gated skips. It covers the server/shared/client workspace suites and the schema
migration operator. The real n8n and PostgreSQL runs above are separate evidence;
the15 skips are not claimed as executed.

The broad workflow gate initially reported1590 passes,15 gated skips and1
pre-existing missing-file failure: `.github/workflows/workflow-v2-preview-gates.yml`
is referenced by the nginx configuration test but absent from this checkout and
its tracked file list. Do not describe that gate as fully green or silently skip
the assertion. Later focused checks cover subsequent edits separately.

## Browser bundle allocation

Previous deployed authenticated build:1,291,631 raw JavaScript bytes. Initial new
authenticated build:1,308,302 (+16,671 /1.29%), with the preview API origin and a
synthetic publishable key. Independent module review attributed the increase to
secure connection UI, handler checks, ownership/recovery controls and API methods.
Package and lockfile are unchanged. Fixed reviewed allowance:1,320,000 bytes
(+20,000 to the former limit), not an automatically generated threshold. All
route-presence, forbidden-runtime and browser security checks remain unchanged.

## Deployment and remaining proof

At the time of this local checkpoint, the new implementation is **not deployed**.
Existing Orqaly preview services remain on `conversation-cc375539`.
The new schema must be applied and restricted API/worker logins checked before
worker → API → web rollout. Each deployment must use committed source and pinned
image digests and retain existing IAM, capacity and customer data.

Only preview003 is eligible for the separately approved probe configuration:
same existing n8n image, min0/max1, instance CPU and ErrorTrigger in its node
allowlist. `ownedErrorHandlerProbe` is separate from `ownedErrorHandlers`; enabling
a test probe does not enable production handler execution. Preview001/002 stay
unchanged. Min0 does not guarantee continuous background execution when scaled
down. No additional Cloud SQL or n8n Cloud subscription is needed.

Production owned error handlers remain disabled until a reliable terminal receipt
channel or deliberately reviewed retention policy proves main/child outcomes.
Current no-retention production executions may legitimately be outcome-unknown.
Do not infer successful delivery from HTTP200, stored credentials or a pure probe.
The local AxWise owned-dependency contract change is also not yet deployed.

### Subsequent GCP checkpoint — source `f5be712e`

The additive migrations022–023 were applied successfully to the existing preview
database. The migration ledger advanced from21 to23;19 protected customer-data
groups, database roles and ACLs were unchanged. The receipt is
`/private/tmp/orqaly-controls-schema-f5be712e.json`. This is schema evidence, not
evidence that the actual restricted API/worker logins have passed readiness.

Both regional Cloud Builds completed successfully from the frozen source export:

| Artifact | Build | Image digest |
|---|---|---|
| API and worker | `315d8849-68d4-4823-ac2f-b847d1587f50` | `sha256:ea75cb738154fb33ec5e53706a9bb02f6ad64fb4c5c91aff113e1c7d246d3ef4` |
| Web | `f232485c-96d7-46e2-8678-f1fe67230b88` | `sha256:b1375e70db108aea2bb9289636d0f0dc2b993b97333fcd978ea1b11f298d5433` |

The existing preview application traffic remains on `conversation-cc375539`.
No new n8n003 configuration or environment-binding version has been applied.
The image-only release input is
`/private/tmp/orqaly-conversation-f5be712e.Qq1u8h/controls-release-inputs.json`.

The actual-role credential-readiness audit was denied before execution under the
synthetic-credentials-only boundary. A separate explicit request is pending to
use the existing internal preview database/n8n service credentials in memory;
this does not authorize customer/provider keys. No alternative access method or
traffic switch was used to bypass that denial. Complete the restricted-login
checks before promotion, then perform authenticated live acceptance. Do not call
the new release end-to-end verified on GCP yet.

The final fresh local browser session reported no JavaScript errors. At390px,
document width remained390px with exactly one composer. Closing the workflow
panel preserved the exact unsent message. The mobile screenshot was refreshed
after removing the overlapping sticky next-step card. These remain clearly
labelled synthetic UI-fixture results, not live deployment evidence.

### Authorized rollout and live handoff regression

After explicit authorization to use internal preview credentials, both restricted
runtime logins passed read-only readiness. Worker, API and web were promoted to
`conversation-f5be712e`, preserving configuration/IAM/tags and environment binding2.
The deployed web build passed its retained-build gate at1,308,327 JavaScript bytes.
The signed-in browser displayed the real native n8n canvas beside the original
chat, with no captured browser errors at that check.

Live acceptance request `f62132c0-fe2e-4527-b3cd-24a557998583` exposed a real
auto-route → design failure: two operation IDs reused one stage-attempt ID.
AxWise correctly returned409 for the immutable attempt conflict. Active v1 and
the existing reviewed v2 remained unchanged; the failed turn is preserved.

The narrowly scoped fix namespaces the design attempt while retaining the old
primary attempt identity. Safe typed transport error classes are preserved without
upstream messages, response bodies or credentials. Local evidence:99 focused
tests across4 files;30 real PostgreSQL checks across28 conversation turns,
including the actual restricted AxWise PostgresOperationStore. The old collision
is reproduced, fixed routing/design operations persist separately, and restart
replays leave exactly two operations. No model, n8n or GCP execution is claimed by
that database regression. A backend-only hotfix rollout and fresh live request
verification must still follow this source checkpoint; web stays onf5be712e.

### Live continuation — backend `c6d0b61f`

The backend-only hotfix was built by Cloud Build
`007324c0-7581-4142-afa7-b65027b82c2b` and promoted worker → API, both at100%
on `conversation-c6d0b61f`. Image:
`sha256:22c55c9fb2dab6c782b40920a29237808026445a319444d2f5b79e212d394f85`.
The authenticated API readiness check returned200/databaseok. Restricted database
roles passed against the new committed source. Configuration, IAM, capacity,
environment binding2 and all pre-existing tags were preserved. The web stayed on
the exact `f5be712e` image. Receipts are under
`/private/tmp/orqaly-conversation-c6d0b61f.XjlZB7/`.
The full product suite now passes124 files /1,885 tests with15 gated skips.

The existing successful retry `07d24a2e-3c08-4de1-9154-843e6a2c0e8a`
completed at12:12:27Z, before this hotfix rollout. It directly used the saved
design intent and updated the same v2 with five inline nodes. It is real model
generation evidence, but **not** live proof of the repaired auto-route → design
handoff. The original failed turn remains recorded. Read-only row audits confirm
active v1 is unchanged. During native-editor acceptance, `Edit Fields` was renamed
to `Trim text` and autosaved back into the same v2; no second workflow was made.

Review found a contract mismatch before execution: the generated numeric-text
case expected400, but `inputSchema.properties.text.type` still required a string.
That would fail before reaching n8n. A fresh request through the same original
chat asks to admit JSON objects and retain validation in the native graph. Do not
claim candidate execution acceptance until the corrected source is verified and
the actual cases run.

Preview003's same pinned n8n image was separately promoted to
`orqaly-solution-n8n-preview-003-handler-probe-sep7`, min0/max1 unchanged,
instance CPU and ErrorTrigger enabled. Aggregate binding3 was published and
verified in memory; API/worker still use binding2. Production owned handlers are
still disabled. The separately prepared synthetic handler probe stopped before
dispatch because the management API key cannot authenticate the editor-only
`/types/nodes.json` endpoint (401). No probe workflow was created or executed.
The original stopped ledger is retained at
`/private/tmp/orqaly-handler-runtime-003-sep7.json`; it must not be replayed blindly.

### Follow-up contract and expression checks

Fresh chat request `b94c1d46-35b2-48f4-a880-7665dc28bfb0` completed and updated
the same v2 input schema, preserving the five-node graph and `Trim text` native
edit. No live activation or test had happened at this checkpoint.

Review now rejects acceptance-case inputs that the transport schema would reject
before n8n. Diagnostics identify the bounded case ID and JSON-pointer path, not
payload values. The correction must be explicit; the reviewer never rewrites the
customer's contract. The pure expression grammar also admits unary `typeof` over
already permitted data expressions, preserving all global/property/call/callback
restrictions. This is not arbitrary code execution or a new worker capability.

The targeted real pinned n8n2.37.10 integration test executed three distinct
synthetic cases locally: padded text→200/trimmed output, missing text→400/error,
numeric text→400/error. Each returned a real unique execution ID with exact
acceptance and cleanup evidence. The disposable local container was removed.
This supplements23 static expression-policy tests; it does not substitute for
running this customer's exact v2 on GCP after the follow-up backend release.

### Worker lifecycle correction after the staged release stop

The staged worker later received SIGTERM. The old shutdown path closed its pool
while the sequential queue loop was active, which then attempted the remaining
queues against that closed pool. The source fix gates first claims on actual
readiness, bounds transient startup retries without overlapping readiness calls,
checks stopping before every queue and drains HTTP/readiness/in-flight work before
closing the repository. One eight-second shutdown budget exits nonzero if work
cannot drain; it does not close a pool under unfinished work or assert success.
Existing durable leases and unknown-outcome reconciliation remain responsible
for interrupted operations. Error diagnostics are fixed safe codes, not SQL,
payloads, arbitrary provider messages or secrets.

Local regression:20 lifecycle tests and21 engine tests passed. The complete
server/shared/library/workspace selection passed105 files /1,664 tests, with16
explicitly gated skips. This source has not yet been deployed at this checkpoint.
The failed staged3ea evidence remains unchanged. Its successor must preserve
active traffic/configuration while staging and pass the ordinary zero-error
worker gate; there is no exemption for its new revision's startup/shutdown errors.
