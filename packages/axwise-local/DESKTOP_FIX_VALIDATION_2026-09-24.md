# Desktop fixes and repeat benchmark — 24 September 2026

## Outcome

All six requested workstreams were implemented and exercised locally. The exact
additive PRD regression now preserves all 23 previous items and adds only the
requested condition. The natural persona conversation now receives the exact
revised PRD. The verified randomized comparison completed 12/12 turns, with no
Axwise calls for ordinary explanations or weather.

This is not blanket release approval or proof of superiority over vanilla Goose.
Persona correctness improved but its desktop turnaround did not. Expanded
analysis still needed repair passes, and one initial PRD introduced an ambiguous
human-time requirement. Those findings are retained below.

No commit, push, upload, deployment, IAM/RBAC/billing change or installed-app
replacement was made. Synthetic interviews retain their existing role and
provenance; this work did not demote them or add a new synthetic-use policy.

## Changes

| Request | Implementation |
| --- | --- |
| Additive revision preservation | `backend/services/local_axwise/prd_revisions.py` and `kernel.py`: host-applied item patches, stable item identities, explicit targeted replacements/removals, immutable parents and preservation accounting |
| Exact persona document | `personas.py`: complete selected/continued document snapshot and hash, explicit selector for ambiguity, metadata-only source catalogues kept as document context; missing explicit document context rejected before inference |
| Mixed references | `packages/axwise-local/src/runtime.mjs`: compatible legacy analysis plus discovery/market references merge; real conflicts still fail before inference |
| Faithful summaries and rendering | `conversation-policy.mjs` and runtime guidance: exact saved-result link and short faithful bullets; Goose desktop question extraction, result links and Markdown citation normalization repaired |
| Host latency | `scripts/profile-desktop-spans.mjs`: read-only provider-span/cache profiling; native `code_execution.rs` guidance reuses known unchanged tool signatures without taking tool ownership from Goose |
| Broader evaluation | `scripts/benchmark-axwise-expanded.mjs` and `benchmark-desktop-routing.mjs`: different cohorts/depths, actual selected publisher evidence, randomized arms, actual mount assertions and explicit cache measurements |

Desktop changes are in the local fork `/private/tmp/orqaly-goose-ux-233`, principally
`ui/desktop/src/orqaly/questions.ts`, `replyQuestionPrompt.ts`,
`workspace/ResultLinks.tsx`, `workspace/resultArtifacts.ts`,
`workspace/FilePreview.tsx`, `WorkspacePanel.tsx`, `components/MarkdownContent.tsx`,
`components/BaseChat.tsx` and `utils/markdownLinks.ts`, with focused tests.

## Exact desktop regressions

The isolated Electron development app used the original conversation
`20260924_1`. Send-to-completion timers include host inference and tools, exclude
manual navigation/typing, and recorded no approval pauses for the successful
retests. The edit-in-place UI ignores unchanged text, so a single internal space
was replaced with a newline to trigger the rerun; every word and the requested
acceptance condition remained unchanged. This is the same failing edit and
parent, not a byte-identical prompt or a new simplified fixture.

| Measurement | Earlier run | Fixed desktop run |
| --- | ---: | ---: |
| Additive PRD edit, complete turn | 32.397 s, destructive rewrite | **15.565 s**, correct additive patch |
| Host selection/argument inference for that edit | 9.910 s | 6.133 s |
| Host final-summary inference | 3.724 s | 2.483 s |
| Specialist model inference | 15.512 s / 3 calls | 4.601 s / 2 calls |
| Persona consultation, complete turn | 24.245 s, missing PRD | **29.569 s**, exact PRD selected |

These are individual observations, not controlled performance claims. Provider
latency/cache and conversation state differ. Span sums and UI timers use
different boundaries; unaccounted residual time is not assigned to a component.

Across the original eleven-turn journey, the profiler found 37 recorded host
calls totaling 189.767 s: 15.975 s deciding to discover schemas, 77.291 s selecting
tools/generating arguments, 84.303 s in final-summary candidates, and 12.198 s in
ordinary final-answer candidates. These are inferred phase labels on measured
provider calls, not internal model traces. Most discovery requested a genuinely
new capability; there was no evidence of a repeated catalogue loop to eliminate.
Consequently, schema-reuse guidance is a guardrail, not a claimed measured cache
speedup. The main proven PRD saving is its small additive generation, plus a
shorter final reply; full artifact and persona-context review still cost time.

