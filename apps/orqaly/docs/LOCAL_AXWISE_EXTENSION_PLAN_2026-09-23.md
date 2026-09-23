# Axwise as a bundled local Goose specialist — 23 September 2026

Status: **architecture decision and implementation plan, not a shipped extension**.
Orqanix 2.3.11 already restores the Goose-controlled desktop loop; it does not
yet include a local Axwise Python engine.

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
