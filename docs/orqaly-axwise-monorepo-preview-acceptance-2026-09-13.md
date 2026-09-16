# Orqaly + AxWise monorepo preview release

## Outcome

Source consolidation and the coordinated GCP preview rollout passed on
2026-09-13. All five services serve revisions ending `monorepo-26e447a9` at
100% traffic. The release source commit is
`26e447a9692bb97b3273d470d1e2e9aab43b8319`.

AxWise's tested history was merged into this repository. The deployed Orqaly
application was imported under `apps/orqaly/`. Application runtime source is
unchanged from the accepted AxWise `bc9288af` and Orqaly `4679d4ba` baselines.
Changes specific to consolidation are release paths, CI and documentation.

## Verification

- AxWise workflow suite: 2,904 passed, 2 skipped.
- AxWise foundation suite: 61 passed.
- Orqaly release suite: 2,414 passed, 16 skipped; the final path adjustments also
  passed the focused release suite (44 tests) in a clean monorepo checkout.
- Retained Orqaly UI suite: 442 passed.
- GCP web build and emitted-bundle isolation check passed.
- Three actual GCP builds succeeded. Their uploaded source archives, recipes,
  substitutions and immutable image digests were verified against the same
  monorepo commit.
- Both old workers were observed at zero instances before replacement, and were
  subsequently verified retired. Both new workers executed successful `/readyz`
  startup probes and were observed with one running instance each.
- Final comparison passed for all five services: expected images and 100%
  traffic; original environment, secret references, IAM, network annotations,
  template settings, scaling, and exact tag mappings. Custom metadata labels were
  not included in the comparison. No label changes were requested.
- Public API readiness returned `status=ok`, `database=ok`,
  `environment=preview`, `executionConfigured=true`; web readiness returned `ready`.
- Existing authenticated Chrome was reloaded after the web switch. Run
  `c5399f08-d34a-5a00-8afe-022bb2d6705b` still showed 11/11 stages settled and
  the same final artifact/hash, rendered report and download button. No
  application console error was observed; one unrelated browser-extension error
  was present.

This was a source-layout and release verification, not a new generation benchmark.
The previously accepted result was reused. No new Goal, model retry, schema
migration, credential rotation, IAM change or production deployment was performed.

## Release receipts

Local receipts are in `artifacts/monorepo-sep13/` (ignored operational artifacts):

- `build-attestation.json`: self-hash
  `0541164d23059bba7c0fa2eade911693d65fee411d2845d316e6912a8230c839`;
  file SHA-256 `c278d2695deb95478ef3ef5827a2b37849777cf3f42bf1a4d51e047acaa06b4c`.
- `final-release.json`: file SHA-256
  `90dff560c9b42788b3313c3ddbc71459f6ac9333490681c48b842f57ef0dd1b0`.
- `browser-verification.json`, `axwise-new-running.json`,
  `orqaly-new-running.json`, `axwise-old-retired.json`,
  `orqaly-old-retired.json`, and intermediate phase snapshots.

Cloud Build IDs: Orqaly service `36121219-b06e-432b-adaa-42bdd6513ff1`;
web `456a1483-5787-497c-b5b4-9b6e6e047504`;
AxWise `ba21abaf-0807-42e8-b1db-a658e7383886`.

The three pre-existing local edits were preserved. Earlier source checkouts and
Cloud Run revisions were retained for recovery; new builds use this monorepo.

## Next boundary

Use a separate Goose fork with an upstream remote and stable-release sync. Keep
the Orqaly/AxWise adapter here. Goose was not forked, imported or deployed during
this release. The preview source merge is on `codex/universal-agentic-foundation`;
promotion to GitHub `main` and changes to the public company remote are separate.
