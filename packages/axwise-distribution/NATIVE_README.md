# AxWise Rust standalone 0.5.1

A local MCP specialist engine for discovery plans, selected market evidence, synthetic personas and interviews, interview analysis, PRDs, and delivery briefs. The release contains one Rust executable, `bin/axwise`, plus documentation, license and provenance. No Python, Node, Orqanix installation or separate AxWise subscription is required.

## Install in Codex CLI

Download `axwise-native-darwin-arm64-v0.5.1.tar.gz` from the [public release](https://github.com/AxWise-GmbH/axwise-flow/releases/tag/axwise-rust-v0.5.1), check its SHA-256 against `SHA256SUMS.txt`, and extract it. This binary targets Apple Silicon macOS. It is ad-hoc signed, not Apple notarized.

```sh
tar -xzf axwise-native-darwin-arm64-v0.5.1.tar.gz
codex mcp add axwise -- /absolute/path/axwise-native-darwin-arm64-v0.5.1/bin/axwise --workspace /absolute/path/project
```

Start a new Codex chat. Ask: “Use AxWise to create a proposed PRD for a cat-food pilot in Estonia with three shops. Label assumptions and do not invent research.” The host must follow pending model requests through `advance_artifact` until a completed receipt is returned. Do not manually write a replacement artifact and claim that AxWise saved it.

For other MCP hosts, configure the same absolute command and arguments as a stdio server, with a tool timeout of at least 180 seconds. Source builds work through `cargo build --release --locked --manifest-path crates/axwise-core/Cargo.toml --bin axwise`.

## Existing harness model access (default)

`--model-access host` is the default. AxWise leaves credentials, model selection and subscription billing with the harness.

* A host advertising MCP sampling receives bounded `sampling/createMessage` requests. Generation and review use separate requests, with no extra tools or unrelated server context requested.
* A host without sampling receives a generation request containing prompts and a response schema. Its current chat model submits the candidate through `advance_artifact`, then reviews the validated candidate and submits the review. This is the route verified with Codex CLI 0.159.3 and its existing ChatGPT login.

Both routes use the same Rust schema, evidence, review, rendering and storage checks. Subscription credentials are never extracted or repurposed as API keys. A denied or failed sampling request does not switch to paid API-key access automatically.

## Inherited API key (optional)

Set `--model-access api-key`, `AXWISE_MODEL` to a model your provider grants you, and pass an existing key through the host's environment. Recognized keys are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `GOOGLE_API_KEY`. `AXWISE_PROVIDER=openai|anthropic|gemini` chooses explicitly; otherwise key priority is OpenAI, Anthropic, Gemini. `AXWISE_BASE_URL` optionally selects an HTTPS or loopback compatible endpoint. There is no silent model upgrade or keychain/auth-file scraping. Generation and critique consume that provider's API allowance.

## Modules and calling contract

| Module | Responsibility |
| --- | --- |
| MCP transport | Negotiate protocol and sampling, bound input/response sizes, honor cancellation and model timeouts. |
| Model access | Use the current harness model, or an explicitly selected inherited API key. |
| Specialist catalog | Eight deliverable tools plus the `advance_artifact` stage tool. No `run_full_discovery` alias. |
| Admission | Closed typed schemas; selected evidence and artifact references only. |
| Domain checks | Exact UTF-8 quotations, participant identity, question coverage, synthetic labels, bounded deterministic interview slots, saved persona identity, PRD sections and additive revisions, delivery requirement/condition coverage. |
| Review | Every required criterion exactly once with a reason. One repair budget, followed by a fresh review. |
| Storage | Account/workspace/session namespaces, SQLite WAL with FULL synchronization, atomic JSON/Markdown writes, hash and file acceptance checks. |

The specialist tools are `prepare_discovery`, `research_market`, `generate_personas`, `simulate_interviews`, `chat_with_persona`, `analyze_interviews`, `create_prd`, and `create_delivery_brief`. Selected market evidence is supplied by the harness's search tools; AxWise does not perform its own web retrieval. Persona and simulation cohorts require explicit stakeholder slots, bounded to 12. Saved persona simulations must preserve the exact cohort profiles. Analysis turn IDs and question IDs are returned in the prepared context; do not invent identifiers or transcript text.

A result moves through `model_request/generate → local validation → model_request/review → optional repair and fresh review → completed`. Pending or rejected candidates are never completed artifacts. Completion returns a verified JSON path, rendered Markdown path, operation reference and SHA-256. Keep exact returned references for follow-ups. Persona IDs are returned with their cohort operation prefix; pass that cohort reference when chatting with a persona. Delivery requires exactly one saved native PRD reference.

## Scope and limits

The default store is `~/.axwise/native/<local-account>/<workspace-session>/`; the account SQLite database sits one level above session artifacts. The local account namespace identifies the local host user, not a verified cloud identity. A new server process gets a new session. Hosts should launch a server per conversation, or supply a trusted `--session`/`AXWISE_SESSION_ID` for explicit continuation. Never use one fixed session for every user's chat. Completed files survive a restart; in-flight requests expire after 30 minutes and are lost on restart. Automatic restart reconciliation is not implemented in this standalone entry point.

Messages and artifacts are capped at 1 MiB; selected inputs and candidates at 512 KiB; at most 16 selected references; at most 12 questions per simulation role and 72 total answers; 32 jobs are retained; each automatic inference has a 120-second timeout and a 16,384-token generation ceiling. Host-chat generation is governed by the harness's own resource controls. This runtime is not an OS sandbox. Host permissions remain responsible for launching the server and selecting its writable store.

Reviews are model critiques, not an independent managed JEV Gate B audit. Provenance records this as `reviewAuthority=model_critique` and `managedJevAudit=false`. The installed Orqanix 2.8.4 adapter still uses its existing managed hybrid engine; this Rust standalone release does not change that app or claim complete behavioral parity with its Python kernel. Standalone and desktop artifacts use distinct stores and formats.
