# Local pipeline validation — 23–24 September 2026

This is a development snapshot, not a release approval. Nothing was pushed,
uploaded, deployed, or installed over the user's desktop app.

## Latest addendum: six fixes and repeated local evaluation

The follow-up implementation and benchmark are recorded in
[DESKTOP_FIX_VALIDATION_2026-09-24.md](DESKTOP_FIX_VALIDATION_2026-09-24.md), with
multi-cohort/deep details in
[EXPANDED_BENCHMARK_2026-09-24.md](EXPANDED_BENCHMARK_2026-09-24.md).
The exact additive desktop edit now preserves all 23 old items and adds one;
the persona consultation receives the exact revised PRD; mixed references pass.
The verified randomized desktop run completed 12/12 ordinary turns with actual
ON/OFF mounts checked and no Axwise interference. Weather response caching is
confirmed. Final offline checks: 219 Python, 174 Node and 129 focused desktop
tests passed. Persona latency, analysis repair overhead and one ambiguous PRD
timing requirement remain caveats. No upload or installed-app replacement occurred.

## Earlier addendum: initial actual desktop journey

The subsequent real Electron benchmark is recorded in
[DESKTOP_BENCHMARK_2026-09-24.md](DESKTOP_BENCHMARK_2026-09-24.md).
Seven capability types plus a PRD revision produced eight structurally valid
saved artifacts; market synthesis was not exercised in that desktop run. Ordinary
chat, weather and deeper-news follow-ups stayed outside Axwise. Real desktop
testing found three unresolved defects: additive PRD revisions delete unchanged
commitments despite passing review, persona dialogue lacks the PRD being discussed,
and mixed references cause an unnecessary PRD retry. This is not release approval.
The user's synthetic-interview policy was not changed by this audit; compatible
new proposals are acceptable, invented attribution and silent constraint changes
are not. No product implementation or public release changed in this audit.

## Earlier validation snapshot

Earlier state: all eight specialist capabilities are implemented. Offline suites
pass, but full conversational acceptance is still incomplete. The final packaged
smoke completed eight calls; the ninth (persona dialogue revision) failed during
provider review with `PROVIDER_UNAVAILABLE`, without replacing its saved parent.
An earlier complete nine-call run passed in 68 seconds. Do not treat either the
earlier success or test-harness-blocked turns as a release approval.

## Implemented scope

Eight optional MCP capabilities: discovery scope/stakeholders/questions, saved
synthetic personas, synthetic interviews, interview analysis (themes, patterns,
stakeholder views, sentiment and insights), saved-persona dialogue, selected
market evidence synthesis, product/software PRDs, and delivery briefs.

Goose chooses individual steps. There is no compulsory remote workflow or
per-turn Axwise classifier. Market retrieval remains with ordinary Goose search.
Workflow state, validation and versioned JSON/Markdown artifacts are local;
Gemini inference still uses the authenticated gateway. The shared desktop
Results view supports these artifacts and ordinary generated files, not a
separate Axwise UI or a cross-chat artifact library.

The package is `@orqaly/axwise-local` 0.2.0 and remains private. A bundled macOS
arm64 development runtime exists at `/private/tmp/axwise-full-pipeline-QbvlQ5`.
This is not yet a published npm package or a standalone uv distribution.

## Deterministic checks

- Python local-kernel suite: 189 passed, including source/identity invariants,
  full cross-stage handoffs, immutable persona profiles, reference-only
  simulation revisions, review/repair limits, synthetic provenance and 11
  original-scope context/replay regressions.
- Node adapter and benchmark suites: 149 passed, including reference/hash/scope
  checks, immutable publication/rollback, cancellation and two-worker bounds.
- Desktop Results integration: 1,306 tests passed across 144 files; TypeScript,
  focused lint and formatting passed. A subsequent focused rerun passed 91 tests
  across five files and TypeScript.
- After adding internal saved-scope context, all 30 descriptor-parser tests and
  TypeScript passed again; input/context envelopes cannot register fake Results.
