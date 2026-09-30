# Benchmark scope

`benchmark-axwise-e2e.py` is an **offline fixture timing** through the public FastMCP wrappers, real engine, kernel validation and SQLite. Six stages consume saved references and produce a separately validated PRD. Its responses and evidence are deterministic test fixtures; it reports no live-model latency, quality score, paid-token estimate or invented baseline. State lives in a temporary directory. The distribution tests separately extract a built wheel outside the checkout and exercise real MCP initialization/listing plus fake-provider generation.

`demo-full-discovery-tiers.py` is a kernel-fixture demonstration. Its three scenario labels reuse test candidates and synthetic reference IDs. It does not measure task complexity, live inference, persistence or quality review.

The JavaScript scripts are **live provider/helper experiments**, outside the AxWise product pipeline. They require explicitly supplied `GEMINI_API_KEY` and/or `TYPESAFE_API_KEY`; they never fetch credentials from gcloud or print any part of a key. `AXWISE_BENCHMARK_MODEL` selects the requested model. Reports preserve requested and returned model IDs, exact prompts/configuration, measured time, provider usage when returned and full generated outputs. Treat saved reports as potentially sensitive input/output data.

- `benchmark-real-creation-times.mjs` passes each generated text into later stages and reports review as `not_evaluated`. It does not use an intent classifier as an artifact reviewer.
- `e2e-matrix-benchmark.mjs` has 12 correlated cells, not an independent 24-cell factorial design. Lookup outputs reach the model. Keyword coverage is not quality validation.
- `benchmark-gemini-jev-batches.mjs` measures helper routing plus raw provider responses.
- `benchmark-jev-acceleration.mjs` exercises only connector routing and synthetic safety fixtures; it has no generative baseline or speedup conclusion.

HTTP failures, malformed/empty/truncated generation, deadlines and unavailable helper evaluations fail instead of yielding a successful report. These scripts do not validate current weather, financial facts, legal compliance, desktop behavior, or release readiness.

Offline regression commands (with public Python dependencies installed):

```sh
python -m unittest discover -s scripts -p 'test_benchmark_regressions.py'
node --test scripts/benchmark-regressions.test.mjs
python -m unittest discover -s packages/axwise-distribution -p 'test_*.py'
```

## Paired runtime and production-flag measurements

The September 29 comparison uses four separate harnesses. Results and limitations are in [the performance report](../PERFORMANCE_REPORT_2026-09-29.md), with raw evidence in `review-evidence/2026-09-29/performance/`. These measurements do not establish that the edited desktop source has been packaged or deployed.

`benchmark-runtime-ab.py` runs immutable baseline and repaired Python snapshots against identical deterministic provider responses. It exercises the real engine, kernel, and storage with isolated state. Ten paired repetitions cover standard generation, deep fallback, schema repair, cohort concurrency, and failed review at both zero and 50 ms simulated provider delay. The outcome oracle checks artifacts, review binding, and saved-file hashes. Failed or incorrectly published baseline attempts are not valid speedup denominators.

```sh
python -B scripts/benchmark-runtime-ab.py --repetitions 10 --delays-ms 0,50 \
  --output /absolute/path/to/runtime-ab-results.json
```

`benchmark-runtime-live.py` sends real requests to `gemini-3.8-flash` through the public Python engine. It compares Git baseline `21009d825aa64bf99eab42c7ee465f0597c7e214` with a frozen working-tree snapshot. Three pairs per workload use the actual `jev_request_enabled` switch, separate state, fixed inputs, and alternating revision order. A separate process audits generated artifacts and references. Prompts, outputs, usage, HTTP receipts, and source hashes are retained; credentials are not. Remote persistence inspection stays off equally in both arms. This is separate from the packaged Node Axwise runtime.

```sh
python -B scripts/benchmark-runtime-live.py --run-live --repetitions 3 \
  --max-gemini-requests 60 --credential-source "$PWD" \
  --output-dir /absolute/path/to/new-runtime-live-evidence
```

This command requires `GEMINI_API_KEY` and the normally configured Jev key. Omitting `--run-live` only prepares snapshots. Use a new output directory to preserve previous evidence. `--resume-jev` is a recovery option for the documented initial credential-isolation harness error; it is not needed for a fresh run. Those six initial trials remain explicitly excluded from the September 29 results.

`benchmark-desktop-flags.mjs` compares the real desktop decision-service module from pinned Git baseline `21009d825aa64bf99eab42c7ee465f0597c7e214` with the working-tree module. Its `run` export also accepts an explicit `baseline`. Five labeled prompts, three pairs each, and enabled/disabled controls produce 60 local operations, including 30 live Jev calls. The flag-off arm bypasses classification. Timing excludes Electron, authentication, and downstream generation. Consumer acceptance/deadlines are calculated from the desktop policy; the script does not run the renderer.

