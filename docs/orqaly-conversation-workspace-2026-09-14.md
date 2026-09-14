# Conversation-first desktop workspace — 14 September 2026

## Status

Implemented and packaged locally. **Images staged at zero default traffic;
not accepted end-to-end and not promoted.** GCP reauthentication is resolved.
Real authentication, account isolation, saved-artifact retrieval and the Gemini
gateway passed. The existing AxWise research path failed two real comparisons,
so normal preview traffic remains on the prior revisions. The local gateway
and owned database proxy were stopped cleanly. See the real-call record below.

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
- Research requests carry explicitly marked reference excerpts within the
  existing 24,000-character Assistant contract. Full artifacts remain separately
  readable; the model must not claim to have read omitted content.
- The bundled native MCP helper offers `read_goal_artifact`, `ask_axwise`,
  `axwise_work_status` and `cancel_axwise_work`. It uses the existing credential
  helper internally; tokens never become tool output. The helper and provider
  send an expected account hash checked by the gateway before work.
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

## Local verification

- 168 combined Orqaly API, Assistant adapter and Goals UI checks passed.
- 75 combined desktop context, account lifecycle, prompt/replay and panel checks
  passed; full desktop TypeScript passed. Relevant focused ESLint checks passed.
- 15 connector checks passed, including synthetic OAuth and MCP transport tests.
- The separate unsigned macOS Apple Silicon build completed successfully. Its
  bundled runtime has 23 verified files and includes the new MCP helper.
- Connector source is pinned to local monorepo commit
  `2368984d7b706008a38fde7aff6687aac37aa302`, with 12 exact vendored source files.

ZIP: `orqaly-goose/ui/desktop/out/workspace-sep14/make/zip/darwin/arm64/Orqaly Preview-darwin-arm64-1.50.0.zip`

SHA256: `6e46c1f92bbad8088c9629fca5b44d53f1c98df715f8880e5960c74fc5cd0d8d`

The previous installer and running app remain available. Do not treat the new
package as a verified release until the matching API and desktop flow are checked.

## Remaining acceptance

1. Resolve the existing grounded research dependency, then verify one real
   completed AxWise result. Do not silently retry the failed requests or label
   an accepted/running operation as complete. Any AxWise worker change requires
   a separately agreed scope; no such change was made in this rollout.
2. Promote the already built and staged exact API/web images only after the
   acceptance blocker is resolved. Rebuild if their source changes.
3. Open the new desktop build and perform one real conversation: attach the
   existing design, load relevant skill/document context, implement a bounded
   local prototype, use focused AxWise assistance, and run local checks.
4. Confirm actual artifacts/results appear, reopen the conversation, and check
   that another conversation does not inherit its Goal. Preserve existing
   approval controls and do not connect billing or deploy the prototype.

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

No further model retry or worker update followed these failures. The desktop
fixture at `/private/tmp/orqaly-workspace-acceptance.GBMHL2` still contains only
README.md and its local webhook skill. The packaged implementation, actual skill
load, research-to-edit continuation, artifact viewer and history isolation have
**not** yet received their real application acceptance check.

Operator receipts are under `artifacts/goose-workspace-sep14/` (ignored):
`build-verification.json`, `staged-verification.json`, and
`held-verification.json`. Held-state verification passed at 12:17:06 UTC after
removing the temporary candidate tag; original tags and settings were restored
exactly. The previous desktop app was reopened with its existing history.
Staged image digests:

- API: `sha256:d99ede4b6aee382bf7d8a7b299ec10e9146f234b2868aaf08ff27778c88d7af1`
- Web: `sha256:b0b4039e3b3b967b8879d7fdc21fa8d7b4e60d5240eb0d293eb8871cd16f5381`

Normal preview traffic is retained on API `orqaly-v2-api-preview-goose-04606f0b`
and web `orqaly-v2-web-preview-monorepo-26e447a9`, each at 100%.
