# Orqanix native engineering: performance and robustness review

Reviewed September 29, 2026. This is a code, documentation and evidence review; the recommendations below have not been implemented or benchmarked. The installed application was not replaced.

The next candidate should preserve Goose's ordinary workflow and make semantic tools replace work that the agent would otherwise perform. Enabling AST/LSP should not require extra inspection, guarded rereading or an extra model router. Equal or better speed is a measurable release target; it is not something we can guarantee for every task and provider response.

## What the current evidence establishes

The frozen twelve-trial desktop comparison remains valid as a screening result:

| Measurement | Released 2.4.2 backend, native off | Native semantic v3 candidate |
|---|---:|---:|
| Six tasks, total time | 387.178 s | 539.486 s |
| Small control, median | 26.7 s | 31.1 s |
| Structural repair, median | 58.1 s | 73.5 s |
| Cross-file rename, median | 108.8 s | 165.1 s |
| Model requests | 159 | 183 |
| Reported accumulated input tokens | 2,691,707 | 5,994,860 |
| Independent correctness and mutation gates | 6/6 | 6/6 |

Native took 39.3% more total time. Both arms passed; higher reliability has not been demonstrated. The baseline is the installed Orqanix 2.4.2 Goose backend with native tools disabled, using the same temporary desktop UI. It is **not an unmodified upstream Goose build**. The candidate also contains earlier changes, so this comparison does not isolate AST/LSP alone.

Every recorded response verified Gemini 3.8 Flash identity. Jev and AxWise were disabled in both arms, and effort was held at the provider default. These trials do not establish their individual performance effects. No OMP calls occurred in the separate released-2.4.2 comparison; the faster release-on result cannot be attributed to OMP execution.

Read-only reanalysis confirmed all twelve outcomes, original-bug mutation detection, report integrity, inventory, model identity and settled telemetry. All ten final v3 source hashes still match the original Goose checkout. The two existing benchmark harness tests passed again. Prior native unit/integration, real-server and Code Mode validation results remain recorded in the [implementation report](ORQANIX_NATIVE_SEMANTIC_2026-09-29.md); they were not all rerun for this review.

## What explains the direction of the slowdown

These are observed costs and code mechanisms, not a complete causal latency decomposition:

- The first rename's four LSP intervals totalled 553 ms. Its end-to-end native disadvantage was 58.459 s. Optimizing those queries cannot recover most of that difference.
- Both native rename trials made fourteen separate guarded edit calls. They also made fifteen and thirteen guarded read calls respectively, despite some use of `read_many`. The baseline also made fourteen edits, but used fewer tool calls overall. A batch operation can eliminate model round trips; merely making each Rust call slightly faster cannot.
- The six native trials emitted 177,269 bytes of guarded-tool result text, including 767 full line anchors totalling 50,970 characters, plus 13,120 characters of file hashes. These outputs are subsequently carried through the conversation. Character counts are not token counts or billable cost measurements.
- `anchor()` encodes the line number plus an entire 64-character SHA-256. Shortening only the file identifier leaves the larger per-line overhead in place.
- `hashline_edit` single reads have a 1 MiB file limit and a line-count limit, but use `usize::MAX` as their result budget. Batch reads cap line data at 256 KiB. Both can produce much more context than a targeted edit needs.
- Both rename arms ran four shell commands containing the test flag and four containing the typechecker. Repeated verification is present in both; it does not by itself explain the native disadvantage. Checks after relevant changes still need to run.
- Send-to-ACP-request delays were 163–212 ms across the trials. Desktop turn synchronization is not the principal measured slowdown here.
- Native availability changes developer instructions, adds an extension policy and adds engineering guidance to the desktop workspace resource. The native developer instruction substitutes for the ordinary instruction, omitting its concrete `rg`/batched-reading workflow. This is a plausible behavior influence, not proven causation.

