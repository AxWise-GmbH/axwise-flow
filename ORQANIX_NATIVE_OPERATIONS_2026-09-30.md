# Orqanix native operations v4 — September 30, 2026

Implemented, rebuilt and benchmarked. Native on took **21.1% less total completion time** than native off in twelve matched desktop trials, and both arms passed every independent correctness gate. This is a small screening result, not proof of universal speed or reliability. The installed Orqanix application has not been replaced.

## Measured results

The same signed release binary ran in both arms, with verified Gemini 3.8 Flash. Each task has two counterbalanced trials per arm; the table shows their medians.

| Task | Native off | Native on | Less time |
|---|---:|---:|---:|
| Simple label fix | 32.25 s | 30.01 s | 6.9% |
| Structural handler repair | 55.69 s | 42.91 s | 22.9% |
| Cross-file rename | 106.44 s | 80.38 s | 24.5% |
| Six trials per arm, total | 388.754 s | 306.607 s | 21.1% |

All twelve trials passed: behavior, type, public/regression tests, original-bug mutation detection, protected-file/scope checks and clean termination. All 288 model responses verified Gemini 3.8 identity and usage; no unresolved telemetry or approvals remained. Model requests fell from 162 to 126 (156 to 120 tool-bearing agent requests, plus one auxiliary request per trial). Reported accumulated input tokens fell from 2,718,940 to 2,495,063; this is not a direct measurement of billable cost.

Screening acceptance passed total and every per-task median. The structural stretch target was met; the proposed 40% rename-time reduction was not. Both samples remained correct, so these runs do not establish a quality/reliability advantage.

## Remaining selection gap

**No AST/LSP calls occurred in the natural timed tasks.** Every native agent request received policy v4 and the preserved ordinary developer guidance; the four tools were available, and source/binary/inventory verification passed. This is not a missing mount or omitted policy. The reasons for the model's choices have not been isolated.

The observed workflow improvements include compact guarded reads and a two-file apply/test batch in the first structural task and a fourteen-file apply/test batch in the first rename. The second rename used fourteen ordinary edit calls after guarded batched reads. We cannot attribute the measured improvement to semantic rename, which was demonstrated in targeted functional and real-server tests instead. Policy, output size, batching, ordinary editing and provider variation were not separately ablated.

Further work should test discoverability of semantic operations and performance on larger/refactoring tasks without making tool adoption a correctness requirement or adding an extra model router. Keep unsupported/uncertain operations on bounded fallbacks. No universal no-penalty claim or superiority to pristine upstream Goose has been established.

## Implemented

- Existing native feature flag, exactly the same four tool names; no OMP or extra model.
- `lsp_query action=rename`: qualified declaration lookup, bounded synchronization of previously unopened scope files, optional prepareRename, real WorkspaceEdit proposal, complete compact preview and session/workspace-bound plan ID. Server-initiated edits remain rejected.
- `safe_edit_and_test`: consume a reviewed plan or apply guarded multi-file anchored edits; validate every target before publishing; run the supplied checks once after the complete batch; return actual verification/rollback receipts.
- `hashline_edit`: compact line anchors and opaque snapshot handles, bounded reads and `edit_many`. Full preimage hashing remains internal, with compatibility for existing SHA/anchor clients.
- Preserve ordinary Goose developer instructions and efficient search/edit guidance alongside one native extension policy. Native tools are optional operations, not a required checklist.

## Safety and limits

Plans are read-only until the separate approved apply/test call. They expire after ten minutes and are consumed once. State is bound to session and workspace, with a 128-entry/16-MiB ceiling. Rename scope is bounded to 32 language files/8 MiB with at most 64 captured source/config inputs. Malformed/overlapping UTF-16 edits, wrong versions, out-of-scope edits, resource operations, annotations and oversized previews fail explicitly. Scope membership, captured bytes and ancestor config/ignore inputs are rechecked before application and after verification.

