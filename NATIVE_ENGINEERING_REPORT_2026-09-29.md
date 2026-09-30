# Native Goose engineering — 2026-09-29

Gemini remains **`gemini-3.8-flash`**. The hosted Goose gateway was already pinned to that model; this change does not downgrade it or change its routing. The controlled benchmark explicitly requests the same model with high reasoning effort and records the returned model identity.

## Implementation

The four tools now live in Rust inside Goose's `native_engineering` platform extension:

- `ast_search` executes real Tree-sitter queries, including bounded directory scans and file hashes. Comments and string contents are not declarations.
- `lsp_query` communicates with genuine stdio language servers for symbols, definitions, references, hover and diagnostics. Desktop packaging includes pinned TypeScript/JavaScript and Python servers. Other supported LSP languages require host-installed servers.
- `hashline_edit` reads complete file digests and line anchors, and requires matching values for an edit.
- `safe_edit_and_test` applies one guarded file edit, runs literal test argv, captures bounded output, and conditionally rolls back on failure, timeout or cancellation. Repair remains in the same primary Goose conversation.

The existing desktop capability switch now persists `nativeGemsEnabled`, with migration from saved `ompEnabled` choices. It remains off by default. The host mounts/removes the extension per turn; the model cannot enable it through the extension manager. Native tools receive the session working directory and normal approval/security inspection. Both Goose loop implementations are covered.

OMP's desktop bridge, executable download/staging/signing, settings instructions, repair/receipt UI and vendored package are removed. The duplicate Axwise OMP package and evaluation-image dependency are also removed. Connector descriptions use the actual tools. Bundled language-server entry points and Node are checked against manifest hashes and confined paths. A local connector source overlay records its original commit/blob plus current SHA rather than inventing a commit.

JEV continues to provide the existing routing decisions. Native test receipts do **not** claim a remote JEV engineering review. The independent precommit JEV lint helper and its tests have moved out of the deleted OMP package.

A new integration test also uncovered and fixed an existing legacy-loop bug: cancelling while waiting for tool permission previously hung on the confirmation channel. That wait now observes cancellation before dispatch.

## Verification

- Native/core Rust tests: **39 passed**, plus one separately run real-server smoke test.
- Security inspection regressions: **52 passed**, including command and egress inspection for `safe_edit_and_test`.
- Primary-loop integration: **3 passed**; these cover host mount/remove and both loops with allow, deny, permission cancellation and token cancellation. Rejected/cancelled calls cannot edit or launch the test command.
- Axwise OMP retirement: **115 evaluation/dashboard/lint/conversation tests** and **86 server-route tests** passed.
- Desktop: **187 focused tests passed**; TypeScript, focused ESLint and all 16 locale catalogs checked.
- Runtime/connector: **42 tests passed**, plus **35 tests** for the mirrored connector and **2 release-eligibility tests**. Source validation and locked runtime preparation passed. Packaging receipts distinguish local overlays from release-eligible sources.
- Preserved independent JEV lint helper: **9 passed**.
- Benchmark guard/oracle/proxy tests: **13 passed**; all four feature/loop preflight inventories pass without inference.
- Rust formatting, strict `cargo clippy -p goose --lib --offline --no-default-features -- -D warnings`, and a fresh CLI build passed.

Security tests initially hit the sandbox's localhost-bind restriction; they passed with local mock-server binding allowed. A benchmark preflight initially found default extensions outside the intended comparison; that failed preflight is retained and the harness now explicitly removes those defaults. Neither preflight made a provider call.

The real bundled LSP smoke made ten actual protocol queries in 1.56 seconds, with zero model calls. Cold symbol lookup took 547 ms for TypeScript and 230 ms for Python; subsequent definition/reference/hover queries took 2–54 ms. Both servers detected an introduced type error after a disk edit. TypeScript emits unversioned diagnostics, which are explicitly reported as `versionVerified:false`; Pyright verified document version 2.

## Controlled live benchmark

All **4/4 native runs** completed with real AST/LSP results, matching hash anchors, two successful guarded edit/test receipts and an independently valid fix. Their mean was **32.46 seconds** (28.18–35.70 s). The only baseline turn that completed under the strict policy took **18.69 seconds**. **This experiment does not demonstrate a speedup or a general reliability improvement.** It does establish that the tools work inside both real Goose loops.

