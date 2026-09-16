// Marketing copy for /control/consilium — mirrors Consilium.jsx tabs

export const CONSILIUM_HUB_INTRO = {
  eyebrow: 'Decision layer',
  title: 'Debate, Vote - Record',
  subtitle:
    'The same /consilium app you configure in-product: boards and members, evaluation criteria, deliberation with dissent, analytics, and a full decision log in Communicator.',
};

export const CONSILIUM_PILLARS = [
  {
    id: 'configure',
    iconName: 'GroupsOutlined',
    title: 'Configure boards',
    body: "Create evaluation boards, assign members with roles, and set criteria — analyst, critic, synthesiser, devil's advocate.",
    linkLabel: 'Boards · Members · Criteria',
  },
  {
    id: 'deliberate',
    iconName: 'HowToVoteOutlined',
    title: 'Deliberate & vote',
    body: 'Each member argues, votes yes or no, and dissent is captured. Majority, unanimous, weighted, or custom rules.',
    linkLabel: 'Council transcript',
  },
  {
    id: 'audit',
    iconName: 'GavelOutlined',
    title: 'Audit & analytics',
    body: 'Analytics dashboard, security events, governance for tool approval, and the Consilium log in Communicator.',
    linkLabel: 'View decision log',
  },
  {
    id: 'integrate',
    iconName: 'IntegrationInstructionsOutlined',
    title: 'Wire everywhere',
    body: 'Attach boards to organizations, Smart Request team pick, workflow nodes, agents, and marketplace Consilium templates.',
    linkLabel: 'Drop-in integrations',
  },
];

export const SPOTLIGHT_BOARDS = {
  eyebrow: 'Configure',
  title: 'Boards, members, and criteria.',
  body: 'Consilium opens on Boards — create councils, add members, tune evaluation criteria, and use Agent Helper for lifecycle tooling. Metrics show boards, members, and job counts.',
  bullets: [
    'Boards tab: create, edit, and link evaluation boards',
    'Members tab: roster and roles across boards',
    'Criteria tab: scoring rules per board',
    'Agent Helper tab for agent lifecycle support',
  ],
};

export const SPOTLIGHT_DELIBERATE = {
  eyebrow: 'Deliberate',
  title: 'Propose, argue, vote, deliver.',
  body: "Drop a high-stakes question. Specialists make their case; critic and devil's advocate push back. You get one answer with rationale and dissent — not a single model guess.",
  bullets: [
    'Configurable council size and per-seat roles',
    'Argument notes saved per member',
    'Majority, unanimous, weighted, or custom vote',
    'Final verdict with citations to KB and workflow context',
  ],
};

export const SPOTLIGHT_AUDIT = {
  eyebrow: 'Audit',
  title: 'Every vote in the decision log.',
  body: 'Analytics tab surfaces evaluation trends; Security and Governance tabs cover events and tool-approval mode. Full log lives in Communicator under Consilium.',
  bullets: [
    'Approved / rejected chips with overall scores',
    'Member responses expandable per evaluation',
    'Filter by decision level: LOW through CRITICAL',
    'Link from Analytics to Communicator decision log',
  ],
};

export const SPOTLIGHT_INTEGRATE = {
  eyebrow: 'Integrate',
  title: 'Behind agents, goals, and workflows.',
  body: 'Consilium is not a standalone chat — slot it where one-shot answers fail. Organizations link boards; goals and Smart Request use councils for team assembly and review.',
  bullets: [
    'Consilium node in Workflow builder',
    'Council behind any Agent for hard calls',
    'Marketplace Consilium board templates',
    'BYOK: mix Claude, GPT, Groq per seat',
  ],
};
