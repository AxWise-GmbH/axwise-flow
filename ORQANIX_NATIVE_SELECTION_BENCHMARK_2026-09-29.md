# Native selection benchmark — 12 model trials

The new build uses guarded edits more consistently and now chooses LSP diagnostics. It was slower on the two normal-budget tasks that both builds completed correctly. This experiment does not demonstrate better final-code reliability. AST search and semantic LSP navigation were never selected.

The runs used the actual Orqanix desktop Settings and Send flow, Gemini 3.8 Flash, native tools enabled, Jev/Axwise disabled, and the legacy Goose loop. The candidate is the previously rebuilt Rust binary; the installed app was not replaced. All 312 observed model HTTP responses identified `gemini-3.8-flash`. Candidate policy v1 appeared in all 176 tool-bearing candidate requests; baseline requests retained the old instructions in all 124 cases.

**Normal-budget results: final six trials.** One matched pair per task, with the ordinary Rust action default of 1000, a 360-second task timeout and a 60-request local relay limit. Time runs from UI Send to the terminal response, excluding setup and independent evaluation.

| Task | Previous build | New build | Finding |
|---|---:|---:|---|
| Simple: invoice arithmetic | 75.6 s; authentication abort | 215.8 s; signed-zero defect | No valid speed comparison. The new build's own tests passed, but the independent contract check failed. |
| Medium: async route handlers | 96.6 s; pass | 120.5 s; pass | New build 24.7% slower. Both preserved synchronous handlers/decoys and forwarded async failures correctly. |
| Complex: typed context refactor | 137.6 s; pass | 252.5 s; pass | New build 83.6% slower. Both propagated the renamed field and preserved unrelated Job identifiers and wire keys. |

“Pass” requires independent behavior checks, TypeScript checking, public tests, generated regression tests, unchanged immutable inputs and no unexpected output files. For all four passing results above, restoring the original implementation made the generated regression tests fail. Both completed refactors also retain `readonly traceId` and `readonly userId` on `RequestContext`, with no compatibility `requestId` member.

The medium and complex pairs used 26/30 and 20/43 tool calls respectively (previous/new). Their model HTTP request counts were 28/32 and 22/45. Across those two passing pairs, final provider-reported total tokens were 1,051,541 versus 2,135,694. This includes associated UI requests and any provider-reported reasoning/cache accounting; it is not a dollar-cost estimate. Extra reads and verification calls are observable overhead. The small sample does not isolate the causal effect of any one instruction or code change.

**Actual tool use across all twelve attempts.** These are descriptive counts, not pooled timing or reliability rates: the two sets had different action budgets and one baseline was interrupted by authentication.

| Observation | Previous build, six attempts | New build, six attempts |
|---|---:|---:|
| Tasks using at least one native tool | 3 | 6 |
| Hashline reads | 19 | 67 |
| Guarded hashline edits | 0 | 11 |
| `safe_edit_and_test` calls | 3 | 4 |
| LSP calls | 0 | 6 — all diagnostics |
| AST calls | 0 | 0 |
| Ordinary edits to existing source | 14 | 0 |

All 110 native tool calls completed. The candidate made 15 guarded source-edit calls; the baseline made three guarded calls and fourteen ordinary edits. New regression-test files correctly used ordinary writes. This demonstrates adoption of guarded editing, not that every resulting change was correct or that multi-file edits became atomic. In the normal-budget medium pair, the baseline itself chose `safe_edit_and_test` twice; native tools were already usable before the new guidance.

The six LSP responses came from the TypeScript server, but all carried `freshness: server_unversioned` and `versionVerified: false`. Empty diagnostics alone are not proof that the edited document version was checked; the independent compiler checks provide separate evidence. There were no references, definition or symbol queries. The four native tools were available in every row, so zero AST calls means non-selection, not failed registration.

