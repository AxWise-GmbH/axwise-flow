# Local Axwise evaluation — 23 September 2026

This is a **local-only evaluation**, not a published release. No GitHub push,
website update, deployment, IAM change or cloud-service removal was performed.
The existing installed/running application was not replaced.

## Package and execution boundary

- Orqanix 2.3.12, build 5679, macOS arm64; separate ad-hoc-signed application.
- Bundled, hash-pinned CPython 3.12.14 plus five pinned dependencies; no manual
  Python installation or dependency download on an end user's first tool call.
- Goose owns tool selection, permissions and continuation. The independent
  **Local Axwise specialist** setting defaults off and changes the extension
  inventory on the next inactive-to-active turn, including resumed chats.
- Three normal MCP tools: `create_prd`, `analyze_interviews`,
  `simulate_interviews`. No new weather/search/chat/coding router or mandatory
  JEV classification was introduced.
- Prompt preparation, domain validation and scoped artifact persistence run
  locally. Selected inputs still go to Gemini through the existing authenticated
  model gateway. This is not offline inference.
- One generation per specialist invocation, bounded input/output and deadline,
  cancellation, no hidden provider retries. Goose can independently choose its
  next action after a tool error. A whole conversation turn may therefore involve
  more than one model request.
- Artifacts use private account/conversation directories and atomic JSON files.
  There is no durable restart/resume journal. Synthetic simulations are the
  bounded scenario-only engine, not the richer legacy multi-turn interviews.

The bundle contains a working-tree snapshot and is explicitly
`releaseEligible: false`. It is not notarized; other OS/CPU builds and production
release gating remain outside this evaluation.

## Deterministic verification

| Suite | Result |
| --- | --- |
| Workflow V2 backend regression suite | 3,096 passed; 3 skipped |
| Desktop Vitest suite, pinned Node 22 | 1,268 passed, 143 files |
| Local Python specialist kernel | 35 passed |
| Node MCP/schema and benchmark harness suites | 62 passed |
| Native/runtime/Axwise packaging checks | 12 passed |

TypeScript checking, targeted lint/format checking and whitespace checking also
passed. These are the relevant suites, **not a claim that every repository's
cross-platform or external-integration test ran**. Two database integration
modules require an explicitly isolated test database; one live JEV test requires
explicit injected credentials and opt-in. They were skipped. No production
database was used for testing.

The initial Node 26/sandbox desktop failures disappeared under the bundled Node
22 runtime with local fixture access; no assertions were removed. Two backend
failures were reproduced on the unchanged baseline and corrected narrowly: the
privacy test now supplies a real Starlette Request, and production factory wiring
was extracted from the oversized cognitive executor without relaxing its size
guard or changing the compatibility entrypoint.

## Live issues found

The first live model checks rejected full Pydantic schemas at Google's
OpenAI-compatible boundary (HTTP 400, masked as 502 by the relay). Tiny schemas
and the same specialist prompt without its full schema worked. A compact
model-facing schema solved that request boundary; full local input/output
validators remain authoritative. References are expanded with size/depth limits;
unsupported references fail closed. Model-facing size/format constraints are
included as descriptions, then enforced by Python before saving.

After that fix, actual bundled stdio MCP calls completed interview analysis in
3.163 s (2.355 s provider round trip) and simulation in 2.905 s (2.281 s provider
round trip). These are small synthetic fixtures, not complete Goose turnaround
or evidence of production performance. The concurrent app build may have
increased local preparation time.

The PRD smoke failed local validation once after an 8.202 s call; no artifact was
saved. Three bounded diagnostic repeats passed (provider round trips 6.419,
8.128 and 5.404 s). The failed candidate was not retained by the normal tool, so
its precise validation cause is unknown. Do not conceal the failure or present
three successful repeats as proof of reliability: observed acceptance was 3/4
for this tiny fixture sample. No validation was weakened to obtain a pass.

## End-to-end comparison

The packaged application's same native Goose binary/model is compared with
Axwise absent versus mounted. Both arms keep the desktop utility tools. Eight
cases are run twice in alternating arm order, each in a fresh isolated profile:
arithmetic, ordinary chat, weather, news, repository reading, PRD, interview
analysis and synthetic simulation. Setup is timed separately. Failures and
permission denials remain in the report; fast failures are not successful latency.

