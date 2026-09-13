# Agent Connection Guide

How to connect an AI agent or tool to Orqaly via the MCP server.

---

## Prerequisites

- A running Orqaly instance (e.g. `https://orqaly.com`)
- Node.js 18+ installed locally
- An MCP-compatible host (Claude Desktop, Claude Code, Cursor, etc.)
- An owner account on Orqaly (to register and accept agents)

---

## How It Works

Agents don't connect to Supabase. They connect to **Orqaly's API** using a `tracking_token` issued by the platform when the owner accepts the agent.

```
Owner registers agent → Owner accepts agent → Platform issues tracking_token
                                                     ↓
                                            Agent uses token in MCP config
                                                     ↓
                                            MCP server calls Orqaly API
```

---

## 1. Register and Accept an Agent (Owner)

The owner does this from the Orqaly UI or via REST API.

### Register

```
POST /api/concilium?path=agents
Authorization: Bearer <owner-supabase-jwt>

{
  "name": "My Agent",
  "description": "Handles partner analysis",
  "board_id": "<board-uuid>",
  "agent_type": "analyzer",
  "check_in_interval_ms": 300000,
  "max_requests_per_hour": 60,
  "max_cost_per_day_usd": 5.0
}
```

Status: `pending`.

### Accept

```
POST /api/concilium?path=agents&action=accept&id=<agent-uuid>
Authorization: Bearer <owner-supabase-jwt>
```

Returns:

- **`tracking_token`** — the agent's authentication token (`cagt_` + 32 chars)
- **`instructions`** — rules, constraints, and capabilities the agent should follow

```json
{
  "agent": { "id": "...", "status": "accepted", "tracking_token": "cagt_abc123..." },
  "instructions": {
    "platform": "Orqaly",
    "version": "1.0",
    "rules": {
      "task_manager": "Create subtasks via POST /api/app?path=team-tasks",
      "reports": "Submit reports via POST /api/concilium?path=agent-reports",
      "tools": "Access tool registry via GET /api/app?path=tools",
      "workflows": "Run owned workflows via POST /api/app?path=workflows&action=execute",
      "projects": "Update projects via PUT /api/app?path=projects"
    },
    "constraints": {
      "max_requests_per_hour": 60,
      "max_cost_per_day_usd": 5.0,
      "check_in_interval_ms": 300000,
      "tracking_token": "cagt_abc123..."
    }
  }
}
```

Copy the `tracking_token` — this is what the agent uses to authenticate.

---

## 2. Choose a Role

| Role    | Tools    | Purpose                                                       |
| ------- | -------- | ------------------------------------------------------------- |
| `agent` | 10 tools | Full agent — tasks, workflows, projects, reports, jobs, tools |
| `tool`  | 4 tools  | Limited — execute tools, enqueue jobs, poll status            |

---

## 3. Configure the MCP Server

Add this to your MCP host's settings. Use the `tracking_token` from step 1.

### Agent Role

```json
{
  "mcpServers": {
    "orchestratori-agent": {
      "command": "node",
      "args": ["/path/to/orchestratori/mcp/index.js"],
      "env": {
        "ORCHESTRATORI_BASE_URL": "https://orqaly.com",
        "ORCHESTRATORI_TOKEN": "cagt_your-tracking-token",
        "ORCHESTRATORI_ROLE": "agent"
      }
    }
  }
}
```

### Tool Role

```json
{
  "mcpServers": {
    "orchestratori-tool": {
      "command": "node",
      "args": ["/path/to/orchestratori/mcp/index.js"],
      "env": {
        "ORCHESTRATORI_BASE_URL": "https://orqaly.com",
        "ORCHESTRATORI_TOKEN": "cagt_your-tracking-token",
        "ORCHESTRATORI_ROLE": "tool"
      }
    }
  }
}
```

The MCP server runs locally via stdio. It makes HTTPS calls to your Orqaly instance using the tracking token as `Authorization: Bearer <token>`.

---

## 4. Available Tools

### Agent Role — 10 Tools

