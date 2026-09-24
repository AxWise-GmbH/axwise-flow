# Orqanix 2.3.14 — 24 September 2026

Published macOS Apple Silicon preview **2.3.14, build 5681**. Both
`orqanix.com` and `preview.orqanix.com` serve the verified download.

## What changed

The optional local Axwise specialist now exposes discovery scope and interview
questions, personas, simulated interviews, qualitative analysis, selected market
evidence analysis, PRDs, delivery briefs and persona conversations. Standard and
deep modes are supported. Goose retains conversation, tool selection and
approval ownership. Ordinary chat, weather, search and coding do not become
Axwise workflows just because the extension is enabled.

Results are saved locally as addressable Markdown/structured artifacts with
revision links. Additive PRD edits preserve existing items; removal/replacement
requires explicit targeted edits. Persona discussions receive the exact selected
document, compatible reference formats no longer cause unnecessary retries, and
host summaries link to the saved result. Interview guides remain documents, not
accidental clarification forms; result previews and citation links were repaired.

Workflow state, validation and artifacts remain local. Selected inputs still use
the authenticated Gemini gateway; this is not offline inference. Existing
synthetic-interview behavior was preserved. No new API deployment, IAM grant,
RBAC/billing change or GCP service retirement is part of this release.

## Verification and limitations

See the [desktop regression and timing report](../../../packages/axwise-local/DESKTOP_FIX_VALIDATION_2026-09-24.md)
and [expanded pipeline benchmark](../../../packages/axwise-local/EXPANDED_BENCHMARK_2026-09-24.md).

- The exact additive desktop PRD edit retained all 23 previous items and added
  one: 15.565 s versus the previous failed 32.397 s rewrite. Persona consultation
  now receives the exact PRD; its 29.569 s turnaround was not a speed improvement.
- Randomized desktop ON/OFF comparison: 12/12 ordinary turns completed with
  verified extension state and zero Axwise calls. Weather medians were 4.796 s
  ON / 4.691 s OFF. A separate weather repeat confirmed response-cache reuse.
- Expanded standard pipeline passed 9/9 checks in 119.078 s. Deep passed 9/9
  across documented resumptions, with 136.814 s of successful-stage work, not
  uninterrupted turnaround. Selected publisher excerpts, different cohorts,
  exact document context and immutable revisions were exercised.
- Local Python: 219 tests passed. Node package/benchmark/profiler: 174 passed.
  Desktop: 1,321 tests in 145 files passed, plus TypeScript and 13 packaging
  tests. Desktop release tests used supported Node 24.10.0 with local test-server
  access; preliminary Node 26/sandbox failures were environmental.
- Website release-metadata and landing checks: 29 tests passed.
- Final signed-app live integration passed 9/9 stages across all eight tools in
  86.018 s, plus 1.796 s authenticated setup. Saved JSON/Markdown hashes,
  references and persona-conversation continuation passed. Personas and analysis
  used internal repair; the harness did not retry tool requests. The first
  sandboxed setup could not access the credential store and ran no inference;
  the approved Keychain/network run passed. Post-run deep/strict signatures
  still passed. This is explicit integration, not a new routing benchmark.
- Rust formatting and full-workspace Clippy passed. Local JEV pre-commit review
  skipped because its key was unavailable; no successful JEV review is claimed.

These small benchmarks do not establish universal routing accuracy, latency
parity or superiority over vanilla Goose. Analysis can still need repair passes;
one initial PRD had ambiguous human-time versus system-latency wording. A
user-visible extension-mount failure indicator remains follow-up work.

## Committed runtime source

- Axwise: `6ad4826a3c976c404bdf34e2db37268213743660`.
- Desktop/fork: `4f597974e4b448a1e2f10e3170967d99b6f2350b`.
- Website/build source: `1f1381faff7b0776fdbb43a6fef99a1f0f370d9b`.
- Branch in both authorized forks: `codex/local-axwise-pipeline-2.3.14`.

The release uses the existing ad-hoc preview signing policy, **not Apple
notarization**. The user's installed/running app and profile are not replaced.
Unrelated local files are excluded from release commits.

## Publication evidence

- Installer size: `415185124` bytes.
- SHA-256: `4ff316a99f15eacd3ba118a30d63b070df31121d304ae7b8c345425b06a29d79`.
- Native binary SHA-256: `bef41ad1617fbe49fb6ef848858a12ee9b1eb335be012a91ab71c02909f967c7`.
- Axwise runtime manifest SHA-256: `bd504db0b8a8e68a865eb45088aba924d45b3295748f22f12aa0bcbfe836f146`.
- Both bundled source receipts are committed and release-eligible. Outer and
  nested signatures, runtime manifests and disk-image checks passed; app plist
  version is 2.3.14/build 5681, also verified in the read-only mounted installer.
- Local installer: `/private/tmp/orqanix-release-2314-5681.hZPa9k/Orqanix-Preview-macOS-arm64.dmg`.

Both release branches and remote `main` branches were fast-forwarded on the
authorized `vitalyvishnevsky` repositories only. Nothing was pushed to
`AxWise-GmbH/axwise-flow`.

Website build `b776345e-99aa-4de1-86aa-da5bef4b36fc` succeeded in project
`axwise-v2-preview-001`, region `europe-west4`, from the exact committed
`apps/orqaly` subtree. Image digest:
`sha256:677c5a57b7c477b607d736234c535cd0862724589a45f9c3fd725fb34811a890`.

- Public installer: `https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-24-v2.3.14/Orqanix-Preview-macOS-arm64.dmg`.
- Public checksum: the same URL plus `.sha256`.
- Installer streamed back over public HTTPS: HTTP 200, exact `415185124` bytes
  and SHA-256 above. The public checksum sidecar matched.
- Cloud Run website revision `orqaly-v2-web-preview-axwise2314-1f1381fa` serves
  100% of traffic. Its immutable image digest matches the successful build.
  All ten existing revision tags were retained.
- The website's runtime configuration (excluding the intentionally changed
  image) and service account remained unchanged. Before/after configuration
  SHA-256: `b2adb6ecafa3fa93e42f7686d6ba548e02472d9b42195fd87502d420cef1b060`.
- Both public domains returned HTTP 200 and served `assets/index-dWhsAcov.js`
  containing version 2.3.14, the exact installer URL, byte size and checksum-link
  behavior. Unused checksum-value metadata was tree-shaken; the linked public
  checksum file was verified independently. Build 5681 was checked in the app
  plist inside the mounted installer.

Packaged integration report retained locally:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-pipeline-zhzIJ1/report.json`.
This temporary report is verification evidence, not a user-artifact retention
promise. The public installer and committed release/benchmark notes are the
published release records.
