# Native n8n integration — 5 September 2026

## Scope

This release implements the native editor/viewer and revision lifecycle for the
existing isolated customer webhook Solution. It does not claim unrestricted n8n
automation support, autonomous solution generation or a software-build sandbox.

The customer stays on the existing Solution page. The actual pinned n8n frontend
loads in a sandboxed iframe on the existing API origin. It is not an imitation
canvas and no customer workflow is sent to a public viewer service. The original
n8n Cloud Run service stays IAM-private, with the same dedicated database, service
account, encryption key, node allowlist and one-instance cap. No second environment
or paid n8n Cloud account is created.

```text
Current workflow (read-only native canvas)
  → Edit workflow (durable Orqaly draft, native n8n editor)
  → Native autosave (draft only; optimistic version + checksum)
  → Review saved changes (supported capability + input/output meaning)
  → Approve exact version
  → Deploy separately in the existing isolated n8n environment
  → Test in n8n (actual output and execution ID)
  → Activate in Orqaly (change the current-release pointer)
```

Rejecting a draft or saving a new edit cannot change the currently deployed
workflow. Each release keeps its own provider workflow ID and webhook path.
Orqaly stores append-only revision events, immutable approval/deployment snapshots
and invocation evidence. Existing version 1 and its history remain intact.

Native run/publish/credential/administration APIs are denied by the authenticated
gateway, not merely hidden. The native editor connection channel reports editor
connectivity only; it does not fabricate n8n execution events. Orqaly's test and
production controls remain the sole supported execution interface.

## Supported editing and explicit limits

- View actual nodes/connections, pan/zoom and inspect the selected version.
- Edit supported field mappings and string transformations; change node layout.
- Persist/reopen drafts, review meaningful mapping differences, reject, approve,
  deploy, test and activate.
- Unsupported nodes, topology, triggers, credentials, arbitrary expressions and
  execution settings cannot pass review or deploy. Native fields that are not
  persisted must fail explicitly rather than display a false successful save.
- Native title/description administration, native manual execution, native publish,
  per-node execution replay, provider credentials, schedules and customer keys are
  not part of this release.
- The review is deterministic capability/semantic analysis of the supported
  transformation. An AxWise model-generated assessment and natural-language
  solution generation are not connected yet; the UI says so.
- Distribution/OEM licensing remains an external launch prerequisite; there is no
  enterprise token-exchange or license-gate bypass.

## Verification and release gates

Local evidence before cloud rollout:

- Real PostgreSQL 17 + pinned n8n 2.37.10 lifecycle acceptance passed: rejected
  draft leaves v1 unchanged; changed revision deploys separately, returns its new
  output and activates only after testing; stale saves, immutable approvals,
  idempotency and cross-tenant access guards pass.
- Configuration and HTTP boundary tests cover all new authenticated routes,
  mandatory exact If-Match versions, scoped invocation keys, exact origin/runtime
  bindings, startup failure for partial configuration and safe secret handling.
- React tests cover native launch isolation/readiness, draft selection and editing,
  fresh-version review, approval/test/activation gates and truthful result states.
- The broader test suite exposed a time-dependent approval fixture. It now uses a
  relative future expiry; the separate explicit-expiry test remains intact.
- One pre-existing suite check references the absent, untracked file
  `.github/workflows/workflow-v2-preview-gates.yml`. Its assertion remains; no CI
  workflow was fabricated and the full suite must not be described as all green.

The matched web baseline (HEAD `47edabde`, same installed dependencies and build
environment) was 1,145,755 JavaScript bytes. The final local native UI build is
1,155,257 bytes, a 9,502-byte addition. The budget is explicitly adjusted from
1,150,000 to 1,160,000 bytes (+10,000); forbidden runtime markers and route checks
are unchanged. Safe shared-chunk/minifier experiments did not reduce the increase;
no internal router aliases, dependency changes or unsafe minification were adopted.

The full relevant suite on application commit `db1cb806` ran 796 tests: 795 passed
and only the missing-CI-file check above failed. A subsequent test-only native
serialization regression also passed (38 validator tests total). Changed-file
ESLint has zero errors and one React effect-state warning in `NativeN8nCanvas`.
The targeted follow-up suite passed all 67 tests. This does not erase the known
failure in the broader 795/796 result.

