# Orqanix Oh My Pi MCP bridge

This package is the narrow adapter between Orqanix Desktop and the bundled Oh My Pi
(OMP) engineering runtime. It exposes three local MCP tools:

- `orqanix_engineering_status` checks the runtime without making a model request.
- `orqanix_engineering_inspect` performs a read-only repository inspection.
- `orqanix_engineering_edit` performs an explicitly approved file edit.

Each call starts an ephemeral `omp --mode rpc` child using OMP's native newline-delimited
JSON protocol. The bridge does not add a daemon, distribute a Gemini key, store an access
token, commit, push, deploy, install dependencies, or provide shell/browser/network tools to OMP. The approved edit call can execute an explicit test argv without a shell after OMP exits.
The conversation workspace is fixed when the MCP server starts, rather than supplied by
the model in a tool call.

Goose remains the primary desktop agent. Its native skills extension stays enabled by
default. OMP also keeps skill discovery enabled—the bridge never passes `--no-skills`—but
it disables unrelated OMP extensions and restricts the actual tool set for the delegated
task.

## Packaged launch contract

The desktop supplies only fixed local paths and a non-secret account hash:

```sh
orqanix-omp-mcp \
  --workspace /absolute/project/root \
  --omp /bundled/orqaly-runtime/omp/bin/omp \
  --node /bundled/orqaly-runtime/node/bin/node \
  --connector /bundled/orqaly-runtime/connector/src/cli.mjs \
  --connector-config /bundled/orqaly-runtime/connector/preview.config.example.json \
  --account-hash SHA256_VERIFIED_USER_ID \
  --conversation-id DESKTOP_CONVERSATION_ID \
  --state-dir /private/account/profile/omp
```

At startup the bridge writes a secret-free OMP `models.yml` in the isolated account
state directory. For each invocation it asks the existing Orqanix connector for a current
OAuth access token and passes that token only in the OMP child environment. The selected
model is `orqanix/orqaly-gemini`, using the authenticated `/desktop/v1` gateway with a
1,048,576-token context window and 65,536-token output declaration.

Optional local policy limits are:

- `ORQANIX_OMP_TIMEOUT_MS` — maximum task time; default 10 minutes.
- `ORQANIX_OMP_STARTUP_TIMEOUT_MS` — startup deadline; default 30 seconds.
- `ORQANIX_OMP_MAX_OUTPUT_BYTES` — returned assistant text; default 128 KiB.

## Verification

```sh
npm test
```

Tests use a local fake connector and fake OMP JSONL process. They make no model or network
calls and assert that the access token is neither written to `models.yml` nor returned by
the MCP surface.

## Evidence and Jev review

Approved edit calls accept `acceptance_criteria`, `research_references` and
`test_command` (for example `["node", "--test", "feature.test.mjs"]`). The bridge
captures the initial and final Git diff, including bounded untracked text files,
and executes that test command in the fixed workspace. Oversize, binary, unsafe
or unavailable evidence cannot receive a passing review. Existing dirty changes
are included as the baseline, not attributed to the task.

The bridge sends this evidence with a task ID and content hashes to the existing
OAuth gateway `/desktop/v1/engineering/review`. The server validates ownership and
hashes for referenced AxWise artifacts and calls TypeSafe with its Secret Manager
credential. No TypeSafe key is stored in the desktop bundle or model environment.

`review.status` is `passed`, `failed` or `not_evaluated`; it remains advisory.
Only observed passing tests plus a passing review yield `verified: true` and a
completed edit. Missing evidence, failed tests or unavailable review yield
`review_required`; inspection alone never claims verification. A passing review
is scoped to the captured evidence and is not proof of production readiness.