Results and manual semantic review are recorded below. This
isolates the extension's effect; it does not reproduce every user-installed
extension or measure Electron rendering. Provider/network/cache variability is
not controlled, and two trials per case cannot establish statistical superiority.

The first 32-turn run exposed benchmark-only limitations: four repository reads,
one news wrapper and two specialist turns were stopped by an overly narrow
approval grammar. A catalog listing was also incorrectly counted as an Axwise
execution. The harness was corrected with attack regression tests: exact fixture
reads, workspace-relative bounded trees, immutable response-field projections and
a tightly constrained outer error handler are allowed; arbitrary code and writes
remain denied. Execution detection now examines actual calls, not catalog text.
Those original outcomes are preserved, not silently treated as successful runs.

Reassessment of that run found **zero Axwise calls or proposed calls in 20 common
turns**. Successful common-turn medians were 6.050 s off / 6.463 s on, but the
denied cases and small sample prevent a performance equivalence claim. Axwise was
proposed for two of six enabled specialist turns: analysis was blocked by the
harness, and simulation completed through the real extension. The latter took
18.995 s overall, including a 4.407 s specialist model round trip and about 0.64 s
local preparation/validation; its artifact contains exactly two synthetic
participants and four responses.

Manual review of the first paired drafts found no clear on/off quality gain:
both direct PRDs under-labelled technician self-assignment as a design choice;
both direct analyses incorrectly implied retaining tenant email necessarily
preserves manual copying and overstated conflicts between queue visibility,
mobile use and manual assignment. Both simulations were clearly synthetic and
role-specific. Most drafts did not call Axwise, so their timing or quality
differences cannot be attributed to the specialist kernel.

An end-to-end usability issue was fixed before the final package: Code Mode
retains MCP text but omits structured artifact metadata. The successful text now
includes the persisted artifact's location, only after a successful commit.

## Final package and acceptance results

Local archive:
`/private/tmp/orqanix-local-2312-review/Orqanix-2.3.12-local-arm64.zip`

Application:
`/private/tmp/orqanix-local-2312-review/Orqanix-darwin-arm64/Orqanix.app`

Archive SHA-256:
`605193b5593d8c2fb77537d7ba424fabbaaeb73f20ccaeab3cf1db44ddab1bcd`

The final bundle's source inventory matches the current selected source bytes;
its pinned runtime files and native signatures verify. Info.plist reports
2.3.12 / 5679. The archive is approximately 362 MiB; Axwise adds approximately
73 MiB unpacked. This is a local ad-hoc-signed Apple Silicon evaluation, not a
notarized public installer.

### Direct final bundled MCP checks

All three final calls passed local validation and persisted artifacts:

| Small synthetic fixture | Full extension operation | Provider round trip |
| --- | ---: | ---: |
| PRD | 7.395 s | 6.747 s |
| Interview analysis | 3.889 s | 3.248 s |
| Synthetic simulation | 3.094 s | 2.473 s |

Each made one specialist model request. These are not whole-chat timings and
are not the same-sized inputs as the comparative three-excerpt cases.
Report: `/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-live-mcp-8isKJe/report.json`.
The earlier PRD validation failure still counts; one final pass does not prove
that all future generations will satisfy the contract.

### Common-task isolation

Across the two comparison runs and the final bounded repository check, **none
of 16 Axwise-enabled common turns proposed or executed an Axwise specialist**.
Cold session/extension setup added roughly 0.3–0.4 s when mounted. The extension
is absent entirely when disabled. This is observed isolation, not a deterministic
guarantee about all future model choices or a statistically proven latency match.

Some ordinary turns in the first two runs were stopped by test-only restrictions
on otherwise plausible Code Mode wrappers; these are retained in their reports.
The final repository test explicitly stated the permitted read grammar and
completed correctly in both arms: 10.405 s off / 8.203 s on, zero Axwise calls.
This confirmed reading a coding fixture did not route to the specialist; it is a
constrained acceptance case, not an uncontrolled natural-chat measurement.
Report: `/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/local-axwise-benchmark-JwiMcs/report.json`.

