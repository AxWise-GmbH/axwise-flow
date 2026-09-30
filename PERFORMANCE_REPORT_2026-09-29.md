# Reliability and performance measurements — 2026-09-29

> Subsequent native migration: AST/LSP, hashline edits and safe edit/test now run inside Goose. OMP has been retired. See [the native integration and controlled benchmark report](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_ENGINEERING_REPORT_2026-09-29.md). The measurements below remain the historical experiments they describe.

**The repaired public Python runtime is more reliable on the tested workloads. An overall speed improvement is not established.** Standard generation and desktop lane classification have similar observed latency. Correct deep review takes longer in these samples. Two-person simulation now produces a valid result with overlapping provider calls; the old version failed to assemble its result, so it is not a valid successful-work speedup baseline.

This report separates public Python runtime changes, the desktop decision-service component, and the installed Goose engineering route. The edited desktop source has not been packaged or deployed by this task.

**Model clarification:** these are not Gemini 3.0 measurements. The Python harness explicitly selected `gemini-3.8-flash`. The existing hosted desktop gateway also defaults to `gemini-3.8-flash` in [goose-provider-http.js](/Users/admin/axwise-opensource/axwise-flow-oss/apps/orqaly/server/workflow-v2/goose-provider-http.js:167) and replaces the incoming `orqaly-gemini` alias at line 336; its production factory supplies no model override. Recorded primary responses reported 3.8. The separate generic Goose Gemini OAuth provider's `gemini-3-flash-preview` default does not select the Orqanix hosted route. This gateway mapping predates these repairs.

## Live public Python runtime

Real `gemini-3.8-flash` requests, identical synthetic inputs, three paired repetitions per workload, isolated state, alternating revision order, and source snapshots. The baseline is Axwise commit `21009d825aa64bf99eab42c7ee465f0597c7e214`; the repaired snapshot matches the edited runtime in this checkout. Remote persistence inspection was disabled equally in both arms. Jev deep review used the production ContextVar feature flag and real HTTP transport.

| Workload | Before | Repaired | What the timing supports |
| --- | --- | --- | --- |
| Standard discovery; Jev off | 3/3 completed; median **8.55 s** | 3/3 valid; median **7.98 s** | Similar small-sample generation time; no general speed claim |
| Deep discovery; Jev off | 2/3 completed; median **13.29 s** among completions | 3/3 valid; median **15.16 s** | Repaired path slower in this sample, with an actual bound review |
| Deep discovery; Jev on | 3/3 completed; median **13.51 s** | 3/3 valid; median **15.85 s** | Jev abstained in every trial; LLM fallback remained necessary |
| Deep simulation; two participants | 0/3 completed; cohort aggregation failed | 3/3 valid; median **5.80 s** | Working concurrent cohort execution; no valid successful baseline for a speedup ratio |

All **12/12 repaired outputs** passed independent artifact/Markdown validation and exact saved-file/reference/database hash checks. Before repair, eight operations returned a result, but all eight had incorrect saved-file reference hashes. The five completed deep-discovery outputs also lacked a review bound to the actual candidate. One baseline Jev-off discovery request received provider HTTP 503; that is an external availability failure, not evidence that the code repair fixed provider availability. Three baseline simulation failures were cohort assembly errors.

“Valid” here means the recorded structural, review-binding, and persistence contracts passed. It does not mean an independent human established factual or complete product quality. These deliberately selected regression workloads cannot estimate a production failure rate.

All **six eligible Jev-on operations** reached the actual service, returned HTTP 200 from `jev-1.13.0`, and reported uncertainty. Jev HTTP time ranged from 547 to 698 ms, with a median of 567 ms. All used LLM fallback. For the repaired runtime, Jev-on was **15.85 s** versus **15.16 s** with Jev off, with two Gemini calls per operation in both groups. No call-saving or latency benefit from the Jev fast path was observed. These are separate stochastic samples, not a precise estimate of the flag's overhead.