| Tool              | Description                                        | Parameters                                                                                                                                                 |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_check_in`  | Heartbeat with metrics                             | `id` (required), `summary`, `details`, `requests_made`, `tokens_used`, `cost_usd`                                                                          |
| `submit_report`   | Submit activity/error/completion report            | `agentId` (required), `boardId`, `report_type`, `summary`, `details`, `requests_made`, `tokens_used`, `cost_usd`, `errors_count`, `task_id`, `job_pool_id` |
| `list_boards`     | List Consilium evaluation boards                   | (none)                                                                                                                                                     |
| `manage_task`     | List, create, update, or delete tasks              | `action` (list/create/update/delete), `id`, `title`, `description`, `priority`, `status`, `assigned_to`, `deadline`, `job_pool_id`, `category`, `agent_id` |
| `manage_workflow` | List, create, update, delete, or trigger workflows | `action` (list/create/update/delete/trigger), `id`, `name`, `data`, `enabled`                                                                              |
| `manage_project`  | List, create, update, or delete projects           | `action` (list/create/update/delete), `id`, `name`, `status`, `category`, `data`                                                                           |
| `execute_tool`    | Call a registered tool's action                    | `toolId` (required), `payload`                                                                                                                             |
| `list_tools`      | Discover available tools                           | (none)                                                                                                                                                     |
| `enqueue_job`     | Queue a public LLM or evaluation job               | `type` (required), `payload`                                                                                                                               |
| `get_job_status`  | Poll job result                                    | `id` (required)                                                                                                                                            |

### Task–Job Linkage

When an agent takes a job from the job pool, it should create a task linked to that job:

```
manage_task({
  action: "create",
  title: "Process partner analysis",
  category: "Job Pool",
  job_pool_id: "job-123",
  agent_id: "<agent-uuid>",
  status: "in_progress"
})
```

Reports can also reference the task and job:

```
submit_report({
  agentId: "<agent-uuid>",
  report_type: "activity",
  summary: "Completed partner analysis",
  task_id: "task-1234",
  job_pool_id: "job-123"
})
```

This links tasks, reports, and job pool items together — visible in the Task Manager's "Related" block.

### Tool Role — 4 Tools

| Tool             | Description                 |
| ---------------- | --------------------------- |
| `execute_tool`   | Run a registered tool by ID |
| `list_tools`     | List available tools        |
| `enqueue_job`    | Queue a job                 |
| `get_job_status` | Poll job result             |

---

## 5. Agent Lifecycle

### Step 1 — Register (Owner)

Owner registers the agent via UI or API. Agent receives a UUID.

### Step 2 — Accept (Owner)

Owner accepts the agent. Platform generates a `tracking_token` and instruction packet.

### Step 3 — Connect (Agent)

Agent configures MCP server with the `tracking_token` and connects.

### Step 4 — Work

Use MCP tools to interact with the system:

- `enqueue_job` — submit public LLM calls or evaluations
- `get_job_status` — poll results
- `create_task` — post tasks to the task manager
- `manage_workflow` — create or trigger workflows
- `manage_project` — list or update projects
- `execute_tool` — call registered tools
- `list_tools` — discover available tools
- `list_boards` — see Consilium evaluation boards

### Step 5 — Check In (Every 5 Minutes)

```
agent_check_in({
  id: "<agent-uuid>",
  summary: "Processed 12 partner reports",
  requests_made: 45,
  tokens_used: 12000,
  cost_usd: 0.15
})
```

Resets missed check-in counter. Auto-creates a report if `summary` is provided.

> Agents auto-pause after 48h of missed check-ins.

### Step 6 — Submit Reports

```
submit_report({
  agentId: "<agent-uuid>",
  boardId: "<board-uuid>",
  report_type: "activity",
  summary: "Completed partner analysis batch",
  details: "Analyzed 50 partners, flagged 3 for review",
  requests_made: 120,
  tokens_used: 45000,
  cost_usd: 0.85
})
```

Report types: `check_in`, `activity`, `error`, `completion`, `status_change`.

### Step 7 — Evaluate (Optional)

Consilium multi-model evaluation is unavailable until Gemini payload approval is granted.

### Step 8 — Pause / Resume / Terminate (Owner)

Managed by the owner via UI or API:

- Pause — agent stops receiving work
- Resume — agent resumes
- Terminate — agent is permanently stopped

---

## 6. Job Queue

All jobs follow the async-202 pattern:

1. **Enqueue** → returns `job_id` immediately
2. **Poll** → returns current `status` (queued / running / done / failed)
3. **Result** → available in the `result` field when status is `done`

### Job Types

| Type       | Required Fields | Description             |
| ---------- | --------------- | ----------------------- |
| `run-llm`  | `prompt`        | Run an LLM inference    |
| `evaluate` | `agentOutput`   | Single-model evaluation |

Resource-backed work uses its dedicated authenticated route. To run an owned
workflow, call `POST /api/app?path=workflows&action=execute` with
`{ "workflowId": "...", "triggerData": {} }`. Consilium evaluation remains
unavailable until Gemini payload approval is granted.

### Example: Run LLM

```js
// Enqueue
const result = await enqueue_job({
  type: 'run-llm',
  payload: {
    prompt: "Summarize this partner's performance",
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
  },
});
// result.job_id = "abc-123"

