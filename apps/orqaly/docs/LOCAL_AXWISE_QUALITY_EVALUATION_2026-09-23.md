# Local Axwise staged specialist — quality evaluation

Date: 2026-09-23. Status: **published as optional/default-off Orqanix 2.3.13, build 5680**.

This report evaluates the optional local Axwise specialist after the initial
single-generation prototype. It does not authorize publication by itself. The
predeclared acceptance conditions are in
[LOCAL_AXWISE_QUALITY_GATE_2026-09-23.md](./LOCAL_AXWISE_QUALITY_GATE_2026-09-23.md).
The earlier prototype's results remain in
[LOCAL_AXWISE_EVALUATION_2026-09-23.md](./LOCAL_AXWISE_EVALUATION_2026-09-23.md).

## Decision at this checkpoint

The repeat comparison supports shipping an **optional, default-off artifact
specialist**, conditional on the remaining native/runtime and release gates.
The concrete benefit is frozen, reusable interview evidence and validated
requirement-to-finding links, not a universal improvement in prose or speed.

Across four paired repeat samples, specialist semantic scores showed **one
slight loss, one tie and two modest wins**. No material overall semantic
regression was identified by the independent reviewer. All four repeat
specialist analysis-to-PRD chains completed. Those results do not erase the
three specialist failures in the first comparison, and do not establish a
production reliability rate.

The specialist took roughly **37–42 seconds**, against **13–16 seconds** for a
single direct Gemini draft. It should not become a mandatory step for normal
chat, weather, news, search or repository work. Generated PRDs still require
human review; their validation badges are not external or semantic truth
certificates.

## What changed

- Goose retains its normal conversation, tool-selection and approval loop.
  Axwise exposes three specialist tools, with an independent default-off setting.
- Interview analysis and PRD generation now use generation, deterministic
  validation and substantive model review. A failed validation or review may
  trigger **one repair**, followed by fresh validation/review. Each specialist
  invocation has at most four attempted model stages and a 180-second deadline.
  Simulation remains a single bounded generation.
- Reviews bind to the exact candidate artifact. A failed final review or invalid
  repaired candidate is terminal; it is not silently regenerated until it passes.
- PRD generation can consume the exact saved analysis using its operation UUID
  and file SHA-256. The host resolves it within the current account/conversation,
  checks its hashes and accepted status, and re-materializes the frozen evidence
  in Python. Goose need not retype source text, source origins or finding IDs.
- Private intermediate snapshots preserve selected input, candidates, review
  results and finite diagnostics. Final records include model-stage counts,
  available token usage and timings. These are checkpoints, **not resumable jobs**.

## Deterministic verification

The coordinating implementation run reported the following completed suites.
Counts describe the selected relevant suites, not all possible operating systems,
external integrations or every test in both repositories.

| Suite | Passed | Skipped / scope |
|---|---:|---|
| Node extension, protocol, stage, schema and benchmark tests | 95 | Includes real Python bridge coverage and failed-wrapper accounting |
| Local Python kernel and quality tests | 54 | No live inference required |
| Workflow V2 backend tests | 3,096 | 3 external-integration skips |
| Desktop tests | 1,268 | Pinned desktop Node runtime |
| Packaging tests | 13 | Packaging/integrity rules; not final archive approval |
| Website tests | 70 | Does not by itself establish a deployed website |
| Pinned CodeMode generator tests | 28 | Includes 5 actual TypeScript type-check regressions |

Desktop TypeScript checking, Rust formatting and the patched workspace's
`cargo clippy --all-targets --offline -- -D warnings` also pass. The initial
Clippy attempts required downloading locked dependencies and using the existing
temporary CMake installation; these were build-environment issues, not skipped
lint errors. Local pre-commit JEV checks reported `MISSING_API_KEY` and were
skipped; no JEV review pass is claimed.

The three backend skips are two PostgreSQL integration cases without the
explicit test database URL and one live JEV case requiring explicit opt-in and
credentials. No production database was substituted for those tests.

The independent code audit also executed 15 staged/real-Python Node tests and
13 Python quality tests at its checkpoint, all passing. These are overlapping
checks, not additional tests to add to the table's totals.

Earlier baseline fixture failures were repaired narrowly: the privacy test now
passes the actual request shape, and the large cognitive executor's factory was
extracted while preserving its compatibility behavior. Provider-schema
adaptation retains full local deterministic validation. The staged implementation
also keeps per-generation usage separate from aggregate multi-stage accounting.
No evidence validator or test assertion was weakened to obtain a green run.

