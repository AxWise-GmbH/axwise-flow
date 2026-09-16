# Orqaly Integration Guide

> Version 1.0 | Base URL: `https://orchestratori.vercel.app`

---

## Part 1: AI Agent Integration

### Overview

AI agents connect to Orqaly via REST APIs to execute workflows, manage tasks, enqueue jobs, and ingest report data. Agents operate under the **Agent** role (`role-agent`) which grants scoped access to operational features while blocking sensitive areas like finances, permissions, and settings.

### Authentication

All authenticated endpoints require a Supabase JWT Bearer token:

```
Authorization: Bearer <supabase_access_token>
```

For report ingestion, a session token (24h TTL) is used instead:

```
x-report-token: <session_token>
```

### Agent Role Permissions

The Agent role grants access to:

| Page | Access Level | Details |
|------|-------------|---------|
| Dashboard | Read | KPIs, health, portfolio, geo, trends, funnel |
| Workflow | Full | View, create, edit canvas, templates |
| Tasks | Full | Table, kanban, roadmap, edit task |
| Projects | Create/Edit | No delete |
| Agent Hub | Full | Overview, registry, assignments, KPIs |
| Job Pool | Full | All job operations |
| AI Recommend | Full | Metrics, knowledge, notifications, run cycle |
| Reports | Read | View charts, KPIs, trends (no export/custom) |
| Strategy Center | Partial | Executive summary, AI rec, scenarios only |

The Agent role **denies** access to:
- Partners / Partner Detail
- Finances
- Campaigns
- Settings
- Activity Log
- Documentation
- Permissions / Roles
- Data

### Agent Endpoints

#### 1. Enqueue a Job

```
POST /api/agent/enqueue
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "run-llm",          // public types: run-llm | evaluate
  "prompt": "Analyze Q4 data",
  "model": "gpt-4"
}
```

Response (202 Accepted):
```json
{
  "job_id": "uuid",
  "status": "queued",
  "created_at": "2026-03-03T..."
}
```

Rate limit: 30 enqueues/min per user.

#### 2. Poll Job Status

```
GET /api/agent/status?id=<job_id>
Authorization: Bearer <token>
```

Response:
```json
{
  "job_id": "uuid",
  "status": "done",
  "result": { ... },
  "created_at": "...",
  "updated_at": "..."
}
```

Status values: `queued` | `processing` | `done` | `failed`

#### 3. Report Ingestion (Session-Based)

**Step 1 - Create session:**
```
POST /api/report-ingest
Content-Type: application/json

{ "action": "create-session" }
```
Returns: `{ token, webhookUrl, expiresIn: "24h" }`

**Step 2 - Send data:**
```
POST /api/report-ingest
Content-Type: application/json
x-report-token: <token>

{
  "kpis": [{ "label": "Revenue", "value": 125000, "format": "currency" }],
  "trends": [{ "month": "Jan", "revenue": 40000 }],
  "_meta": { "name": "Agent Report", "category": "executive" }
}
```

**Step 3 - Poll results:**
```
GET /api/report-ingest?token=<token>&after=<ISO-timestamp>
```

#### 4. Discovery

```
GET /api/data-topology
```
Returns full architecture map (pages, APIs, tables, services, edges). No auth required.

### Registering an Agent with the Agent Role

1. Go to **Agent Hub** > click **New**
2. Fill in agent details (name, connection type, capabilities)
3. System Role defaults to **Agent** - this binds RBAC permissions
4. Save - the agent is now registered with scoped access

Or programmatically via the system agents service:
```javascript
import { createSystemAgent } from './services/systemAgentsService';

await createSystemAgent({
  name: 'My AI Agent',
  type: 'openai',           // custom | claw | openai | openai_compatible
  roleId: 'role-agent',     // binds to Agent role
  agentHubId: 'hub-agent-id' // links to Hub registry entry
});
```

### Audit Attribution

