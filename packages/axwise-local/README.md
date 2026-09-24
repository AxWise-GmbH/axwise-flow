# Axwise local Goose extension

An optional stdio MCP extension with eight composable capabilities for **requested specialist artifacts**:

| Tool | What it does |
| --- | --- |
| `prepare_discovery` | Proposes a discovery scope, uncertainties, stakeholder roles and linked interview questions from the brief and selected evidence. |
| `research_market` | Synthesizes selected market evidence and records gaps or proposed search queries. It does not search the web itself. |
| `generate_personas` | Saves a bounded cohort of explicitly synthetic personas, reusing selected discovery scope, roles and questions. |
| `simulate_interviews` | Generates clearly synthetic interviews for selected stakeholder roles or exact saved personas—not real customer testimony. |
| `chat_with_persona` | Answers one message as an exact saved synthetic persona, preserving a bounded saved conversation history. |
| `analyze_interviews` | Analyzes selected or saved interview turns with locally validated quotations and participant identity; optionally produces themes, patterns, stakeholder comparisons, sentiment and insights linked to admitted findings. |
| `create_prd` | Creates evidence-labelled product/software PRDs from selected sources or saved analysis and market evidence. |
| `create_delivery_brief` | Turns an exact saved PRD into a proposed development/outsourcing handoff with requirement-linked acceptance checks, milestones, dependencies and open decisions. It does not execute work or commit commercial terms. |

This is a local extraction of Axwise's domain logic, not the former adapter to the Axwise cloud orchestrator. Python prepares the Axwise prompt/schema; Node performs bounded authenticated Gemini inference through the existing `/desktop/v1/chat/completions` transport; Python validates/materializes each candidate. Every non-simulation operation uses a substantive review and at most one repair. Standard simulation is one generation; deep simulation can generate its bounded cohort in parallel. No Cloud SQL, queue, remote Axwise job, hidden filesystem context, or polling is involved. Model inference is cloud-hosted; this is not an offline/local-model claim.

Goose retains its normal loop and interprets the tool result. The extension has no routing hook, cannot force a tool call, and advertises no general-chat, web-search, weather, currency or coding tool. Its desktop toggle is independently optional and defaults off. Simply attaching a project is not a reason to call it. Tool inputs are selected inline by Goose under its normal approval rules and are sent to the configured model.

The experience stays inside Goose chat and the shared **Results** panel: readable Markdown, saved references, revision selection and changes between known versions. There is no separate Axwise website embedded in the desktop, persona playground or mandatory end-to-end wizard. Goose can use one capability or chain requested steps; the extension does not silently run the whole pipeline. This package is private (`@orqaly/axwise-local`, `private: true`) and bundled with the desktop's pinned Node/Python runtimes. It is not a published npm package or a `uv`/PyPI installation product.

### Follow-ups and topic changes

The native MCP initialization instructions (`src/conversation-policy.mjs`) and tool descriptions select by the requested deliverable, not depth words or subject keywords. Users need not name Axwise. Requested discovery plans, saved personas, evidence synthesis, PRDs or delivery briefs can use their matching specialist; a brief brainstorm, explanation or interview-question guide need not.

`Go deeper` follows the latest unambiguous subject. Interview analysis → news → `go deeper` stays news; an explicit return to the interviews may reuse that analysis. Two plausible references require clarification rather than an expensive guessed operation. There is no persisted "research mode", JEV intent classifier, per-message classifier or extra remote routing call. Tool results/documents cannot activate a workflow or grant permissions. The exact artifact resolver remains the authority for cross-step reuse and revisions.

These are model-facing instructions, **not a deterministic semantic gate**. Unit tests verify that the policy reaches the native MCP/tool surfaces; only repeated natural multi-turn model tests can measure selection behaviour. Do not treat a guided tool-call test, a schema rejection, or an incomplete turn as a successful natural-routing test.