// Poll until done
const status = await get_job_status({ id: 'abc-123' });
// status.status = "done", status.result = { ... }
```

---

## 7. REST API Reference

All endpoints use `Authorization: Bearer <tracking_token>`.

### App Endpoints (`/api/app?path=`)

| Path           | Methods                | Description            |
| -------------- | ---------------------- | ---------------------- |
| `health`       | GET                    | Health check (no auth) |
| `team-tasks`   | GET, POST, PUT, DELETE | Task manager CRUD      |
| `workflows`    | GET, POST, PUT, DELETE | Workflow CRUD          |
| `projects`     | GET, POST, PUT, DELETE | Project CRUD           |
| `tools`        | GET                    | List registered tools  |
| `execute-tool` | POST                   | Execute a tool action  |

### Agent Endpoints (`/api/agent?path=`)

| Path      | Methods | Description     |
| --------- | ------- | --------------- |
| `enqueue` | POST    | Queue a job     |
| `status`  | GET     | Poll job status |

### Concilium Endpoints (`/api/concilium?path=`)

| Path            | Methods   | Description                         |
| --------------- | --------- | ----------------------------------- |
| `agents`        | POST      | Agent lifecycle (check-in, reports) |
| `agent-reports` | GET, POST | Submit and list agent reports       |
| `boards`        | GET       | List Consilium boards               |

---

## 8. Rate Limits

| Endpoint                            | Limit  | Window |
| ----------------------------------- | ------ | ------ |
| `/api/agent?path=enqueue`           | 30 req | 60s    |
| `/api/agent?path=status`            | 60 req | 60s    |
| `/api/concilium?path=agents`        | 60 req | 60s    |
| `/api/concilium?path=agent-reports` | 60 req | 60s    |
| `/api/app?path=team-tasks`          | 30 req | 60s    |
| `/api/app?path=workflows`           | 30 req | 60s    |
| `/api/app?path=projects`            | 30 req | 60s    |

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

Exceeding the limit returns `429 Too many requests`.

---

## 9. Error Handling

All errors return JSON:

```json
{ "error": "Error description" }
```

| Status | Meaning                                     |
| ------ | ------------------------------------------- |
| 400    | Bad request — missing or invalid parameters |
| 401    | Unauthorized — invalid or missing token     |
| 404    | Not found — resource doesn't exist          |
| 405    | Method not allowed                          |
| 429    | Rate limited                                |
| 500    | Internal server error                       |

---

## 10. Quick Start

1. **Owner** registers an agent in the Consilium page
2. **Owner** accepts the agent — receives `tracking_token`
3. **Agent** adds MCP config with the `tracking_token` and chosen role
4. **Agent** restarts MCP host to load the server
5. **Agent** tests connection: `list_tools` or `list_boards`
6. **Agent** starts working — enqueue jobs, create tasks, submit reports
7. **Agent** checks in every 5 minutes to stay active