```sh
node --input-type=module -e 'import { run } from "./scripts/benchmark-desktop-flags.mjs"; await run({ destination: "/absolute/path/to/desktop-flags-results.json" });'
```

`benchmark-native-engineering.mjs` compares the native engineering flag off/on in both Goose agent loops, with two repetitions in reversed order. It uses a freshly built Goose binary, actual Tree-sitter queries and the bundled TypeScript language server. Both arms request `gemini-3.8-flash` with high reasoning effort through the Google compatibility endpoint. The identical conditional prompt requires all four native tools when available; this measures that controlled workflow, not spontaneous tool selection.

```sh
node scripts/benchmark-native-engineering.mjs --preflight \
  --goose /absolute/path/to/goose \
  --runtime /absolute/path/to/orqaly-runtime \
  --output /absolute/path/to/native-preflight.json
# After preflight passes, use --live and a new output path for paid inference.
```

The live run needs `GEMINI_API_KEY` and caps upstream requests at 120. Credentials remain in the forwarding process. Isolated profiles contain only developer tools plus the four native tools in the enabled arm. Exact tool receipts, requested/returned models, usage, failures and timing are retained. An independent behavior oracle and mutation test require a working fix and a regression test that catches the original bug. Prompt elapsed time excludes setup and the independent oracle. Eight small trials do not establish general reliability or production tail latency; Electron rendering and hosted authentication are outside this experiment.

The old `benchmark-desktop-engineering-flags.mjs` entry point is retired and exits without launching a delegated runtime. Earlier OMP measurements remain historical evidence in `review-evidence/2026-09-29/performance/`.

`benchmark-orqanix-matrix.mjs` runs the physical Electron app through its Settings switches and chat Send action. It compares all eight Jev/native/Axwise combinations on three fixed synthetic tasks, twice in reversed order (48 runs). Every run has a fresh profile and Git workspace. Tool selection is natural: availability does not imply the model used a capability.

Native-off still exposes Goose's existing Tree-sitter-backed `analyze` tool. The native flag adds the four engineering tools; ordinary shell/write/edit remain available. Native edit tools require existing files, so creating the required JSON document through `write` is expected. The medium and complex tasks include supplied interview evidence, but their detailed specifications and fixed document contracts provide limited coverage of open-ended specialist discovery or semantic document quality.

The current relay additionally records SHA-256 fingerprints of the upstream system/developer messages and tool definitions, whether native selection policy v1 is present, and whether the legacy write/edit preference remains. It retains no instruction or schema text. User-message mentions do not count as system guidance. ACP records supply actual calls, durations and results; availability and policy presence do not establish usage or correctness. Existing frozen runs predate these fields and must not be backfilled or silently resumed with changed source fingerprints.

```sh
node scripts/benchmark-orqanix-matrix.mjs --live \
  --executable "$ORQANIX_BENCH_EXECUTABLE" \
  --desktop "$ORQANIX_BENCH_DESKTOP_SOURCE" \
  --runtime "$ORQANIX_BENCH_PACKAGED_RUNTIME" \
  --output /absolute/path/to/new-desktop-matrix
node scripts/summarize-orqanix-matrix.mjs \
  /absolute/path/to/new-desktop-matrix/report.json \
  /absolute/path/to/new-desktop-matrix/summary
```

The app must already be signed in through its packaged connector. The parent process needs `GEMINI_API_KEY` and, for current local Jev routing, `TYPESAFE_API_KEY`; credentials are scrubbed from the app environment and remain in the relay. Normal account authentication is verified through the packaged API session endpoint. Gemini requests use the current local production router and require returned `gemini-3.8-flash` identity. Jev uses current service code when its key is supplied; without it, the relay explicitly records forwarding to the deployed endpoint. A 400 or an unevaluated fallback is not a successful Jev evaluation.

This matrix uses Goose autonomous mode with task instructions restricting work to synthetic files. It is not an OS security sandbox. The earlier command allow-list is retained only as diagnostic tooling: it is not applied to this matrix. All tool calls are recorded, fixture inputs and the separate oracle are checked for modification, and the oracle runs in a bounded process. Document checks verify schema, supplied evidence and examples, not semantic quality. Public tests and additional local checks are available to the model; the independent oracle is not exposed in its workspace.

Timing starts at UI Send and ends after the ACP terminal response and UI completion. App setup, independent verification and cleanup are excluded. The report records first text/activity, actual tool inventory/use, model and Jev service/provider telemetry, failures and token usage. The development app uses the verified debug Goose build and direct core tools, with Code Mode excluded; it is not a release-performance certification. Primary usage includes UI title generation. Reported streaming usage is cumulative and is counted once per HTTP request.

