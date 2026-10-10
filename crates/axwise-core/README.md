# AxWise runtimes

## Rust standalone 0.5.3

The `axwise` executable is the Rust-only MCP specialist for external harnesses. Default model access uses negotiated MCP sampling or staged generation/review by the current chat model; this retains the harness’s API key or subscription without reading its authentication tokens. Explicit inherited environment API-key access is optional.

Build with `cargo build --release --locked --manifest-path crates/axwise-core/Cargo.toml --bin axwise`. Run `axwise --workspace /absolute/project/path`. No Python, Node or Orqanix installation is required. Eight specialist tools and `advance_artifact` share Rust schema, domain, review, rendering and storage gates. See [installation, calling contract and limits](../../packages/axwise-distribution/NATIVE_README.md). Reviews are model critiques, with `managedJevAudit=false`; standalone stores/formats differ from the desktop adapter.

## Orqanix production adapter (`axwise-mcp`)

Orqanix exposes one default `axwise` platform extension. Rust owns scope, signed-in inference, orchestration, cancellation, journals and persistence. The in-process Rust desktop domain kernel owns the complete input/candidate schemas, evidence rules, frozen persona context, PRD revision preservation, semantic quality review and Markdown rendering. This reuses the tested Local capabilities without running a second MCP extension or a persistent Node sidecar.

The eight tools are `prepare_discovery`, `research_market`, `generate_personas`, `simulate_interviews`, `chat_with_persona`, `analyze_interviews`, `create_prd` and `create_delivery_brief`. A request selects a deliverable; availability never means running all eight steps. Existing-document explanations normally reuse the saved document. Market synthesis does not fetch the web; the host selects evidence through its search tools. Simulated people/interviews remain explicitly synthetic.

Production calls require absolute host-selected `AXWISE_STATE_DIR`; no Python executable or kernel directory is required. The desktop also supplies `GOOSE_PATH_ROOT` and its trusted `ORQALY_DESKTOP_RUNTIME_ROOT`. The connector refreshes the signed-in token; the account header and profile must match the trusted call scope. No personal API-key fallback is used in production. Non-desktop hosts explicitly supply their managed `AXWISE_ACCOUNT_TOKEN` and `AXWISE_GATEWAY_URL`.

`AXWISE_LEGACY_STATE_DIR` is an optional read-only compatibility store. Validated `axwise.local-artifact.v2` documents remain available by exact ID/digest in their original account and conversation. New records use `axwise.artifact.v3`, immutable Markdown/JSON, an accepted SQLite operation and an `orqanix.result.v1` descriptor. The host verifies bytes and digest after saving. Invalid, missing, cross-session, symlinked or tampered references fail before inference. Old schema-only Rust outputs are not silently upgraded into accepted domain artifacts.

Generation sends the exact structural response schema, then runs the full unchanged domain validator. Reviewed tools allow one repair and a new review, with at most four model calls; simulation allows at most twelve planned interviews with concurrency two. PRDs and delivery briefs additionally require a scope/digest-bound managed Gate B audit. Storage failure never emits a completed receipt. Calls have a 180-second deadline, kernel operations ten seconds, frames/artifacts one MiB and selected inputs 160 kB. Cancellation stops host orchestration; pure, bounded kernel computation has no effects or publication authority. Protected OAuth token rotation may finish for up to sixty seconds; the backend updater waits for it.

Domain validation diagnostics remain finite, content-free enum codes through the Rust host and MCP. The internal repair receives the exact codes and domain guidance. Initial rejection, the repaired candidate and terminal rejection are journaled. A rejection before publication returns MCP `isError` with an `axwise.failure.v1` receipt (`status=rejected`, `artifactPublished=false`, `effectsPossible=false`); storage attempts and cancellation retain conservative uncertainty. Brief-only drafts use proposals and gaps under the unchanged evidence/owner-decision rules.

Private operation journals retain selected input, generated candidate, validation and completion checkpoints. Interrupted/failed calls do not automatically replay inference or publish artifacts. These snapshots are diagnostic recovery evidence, not resumable completed work.

The earlier schema-only Rust pipeline and `axwise-worker` are experimental compatibility work. They require `AXWISE_EXPERIMENTAL_RUST_PIPELINE=1`; desktop launches remove that flag. Production never silently falls back to them. The desktop domain kernel is separate from that standalone contract and preserves the existing managed host and workspace output format.

Verification:

```sh
cargo test --manifest-path crates/axwise-core/Cargo.toml -- --test-threads=1
cargo clippy --manifest-path crates/axwise-core/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path crates/axwise-core/Cargo.toml
AXWISE_RUST_MCP="$PWD/crates/axwise-core/target/debug/axwise-mcp" python3 -m unittest backend.tests.local_axwise.test_rust_specialist
```

The production-contract suite executes all eight tools through the real Rust host and real domain kernel, with synthetic loopback completions; it also verifies repair, revision preservation, storage rejection and chat scope. Separate authorized live tests verify provider behavior. Neither fixture results nor a handful of live completions establish universal model accuracy.

Desktop kernel parity is verified by 598 captured calls from 243 existing Python tests and the 26 original comparison probes. Successful artifacts, canonical hashes, schemas, prompts and protocol errors are compared; JSON member order inside prompts is immaterial. The frozen `contract.json` is data compiled into Rust, not a runtime Python dependency. Python is used only as the development test oracle.

An additional 23 boundary cases cover multiline Markdown, simulation profile constraints, missing-origin error classification and ISO source dates. The offline bridge also rejects oversized or invalid UTF-8 frames and continues with the next request.

```sh
cargo test --manifest-path crates/axwise-core/Cargo.toml --test desktop_kernel_test
python3 scripts/axwise-kernel/run_existing_tests.py
python3 scripts/axwise-kernel/check_probes.py
python3 scripts/axwise-kernel/check_edge_cases.py
```