Goose Code Mode normally hides full MCP initialization instructions and tool descriptions until discovery. The accompanying native Goose change exposes a small, generic directory of mounted extension names/descriptions in both agent loops. This helps the model discover relevant capabilities without a per-turn router or injecting every tool schema. It neither forces Axwise usage nor changes approval permissions; other MCP clients need their own normal discovery support.

### Standard and deep are bounded step options

Each tool accepts `depth: "standard" | "deep"`, defaulting to `standard`. Goose supplies it for the selected task; there is no desktop depth dropdown. Deep expands that step, not every remaining pipeline stage, and is not a promise of higher factual accuracy or lower latency.

| Capability | Standard | Deep |
| --- | --- | --- |
| Discovery | Up to 12 selected sources, 4 stakeholder roles, 8 uncertainties and 12 total questions; 4 questions per role | Up to 24 sources, 8 roles, 16 uncertainties and 32 total questions; 6 questions per role |
| Market synthesis | Up to 6 questions, 18 findings and 6 proposed search requests | Up to 12 questions, 48 findings and 12 proposed search requests |
| Persona cohort | Up to 3 roles × 2 personas; generation ceiling 4,096 output tokens | Up to 4 roles × 3 personas; generation ceiling 8,192 output tokens |
| Persona conversation | Sends the latest 12 saved turns to the model | Sends the latest 24 saved turns; both modes retain at most 64 saved user/persona turns |
| Synthetic interviews | One cohort generation, at most 12 participants | For cohorts of 2–12 participants, one generation per participant with concurrency 2; 4,096 output tokens per participant. A one-person cohort remains one generation |
| Optional analysis views | Up to 20 items total, 4 per requested view kind | Up to 40 items total, 8 per requested view kind |
| Delivery brief | Up to 16 requirements, 2 acceptance checks per requirement, 4 milestones and 8 dependencies | The same 16-requirement ceiling, with 4 checks per requirement, 8 milestones and 16 dependencies |

Discovery, market and delivery generation ceilings are 8,192 output tokens in standard and 16,384 in deep. Persona chat stays at 4,096. PRD and base interview analysis retain the same 16,384-token generation ceiling in both modes: `deep` does not add a second hidden PRD engine or remove validation. Requested analysis views have the explicit expansion above. Limits are caps, not quotas, and oversized selections fail rather than silently dropping evidence.

`research_market` receives exact selected source text plus URL/retrieval date for web evidence. If evidence is missing, it returns proposed `searchRequests`; Goose decides whether to use its ordinary search tools and submit the resulting material for another synthesis. These queries are not commands or authorization. Ordinary news and quick searches do not go through this specialist.

Persona generation and dialogue cite host-computed passage IDs; Python supplies and validates the published UTF-8 quote spans. The model does not calculate byte offsets. When interviewing saved personas, the host fixes their profiles and the model generates answers only. Simulation revisions can reuse the exact saved cohort, question plan and omitted scenario settings without retyping them; changing the scenario does not authorize silently replacing participants. Older scenario-only cohorts can also be frozen from their saved simulation with explicit source-simulation lineage.

Delivery briefs preserve every exact PRD acceptance criterion and validation metric separately from the generated-test budget. Each receives a stable condition ID and must map to a proposed test or an explicit reasoned deferral. Missing or duplicate dispositions are rejected; a linked test is still a model proposal, not proof of semantic coverage or a passed implementation test. Repeated agreement from a seeded persona through simulation and analysis is not independent customer corroboration, and model review is instructed to flag that circular reasoning.

Analysis of a saved simulation retains its bounded original scenario, target audience, problem and exact source reference through preparation, review and revisions. This host-owned context is not a new evidence source or permission; callers cannot inject or overwrite it. Quote-free analysis uncertainties are preserved separately from the finding IDs usable as PRD support. Simulated persona rehearsal cannot substitute for real participants when measuring human time, adoption, willingness to pay or complaints.

### Revision and document-context guarantees