Real native browser acceptance used synthetic local identity/storage fixtures
against the actual default-mode n8n frontend, not a simulated editor: changing
`trim()` to `toUpperCase()` emitted a native PATCH 200, incremented the draft
version, and survived a new iframe session. The deployed fixture remained
byte-for-byte unchanged. The saved shape also passed the production workflow
validator. Read-only controls and gateway mutation denials were separately checked.
This complements, but does not replace, the real PostgreSQL/n8n lifecycle test.

## Cloud checkpoint — native journey verified live

The user explicitly approved the two scoped secret-access grants after the initial
automatic review stopped `configure-native` before execution. The bounded command
then succeeded. The existing API service account
`orqaly-v2-api-preview@axwise-v2-preview-001.iam.gserviceaccount.com` has
`roles/secretmanager.secretAccessor` on only these additional native secrets:

- `orqaly-solution-preview-001-native-bindings:1` — the existing n8n login binding.
- `orqaly-solution-preview-001-native-signing-key:1` — scoped editor-session signing.

These are identifiers and versions, not credential values. No browser or public
n8n credential access was granted. No workaround was used to bypass the earlier
approval boundary.

The initial native application source was
`db1cb806024d52118e6e2b1ff544ac7cb2ebf9d9`. API follow-ups fixed the scoped database
read to use an API-role read-only tenant transaction (`78dfca20`), then replaced
the editor-health route with `/rest/orqaly/editor-health` (`d019c3d2`). The health
check verifies a real authenticated upstream `/rest/login` response with status
200 and a non-empty user ID; it does not assert workflow execution success.

The final API source is `27ccb17b`, adding native Save/Saved visibility for draft
sessions. The exact pinned modern/legacy header asset is adapted only to retain
its native save control with autosave enabled. Native dirty/loading state, save
handler, autosave, read-only scope and update permissions are unchanged. Unknown
asset versions or missing/ambiguous signatures fail explicitly; view sessions
receive the unmodified header. Both genuine pinned assets were checked in memory
for valid JavaScript and an otherwise byte-identical implementation.

The following identifiers are the final deployed checkpoint. The earlier full
v3 execution acceptance ran on the compatible health-fix API image
`sha256:d5e9d1cdefc1f5df675fddfe98a97b41edc312a4da0c70a56b36537de7aed90c`
(successful build `601a6826-8599-46a0-bc76-bcd975cefff9`). Final save-control
acceptance and a repeated database audit are recorded below.

| Input / artifact                   | Verified identifier                                                       |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Additive migration 012, applied    | `67d9f5de7bcefc8cffc7df618fe03113b290d12bd1103e1b3ce5b34120799391`        |
| Current API revision, 100% traffic | `orqaly-v2-api-preview-native-save-27ccb17b`                              |
| Current API Cloud Build, SUCCESS   | `9b5ebc47-cd36-455f-857d-5b8330e30bdd`                                    |
| Current API image digest           | `sha256:bdfe885bda9dff5d4dec04f17ab22b5402b3e2b11dd88906c8b06ad6e7b760cd` |
| Web revision, 100% traffic         | `orqaly-v2-web-preview-native-db1cb806`                                   |
| Web Cloud Build, SUCCESS           | `9568824c-cd71-4ad4-b3d9-ff7d62309322`                                    |
| Web image digest                   | `sha256:447accc8a42eb25ffff685711a74a69750982c8d468d9ad224df7ab0e687cf83` |
| n8n revision, 100% traffic         | `orqaly-solution-n8n-preview-native-db1cb806`                             |
| Unchanged pinned n8n image digest  | `sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2` |

The application image registry remains
`europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview`. The n8n
service is still IAM-private, in the same single isolated environment. Enabling
its native assets did not make the n8n service publicly accessible.

The first save-control build (`ea2a61b5-1f22-4194-97dd-d889bf6cbb58`) compiled
successfully but its default compute identity could not upload to Artifact
Registry. The same immutable source archive was rebuilt using the existing
`workflow-v2-preview-build` service account used by previous successful releases;
no IAM permission was added. The final candidate returned healthy database and
execution readiness before traffic promotion; all earlier revision tags remain.

### Signed-in native acceptance