All agent actions are tracked in the audit log with agent attribution:
```javascript
import { buildAgentMeta } from './services/auditLogBackend';

logAction({
  action: 'Workflow executed',
  entity: 'Workflow',
  entityId: 'wf-123',
  meta: {
    ...buildAgentMeta({ id: 'agent-001', name: 'My Agent' }),
    // Records actorType: 'agent', agentId, agentName
  }
});
```

### Code Examples

**Python:**
```python
import requests

BASE = "https://orchestratori.vercel.app"
TOKEN = "<supabase_access_token>"
headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Enqueue a job
job = requests.post(f"{BASE}/api/agent/enqueue",
    headers=headers,
    json={"type": "run-llm", "prompt": "Summarize Q4 revenue"}).json()

# Poll until done
import time
while True:
    status = requests.get(f"{BASE}/api/agent/status?id={job['job_id']}",
        headers=headers).json()
    if status["status"] in ("done", "failed"):
        break
    time.sleep(2)

print(status["result"])
```

**JavaScript:**
```javascript
const BASE = 'https://orchestratori.vercel.app';
const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// Enqueue
const { job_id } = await fetch(`${BASE}/api/agent/enqueue`, {
  method: 'POST', headers,
  body: JSON.stringify({ type: 'run-llm', prompt: 'Analyze trends' })
}).then(r => r.json());

// Poll
let result;
while (true) {
  const status = await fetch(`${BASE}/api/agent/status?id=${job_id}`, { headers })
    .then(r => r.json());
  if (status.status === 'done' || status.status === 'failed') {
    result = status;
    break;
  }
  await new Promise(r => setTimeout(r, 2000));
}
```

**cURL:**
```bash
# Enqueue job
curl -X POST https://orchestratori.vercel.app/api/agent/enqueue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"run-llm","prompt":"Summarize data"}'

# Check status
curl https://orchestratori.vercel.app/api/agent/status?id=JOB_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

## Part 2: Tools Integration

### Overview

The **Tools** role (`role-tools`) provides a personal, scoped workspace for external tool integrations. Each tool user gets isolated access to their own workflows, tasks, projects, finances, and data. All activity logs are private to the user.

Tools connect to Orqaly's core solutions via 4 connection types: API, Internal, Webhook, and SDK.

### Tools Role Permissions

| Page | Access Level | Scoping |
|------|-------------|---------|
| Tasks | Full | Personal tasks only |
| Projects | Create/Edit (no delete) | Own projects + marketplace |
| Workflow | Full | Private workflows only |
| Job Pool | Read (metrics + table) | See assigned requests only |
| Finances | Full read | Own financial data only (backup DB) |
| Data | Search only | Personal data only |
| Documentation | Full | - |
| Reports | Read (no export/custom) | Own data only |
| Settings | Profile only | - |
| Activity Log | Full | Own activity only |

**Denied:** Dashboard, Partners, Campaigns, Agents, AI Recommend, Strategy Center, Permissions.

### Connection Types

| Type | Description | Use Case |
|------|------------|----------|
| `api` | REST/GraphQL endpoint | Connect external APIs, SaaS tools |
| `internal` | In-platform module | Built-in platform features |
| `webhook` | Outbound webhook trigger | Event-driven integrations |
| `sdk` | SDK/library integration | Custom code packages |

### Creating a Tool

**Via UI:**
1. Navigate to the platform (your admin must grant access)
2. Register your tool with connection type and endpoint details
3. Test the connection
4. The tool is now available in your personal workspace

**Via API:**
```
POST /api/execute-tool
Authorization: Bearer <token>
Content-Type: application/json

