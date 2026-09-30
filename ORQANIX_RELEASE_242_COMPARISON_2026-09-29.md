# Released Orqanix 2.4.2 versus actual Rust-native tools — 12 live runs

The **actual released 2.4.2 engineering-on configuration finished this batch faster overall than the native candidate**: 520.840s versus 693.359s. Native took **33.1% more time** than release-on and **26.0% more time** than release-off. All 12 tasks passed the independent correctness gates and completed cleanly. This does not establish a reliability advantage for either build.

The crucial finding is **zero OMP calls across all four release-on runs**. Goose used its ordinary tools even though OMP was mounted and advertised. These measurements compare the configurations the user experiences; **OMP execution speed remains unmeasured**. The enabled configuration's result cannot be credited to OMP execution. Prompt/tool-availability differences and run-to-run model latency can affect results without selecting the optional tools.

| Task | Released 2.4.2, engineering off | Released 2.4.2, engineering on | Actual native candidate | Correctness |
|---|---:|---:|---:|---|
| Simple: numeric validation and edge cases | 204.487s | 170.601s | 312.717s | 3/3 pass |
| Medium: asynchronous route errors | 72.899s | 68.216s | 130.072s | 3/3 pass |
| Complex: internal rename, stable external fields | 96.038s | 117.221s | 97.226s | 3/3 pass |
| Large: 14-file rename with unrelated files | 177.008s | 164.802s | 153.344s | 3/3 pass |
| **Total across four tasks** | **550.432s** | **520.840s** | **693.359s** | **12/12 pass** |

Native won the large task: 13.4% less time than release-off and 7.0% less than release-on. It was within 1.2% of release-off on the complex task, and faster than release-on there. It was substantially slower on the small numeric task and the medium task. The small numeric task has edge-case reasoning requirements; number of files does not predict model latency.

| Recorded work | Release off | Release on | Native candidate |
|---|---:|---:|---:|
| Model requests (includes Goose background requests) | 135 | 129 | 117 |
| Accumulated input tokens | 3105725 | 2707426 | 3938581 |
| Native tool calls | 0 | 0 | 35 |
| OMP calls | 0 | 0 | 0 |

The candidate made fewer model requests but sent 26.8% more accumulated input tokens than release-off and 45.5% more than release-on. This is evidence of larger repeated model inputs, not a direct measurement of their causal latency cost. A single native medium-task model request took **73.419s**, versus 13.993s for the slowest release-on request on that task. That outlier is included in the totals. Model HTTP durations account for most of the observed wall time; they include provider generation, transport and streaming, not just model reasoning. Background requests can overlap.

Native tools were selected on all four tasks: **34 `hashline_edit` calls** (7 batched reads, 5 single reads, 22 edits) and **one `safe_edit_and_test`**. No AST or LSP calls were selected. The guarded edit-and-test call returned a verified result and passing tests; its ACP interval was about 100ms. These runs support evaluating the guarded editing workflow, not AST/LSP speed or effectiveness. The release-on arm recovered from two tool errors; all final checks passed, so this is not evidence of a general reliability difference.

Every task passed behavioral checks, TypeScript checking, public tests, its added regression test, original-bug mutation detection, immutable-input checks and allowed-file-scope checks. There were no task timeouts, request-budget stops, authentication rejections or unsettled telemetry. All **381 model responses** identified **`gemini-3.8-flash`**. Fifteen model streams were recorded as cancelled after a successful HTTP response with verified model identity and usage; those transport records are preserved, and all ACP tasks completed cleanly.

Reference identity: installed Orqanix **2.4.2 (5707)**, Goose SHA-256 `bef41ad1617fbe49fb6ef848858a12ee9b1eb335be012a91ab71c02909f967c7`. OMP **18.2.1** and its MCP bridge remain byte-identical to the installed release. The candidate was freshly compiled in **release mode**, SHA-256 `27c173e104fa24d964d3ffd29ea0833499069434c8d7e4951ac58a040f7ad879`. The installed application was not changed. The previous experiment's local Rust-native “previous” binary was not used as this reference.

This used real Goose ACP backend sessions with each version's desktop standing and routing prompts, fresh fixtures/profiles, matching filesystem confinement, the same current Orqanix model router, identical outer-model default effort, and Jev/Axwise disabled. OMP's shipped high-effort setting was preserved, but no OMP model request occurred. Only its generated model transport URL and token adapter were redirected for instrumentation. Setup/evaluation and Electron UI overhead are excluded. Release-off is Orqanix's ordinary Goose configuration, not an independently built pristine upstream Goose release.

Exactly four tasks × three arms were run, with balanced ordering, a 600s deadline and 120 combined outer/nested requests per task, and no replacement model trials. A preceding local-routing setup failure made **zero model requests** and is saved separately. Five local harness tests passed. Final verification confirmed all 12 planned rows, model identities, inventories, source hashes, attribution counts and filesystem boundary checks.

One observation per task/configuration is an exploratory comparison. Provider load, automatic caching and model variation are uncontrolled. The result supports keeping the native change behind its flag while reducing model-context overhead and improving tool selection. It does not support restoring OMP as a proven speed optimization, claiming a broad quality improvement, or attributing the historical benchmark's numbers to these runs. The provenance of that specific earlier saved benchmark remains a separate question.

Evidence: [summary](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/release-242-comparison/results/summary.json), [verification](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/release-242-comparison/verification.json), [protocol](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/release-242-comparison/protocol.md), [binary identities](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/release-242-comparison/build-proof.json), [driver](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-release242-native.mjs). Sanitized per-task evidence and final solution files are under [results](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/release-242-comparison/results). Raw private recordings remain at `/private/tmp/orqanix-release242-live2-20260929`.