This does not prove project coverage outside the selected scope or automatically preserve every public API contract. The model must inspect the complete proposal, and independent tests/type checks remain necessary. Multi-file publication is not globally atomic; advisory locks do not exclude arbitrary external writers. Rollback preserves detected intervening changes and reports conflicts. Tests may affect unowned files, which the tool does not restore. Process containment remains Unix-only.

## Validation

- 61 native checks passed, including real bundled TypeScript/Python servers and the new semantic rename regression.
- Real rename followed aliases, preserved external `requestId` output keys and unrelated `Job.requestId`, compiled and passed behavior checks. A new file invalidated a prepared plan before any mutation/test; replay of a consumed plan was rejected.
- Batch checks cover stale member/no publication/no spawn, duplicate targets, session isolation, complete-batch visibility, failed-test rollback, intervening edits, cancellation and dropped futures.
- Four native integration tests passed across both legacy/state-machine loops, including approval/denial/cancellation and mount/remove/resume behavior.
- Six Code Mode compatibility checks passed. The initial local mock-server attempt was blocked by the outer sandbox; the authorized loopback run passed.
- Cargo fmt and Clippy passed. Benchmark harness/capability relay checks passed.
- Final signed app startup reached Settings with zero model calls. Normal parent Keychain/OAuth authentication worked; no password was saved or passed to Goose.
- Two untimed model recipes retained: 45 requests initially, 41 after tightening guidance. Both verified semantic rename/apply and rollback/stale guards. The initial run additionally verified a successful generic batch but searched the host bundle unnecessarily. The revised run avoided bundle searches, still made a version probe and omitted a successful generic batch. Strict per-run recipe verification remains false; do not turn tool-exercised/exit-zero into a clean recipe pass. The deterministic tests cover these operations independently.
- All three fixtures calibrated: original bugs fail, known fixes pass, and added regressions detect original mutations.

## Benchmark protocol

Exactly twelve actual desktop trials: the same rebuilt release binary with native off/on; simple label fix, structural handler repair and cross-file rename, each twice and counterbalanced. Same frozen temporary Electron UI/prompt, verified Gemini 3.8 Flash, default effort, legacy loop, Jev/AxWise/Code Mode off. Fresh workspaces/profiles and cold semantic servers. Natural prompts never mandate tools. Tool use is diagnostic; both arms must pass independent behavior/type/regression/mutation/protected-file gates.

Timing starts at actual Send and ends at clean completion, including required checks and provider/auth costs. Setup and independent grading are separate. Failures and outliers remain in the report. Screening requires total and every task median at or below native off; two repetitions cannot establish statistical equivalence or broad reliability. Earlier shipped-2.4.2 measurements are historical references, not a matched release comparison.

## Code and evidence

Goose source: `/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/`, ordinary developer instructions, integration tests, one Code Mode policy assertion and the self-test recipe. Only ten owned files were synchronized after checking the original checkout for concurrent changes.

Evidence: `review-evidence/2026-09-30/native-operations-v4/` includes the frozen protocol, calibration, before/after hashes, scoped patch, source-sync receipts, validation/build logs, full twelve-trial report, summary, provenance verification and operation diagnostics. The new harness is `scripts/benchmark-orqanix-operations.mjs`, with separate summarization and provenance verification scripts. Earlier frozen reports/apps were preserved.


## Build and use

The implementation is synchronized to `/Users/admin/axwise-opensource/orqaly-goose`. The standalone release binary is `/private/tmp/orqaly-goose-verified-fixes/target/release/goose`; build uses Rust 1.96.1, release profile, rustls-tls and no default features. Both benchmark arms use signed SHA-256 `3b1437b939081668c93b0e5451c28b2c7aebc63e2a645e84edbb2fec411e6198`. The 706 frozen source/config/fixture files are in `/private/tmp/orqanix-native-operations-v4-final-timed-sources-20260930`.

The temporary app is a confined benchmark harness, not a general user installation; its launcher requires benchmark environment variables. Normal product packaging must include the updated backend before the existing Settings → Chat native engineering toggle exposes these new operations in installed Orqanix. The installed app and feature defaults are unchanged. No commit, PR or production deployment was performed.
