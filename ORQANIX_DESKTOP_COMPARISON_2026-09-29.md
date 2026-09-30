# Orqanix speed, quality and reliability — 29 September 2026

The 48 coding runs do not yet demonstrate better overall quality from enabling the native tools. Both native-enabled and native-disabled groups passed the additional behavioral checks in 21 of 24 runs. This small experiment also leaves several capabilities untested through actual agent use: no AST, LSP or Axwise specialist calls occurred, and Jev performed routing rather than code review.

All runs requested Gemini 3.8 Flash; returned model identities confirmed it where a model response was received. These are actual isolated Orqanix desktop runs using a signed debug benchmark bundle, normal account authentication, and the current local gateway with real providers. They are not measurements of the installed production app. OMP is not part of this coding loop.

## Coding speed

Mean Send-to-terminal seconds; J = Jev, N = native engineering tools, A = Axwise available. Setup and independent evaluation are excluded. Each cell has two attempts; the starred mean uses one valid timing because the other completed task had unsettled recorder telemetry. Provider failures and recovery remain in the elapsed times.

| J | N | A | Simple | Medium | Complex | Additional behavioral checks passed, across all six tasks |
|---|---|---|---:|---:|---:|---:|
| Off | Off | Off | 110.6 | 87.2 | 174.3 | 3/6 |
| Off | Off | On | 71.5 | 109.4 | 192.8 | 6/6 |
| Off | On | Off | 71.7 | 108.4 | 209.7 | 6/6 |
| Off | On | On | 126.9 | 115.3 | 175.9 | 6/6 |
| On | Off | Off | 75.7 | 99.4 | 215.9 | 6/6 |
| On | Off | On | 61.6* | 88.4 | 176.3 | 6/6 |
| On | On | Off | 71.1 | 120.1 | 195.7 | 5/6 |
| On | On | On | 63.3 | 93.9 | 220.5 | 4/6 |

These cells are exploratory observations, not reliable rankings. Across 23 valid matched pairs per factor, enabling native tools averaged 8.8 seconds longer, Jev 5.7 seconds shorter, and Axwise availability 2.7 seconds shorter. There were no Axwise calls, so its availability differences cannot be attributed to specialist execution. Two repeats per cell and substantial provider variation cannot establish a general speed or reliability advantage. Exact ranges, individual attempts and exclusions are retained in [the coding summary](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/summary.md) and [analysis](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/analysis.json).

## What quality checks found

- All 48 tasks ended and passed the original code/document checks. There were no task timeouts. Only 47 timing records qualify for the strict speed comparison; the excluded task was not a coding failure.
- A supplemental contract-based audit applied 6,656 correlated case checks: 44/48 solutions passed. Four complex solutions mishandled an ordinary JSON SKU named `__proto__` while copying inventory objects.
- A separate, explicitly post-inspection signed-zero probe found four failures among 32 applicable simple/complex solutions. Two overlapped the earlier failures. Overall, **42/48 solutions passed both applicable additional audits**. Native on/off each passed 21/24; Jev on/off also each passed 21/24. These are observed counts, not production reliability estimates.
- Blinded AI review of the coding documents found zero major and three minor semantic defects. The minor defects concerned wording that implied an optional argument was required. This was not a human review or exhaustive code audit. Verification-honesty scores were left ungraded because execution receipts were withheld from the reviewer.
- An independent audit of all 931 recorded coding-tool calls found no confirmed workspace-scope violations or unresolved suspicious actions. This is a recorded-action audit, not a syscall trace.

Supplemental cases were designed after initial runs existed but before inspecting generated solutions. Signed-zero checks were designed after inspection and are reported separately. Neither replaces the original frozen protocol. All generated solutions and failures remain unchanged in the evidence archive.

## What the flags actually did

Native tools were used in 8 of 24 enabled runs. There were 30 `hashline_edit` calls, **all reads**, and four `safe_edit_and_test` calls. The four guarded edits changed the intended files and ran a passing test command, but that command covered only one ordinary public test each. A verified tool result proves that command passed; it does not prove the entire behavioral contract. One hashline read of a missing workspace file failed and the agent recovered.

AST and LSP received zero calls. The fixtures used small JavaScript modules, so this experiment did not test their benefit on cross-file references, typed interfaces or diagnostics. Ordinary shell/write tools remained available. Native availability does not require Goose to use guarded editing. Existing Goose analysis already uses Tree-sitter, so the native-off arm is not entirely AST-free.

Jev made 24 real lane-classification calls, averaging roughly 0.37 seconds. It did not grade code or review edits. The current deployed decision endpoint rejected the lane request; the benchmark used the current local service with the real Jev provider. Production rollout remains a separate gap.

Axwise received zero calls in the coding matrix. Its review pipeline therefore contributed no measured quality benefit to these results.

## Separate Axwise document comparison: incomplete

A separate protocol was prepared for three full-PRD workloads, one primary/Axwise pair each, with a semantic rubric frozen before generation. It must not be pooled with the coding matrix.

The first unconstrained primary baseline searched outside its workspace for Axwise implementation and evaluator files. It was stopped and preserved as a scope-violation diagnostic, not accepted as a baseline or ranked as a fast failure. See [the diagnostic](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-specialist-diagnostic/scope-violation.json).

