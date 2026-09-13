// Marketing copy for /instruments/task-manager — mirrors TaskManager.jsx

export const TASK_MANAGER_HUB_INTRO = {
  eyebrow: 'Task control surface',
  title: 'Every process lands in one list.',
  subtitle:
    'The same /task-manager surface: scoped views (All, Partner, Team, Projects, AI Agents), filters, board or table, agent assignees, versioned deliverables, and review queues.',
};

export const TASK_MANAGER_PILLARS = [
  {
    id: 'scopes',
    iconName: 'FilterListOutlined',
    title: 'Scoped views',
    body: 'Slice by All, Partner, Team, Projects, or AI Agent tasks — one surface, your view.',
    linkLabel: 'Category toolbar',
  },
  {
    id: 'assign',
    iconName: 'SmartToyOutlined',
    title: 'Agent or human',
    body: 'Assign an agent, a teammate, or both. Same task card, same SLA and audit trail.',
    linkLabel: 'Approve + send',
  },
  {
    id: 'deliverable',
    iconName: 'LayersOutlined',
    title: 'Versioned deliverables',
    body: 'Every iteration saved on the task — review, comment, request changes, approve.',
    linkLabel: 'v1 · v2 · v3',
  },
  {
    id: 'sla',
    iconName: 'TimerOutlined',
    title: 'SLA & audit',
    body: 'Timers, escalation, filters by status and priority — who did what, when, on every run.',
    linkLabel: 'Audit log',
  },
];

export const SPOTLIGHT_SCOPES = {
  eyebrow: 'One list',
  title: 'Workflows, projects, partners — same manager.',
  body: 'Tasks from agent jobs, workflow plans, projects, and day-to-day ops share statuses, deadlines, and owners. Switch scope without switching tools.',
  bullets: [
    'All · Partner · Team · Projects · AI Agents scopes',
    'Table and board views with bulk actions',
    'Category tags: Sales, Legal, Ops, and more',
    'Webhook hooks for external systems',
  ],
};

export const SPOTLIGHT_REVIEW = {
  eyebrow: 'Agent assignment',
  title: 'Assign an agent. Review what comes back.',
  body: 'The fastest path between "we should do this" and "it is done" is rarely all human or all agent. Assign the agent, review the deliverable, approve or send back — without losing the SLA or audit trail.',
  bullets: [
    'Same task, multiple versions of the deliverable',
    'Inline review and refinement',
    'Approval routes to one or many',
    'Audit log shows who did what, when',
  ],
};

export const SPOTLIGHT_DELIVERABLE = {
  eyebrow: 'Deliverables',
  title: 'Iterate without losing the last draft.',
  body: 'Each agent run attaches a versioned output to the task. Comments thread on the deliverable; status reflects what actually happened.',
  bullets: [
    'Deliverable diff between versions',
    'Comments and review queue inline',
    'Auto-status updates from agent runs',
    'Request changes without re-creating the task',
  ],
};

export const SPOTLIGHT_FILTERS = {
  eyebrow: 'Control',
  title: 'Filter fast. Nothing slips quietly.',
  body: 'Status, priority, assignee, category, and job filters — plus SLA timers that escalate before deadlines go red.',
  bullets: [
    'Multi-filter toolbar with saved views',
    'SLA timers and escalation paths',
    'Partner and team filters for agencies',
    'Bulk select and act once',
  ],
};

export const TASK_MANAGER_SEARCH_TEXT = [
  TASK_MANAGER_HUB_INTRO.eyebrow,
  TASK_MANAGER_HUB_INTRO.title,
  TASK_MANAGER_HUB_INTRO.subtitle,
  ...TASK_MANAGER_PILLARS.flatMap((p) => [p.title, p.body]),
  SPOTLIGHT_SCOPES.title,
  SPOTLIGHT_REVIEW.title,
  SPOTLIGHT_DELIVERABLE.title,
  SPOTLIGHT_FILTERS.title,
].join(' ');