- All nine real pipeline result descriptors were accepted by the desktop parser.
- Native Code Mode capability discovery: three new tests covering both loops and
  mount/unmount, 12 existing Code Mode tests, Clippy and a full-feature arm64
  release CLI build passed. The isolated binary is
  `/private/tmp/orqanix-native-discovery.ahAA6V/goose`; the installed app is unchanged.

## Live explicit integration smoke

One small fictional repair-shop fixture, one stakeholder, one synthetic persona,
two interview questions. These calls explicitly selected tools; they do not
prove natural tool selection or superiority over vanilla Goose.

| Stage | Elapsed |
| --- | ---: |
| Discovery scope | 6.85 s |
| Personas | 6.82 s |
| Simulation | 3.10 s |
| Analysis and all five views | 9.47 s |
| Market evidence/gaps | 5.94 s |
| Software PRD | 12.13 s |
| Delivery brief | 9.34 s |
| Persona dialogue | 5.87 s |
| Dialogue revision | 5.57 s |

All nine calls passed in 65.09 seconds total, using 17 model calls. Each reviewed
stage passed generation plus review without repair. Exact saved references,
source labels, quote spans, Markdown hashes and revision lineage were checked.
A separate reference-only simulation revision passed in 4.17 seconds with one
model call, retaining the original saved persona.

Report: `/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-pipeline-bIw99O/report.json`.
This fixture supplied no actual market evidence: returning explicit gaps and
proposed searches was the correct outcome. Timings exclude Goose's tool-selection
and final-answer generation, and are not latency guarantees.

An independent repeat (`axwise-pipeline-SbVWd6/report.json`) did **not** pass:
PRD generation mislabelled a source quote as an owner decision and omitted an
analysis-finding link for a proposed requirement. Its single repair only received
the first diagnostic, fixed that defect, and then failed on the second. The
dependent delivery call was skipped; independent persona chat/revision still
passed. This failure is retained, not hidden by the successful run above.

The next repeat (`axwise-pipeline-M3uosM/report.json`) caught a distinct handoff
ambiguity: a quote-free, insufficient synthetic finding was being offered as a
supporting PRD citation. Its seven independent stages completed, PRD failed, and
delivery was skipped. Preparation now separates quote-backed findings from
verbatim unsupported uncertainties; the latter remain gaps, not citations or
requirements. The original output validator is unchanged. The requested second
repetition did not start because session authentication returned HTTP 429.

After that representation fix, `axwise-pipeline-KUaWEg/report.json` passed all
nine calls in **68.35 seconds**, with 17 model calls and no repair. Stage times:
scope 6.38 s, personas 5.98 s, simulation 4.14 s, analysis 10.47 s, market 6.16 s,
PRD 11.97 s, delivery 10.35 s, persona chat 5.33 s, chat revision 7.56 s.
All nine descriptors passed the actual desktop parser. Manual audit confirmed all
four exact PRD acceptance/validation conditions survived: two mapped to proposed
tests and two pilot metrics were visibly deferred with reasons. This was still
a small fictional fixture, not an empirical market study.

The final snapshot including scope-context and empirical-validation guidance was
tested in `axwise-pipeline-s0De6a/report.json`: **8/9 calls completed** in 68.93 s.
All eight capability types succeeded, including scope-preserving analysis, PRD,
delivery and first persona dialogue. The ninth call was a dialogue revision:
generation completed, but its provider review returned `PROVIDER_UNAVAILABLE`.
No replacement artifact was published and the prior dialogue's exact hash stayed
unchanged. Eight successful descriptors passed the desktop parser. The PRD's
validation plan now explicitly calls for real participants and unknown baselines;
this fixture check is not a guarantee of semantic compliance on other inputs.

## Failures retained and repaired

- First live persona generation failed because model-calculated UTF-8 offsets
  were wrong. The repair attempt also miscounted. Host-computed passage IDs now
  replace byte arithmetic; exact quote validation was not weakened.
- An audit found saved personas could be replaced by new generated profiles
  under the same slot identity. The host now fixes profiles; the model produces
  interview answers only. Profile drift is rejected.