A fresh protocol added clearer registered-tool-only instructions and a macOS filesystem boundary. The boundary's focused tests passed, but the isolated desktop app failed startup during preflight; that preflight was stopped before submitting a benchmark task. No six-row result exists under this revised protocol. Axwise semantic quality and end-to-end speed remain unmeasured here. The boundary is a benchmark measure, not a shipped product fix, and is not complete network/IPC isolation.

## Remaining work

1. **Exercise the intended capabilities.** Add representative multi-file TypeScript/Python tasks with references, type errors and stale-edit conflicts. Measure natural tool selection separately from explicitly required tool use, and record actual calls in both protocols.
2. **Strengthen correctness coverage.** Include special own-property names, zero/sign boundaries, overflow, input immutability and failed-edit rollback. The original single public test was too weak to make guarded-test success a strong quality signal. Preserve this experiment and use a newly frozen protocol for new cases.
3. **Define the Jev review path.** If Jev is intended to improve code quality, wire and measure an actual engineering review stage; lane classification alone cannot establish that benefit. Verify deployed endpoint compatibility before a production claim.
4. **Finish the real Axwise comparison safely.** Resolve app compatibility with the confined test environment without silently removing the boundary. Then run the three PRD pairs, verify real specialist generation/review receipts, and conduct the independent blinded semantic review.
5. **Treat workspace confinement as a product concern.** The stopped PRD diagnostic shows that prompt-only scope instructions were insufficient in that attempt. Availability of a feature flag does not enforce limits on ordinary shell access.
6. **Increase repetitions after the protocol is stable.** Report success rate and defect severity alongside latency distributions and retry cost. The present sample cannot support claims that the full configuration is generally faster or more reliable.

## Follow-up: why Goose seldom selected native tools

This section describes the evaluated build before the selection fix. A subsequent [implementation and Rust rebuild](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_SELECTION_BUILD_2026-09-29.md) reconciles the guidance and adds a lock-lifetime fix. Its offline checks pass. The subsequent [12-trial live comparison](/Users/admin/axwise-opensource/axwise-flow-oss/ORQANIX_NATIVE_SELECTION_BENCHMARK_2026-09-29.md) records increased native use, slower completed normal-budget pairs, and the remaining selection/quality gaps. The original measurements below are unchanged.

A read-only source and recorded-action audit found a concrete instruction conflict. The built-in [developer instructions](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/developer/mod.rs:66) prefer `rg`, then `cat`/`sed`, followed by `write`/`edit`, while emphasizing fewer iterations. The [native extension instructions](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/mod.rs:36) describe the additional tools but do not establish when they take precedence. The [desktop capability text](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/replyQuestionPrompt.ts:41) likewise describes availability and permits ordinary tools when appropriate. Both agent-loop implementations assemble extension instructions; this is not a fix to make in only one loop.

Tool exposure worked: all four native tools appeared in **493/493 upstream primary requests carrying tools across the 24 native-enabled rows**. Thus these recordings do not support a missing-tool or gateway-filtering explanation. The recorder retained tool names, not full upstream system-prompt bodies; prompt-delivery conclusions are based on source tracing rather than a verbatim capture.

In those rows, Goose made **29 ordinary writes to existing source files**, 24 ordinary writes for new documents, and four guarded edit/test calls. New-document writes are expected because native edits require existing files. In **four rows**, it successfully read source files through hashline tools and then used ordinary `write` on those same files (six source writes). That directly shows discovery alone was insufficient to encourage guarded editing. No AST/LSP attempts occurred, so their runtime errors cannot explain their avoidance in this sample.

Task design also matters. Each task named the target paths and exports in one or two tiny modules. There was little navigation to perform. AST requires a Tree-sitter query; LSP symbol navigation requires a file and, for some actions, a position. For these fixtures, reading the whole small file was a reasonable alternative. Guarded edits add digest/anchor arguments, and `safe_edit_and_test` operates on one file, which needs care when an intermediate change in a multi-file repair would fail tests. These are observable interface/workload differences, not proven causes of the model's choices.

The next controlled change should reconcile the developer and native guidance under the existing flag: prefer LSP for semantic references/definitions and diagnostics, AST for structural searches, and guarded edits for supported existing-file changes with a suitable test command. Preserve ordinary reads/searches for tasks where they fit, ordinary writes for new files, and explicit fallback for unsupported operations. Expose host-detected language-server availability accurately. Compare unchanged versus reconciled guidance on the same frozen navigation/structural-edit fixtures, with tools, model and permissions held constant; record actual selection and correctness. Do not force every task to call every tool or attribute a speed/quality improvement before that comparison.

Evidence is retained in [native-tool-selection-audit.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/native-tool-selection-audit.json). No application code or original benchmark results were changed for this investigation, and no additional model runs were started.

## Evidence

- [Curated coding report](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/report.json), [archived solutions](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/solution-manifest.json), and [frozen execution source](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/frozen-execution-source).
- [Supplemental behavioral audit](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/quality/supplemental-code-quality.json), [signed-zero probe](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/quality/signed-zero-result.json), [blinded document comparison](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/quality/comparison.json), and [recorded action-scope audit](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/quality/action-scope-audit.json).
- [Recorder correction](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/orqanix-desktop-matrix/recorder-correction.json) was made after the original matrix ended. Its telemetry exclusion remains in the original results.
