# Orqaly + AxWise: one source, coordinated preview release

This repository is the source of truth for both applications. Runtime services
remain separate: Orqaly owns identity, execution and delivery; AxWise owns the
cognitive operations. Consolidation does not change application behavior or apply
database migrations.

## Source layout

| Component | Source | Preview services |
| --- | --- | --- |
| AxWise | `backend/` | `axwise-v2-preview`, `axwise-v2-worker-preview` |
| Orqaly API and worker | `apps/orqaly/server/`, `apps/orqaly/lib/` | `orqaly-v2-api-preview`, `orqaly-v2-worker-preview` |
| Orqaly web | `apps/orqaly/src/` | `orqaly-v2-web-preview` |

Both existing CI suites run from the repository root. Orqaly keeps its own npm
lockfile; AxWise keeps its Python dependency locks. No additional monorepo package
manager or orchestration service is required.

The imported baselines are AxWise `bc9288afb9d0077b74f7961136bdaafbb1158884`
(merged with its history) and Orqaly
`4679d4babb507e3c04cbcd6c5059b4aa969a90b8` (selected tracked source imported
under `apps/orqaly/`). Orqaly's imported tree before release-path adaptations was
`8c6d603e18fe569dd209517365bd9a91ffe416ea`: 3,994 files, 54,873,812 bytes.
Local credentials, dependencies, generated build results, scratch projects and
untracked files were not imported. Earlier checkouts are historical references,
not release inputs.

## Build the shared release

Use a clean checkout of the selected monorepo commit. A temporary Git worktree
is sufficient when the development checkout has unrelated edits; do not stash or
discard those edits. Install Orqaly's locked dependencies there with `npm ci`.

```sh
CLERK_PUBLISHABLE_KEY_VERSION=1 \
BUILD_ATTESTATION_OUTPUT=/absolute/external/release/build-attestation.json \
bash scripts/build-monorepo-preview.sh
```

The entrypoint pins the preview project and API origin, builds all three images
from the same Git commit, and records immutable image digests plus verified Cloud
Build/source evidence. The web and service images use an app-relative Orqaly
archive; the AxWise image uses the backend from the same monorepo revision.
Builds do not deploy, read private secret payloads locally, or modify databases.

## Update an existing preview

Deploy the attested image digests as one coordinated release, not an atomic
multi-service transaction. Keep the previous revisions for rollback.

1. Record the five services' current revisions, traffic (including tags), IAM,
   environment and scaling. Confirm no active Goal runs during worker rotation.
2. Pause both workers and confirm their old instances have drained. Stage the
   five new revisions with `--no-traffic`, changing images only.
3. Select the new worker revisions while paused; switch the APIs; restore each
   worker's previous scaling and verify actual startup. Then switch the web.
4. Compare configuration and access policies with the recorded baseline; verify
   authenticated Goals and a saved result in the browser. A source-layout-only
   release does not require repeating every content benchmark.

Do not use `apps/orqaly/infra/gcp/workflow-v2/deploy-preview.sh` as an image-only
updater: it is the broader provisioning/configuration workflow. Do not reapply
schema or bootstrap scripts merely because files moved into this repository.
Production is outside this preview release.

## Goose boundary

Keep Goose as a separate fork, with its own upstream remote and stable-release
updates. Keep the Orqaly/AxWise API or extension adapter and its contracts here.
That lets this backend release together without making upstream Goose merges
part of every backend change. Goose has not been imported or deployed by this
consolidation.