PRD revisions use a host-applied bounded item patch, not a complete model rewrite. The default is additive: all previous section order, item text, support, priorities and metrics are retained exactly. `revisionPreservation` records retained/added/changed/removed stable item IDs. Replacing or removing an existing item requires an explicit `revisionEdits` entry (`itemId`, `action: "replace" | "remove"`, and an instruction quoted from the supplied brief). Older PRDs receive a deterministic item catalogue when selected; original files remain unchanged. Preservation does not retroactively correct an ambiguous requirement already present in the parent.

For document-specific persona discussions, include the exact document in `references`. One non-persona document is selected automatically; multiple documents or versions require `documentReference` matching one of those references. The complete document snapshot and hash are passed as `selectedDocument` and saved with the conversation. A follow-up can continue that snapshot; selecting a new document replaces active context while preserving turn history. `documentContextStatus` distinguishes selected, continued and no-document conversations. Documents are bounded to 64 KB UTF-8 in standard mode or 128 KB in deep mode and rejected rather than silently truncated. Metadata-only PRD source catalogues stay document context; they are not fabricated into full-text quote evidence.

The legacy `analysisArtifact` can be combined with compatible discovery or market `references`: these are additional context, not conflicting analyses. Genuine competing analyses and duplicate/altered references still fail before inference.

Successful tool responses supply an `orqanix-result:<revision-uuid>` link and request at most three short faithful host-summary bullets unless the user asks for detail. This guidance follows the result descriptor and is not part of the saved document. The desktop resolves links only against successful paired tool results already present in the conversation, opening that exact revision. Unknown IDs and arbitrary paths are not result links. Interview-guide questions remain document content, not automatically a question form for the chat user.

## Launch

```sh
node packages/axwise-local/src/mcp.mjs \
  --config /absolute/path/connector/public.config.json \
  --connector-root /absolute/path/connector \
  --python /absolute/path/bundled-python/bin/python3 \
  --kernel-root /absolute/path/axwise-kernel \
  --state-dir /absolute/path/profile/axwise-local \
  --account-hash EXPECTED_SHA256_ACCOUNT_HASH \
  --conversation-id GOOSE_SESSION_ID
```

The Python entrypoint is `backend.services.local_axwise.worker`; the desktop package contains its pinned runtime and existing pure Axwise domain modules. It receives one bounded newline-JSON request per subprocess (`describe`, `prepare`, `finalize`, `prepare_review`, `validate_review`, or `prepare_repair`). These are private worker operations, not additional model-visible tools. Python bytecode writes and user-site packages are disabled. Node requires version 22 or newer and has no additional npm dependencies; it reuses the bundled connector's keyring authentication in memory.

Gemini's OpenAI-compatible endpoint rejected the full Pydantic schemas during live testing. The adapter expands only bounded local schema references and supplies compact provider-facing schemas for both tool inputs and generated output. Types, required fields and enum values stay structural; length, count, numeric and format constraints are included as descriptions. **The unchanged complete Python schemas remain authoritative**: all input constraints are checked before inference, and all output/evidence constraints before publication. This is not permission to accept a result merely because the provider emitted valid JSON. External/cyclic schema references and unrecognized schema constructs fail closed.

Initialization/tool discovery only read local configuration and run local `describe`. They do not retrieve credentials or call a model. Auth refresh happens lazily when the user requests a specialist operation. Account binding is supplied in `X-Orqaly-Account-Hash`; credentials are never written into artifacts or logs. Synthetic test credentials require both `ORQALY_LOCAL_TEST_MODE=true`, `ORQALY_LOCAL_TEST_TOKEN`, and an explicit `--api-url http://127.0.0.1:PORT` relay. Remote API overrides are rejected.

## Bounds, artifacts and cancellation