- Semantic inspection found a delivery brief omitted specific PRD acceptance
  checks. The host now preserves every exact acceptance criterion and validation
  metric with stable IDs and requires each to map to a proposed test or an
  explicit deferral. This proves accounting, not semantic equivalence or a
  passed software test. Generation/review guidance also warns against circular
  synthetic corroboration and promoting optional technologies to mandatory scope.
- Pre-change native Goose sometimes wrote analysis with general file tools
  without discovering Axwise. Four ordinary coding/brainstorm turns passed
  without Axwise interference, but the specialist and ambiguous-follow-up runs
  did not pass. Permission-blocked/skipped turns are not counted as successes.
- Goose Code Mode hides MCP initialization instructions and normal tool
  descriptions until discovery. A generic bounded mounted-capability directory
  is implemented in both native agent loops. Its first natural run discovered
  and proposed Axwise for analysis, but a benchmark AST permission restriction
  stopped execution. Five unrelated turns (news, deeper news, brainstorming,
  deeper brainstorming and ambiguous clarification) passed without Axwise.
  Another coding case was permission-blocked. Overall **5/11**, with dependent
  skipped turns counted as failures; this is not full routing acceptance.
- After narrowly expanding the benchmark's safe literal AST grammar, the next
  natural run (`axwise-conversation-5cCBAM/report.json`) passed **9/11**: actual
  source-preserving Axwise analysis (38.77 seconds end to end), news and a deeper
  news follow-up in that same chat, coding/deeper coding, brainstorming/deeper
  brainstorming and ambiguous clarification. No ordinary turn proposed Axwise.
  The explicit return to PRD was stopped by an unnecessary dynamic file-write
  wrapper, not counted as a completed PRD. A separate parallel news-search wrapper
  also exceeded the old test grammar. The latter now has bounded offline coverage;
  dynamic writes remain blocked. Tool guidance says results are already saved.
- Manual reading found the Goose final summary added tensions absent from the
  saved specialist artifact. This is a host-summary semantic risk, not covered by
  the structural pass count. Guidance now asks for faithful summaries, not a new
  analysis. Model compliance and comparative semantic quality remain live gates.
- An attempted ordinary-chat/weather Axwise-off versus Axwise-on benchmark
  (`local-axwise-benchmark-ycPV9J`) was stopped by session HTTP 429 before any
  comparison. It is **not** evidence of latency parity or improvement.
- A later ordinary-chat-only comparison (`local-axwise-benchmark-dreAfR/report.json`)
  completed two samples per arm with the same isolated Goose binary/model.
  No tools or Axwise calls occurred. Median response time: Axwise absent 3.740 s,
  mounted 3.697 s. Fresh-session setup was 91–125 ms absent versus 429–546 ms
  mounted. This tiny sample shows no observed chat interference; it cannot prove
  performance parity, superiority, or weather/search latency.
- The final four-turn natural attempt (`axwise-conversation-GaHeAn/report.json`)
  stopped at the analysis wrapper's unawaited-then-awaited Todo promise, which
  the bounded test grammar does not support. It proposed the intended Axwise
  analysis but did not execute it; all three later turns were skipped. **0/4**,
  retained as incomplete evidence. No broader execution permission was granted
  just to turn this report green.

Earlier reports remain intact under `axwise-pipeline-2tiIAo`,
`axwise-conversation-ro8Npc`, `axwise-conversation-SIxlhO` and
`axwise-conversation-iwWD8B` in the macOS temporary directory.

## Remaining acceptance boundaries

The 68-second run's content audit still found an analysis insight that drifted
from a manual-assignment constraint, and a proposed pilot that conflated simulated
people with real human timing/adoption measurements. Subsequent local hardening
preserves selected simulation context into analysis and distinguishes scenario
rehearsal from empirical validation in generation/review. Synthetic seed
reinforcement remains a limitation, not independent corroboration.

At that earlier snapshot, no end-to-end Electron visual test or installed-app
upgrade had been performed. The desktop addendum above supersedes the visual-test
gap; installed-app upgrade remains untested.
Large/deep cohorts have deterministic concurrency/lineage tests, but the live
full-chain smoke above is deliberately small. Model review and exact attribution
do not establish factual truth, real customer demand or statistical quality.
Synthetic research remains labelled hypothesis exploration throughout.
