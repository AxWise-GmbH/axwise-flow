// Marketing copy for /control/communicator — mirrors Communicator.jsx views

export const COMM_HUB_INTRO = {
  eyebrow: 'Communication control room',
  title: 'Monitor every goal. Deploy every channel.',
  subtitle:
    'The same /communicator app you use in-product: Agent Workspace for live activity and goal rooms, plus Communicator for bot settings, channels, controller, and audit — tied to goals in Job Pool.',
};

export const COMM_PILLARS = [
  {
    id: 'workspace',
    iconName: 'BoltOutlined',
    title: 'Agent Workspace',
    body: 'Live activity feed, Goal History rooms, Organizations context, Consilium log, and History — filter activity by goal.',
    linkLabel: 'view=workspace',
  },
  {
    id: 'rooms',
    iconName: 'ForumOutlined',
    title: 'Agent rooms per goal',
    body: "Open a goal's Agent Room and follow Team, Lead, and Agent channels — phases, messages, and status in one thread.",
    linkLabel: 'Goal History',
  },
  {
    id: 'govern',
    iconName: 'GavelOutlined',
    title: 'Consilium & audit',
    body: 'Review board votes, scores, and approvals in the Consilium log. Audit Log and Controller for commands and compliance.',
    linkLabel: 'Consilium · Audit',
  },
  {
    id: 'channels',
    iconName: 'SettingsInputAntennaOutlined',
    title: 'Channels & bots',
    body: 'Bot Settings, Channels (voice, Telegram, email), Files, Scheduled Reports, and Strangers — one agent config across surfaces.',
    linkLabel: 'view=communicator',
  },
];

export const SPOTLIGHT_WORKSPACE = {
  eyebrow: 'Agent Workspace',
  title: 'See what is happening on every goal.',
  body: 'Live activity shows events as goals run. Goal History lists Agent Rooms; open one to read the full communication thread without leaving Communicator.',
  bullets: [
    'Live activity feed with goal filters',
    'Goal History opens per-goal Agent Rooms',
    'Organizations tab links workspace to org context',
    'History tab for past communication events',
  ],
};

export const SPOTLIGHT_ROOMS = {
  eyebrow: 'Agent rooms',
  title: 'Team, Lead, and Agent — in one room.',
  body: 'While a goal executes, Agent Room channels show how agents and team members coordinate. Talk with Team-Lead from the goal still lands here.',
  bullets: [
    'Team channel for squad coordination',
    'Lead channel for Consilium-facing updates',
    'Agent channel for individual agent messages',
    'Message counts and phases on the room card',
  ],
};

export const SPOTLIGHT_CONSILIUM = {
  eyebrow: 'Consilium & control',
  title: 'Decisions and commands, recorded.',
  body: 'When Consilium evaluates work, votes and rationale appear in the log. Controller runs commands; Audit Log keeps the end-to-end record.',
  bullets: [
    'Consilium log: votes, scores, approvals',
    'Controller interface and command history',
    'Audit Log across communicator actions',
    'Scheduled Reports and Files for outbound comms',
  ],
};

export const SPOTLIGHT_CHANNELS = {
  eyebrow: 'Communication channels',
  title: 'Voice, Telegram, and email — one configuration.',
  body: 'Voice uses AssemblyAI / Groq. Telegram needs a BotFather token — webhooks wired for you. Email connects via SMTP / IMAP. Per-channel personality without duplicate agents.',
  bullets: [
    'AssemblyAI / Groq voice with low latency',
    'Telegram bots via BotFather token',
    'Email via SMTP / IMAP',
    'Human hand-off and webhook routing',
  ],
};