## Live model comparison: method and retained failures

This is **packaged Axwise analysis → PRD versus a direct Gemini draft**, not
vanilla Goose or an Electron desktop end-to-end benchmark. Both arms use the
authenticated `orqaly-gemini` model alias with low reasoning effort. The direct
arm requests an analysis and PRD in one response; the specialist creates two
durable artifacts and reviews them. Those are related but not identical outputs.

Two fixed synthetic fixtures were used, with two repetitions each:

- Fictional repair-shop handoffs: four participants, genuine assignment-policy
  conflict, compatible email/desktop preferences, and unmeasured operating data.
- Fictional community-kitchen shifts: four participants, genuine swap-policy
  conflict, compatible browser/SMS/privacy preferences, and missing inclusion
  and operating evidence.

First comparison directory:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-quality-wkW17X/`.
The direct arm completed 4/4. The specialist completed 1/4; three analysis stages
failed deterministic validation even after their bounded repair. Their elapsed
times were 14.685, 19.628 and 22.794 seconds. The successful specialist chain took
41.808 seconds. The failures remain in `report.json`; they are not removed from
the reliability record or treated as successful short-latency responses.

The failure diagnosis exposed insufficiently specific repair feedback for the
existing analysis contract: conflicting/insufficient findings need matching
evidence-gap entries, and gaps must target a requested output. The correction
adds finite, content-free diagnostics and targeted prompt guidance, reporting
independent defects together so the single repair can address them. Existing
domain materialization still enforces the same invariants. This was a diagnosed
implementation iteration, not repeated sampling until a preferred answer appeared.

Repeat comparison directory:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/axwise-quality-7zF17i/`.
Both arms completed **4/4**. Every specialist chain used two analysis model calls
and three PRD model calls: **five calls per chain**, versus one direct-draft call.
The four-call limit applies to each individual specialist invocation, not the
combined two-tool chain. Every repeat PRD needed its bounded repair; this is
material latency/cost overhead, not a claim of first-pass perfection.

| Fixture / repetition | Direct total | Axwise chain total | Axwise model round-trips | Calls, direct / Axwise |
|---|---:|---:|---:|---:|
| Repair handoffs 1 | 15.603 s | 40.056 s | 36.778 s | 1 / 5 |
| Repair handoffs 2 | 15.412 s | 41.895 s | 38.640 s | 1 / 5 |
| Volunteer shifts 1 | 14.682 s | 36.728 s | 33.412 s | 1 / 5 |
| Volunteer shifts 2 | 13.151 s | 39.479 s | 36.185 s | 1 / 5 |

“Model round-trips” includes provider response parsing, not just server inference.
Chain totals include local preparation, validation and persistence. Neither
column includes Goose's preceding tool discovery or following final answer.
Gateway load, network and provider caching were not controlled.

## Fixed rubric and independent blinded scores

Before inspecting latency or the unblinding key, the independent reviewer read
only `blind-review.md` and `blind-rubric.json` and froze the scores below. The
key was opened afterwards. Blinding is best-effort: quotation catalogues,
finding identifiers and formatting can reveal a likely arm.

Each criterion is scored 0 (missing/incorrect), 1 (partial), or 2 (clear):

1. Synthesis of the shared operational need, not an excerpt list.
2. Correct identification of the genuine incompatible approval policies.
3. Compatible email preferences (repair) or browser/SMS access (kitchen).
4. Compatible desktop/shared-queue preferences (repair) or names/contact privacy
   (kitchen).
5. Decision-critical unknowns without invented measurements or consensus.
6. Scenario pilot boundaries and stated non-goals.
7. Observable acceptance checks for the core operational and privacy needs.
8. Baseline/pilot validation plan, missing-user testing where applicable, and
   clearly proposed numbers/owners.
9. Followable supporting sources/findings rather than decorative citations.
10. Preserved synthetic provenance, without claims of real customer validation.

The exact case-specific wording is retained in the repeat `blind-rubric.json`.
More text, more citations, a validation badge or a longer artifact does not earn
points by itself.

