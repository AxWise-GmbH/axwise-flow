# Native Goose efficiency benchmark — September 29, 2026

**Baseline clarification:** “previous” below means an earlier locally modified Rust-native build, not the untouched Orqanix 2.4.2 release the user intended as their historical reference. The default arm also uses that local binary with native tools off. Installed 2.4.2 still bundles the OMP-backed engineering path. Consequently this experiment cannot establish a speedup or regression relative to the user's released 2.4.2 configuration. See the [baseline identity receipt](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/benchmark-reconciliation/2.4.2-baseline-identity.json).

The rebuilt candidate passed all four workloads, but missed the speed target: **29.7% slower than default Goose** across the same four tasks. It was also slower in each of the three clean comparisons with the preserved previous native build. All three configurations produced code passing 4/4 independent checks, but the previous build exhausted its model-request budget on the large task: **11/12 clean completions overall**. This screen shows functional correctness parity, not improved general reliability. Do not promote this candidate as a performance improvement.

| Task | Default, native off | Previous, native on | Candidate, native on | Candidate vs default |
|---|---:|---:|---:|---:|
| Invoice arithmetic | 205.945 s | 240.177 s | 258.083 s | +25.3% |
| Async route error forwarding | 67.023 s | 61.997 s | 67.004 s | effectively tied |
| Shared context field rename | 116.387 s | 118.394 s | 124.151 s | +6.7% |
| Larger ambiguous reference graph | 126.033 s | 190.927 s, budget stop | 219.360 s | +74.0% |
| **Successful total across all four** | **515.388 s** | **not comparable** | **668.598 s** | **+29.7%** |

Exactly 12 model trials ran, with no repeated or replaced trials. Timing is Goose ACP prompt submission through its terminal response, using Orqanix's production model router. It excludes setup, independent evaluation and Electron UI. Protected desktop Keychain item permissions prevented desktop preflight; the backend alternative used normal parent authentication and refresh without further user input. Installed Orqanix was not replaced.

All **400 forwarded model requests** verified requested and returned `gemini-3.8-flash`; effort was unspecified throughout. There were no rejected-authentication responses, timeouts or Rust action-budget terminations. The large previous-build trial reached the separate 60-request capability limit, which blocked four further requests locally. Its final message was a rate-limit error despite ACP returning `end_turn`. The frozen raw `passed` field reflects its correct resulting files; post-processing now classifies it as `model_budget_exhausted` and excludes it from successful-completion speed comparisons. Three regression tests cover this classification. No model trial was rerun.

Ten HTTP streams were marked cancelled after HTTP 200, verified identity and usage had been received. Those records remain cancelled in the evidence; ACP completion, transport status and independent correctness are separate. Their exact stream-close cause was not established.

The references use the preserved `ff80a98e…` debug binary with native tools off/on. The candidate uses `0daf15f4…`, adding policy v2, bounded `read_many`, post-edit context and the prior lock-lifetime fix. Jev and Axwise were off, the legacy loop was used, and Code Mode was excluded. Advertised inventory was matched across arms apart from the four native tools. Candidate policy v2 was verified in model requests. These are product configurations, not a claim about every upstream Goose setup.

| Measurement | Default | Previous | Candidate |
|---|---:|---:|---:|
| Correct outcomes | 4/4 | 4/4 | 4/4 |
| Clean completions | 4/4 | 3/4 | 4/4 |
| Model requests | 129 | 147 | 124 |
| Tool calls | 121 | 140 | 116 |
| Accumulated input tokens | 2,399,873 | 3,703,213 | 3,841,162 |
| Tasks using native tools | 0 | 1 | 4 |

The candidate made 8 batched reads and 23 guarded edits. The previous build used 28 single-file reads and 14 guarded edits, all on the large task. **AST, LSP and `safe_edit_and_test` were never selected in this batch.** Their registration is working, but this experiment does not demonstrate an end-to-end benefit from them. The candidate's post-edit follow-up capability was implemented and unit-tested; these trials did not exercise a subsequent guarded edit using a returned post-edit snapshot.

What the traces explain:

- Fewer calls did not mean less model work: the candidate used 3.9% fewer model requests than default, but 60.1% more input tokens. Native snapshots/receipts add text to subsequent requests; on the cross-file task they contributed about 22.5 KB of recorded response content. Policy also failed to prevent guarded reads of README/configuration files that were not edit targets. Token totals are not billing estimates.
- Checks were repeated despite explicit reuse guidance. On the cross-file candidate, tests and type checking each ran four times, including the initial baseline. The final identical checks followed no relevant changes. On the large task, ordinary source reads were followed by guarded rereads, then 14 separate edit calls.
- The large candidate initially imported plugin functions from an index that did not export them. It corrected its regression test and passed. Both final outcomes and the failed intermediate check are retained.
- Most observed elapsed time was inside model HTTP requests. The simple candidate had one 90.7-second request, versus maxima of 27.0 and 35.6 seconds in its references. One sample cannot separate model deliberation, larger context and provider variability. The slow request was not removed from the results.

All 12 independent evaluations passed behavior, TypeScript compilation, public tests and generated regression tests. Each generated regression test also failed when the original defect was restored. These code checks do not override the previous build's incomplete final response. Immutable inputs and permitted-file boundaries remained intact. A supplemental source inspection confirmed the renamed context's read-only fields and absence of a compatibility member in all six refactor solutions. No benchmark processes remained after completion. The implementation's earlier deterministic validation passed 127 tests, plus formatting, strict clippy, inventory preflights and fixture calibration; one opt-in real-server test was ignored. Three additional completion-classification regression tests passed after the final audit.

The next changes should target measured costs, and remain separate from this frozen candidate:

1. Reduce snapshot and receipt payloads in [edits.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/edits.rs:476). Preserve full-file conflict validation while avoiding unnecessary repeated content/anchors. Compare compact output independently before expanding the policy.
2. Reduce model turns for multi-file changes in [edits.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/edits.rs:532), with explicit per-file preconditions and failure semantics. Batch reads alone leave one model-selected edit call per file. Preserve safeguards and do not imply a filesystem-wide transaction.
3. Improve check reuse and combined verification in [selection.md](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/selection.md:1) and [developer guidance](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/developer/mod.rs:42). The current prompt already requests reuse, so merely repeating that instruction is insufficient. Any runtime reuse mechanism must bind results to relevant inputs and must not cache arbitrary shell commands blindly.
4. Add convenient structural/symbol query operations in [ast.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/ast.rs) and [lsp.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/lsp.rs). Query presets remain deferred. Natural selection of these tools is still a gap; forcing them in a benchmark would measure a different workflow.

One trial per configuration/task, synthetic TypeScript projects, debug builds and uncontrolled provider/cache load limit generalization. This batch does not measure Jev, Axwise, Electron latency, production tail latency or long-term reliability. Earlier desktop batches are separate experiments and were not pooled. Native tools retain their guards, but ordinary write/edit tools remain available; enabling the flag does not guard every possible write.

Evidence: [sanitized summary and timings](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-efficiency/backend/results/summary.json), [protocol verification](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-efficiency/backend/verification.json), [build hashes](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-efficiency/backend/build-verification.json), [supplemental audit](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-efficiency/backend/supplemental-audit.json), [backend protocol amendment](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-efficiency/backend/protocol-addendum.md). Per-trial sanitized tool receipts, telemetry, evaluations and solutions are under `backend/results/rows/`; raw profiles and wire logs remain in private temporary storage.
