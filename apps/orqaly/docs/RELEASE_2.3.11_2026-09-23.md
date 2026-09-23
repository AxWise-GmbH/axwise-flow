# Orqanix 2.3.11 — 23 September 2026

Published macOS arm64 preview: **2.3.11, build 5678**. This is the Goose-controlled
reset, without mandatory Axwise desktop orchestration. OMP starts off through a
one-time migration; JEV and other preferences are preserved, and later OMP toggle
choices persist. Optional engineering review remains available independently of
the removed legacy desktop routes.

## Artifacts and source

- Installer: `https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-23-v2.3.11/Orqanix-Preview-macOS-arm64.dmg`
- Checksum sidecar: same URL plus `.sha256`.
- Size: `384439827` bytes.
- SHA-256: `6439b23bf4e99d61da120b7716eb664c52bbca1a1b64b33afe83d494de7ab755`.
- Fork source: `b38eba3a1564c49dbbc480d44ae8f1d30af45b7d` (clean release source).
- Native binary SHA-256: `72964d57e2bf0997028057ddd77707c83ed92914b99aaf97fdfec162bf0d67ff`.
- Utility source provenance: committed source `bb7f24473b348363b3a8b70c9ed20a5a4081a6ee`.
- Backend/site source: `b301e07a`, including deployment dependency fix.
- Signing: established ad-hoc preview signing, **not Apple notarization**.

No installed local app was overwritten. Packaging used a separate output
directory while the user's local preview remained running. Release source was
committed locally; this publication did not push GitHub branches.

## Cloud publication

Project `axwise-v2-preview-001`, region `europe-west4`:

| Target | Revision / immutable image digest |
| --- | --- |
| `orqaly-v2-api-preview` | `orqaly-v2-api-preview-reset2311-b301e07a`; `sha256:329ad0f88f5248c1f524b9f41a3a56388d9e5dbbbfafa7df3b396aa83790c842` |
| `orqaly-v2-web-preview` | `orqaly-v2-web-preview-reset2311-b301e07a`; `sha256:af8db7ee7cea3644015d0027d210392621161bd61cbdf2153b5331a3f21f879e` |

Both services report Ready and serve 100% of their traffic on these revisions.
Both `orqanix.com` and `preview.orqanix.com` map to the same website service.
The API explicitly sets `ORQALY_GOOSE_LEGACY_WORKFLOW_ROUTES=false`. Other
runtime configuration and IAM grants were preserved.

Successful build IDs: API `18e3a521-ff46-473e-8446-2b96e246bd69`; website
`fa63b699-fc12-4fc2-bb13-a3412cdd7d25`.

Two candidate failures were corrected before publication: the first cloud build
used the default identity instead of the existing release build account; the
first API candidate lacked the deployed Markdown parser dependency. The pinned
dependency is now in the deployment lockfile, and the image build imports the
desktop provider module to catch this class of missing dependency before rollout.
The previous API revision continued serving during the failed candidate rollout.

## Verification

- 125 targeted desktop tests, 86 backend tests, and 34 utility/benchmark tests passed.
- Eight native/runtime packaging tests passed; Rust formatting and release Clippy
  passed. Native build provenance is clean and release-eligible.
- DMG filesystem verification and nested application signatures passed.
- Public installer was streamed back and matched the exact SHA-256 and size;
  the public checksum sidecar matched too.
- Both public website domains returned 200 and served version 2.3.11 with the
  matching installer URL and byte size.
- Live OAuth session: 200, account-scoped. Missing authorization: 401. Wrong
  account binding: 403.
- Live chat: 200 with assistant text, 2.21 s.
- Live search: 200, partial evidence with two sources, 4.39 s.
- Live JEV disposition: 200, classified `steer`, 0.63 s.
- Optional engineering review: 200 and correctly `not_evaluated` for synthetic
  incomplete evidence. This proves route compatibility, not a live OMP edit run.
- Removed legacy desktop `/work` route: 404.

These API timings are individual smoke checks, not an end-to-end benchmark or a
claim of search accuracy. The known latest-local-news selection limitation from
the local comparison remains. Build/checksum fields not used by the website UI
are tree-shaken; the displayed version, exact download URL and size are checked
in the served website bundle, while build number is checked in the app's plist.

## GCP scope

No legacy service, schedule, database or stored data was disabled or deleted.
See `GCP_RESET_DEPENDENCIES_2026-09-23.md`: normal desktop requests no longer need
the legacy workers, but the current API entrypoint still bootstraps SQL and the
old workflow stack. Extracting a genuinely thin server is the next prerequisite
for scoped retirement; auth/RBAC/billing redesign is not part of this release.