Use `--preflight` to check startup/settings without inference, and `--repetitions 1` for a 24-run smoke matrix. A `STOP_BEFORE_NEXT_ROW` file in the output directory stops cleanly after the active row. Resume requires the same source/build fingerprint; existing outcomes are never silently retried. Prior calibration batches remain separate and must not be mixed into the selected matrix. Two samples per cell are exploratory observations, not confidence intervals or evidence of general product reliability.

The user-requested supplemental quality audit stays separate from the original outcomes. `lib/orqanix-benchmark-quality.mjs` freezes 173 invoice, 105 ticket-summary and 138 warehouse cases from the task contract, before inspecting generated implementations. It checks additional numeric boundaries, deterministic histories, immutable inputs, stock conservation, duplicate handling and valid JSON SKU keys. `evaluateQuality(workspace, difficulty, nodePath)` runs a bounded, import-restricted child process without modifying the solution. The protocol was designed after the live matrix began and is explicitly supplemental/post-hoc. Its correlated cases are not hundreds of independent reliability trials. Report both original and supplemental results; never rewrite an original pass as if these cases had been part of the initial gate.

`lib/orqanix-document-quality-rubric.md` defines a separate qualitative review with configuration labels, timings, tool names and machine outcomes withheld. It assesses delivered explanations and requirements against the supplied evidence, with exact excerpts for defects. This is AI-assisted semantic judgment, not a human rating or proof of exhaustive correctness. Withheld test receipts make execution claims unverified, not false. Freeze reviews before joining them back to flag combinations, and report dimensions/defects rather than silently imputing unavailable scores.

### Separate actual specialist PRD pairs

`benchmark-orqanix-specialist.mjs` uses the same Electron Settings/Send procedure for three new synthetic full-PRD tasks. It compares one primary-only and one Axwise-enabled run per difficulty, with Jev and native engineering fixed off. The identical conditional prompt requires exactly one real `create_prd` call when registered, followed by a faithful export of its accepted artifact. With the tool unavailable, the primary agent authors the same complete PRD schema directly. The export must match the returned artifact; a failed specialist operation cannot be replaced with an unreported primary fallback.

`lib/orqanix-specialist-tasks.mjs` freezes the briefs, evidence, schema/provenance rules and independent checks. `lib/orqanix-specialist-quality-rubric.md` is frozen before generation and evaluates evidence meaning, constraints, decisions, acceptance criteria and honest unknowns through a blinded AI review. Structural checks and the specialist's internal model critique are separate evidence. The internal critique remains active with Jev off: it is part of Axwise's generation/review/repair pipeline, not Jev lane selection.

Run the specialist harness using the same absolute `--executable`, `--desktop`, `--runtime` arguments as the matrix, a separate `--output`, `--live --repetitions 1 --timeout-seconds 600`. Summarize its report with `node scripts/summarize-orqanix-specialist.mjs report.json output-directory`. The report retains actual tool receipts, generation/review/repair timings, failures, missing telemetry and model identities. One pair per task provides descriptive case evidence only. Never pool this controlled-use experiment with the natural-tool-choice coding matrix.


### Twelve-trial native-selection comparison

`benchmark-orqanix-selection.mjs` records the original 24-turn protocol; `benchmark-orqanix-selection-normal.mjs` records the final six rows with the ordinary Rust action budget. They use the actual Electron Settings/Send path, native on and Jev/Axwise off, the old and rebuilt debug binaries, fresh TypeScript fixtures, and the same bounded model/runtime configuration. The prepared temporary app wrappers select the Rust binary and apply the per-row filesystem boundary. Do not point these drivers at an installed app or claim they modify production settings.

`lib/orqanix-selection-tasks.mjs` supplies task contracts and independent behavioral/compiler/regression checks. `calibrate-orqanix-selection.mjs` verifies seeded defects and known-correct implementations offline. `lib/orqanix-selection-sandbox.mjs` validates thirteen file-access sentinels per row. `lib/orqanix-scoped-benchmark-relay.mjs` keeps real OAuth credentials in the parent, limits the child capability to sixty local chat-completion requests, and revokes it per row. Its mock test covers endpoint scope, expiry, request count and revocation; it is not a full network sandbox. A live baseline encountered authenticated-session rejection; full-trial credential freshness remains a harness limitation.

Summarize each set separately with `summarize-orqanix-selection.mjs` and absolute input/output paths. A terminal ACP response is not necessarily successful completion: record action-limit messages, independent correctness and regression-test presence separately. Preserve failed model attempts and pre-inference setup failures. The report is `ORQANIX_NATIVE_SELECTION_BENCHMARK_2026-09-29.md`, with frozen protocol/source, hashes, sanitized receipts and solutions under `review-evidence/2026-09-29/native-selection-ab/`. Do not pool the two action budgets or compare these times directly with the earlier 48-task flag matrix.


