# Orqanix Oh My Pi MCP bridge

This package is the narrow adapter between Orqanix Desktop and the bundled Oh My Pi
(OMP) engineering runtime. It exposes three local MCP tools:

- `orqanix_engineering_status` checks the runtime without making a model request.
- `orqanix_engineering_inspect` performs a read-only repository inspection.
- `orqanix_engineering_edit` performs an explicitly approved file edit.

Each call starts an ephemeral `omp --mode rpc` child using OMP's native newline-delimited
JSON protocol. The bridge does not add a daemon, distribute a Gemini key, store an access
token, commit, push, deploy, install dependencies, or provide shell/browser/network tools.
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
