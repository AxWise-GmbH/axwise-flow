/**
 * API surface. Every backend route is a Vercel serverless dispatcher that routes
 * by a `?path=<name>` query parameter to a handler module. Most dispatchers do
 * NOT verify auth themselves - each handler enforces the shared pattern below.
 */

export const API_PATTERN_STEPS = [
  {
    step: '1',
    title: 'CORS + security headers',
    detail: 'cors(res, req) runs first; OPTIONS returns 200. Security headers are applied globally.',
  },
  {
    step: '2',
    title: 'Verify the Supabase token',
    detail:
      'getBearerToken(req) -> verifySupabaseToken(token). No user -> 401. Frontend never talks to the DB directly.',
  },
  {
    step: '3',
    title: 'Rate limit',
    detail:
      'checkRateLimit({ key: getRateLimitIdentifier(req, user), limit, windowMs }) + applyRateLimitHeaders. Blocked -> 429.',
  },
  {
    step: '4',
    title: 'Validate the body',
    detail: 'Parse the request body with a Zod schema from api/_lib/validate.js. Invalid -> 400.',
  },
  {
    step: '5',
    title: 'Run + isolate',
    detail:
      'Query via buildSupabaseAdminClient(), always filtered by user.id. Wrap in try/catch -> handleApiError(res, err, name).',
  },
];

export const DISPATCHERS = [
  {
    name: 'app',
    route: '/api/app?path=<name>',
    auth: 'JWT per handler',
    desc: 'General app surface (~100 handlers): auth, email, notifications, KB, workflows, goals, marketplace, assistants, orgs, storage, financials.',
    handlers: [
      'goals',
      'knowledge-base',
      'workflows',
      'marketplace',
      'assistants',
      'assistant-chat',
      'organizations',
      'notifications',
      'user-api-keys',
      'kb-connections',
      'stripe-connect',
      'dashboards',
    ],
  },
  {
    name: 'agent',
    route: '/api/agent?path=<name>',
    auth: 'JWT or WORKER_SECRET',
    desc: 'Agent job queue. Enqueue returns 202 + job_id; process-next is the worker (Bearer WORKER_SECRET); cron jobs heal goals and optimize prompts.',
    handlers: [
      'enqueue',
      'status',
      'process-next',
      'webhook-process',
      'heal-goal',
      'optimize-prompts',
      'research-github',
    ],
  },
  {
    name: 'concilium',
    route: '/api/concilium?path=<name>',
    auth: 'JWT per handler',
    desc: 'AI board governance: boards, members, criteria, consensus, agents, teams, blueprints, supervisor, and topology.',
    handlers: [
      'boards',
      'members',
      'criteria',
      'consensus-rules',
      'agents',
      'agent-reports',
      'teams',
      'analytics',
      'agent-blueprints',
      'supervisor',
    ],
  },
  {
    name: 'communicator',
    route: '/api/communicator?path=<name>',
    auth: 'JWT per handler',
    desc: 'Communication hub: agent rooms, controller commands, Consilium log, webhooks, activity feed, and Telegram registration.',
    handlers: [
      'agent-room',
      'controller',
      'consilium-log',
      'webhook-receiver',
      'activity-feed',
      'org-communication',
      'link-code',
      'telegram-register',
    ],
  },
  {
    name: 'ops',
    route: '/api/ops?path=<name>',
    auth: 'JWT per handler',
    desc: 'Heavy / long-running operations: topology, reports, report ingest, campaigns, browser tasks, goal traces, and usage analytics.',
    handlers: [
      'data-topology',
      'reports',
      'report-ingest',
      'report-insights',
      'campaigns',
      'browser-task',
      'goal-trace',
      'usage-analytics',
      'usage-directory',
    ],
  },
  {
    name: 'invest',
    route: '/api/invest?path=<name>',
    auth: 'JWT at dispatcher (60/min)',
    desc: 'Investment domain: investors, deals, commitments, pools, and documents. Auth and rate limiting are enforced by the dispatcher itself.',
    handlers: ['investors', 'deals', 'commitments', 'pools', 'documents'],
  },
  {
    name: 'public',
    route: '/api/invest-public · /api/contact',
    auth: 'Public (rate-limited)',
    desc: 'No-auth endpoints. invest-public is GET-only and UUID-gated (30/min); contact is POST-only (5/min). Both are heavily rate limited.',
    handlers: ['invest-public?id=<uuid>', 'contact'],
  },
];

/** A few representative endpoints for a quick reference table. */
export const API_ENDPOINTS = [
  { method: 'GET', path: '/api/app?path=health', auth: 'None', desc: 'Health check', rate: '-' },
  { method: 'POST', path: '/api/app?path=goals', auth: 'Bearer', desc: 'Create / update a goal', rate: '60/min' },
  { method: 'POST', path: '/api/app?path=knowledge-base', auth: 'Bearer', desc: 'Add / search documents (pgvector)', rate: '60/min' },
  { method: 'POST', path: '/api/agent?path=enqueue', auth: 'Bearer', desc: 'Enqueue a job -> 202 + job_id', rate: '60/min' },
  { method: 'GET', path: '/api/agent?path=status', auth: 'Bearer', desc: 'Poll job status by id', rate: '60/min' },
  { method: 'POST', path: '/api/agent?path=process-next', auth: 'WORKER_SECRET', desc: 'Worker: process one queued job', rate: '-' },
  { method: 'GET', path: '/api/concilium?path=boards', auth: 'Bearer', desc: 'List boards + members + rules', rate: '60/min' },
  { method: 'POST', path: '/api/concilium?path=agents', auth: 'Bearer', desc: 'Register a board agent', rate: '60/min' },
  { method: 'GET', path: '/api/communicator?path=activity-feed', auth: 'Bearer', desc: 'Append-only activity feed', rate: '60/min' },
  { method: 'GET', path: '/api/ops?path=usage-analytics', auth: 'Bearer', desc: 'LLM usage + cost analytics', rate: '60/min' },
  { method: 'POST', path: '/api/ops?path=report-ingest', auth: 'Token', desc: 'Webhook report ingest (x-report-token)', rate: '24h TTL' },
  { method: 'GET', path: '/api/invest-public?id=<uuid>', auth: 'None', desc: 'Public, sanitized deal snapshot', rate: '30/min' },
];