**The first six runs are retained separately.** I initially imposed a 24-turn action cap. Four runs hit it, preventing a useful normal-operation comparison. Before any second-set calls, I removed that override for both builds and reversed the build order per task. No model trial was retried, replaced or discarded; the total remains twelve. The two sets must not be pooled into a single timing or completion claim.

| Task under 24-turn cap | Previous build | New build |
|---|---|---|
| Simple | 169.7 s; signed-zero defect | 235.5 s; behavior correct, regression tests missing at action limit |
| Medium | 77.2 s; passes, normal finish | 87.9 s; artifacts pass, final response reports action limit |
| Complex | 91.4 s; behavior correct, regression tests missing at action limit | 105.7 s; partial refactor at action limit, behavior/type checks fail |

**Remaining gaps and the next changes worth testing:**

- Improve efficiency in the [selection policy](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/selection.md) and its developer guidance: avoid repeated reads of unchanged files, use plain reads where anchors have no value, batch independent work, and avoid repeating completed checks. The new complex run read files repeatedly and used 43 tool calls versus 20. Do not assume more native calls improve a task.
- AST and semantic LSP adoption remain unproven. The interfaces are mounted, but the model still chose text reading/search for the structural and rename tasks. These fixtures are small enough to read in full. A future selection test should contain enough code and ambiguous references to make structural/semantic navigation useful; this batch did not add extra trials to force those calls.
- Guarded editing protects file versions and supports bounded verification; it does not validate the model's interpretation of requirements. Both builds produced a signed-zero mistake during this experiment, and the generated tests endorsed that mistake. Keep independent contract checks. No stale-file race or rollback fault was injected here, so this is not a measured concurrency-reliability advantage.
- The normal-budget simple baseline received two authenticated-session HTTP 401 responses and ended with `Authentication required`. It had already made eight successful model requests. Treat this as an infrastructure/authentication failure, not a faster result or a Rust regression. Investigate credential freshness across a whole trial before repeating the harness; the exact cause was not established.
- The fixtures were not Git repositories. Routine `git status`/`git grep` failures and intentionally failing numeric probes account for incidental tool errors; they should not be described as native-tool failures. A future harness should make repository status explicit.

**Controls and preparation.** Both binaries are debug builds with the same Rust feature/profile choice, the same Electron/runtime bytes within each set, fresh profiles/workspaces, identical outcome-based prompts, no Code Mode, and unspecified desktop-default reasoning effort. Build order was counterbalanced. The candidate also includes the lock-lifetime fix and tool-description/configuration changes, so this is a bundle comparison, not an isolated prompt experiment. One normal-budget pair per difficulty is exploratory evidence, not a general speed or reliability estimate.

Offline calibration rejected the seeded defects, accepted known-correct implementations and confirmed regression-test mutation detection for all three tasks. Before model inference, seven desktop setup attempts failed confined Keychain access; all had zero model requests and are preserved separately. Automatic approval review rejected an OAuth-token-in-child-environment adapter before it launched. The executed adapter instead kept real OAuth/API credentials in the parent and gave Goose only a short-lived, model-only localhost capability. Production authentication still ran. The copied app's authentication transport therefore differs from production Keychain access; this is not an end-to-end authentication benchmark.

All 156 per-row filesystem sentinel checks passed. Recorded calls remained workspace-local or invoked the supplied runtime. No immutable inputs changed, no unexpected output files remained, all telemetry settled, frozen execution-source hashes still match, and the temporary benchmark app processes stopped. The boundary constrained Goose and its descendants' user/temp file access; Electron, network and IPC were not fully isolated.

Evidence: [verification manifest](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/verification.json), [normal-budget summary and per-row solutions](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/v4/results/summary.json), [capped-set summary](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/v3/results/summary.json), [offline calibration](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/calibration.json), [pre-inference failures](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/authentication-setup-failures.json), [final-set protocol amendment](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection-ab/v4/protocol-addendum.md), and [Rust build proof](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_SELECTION_BUILD_2026-09-29.md). Raw private profiles and authentication material were not exported. Earlier 48-run results remain unchanged.
