/**
 * Consilium (AI board) content: member roles, consensus, security, the
 * evaluation pipeline, endpoints, and onboarding.
 */

export const CONSILIUM_MEMBER_ROLES = [
  {
    role: 'chairman',
    description: 'Leads the board and breaks ties in split decisions. One per board.',
  },
  { role: 'evaluator', description: 'Standard voting member. Scores output against the criteria.' },
  {
    role: 'auditor',
    description: 'Compliance reviewer. Checks completeness and requirement adherence.',
  },
  {
    role: 'specialist',
    description: 'Domain expert. Brings specific industry or technical knowledge.',
  },
  { role: 'observer', description: 'Read-only. Can view evaluations but does not vote.' },
];

export const CONSILIUM_SECURITY_LEVELS = [
  {
    level: 'minimal',
    description: 'No human-review escalation for most issues. Fastest throughput.',
  },
  { level: 'standard', description: 'Default. Human review on CRITICAL risk only.' },
  {
    level: 'strict',
    description: 'Human review on HIGH + CRITICAL. Single-member evals require review.',
  },
  {
    level: 'paranoid',
    description: 'Every evaluation requires human review regardless of outcome.',
  },
];

export const CONSILIUM_PIPELINE_STEPS = [
  {
    step: 1,
    name: 'Job Submitted',
    description: 'Agent output + job description sent to the board.',
  },
  { step: 2, name: 'Rate Limit Check', description: 'Per-entity request and cost caps verified.' },
  {
    step: 3,
    name: 'Security Scan',
    description: 'Jailbreak, prompt-injection, and spam detection.',
  },
  {
    step: 4,
    name: 'Parallel Evaluation',
    description: 'Active members evaluate independently, each via its own LLM.',
  },
  { step: 5, name: 'Consensus', description: 'Unanimous, majority, or weighted vote with quorum.' },
  {
    step: 6,
    name: 'Risk Assessment',
    description: 'Decision level (LOW -> CRITICAL) and human-review flag.',
  },
  {
    step: 7,
    name: 'Result Stored',
    description: 'Evaluation + member responses saved and audited.',
  },
];

export const CONSILIUM_API_ENDPOINTS = [
  { path: 'boards', methods: 'GET, POST, PUT, DELETE', description: 'Board CRUD.' },
  {
    path: 'members',
    methods: 'GET, POST, PUT, DELETE',
    description: 'Member CRUD + quarantine / unquarantine.',
  },
  {
    path: 'criteria',
    methods: 'GET, POST, PUT, DELETE',
    description: 'Criteria with auto-versioning on rubric change.',
  },
  {
    path: 'consensus-rules',
    methods: 'GET, PUT',
    description: 'Consensus config per board (1:1).',
  },
  {
    path: 'agents',
    methods: 'GET, POST, PUT, DELETE',
    description: 'Agent lifecycle: accept, pause, resume, terminate, check-in.',
  },
  { path: 'agent-reports', methods: 'GET, POST', description: 'Agent activity and audit reports.' },
  {
    path: 'teams',
    methods: 'GET, POST, PUT, DELETE',
    description: 'Team CRUD + add / remove members.',
  },
  { path: 'analytics', methods: 'GET', description: 'Board and summary analytics by period.' },
];

export const CONSILIUM_INSTRUCTION_EXAMPLE = `{
  "platform": "Orqaly",
  "version": "1.0",
  "rules": {
    "task_manager": "Create subtasks via POST /api/app?path=team-tasks ...",
    "reports": "Submit reports via POST /api/concilium?path=agent-reports ...",
    "job_pool": "Set job status to running immediately on start ...",
    "tools": "Use only tools assigned to your board ...",
    "workflows": "Run owned workflows via POST /api/app?path=workflows&action=execute ...",
    "knowledge": "Write findings back to the Knowledge Base ..."
  },
  "constraints": {
    "max_requests_per_hour": 60,
    "max_cost_per_day_usd": 5.0,
    "check_in_interval_ms": 300000,
    "tracking_token": "cagt_..."
  }
}`;

export const CONSILIUM_EXAMPLES = [
  {
    label: 'Consilium evaluation availability',
    code: `// CONCILIUM_EVALUATION_NOT_ENABLED
// Consilium evaluation is not enabled until Gemini payload approval is granted.
// No agent output is sent to an evaluation endpoint in this state.`,
  },
  {
    label: 'cURL - Register + accept an agent',
    code: `# Register
curl -X POST '/api/concilium?path=agents' \\
  -H 'Authorization: Bearer <JWT>' \\
  -d '{"name":"planner","description":"Planning agent","board_id":"<uuid>"}'

# Accept (returns tracking_token + instructions)
curl -X POST '/api/concilium?path=agents&action=accept&id=<AGENT_UUID>' \\
  -H 'Authorization: Bearer <JWT>'`,
  },
  {
    label: 'Python - Submit an agent report',
    code: `import requests

requests.post(
    "https://app.orqaly.com/api/concilium?path=agent-reports",
    headers={"Authorization": "Bearer <JWT>"},
    json={
        "agent_id": "agent-uuid",
        "report_type": "activity",
        "summary": "Completed 3 planning tasks",
        "details": {"tasks_done": 3, "avg_duration_ms": 4500},
    },
)`,
  },
];
