/**
 * Pre-built workflow templates for quick-start.
 * Each template has nodes and edges pre-configured for React Flow.
 */

export const TEMPLATE_CATEGORIES = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'lead-gen', label: 'Lead Generation' },
  { id: 'automation', label: 'Automation' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'architecture', label: 'Architecture' },
];

function makeNode(id, blockId, label, x, y, config = {}) {
  return {
    id,
    type: 'workflow',
    position: { x, y },
    data: { blockId, label, config },
  };
}

function makeEdge(source, target) {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    style: { strokeWidth: 2 },
  };
}

export const WORKFLOW_TEMPLATES = [
  {
    id: 'tpl-lead-gen-funnel',
    name: 'Lead Generation Funnel',
    description:
      'Capture leads from a landing page, attach a campaign for tracking, then send an SMS and email follow-up automatically.',
    category: 'lead-gen',
    blockCount: 5,
    nodes: [
      makeNode('n1', 'landing-page', 'Landing page', 0, 80),
      makeNode('n2', 'campaign-attach', 'Campaign Attach', 260, 80),
      makeNode('n3', 'sms-sendout', 'SMS Send-out', 520, 20),
      makeNode('n4', 'email-sendout', 'E-mail Send-out', 520, 140),
      makeNode('n5', 'actions', 'Actions', 780, 80),
    ],
    edges: [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
      makeEdge('n2', 'n4'),
      makeEdge('n3', 'n5'),
      makeEdge('n4', 'n5'),
    ],
  },
  {
    id: 'tpl-email-campaign',
    name: 'Email Marketing Campaign',
    description:
      'Schedule an email blast, send it through your email provider, and log a report to the system automatically.',
    category: 'marketing',
    blockCount: 3,
    nodes: [
      makeNode('n1', 'schedule', 'Schedule', 0, 80),
      makeNode('n2', 'email-sendout', 'E-mail Send-out', 260, 80),
      makeNode('n3', 'send-report-to-system', 'Send report to system', 520, 80),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
  },
  {
    id: 'tpl-sms-followup',
    name: 'SMS Follow-up Sequence',
    description:
      'Land visitors on a page, wait on a schedule, then send a timed SMS follow-up with a postback action.',
    category: 'marketing',
    blockCount: 4,
    nodes: [
      makeNode('n1', 'landing-page', 'Landing page', 0, 80),
      makeNode('n2', 'schedule', 'Schedule', 260, 80),
      makeNode('n3', 'sms-sendout', 'SMS Send-out', 520, 80),
      makeNode('n4', 'actions', 'Actions', 780, 80),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3'), makeEdge('n3', 'n4')],
  },
  {
    id: 'tpl-multi-channel',
    name: 'Multi-Channel Outreach',
    description:
      'Full-funnel flow: landing page, campaign tracking, SMS + email outreach, database storage, and a system report.',
    category: 'marketing',
    blockCount: 6,
    nodes: [
      makeNode('n1', 'landing-page', 'Landing page', 0, 100),
      makeNode('n2', 'campaign-attach', 'Campaign Attach', 260, 100),
      makeNode('n3', 'sms-sendout', 'SMS Send-out', 520, 20),
      makeNode('n4', 'email-sendout', 'E-mail Send-out', 520, 180),
      makeNode('n5', 'database', 'Database', 780, 100),
      makeNode('n6', 'send-report-to-system', 'Send report to system', 1040, 100),
    ],
    edges: [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
      makeEdge('n2', 'n4'),
      makeEdge('n3', 'n5'),
      makeEdge('n4', 'n5'),
      makeEdge('n5', 'n6'),
    ],
  },
  {
    id: 'tpl-postback-automation',
    name: 'Postback Automation',
    description:
      'Attach a campaign, run actions on postback data (webhook, CRM, etc.), report to system, and store in the partner database.',
    category: 'automation',
    blockCount: 4,
    nodes: [
      makeNode('n1', 'campaign-attach', 'Campaign Attach', 0, 80),
      makeNode('n2', 'actions', 'Actions', 260, 80),
      makeNode('n3', 'send-report-to-system', 'Send report to system', 520, 20),
      makeNode('n4', 'database', 'Database', 520, 140),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3'), makeEdge('n2', 'n4')],
  },
  {
    id: 'tpl-partner-db-sync',
    name: 'Partner Database Sync',
    description:
      'Pull from the partner database, generate a system report, and trigger follow-up actions automatically.',
    category: 'reporting',
    blockCount: 3,
    nodes: [
      makeNode('n1', 'database', 'Database', 0, 80),
      makeNode('n2', 'send-report-to-system', 'Send report to system', 260, 80),
      makeNode('n3', 'actions', 'Actions', 520, 80),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
  },
  {
    id: 'tpl-scheduled-blast',
    name: 'Scheduled SMS + Email Blast',
    description:
      'Set a date/time, then blast both SMS and email simultaneously. Great for product launches and announcements.',
    category: 'marketing',
    blockCount: 4,
    nodes: [
      makeNode('n1', 'schedule', 'Schedule', 0, 100),
      makeNode('n2', 'sms-sendout', 'SMS Send-out', 280, 20),
      makeNode('n3', 'email-sendout', 'E-mail Send-out', 280, 180),
      makeNode('n4', 'send-report-to-system', 'Send report to system', 560, 100),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n1', 'n3'), makeEdge('n2', 'n4'), makeEdge('n3', 'n4')],
  },
  {
    id: 'tpl-api-request',
    name: 'API Request',
    description:
      'How API requests flow: Browser → Vercel → App/Ops cores → Handlers → Supabase, Resend, Keitaro. Shows real connections.',
    category: 'architecture',
    blockCount: 9,
    nodes: [
      makeNode('n1', 'landing-page', 'Browser', 0, 160, {
        description: 'Client (React SPA) sends fetch to /api/*',
      }),
      makeNode('n2', 'traffic-source', 'Vercel', 220, 160, {
        description: 'Rewrites route to api/app.js or api/ops.js',
      }),
      makeNode('n3', 'actions', 'App Core', 440, 40, {
        description: 'api/app.js – app routes (health, workflows, campaigns, etc.)',
      }),
      makeNode('n4', 'actions', 'Ops Core', 440, 280, {
        description: 'api/ops.js – ops routes (transcribe, backup, long-running)',
      }),
      makeNode('n5', 'actions', 'Handlers', 660, 160, {
        description: 'lib/api-handlers & lib/ops-handlers – route handlers',
      }),
      makeNode('n6', 'database', 'Supabase', 880, 20, {
        description: 'Auth, DB, workflows, storage',
      }),
      makeNode('n7', 'email-sendout', 'Resend', 880, 120, {
        description: 'Transactional email',
      }),
      makeNode('n8', 'campaign-attach', 'Keitaro', 880, 220, {
        description: 'Traffic / affiliate tracking',
      }),
      makeNode('n9', 'send-report-to-system', 'Report Ingest', 880, 300, {
        description: 'External report ingestion',
      }),
    ],
    edges: [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
      makeEdge('n2', 'n4'),
      makeEdge('n3', 'n5'),
      makeEdge('n4', 'n5'),
      makeEdge('n5', 'n6'),
      makeEdge('n5', 'n7'),
      makeEdge('n5', 'n8'),
      makeEdge('n5', 'n9'),
    ],
  },
  {
    id: 'tpl-agent-async-core',
    name: 'Agent Async Core',
    description:
      'AI/agent and multi-API flows: request hits Agent core → enqueue job → 202; worker runs with long timeout → AI and external APIs. No 10s limit.',
    category: 'architecture',
    blockCount: 9,
    nodes: [
      makeNode('n1', 'landing-page', 'Browser', 0, 160, {
        description: 'Client sends request for AI/agent or multi-API flow',
      }),
      makeNode('n2', 'traffic-source', 'Vercel', 200, 160, {
        description: 'Routes /api/agent/* to api/agent.js',
      }),
      makeNode('n3', 'actions', 'App Core', 400, 40, {
        description: 'Fast routes – unchanged',
      }),
      makeNode('n4', 'actions', 'Ops Core', 400, 280, {
        description: 'Heavy ops – unchanged',
      }),
      makeNode('n5', 'actions', 'Agent Core', 400, 160, {
        description: 'Validate auth, enqueue job, return 202 + job id',
      }),
      makeNode('n6', 'schedule', 'Queue', 620, 160, {
        description: 'Inngest / Trigger.dev / Supabase – job queue',
      }),
      makeNode('n7', 'actions', 'Worker', 840, 160, {
        description: 'Runs job with long timeout; retries',
      }),
      makeNode('n8', 'send-report-to-system', 'AI & APIs', 1040, 80, {
        description: 'AI, agents, multiple external API calls',
      }),
      makeNode('n9', 'database', 'Supabase', 1040, 240, {
        description: 'Store results; notify client via webhook or poll',
      }),
    ],
    edges: [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
      makeEdge('n2', 'n4'),
      makeEdge('n2', 'n5'),
      makeEdge('n5', 'n6'),
      makeEdge('n6', 'n7'),
      makeEdge('n7', 'n8'),
      makeEdge('n7', 'n9'),
    ],
  },
  {
    id: 'tpl-project-architecture',
    name: 'Project Architecture',
    description:
      'Full project map: Frontend → Vercel → App/Ops/Agent cores → Handlers → Supabase, Resend, Keitaro, Report Ingest, Agent Jobs. All connections shown.',
    category: 'architecture',
    blockCount: 12,
    nodes: [
      makeNode('n1', 'landing-page', 'Frontend', 0, 180, {
        description:
          'React SPA (Vite). Dashboard, Workflows, Partners, Campaigns, Settings. Calls /api/*.',
      }),
      makeNode('n2', 'traffic-source', 'Vercel', 200, 180, {
        description:
          'Hosting + rewrites. Routes /api/health, /api/campaigns, etc. to app.js, ops.js, or agent.js.',
      }),
      makeNode('n3', 'actions', 'App Core', 420, 40, {
        description:
          'api/app.js. Health, send-email, invite-user, public-book, transcribe, ai-analyze, backup. maxDuration 10s.',
      }),
      makeNode('n4', 'actions', 'Ops Core', 420, 180, {
        description:
          'api/ops.js. data-topology, reports, report-ingest, campaigns. Heavier routes, maxDuration 10s.',
      }),
      makeNode('n5', 'actions', 'Agent Core', 420, 320, {
        description:
          'api/agent.js. Enqueue AI/agent jobs → 202. /api/agent/enqueue, /api/agent/status. Thin, no long work here.',
      }),
      makeNode('n6', 'actions', 'API Handlers', 640, 180, {
        description:
          'lib/api-handlers, lib/ops-handlers, lib/agent-handlers. One handler per route; use Supabase, Resend, etc.',
      }),
      makeNode('n7', 'database', 'Supabase', 860, 0, {
        description:
          'Auth, DB (partners, workflows, meetings, agent_jobs). RLS. Service role for API.',
      }),
      makeNode('n8', 'email-sendout', 'Resend', 860, 80, {
        description: 'Transactional email. Invites, notifications, password reset.',
      }),
      makeNode('n9', 'campaign-attach', 'Keitaro', 860, 160, {
        description: 'Traffic / affiliate. Campaigns, links, postbacks.',
      }),
      makeNode('n10', 'send-report-to-system', 'Report Ingest', 860, 240, {
        description:
          'External KPIs. POST /api/report-ingest with x-report-token. Sessions in memory.',
      }),
      makeNode('n11', 'schedule', 'Agent Jobs', 860, 320, {
        description:
          'Table agent_jobs. Enqueue from Agent core; worker (later) runs AI/APIs. Poll status by job_id.',
      }),
      makeNode('n12', 'database', 'Other APIs', 860, 400, {
        description: 'AssemblyAI, Groq, etc. Used by transcribe, ai-analyze. Keys in env.',
      }),
    ],
    edges: [
      makeEdge('n1', 'n2'),
      makeEdge('n2', 'n3'),
      makeEdge('n2', 'n4'),
      makeEdge('n2', 'n5'),
      makeEdge('n3', 'n6'),
      makeEdge('n4', 'n6'),
      makeEdge('n5', 'n11'),
      makeEdge('n6', 'n7'),
      makeEdge('n6', 'n8'),
      makeEdge('n6', 'n9'),
      makeEdge('n6', 'n10'),
      makeEdge('n6', 'n12'),
    ],
  },
  {
    id: 'tpl-strategy-framework',
    name: 'Strategy Framework',
    description:
      'Business decomposition → Action mapping → KPI engineering → AI recommendation. Maps strategic workflow from inputs to AI-driven output.',
    category: 'architecture',
    blockCount: 5,
    nodes: [
      makeNode('n1', 'landing-page', 'Business Decomposition', 0, 80, {
        description:
          'Value drivers, revenue levers, cost drivers, constraints, leading vs lagging indicators',
      }),
      makeNode('n2', 'campaign-attach', 'Action → KPI Mapping', 260, 80, {
        description:
          'System actions mapped to KPIs and financial impact (revenue, margin, retention)',
      }),
      makeNode('n3', 'database', 'KPI Engineering', 520, 80, {
        description: 'Formulas, drivers, sources, sensitivity, levers per KPI (CAC, CR, ROI, FTD)',
      }),
      makeNode('n4', 'actions', 'Predictive Scenarios', 780, 40, {
        description: 'Conservative / Base / Aggressive forecasts for 6–12 months',
      }),
      makeNode('n5', 'send-report-to-system', 'AI Recommendation', 780, 120, {
        description: 'Architecture, integrations, models, dashboard, ROI estimate',
      }),
    ],
    edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3'), makeEdge('n3', 'n4'), makeEdge('n3', 'n5')],
  },
];
