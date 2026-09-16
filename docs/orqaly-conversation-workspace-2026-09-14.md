# Conversation-first desktop workspace — 14 September 2026

## Status

**Ready for manual testing. Cloud preview and the bounded native desktop
implementation → research → revision → checks → history journey passed.**
Authentication, account isolation, saved-artifact retrieval, Gemini guidance and
one completed, cited AxWise research result passed. The corrected API/worker and
verified web now serve preview at 100%. Earlier failures remain recorded below;
they were not relabeled as successes.

## Implemented

- Orqaly desktop context API returns the completed design and the run's actual
  artifact index; individual artifacts are retrieved on demand. Existing owner,
  approved-scope identity and artifact-content checks remain enforced.
- Product guidance distinguishes historical task boundaries from the current
  request and real tool permissions. It does not invent mode switches, scope
  locks, implementation stages or executed outcomes.
- An on-demand desktop work adapter reuses the existing durable
  `AssistantTurnV1` research path. Start, read/resume, cancel and event APIs keep
  stable request identity and preserve actual status. No new Goal, approval,
  worker, provider, AxWise engine or database schema was added.
- Research requests include reference excerpts only when explicitly selected,
  within the existing Assistant contract. A selected Goal no longer appends its
  whole design to every focused question. Full artifacts remain separately
  readable; the model must not claim to have read omitted content.
- The bundled native MCP helper offers `read_goal_artifact`, `ask_axwise`,
  `axwise_work_status` and `cancel_axwise_work`. It uses the existing credential
  helper internally; tokens never become tool output. The helper and provider
  send an expected account hash checked by the gateway before work.
  A bounded status wait resumes the same request rather than submitting another.
- Goose persists selection and artifact associations per account and native
  conversation. Each turn carries compact current references, not repeated full
  documents. Changing one conversation no longer restarts every chat.
- The right-hand desktop panel shows actual cloud artifacts, recorded local
  tool output/diffs, research results/sources and successful skill loads. Native
  history preserves these recorded results; this is not a new repository-wide
  filesystem browser or automatic cloud synchronization service.
- The web Goals page describes written deliverables and provides a copyable
  Goal link for the desktop Project context field. No unsupported native-opening
  claim or automatic phase switch is presented.

The pinned official Goose 1.50.0 runtime, native skills, local tool permissions,
OAuth flow and hosted Gemini configuration remain in use. The previously failed
`AnalyzeEvidenceV1` capability remains outside this change.

## Local checks and current package

- Initial implementation: 168 combined Orqaly API, Assistant adapter and Goals UI
  checks passed.
- 75 combined desktop context, account lifecycle, prompt/replay and panel checks
  passed; full desktop TypeScript passed. Relevant focused ESLint checks passed.
- 15 connector checks passed, including synthetic OAuth and MCP transport tests.
- The separate unsigned macOS Apple Silicon build completed successfully. Its
  bundled runtime has 23 verified files and includes the new MCP helper.
- Correction: 545 worker-focused checks and nine API-adapter checks passed;
  the corrected Assistant service also completed a real local call with citations.
- Final desktop source commit: `6776a8422`.
  Its 12 vendored connector files are pinned to monorepo commit
  `c5cdc47ce4a7c2ec68c0f9a06d0ee4a25d26a2b5`.

ZIP: `orqaly-goose/ui/desktop/out/workspace-final-sep14/make/zip/darwin/arm64/Orqaly Preview-darwin-arm64-1.50.0.zip`

SHA256: `946d52c64f3bb4ea686c57f2c4464453e68cf2d44c37a2fb5a16c085b9eba5df`

This is an unsigned macOS Apple Silicon preview. Its final runtime PATH correction
passed 15 backend-startup checks, full TypeScript and scoped lint. All 23 bundled
runtime files match their inventory. Native acceptance is recorded below;
packaging alone was not used as E2E evidence.

## What to try next

1. Open **Local webhook prototype** in the final app, inspect its right-hand
   workspace, and ask for a small local change in ordinary conversation.
2. Ask a focused research question, continue implementation in the same chat,
   and inspect the resulting artifact and actual command output.
3. Start a new chat to try a different task. Attach a Goal only when relevant;
   local tools and skill discovery remain native Goose capabilities.

No new production release, account permissions, background monitors, signing,
notarization, or additional platform support is implied by this work.

## Real-call acceptance record

### Passed

- Local preview-backed gateway: unsigned request rejected with 401; verified
  OAuth session returned 200; mismatched account hash rejected with 403
  `ACCOUNT_CHANGED`.
- Selected Goal `c5399f08-d34a-5a00-8afe-022bb2d6705b` returned nine artifacts.
  The final artifact has 48,219 characters and the expected SHA256
  `9358908c05b0b0489eb232640e96386c329cfedadeeb04abf0039e461d1744e7`.
