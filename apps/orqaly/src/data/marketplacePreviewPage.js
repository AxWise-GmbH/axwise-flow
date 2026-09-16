// Marketing copy for /marketplace-preview — mirrors Marketplace.jsx tabs

export const MARKETPLACE_HUB_INTRO = {
  eyebrow: 'Agent marketplace',
  title: 'Browse, install, upload, and publish in one place.',
  subtitle:
    'The same /marketplace you use in-product: seven category tabs, one-click install into your workspace, upload your agents and tools, and publish listings to earn crypto.',
};

export const MARKETPLACE_PILLARS = [
  {
    id: 'browse',
    iconName: 'StorefrontOutlined',
    title: 'Browse by category',
    body: 'Agents, Skills, Tools, Consilium, Organizations, Businesses, and Replicators — search, sort, ratings, and install counts on every listing.',
    linkLabel: '/marketplace?tab=agents',
  },
  {
    id: 'install',
    iconName: 'DownloadOutlined',
    title: 'Install to workspace',
    body: 'Add agents to Agent Hub, install skills on selected agents, and apply templates without rebuilding from scratch.',
    linkLabel: 'One-click install',
  },
  {
    id: 'upload',
    iconName: 'CloudUploadOutlined',
    title: 'Upload your stack',
    body: 'Agent library, your tools and connectors, knowledge for a second brain, and optional business setups to rent.',
    linkLabel: 'Your integrations',
  },
  {
    id: 'publish',
    iconName: 'PublishOutlined',
    title: 'Publish & earn',
    body: 'List in any category, keep drafts private until publish, VirusTotal scan on tools, Stripe Connect payouts — earn crypto on installs.',
    linkLabel: 'For builders',
  },
];

export const SPOTLIGHT_BROWSE = {
  eyebrow: 'Browse',
  title: 'Seven tabs. One marketplace.',
  body: 'Open Marketplace and switch tabs — the same categories as the landing tiles. Preview listings, filter, and sort before you install.',
  bullets: [
    'Agents, Skills, Tools, Consilium, Organizations, Businesses, Replicators',
    'Ratings and comments synced from marketplace data',
    'Featured agents and catalog counts on the hub',
    'Deep links: /marketplace?tab=skills and so on',
  ],
};

export const SPOTLIGHT_INSTALL = {
  eyebrow: 'Install & run',
  title: 'From listing to live agent in minutes.',
  body: 'Install adds templates to your workspace — agents land in Agent Hub, skills attach to agents you pick, org and Consilium templates wire into Organizations.',
  bullets: [
    'Add agent templates to your roster',
    'Install skill packs on one or many agents',
    'MCP tools and replicators extend what agents can do',
    'Deploy on voice, Telegram, and email via Communicator',
  ],
};

export const SPOTLIGHT_UPLOAD = {
  eyebrow: 'Upload',
  title: 'Bring agents, tools, and knowledge.',
  body: 'Upload what you already run, connect your integrations, and optionally list a business setup others can rent — workspace-ready, not a separate silo.',
  bullets: [
    'Upload your agents or agent library',
    'Connect your tools and MCP connectors',
    'Build your second brain from documents',
    'Offer a personal business setup for rent',
  ],
};

export const SPOTLIGHT_PUBLISH = {
  eyebrow: 'Publish',
  title: 'Ship listings. Earn crypto.',
  body: 'Publish agents, skills, tools, boards, org templates, business kits, and replicators. Tools are scanned before they go live; payouts run through Stripe Connect.',
  bullets: [
    'List in any marketplace category',
    'VirusTotal scan on tools before publish',
    'Private workspace drafts until you go live',
    'Earn crypto on installs — trust and safety handled',
  ],
};
