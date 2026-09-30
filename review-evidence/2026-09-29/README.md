# Review evidence — 2026-09-29

These scripts reproduce observations in [the backlog](/Users/admin/axwise-opensource/axwise-flow-oss/REVIEW_BACKLOG_2026-09-29.md). They are not production fixes or a permanent regression suite: several assertions deliberately describe current bugs and should stop passing once those bugs are fixed.

Reviewed source:

- axwise-flow-oss: `21009d825aa64bf99eab42c7ee465f0597c7e214`
- orqaly-goose: `76ba53c1d23a342d0f3f7a8b1f3b57044977fbbb`
- Replay environment: Node `v26.10.0`; Python `3.11.12` using the existing backend virtualenv. No dependencies were installed for this review.

## Scope

All four probes completed successfully after being copied into this directory. External model services, credentials and Electron boundaries are mocked as described below. Source modules and their deterministic validators execute unchanged. Temporary files contain fixture data. No paid inference, production service mutation, DMG inspection, rendered Electron test or full Rust build was performed.

The Python probe disables dotenv reads and credential discovery, blocks network connections, and supplies fake providers/Jev results. Its package check imports exported engine files outside the checkout using already installed dependencies; it is not a fresh-wheel-install test.

The desktop probe imports the actual registry/dispatcher, Markdown normalizer and ACP prompt function. SDK/IPC dependencies are mocked. It evaluates the exact source decision method with mocked authentication/HTTP closure values, preserving the real 1,200ms timeout. The sync probe executes the actual source settings handler through extracted preload/main handlers with mocked IPC, plus the real ledger classes.

The benchmark probe evaluates the original benchmark body with all external dependencies replaced; its deadline check uses a real abort-aware Response/ReadableStream. No real credential file or gcloud secret is accessed.

## Evidence map

| Probe | Backlog | Captured results |
| --- | --- | --- |
| [runtime-probe.py](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/runtime-probe.py) | AX-01–AX-07, AX-19 | [runtime-results.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/runtime-results.json) |
| [desktop-probe.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/desktop-probe.mjs) | AX-08, AX-13–AX-15 | [desktop-results.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/desktop-results.json) |
| [sync-probe.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/sync-probe.mjs) | AX-09, AX-11–AX-12; context for AX-10 | [sync-results.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/sync-results.json) |
| [benchmark-router-probe.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/benchmark-router-probe.mjs) | AX-17, AX-20 | [benchmark-router-results.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/benchmark-router-results.json) |
| Distribution unittest collection | AX-19 | [distribution-tests.txt](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/distribution-tests.txt) |

AX-16, parts of AX-18, AX-21, and broader integration absence rely on the source traces or earlier offline probes documented in the backlog; the saved scripts are not claimed to cover every acceptance criterion.

## Replay

Use the two checkout paths below, adjusting them if the repositories move. The benchmark script locates its repository relative to its saved location.

```sh
AXWISE_REPO=/Users/admin/axwise-opensource/axwise-flow-oss
GOOSE_REPO=/Users/admin/axwise-opensource/orqaly-goose

"$AXWISE_REPO/backend/venv/bin/python" -B \
  "$AXWISE_REPO/review-evidence/2026-09-29/runtime-probe.py" "$AXWISE_REPO"

node "$AXWISE_REPO/review-evidence/2026-09-29/desktop-probe.mjs" "$GOOSE_REPO"

node "$AXWISE_REPO/review-evidence/2026-09-29/sync-probe.mjs" "$GOOSE_REPO"

node "$AXWISE_REPO/review-evidence/2026-09-29/benchmark-router-probe.mjs"
```

Most probes print JSON. The sync probe also refreshes its adjacent `sync-results.json`; runtime/desktop/benchmark result files were captured from stdout. Timings, UUIDs and timestamps will differ between runs.

To reproduce the separately captured **expected collection failure**, run from axwise-flow-oss:

```sh
backend/venv/bin/python -B -m unittest discover \
  -s packages/axwise-distribution -p test_distribution.py
```

At the reviewed commit this exits 1 because the test imports the removed `launcher.node_binary`. This failure is not a successful test run.

## Positive controls and limitations

The Python evidence includes successful standard discovery, Jev-passed deep review, standard two-participant simulation, deep single-participant simulation, correct cohort flattening, correct use of the quality API, environment-based provider configuration and the explicit state-directory flag. These narrow the affected paths instead of claiming the entire runtime is broken.

Desktop evidence confirms that greeting/Jev-disabled turns skip triage, fast decisions succeed, mixed guidance is emitted, and ordinary chat still submits after advisory failure. Its missing native tool names refer to the managed registry; user-installed extensions were not inspected.

Sync evidence proves the settings action reports cloud success without transport. Historical source inspection additionally shows that the misleading toast predates the latest sync commit; no previously working cloud implementation was established.

Benchmark evidence demonstrates 15 simulated failed generation requests and three unevaluated routing results producing three PASSED messages. This is a failure-handling reproduction, not a measurement of live latency, model quality or cost.