- One real Gemini gateway call returned 200 in 4.6 seconds. Given the saved
  written design and a new authorized local implementation request, it proposed
  inspecting the folder, implementing the prototype and running local tests.
  It did not invent a planning-mode switch or refuse under the historical scope.
  This was a transport/guidance check, not evidence that files were implemented.
- Staged API repeated the same authentication/account/context checks successfully.
- API and web builds from commit `5eebb3c8c91e1da45b3f1ba39f0cd4aa44a9e590`
  succeeded, with exact source/image verification. Staging retained original
  default traffic, IAM, environment, network, resources, timeouts and existing
  tag mappings. AxWise API/worker and Orqaly worker were unchanged.

### Research failures retained, not rewritten

1. Local diagnostic request `313b58b3-d4b7-487e-b502-a901677c10d8`, operation
   `b00d369c-d9f9-51e5-bcb5-c4aaa650f869`: `AXWISE_HTTP_404`. The Mac attempted
   to reach the deliberately internal-only AxWise service directly. An identity
   token does not supply VPC connectivity. The route itself matches the deployed
   API; testing moved to the staged Orqaly API's existing private connection.
2. Staged request `3d852cf0-7b19-4756-8987-f8f6c557c6db`, operation
   `2787ca7b-5ecb-5ca8-a7db-0c3af111b3b0`: accepted and ran, then failed
   `AXWISE_ASSISTANT_EMPTY_RESPONSE`. The primary adapter reported no
   source-backed claim after two calls / 58.9 seconds. This error does not prove
   the model emitted no prose: the adapter clears text without usable grounding.
   The automatically attached design excerpt also exceeded the existing
   1,000-character fallback-request limit, so this request could not use fallback.
3. Focused comparison, after the reported cooldown: request
   `3f278422-2a41-4d6f-a12b-a7fb41b7303a`, operation
   `e592ec54-7ae9-5b76-b0d9-559fad8ab5a1`. It explicitly requested Google Search
   and omitted the unrelated design excerpt. Gemini's grounded provider returned
   HTTP 504 errors across three attempts / 119.9 seconds. Existing fallback
   discovered ten candidates, selected three, fetched two, encountered one HTTP
   4xx, and produced no claim. The operation failed after approximately 135
   seconds; this was not a completed research result. This comparison does not
   establish that removing context fixes the primary grounding behavior.

At this held checkpoint, no further model retry or worker update had followed
the failures; the desktop fixture contained only its README and local webhook
skill. The user subsequently authorized the focused worker correction below.
Native skill loading, research-to-edit continuation, artifact viewing and history
isolation were subsequently verified in the walkthrough recorded below.

Operator receipts are under `artifacts/goose-workspace-sep14/` (ignored):
`build-verification.json`, `staged-verification.json`, and
`held-verification.json`. Held-state verification passed at 12:17:06 UTC after
removing the temporary candidate tag; original tags and settings were restored
exactly. The previous desktop app was reopened with its existing history.
Historical staged image digests:

- API: `sha256:d99ede4b6aee382bf7d8a7b299ec10e9146f234b2868aaf08ff27778c88d7af1`
- Web: `sha256:b0b4039e3b3b967b8879d7fdc21fa8d7b4e60d5240eb0d293eb8871cd16f5381`

During that hold, normal traffic remained on API
`orqaly-v2-api-preview-goose-04606f0b` and web
`orqaly-v2-web-preview-monorepo-26e447a9`, each at 100%.

### Corrective release and completed research

Source `a7fc8d3cc42b3cef4395fb9633049bdadf896856` preserves focused questions,
asks the existing grounded provider to use search, and renders citations from
admitted provider claim/source bindings instead of requiring the model to emit
matching Markdown links. Missing evidence is distinguished from provider outage;
it does not falsely trigger an outage cooldown or permit unsupported publication.
No new reasoning engine, worker service, model-review stage or database schema
was added.

The real candidate request `517e19d5-b5f3-4dd2-b7a1-431e043a28a3`, operation
`49cbbd9b-2684-5554-a7a1-7590424da7da`, progressed from accepted to completed in
**39.383 seconds** through the canonical MCP bounded status wait. Its persisted
research artifact `c97c5fa0-e9e8-5546-8cf4-3633d50f4786` has hash
`aecada49501932e6a268af8ec974c001d8e5f639bd803edfa719633d6c905980`, with RFC 9110
and RFC 6585 sources and rendered citations. Unsigned 401, account-mismatch 403
and authorized context 200 checks also passed. The exact corrected worker logged
one claim and one durable completion; worker execution latency was 30,246 ms.
These are observed timings, not an SLA.

After that acceptance, API/web traffic was promoted. The final preview state,
including the already updated worker, was verified at **12:52:47 UTC**:

