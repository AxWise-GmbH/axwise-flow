// Marketing copy for /instruments/projects — mirrors Projects.jsx

export const PROJECTS_HUB_INTRO = {
  eyebrow: 'Outcome workspaces',
  title: 'One roof per launch, client, or initiative.',
  subtitle:
    'The same /projects surface: bundle tasks, agents, scoped knowledge, deliverables, and KPIs around a single outcome — with stakeholder updates drafted from activity.',
};

export const PROJECTS_PILLARS = [
  {
    id: 'bundle',
    iconName: 'FolderOpenOutlined',
    title: 'Everything bundled',
    body: 'Tasks, agents, KB, and KPIs live inside the project — not scattered across four tools.',
    linkLabel: 'Q1 product launch',
  },
  {
    id: 'agents',
    iconName: 'GroupsOutlined',
    title: 'Agent council',
    body: 'Designate agents tuned to this outcome — shared context, scoped permissions.',
    linkLabel: '4 agents assigned',
  },
  {
    id: 'kb',
    iconName: 'MenuBookOutlined',
    title: 'Scoped knowledge',
    body: 'Project context stays inside the project. No cross-contamination with other work.',
    linkLabel: 'Isolated KB',
  },
  {
    id: 'updates',
    iconName: 'EmailOutlined',
    title: 'Stakeholder updates',
    body: 'Progress notes drafted from audit log and KPIs — you tweak, you send.',
    linkLabel: 'Auto-drafted',
  },
];

export const SPOTLIGHT_ROLLUP = {
  eyebrow: 'Portfolio',
  title: 'See every active outcome at a glance.',
  body: 'Multiple projects on track, at risk, or closing — progress bars, agent counts, and task totals without opening each hub.',
  bullets: [
    'Active project list with health signals',
    'Cross-project rollup for leadership',
    'Archive when done — stays searchable',
    'Marketplace templates to start fast',
  ],
};

export const SPOTLIGHT_HUB = {
  eyebrow: 'One roof',
  title: 'Tasks, agents, KB, KPIs — bundled.',
  body: 'Open a project and see everything that belongs to that outcome in one place. No more juggling four tools to remember what is happening on a launch.',
  bullets: [
    'Per-project knowledge base (no cross-contamination)',
    'Designated agent council per project',
    'Versioned deliverables grouped by milestone',
    'Timeline and milestone view',
  ],
};

export const SPOTLIGHT_KB = {
  eyebrow: 'Knowledge',
  title: 'Context that stays in the project.',
  body: 'Upload briefs, policies, and transcripts scoped to the project. Agents cite only what belongs to this outcome.',
  bullets: [
    'Sources isolated from workspace-wide KB',
    'Agents on the project council inherit scope',
    'Re-embed when docs change',
    'Deliverable diffs tied to project files',
  ],
};

export const SPOTLIGHT_UPDATES = {
  eyebrow: 'Updates',
  title: 'Stakeholders informed without you writing.',
  body: 'Agents draft progress notes from task activity and KPI movement. Edit once, send to investors, clients, or internal leads.',
  bullets: [
    'Weekly update drafts from audit activity',
    'KPI movement explained in plain language',
    'Same view inside; detail one click away',
    'Reports instrument pulls project prose',
  ],
};

export const PROJECTS_SEARCH_TEXT = [
  PROJECTS_HUB_INTRO.eyebrow,
  PROJECTS_HUB_INTRO.title,
  PROJECTS_HUB_INTRO.subtitle,
  ...PROJECTS_PILLARS.flatMap((p) => [p.title, p.body]),
  SPOTLIGHT_ROLLUP.title,
  SPOTLIGHT_HUB.title,
  SPOTLIGHT_KB.title,
  SPOTLIGHT_UPDATES.title,
].join(' ');
