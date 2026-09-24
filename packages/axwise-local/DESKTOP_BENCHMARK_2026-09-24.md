# Real desktop journey — 24 September 2026

Subsequent fixes and reruns are recorded in
[DESKTOP_FIX_VALIDATION_2026-09-24.md](DESKTOP_FIX_VALIDATION_2026-09-24.md).
This report retains the original failed baseline; its unresolved-defect wording
describes that earlier snapshot, not the current implementation.

## Decision

Local validation only. The optional-extension architecture works in this tested
chat journey, but this is **not release approval**. A PRD revision silently
removed existing commitments despite passing model review. Persona dialogue also
lacked the PRD it was asked to discuss, and one valid mixed-reference PRD request
needed a retry. No product code, synthetic-interview policy, installed application,
cloud service or release was changed during this audit.

Synthetic interviews remain usable research inputs as requested. Compatible new
ideas are allowed; a proposal need not repeat a transcript verbatim. The quality
boundary is invented attribution, contradiction of an explicit scope constraint,
or deletion of requirements the user explicitly asked to preserve.

## Method and build

- Actual Electron renderer, real chat input, tool approvals, Settings switches,
  Results previews and revision diff; not a mocked tool invocation or ACP-only run.
- Isolated development app/profile at
  `/private/tmp/orqanix-desktop-journey.qUbJEX`; installed app unchanged.
- UI displays 2.3.13; this is an unpackaged development build, not a new release.
- Native CLI SHA-256:
  `e43e9656fb23362fd14515485e17bbe51e650e1f9165c423ca8ff8713e0b8cf3`.
- Axwise local runtime 0.2.0 from
  `/private/tmp/axwise-full-pipeline-QbvlQ5/axwise-runtime`.
- Session provider/model IDs: `orqaly` / `orqaly-gemini`. This report does not
  assert an underlying Gemini version from the provider alias alone.
- Smart approval mode; OMP off and JEV setting on. Axwise on for the research
  journey. On/off comparison changed only Axwise through desktop Settings.
- Evidence: `/private/tmp/axwise-desktop-benchmark.ebIX3F`, with per-turn JSON,
  DOM timing instrumentation, screenshots, test driver and prior semantic audit.
- Main journey: `20260924_1`. Comparison sessions: `20260924_2`–`20260924_9`.
  Read-only session records confirm Axwise mounted in sessions 2–5 and absent
  in 6–9. All comparison sessions used the same provider/model IDs and Smart mode.

The timer starts immediately before Send and ends when the desktop stops showing
the active turn. Approval time is measured while an enabled Allow Once control is
present. **Active wall time = total elapsed minus approval waiting**; it still
includes Goose inference, tool selection, tool work and final response generation.
Approval waits include our deliberate inspection and must not be attributed to
model latency. New-chat navigation, typing and inter-turn thinking are excluded.
Two initial driver attempts targeted cached/hidden home inputs and did not send
a message; they are excluded, not counted as product failures or timing samples.

## Research journey timings

One sample per step; a two-persona, four-answer building-repair software fixture.
Scope: one building, five total staff, shared queue, retained email intake and
manual dispatcher assignment; no payments, predictive maintenance or automatic
assignment. News was interleaved before returning to the PRD.

| Desktop turn | Total seconds | Approval seconds | Active seconds | Result |
| --- | ---: | ---: | ---: | --- |
| Discovery scope, stakeholders, questions | 199.449 | 170.184 | 29.265 | Pass |
| Two saved personas | 108.743 | 80.807 | 27.936 | Pass; minor staff-count wording drift |
| Synthetic interviews | 52.855 | 35.552 | 17.303 | Pass |
| Analysis: themes, patterns, views, sentiment, insights | 70.420 | 42.150 | 28.270 | Pass; compatible new proposal allowed |
| Local news | 199.062 | 165.536 | 33.526 | Ordinary search, no Axwise |
| Explicit deeper-news follow-up | 12.386 | 0 | 12.386 | Stayed on news; no new tools |
| Bare “Go deeper.” | 89.766 | 51.311 | 38.455 | Ordinary search, no Axwise |
| PRD | 147.580 | 108.932 | 38.648 | Completed after false-conflict retry |
| Delivery brief | 23.340 | 0 | 23.340 | Pass; required acceptance checks retained |
| Saved-persona discussion of PRD | 24.245 | 0 | 24.245 | Saved correctly, but missing PRD context |
| Add one PRD acceptance criterion | 32.397 | 0 | 32.397 | Version saved; semantic preservation failed |