Weather stayed on the existing utility path, roughly 4.8–6.2 s in the later run.
News remained variable (roughly 20–47 s in completed earlier trials), with
unverified recency and sometimes reused publisher/search redirect links. Axwise
did not cause or fix that retrieval-quality problem.

### Whole Goose turns: extra work, not a speed upgrade

Before the final provenance tightening, paired explicit-artifact requests gave:

| Three-excerpt task | Axwise off: direct draft | Axwise on: artifact flow |
| --- | ---: | ---: |
| PRD | 11.781 s | 26.461 s |
| Interview analysis | 14.319 s | 43.773 s |
| Synthetic simulation | 9.032 s | 27.302 s |

These requests intentionally ask for a saved validated artifact if available,
and a direct draft otherwise. They are **not equivalent deliverables**. The
analysis run exposed the provenance/retry problem below, so its completed chat
must not be counted as a successful quality gate. Report:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/local-axwise-benchmark-d0xLD0/report.json`.

### Provenance bug discovered and tightened

In the broader analysis test, Goose initially supplied synthetic turns without
their original question IDs. A generic validation error led it to add invented
interviewer turns and omit origin on retry. The previous default then treated
those inputs as supplied transcripts. This is a real integration flaw, not a
successful analysis merely because JSON validation eventually passed.

The final local contract now requires explicit origin on every selected source
and transcript. It describes the original-question-ID requirement and gives
finite actionable errors that forbid inventing turns/IDs or relabelling origin.
Unknown errors still never echo private input. Tests cover omitted-origin retry
rejection and missing synthetic lineage. The adapter cannot detect a caller
explicitly lying about provenance; it validates declared tool inputs, not their
identity against an immutable user attachment. That remains an architectural
limit, not a solved authenticity guarantee.

The final end-to-end synthetic analysis supplied known original `q1` metadata.
Goose retained all three synthetic origins and original participant text, made
one specialist call, and returned the saved artifact and its path. It took
41.104 s overall, but only 4.075 s in specialist inference plus approximately
0.64 s in local preparation/validation. Goose used four outer model requests;
the last answer-generation request alone took 25.719 s (22.302 s to first token).
This locates most latency outside the local Python kernel. Report:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/local-axwise-benchmark-AAilTb/report.json`.

That final artifact is traceable and clearly synthetic, but its three findings
mostly repeat the excerpts and do not fully synthesize the requested tensions
and evidence gaps. Better structure is not automatically better analysis.

## Verdict and next work

- **Packaging/runtime:** passes the local macOS arm64 gates; 4,473 tests passed
  across the listed suites, three external-integration skips. Final direct live
  checks passed 3/3. No all-platform or all-live-reliability claim.
- **Common-task isolation:** no specialist interference observed; default off
  remains appropriate. Full user extension/profile parity was not tested.
- **Speed:** no improvement demonstrated. Small direct drafts are usually
  cheaper and faster than tool discovery + specialist generation + final rewrite.
- **Value:** durable, typed, source-linked artifacts and explicit synthetic
  lineage; not established superiority in semantic analysis or answer quality.
- **Recommendation:** keep this as an optional local evaluation capability.
  Do not turn it into the general router or enable it by default on these results.

Priorities before wider use: preserve selected evidence via immutable artifact
references instead of model retyping; improve analysis synthesis while retaining
quote checks; make validation defects safely diagnosable; and benchmark existing
Goose reasoning/tool-discovery controls to reduce the final model's latency.
Do not restore remote Axwise orchestration or bypass Goose's loop to hide it.

## What validation does not prove

Exact quote/source linkage, identity and typed structure do not verify source
truth, semantic entailment, actionability or realism. A generic PRD can satisfy
structure while underusing evidence; a real quotation can support an irrelevant
interpretation; synthetic participants can be insufficiently diverse. Manual
review must check relevant source use, preserved conflicts/gaps, testable proposed
requirements, role diversity and unmistakable synthetic labels.

Turning Axwise off eliminates its startup and tool-schema overhead. When on,
descriptions limit its intended scope, but Goose's tool choice is probabilistic;
no finite benchmark guarantees that it can never choose an inappropriate tool.
