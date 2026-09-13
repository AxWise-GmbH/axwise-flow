# Original conversation with a workflow side panel

## Accepted interaction

The original Assistant conversation remains the user's workspace. Opening a saved
workflow reveals its native n8n canvas beside that conversation; it neither replaces
the conversation nor creates a second chat or composer. Returning from Workflows
resolves the recorded source thread and opens that same workspace.

## Implementation plan

1. Discover workflows through the current owned Assistant thread's persisted task
   links and matching build source. Combine their saved turns with the original
   messages for display only, in one chronological timeline.
2. Extract the existing workflow conversation controller from its standalone UI.
   Keep one parent-owned message draft and the original Assistant composer. Route
   each explicit question/change to exactly one existing endpoint.
3. Extract a canvas-only Solution panel with existing review/test/activation and
   connection controls. Keep the panel mounted when hidden; preserve native edits.
   Workflow-only query changes must not reload the thread or clear its message.
4. Resolve old Solution URLs to their recorded original conversation. Never guess
   a source thread or create a substitute for a workflow without a recorded source.
   Apply the same source resolution to preparation URLs; build progress, structured
   questions, secure setup and review stay in the same side panel. A confirmed
   saved workflow opens there on an explicit click, without replacing the chat.
5. Test thread isolation, stale responses, exact draft binding, delivery retries,
   consent resets, one log/composer, panel close/reopen, direct links and native
   navigation protection. Verify real UI with synthetic data, then deploy only the
   existing GCP web service and inspect the signed-in preview without customer writes.

## Boundaries

- No data migration, Supabase, new workflow/chat entity, runtime, or backend mode.
- Workflow replies remain in their existing scoped store. Rendering them beside
  Assistant messages must never add them to ordinary Assistant model context;
  this could silently reuse previously consented run data.
- Run input/output remains optional and requires new opt-in for each message.
- Draft generation never activates a workflow. Real-effect tests retain approval.
- Existing history APIs return at most 50 workflow turns. Surface truncation
  honestly; do not claim complete pagination or delete older records.
- The saved email-change failure is not a disposable test request. Do not resend
  it, run the customer's workflow, or alter its draft during UI acceptance.

## Interaction details

- One text field is owned by Assistant. Opening/hiding/switching the canvas keeps
  that same DOM input and typed text. “Working on” makes the target explicit;
  closing the canvas does not silently retarget a workflow message to task chat.
- Ask reads the selected workflow; Propose change prepares a draft using its exact
  version/hash. A blocked clarification uses that same text field and an explicit
  Answer & continue action. No workflow POST also calls ordinary Assistant send.
- Desktop uses a right-hand canvas; narrow screens use a closable right-side
  overlay while the original chat remains mounted. The native editor is not
  unmounted just because the user hides the panel.
- Pending/unconfirmed requests and native editing lock scope changes. Leaving the
  route warns about unsaved work; browser reloads have an unload warning.
- Authentication/ownership is checked by the existing APIs. Source routes also
  verify IDs and recorded source links before navigating. Titles are not identity.
- The timeline is a UI projection, not a replacement database or shared model
  memory. Existing workflow evidence is disclosed on demand.

## Build-size review

Matched against preview commit `ab1b8bb4` using the same locked dependencies,
publishable Clerk key and API URL: retained JavaScript grows from 1,264,200 to
1,288,615 bytes (+24,415 / 1.93%). No UI library was added. The
reviewed fixed ceiling is 1,300,000 bytes; route-retention and forbidden-runtime
checks remain intact. A build without the preview key is not a valid size baseline.

## Verification before rollout

- 620 tests passed in 42 files across Assistant, workspace, source routes, native
  gateway, conversation service and client/API contracts. This includes 19 combined
  Assistant/workflow and Assistant/build integration tests.
- Changed JavaScript/JSX passes ESLint; `git diff --check` is clean.
- The matched GCP production build passes retained-route/runtime and size checks:
  32 JavaScript assets, 1,288,615 bytes. Vite's existing large-entry warning remains.
- The synthetic browser fixture uses the real Assistant and workspace components,
  with explicit fake API/auth/native boundaries. Desktop and mobile verify same
  input/log, preservation through hide/reopen, no overflow, mobile focus, and no
  console errors. Native-runtime and real model execution are not claimed by it.
- Signed-in production inspection and cloud image/config receipts are recorded
  separately after the exact committed web image is published.
