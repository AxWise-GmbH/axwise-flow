# Axwise as a bundled local Goose specialist — 23 September 2026

Status: **published as optional/default-off Orqanix 2.3.13, build 5680**.
Published Orqanix 2.3.11 restores the Goose-controlled desktop loop. The separate
2.3.12 local evaluation adds a bundled Python specialist and a default-off
settings toggle; it has not been uploaded or deployed.

The 2.3.13 release adds bounded synthesis/review/repair, private stage
checkpoints, and analysis-to-PRD reuse by account/conversation-scoped artifact ID
and exact file hash. See `LOCAL_AXWISE_QUALITY_GATE_2026-09-23.md` for the
predeclared release gate and `LOCAL_AXWISE_QUALITY_EVALUATION_2026-09-23.md` for
the comparison, including failures. It is not an automatic router or a claim
that every generated requirement is semantically correct.
Publication and artifact verification are recorded in
`RELEASE_2.3.13_2026-09-23.md`.

The first implementation deliberately uses atomically written, account- and
conversation-scoped JSON artifacts, not the proposed SQLite operation journal.
Cancellation and duplicate requests on the same connection are handled; durable
restart/resume and automatic retries are not implemented. The simulation is the
bounded scenario generator below, not the richer legacy interview engine.
At most one explicit model repair is now allowed within an operation; this is
not transport retry, crash recovery, or an unbounded agent loop.

Implementation entrypoints are `backend/services/local_axwise/`,
`packages/axwise-local/`, `scripts/smoke-local-axwise.mjs`, and
`scripts/benchmark-local-axwise.mjs`. The fork's
`ui/desktop/scripts/LOCAL_AXWISE_PACKAGING.md` describes the pinned macOS arm64
runtime. Other operating systems and CPU architectures are not yet supported by
this evaluation package.

## Product boundary

- Keep the Axwise website and its existing application services.
- Goose owns the desktop conversation, tool selection, approvals and continuation.
- Bundle Axwise as an optional local specialist for PRDs, interview analysis and
  simulations. Installing the app should install its runtime; no manual Python
  installation should be required.
- Ordinary chat, weather, quick checks and search must not pass through Axwise.
- Local means workflow execution, validation and artifact/state storage run on
  the computer. Gemini inference may remain cloud-hosted through the existing
  authenticated transport. Selected model input still leaves the computer; this
  is not an offline or no-data-egress claim.
- Optional JEV classification/ranking may advise specialist steps. It is not a
  mandatory preflight for every turn, a factual verifier, or a replacement for
  the model's tool loop.

The old `packages/orqaly-goose-connector/src/mcp.mjs` is a local adapter to remote
Axwise work. Shipping that adapter does **not** satisfy this local-engine plan.

## Reuse the kernel, not the server bootstrap

Source paths below are relative to `axwise-flow-oss`.

| Capability | Existing implementation to adapt |
| --- | --- |
| PRD synthesis | `backend/services/workflow_v2/cognitive_executor.py`: `PydanticAISynthesisWriter`, `product_prd` semantics and injected `GeminiCognitiveExecutor` dependencies |
| Interview analysis | `backend/services/workflow_v2/analysis_service.py`: `AnalysisOperationHandler` and its artifact resolver protocol |
| Bounded synthetic interviews | `backend/services/workflow_v2/simulation_service.py`: `SimulationService`; `simulation_operation_handler.py`: `SimulationOperationHandler` |
| Validation/evidence primitives | `backend/services/workflow_v2/cognitive/` |
| Richer multi-turn simulations, later | `backend/api/research/simulation_bridge/services/orchestrator.py`: `SimulationOrchestrator` |

The V2 simulation generator is bounded to four groups, three participants per
group and six questions, with one candidate generation. Do not present this as
feature parity with the richer legacy multi-turn interview engine.

Do not package the existing worker/API launchers unchanged: `worker_main.py`
requires Postgres/leases and `workflow_v2_operations.py` builds a Postgres store.
The stock `build_cognitive_executor` factory brings in research/SearXNG and
authority-seal dependencies. Use explicit dependency injection instead.

The legacy PRD service's optional `db=None` is insufficient: imports reach
`backend.models` and `backend/database.py`, which connects during import. The
legacy simulation package also eagerly imports its router. These boundaries
must be extracted, not assumed disabled by configuration. The narrow source
slice in `backend/Dockerfile.workflow-v2` is useful precedent, not a ready-made
desktop Python package.

## Implementation sequence and repository ownership

1. **`axwise-flow-oss`: extract a shared specialist kernel.** Keep contracts,
   prompts, validators and injected generators free of API/database/billing
   bootstrap. Existing website adapters remain compatible; add regression tests.
2. **`axwise-flow-oss`: add local MCP and state adapters.** Proposed tools are
   `create_prd`, `analyze_interviews` and `simulate_interviews`. Use profile-scoped
   local files plus an operation journal (SQLite is the proposed backing store),
   typed artifact references, provenance, evidence gaps and usage. Preserve
   explicit selected-input consent, cancellation and recoverable operation IDs.
   Do not reuse cloud tenant authority as local file permission.
3. **`axwise-flow-oss`: adapt model transport.** Current Google capability
   generators use Google's `generateContent`/`countTokens` protocol and direct
   keys. They cannot simply target the OpenAI-compatible desktop chat endpoint.
   Add an authenticated transport adapter with tested schema/token behavior;
   model inference, not Axwise orchestration, may use the thin gateway. Never
   bundle server Gemini or JEV secrets. Leave auth/RBAC/billing policy unchanged.
4. **`orqaly-goose`: package and register the extension.** Add a pinned Python
   runtime/dependency bundle, provenance manifest, signing and installer checks.
   The current packager handles Node/OMP, not this Python runtime. Register Axwise
   through Goose's normal extension lifecycle with a settings toggle. Return
   progress/results to Goose; do not restore forced remote routing or terminal
   shortcuts that bypass the main model loop.
5. **Both repositories: verify before enabling.** Start with PRD creation from
   selected inputs, then analysis and bounded simulation. Expand to richer
   simulations only after a separate parity check.

## Acceptance criteria

- App installation alone provides the extension runtime on each supported OS/CPU.
- With a mocked model, specialist fixture tests run without Cloud SQL, Axwise
  HTTP services, SearXNG or cloud workers. Live tests allow only the chosen model
  transport and explicitly requested retrieval; local orchestration stays local.
- Website regression tests still pass; no website or service is retired here.
- Inputs and output artifacts stay within explicit local scope; selected model
  input disclosure, profile isolation, cancellation and restart behavior are tested.
- Typed artifacts and evidence validation match shared-kernel fixtures; synthetic
  interview output remains explicitly labeled synthetic.
- Disabled Axwise adds no specialist tool calls or mandatory classification cost
  to weather, news, ordinary chat or coding. Enabled Axwise is still not an
  automatic route merely because a project is attached.
- Benchmark cold/warm extension startup, specialist completion, failures and
  cancellation separately from Gemini inference. Compare ordinary-task latency
  against the reset baseline; do not promise a speedup before measuring.

## Cloud scope

The website, sign-in/model gateway, downloads and secrets remain. Keep Axwise's
website dependencies even if desktop chat does not call them. Any later cleanup
needs a separate exact dependency/usage audit and authorization. The current
Orqaly API process still bootstraps SQL and legacy services despite its thin
desktop routes; no database or network dependency can be removed on assumption.