| Frozen blinded label | Unblinded arm | Scores 1–10 | Total |
|---|---|---|---:|
| repair-handoffs-r1-A | Axwise specialist | 2,2,2,2,2,2,1,1,2,2 | 18/20 |
| repair-handoffs-r1-B | Direct draft | 2,2,2,2,2,2,2,1,2,2 | 19/20 |
| repair-handoffs-r2-A | Direct draft | 2,2,2,2,2,2,2,1,2,2 | 19/20 |
| repair-handoffs-r2-B | Axwise specialist | 2,2,2,2,2,2,1,2,2,2 | 19/20 |
| volunteer-shifts-r1-A | Direct draft | 2,2,2,2,1,2,1,1,1,2 | 16/20 |
| volunteer-shifts-r1-B | Axwise specialist | 2,2,2,2,2,2,1,1,2,2 | 18/20 |
| volunteer-shifts-r2-A | Direct draft | 2,2,2,2,1,2,1,1,1,2 | 16/20 |
| volunteer-shifts-r2-B | Axwise specialist | 2,2,2,2,1,2,1,1,2,2 | 17/20 |

These are judgments on eight specific outputs, not calibrated product scores or
statistical evidence of general superiority. All completed outputs distinguish
the genuine conflicts from compatible preferences. None upgrades synthetic
interviews into real customer validation.

### Remaining draft mistakes

- Both specialist repair PRDs allow an unassigned job without adequately limiting
  that state to pre-active intake, weakening the requested exact-one-owner rule.
- The first specialist repair PRD compares copying time between pilot weeks while
  also changing assignment policy, rather than cleanly establishing a pre-tool
  baseline. Some direct drafts likewise mix unknown pre-pilot baselines with
  pilot-period measurement and assign Lena responsibilities without explicitly
  marking the owner choice as proposed.
- Direct kitchen drafts incorrectly state that non-smartphone users were
  excluded. The source establishes exclusion of people without phones; it does
  not establish the smartphone status of every participant. Some also turn a
  contact-privacy preference into an asserted past disclosure incident.
- The specialist kitchen drafts improve privacy acceptance with direct API or
  response-payload checks, but do not fully test task-specific training
  suitability. Plans still lack a robust baseline comparison and actual testing
  with absent non-phone/accessibility perspectives.
- The second specialist kitchen PRD says “Baseline is unknown ($0)”: unknown must
  not be equated with zero. It also mixes correct-day attendance with punctuality
  and uses a monthly SMS threshold for a three-week trial.

These limitations are visible despite a passed model quality review. Review is
another model judgment, not proof of insight or truth. The specialist's concrete
advantage is an auditable chain from exact selected quotations through findings
to requirements, plus frozen reuse without retyping. This supports an optional
drafting/research capability, not autonomous acceptance of its recommendations.

## Native Goose ordinary-task checks