| Native flag | Loop | Repeat | Turn elapsed | Final code/tests valid | Turn outcome | Provider attempts | Reported tokens |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: |
| Off | Legacy | 1 | 18.69 s | Yes | Completed | 11 | 34,959 |
| Off | State machine | 1 | 24.07 s | Yes | Permission rejected | 11 | 47,448 |
| On | Legacy | 1 | 35.70 s | Yes | Completed | 11 | 76,088 |
| On | State machine | 1 | 32.51 s | Yes | Completed | 11 | 90,081 |
| On | State machine | 2 | 28.18 s | Yes | Completed | 10 | 78,106 |
| On | Legacy | 2 | 33.46 s | Yes | Completed | 13 | 94,749 |
| Off | State machine | 2 | 11.75 s | No | Permission rejected | 6 | 19,773 |
| Off | Legacy | 2 | 15.76 s | Yes | Permission rejected | 8 | 24,505 |

**Interpret the baseline carefully:** three of four produced correct code and regression tests, but only one completed. Two were stopped after successful edits for `git status --short` / `git status -s`; another was stopped early for `cat -e average.ts`. These harmless command variants were outside the frozen harness allowlist. They are harness-policy failures, not evidence that ordinary Goose editing is generally unreliable. The allowlist and prompt were kept unchanged across all eight rows.

There were **81 provider HTTP attempts** in total, within the 120-attempt cap. Every request explicitly targeted `gemini-3.8-flash` with high effort, and every HTTP-200 response identified `gemini-3.8-flash`. One HTTP 503 was retried successfully; its request and latency remain in the 35.70-second trial. Native runs used 76,088–94,749 reported tokens, versus 34,959 for the sole completed baseline. These totals use the last usage snapshot per request, not a sum of cumulative streaming frames; the failed HTTP503 has no token usage. Native tooling did not reduce tokens on this task.

The eight measured rows were never rerun or discarded. Execution resumed after two harness stops: per-row permission denial initially stopped the whole plan, and a transient503 was initially treated as a fatal/model-identity failure. The corrected identity assessment checks every request pin and every successful response identity; an error response has no generated model identity. Original assessment metadata and earlier preflights are preserved. One later native run corrected an initially wrong-file LSP query in the same primary conversation.

Raw evidence: [live.json](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-engineering/live.json), [derived analysis](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-engineering/analysis.json).

The experiment uses two repetitions of each native flag × Goose loop combination, fresh identical TypeScript fixtures, the same conditional prompt, and reversed order in the second repetition. It requires all four native tools when enabled. The acceptance oracle checks empty/nonempty means, readonly input behavior, unchanged decoys and a regression test that fails when the original bug is restored. Timing excludes profile setup and independent acceptance checks; those are recorded separately. Failed trials remain in the evidence.

This is a local debug Goose CLI/ACP experiment with direct Google provider forwarding. It does not measure Electron rendering, hosted authentication, natural tool selection, production release speed or broad task reliability. Eight small trials cannot establish a general speedup. Requested reasoning effort is observable; the provider's internal effort is not.

## Remaining limits and delivery

- The old scheduled Orqanix coding-evaluation arm is explicitly retired and reports unavailable rather than producing a fake result; its vanilla comparator remains. The new native benchmark is a separate local Goose experiment, not a silent replacement for that authenticated cloud contract.
- Single-file UTF-8 guarded edits (up to 1 MiB); existing paths only, no symlink traversal. This is not a multi-file transaction.
- Test execution uses Unix process groups. The compound edit/test tool refuses Windows execution before writing. Desktop distribution currently targets macOS Apple Silicon.
- Hash checks, locks and conditional rollback preserve detected concurrent changes; they are not an OS sandbox or an absolute atomic compare-and-swap against unrelated writers.
- A passing test command is evidence of that command's result, not proof that the test suite is sufficient. Missing/unversioned LSP diagnostics are not a clean-workspace guarantee.
- Validated source changes have been copied into the original `orqaly-goose` checkout after checking destination hashes against the pre-work state; earlier uncommitted fixes were preserved. Source changes are local. The installed `/Applications/Orqanix.app` has not been replaced, and no release, commit, push or deployment is claimed.

Implementation: [native extension documentation](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/README.md), [integration tests](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/tests/native_engineering_integration.rs), [desktop mounting](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/workspace.ts), [benchmark harness](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-native-engineering.mjs).

Evidence: [native-engineering directory](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-engineering), including raw receipts, preflight, test logs, binary/source hashes and real LSP results. Earlier reports and OMP measurements remain historical records; this report describes their native replacement.