Scope through delivery, excluding interleaved news, took **164.762 seconds
(2m45s) active**. Including persona dialogue and revision, the eight specialist
desktop turns took **221.404 seconds (3m41s) active**. This is not uninterrupted
elapsed time and not a guarantee for larger/deeper research.

The eight saved artifacts represent seven distinct capability types plus a PRD
revision. Market synthesis was not exercised in this desktop run. All eight
artifacts passed structural validation, but semantic acceptance did not fully pass.

Instrumented specialist work totaled 88.784 seconds, including 76.036 seconds
of model inference across 16 model calls. That is a different measurement from
221.404 seconds of desktop active time: host tool discovery/selection, the failed
PRD attempt, final summaries and other host work are outside those component
timers. The gap warrants profiling; it is not all proven removable overhead.

## Ordinary chat and weather: Axwise on/off

Same visible input in a fresh chat for each run:
“Explain two-factor authentication in two short sentences.”

| Axwise setting | Samples, seconds | Median | Tool calls |
| --- | --- | ---: | ---: |
| On | 3.992, 6.072, 4.874 | 4.874 s | 0 |
| Off | 3.855, 4.310, 3.910 | 3.910 s | 0 |

Observed median difference: +0.964 seconds with Axwise mounted. Three samples
per arm, sequential on-then-off order and uncontrolled provider/cache conditions
do not establish a causal penalty or performance parity. No ordinary chat was
sent through Axwise.

Weather prompt: “What is the weather in Kaunas today? Celsius, a short answer with
its source.” One sample per arm:

| Axwise setting | Desktop time | Tool selection | UI result |
| --- | ---: | --- | --- |
| On | 5.658 s | `desktop-utilities__get_weather` only | Weather card + short sourced answer |
| Off | 15.774 s | `desktop-utilities__get_weather` only | Same card + short sourced answer |

No approvals or Axwise calls in either weather turn. Session timestamps place
the weather request about 3 seconds after the user turn in the on sample and
12 seconds after it in the off sample; each tool response has the same whole-second
timestamp as its request. Most of this particular difference happened before
the weather tool ran, not inside Axwise. A single pair cannot establish which
configuration is faster. Weather/model cache conditions were not controlled.

The Settings toggle actually removed the extension from new session snapshots.
It was restored to on after the comparison; OMP/JEV settings were not changed.
This is **same-app Axwise-on/off**, not a new vanilla-Goose comparison.

## What passed

- Goose selected Axwise for the intended specialist steps, and did not use it
  for news, bare deeper-news follow-up, ordinary explanations or weather.
- Saved personas retained their identity into simulation; four analysis quotes
  matched transcript text and participant/question mappings.
- Initial analysis, PRD and delivery retained the manual-assignment pilot scope.
  No news material leaked into product requirements after returning from news.
- PRD-to-delivery accounting preserved the selected acceptance conditions and
  validation metrics as tests or explicit deferrals.
- Results showed saved artifacts, grouped two PRD revisions, opened Markdown and
  let us select Revision 1/Revision 2 and inspect Changes.
- Original PRD hash stayed unchanged after revision; recovery is possible.
- Weather stayed out of Results (zero artifacts); its card and source link rendered.

## Failures and severity

### High: additive revision deleted previous commitments

User instruction: preserve the previous PRD, all requirements and scope; add a
warning before creating a second ticket from the same email, requiring explicit
dispatcher confirmation to proceed.

The new warning was added, but revision 2 also dropped:

