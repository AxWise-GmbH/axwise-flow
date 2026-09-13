# Native read-only autosave correction — 7 September 2026

## Failure and cause

The customer opened active workflow v2 in the original Assistant side panel.
Both Orqaly and the native footer indicated read-only viewing, but native n8n
repeatedly attempted `PATCH /rest/workflows/<solution-id>` and displayed
“Autosave failed … 403”. The scoped API request logs confirmed these writes.
The existing view-mode denial correctly protected the active workflow.

Pinned n8n 2.37.10 source maps establish the mismatch:

- `useWorkflowSaving.ts`: `canAutoSave` checks the injected editor-context
  read-only flag, not the workflow's read/update scopes. All automatic save
  scheduling also checks `settingsStore.isAutosaveEnabled`.
- `settings.store.ts`: `workflowsAutosaveDisabled` controls that setting.
- `WorkflowHeaderDraftPublishActions.vue`: the Save button still requires
  `workflowPermissions.update`.
- `Canvas.vue`: the read-only keyboard map excludes the Save shortcut.

## Narrow fix

Commit `ad022ad8e8c6dca2b2331bf5d0fa718f94e82e9b` sets the native
`workflowsAutosaveDisabled` setting to `true` for view sessions only.
Draft sessions retain the genuine upstream setting. This covers current,
frozen revision, build and owned-child views through the same gateway.

No authorization, origin, tenant, workflow-scope, revision-state, version or
checksum checks were removed. Forbidden writes still return 403. There is no
fake successful save, role widening or new minified JavaScript patch.

## Verification

- 78 focused gateway, upstream, HTTP and native lifecycle tests passed.
- Independent source review and 34 gateway tests passed (overlap with the 78).
- 36 API-only release guard tests passed.
- Actual n8n 2.37.10 in a disposable local runtime: current and ready-candidate
  canvases rendered without a Save button or autosave retry toast. Each view
  was observed for more than 30 seconds; combined workflow PATCH count was 0.
- Native draft v2: Tidy Up changed node positions; actual autosave returned
  HTTP 200, the UI returned to Saved, draft row version advanced from 1 to 2,
  and the synthetic workflow hash changed.
- Returning to the viewer caused no further save. Final counters: 1 attempted
  PATCH, 1 successful PATCH, 0 denied PATCHes; frozen current and ready-candidate
  hashes unchanged. All storage for this browser fixture is explicitly
  synthetic and in memory, not evidence of a new production execution.
- Native recents still attempts a scope-forbidden GET when switching between
  workflow IDs; it remains denied and is not an autosave failure.

The original customer tab was not reloaded, closed or edited. The customer had
already activated v2 before this repair; this work does not activate, pause,
edit, test or replace their workflow, or alter schedules or connections.

## Preview release

Build `fe8e392b-c861-4597-8fe6-bb5837ed65da` succeeded from the exact committed
214-file service export (manifest hash
`62617730c7b8a8afd75be00555b3dff48243736e642de3060cc81a4529bfa988`).
Image: `orqaly-execution@sha256:ad6b947ef3d463a8f4eb156cb0b67505809ab052c6732102c09c36f85e714f64`.

Release scope is the existing GCP preview API only. Worker, web, all three n8n
services, environment configuration, IAM and databases are preserved. No
provider credentials or run payloads are used.

Published at 19:33:28 UTC: API revision
`orqaly-v2-api-preview-controls-ad022ad8` receives 100% traffic. Both no-traffic
stage and canonical readiness returned HTTP 200 with database OK. The temporary
candidate tag was removed; all pre-existing tags remained unchanged. Release
receipts are under `/private/tmp/orqaly-controls-ad022ad8.x3LyVy/`:

- `autosave-runtime-baseline.json`:
  `33aa106deee073d3e3cbfd103e50990350225772ee6372f3f9ac19caf18fe72a`
- `autosave-api-stage.json`:
  `de1e4024cdc73b917bc9bcd1c1aad9dca5c1505e3af645ecc10f85b2bb7c43e4`
- `autosave-api-promote.json`:
  `3752172a64f1c2af12e41b7640e7bb387824f8a4cc15febc7b0388adcedca859`

A fresh authenticated Chrome tab opened the customer's original Assistant URL
at 19:33:58 UTC, with active v2 and all five nodes visible. Read-only viewing and
Zoom to Fit showed no autosave toast; no application console errors were seen
(an unrelated Chrome-extension listener error was present). Scoped settings
and exact workflow reads returned HTTP 200 on the new API revision. At 19:35:21
UTC, the new viewer session had made zero PATCH requests across the observation
window. The expected foreign-recents GET denials remained in place.

The disposable local fixture and its browser tab were removed after checking.
The fixture enhancement is retained in `scripts/native-workflow-v2-browser-smoke.mjs`
for future pinned-native regressions.

## Remaining separate edge case

Pinned n8n's browser-close/reload warning checks its dirty flag independently
of workflow scopes. This autosave correction does not claim to fix that
separate warning path. Never dismiss a user's unsaved-work warning or reload
their editor automatically to apply this change.