The [trace analysis](review-evidence/2026-09-29/performance-review/trace-analysis.json) records these counts per trial. More reported input tokens do not imply proportionally more latency or cost; cache behavior and provider generation time also matter.

## What to retain from Goose

Goose's [Developer documentation](https://goose-docs.ai/docs/mcp/developer-mcp/) describes a small ordinary editing/shell toolset. The local default instructions explicitly favor reading enough context in few iterations, `rg`, targeted reads and efficient edits. Keep that workflow when native tools are enabled.

Goose already provides a Tree-sitter-based Analyze extension. Its [analysis guidance](https://goose-docs.ai/docs/guides/codebase-analysis/) favors narrow scope, bounded depth and ignored-file exclusion. Our AST presets already reuse its grammars and queries. Avoid a second project index or a new background agent. Use Analyze for overview/call-graph exploration, AST presets for precise syntax patterns, and real LSP for binding-aware references. The local Analyze graph resolves calls through names and heuristics; its documentation's word “semantic” should not be treated as a compiler-grade binding guarantee.

Goose's [Code Mode](https://goose-docs.ai/docs/guides/managing-tools/code-mode/) can discover tools on demand, batch calls and process intermediate results locally. It is a useful later experiment for substantial workflows. Discovery and execution introduce their own costs, and the docs distinguish simple from larger workflows. Our discovery tests passed, but no live Code Mode speed win was measured. The timed candidate was built without the `code-mode` feature, whereas the normal packaging build includes default features; testing Code Mode needs a compatible build and runtime.

Goose's [context management](https://goose-docs.ai/docs/guides/sessions/smart-context-management/) can summarize older tool outputs, but that can add inference and remove exact editing context. Prefer compact results at their source for these short coding tasks. Desktop [Concise response style](https://goose-docs.ai/docs/guides/managing-tools/adjust-tool-output/) only changes presentation; it is not a model-context optimization.

## Recommended implementation order

| Priority | Code | Change and purpose |
|---|---|---|
| First | `crates/goose/src/agents/platform_extensions/developer/mod.rs`, `native_engineering/selection.md`, `ui/desktop/src/orqaly/replyQuestionPrompt.ts` | Retain the ordinary developer instructions. Keep one short native policy with concrete task-specific examples. Remove duplicated behavioral guidance while retaining trusted capability state. Simple metadata/text edits should use the ordinary efficient workflow. |
| First | `native_engineering/edits.rs`, shared state in `native_engineering/mod.rs` | Replace model-facing full file/line hashes with opaque snapshot and line handles. Retain full digest and exact range checks inside Goose. Return compact numbered text, a byte budget and explicit pagination/truncation. A handle must be bound to session, workspace, path and snapshot, with bounded storage and invalidation. Do not truncate a digest and assume equivalent integrity. |
| First | `native_engineering/edits.rs` | Add guarded multi-file editing and an optional single project test command after the complete batch. Validate all preimages/ranges and acquire locks in stable order before publishing. Report partial publication and rollback conflicts explicitly. Roll back only files still equal to this operation's postimages. Multi-file filesystem publication is not intrinsically atomic. |
| Next | `native_engineering/ast.rs`, `lsp.rs`, shared snapshot state | Allow sufficiently detailed semantic results to supply the same edit handles as guarded reads, avoiding a second read solely to obtain anchors. If context is insufficient or stale, require a focused reread. Never silently apply an edit using an old LSP position. |
| Next | `native_engineering/lsp.rs`, `selection.md` | Add honest structured scope/freshness information and bounded fallback behavior. Query completion and pagination completeness must remain distinct from project coverage. Report configured/inferred/unknown scope only when established; the presence of a config file alone does not prove coverage. Avoid indexing the entire workspace just to make a query look complete. |
| Later, measured separately | `extension_manager.rs`, Code Mode, desktop runtime/build configuration | Try batched programmatic execution for workflows that need it. Preserve approval, cancellation, extension lifecycle and both-loop behavior. Enable it only where actual desktop measurements show a benefit. |

An additional semantic rename-preview operation could eventually reduce manual edits: obtain a language server's proposed workspace edits, preview them, then use the guarded batch executor. This is a separate feature with separate validation. Language-server rename behavior must preserve external wire keys, aliases and unrelated symbols; it should not be assumed to satisfy our fixtures automatically.

## Robustness gaps that speed work must address

The implementation already has useful protections: full preimage/range checks, preservation of dirty text and executable modes, explicit ambiguity errors, cancellation/process cleanup, and rollback that preserves observed intervening modifications. Maintain them while changing the interface.

Remaining limits are material:

1. **Project coverage:** the real recipe's first inferred TypeScript query omitted an unopened consumer. Later configuration/opening the consumer produced the correct references. Returning `completed` currently says the query finished, not that it covered the entire workspace.
2. **Freshness:** unversioned TypeScript push diagnostics do not prove the current edit is clean. Reference snippets are saved file snapshots, not one atomic project snapshot. Compiler/tests remain necessary where appropriate.
3. **Transaction scope:** safe edit/test currently owns one target file. A test executable can change other files, and rollback does not undo arbitrary test side effects. Locks coordinate cooperating processes; check-then-rename does not provide an atomic compare-and-swap against every external writer.
4. **Recipe outcome:** native receipt checks passed, but the overall model recipe was not a clean pass. It attempted an out-of-scope cargo search. The subsequently bounded recipe was rendered offline, not rerun through the model.
5. **Language/platform evidence:** AST grammar tests span ten languages, while real bundled-server checks establish TypeScript/Python behavior. Safe edit/test process containment is Unix-only. Do not generalize those passes to all servers/platforms.

Add focused tests for compact-handle isolation/expiry, stale files and ranges, long-line output bounds, batch partial failures, cancellation, concurrent edits during rollback, and dropped futures. Extend real-server tests to unopened consumers, project references/config changes and file creation/deletion. Test unsupported servers and uncertain scope without automatic installation or repeated retry. Preserve both legacy and state-machine integration coverage.

## How to decide whether the next version is better

Run the next twelve desktop trials with **the same rebuilt binary**, native off/on, three task types and two counterbalanced repetitions. Keep Gemini 3.8 Flash, effort, desktop prompt, dependencies and other flags fixed. Use fresh workspaces and cold semantic servers. Record startup separately, and keep Send-to-clean-completion timing inclusive of required verification. Preserve failures and outliers.

Keep behavioral/type/regression/mutation checks, protected-file checks and unrelated-symbol preservation. Add performance receipts for model requests, reported tokens, tool output bytes, tool intervals, cache usage when available and repeated checks relative to changed inputs.

Remove mandatory AST/LSP adoption from the next acceptance gate. The task must be correct and efficient; tool usage tells us how it was achieved. For deterministic tool tests, require correct AST/LSP behavior directly.

The screening target is native-on total and per-task median time at or below native-off, with all quality gates passing and no small-task regression. Two repetitions are insufficient to establish statistical equivalence or universal reliability; close/noisy results remain inconclusive. A successful same-binary comparison must still be checked against shipped 2.4.2 before claiming a release improvement. Claiming superiority to upstream stock Goose additionally requires measuring that actual build.

Until those targets hold, keep the existing feature flag off by default. Do not achieve an apparent win by changing models/effort between arms, discarding failures, prewarming only the candidate, suppressing necessary checks or finishing before verification.

## Assessment

The useful capability is already present: syntax-aware discovery, binding-aware queries in a valid project, guarded edits and actual test/rollback receipts. The missing piece is a cheap workflow that uses that evidence once and edits/verifies in batches. The first implementation should therefore preserve the baseline instructions, compact the editing protocol and add guarded batch execution. Rust parser micro-optimization, unconditional Code Mode or another model router are not supported as the first fix by the current measurements.
