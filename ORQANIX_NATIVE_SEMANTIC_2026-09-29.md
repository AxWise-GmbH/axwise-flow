# Native AST/LSP: implementation and actual desktop test

The semantic integration works, but this candidate does **not** meet the no-slowdown target. All twelve desktop trials passed the same independent correctness checks. The native candidate took **39.3% more total time** than the released Goose baseline. Keep the feature optional and off by default; the installed Orqanix application was not replaced.

| Task | Baseline median | Native median | Native time change |
|---|---:|---:|---:|
| Small control edit | 26.7 s | 31.1 s | +16.7% |
| Structural route-handler repair | 58.1 s | 73.5 s | +26.5% |
| Ambiguous cross-file rename | 108.8 s | 165.1 s | +51.7% |

Two trials per task and arm; these are screening results, not statistical proof of general speed or reliability. The frozen acceptance gate failed on aggregate time, median time, control time and consistent semantic-tool adoption. No measured quality loss was found on these fixtures; this does not establish a reliability improvement.

## What changed in Goose

- `native_engineering/ast.rs`: Tree-sitter function/class/call presets, optional exact-name filtering, bounded syntax context, correct UTF-16 positions and one file hash per result file. Raw queries remain supported. This is syntax matching, not semantic binding analysis.
- `native_engineering/lsp.rs`: named declaration lookup plus semantic references/definition/hover in one tool invocation; qualified-name disambiguation; explicit ambiguity/missing-position errors; compact paginated references with saved-line context. Existing lazy server startup and reuse were retained.
- A real TypeScript correctness bug was fixed: the server's default partial-semantic process could answer an early reference query with only the declaration, omitting cross-file aliases. `tsserver.useSyntaxServer="never"` makes the query use the full semantic server. A real-server regression covers aliases, shadowing, ambiguity, changed open files and process reuse.
- Native selection policy v3 and the developer instructions allow ordinary tools for simple edits and discourage extra semantic queries, rereads and repeated successful tests. This guidance did not reliably prevent extra work in the live model runs.
- Both Goose loops, host-controlled mounting, approvals, cancellation and Code Mode discovery were exercised. No OMP agent or model sidecar was added.

In a desktop rebuilt from this source, the feature is controlled by the existing **Settings → Chat → Native Engineering** toggle. The installed 2.4.2 app has not received this new binary. Runtime language servers are supplied by the desktop host. The default remains disabled. The native tool implementations execute inside Goose; the real language-server processes start only when queried.

## What the live traces establish

Goose selected AST in **1/2** structural trials and LSP in **2/2** rename trials without the task prompts requiring those tools. All native calls completed without tool errors. In the second rename it used the new named-reference API, including `RequestContext.requestId`, which returned sixteen locations.

The first rename's four LSP tool intervals totaled about **0.55 s**, including its approximately **0.39 s** first call. These are observed desktop tool intervals, not a CPU profiler. The overall candidate was about **58.5 s** slower on that pair, so language-server startup does not explain most of the difference.

Across six trials per arm:

| Measurement | Baseline | Native |
|---|---:|---:|
| Total task time | 387.178 s | 539.486 s |
| Model requests, including desktop requests | 159 | 183 |
| Input tokens reported by provider | 2,691,707 | 5,994,860 |
| Tool calls | 147 | 171 |
| Independent correctness passes | 6/6 | 6/6 |

The native runs made many guarded reads and edits, including reading a README through hashline tooling and multiple separate metadata reads on the control task. They also repeated searches and successful checks. Their larger conversations and additional model round trips are the main observed overhead. The largest individual provider responses were about 15.3 s baseline and 16.8 s native; this comparison is not dominated by the earlier benchmark's single 73-second response outlier.

All 342 model responses had verified `gemini-3.8-flash` identity, HTTP 200 and usage metadata. Six response streams were recorded as cancelled after consumption (one baseline, five native); these remain in the evidence and are distinct from clean task completion. No task was discarded or replaced.

## Validation and limits

