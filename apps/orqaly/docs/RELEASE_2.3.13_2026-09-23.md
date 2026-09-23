# Orqanix 2.3.13 — 23 September 2026

Published macOS Apple Silicon preview: **2.3.13, build 5680**. Both
`orqanix.com` and `preview.orqanix.com` serve the verified download. The 2.3.12
prototype remained local; it was not a public release.

## User experience and boundary

Settings → **Local Axwise specialist** is optional and defaults off. When enabled,
Goose can call local interview analysis, PRD and bounded synthetic-interview
tools. It retains conversation, tool-selection and approval control. Ordinary
chat/weather/search/repository work is not routed through Axwise. Workflow,
validation and artifacts are local; selected model inputs still use the existing
authenticated Gemini gateway. This is not offline inference.

Analysis and PRDs now have bounded review/repair and an exact saved-analysis
reference handoff, without retyping the evidence. Review is not semantic truth
verification; PRDs remain drafts. Private stage checkpoints do not provide
automatic restart/resume. No new API deployment, IAM change, RBAC/billing change
or GCP service retirement was needed or performed.

## Comparison and verification

See [the full evaluation](./LOCAL_AXWISE_QUALITY_EVALUATION_2026-09-23.md), including
retained failed trials and the predeclared release gate.

- Four repeated complex analysis → PRD chains passed after targeted fixes.
  Independent blinded model review found one slight semantic loss, one tie and
  two modest wins. The clear specialist benefit is auditability and reusable
  source/finding/requirement links, not universally better prose or faster answers.
- Matched inner-model comparison: direct draft 13–16 s; staged specialist 37–42 s.
- Actual native Goose chain: off/direct 28.948 s; on/specialist 65.022 s. Both
  completed. Selected interview input exactly matched the original JSON fixture; two saved
  artifacts had an exact matching operation-ID/file-hash handoff. This was a
  guided integration check, not a natural-routing accuracy benchmark.
- Final unmodified arithmetic/weather on/off checks: 4/4 passed, zero Axwise
  proposals/calls. Weather off/on 3.981/5.032 s. Earlier bounded-harness denials
  remain documented; this small sample does not establish latency equivalence.
- Fixed a real Goose CodeMode dependency bug: enum-list types were incorrectly
  emitted without union grouping. The pinned, licensed generator patch preserves
  JSON schemas and validators; all 28 generator tests pass.
- 95 Node, 54 local Python, 3,096 workflow backend, 1,268 desktop and 13 packaging
  tests passed. Three backend integrations were explicitly skipped. The earlier
  70-test website check and final 29-test release-metadata/landing check passed
  (overlapping suites, not additive). TypeScript, Rust formatting and full
  workspace Clippy passed. Local JEV pre-commit review skipped for missing key;
  no JEV review success is claimed.
- The actual signed app bundle passed PRD, analysis and simulation MCP smoke
  requests. Nested signatures, runtime manifests, DMG filesystem and mounted app
  version 2.3.13/build 5680 were verified. Signing is the existing ad-hoc preview
  policy, **not Apple notarization**.

## Artifacts and committed source

- Installer: `https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-23-v2.3.13/Orqanix-Preview-macOS-arm64.dmg`
- Checksum sidecar: same URL plus `.sha256`.
- Size: `429359750` bytes.
- SHA-256: `ec61e7776be58a628f98182d7ea47e6c0ac0b3744274e0b7aa5fb55c7a5c0c48`.
- Axwise runtime source: `52388b3bc709a0a8a4d93e4211b7d171aaa09c24`.
- Desktop/fork source: `40684d75327c0705a1b335e8388dd05ae266eae6`.
- Native binary SHA-256: `681eb3aa14e01c882ba30cd9ebb14f2eac4cce52f2b51c29787995d70ef115f8`.
- Website/build source: `0ced6cd0`.
- Both runtime source receipts are committed and release-eligible. Repositories
  were fast-forwarded on the authorized `vitalyvishnevsky` remotes only; nothing
  was pushed to `AxWise-GmbH/axwise-flow`.

Local app:
`/private/tmp/orqanix-release-2313-5680/Orqanix-darwin-arm64/Orqanix.app`.
The user's installed/running app and profile were not replaced. Unrelated dirty
files in the workspace were preserved.

## Cloud publication

Project `axwise-v2-preview-001`, region `europe-west4`:

- Build: `e16991d0-9192-40a9-9a2d-b7b949bfde89`, SUCCESS.
- Image: `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-web@sha256:7f0748dcf0274a0aa940b89a375647dbf824663d462af07d71a5908e2797e639`.
- Website revision: `orqaly-v2-web-preview-axwise2313-0ced6cd0`, 100% traffic.
- Existing revision tags, service account and runtime configuration preserved.
  The service pinned its previous revision, so traffic was explicitly switched
  to the exact new revision after verifying its image.
- Public installer streamed back: HTTP 200, exact byte count and SHA-256 above;
  public checksum sidecar matched.
- Both domains returned HTTP 200 and served `assets/index-CKQrJDfx.js` containing
  version 2.3.13, the exact installer URL and byte size. Build number was checked
  in the actual app plist; unused metadata may be tree-shaken from the web bundle.
