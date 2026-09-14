# Conversation-first desktop workspace — 14 September 2026

## Status

Implemented and packaged locally. **Not yet accepted end-to-end or deployed.**
The real preview-backed local gateway stopped before any Gemini call because
gcloud token refresh requires interactive reauthentication. The owned gateway
and proxy were cleaned up. The user has been asked to reauthenticate; the
existing preview services and currently open desktop application were not changed.

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

1. Reauthenticate gcloud, then start the prepared local gateway against preview
   and make real context/model/research calls using the authorized synthetic
   webhook case and saved Goal `c5399f08-d34a-5a00-8afe-022bb2d6705b`.
2. Build and stage the exact Orqaly API/web revision, verify configuration and
   health, and roll out preview only. No AxWise worker rollout is required.
3. Open the new desktop build and perform one real conversation: attach the
   existing design, load relevant skill/document context, implement a bounded
   local prototype, use focused AxWise assistance, and run local checks.
4. Confirm actual artifacts/results appear, reopen the conversation, and check
   that another conversation does not inherit its Goal. Preserve existing
   approval controls and do not connect billing or deploy the prototype.

No new production release, account permissions, background monitors, signing,
notarization, or additional platform support is implied by this work.