{
  "toolId": "tool-123",
  "payload": {
    "action": "test-connection"
  }
}
```

### Tool Configuration Schema

```json
{
  "name": "My Custom Tool",
  "description": "What this tool does",
  "connectionType": "api",
  "status": "active",

  "url": "https://api.example.com/v1/action",
  "apiKey": "sk-...",
  "apiHeaders": { "X-Custom": "value" },
  "apiMethod": "POST",

  "webhookSecret": "whsec_...",
  "webhookEvents": ["task.created", "workflow.completed"],

  "sdkPackage": "@myorg/tool-sdk",
  "sdkVersion": "^2.0.0",

  "modulePath": "tools/analyzer",
  "entryFunction": "run"
}
```

### Executing a Tool

```
POST /api/execute-tool
Authorization: Bearer <token>
Content-Type: application/json

{
  "toolId": "tool-id-here",
  "payload": {
    "input": "data to process",
    "options": { "format": "json" }
  }
}
```

Response:
```json
{
  "success": true,
  "result": { ... },
  "duration_ms": 1234,
  "execution_id": "exec-uuid"
}
```

Every execution is recorded in `tool_executions` with:
- User ID, tool ID, tool name
- Connection type, request/response summaries
- Status (`success` | `failed`), duration, errors

### Building on Core Solutions

Tools can integrate with these core platform services:

#### Workflow Automation
```javascript
// Start a workflow execution
POST /api/app?path=workflows&action=execute
{ "workflowId": "wf-123", "triggerData": {} }
```

#### Task Management
Create and manage tasks through the platform UI or programmatically. Tasks support table view, kanban, and roadmap visualization.

#### Project Management
Create projects with linked workflows, partners, and teams. Access the project marketplace to discover and fork existing templates.

#### Data & Search
Query your personal data scope via the Data page search. Results are filtered to your user context.

#### Reports
View KPI cards, trend charts, breakdowns, and leaderboards scoped to your activity and data.

### Code Examples

**Python - Execute a Tool:**
```python
import requests

BASE = "https://orchestratori.vercel.app"
TOKEN = "<your_token>"

result = requests.post(f"{BASE}/api/execute-tool",
    headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    json={"toolId": "tool-123", "payload": {"input": "analyze this"}}).json()

print(result)
```

**JavaScript - Execute a Tool:**
```javascript
const result = await fetch('https://orchestratori.vercel.app/api/execute-tool', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    toolId: 'tool-123',
    payload: { input: 'analyze this' }
  })
}).then(r => r.json());
```

**cURL - Execute a Tool:**
```bash
curl -X POST https://orchestratori.vercel.app/api/execute-tool \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"toolId":"tool-123","payload":{"input":"data"}}'
```

---

## API Reference Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/agent/enqueue` | POST | Bearer | Queue public LLM/evaluation jobs |
| `/api/agent/status` | GET | Bearer | Poll job status |
| `/api/agent/process-next` | POST | Bearer | Worker job processor |
| `/api/report-ingest` | POST | Token | Report data ingestion |
| `/api/execute-tool` | POST | Bearer | Execute a registered tool |
| `/api/data-topology` | GET | None | Architecture discovery |
| `/api/reports` | GET | Bearer | Aggregated report data |
| `/api/health` | GET | None | System health check |
| `/api/transcribe` | POST | Bearer | Audio transcription |
| `/api/send-email` | POST | Bearer | Send email via Resend |
| `/api/backup-database` | POST | Bearer | Database backup |

## Role Comparison

| Feature | Agent Role | Tools Role |
|---------|-----------|------------|
| Workflows | Full (shared) | Full (private/scoped) |
| Tasks | Full | Full (personal) |
| Projects | Create/Edit | Create/Edit (own + marketplace) |
| Job Pool | Full | Read only (requests) |
| Finances | Denied | Scoped to user |
| Data | Denied | Personal search |
| Reports | Read | Read (own data) |
| Documentation | Denied | Full |
| Activity Log | Denied | Own activity |
| Agent Hub | Full | Denied |
| AI Recommend | Full | Denied |
| Dashboard | Read | Denied |

---

*Generated for Orqaly v1.0 | https://orchestratori.vercel.app*