The actual native graph loaded on the existing
[Contact data webhook Solution](https://orqaly-v2-web-preview-161074549006.europe-west4.run.app/workspace/solutions/2031decc-b21e-48b5-9bd5-3ed3d4dfd024)
without the Offline indicator. This was the authenticated preview browser, not
the local synthetic identity/storage fixture described above.

1. **Rejected v2:** editing `trim` to uppercase persisted a native draft. A
   malformed unsupported expression was initially blocked by review. After
   correction, the candidate was reviewed and rejected. The active v1 and its
   original trim behavior remained unchanged.
2. **Approved v3:** a new native edit was saved and reviewed, then approved at
   `2026-09-05T15:17:35.987Z`. It deployed as a separate provider workflow and was
   verified at `2026-09-05T15:17:52.949Z`. Activation remained disabled before a
   successful real test.
3. **Tested v3:** n8n execution `4`, recorded at
   `2026-09-05T15:18:17.957Z`, returned
   `{"email":"alice@example.com","customer_name":"  ALICE  "}`. The preserved
   surrounding spaces are expected: uppercase replaced trim; it did not add trim.
4. **Activated and used v3:** after that test, v3 was activated. Production
   invocation `5` at `2026-09-05T15:19:15Z` returned the uppercase transformation
   for the Bob input.
5. **Reloaded evidence:** refresh retained active v3 and execution history `1`–`5`,
   including the original v1 results. An earlier test at 13:22 UTC
   (15:22 Europe/Berlin) still had an unknown outcome and no verified receipt.
   That record was not converted into success: not every history entry succeeded.
6. **Final Save/Saved check:** on the final API image, a new v4 draft based on v3
   displayed the genuine native `Saved` control. After editing uppercase to trim,
   native autosave returned to `Saved` and Orqaly review reported that exact
   mapping change. The acceptance draft was rejected, never approved/deployed,
   and the page was left showing active v3. No additional runtime invocation was
   made for this UI-only check.

| v3 release evidence      | Verified value                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| Approved workflow hash   | `cc0090502d6e4c1a96371a16890c7ded3bd7d5a727e7d66ace0cc7637e3fb499` |
| n8n workflow ID          | `C4F8IAhej7UFWnsB`                                                 |
| n8n published version    | `98c4201c-040d-4e3b-ad1f-02ada1a81711`                             |
| Verified real executions | `4` (test), `5` (production)                                       |

This proves native edit → review/reject or approve → separate deployment → actual
test → activation → actual production result → persisted history. It does not
prove task-to-workflow generation, credential setup, registration assistance or a
durable missing-input/resume flow. Those remain explicitly planned in
[Task to runnable Solution](./task-to-solution-handoff.md).

### Final verification

- 69 targeted tests pass across the native gateway, upstream authentication,
  native configuration, HTTP authorization and scoped operator lookup; changed
  gateway/audit files pass ESLint. This does not erase the broader suite's
  pre-existing missing-CI-file failure recorded above.
- `scripts/native-n8n-preview-evidence.mjs` passed against the real preview using
  the existing API role and tenant-scoped `BEGIN READ ONLY` transactions. It
  verified immutable v1, rejected v2, active v3's exact approval/deployment/test
  and activation evidence, all five successful receipts against their respective
  workflow specifications, the preserved unknown outcome and the unchanged SMS
  artifact hash. A repeat after the final UI acceptance also passed.
- Cross-tenant Solution and revision queries returned zero rows. The audit made
  no runtime or database mutations and closed its own temporary SQL proxy.
- Anonymous Solution API access remained 401; direct anonymous n8n metadata
  access remained 403. Browser inspection showed the real native graph and no
  Offline indicator after the health fix.

## Rollout and rollback boundary

Apply migration 012 with its exact committed hash before deploying the API. Use
the bounded `migrate-revisions` / `configure-native` operator modes and incremental
service updates documented in `deploy/workflow-v2/README.md`. Enable native assets
on the existing private n8n service; do not add anonymous n8n access.

Preserve every existing secret binding, especially API database URL version 2.
The native owner credential and new signing key remain in Secret Manager and
server memory, never browser assets or logs. Promote only verified API/web
revisions; preserve existing revision tags. Rollback retains additive migration
012 and customer evidence. If a new revision has been activated, the previous API
image is not a safe rollback: it does not resolve active revision pointers. Use a
forward fix or a compatible image; do not silently revert the customer's current
workflow to v1. UI rollback does not delete customer records.

No Supabase access/import, third-party customer-data export or GitHub push is
part of this release.