The first six Jev-on trials had a harness credential-isolation error and made no Jev HTTP requests. They were preserved as excluded trials and rerun after correcting the harness. They are not evidence of a product or Jev outage. Total Python benchmark traffic was **52 Gemini attempts**, including **11** from excluded trials, plus **six** eligible Jev calls. Exact prompts, outputs, usage, HTTP receipts, source hashes, exclusions, and audits are retained in [runtime-live-results.json](review-evidence/2026-09-29/performance/runtime-live-results.json).

## Live desktop lane-classification component

The original and repaired production decision-service modules handled the same five labeled prompts three times each. Revision order alternated. Enabled arms made real Jev requests; disabled arms made none. This measures the service component, excluding Electron, authentication, desktop-to-server transport, downstream generation, and OMP.

| Metric | Before | Repaired |
| --- | ---: | ---: |
| Correct classified lanes | 15/15 | 15/15 |
| Median enabled latency | **255.42 ms** | **258.43 ms** |
| Maximum observed latency | 396.24 ms | 316.66 ms |
| Provider errors / service timeouts | 0 / 0 | 0 / 0 |

All 30 HTTP responses reported `jev-1.13.0`, requested through `jev-latest`. The paired median difference was −4.63 ms, while the separate group median increased by 3.01 ms; neither descriptive difference establishes a speed improvement. Enabling classification adds roughly a quarter-second component call on these prompts. This experiment does not measure any downstream time saved by better routing.

Consumer acceptance is inferred from the desktop policy, not observed in a renderer. All requests were well below both the old 1200 ms and repaired 2500 ms client budgets. These samples therefore do not demonstrate the deadline repair's behavior near the boundary; the regression tests cover that contract. The feature flag does not change the model's thinking effort.

Raw evidence: [desktop-flags-results.json](review-evidence/2026-09-29/performance/desktop-flags-results.json).

## Installed Goose engineering feature flags

The engineering experiment uses the installed Goose ACP binary with the packaged engineering MCP and OMP runtime. It runs a four-cell `(OMP, Jev)` matrix, twice, reversing the second-round order. Each turn starts in an identical disposable repository. The task is to make `average([])` return zero, preserve ordinary means and input immutability, and add an empty-input regression test. Independent acceptance checks the behavior, runs the written test, and verifies that this test rejects the original buggy implementation.

The same conditional prompt explicitly selects OMP when available; this is a controlled delegation comparison, not a claim about organic tool selection. Native tools remain available in every arm. Axwise and Electron pre-turn routing are outside this experiment. With OMP off, Jev has no review to perform here. With OMP on, the packaged `--jev-enabled` setting controls engineering evidence review.

Here, native tools means Goose's existing developer tools. The extracted `ast_search`, `hashline_edit`, `lsp_query`, and `safe_edit_and_test` JavaScript helpers are not mounted in the managed Goose registry or included in the installed connector payload. The earlier “retire OMP” commit changed UI/prompt descriptions but left the OMP launch path intact. This experiment therefore does **not** measure the intended integration of those four helpers into Goose. Completing that integration remains separate work.

**All eight final trials passed** the independent behavior, test, and mutation checks.

| OMP | Jev | Accepted | Mean successful turn | Observed range | Engineering review |
| --- | --- | ---: | ---: | ---: | --- |
| Off | Off | 2/2 | **17.56 s** | 16.57–18.54 s | No delegated review |
| Off | On | 2/2 | **16.12 s** | 15.23–17.02 s | No delegated review; flag has no effect in this harness |
| On | Off | 2/2 | **48.73 s** | 44.19–53.28 s | Unevaluated, `disabled_by_user` |
| On | On | 2/2 | **48.32 s** | 44.53–52.11 s | 2/2 advisory passes from `jev-1.13.0` |

**OMP delegation was slower for this small edit.** Every final output passed the same acceptance checks, so this experiment shows no acceptance benefit from delegation on this fixture. It does not measure larger or more difficult engineering work. The two Jev reviews reported 269 and 291 ms of service latency. OMP/Jev-on receipts had `verified: true`; OMP/Jev-off receipts honestly had `verified: false` despite passing local tests. The similar delegated turn means do not establish that Jev speeds execution up or has zero overhead.