## Native efficiency screening (completed September 29)

`benchmark-orqanix-efficiency.mjs` compares default Goose/native off, the preserved previous build/native on, and the optimized build/native on across four calibrated TypeScript tasks (12 model trials total). `calibrate-orqanix-efficiency.mjs` validates the independent behavior/type/test/mutation checks; `summarize-orqanix-efficiency.mjs` exports sanitized results and matched comparisons. See `../NATIVE_EFFICIENCY_BUILD_2026-09-29.md` and `../review-evidence/2026-09-29/native-efficiency/protocol.md` for the frozen protocol and current execution status.

Use normal local Keychain access in the parent, with refresh during long trials; never put a Keychain password or cloud OAuth credential in the benchmark child environment or artifacts. The confined backend receives an expiring, model-only localhost capability. A newly copied macOS app may separately require a native Keychain item permission even when the login Keychain is unlocked. Complete that system dialog locally before running timed trials. Preflight makes no task model requests and is recorded separately.


`benchmark-goose-efficiency.mjs` is the explicit backend alternative when protected macOS prompts prevent the Electron preflight. It uses the same three-arm/four-task schedule and fixtures through Goose ACP stdio, the same Orqanix production model router, packaged auth command, scoped capability, language servers and matched tool inventory. It never launches Electron or claims UI timing. `summarize-goose-efficiency.mjs` exports that batch separately. The protocol amendment and frozen sources are under `review-evidence/2026-09-29/native-efficiency/backend/`. Do not combine backend and desktop times.

The completed 12-trial backend result is in `../ORQANIX_NATIVE_EFFICIENCY_BENCHMARK_2026-09-29.md`: all final-code evaluations passed, but only 11 trials completed cleanly. The previous build's large task exhausted its 60-request model budget despite ACP returning `end_turn`. The candidate missed the speed target (+29.7% elapsed time versus default), and that exhausted reference is excluded from successful-completion comparisons. `lib/orqanix-efficiency-outcome.mjs` classifies completion separately from the frozen raw correctness flag; its regression tests prevent the terminal-error false positive. `verify-goose-efficiency.mjs` checks the exact plan, frozen source hashes, model/policy/inventory, boundary probes and settled telemetry; it exits nonzero if those invariants fail. A passing protocol verification does not imply all trials completed successfully. Generated regression tests must detect restored original defects as well as pass the final implementation. The sanitized final outputs and verification are in `../review-evidence/2026-09-29/native-efficiency/backend/`; intermediate failed tool calls and HTTP cancellations remain visible.


Released Orqanix 2.4.2 comparison (2026-09-29): `benchmark-release242-native.mjs`, `summarize-release242-native.mjs`, `verify-release242-native.mjs`. Four frozen tasks × installed release engineering off/on and release-mode actual native candidate, 12 live tasks. [Results](/Users/admin/axwise-opensource/axwise-flow-oss/ORQANIX_RELEASE_242_COMPARISON_2026-09-29.md). Frozen protocol, source/binary identities and sanitized evidence: `review-evidence/2026-09-29/release-242-comparison/`. All pass; native slower in aggregate but faster on the large task; no OMP/AST/LSP calls selected. Do not use this as an OMP execution benchmark or compare these totals to the earlier debug-build batch as an isolated release-mode effect.

## Native AST/LSP semantic integration (2026-09-29)

`benchmark-orqanix-semantic.mjs` runs twelve actual Electron Settings/Send trials: the installed 2.4.2 Goose backend with engineering off versus the native semantic candidate, three workloads twice each in counterbalanced order. Both arms use the same current desktop UI. Natural prompts do not prescribe tools. `calibrate-orqanix-semantic.mjs` checks the independent evaluator against original and known-correct implementations before inference. `summarize-orqanix-semantic.mjs` reports correctness, timing and semantic-tool adoption; `verify-orqanix-semantic.mjs` checks source/binary provenance and model identity. The separate `self-test-native-semantic.mjs` runs the native phase of the Goose self-test recipe and is not part of the timed comparison.

The frozen protocol is in `review-evidence/2026-09-29/native-semantic-v3/PROTOCOL.md`. A successful correctness result alone does not satisfy the performance acceptance gate. Keep all failed and slower trials.


## Native operations v4 (September 30)

`benchmark-orqanix-operations.mjs` runs twelve actual desktop trials using the same rebuilt Goose binary with native tools off/on. `summarize-orqanix-operations.mjs` treats tool adoption as diagnostic and checks correctness in both arms plus total/per-task speed. `verify-orqanix-operations.mjs` checks the same-binary requirement and frozen provenance. See `review-evidence/2026-09-30/native-operations-v4/PROTOCOL.md`. Frozen earlier semantic benchmarks remain separate.
