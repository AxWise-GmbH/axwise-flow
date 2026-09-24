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

The host assistant chooses when to call a tool. Ordinary chat, news, weather, search and coding do not need AxWise. Asking to “go deeper” is not by itself permission to start product discovery. AxWise does not browse the computer or web on its own: the host selects input and retains its tool ownership and approvals.

Synthetic and supplied interview inputs retain their provenance. Outputs are model-generated and should be reviewed before decisions or delivery commitments. Saved Markdown/JSON artifacts, version references, validation and intermediate state stay local. **Selected evidence and prompts are sent to the model provider you configure.** Local orchestration does not mean local inference or free API usage.

## Install from a release

Version 0.3.0 is distributed as direct GitHub release files. These examples do not assume an npm or PyPI registry publication, account or namespace reservation. Choose either launcher; they contain the **same Python wheel and JavaScript runtime**.

Prerequisites: Node.js 22 or newer; Python 3.11 or newer; [uv](https://docs.astral.sh/uv/getting-started/installation/) (`uvx` on PATH). uv can provision a supported Python. The npm launcher uses its own Node executable and uv supplies the Python environment. The uv launcher requires Node on PATH, or an absolute trusted executable path in `AXWISE_NODE`. Provider API usage is charged by your provider, not by this package.

### uv / uvx

```sh
uvx --from https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.3.0/axwise_extension-0.3.0-py3-none-any.whl axwise --config /absolute/path/axwise.json
```

### npm / npx

```sh
npx --yes --package=https://github.com/AxWise-GmbH/axwise-flow/releases/download/axwise-extension-v0.3.0/axwise-extension-0.3.0.tgz axwise --config /absolute/path/axwise.json
```

Alternatively download the `.whl` or `.tgz` and use its absolute local path in place of the URL. Check it against the release's `SHA256SUMS` before installation. The npm archive has no lifecycle install scripts. The first launch may download Python dependencies through uv; warm launches reuse uv's cache. Neither launcher embeds API keys or silently installs Node or uv.

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

Set the named key in the launching host's environment using its secure configuration mechanism. The extension does not discover credentials in a browser, `.env`, another assistant or Orqanix. It reads the configured key only when inference is requested; initialization and tool listing need no key. HTTPS is required by default. HTTP loopback is allowed only with the explicit `allowLoopback: true` option for a local model or test endpoint; redirects are not followed.

`profileId`, `workspaceId` and `sessionId` are explicit local scope identifiers, not authentication or authorization. Use distinct scopes for unrelated work and separate OS accounts for mutually untrusted users. A static MCP config uses a static session: it **cannot automatically detect the current chat**. Hosts that need per-chat isolation must supply a new config/session ID when launching that chat's extension. API keys, provider and model changes do not select a different local artifact scope. Back up saved artifacts deliberately; uninstalling the executable does not erase your state directory.

## Connect a host

Any compatible **stdio MCP** host can launch the command above and discover the eight tools. In Goose, add a custom stdio extension. In Codex or another MCP wrapper, use that host's MCP configuration with the command, arguments and explicit key environment. This is an interoperable MCP server, not an embedded UI or a claim of native marketplace installation in every wrapper.

Generic launch configuration (adapt the surrounding keys to your host):

```json
{
  "command": "uvx",
  "args": [
    "--from",
    "/absolute/path/axwise_extension-0.3.0-py3-none-any.whl",
    "axwise",
    "--config",
    "/absolute/path/axwise.json"
  ]
}
```

The MCP connection owns one active operation at a time. The host controls tool calls and cancellation. Do not point unrelated concurrent hosts at the same static session unless you intentionally want shared artifacts.

Installation has been verified on macOS Apple Silicon. Linux and Windows installation still need platform-specific verification. MCP protocol checks do not replace an end-to-end check of tool selection and rendering in your chosen host.

## Source, tests and reproducible builds

The runtime is hybrid: Node handles MCP, provider calls and local state; a small Python/Pydantic kernel prepares and validates the discovery artifacts. There is one implementation, not a separate npm engine and Python engine. The `backend/` namespace contains only allowlisted pure kernel contracts retained for import compatibility—not the former web backend.

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