- 51 native unit checks, 4 integration checks covering both loops, 6 Code Mode checks, and 2 real bundled-language-server checks passed. The 10 AST unit checks were rerun after the checked UTF-8 slice correction. Clippy and formatting passed; a release binary was built.
- The real named-reference test measured about 0.54 s cold and 0.01 s warm, with the same server process and zero model calls. These local fixture timings are not end-to-end performance claims.
- Real TypeScript/Python diagnostic tests require the actual injected type-error code, not merely a nonempty diagnostics array. TypeScript push diagnostics remain unversioned and are explicitly labelled as such; they do not prove freshness. Saved-line reference context is not an atomic project snapshot. Tests/typechecking remain the correctness gate.
- All three workload evaluators were calibrated against original and known-correct implementations. They verify behavior, types, public tests, meaningful added regression tests, detection of the original bug, and unchanged protected files/unrelated identifiers.
- Timed tests used actual Electron Settings and Send, the same current temporary desktop UI and prompt, Gemini 3.8 Flash, default effort, Jev/AxWise off, fresh workspaces/profiles, cold semantic servers and counterbalanced order. Baseline backend is the actual installed 2.4.2 executable; candidate is a release build. This is not a comparison of two separately packaged full application releases or an AST/LSP-only ablation: the candidate also contains the preceding native-tool changes. A same-binary native-off arm was not included in this twelve-trial design.
- Setup/independent grading are excluded; Send-to-terminal timing includes inference, tools and OAuth refresh. The Keychain-related startup timeout occurred in a zero-inference preflight, was preserved, and the same signed app passed after approval. The twelve live trials had no setup failures.
- The backend and descendants used verified filesystem confinement. Electron, networking and IPC were not completely isolated. Parent authentication stayed outside Goose; the child received only an expiring model-only localhost capability.

## Follow-up correction and remaining work

After the frozen comparison, the `lsp_query` schema descriptions for `line` and `character` were corrected: they are alternatives to `symbol`, not unconditionally required. This is a wording-only correction, not a demonstrated speed improvement. The frozen benchmark application and its binary were preserved unchanged. The final Rust binary was rebuilt and separately exercised through the native self-test recipe. Tool receipts independently confirmed AST decoy exclusion, named references after project setup, ambiguity handling, file refresh, pagination, a verified edit, rollback restoring the actual bytes, and stale-hash rejection preventing a marker command. This was **not a clean overall recipe pass**: its first unconfigured TypeScript query omitted the unopened consumer, and it later attempted a filesystem-wide cargo search outside the intended task scope. That command returned code 1 with no output under confinement; attempts to stop it found no matching live process, so no termination is claimed.

The recipe originally overrode the profile's native extension; that preliminary model run is recorded as a skip. The validated native run used an explicit host `--with-builtin native_engineering` mount. The recipe now asks for project configuration before cross-file checks and restricts Rust prerequisite discovery to `command -v cargo` and the current workspace. Those subsequent recipe-only changes were rendered/validated offline; they were not rerun through a model. Native reference results still describe the server project graph, not guaranteed complete coverage of every workspace file.

The next performance changes should address measured costs before another rollout:

1. In `native_engineering/edits.rs`, design a short snapshot handle whose server-side state retains the full digest and anchors, reducing repeated long hash strings sent through the model while preserving stale-file rejection.
2. Add a guarded multi-file edit operation that validates all preimages before changing files and handles partial failures explicitly. This can remove per-file model round trips; its transaction and cancellation behavior need independent tests.
3. In `selection.md` and the developer instructions, preserve the ordinary fast path and make batched inspection and stopping after sufficient verification more consistent. Prompt guidance alone has not achieved that here.

These follow-ups are recommendations, not implemented features or claimed speed gains.

## Evidence

- [Frozen protocol](review-evidence/2026-09-29/native-semantic-v3/PROTOCOL.md)
- [Raw twelve-trial report](review-evidence/2026-09-29/native-semantic-v3/timed/report.json)
- [Summary and acceptance gates](review-evidence/2026-09-29/native-semantic-v3/timed/summary.json)
- [Successful provenance/model verification](review-evidence/2026-09-29/native-semantic-v3/timed/verification.json)
- [Timed build/source manifest](review-evidence/2026-09-29/native-semantic-v3/build.json)
- [Source patch](review-evidence/2026-09-29/native-semantic-v3/semantic-v3.patch)
- [Independent functional receipt checks and caveats](review-evidence/2026-09-29/native-semantic-v3/validation/functional-verification.json)
- [Validation logs](review-evidence/2026-09-29/native-semantic-v3/validation/)