- One active specialist operation per extension process; 160 KB selected input; 1 MB protocol/provider frames and individual snapshots; **180-second overall deadline**, including every stage. Non-simulation tools take generation → deterministic validation → model review. A failed validation or substantive review permits at most one repair and, if that repair is structurally valid, one final review. Maximum **four model calls per reviewed operation**, not an unbounded retry loop. Malformed reviews, provider errors, a failed final review, or an invalid repaired candidate fail closed. Simulation has no model review/repair: one call in standard, or at most 12 participant calls at concurrency 2 in deep. The complete planned cohort must validate before publication; failed parallel work is cancelled, not published as partial success.
- MCP cancellation/disconnect aborts the provider request and terminates the active Python process. Repeated JSON-RPC tool request IDs on the same connection do not generate another inference.
- Only locally validated results (and, for non-simulation tools, a passed substantive review) become `<state-dir>/<account-hash>/<conversation-id>/<operation-uuid>.json` plus an immutable `<operation-uuid>.md`, permissions `0600`, inside private scoped directories. The `axwise.local-artifact.v2` record includes frozen selected input, resolved input where applicable, accepted candidate, output, input/output hashes, provenance, review, total usage, per-stage timing and the shared result descriptor. Older v1 files are left untouched and cannot be supplied as immutable references. The returned result also reports persistence and total elapsed time and the exact saved JSON file's SHA-256; this is distinct from the Markdown content hash.
- Artifacts are fsynced to a temporary file and atomically committed without overwriting an existing operation. Cancellation before commit publishes no artifact. Cancellation after the commit point may return the already-completed operation.
- Private numbered stage snapshots live in `<conversation>/.operations/<operation-uuid>/`, including the original selected input, candidate responses, validated reviews and finite validation diagnostics. They use the same `0600` atomic writes and `0700` directories; there are at most 20 snapshots per operation, each at most 1 MB. They contain selected documents/model content and must be treated as sensitive local application data. Credentials and raw exception text are never journaled. **These are diagnostic checkpoints, not a resumable workflow.** There is no automatic restart/replay, inference cache, or durable job queue. A newly requested regeneration creates a new operation. A crash may leave a hidden temporary file, never a completed partial artifact.
- Invalid evidence, incomplete model output, auth failure and timeout produce bounded errors, not invented success. Structural validation uses finite repair codes, never exception strings containing document excerpts. A review is another model judgment, **not proof that an interpretation is true**; source quotation/identity checks remain deterministic. Benchmark usefulness rather than claiming review guarantees quality.

### Exact references, revisions and shared Results

Every successful operation returns an exact reference to its saved JSON record. Supply up to eight selected references to another compatible capability without retyping its artifacts:

```json
{"references":[{"operationId":"11111111-1111-4111-8111-111111111111","sha256":"<exact saved JSON-file SHA-256>"}]}
```

Use `revisionOf` with the same reference shape to revise a result of the **same tool kind**. Revisions create new immutable JSON/Markdown files, never overwrite prior results, and preserve lineage where a previous visible Markdown revision exists. A persona follow-up selects the saved cohort or latest persona-chat reference and exact `personaId`; its saved history is reused rather than reconstructed from prose. No missing reference is guessed, and references remain account- and conversation-scoped.

The tool supplies `structuredContent.resultArtifact` and the same generic `Saved result artifact: {...}` text marker for Goose Code Mode. The `orqanix.result.v1` descriptor identifies the artifact, revision, known parent, title, Markdown path/hash and creation time; it contains no duplicated full document. Shared Results accepts this contract from successful tools, not merely from user/assistant text. It renders Markdown, groups known revisions and only compares a parent actually recorded in the conversation. Ordinary file-tool and OMP results remain supported; their previous text is a recorded snapshot, not a full Git/file-system history. Existing results remain visible after unrelated news/weather turns, which do not themselves create documents.

This is **not an independent artifact library**: the UI reconstructs results from the current conversation, not a cross-chat global catalog. Markdown files persist locally, but there is no separate catalog recovery/export guarantee after conversation deletion, automatic resume, or background progression. A descriptor's hash is metadata, not a UI claim of authenticated truth; the host checks saved files when resolving exact references.

