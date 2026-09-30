# AxWise — product discovery as a local MCP extension

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow/stargazers)

AxWise is a scoped, open-source specialist for turning a product question and selected evidence into discovery plans, personas, interviews, analysis, PRDs and delivery briefs. It runs **inside your existing assistant workflow**, rather than replacing the assistant or controlling every chat turn.

For the desktop application with managed sign-in and model access, use [Orqanix](https://orqanix.com). This repository contains the independent extension, not the old hosted web application, Orqanix authentication, billing or backend. Existing repository history and attribution remain; the current source tree is focused on the extension.

## What you can do

| Tool | Example |
| --- | --- |
| `prepare_discovery` | Agree the problem, boundaries, stakeholders and interview questions for a booking product. |
| `generate_personas` | Generate a scoped participant cohort for the agreed research. |
| `simulate_interviews` | Run multi-question synthetic interviews across that cohort. |
| `analyze_interviews` | Extract themes, patterns, stakeholder sentiment, personas and insights from selected interviews. |
| `research_market` | Synthesize explicitly selected market evidence supplied by the host. |
| `create_prd` | Produce an evidence-linked PRD; preserve previous content during additive revisions. |
| `chat_with_persona` | Discuss an exact selected document with a saved persona. |
| `create_delivery_brief` | Turn a selected PRD into a scoped engineering or outsourcing handoff. |
| `run_full_discovery` | Run framing, personas, simulation, analysis and PRD tools sequentially in the configured scope. |

The host assistant chooses when to call a tool. Ordinary chat, news, weather, search and coding do not need AxWise. Asking to “go deeper” is not by itself permission to start product discovery. AxWise does not browse the computer or web on its own: the host selects input and retains its tool ownership and approvals.

Synthetic and supplied interview inputs retain their provenance. Outputs are model-generated and should be reviewed before decisions or delivery commitments. Saved Markdown/JSON artifacts, version references, validation and intermediate state stay local. **Selected evidence and prompts are sent to the model provider you configure.** Local orchestration does not mean local inference or free API usage.

## Install from a release

Version 0.4.0 is a pure-Python FastMCP extension. It eliminates the previous dual Node.js runtime requirement and PostgreSQL database dependencies, storing all artifacts in an embedded SQLite database (`~/.axwise/state/axwise.db`) and human-readable Markdown files.

Prerequisites: Python 3.11 or newer; [uv](https://docs.astral.sh/uv/getting-started/installation/) (`uvx` on PATH) or `pip`. No Node.js and no database daemons required.

### uv / uvx (Recommended)

Run directly without manual installation:

```sh
uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.0/axwise_extension-0.4.0-py3-none-any.whl axwise
```

Or install into your environment:

```sh
pip install https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.0/axwise_extension-0.4.0-py3-none-any.whl
```

### Codex Setup (`~/.codex/config.toml`)

```toml
[mcp_servers.axwise-local]
command = "axwise"
args = []
```

### Claude Code / Cursor / Windsurf (`mcpServers`)

```json
{
  "mcpServers": {
    "axwise": {
      "command": "uvx",
      "args": [
        "--from",
        "https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.4.0/axwise_extension-0.4.0-py3-none-any.whl",
        "axwise"
      ]
    }
  }
}
```

### Zero-Config Credentials & Dynamic Model Resolution

AxWise Local automatically discovers your credentials from:
- Environment variables: `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`.
- Local `.env` files or OS keychain (e.g. Goose / Codex credentials).
- Dynamic model resolution automatically selects the latest frontier models (`gemini-flash-latest`, `gpt-6-sol`, `claude-sonnet-5`) and caches model capability lists in SQLite for 24 hours.

## Configure your own model and local scope

Copy `axwise.example.json` to a location you control and edit it. Use absolute paths, an explicit provider/model/base URL, and the name of an environment variable containing your API key. Never put the key itself in the JSON or host arguments. The Gemini example uses Google's OpenAI-compatible endpoint; an OpenAI-compatible provider must support non-streaming chat completions with structured JSON-schema output. Support is protocol-level, not a claim that every provider/model has been tested.

The generic OpenAI-compatible adapter uses non-strict JSON-schema responses to retain the kernel's optional fields. Every returned artifact still passes local kernel validation; provider schema guidance does not replace it. Gemini uses its own compatible schema representation.

```json
{
  "version": 1,
  "provider": "gemini",
  "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
  "model": "gemini-3.8-flash",
  "apiKeyEnv": "GEMINI_API_KEY",
  "stateDir": "/absolute/path/to/axwise-state",
  "profileId": "personal",
  "workspaceId": "customer-discovery",
  "sessionId": "discovery-session-001"
}
```

Set the named key in the launching host's environment using its secure configuration mechanism. With `--config`, the named environment key is authoritative: the extension does not read `.env`, keychains or another assistant's credentials. A missing named key produces an error when inference is requested; initialization and tool listing need no key. HTTPS is required by default. HTTP loopback is allowed only with the explicit `allowLoopback: true` option for a local model or test endpoint; redirects are not followed.

`--state-dir` overrides the JSON state directory; JSON settings override environment defaults. `AXWISE_CONFIG` can supply the config path when `--config` is omitted. Invalid explicit JSON is rejected during startup.

Without a config file, the canonical launch directory determines the workspace, with profile `personal` and session `main`. Hosts launched from a shared working directory must set distinct `AXWISE_WORKSPACE_ID` values or use explicit JSON. `AXWISE_PROFILE_ID` and `AXWISE_SESSION_ID` can also override zero-config identity. Reconnecting from the same scope retains artifacts. Old unscoped `default` artifacts are not automatically assigned to a new workspace.

`profileId`, `workspaceId` and `sessionId` are explicit local scope identifiers, not authentication or authorization. Use distinct scopes for unrelated work and separate OS accounts for mutually untrusted users. A static MCP config uses a static session: it **cannot automatically detect the current chat**. Hosts that need per-chat isolation must supply a new config/session ID when launching that chat's extension. API keys, provider and model changes do not select a different local artifact scope. Historical artifacts with inconsistent file hashes require explicit migration or recreation; they are never silently rehashed. Back up saved artifacts deliberately; uninstalling the executable does not erase your state directory.

## Connect a host

Any compatible **stdio MCP** host can launch the command above and discover the nine tools. In Goose, add a custom stdio extension. In Codex or another MCP wrapper, use that host's MCP configuration with the command, arguments and explicit key environment. This is an interoperable MCP server, not an embedded UI or a claim of native marketplace installation in every wrapper.

Generic launch configuration (adapt the surrounding keys to your host):

```json
{
  "command": "uvx",
  "args": [
    "--from",
    "/absolute/path/axwise_extension-0.4.0-py3-none-any.whl",
    "axwise",
    "--config",
    "/absolute/path/axwise.json"
  ]
}
```

The host controls tool calls and cancellation. Run dependent pipeline steps sequentially. Do not point unrelated concurrent hosts at the same static session unless you intentionally want shared artifacts.

Installation has been verified on macOS Apple Silicon. Linux and Windows installation still need platform-specific verification. MCP protocol checks do not replace an end-to-end check of tool selection and rendering in your chosen host.

## Source, tests and reproducible builds

The public runtime is Python: FastMCP exposes tools, a provider adapter makes model calls, SQLite indexes local artifacts, and the Pydantic kernel prepares and validates them. The npm launcher starts the identical bundled Python wheel using uvx. The managed desktop continues to use the Node adapter with the shared Python kernel. The public `backend/` namespace contains only allowlisted runtime and kernel dependencies; it does not start the former web backend.

```sh
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r backend/services/local_axwise/requirements.txt
.venv/bin/python -m unittest discover -s backend/tests/local_axwise
AXWISE_TEST_PYTHON="$PWD/.venv/bin/python" node --test packages/axwise-local/test/*.test.mjs
python3 -m unittest discover -s packages/axwise-distribution -p 'test_*.py'
```

Build to a **new, nonexistent directory outside the checkout** whose parent exists:

```sh
python3 packages/axwise-distribution/build.py --source-root /absolute/path/to/axwise-flow --output /absolute/path/to/new-release
```

This creates a clean allowlisted `source/` tree plus wheel, npm archive, source archive, `SHA256SUMS` and file-level provenance under `artifacts/`. No Git history, `.env`, dependency caches, private service configuration or former web app is copied. Rebuilds of unchanged inputs produce identical bytes in the same Python toolchain. The root `pyproject.toml` also supports standard PEP 517 wheel/source builds without build-time dependencies.

The previous web platform's UI, regional orchestration, video/call workflows, hosted queues, authentication and database services are not part of this distribution. Orqanix bundles the same specialist separately with its managed provider adapter; this standalone entry point uses your own provider.

Licensed under Apache-2.0. See [LICENSE](LICENSE).

## Project continuity and credits

This is the same AxWise repository, now focused on the local extension. Existing stars, forks, contributors and Git history are retained. The previous web platform remains available in the repository history; it is not shipped in this package. The original AxWise project was supported by [AI Nation](https://www.ai-nation.de/).

[![Contributors](https://contrib.rocks/image?repo=AxWise-GmbH/axwise-flow)](https://github.com/AxWise-GmbH/axwise-flow/graphs/contributors)

## Artifact safety policy

Before persistence, a local full-record scan blocks known credential patterns. Remote Jev checking is optional and requires both `AXWISE_REMOTE_ARTIFACT_SAFETY=true` and `TYPESAFE_API_KEY`; this sends the artifact record to TypeSafe. Missing, unavailable, malformed or oversized remote evaluations remain `not_evaluated`, not passed. An explicit failed verdict blocks publication. Local scanning is limited to known patterns and does not establish that a record contains no secrets.