- Email visibility within 30 seconds.
- Status updates within five seconds.
- Email linking in fewer than three clicks, chronological rendering and no
  copy/paste requirement.
- Mandatory-field validation when creating a ticket.

It also reordered priorities and weakened a target of at least 30% faster triage
to merely faster than baseline. These are material unintended specification
changes, not harmless elaboration. The model reviewer passed them. The Changes
panel showed +30/-28 lines, but detecting the regression was left to the user.

Original PRD: `8265682e-ff78-48e7-9e45-72a239fdf540`.
Revision: `7f58c2ff-54cc-4f15-b8f6-710a19214ba8`.

Repair priority: stable requirement/acceptance IDs, bounded additive patching and
deterministic preservation checks. Allow intentional edits explicitly; do not
depend on a general model review to prove that unchanged obligations survived.

### Medium: persona did not receive the PRD under discussion

The question “If we implement this PRD…” was sent with the exact saved persona
cohort and message, but without the PRD content. The answer recommended features
already specified. Persona identity/storage passed; document-aware critique did not.

`backend/services/local_axwise/personas.py::_chat_context` currently prepares
persona, dialogue history, message and sources, not selected PRD sections.
Fix the tool invocation and bounded artifact-context handoff together. Merely
adding a reference will not help if its content never enters the persona context.
This finding does not challenge the use of synthetic participants.

### Medium: valid references falsely conflicted

The first PRD call selected its saved analysis using `analysisArtifact` and its
discovery scope using `references`. The adapter incorrectly required an analysis
also to appear inside `references`, and rejected the request as a conflict.
Goose retried successfully, keeping scope in its brief, but paid extra latency.

Location: `packages/axwise-local/src/runtime.mjs`, mixed-reference handling around
lines 257–272. Merge the exact legacy analysis with compatible non-analysis
references; reject genuinely different analyses. Add a regression test.

### Lower priority: presentation and scope wording

- Persona wording briefly described five field technicians rather than five
  total staff; the initial final PRD correctly used one dispatcher plus four
  technicians. Contained inconsistency, not a changed delivered scope.
- Interview-guide questions were rendered as a “Your Turn to Answer” form even
  though they were questions for interview participants, not for the chat user.
- Summaries were longer than requested and exposed raw artifact IDs/paths/hashes.
- Some citation markers were not navigable; one rendered news redirect ended
  in encoded `>` (`%3E`). HTTP failure was not independently tested.

News tools produced source links and dates, but publisher truth/recency was not
independently audited here. Routing success is not a factual-quality score.

## Clarification of the earlier warnings

“No automatic assignment” became “in favor of voluntary job claiming” in an older
Goose summary. Claiming is a possible design proposal, but the interviewee had
not stated that preference. A purported dispatcher desire for automated triage
was also invented. Fine as questions/proposals; not fine as participant attribution.

An older analysis recommended assignment automation despite manual assignment
being an explicit constraint. The final PRD and delivery excluded automation, so
that run did **not** deliver a critically different product direction. The problem
was an intermediate contradiction. Email integration, mobile usability, security,
status boards and a clearly proposed email-to-ticket draft helper are compatible
enhancements and are not counted as failures just because wording was new.

## Recommended sequence

1. Fix additive revision preservation; rerun the exact failing desktop edit.
2. Pass the exact selected document into persona discussions.
3. Repair mixed-reference validation to avoid unnecessary retry/inference.
4. Shorten faithful host summaries and fix interview-question rendering/citations.
5. Profile host discovery/selection/summary spans; avoid repeated discovery and
   needless intermediate narration without changing Goose's tool ownership.
6. Repeat with multiple prompts/cohorts, randomized on/off ordering, explicit
   cache measurements, real selected market evidence and deep-mode cases.

Remaining untested here: deep/large cohorts, market-evidence desktop flow,
restart/cancellation recovery and packaged installed-app upgrade. Earlier offline
and explicit integration checks remain recorded in `LOCAL_VALIDATION.md`; they
do not supersede these real desktop failures. Do not publish on this evidence yet.