### Compatible analysis → PRD handoff

A completed interview analysis returns a visible text reference as well as structured metadata:

```json
{"analysisArtifact":{"operationId":"11111111-1111-4111-8111-111111111111","sha256":"<exact saved-file SHA-256>"}}
```

This earlier `analysisArtifact` form remains supported for `create_prd`; an exact analysis in `references` can also provide the handoff. Prefer one form. If both repeat the exact same verified operation/hash, the host reuses that one analysis; conflicting selections remain errors. Goose should not retype findings, interview turns or synthetic labels. The host resolves **only** selected operations in the launcher's existing account/conversation directory. Strict UUID/hash checks, bounded `O_NOFOLLOW` regular-file reads, file checksums, artifact version/type/identity/scope checks, frozen input/output hashes and required passed-review checks run before inference. Visible Markdown is also checked when present. The host supplies frozen artifacts as a private `hostEvidence` worker envelope; analysis reuse re-materializes its admitted evidence before use. Tool callers cannot supply their own `hostEvidence`. Arbitrary paths, URLs, cross-conversation references, symlinks, altered files and legacy v1 records are rejected.

The reference prevents accidental reconstruction or relabeling between these two operations. It does not authenticate the original user-supplied transcript's real-world truth, protect against a same-user process deliberately rewriting both a file and its reference, or verify a model's semantic inference. Original provenance remains caller-declared at initial selection. Reusing a validated analysis avoids regenerating that stage; failed runs themselves are not resumable.

The structured result reports aggregated `prepareMs`, `authMs`, `inferenceMs` (successful provider round-trips, including response parsing), `authAndInferenceMs` (also includes elapsed failed attempts), `validateMs`, `persistMs`, `totalMs`, token usage when supplied by the provider, and `execution.calls`/`usage.modelCalls` (attempted model stages). `execution.stages` reports each stage's completion/failure, timing and available tokens. Token totals omit unavailable failed-response usage rather than reporting it as zero. These timings measure the specialist operation, not Goose's preceding tool-selection or following answer-generation inference. Saved records are a pre-publication snapshot; the returned MCP result additionally includes final persistence/total time. Benchmark total user turnaround separately; additional review is not guaranteed to be faster than vanilla Goose.

### Cache and host latency measurements

Provider-reported `cacheReadTokens` and `cacheWriteTokens` are optional, with aggregate reporting-call coverage. Missing counters mean unknown, not zero or disabled caching. These describe provider prompt-token reuse, not an Axwise output cache: a fresh requested operation still runs. `scripts/profile-desktop-spans.mjs` reads numeric desktop usage metadata read-only and separately profiles host discovery decisions, argument selection and final-summary candidates. It does not infer local tool duration from message timestamps.

`scripts/benchmark-desktop-routing.mjs` defaults to a dry-run randomized plan; `--live` explicitly opts into inference in an already-running isolated desktop. It compares multiple simple prompts with Axwise mounted/unmounted and restores the original toggle. It is not a vanilla-Goose comparison or a forced cold/warm-cache experiment. `scripts/benchmark-axwise-expanded.mjs` tests multiple cohorts, standard/deep steps and exact selected publisher evidence through the real local MCP process; these component timings exclude Goose's surrounding conversation loop. Retained failed attempts and resumptions must be reported separately.

## Tests

```sh
node --test packages/axwise-local/test/*.test.mjs
python3 -m unittest discover -s backend/tests/local_axwise -v
```

Node tests cover wire/auth boundaries, discovery isolation, aborts, duplicate requests, bounded review/repair, terminal final failures, private snapshots, frozen references, symlinks/scope/hash checks, input/output limits and atomic persistence. Python tests cover Axwise domain invariants, exact evidence linkage and substantive review contracts. Live benchmarks are a separate gate; passing deterministic tests does not prove quality or latency superiority.