PRD parent `8265682e-ff78-48e7-9e45-72a239fdf540` retains SHA-256
`aa9cf23aa474de6672ddfa0a8ede324f111e2f2beeb776575d3605c24f3ac31f`.
New revision `33f062aa-cb7a-4ab8-9d19-ece7350b14c8` retains all 23 item objects in
their original sections/order, adds one owner condition, and changes/removes
zero items. The visible Results diff shows **+1 / −0** and the earlier version
remains selectable. Its 67-word final reply is faithful and opens that exact
revision. A live preview test caught host-summary guidance leaking into the
transport-derived preview, not the saved `.md`; moving guidance after the
descriptor and narrowly stripping the exact old envelope suffix fixed it.

Persona result `b09793fb-c07e-45cd-8a3b-08c5ddf77e17` contains the exact new PRD
reference/hash and a complete document object equal to the saved artifact. It
acknowledges the existing unified intake and duplicate warning, then proposes a
manual capacity indicator. That is an enhancement within scope, not automatic
assignment or a claim that already-specified intake features are missing. The
host gives a faithful 74-word, two-bullet summary plus result link.

This old conversation initially reused a persona call without the document.
The new `DOCUMENT_CONTEXT_REQUIRED` preflight rejected that call without any
specialist model inference or publication. Goose refreshed the schema once and
supplied the exact PRD itself; the harness did not inject tool arguments. The
successful consultation then used generation plus review, with 12.482 s of
specialist inference (including a 9.345 s review). The preflight is deliberately
a narrow document-reference check, not a multilingual semantic classifier or a
guarantee that every paraphrase will select the correct tool.

The old interview guide remained normal text instead of a user questionnaire.
Saved-result link navigation and the one-line diff were checked in the live UI;
question/citation edge cases and legitimate clarification forms have focused
automated coverage. Historical summaries were not rewritten.

## Randomized ordinary-turn comparison

Final seed: `8726dd1fb5220f4ceacbc995`. Two fresh conversations per prompt per
arm, twelve completed turns. Before each turn the runner waits for loaded
Settings and confirms the persisted boolean. After each turn it reads the
session's actual mounted-extension names before changing Settings again.
All six ON and all six OFF states matched. The original enabled setting was
restored. No Axwise call, discovery request or intermediate tool narration
occurred in these ordinary cases; weather used only `desktop-utilities__get_weather`.

| Prompt | Axwise ON samples / median | Axwise OFF samples / median |
| --- | --- | --- |
| Explain an API | 3.677, 3.898 s / **3.788 s** | 2.817, 3.104 s / **2.961 s** |
| Explain two-factor authentication | 4.936, 4.835 s / **4.886 s** | 3.905, 5.120 s / **4.513 s** |
| Kaunas weather with source | 5.054, 4.538 s / **4.796 s** | 4.879, 4.502 s / **4.691 s** |

There is no observed task hijacking, but ON is not faster: median differences
are +0.827 s, +0.373 s and +0.106 s respectively. This tiny exploratory sample
cannot establish statistical significance, causal overhead, latency parity,
quality superiority, deep-mode benefit or vanilla-Goose equivalence. It compares
the same local reset app/model with one capability mounted/unmounted.

