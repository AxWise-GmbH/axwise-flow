# AxWise MCP connector

This stdio MCP server exposes the repository's implemented cognitive-conditions contract to MCP clients. It does not expose a digital-twin resource or stakeholder-mapping endpoint because those routes are not part of the current backend.

## Supported tool

`axwise_evaluate_conditions` calls:

`POST /api/orqaly-axwise/v1/conditions/evaluate`

Supported integration points are `consilium.create`, `agent.generate`, `copilot.chat`, and `copilot.ground`. The response contains applicable audit markers, processed decision outputs, and trace/cost/latency metadata. It evaluates an orchestration decision; it does not execute the downstream task.

## Install into Codex

From this package directory, build and create an installable tarball, then install it into the user's npm prefix:

```bash
npm pack
npm install --global ./axwise-mcp-connector-1.1.0.tgz
```

The `prepack` script builds the connector, and the tarball includes the compiled `build/` runtime. Add the installed command to Codex's `~/.codex/config.toml`:

```toml
[mcp_servers.axwise]
command = "axwise-mcp-connector"
enabled = true

[mcp_servers.axwise.env]
AXWISE_API_KEY = "your-axwise-api-key"
API_BASE_URL = "http://127.0.0.1:8000"
AXWISE_USER_ID = "your-user-id"
AXWISE_ORG_ID = "your-org-id"
```

For automatic prompt preflight in a trusted project, add this project hook to `.codex/config.toml`:

```toml
[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "mcp_tool"
server = "axwise"
tool = "axwise_prompt_preflight"
input = { prompt = "${prompt}" }
timeout = 30
statusMessage = "Running AxWise preflight"
```

Restart or open a new Codex task after changing MCP configuration. Review and trust the project hook with `/hooks` before it runs.

## Automatic Codex workflow

The MCP server sends Codex instructions to use AxWise as a preflight without requiring the user to name the tool. A Codex `UserPromptSubmit` hook automatically evaluates each submitted prompt through `copilot.chat` and redacts common credential patterns before sending it. For council/consensus, agent creation/execution, and research/retrieval requests, Codex should make one additional evaluation through `consilium.create`, `agent.generate`, or `copilot.ground`, respectively. It should apply returned conditions and outputs to the response and requested work.

## Configuration

Required:

- `AXWISE_API_KEY`: must match the backend value.

Optional:

- `API_BASE_URL`: defaults to `http://localhost:8000`.
- `AXWISE_USER_ID` and `AXWISE_ORG_ID`: default tenant scope. If omitted, every tool call must include `tenant.userId` and `tenant.orgId`.

For a local development install, configure stable local tenant defaults so Codex can call the tool without asking the model to invent tenant IDs. Use the actual tenant identifiers for any non-development AxWise environment. Project hooks must be reviewed and trusted once with Codex's `/hooks` command before they run.

Build and verify with `npm test`. Start with `npm start` after building.