| Service | Revision at 100% traffic | Image digest |
| --- | --- | --- |
| Orqaly API | `orqaly-v2-api-preview-workspacefix-a7fc8d3c` | `sha256:41ebdaf2cb088912f9e8468640a9417a3c59873b2375425799b337aa7020ed18` |
| AxWise worker | `axwise-v2-worker-preview-workspacefix-a7fc8d3c` | `sha256:c8050c1efed4c76f1cca2ac41454de16a10275e4d83798f4ddf351a2cd7bcf07` |
| Orqaly web | `orqaly-v2-web-preview-workspace-5eebb3c8` | `sha256:b0b4039e3b3b967b8879d7fdc21fa8d7b4e60d5240eb0d293eb8871cd16f5381` |

API build `0c6ed3c9-c5fb-41ef-b0f9-245ded3744de` and worker build
`c9c173bb-3964-4d15-841c-613bf7fd319e` were checked against exact committed
source, uploaded source generations, existing recipes and registry digests.
Web build `8df86c2f-9e82-4ec9-94e0-7c6646e9aec3` was reused after proving its
Docker inputs unchanged between the original and corrective commits.

Worker rotation used the coordinated no-new-work window, observed old-instance
drain, and restored automatic min/max 1/1. Actual new `/readyz` execution,
nonzero instance metrics and old-revision retirement were verified. No global
queue-empty claim is made under the existing forced-RLS visibility limits.
Temporary API tags were removed; original tags, IAM, environment, network,
resources and timeouts were preserved. AxWise API and Orqaly worker were unchanged.
Old revisions remain available for rollback; production was not changed.

Receipts under `artifacts/goose-workspace-sep14/`:
`worker-fix-build-verification.json`, `worker-fix-final-verification.json`,
`worker-fix-operation-runtime.json`, `worker-fix-old-drain.json`,
`worker-fix-old-retired.json`, and `worker-fix-new-running.json`.
The cloud result alone was not used to establish native desktop completion.

### Completed native desktop journey

The authenticated web Goals page's **Copy Goal link for desktop** action was
used through the real clipboard. Attaching it to native session `20260914_1`
(**Local webhook prototype**) brought the selected design and nine artifacts into
the workspace. Opening the final design displayed its actual title, content and
expected `9358908c…` hash. The local folder was
`/private/tmp/orqaly-workspace-acceptance.GBMHL2`.

Goose discovered and loaded the relevant `webhook-prototype` skill without an
explicit skill-name request. Native scoped **Allow Once** approvals were retained.
It read the selected design, created `delivery.mjs`, `delivery.test.mjs` and
`notes.md`, and ran 19 passing tests. The historical document-only scope did not
block the new authorized local task.

In the same conversation, `ask_axwise` and `axwise_work_status` completed request
`86c21c22-b641-4064-ab36-eb4090197ee9`. The research artifact's hash is
`36b2c1d178098374790d5d97d6b5701508bc5624671888d7407d28594765880c`.
Its content and sources, including the actual RFC 9110 link, opened in the panel.
Goose used that result to implement Retry-After handling, revise the same notes
and pass 28 tests. A small inspection-driven correction then preserved exact
Buffer bytes for HMAC and aligned the notes with the chosen retry policy;
the native result was 29 passing tests.

An independent run using the final app's bundled Node 22.23.2 confirmed **29 tests,
four suites, zero failures, exit 0**. The verified outputs have these SHA256s:

- `delivery.mjs`: `98192e3d171edee8355f57373944366c64212c882e7996560f0b8ade5cd481a7`
- `delivery.test.mjs`: `8e8a1f64f20b4d98511ecb147cbd0b3f43dcfff5183cf9376464eb0366e3d405`
- `notes.md`: `044009852ce36fa7c83540765bddd5ee16a64ed2fa2c08d013ff255d63aa2e58`

The final package reopened with the existing login. Session `20260914_1` retained
its folder, selected Goal, artifacts, completed research, successful skill load
and final test result. A separate session `20260914_2` (**Node.js runtime check**)
showed **No cloud Goal attached**, no inherited cloud artifacts and no successful
skill load. Its real `command -v node` / `node --version` output selected the final
package's `Contents/Resources/orqaly-runtime/node/bin/node`, version `v22.23.2`.

#### Runtime finding and preview limits

The preceding package's plain `node --version` reached an inherited Goose shim
and downloaded Hermit-managed Node 24.15.0 despite the fixture's no-install
request. That unexpected runtime is retained in the isolated Orqaly account;
the acceptance is not described as having had zero installation side effects.
The final package fixes this by putting its existing bundled Node first in the
backend's process-local PATH. User shell settings and upstream shims are not
changed; `npx` and arbitrary tool commands retain their existing behavior.

No billing services, real webhook deliveries or prototype deployments were used.
The public web sign-in page loaded without JavaScript errors, but its existing
embedded sign-in card has a contrast issue left as a visual follow-up. The actual
authenticated Goal handoff worked. This release remains an unsigned Apple Silicon
preview, not a production billing system, cross-platform certification or an
exhaustive evaluation of generated code. Both private feature branches contain
the implementation; production/default branches were not changed.
