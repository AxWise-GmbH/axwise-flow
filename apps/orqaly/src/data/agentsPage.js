// Marketing copy for /control/agents — mirrors Agent Hub tabs in AgentHub.jsx

export const HUB_INTRO = {
  eyebrow: 'Agent Hub',
  title: 'Seven tabs. One mission control.',
  subtitle:
    'The same workspace you open at /agent-hub: Agents, Teams, Knowledge, Skills, Pulse, Prompt Lab, and My Agents.',
};

/** ids match AgentHub VALID_TABS */
export const AGENT_HUB_SURFACES = [
  {
    id: 'agents',
    iconName: 'SmartToyOutlined',
    label: 'Agents',
    title: 'Build and deploy agents',
    bullets: [
      'Roster with filters, grid/list views, and pagination',
      'Per-agent connections, schema, and activity log',
      'Live feed for every run step',
      'Versioning and rollback from the detail view',
    ],
  },
  {
    id: 'teams',
    iconName: 'Diversity3Outlined',
    label: 'Teams',
    title: 'Multi-agent teams',
    bullets: [
      'Create teams and assign member agents',
      'AI team composition suggestions',
      'Card or table view with status chips',
      'Team chat and tool setup',
    ],
  },
  {
    id: 'knowledge',
    iconName: 'StorageOutlined',
    label: 'Knowledge',
    title: 'Knowledge your agents read',
    bullets: [
      'Notes, files, and links in one library',
      'Semantic search across documents',
      'Scope and agent filters',
      'Pin, add, edit, and view sources',
    ],
  },
  {
    id: 'skills',
    iconName: 'AutoFixHighOutlined',
    label: 'Skills',
    title: 'Skill packs marketplace',
    bullets: [
      'Browse bundled and community skills',
      'Preview, rate, and install onto agents',
      'Create or import your own packs',
      'See which agents use each skill',
    ],
  },
  {
    id: 'pulse',
    iconName: 'FiberManualRecord',
    label: 'Pulse',
    title: 'Autonomous schedules',
    bullets: [
      'Recurring schedules for agents and teams',
      'Run now or enable/disable schedules',
      'Metrics strip and activity timeline',
      'Categories and filter toolbar',
    ],
  },
  {
    id: 'prompt-lab',
    iconName: 'ScienceOutlined',
    label: 'Prompt Lab',
    title: 'Test before you ship',
    bullets: [
      'Optimization run history with reports',
      'Active experiments and variant promote',
      'Strategy insights from daily cycles',
      'Library and sketch surfaces',
    ],
  },
  {
    id: 'my-agents',
    iconName: 'FavoriteOutlined',
    label: 'My Agents',
    title: 'Your hired library',
    bullets: [
      'Agents and teams you own or installed',
      'Spend, rating, jobs, and pending approval metrics',
      'Search, sort, and card/table views',
      'Reuse agents across new work',
    ],
  },
];

export const SPOTLIGHT_AGENTS = {
  eyebrow: 'Agents tab',
  title: 'One agent, fully equipped.',
  body: 'The Agents tab is where you define skills, knowledge scope, tools, and channels — then watch every run in the live feed.',
  bullets: [
    'Compose from skills and tools with per-agent permissions',
    'Filter by category, status, and connection type',
    'Deploy to voice, Telegram, chat, and email',
    'Open any agent for audit, schema, and rollback',
  ],
};

export const SPOTLIGHT_TEAMS = {
  eyebrow: 'Teams tab',
  title: 'Specialists that work together.',
  body: 'Teams group agents for complex outcomes. Suggestions help you compose the right roster from your existing pool.',
  bullets: [
    'Team cards with member agent chips',
    'AI-generated composition suggestions',
    'Shared activity and provisioning flows',
    'Plug Consilium in for high-stakes decisions',
  ],
};

export const SPOTLIGHT_PULSE = {
  eyebrow: 'Pulse tab',
  title: 'Work that runs on its own.',
  body: 'Pulse schedules autonomous cycles. Run now or set a cadence — metrics and timeline stay in the hub.',
  bullets: [
    'Schedule recurring agent and team cycles',
    'Toggle schedules on or off instantly',
    'Pulse timeline and category filters',
    'Activity feed shows every cycle',
  ],
};

export const SPOTLIGHT_OPERATE = {
  eyebrow: 'Operate',
  title: 'Trust what shipped.',
  body: 'Audit logs, KPI dashboards, and Prompt Lab sit next to production agents so you can defend every decision.',
  bullets: [
    'Full audit trail on agents and tool calls',
    'Per-agent KPIs when metrics are enabled',
    'Prompt Lab experiments before promote',
    'Marketplace publish with 85% creator share',
  ],
};

export const COMPARISON_EXTRA_ROWS = [
  {
    capability: 'Multi-agent teams built-in',
    values: { orqaly: true, odysseus: 'partial', hermes: false, openclaw: 'partial', claude: false, langchain: 'partial', crewai: true },
  },
  {
    capability: 'Autonomous Pulse scheduling',
    values: { orqaly: true, odysseus: 'partial', hermes: false, openclaw: false, claude: false, langchain: false, crewai: 'partial' },
  },
  {
    capability: 'Prompt Lab before production',
    values: { orqaly: true, odysseus: false, hermes: false, openclaw: 'partial', claude: 'partial', langchain: 'partial', crewai: false },
  },
  {
    capability: 'Consilium AI board & governance',
    values: { orqaly: true, odysseus: false, hermes: false, openclaw: false, claude: false, langchain: false, crewai: false },
  },
  {
    capability: 'Built-in knowledge base (RAG)',
    values: { orqaly: true, odysseus: 'partial', hermes: false, openclaw: 'partial', claude: 'partial', langchain: 'partial', crewai: 'partial' },
  },
  {
    capability: 'Per-run cost & usage tracking',
    values: { orqaly: true, odysseus: false, hermes: 'partial', openclaw: false, claude: 'partial', langchain: 'partial', crewai: 'partial' },
  },
];
