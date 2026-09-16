/**
 * External tools + integrations content. Tools connect to Orqaly core solutions
 * and run inside a scoped, isolated workspace.
 */

export const TOOLS_CONNECTION_TYPES = [
  {
    type: 'api',
    label: 'API',
    desc: 'REST or GraphQL endpoint - connect external SaaS tools and services.',
  },
  {
    type: 'internal',
    label: 'Internal',
    desc: 'In-platform module - built-in features and analyzers.',
  },
  {
    type: 'webhook',
    label: 'Webhook',
    desc: 'Outbound trigger for event-driven integrations (task.created, goal.completed).',
  },
  {
    type: 'sdk',
    label: 'SDK',
    desc: 'Library integration - custom code packages (@myorg/tool-sdk).',
  },
  {
    type: 'mcp',
    label: 'MCP',
    desc: 'Model Context Protocol server exposing tools to agents and clients.',
  },
];

export const TOOLS_CORE_SOLUTIONS = [
  {
    solution: 'Goal Orchestration',
    desc: 'Hand a goal to the pipeline: feasibility, planning, team formation, execution, evaluation.',
    endpoint: 'POST /api/app?path=goals&op=create',
  },
  {
    solution: 'Workflow Automation',
    desc: 'Build and run visual workflows; connect nodes (LLM, tools, HTTP, approvals, sub-agents).',
    endpoint: 'POST /api/app?path=workflows&action=execute',
  },
  {
    solution: 'Job Queue',
    desc: 'Run public LLM generation/evaluation jobs and poll results.',
    endpoint: 'POST /api/agent?path=enqueue · GET /api/agent?path=status',
  },
  {
    solution: 'Knowledge Base',
    desc: 'Add and semantically search documents (pgvector) that agents read and write.',
    endpoint: 'POST /api/app?path=knowledge-base',
  },
  {
    solution: 'Task Management',
    desc: 'Team and human task boards with assignments, priorities, and approvals.',
    endpoint: 'POST /api/app?path=team-tasks',
  },
  {
    solution: 'Reports & Usage',
    desc: 'KPI cards, trend charts, and LLM cost analytics scoped to your activity.',
    endpoint: 'GET /api/ops?path=reports · usage-analytics',
  },
];

export const TOOLS_ROLE_PERMISSIONS = [
  { page: 'Workflow', access: 'Full', scoping: 'Private workflows only.' },
  { page: 'Task Manager', access: 'Full', scoping: 'Personal + assigned tasks.' },
  { page: 'Knowledge Base', access: 'Read/Write', scoping: 'Own documents and collections.' },
  { page: 'Requests (goals)', access: 'Read', scoping: 'See assigned goals only.' },
  { page: 'Reports', access: 'Read', scoping: 'Own data only (no export).' },
  { page: 'Activity Log', access: 'Read', scoping: 'Own activity only.' },
];

export const TOOLS_ROLE_DENIED = [
  'API Keys',
  'Permissions',
  'Organizations',
  'Finances',
  'Consilium admin',
];

export const MCP_TOOL_CONFIG = `{
  "mcpServers": {
    "orqaly-tool": {
      "command": "node",
      "args": ["/path/to/orqaly/mcp/index.js"],
      "env": {
        "ORQALY_BASE_URL": "https://app.orqaly.com",
        "ORQALY_TOKEN": "your-supabase-jwt",
        "ORQALY_ROLE": "tool"
      }
    }
  }
}`;

export const MCP_TOOL_TOOLS = [
  { name: 'execute_tool', description: 'Execute a registered tool action.' },
  { name: 'list_tools', description: 'Discover available tools.' },
  { name: 'enqueue_job', description: 'Run a public LLM generation or output-evaluation job.' },
  { name: 'get_job_status', description: 'Poll a job result.' },
];

export const TOOLS_EXAMPLES = [
  {
    platform: 'Python',
    label: 'Python (requests)',
    code: `import requests

BASE = "https://app.orqaly.com"
H = {"Authorization": "Bearer <JWT>", "Content-Type": "application/json"}

# Enqueue a workflow execution
job = requests.post(f"{BASE}/api/app?path=workflows&action=execute", headers=H,
    json={"workflowId": "wf-456", "triggerData": {}}).json()
print(job["job_id"])`,
  },
  {
    platform: 'JavaScript',
    label: 'JavaScript / Node.js',
    code: `const BASE = 'https://app.orqaly.com';
const H = { Authorization: 'Bearer <JWT>', 'Content-Type': 'application/json' };

const doc = await fetch(\`\${BASE}/api/app?path=knowledge-base\`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ action: 'search', query: 'pricing strategy' }),
}).then((r) => r.json());`,
  },
  {
    platform: 'cURL',
    label: 'cURL / Shell',
    code: `curl -X POST "https://app.orqaly.com/api/agent?path=enqueue" \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"run-llm","prompt":"Draft a launch checklist"}'`,
  },
];