Separate native Goose on/off reports cover ordinary chat, arithmetic, weather,
news and repository reading. All reports below are under
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/local-axwise-benchmark-<suffix>/report.json`.

| Suffix | Off completed / attempted | On completed / attempted | Interpretation |
|---|---:|---:|---|
| FTXbXZ | 3 / 5 | 4 / 5 | Ordinary cases; bounded harness denied some tool calls |
| yL6ros | 5 / 6 | 4 / 6 | Expanded ordinary cases; bounded harness denials retained |
| nXk062 | 1 / 1 | 0 / 1 | Repository check; on-arm call outside harness grammar |
| 5M2ULJ | 0 / 1 | 0 / 1 | Invalid text-editor test; not a product failure or valid latency pair |
| 2e5EeI | 0 / 1 | 1 / 1 | Bounded repository check; on arm completed in 13.063 s |

All five reports record **zero proposed or executed Axwise calls in ordinary
tasks**, including stopped turns. This is encouraging routing evidence. It is
not evidence that every ordinary task completed or that the two arms have equal
latency. Several runs stopped because the safety harness rejected an otherwise
plausible tool wrapper or a fixture-incompatible tool invocation. Denials must
not be counted as extension failures or discarded from attempted-run counts.
Successful-only medians, different completed subsets and this small sample do
not establish latency equivalence.

The final rebuilt binary was also tested without overrides in `agPDob`:
arithmetic off/on 1.980/1.395 s; weather off/on 3.981/5.032 s. All four turns
completed, with no denials or Axwise proposals/calls/artifacts. Each weather
turn used one native weather tool and returned the same sourced answer. This
small paired check establishes compatibility, not statistical speed equivalence.

### Native specialist chain — passed after compiler fix

The initial native analysis-to-PRD attempt is retained in
`local-axwise-benchmark-NeMU8Y/report.json`. Its off arm completed a direct draft
in 28.039 seconds. The on arm proposed an Axwise call but was stopped by the
bounded CodeMode harness after guessing tool-result fields. It is not an
end-to-end specialist-chain pass. Tool catalogue guidance was clarified to
describe the actual result/reference contract; the coordinator is rerunning the
native path.

The guided follow-up `local-axwise-benchmark-REnXir/report.json` exposed a native
CodeMode declaration blocker: an array of enum values was rendered as
`outputs?: "jobs_pains" | "personas"[]`, without parentheses around the union.
Consequently valid `outputs: ["jobs_pains"]` arguments fail TypeScript with
`TS2322` before the MCP call. The model's subsequent `as any` workaround was
denied by the bounded harness. The structural `axwiseUsed` heuristic can count
the attempted wrapper in this case and therefore **overstates actual MCP
execution**; it is not evidence that an artifact was created. A compiler-level
fix and native rerun were required. This is a real native integration blocker,
not a reason to relax the evidence validators or permission harness.

The pinned `pctx_codegen` 0.3.3 dependency is now vendored with its MIT license
and a single production-code correction: array element types use `Array<T>`.
Its existing tests and five added actual-PCTX type-check cases pass for inline
enum, union, referenced enum, nullable and nested array elements, including
rejection of scalar and unknown values. Public JSON schemas and Python
validation are unchanged. The rebuilt binary passed the native rerun below.

The benchmark accounting is now corrected: a completed CodeMode wrapper alone
does not confirm a nested MCP call. It requires successful execution plus an
Axwise result marker; a compiler failure stays proposed/execution-unconfirmed.
The original report is retained rather than rewritten to hide this mistake.

Final report: `local-axwise-benchmark-M1H7uo/report.json`, using clean fork commit
`40684d75327c0705a1b335e8388dd05ae266eae6`, binary SHA-256
`681eb3aa14e01c882ba30cd9ebb14f2eac4cce52f2b51c29787995d70ef115f8`.
Both arms completed with no denials: direct Goose draft **28.948 s**, specialist
chain **65.022 s** (setup 70/489 ms separately). This was a guided tool-contract
test, not a natural-routing accuracy score: both arms received the same request
and the bounded literal-call instructions recorded in the report.

Two actual saved artifacts were independently read: the selected analysis input
exactly equals the 4-person/12-turn fixture; the PRD references the analysis's
exact operation ID and saved-file SHA-256. Both pass deterministic validation
and model review. Analysis produced five findings and used two model stages;
PRD used two. Inner model time was 20.484 + 12.482 = **32.966 s**. The remaining
time includes Goose discovery, argument generation, tool round trips and final
answering; it is not all local Axwise computation. The benchmark's generic
`sourceIdsPresent` check expects the older three-person fixture and is not
applicable to this override; direct artifact comparison is the relevant check.

The actual signed app bundle also passed all three MCP smoke requests in
`axwise-live-mcp-qL9OKX/report.json`: PRD 11.440 s / 2 calls; analysis 6.469 s /
2 calls; simulation 6.216 s / 1 call. These smaller fixtures do not replace the
complex comparison or establish comparative simulation quality.

## Security, privacy and capability boundaries

The independent implementation audit found no release-blocking defect in the
bounded stage sequence, review binding, deterministic validation, scoped
references, cancellation or finite error handling. Important limits remain:

- “Local” means workflow, validation and artifact state run on the computer.
  Selected input still goes to Gemini through the authenticated gateway; this is
  not offline inference and does not remove the need for sign-in/network access.
- Initial transcript origin is caller-declared. Frozen references prevent
  accidental reconstruction or relabeling between operations, not a same-user
  process deliberately rewriting both an artifact and its reference.
- Snapshots contain sensitive selected text and model output, stored in private
  application directories/files. Credentials and raw exception text are not
  journaled. Snapshots do not implement resume, a durable queue or an inference
  cache, and failed-run checkpoints remain local application data.
- The release scope is the optional **macOS Apple Silicon** specialist. No claim
  is made for other packaged platforms, broad population research, or external
  semantic verification. Ordinary Goose remains in control.

## Package and publication — complete

- [x] Final native specialist-chain acceptance recorded above.
- [x] Source commits: Axwise `52388b3b`, fork `40684d753`; app 2.3.13 / build 5680.
- [x] Final macOS arm64 package rebuilt; nested signatures and runtime/source inventory verified.
- [x] Archive checksum, local package smoke check and exact downloadable artifact recorded.
- [x] Website/download metadata updated to that exact artifact and externally checked.

See [the release receipt](./RELEASE_2.3.13_2026-09-23.md) for source commits,
installer SHA-256, successful cloud build, deployed revision and public-domain
verification. Existing ad-hoc preview signing is not Apple notarization.
