# Orqanix 2.3.14 — 24 September 2026

Release candidate: macOS Apple Silicon preview **2.3.14, build 5681**.
Publication and installer verification are recorded below when complete.

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
- Rust formatting and full-workspace Clippy passed. Local JEV pre-commit review
  skipped because its key was unavailable; no successful JEV review is claimed.

These small benchmarks do not establish universal routing accuracy, latency
parity or superiority over vanilla Goose. Analysis can still need repair passes;
one initial PRD had ambiguous human-time versus system-latency wording. A
user-visible extension-mount failure indicator remains follow-up work.

## Committed runtime source

- Axwise: `6ad4826a3c976c404bdf34e2db37268213743660`.
- Desktop/fork: `4f597974e4b448a1e2f10e3170967d99b6f2350b`.
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

Pending packaged live smoke, public checksum verification, main-branch
fast-forwards and website rollout.
