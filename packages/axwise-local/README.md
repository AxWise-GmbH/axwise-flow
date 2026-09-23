# Axwise local Goose extension

An optional stdio MCP extension for **explicitly requested specialist artifacts**:

- `create_prd`: evidence-labelled product/software PRD drafts.
- `analyze_interviews`: qualitative analysis of selected interview turns with locally validated quote spans and participant identity.
- `simulate_interviews`: bounded, clearly synthetic scenario interviews—not real customer research.

This is a local extraction of Axwise's domain logic, not the former adapter to the Axwise cloud orchestrator. Python prepares the Axwise prompt/schema; Node performs bounded authenticated Gemini inference through the existing `/desktop/v1/chat/completions` transport; Python validates/materializes each candidate. Analysis and PRD generation now use a substantive review and at most one repair. Simulation remains one generation. No Cloud SQL, queue, remote Axwise job, hidden filesystem context, or polling is involved. Model inference is cloud-hosted; this is not an offline/local-model claim.

Goose retains its normal loop and interprets the tool result. The extension has no routing hook, cannot force a tool call, and advertises no chat/search/weather/currency/coding tool. Its desktop toggle is independently optional and defaults off. Simply attaching a project is not a reason to call it. Tool inputs are selected inline by Goose under its normal approval rules and are sent to the configured model.

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

- One active specialist operation per extension process; 160 KB selected input; 1 MB protocol/provider frames and individual snapshots; **180-second overall deadline**, including every stage. Analysis and PRD take generation → deterministic validation → model review. A failed validation or substantive review permits at most one repair and, if that repair is structurally valid, one final review. Maximum **four model calls**, not an unbounded retry loop. Malformed reviews, provider errors, a failed final review, or an invalid repaired candidate fail closed. Simulation remains one generation without review/repair.
- MCP cancellation/disconnect aborts the provider request and terminates the active Python process. Repeated JSON-RPC tool request IDs on the same connection do not generate another inference.
- Only locally validated results (and, for PRD/analysis, a passed substantive review) become `<state-dir>/<account-hash>/<conversation-id>/<operation-uuid>.json`, permissions `0600`, inside private scoped directories. The `axwise.local-artifact.v2` record includes frozen selected input, accepted candidate, output, input/output hashes, provenance, review, total usage and per-stage timing. This is a new format: older v1 files are left untouched and cannot be supplied as immutable analysis references. The returned result also reports persistence and total elapsed time and the exact saved file's SHA-256.
- Artifacts are fsynced to a temporary file and atomically committed without overwriting an existing operation. Cancellation before commit publishes no artifact. Cancellation after the commit point may return the already-completed operation.
- Private numbered stage snapshots live in `<conversation>/.operations/<operation-uuid>/`, including the original selected input, candidate responses, validated reviews and finite validation diagnostics. They use the same `0600` atomic writes and `0700` directories; there are at most 20 snapshots per operation, each at most 1 MB. They contain selected documents/model content and must be treated as sensitive local application data. Credentials and raw exception text are never journaled. **These are diagnostic checkpoints, not a resumable workflow.** There is no automatic restart/replay, inference cache, or durable job queue. A newly requested regeneration creates a new operation. A crash may leave a hidden temporary file, never a completed partial artifact.
- Invalid evidence, incomplete model output, auth failure and timeout produce bounded errors, not invented success. Structural validation uses finite repair codes, never exception strings containing document excerpts. A review is another model judgment, **not proof that an interpretation is true**; source quotation/identity checks remain deterministic. Benchmark usefulness rather than claiming review guarantees quality.

### Immutable analysis → PRD handoff

A completed interview analysis returns a visible text reference as well as structured metadata:

```json
{"analysisArtifact":{"operationId":"11111111-1111-4111-8111-111111111111","sha256":"<exact saved-file SHA-256>"}}
```

Pass that reference to `create_prd` with its brief. Goose should not retype findings, interview turns or synthetic labels. The host resolves **only** that operation in the launcher's existing account/conversation directory. Strict UUID/hash checks, a bounded `O_NOFOLLOW` regular-file read, file checksum, artifact version/type/identity/scope checks, frozen input/output hashes and passed-review checks run before inference. The host supplies the frozen analysis input/candidate/artifact as a private `hostEvidence` worker envelope; Python re-materializes it before use. Tool callers cannot supply their own `hostEvidence`. Arbitrary paths, URLs, cross-conversation references, symlinks, altered files and legacy v1 records are rejected.

The reference prevents accidental reconstruction or relabeling between these two operations. It does not authenticate the original user-supplied transcript's real-world truth, protect against a same-user process deliberately rewriting both a file and its reference, or verify a model's semantic inference. Original provenance remains caller-declared at initial selection. Reusing a validated analysis avoids regenerating that stage; failed runs themselves are not resumable.

The structured result reports aggregated `prepareMs`, `authMs`, `inferenceMs` (successful provider round-trips, including response parsing), `authAndInferenceMs` (also includes elapsed failed attempts), `validateMs`, `persistMs`, `totalMs`, token usage when supplied by the provider, and `execution.calls`/`usage.modelCalls` (attempted model stages). `execution.stages` reports each stage's completion/failure, timing and available tokens. Token totals omit unavailable failed-response usage rather than reporting it as zero. These timings measure the specialist operation, not Goose's preceding tool-selection or following answer-generation inference. Saved records are a pre-publication snapshot; the returned MCP result additionally includes final persistence/total time. Benchmark total user turnaround separately; additional review is not guaranteed to be faster than vanilla Goose.

## Tests

```sh
node --test packages/axwise-local/test/*.test.mjs
python3 -m unittest discover -s backend/tests/local_axwise -v
```

Node tests cover wire/auth boundaries, discovery isolation, aborts, duplicate requests, bounded review/repair, terminal final failures, private snapshots, frozen references, symlinks/scope/hash checks, input/output limits and atomic persistence. Python tests cover Axwise domain invariants, exact evidence linkage and substantive review contracts. Live benchmarks are a separate gate; passing deterministic tests does not prove quality or latency superiority.
