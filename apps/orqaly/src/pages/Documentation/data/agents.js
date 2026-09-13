/**
 * External AI-agent integration content. Agents connect over MCP with a
 * platform-issued tracking token, enqueue jobs, and stream reports back.
 */

export const AGENT_LIFECYCLE_STEPS = [
  {
    step: 1,
    name: 'Register',
    endpoint: 'POST /api/concilium?path=agents',
    description: 'Create the agent with name, description, and board_id. Status -> pending.',
  },
  {
    step: 2,
    name: 'Accept',
    endpoint: 'POST ...path=agents&action=accept&id=<uuid>',
    description:
      'Approve the agent. Returns a tracking_token + instruction packet. Status -> accepted.',
  },
  {
    step: 3,
    name: 'Connect (MCP)',
    endpoint: 'stdio MCP server',
    description: 'Point an MCP client at the Orqaly MCP server using the token and role=agent.',
  },
  {
    step: 4,
    name: 'Work',
    endpoint: 'POST /api/agent?path=enqueue',
    description: 'Run public LLM generation or output-evaluation jobs and poll status.',
  },
  {
    step: 5,
    name: 'Check-in',
    endpoint: 'POST ...action=check-in&id=<uuid>',
    description: 'Heartbeat every ~5 min with summary, tokens_used, and cost_usd.',
  },
  {
    step: 6,
    name: 'Report',
    endpoint: 'POST /api/concilium?path=agent-reports',
    description: 'Submit activity, completion, or error reports with metrics.',
  },
  {
    step: 7,
    name: 'Evaluate',
    endpoint: 'POST /api/agent?path=enqueue (evaluate)',
    description: 'Run a public criteria-based output evaluation.',
  },
];

export const AGENT_DISCOVERY = [
  {
    path: 'GET /api/ops?path=data-topology',
    desc: 'System architecture map (pages, APIs, tables, services).',
  },
  {
    path: 'GET /api/concilium?path=boards',
    desc: 'Available boards the agent can be evaluated by.',
  },
  { path: 'GET /api/agent?path=status&id=<job_id>', desc: 'Poll the result of a queued job.' },
];

export const MCP_AGENT_CONFIG = `{
  "mcpServers": {
    "orqaly-agent": {
      "command": "node",
      "args": ["/path/to/orqaly/mcp/index.js"],
      "env": {
        "ORQALY_BASE_URL": "https://app.orqaly.com",
        "ORQALY_TOKEN": "cagt_your_tracking_token",
        "ORQALY_ROLE": "agent"
      }
    }
  }
}`;

export const MCP_AGENT_TOOLS = [
  { name: 'agent_check_in', description: 'Heartbeat with optional metrics.' },
  { name: 'submit_report', description: 'Submit an activity, completion, or error report.' },
  { name: 'manage_task', description: 'List, create, update, or delete team tasks.' },
  { name: 'manage_workflow', description: 'Create, list, update, delete, or trigger workflows.' },
  { name: 'enqueue_job', description: 'Run a public LLM generation or output-evaluation job.' },
  { name: 'get_job_status', description: 'Poll a job result.' },
  { name: 'search_knowledge', description: 'Semantic search over the Knowledge Base.' },
  { name: 'list_boards', description: 'Discover evaluation boards.' },
];

export const AGENT_ROLE_PERMISSIONS = [
  {
    page: 'Requests (goals)',
    access: 'Full',
    details: 'Create goals, run the pipeline, monitor tasks.',
  },
  { page: 'Workflow', access: 'Full', details: 'View, create, and trigger workflows.' },
  { page: 'Task Manager', access: 'Full', details: 'Table, kanban, and roadmap task operations.' },
  { page: 'Knowledge Base', access: 'Read/Write', details: 'Search and contribute documents.' },
  { page: 'Communicator', access: 'Write', details: 'Post to rooms and the activity feed.' },
  { page: 'Reports', access: 'Read', details: 'View charts and KPIs (no export).' },
];

export const AGENT_ROLE_DENIED = [
  'API Keys',
  'Permissions',
  'Settings',
  'Finances',
  'Organizations',
];

export const AGENT_EXAMPLES = [
  {
    platform: 'MCP',
    label: 'Model Context Protocol',
    code: `// After accepting the agent you receive a tracking_token (cagt_...).
// Add the Orqaly MCP server to your client config, then call its tools:
{
  "tool": "enqueue_job",
  "params": {
    "type": "evaluate",
    "payload": {
      "jobDescription": "Draft the Q3 go-to-market plan",
      "agentOutput": "...",
      "criteria": ["specific", "feasible", "evidence-backed"]
    }
  }
}`,
  },
  {
    platform: 'Python',
    label: 'Python (requests)',
    code: `import requests, time

BASE = "https://app.orqaly.com"
H = {"Authorization": "Bearer <JWT>", "Content-Type": "application/json"}

# Enqueue a job
job = requests.post(f"{BASE}/api/agent?path=enqueue", headers=H,
    json={"type": "run-llm", "prompt": "Summarize the latest goal run"}).json()

# Poll until done
while True:
    s = requests.get(f"{BASE}/api/agent?path=status&id={job['job_id']}", headers=H).json()
    if s["status"] in ("done", "failed"):
        break
    time.sleep(2)
print(s)`,
  },
  {
    platform: 'JS',
    label: 'JavaScript / Node.js',
    code: `const BASE = 'https://app.orqaly.com';
const H = { Authorization: 'Bearer <JWT>', 'Content-Type': 'application/json' };

const { job_id } = await fetch(\`\${BASE}/api/app?path=workflows&action=execute\`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ workflowId: 'wf-123', triggerData: {} }),
}).then((r) => r.json());

const status = await fetch(\`\${BASE}/api/agent?path=status&id=\${job_id}\`, {
  headers: H,
}).then((r) => r.json());`,
  },
  {
    platform: 'cURL',
    label: 'cURL / Shell',
    code: `# Submit an agent report
curl -X POST "https://app.orqaly.com/api/concilium?path=agent-reports" \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id":"<uuid>","report_type":"completion","summary":"Done 3 tasks"}'`,
  },
  {
    platform: 'Automations',
    label: 'n8n / Make / Zapier',
    code: `n8n:    HTTP Request -> POST -> /api/agent?path=enqueue + Bearer header
Make:   HTTP > Make a request -> POST -> Raw JSON body
Zapier: Webhooks by Zapier -> POST -> Authorization header`,
  },
];
