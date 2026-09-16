// Marketing copy for /control/organizations — mirrors OrgDetailDrawer tabs

export const ORG_HUB_INTRO = {
  eyebrow: 'Org command center',
  title: 'One organization. Every goal, team, and doc.',
  subtitle:
    'Open an org in Organizations and get the same drawer you use in-app: Overview, Results, Teams, Operations, Finances, and Governance — all scoped to that business.',
};

export const ORG_PILLARS = [
  {
    id: 'goals',
    iconName: 'AssignmentOutlined',
    title: 'Goals hub',
    body: 'Active and completed goals stay tied to the org. Jump to Job Pool with org_id or review deployments in Results.',
    linkLabel: 'Job Pool · goals',
  },
  {
    id: 'teams',
    iconName: 'GroupsOutlined',
    title: 'Team memory',
    body: 'See which teams and agents are assigned to the org. Cross-check Results to learn who worked on past goals.',
    linkLabel: 'Teams tab',
  },
  {
    id: 'reuse',
    iconName: 'ReplayOutlined',
    title: 'Reuse on the next goal',
    body: 'Keep the same roster on the org and assign those teams when you launch the next goal — no rebuilding from scratch.',
    linkLabel: 'Assign teams',
  },
  {
    id: 'kb',
    iconName: 'MenuBookOutlined',
    title: 'Org knowledge base',
    body: 'Documents, brand kit, and agent context live under one org. Row-level security keeps neighbours out.',
    linkLabel: 'Knowledge Base',
  },
];

export const SPOTLIGHT_GOALS = {
  eyebrow: 'Goals & results',
  title: 'Every goal for this business, in one drawer.',
  body: 'Overview shows active goals and completed results. The Results tab lists deployments, spend, and links back to Job Pool — filtered by org_id.',
  bullets: [
    'Active goals metric opens Job Pool scoped to the org',
    'Completed results with deployment chips and spend',
    'Operations tab surfaces workflows and dashboards for the org',
    'Activity feed includes goal events alongside audits',
  ],
};

export const SPOTLIGHT_TEAMS = {
  eyebrow: 'Teams & reuse',
  title: 'Review who worked. Reuse the same roster.',
  body: 'Teams tab lists org-assigned teams and agents. After a goal ships, the same teams stay on the org for the next launch.',
  bullets: [
    'Org–team map from Organizations assign dialog',
    'Org chart for teams and agents in one view',
    'Child orgs and Consilium board links in Governance',
    'Honest reuse: assign org teams to new Job Pool goals',
  ],
};

export const SPOTLIGHT_KB = {
  eyebrow: 'Knowledge & context',
  title: 'One knowledge base per organization.',
  body: 'Knowledge docs, brand kit, and per-org agents never bleed across tenants. Open KB or Agent Hub with the org context you are already in.',
  bullets: [
    'Isolated knowledge base count on Overview',
    'Per-org brand kit and agent fleet',
    'Opt-in agent sharing when you want cross-org reuse',
    'Communicator channels configured per org',
  ],
};

export const WORKSPACE_NOTE = {
  eyebrow: 'Multiple businesses',
  title: 'One login. A separate hub per org.',
  body: 'Switch workspaces without mixing data. Each organization keeps its own goals, teams, knowledge base, and RLS boundary.',
};

export const SPOTLIGHT_RLS = {
  eyebrow: 'True isolation',
  title: 'RLS at the database. Not just UI scoping.',
  body: 'Multi-tenant systems often hide the wrong data. Orqaly enforces Row-Level Security at the database — so even a leaky API cannot return another org’s rows.',
  bullets: [
    'Per-org RBAC (roles + permissions)',
    'Isolated knowledge base per org',
    'Per-org brand kit and agents',
    'Opt-in agent sharing across orgs',
  ],
};
