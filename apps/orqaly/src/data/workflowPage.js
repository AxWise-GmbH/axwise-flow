// Marketing copy for /instruments/workflow — mirrors Workflow.jsx canvas

export const WORKFLOW_HUB_INTRO = {
  eyebrow: 'Workflow canvas',
  title: 'Draw automations. Run agents inside every node.',
  subtitle:
    'The same /workflow surface: React Flow canvas, blocks sidebar, custom blocks, triggers, execution trace, and run history — agents with memory and KB access, not just data shuffling.',
};

export const WORKFLOW_PILLARS = [
  {
    id: 'canvas',
    iconName: 'DragIndicatorOutlined',
    title: 'Visual node canvas',
    body: 'Drag triggers, agents, tools, branches, and delays. See blocks and connections at a glance.',
    linkLabel: '12 blocks · 11 connections',
  },
  {
    id: 'agents',
    iconName: 'SmartToyOutlined',
    title: 'Agents in nodes',
    body: 'Reasoning, memory, and knowledge base access live inside agent blocks — not passthrough zaps.',
    linkLabel: 'Refund Reviewer agent',
  },
  {
    id: 'import',
    iconName: 'ImportExportOutlined',
    title: 'Import & reuse',
    body: 'Bring n8n-style or JS workflows across. Custom blocks persist in your workspace.',
    linkLabel: 'JS script import',
  },
  {
    id: 'audit',
    iconName: 'ReplayOutlined',
    title: 'Run & audit',
    body: 'Step-by-step execution trace, replay inputs/outputs, and searchable run history per workflow.',
    linkLabel: 'Execution trace',
  },
];

export const SPOTLIGHT_CANVAS = {
  eyebrow: 'Canvas',
  title: 'Trigger, agent, tool, notify — on one board.',
  body: 'Wire a Stripe webhook into a classifier agent, a sandboxed tool call, and a customer email — observable, versioned, and editable without glue scripts.',
  bullets: [
    'Blocks sidebar with funnel, campaign, and agent types',
    'Branches, loops, and variables across nodes',
    'Goal-linked workflows with phase outputs',
    'Export canvas state when you need a backup',
  ],
};

export const SPOTLIGHT_IMPORT = {
  eyebrow: 'Import',
  title: 'Your existing automations translate in.',
  body: 'Import compatible workflow JSON or scripts so teams do not rebuild from scratch. Custom blocks stay available on the canvas afterward.',
  bullets: [
    'n8n-style workflow import path',
    'JS script import for power users',
    'Custom blocks you define once, reuse everywhere',
    'Version workflows without breaking live runs',
  ],
};

export const SPOTLIGHT_EXECUTION = {
  eyebrow: 'Execution',
  title: 'See exactly what ran — step by step.',
  body: 'Open the execution trace panel on any run: which agent acted, which tool fired, what input it saw, and what it returned.',
  bullets: [
    'Per-step inputs and outputs recorded',
    'Replay and debug failed nodes quickly',
    'Execution trace panel on active runs',
    'Audit log ties back to workspace compliance',
  ],
};

export const SPOTLIGHT_TRIGGERS = {
  eyebrow: 'Triggers',
  title: 'Cron, webhook, manual — pick the entry point.',
  body: 'Start workflows from scheduled jobs, inbound webhooks, form submissions, or a manual run — then monitor health from the workflow list.',
  bullets: [
    'Webhook, cron, event, and manual triggers',
    'Live monitoring and KPI chips on the list view',
    'Telegram and messaging routes into specialist agents',
    'Stripe and form triggers without extra middleware',
  ],
};

export const WORKFLOW_SEARCH_TEXT = [
  WORKFLOW_HUB_INTRO.eyebrow,
  WORKFLOW_HUB_INTRO.title,
  WORKFLOW_HUB_INTRO.subtitle,
  ...WORKFLOW_PILLARS.flatMap((p) => [p.title, p.body]),
  SPOTLIGHT_CANVAS.title,
  SPOTLIGHT_IMPORT.title,
  SPOTLIGHT_EXECUTION.title,
  SPOTLIGHT_TRIGGERS.title,
].join(' ');