Raw report and numeric provider profiles:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-desktop-randomized-uLAvXx/`.

### Explicit cache observations

- All four fresh weather calls reported `cacheHit: false`.
- A separate repeat in the same weather conversation reported `cacheHit: true`
  and finished in **3.598 s**, versus that conversation's first 4.782 s lookup.
  This confirms utility response-cache reuse, not a controlled causal speedup.
- All 16 host model calls in the final randomized trial had unavailable prompt
  cache counters; they remain null, not zero.
- The long research conversation does report prompt-token caching: the fixed
  PRD summary reported 73,339 reused tokens of 79,612 input tokens. Its preceding
  selection call did not report cache data. The successful persona turn reported
  236,289 reused tokens across 3/4 host calls (94.7% of input on reporting calls).
- Expanded specialist runs exposed no usable cache counters across 44 model
  calls. This does not mean caching is disabled. No Axwise output replay cache
  was added; immutable selected artifacts are reused as inputs, not silently
  substituted for a newly requested generation.

## Expanded pipeline and remaining findings

See [expanded benchmark](EXPANDED_BENCHMARK_2026-09-24.md) for every stage,
publisher URL, source excerpt/hash, attempt and resumption.

- Standard: **9/9 checks, 119.078 s**, one fresh chain, two personas/four answers,
  real selected Atlassian material; revision retained 26/26 items plus one addition.
- Deep: **9/9 verified across explicit resumptions**, 136.814 s of successful-stage
  work, four personas/eight answers and selected Google Calendar material;
  revision retained 28/28 items plus one addition. This is not uninterrupted
  turnaround, and task/cohort differences prevent a controlled depth comparison.
- Both analyses needed four model calls because first outputs omitted structured
  evidence gaps while admitting unknown baselines elsewhere. Improve first-pass
  generator/reviewer agreement next; do not remove substantive checks to make a
  benchmark faster. Analysis took 31.1 s and 40.3 s in these cases.
- One initial standard PRD mixed five-second system propagation with a technician
  acting within five seconds. This is an ambiguous added operational expectation,
  not a different product direction; it needs human-time versus system-latency
  clarification. The additive revision preserved rather than introduced it.
- Tool mounting can fail open, allowing ordinary chat to continue. Settings ON
  alone is therefore not sufficient observability; the benchmark now verifies
  actual mount state. A user-visible mount-failure indicator remains follow-up work.

## Excluded/retained attempts and measurement honesty

The first randomized run (`axwise-desktop-randomized-kFwOCn`, seed
`b2aef6327c74e59db77f37b2`) completed twelve turns but two requested-ON sessions
(`20260924_11`, `20260924_17`) lacked Axwise. It is excluded from the comparison.
The old harness read a disabled/loading unchecked switch and did not confirm
actual mounts. That is a proven harness defect, but available logs do not prove
it caused each missing mount. Its initial-state capture also restored OFF.

A subsequent persona attempt with Axwise disabled took 45.944 s and saved no
new persona result; it is a failed test setup, not a successful latency sample.
Another persona turn was interrupted by our development hot reload and has no
usable completion timing. Before the final guard, a 13.922 s consultation
honestly reported missing document context but did not meet the task; its
artifact is retained. Exact-text edit no-ops and development launch failures
are not counted as completed model turns. No failed attempt is hidden inside
the successful benchmark figures.

## Verification and reproducibility

- Python local Axwise: **219 tests passed**.
- Node package and all benchmark/profiler tests: **174 passed**.
- Final focused desktop suite: **129 tests / 9 files passed**; additional scoped
  TypeScript, lint and format checks passed during implementation.
- Native Code Mode: **13 tests**, scoped Clippy/format checks and verified full
  release CLI build passed. No installed native binary was overwritten.
- Both repository diff checks passed. Existing unrelated dirty files were preserved.

Isolated desktop/profile: `/private/tmp/orqanix-desktop-journey.qUbJEX`.
Final runtime manifest SHA-256:
`27659dc6393c61ffc25d6ced186f30a3b4fe5601e25b79e1ddc30dd392068eef`.
Native binary SHA-256:
`d734883d486c2137417c5c099fa5c2fe858faa93b199ecd022c1398186030610`.
The development runtime is explicitly `releaseEligible=false` and the app is
still a local 2.3.13 development build, not a published installer. The exact PRD
retest preceded the final persona-preflight addition; its preservation code is
unchanged. Earlier expanded runs identify their own runtime hashes separately.

Regression timers, original/final numeric profiles and screenshots are retained
in `/private/tmp/axwise-desktop-benchmark.ebIX3F/`, including
`fixed_prd_revision.json`, `fixed_persona_enabled_guard.json`,
`fixed_prd_diff.png`, `final_persona_context.png` and `weather-cache-profile.json`.
Saved artifacts remain in the profile's account/conversation-scoped Axwise store.
These temporary local directories are evidence, not a durability/export promise.

Run `node scripts/benchmark-desktop-routing.mjs` for a no-inference plan. Live
execution additionally requires `--live --desktop <absolute desktop directory>
--db <absolute sessions.db> --cdp http://127.0.0.1:<port>`. Profiling uses
`node scripts/profile-desktop-spans.mjs --db <path> --session <id>` and is read-only.
The browser must already be running in an isolated, signed-in development profile.

During the native build, redundant generated temporary runtime copies and build
caches were removed to recover disk space. Original source backups, installed
apps, saved results and benchmark reports were retained; those generated copies
can be rebuilt from the retained sources.