Turn timing excludes separately recorded authentication and session/MCP setup. Primary requests used the `orqaly-gemini` alias and returned `gemini-3.8-flash`. All observed primary HTTP requests transmitted `reasoning_effort: high`, although ACP displayed effective effort as `off` for the opaque alias; server-applied effort is not independently verified. Nested OMP used the fixed packaged model alias and requested high effort. There were **53 successful primary HTTP requests** across the final matrix. Nested OMP model-call totals and complete token/cost accounting are unavailable; fewer outer calls do not prove less total model work.

Raw final evidence: [desktop-engineering-flags.json](review-evidence/2026-09-29/performance/desktop-engineering-flags.json).

Two harness calibration problems were corrected before the final matrix: duplicated account headers caused HTTP 403, and an ACP tool-name mapping mismatch rejected valid tool permissions. Those attempts are excluded, not counted as product failures or fast completions. Their raw records are preserved in [desktop-engineering-blocked-harness.json](review-evidence/2026-09-29/performance/desktop-engineering-blocked-harness.json) and [desktop-engineering-permission-calibration.json](review-evidence/2026-09-29/performance/desktop-engineering-permission-calibration.json). The final matrix stops on any further harness denial.

The calibration records contain 16 rejected HTTP attempts from the header issue and 18 saved HTTP attempts from the permission issue. An interrupted calibration fixture did not flush its request count, so these are a **lower bound**, not a complete billing total. No further harness errors occurred in the final matrix.

## Controlled regression replay

Two hundred offline operations used identical provider responses in before/after snapshots: five workloads, ten pairs each, at zero and 50 ms artificial provider delay. The real engine, kernel, and storage ran; only the provider was deterministic. Timing excludes process startup and the independent audit.

The repaired runtime met **100/100 expected outcomes: 80 valid publications and 20 correct rejections**. This provides stronger causal evidence for the repairs than the small stochastic live sample.

| Workload, 50 ms provider delay | Before median | Repaired median |
| --- | ---: | ---: |
| Standard generation | 57.61 ms; bad saved-file hash | 58.67 ms; valid |
| Deep fallback review | 110.39 ms; unbound review / bad hash | 113.68 ms; valid |
| Schema repair | 57.43 ms; failed | 113.63 ms; valid after repair |
| Two-person simulation | 110.53 ms; failed | 62.74 ms; valid with concurrent calls |
| Failed quality review | 110.02 ms; incorrectly published | 225.91 ms; correctly rejected after bounded repair |

At zero provider delay, standard generation increased from 5.67 to 6.35 ms, about 0.69 ms of additional local work. Repairs and proper review can legitimately require more model calls and time. A fast invalid publication is not a successful performance baseline.

Raw evidence: [runtime-ab-results.json](review-evidence/2026-09-29/performance/runtime-ab-results.json).

## Why the behavior changed

The runtime now runs independent cohort calls concurrently and validates the assembled cohort in [engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:224). Deep review and bounded repair enforce the candidate's actual contract before publication. This can add necessary provider work instead of returning a false pass. [storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:219) hashes the exact persisted bytes, and lookup checks that same immutable file.

The desktop's stronger validation rejects uncertain or malformed advice in [decisionTypes.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/decisionTypes.ts:22). The tested live classification samples were already clear and quick in both versions, so they do not exercise those failure protections. The broader implementation changes and 640 passing regression checks remain documented in [FIX_REPORT_2026-09-29.md](FIX_REPORT_2026-09-29.md).

## Reproduction and scope

Runnable commands and flags are documented in [scripts/BENCHMARKS.md](scripts/BENCHMARKS.md). The harnesses preserve provider failures, source identities, actual flag effects, and independent outcomes. Credential values are not included in the reports. Live inputs were synthetic, and engineering edits run only in disposable fixture repositories.

The Python Jev branch is separate from the packaged desktop's Node Axwise runtime. Python results must not be attributed to the desktop Axwise flag. Small samples cannot establish a stable p95, a production reliability percentage, or an overall speedup. No cost estimate is inferred from missing usage or hidden nested model calls.
