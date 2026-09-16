// Single source of truth for /about. Edit copy here; the page re-renders automatically.

export const HERO = {
  eyebrow: 'About Orqaly',
  title: 'The operating system for the agent economy.',
  subtitle:
    'A platform that helps businesses improve how work gets done - and gives professionals one place to orchestrate pipelines, monitor outcomes, and stay in control as AI takes on more of the job.',
};

export const MISSION = {
  title: 'Our mission',
  paragraphs: [
    'We exist to help people and AI agents work together - ship faster, release sooner, and capture more of the value you create.',
    'Business is moving at a new speed: new models, new tools, new workflows every week. Orqaly is built for that pace - orchestrate solutions, swap in the LLMs and technologies you want to try, and always keep a control point on your side. You move fast; nothing runs without your rules.',
  ],
  tagline: 'Release immediately. Scale what works. Keep the audit trail.',
};

export const PILLARS_INTRO =
  'Five layers that turn goals into outcomes you can ship, audit, and scale.';

export const PILLARS = [
  {
    iconName: 'TaskAltOutlined',
    demoId: 'workflow',
    reverse: false,
    title: 'Goals, not prompts.',
    body: 'Set an outcome and track it to a deliverable - not a chat thread that forgets by morning.',
    to: '/instruments/workflow',
    cta: 'See workflows',
  },
  {
    iconName: 'GroupsOutlined',
    demoId: 'consilium',
    reverse: true,
    title: 'A council, not a single model.',
    body: 'Consilium runs specialized agents that argue, vote, and leave a trail you can defend.',
    to: '/control/consilium',
    cta: 'See Consilium',
  },
  {
    iconName: 'StorefrontRounded',
    demoId: 'marketplace',
    reverse: false,
    title: 'An open marketplace.',
    body: 'Builders publish agents, tools, skills, and templates. Creators keep 85%.',
    to: '/marketplace-preview',
    cta: 'See marketplace',
  },
  {
    iconName: 'TrendingUpOutlined',
    demoId: 'investments',
    reverse: true,
    title: 'A hub for builders and investors.',
    body: 'Connect human and AI capital with the people shipping - so orchestration, not guesswork, shows the way.',
    to: '/control/investments',
    cta: 'See investments',
  },
  {
    iconName: 'HubOutlined',
    demoId: 'organizations',
    reverse: false,
    title: 'An adaptive place to stay.',
    body: 'Workflows, orgs, channels, and tools evolve with you - one workspace that grows instead of another stack to replace.',
    to: '/control/organizations',
    cta: 'See organizations',
  },
];

export const ROADMAP = [
  {
    period: 'Now',
    items: [
      'Public beta',
      'Marketplace with paid add-ons from members',
      'Consilium in the default pack',
      'Organizations',
      'Pulse',
      'Default AI agents and teams',
    ],
  },
  {
    period: 'Next',
    items: [
      'Multi-language support',
      'Framework capabilities for processes',
      'Earn from LLM usage - share your local model keys (free or paid tiers)',
      'Visual programming (beta)',
      'Blockchain DataBase',
      'Build Second brain',
    ],
  },
  {
    period: 'Later',
    items: [
      'Self-hosted Orqaly',
      'A true OS experience - describe what you want on any device, install only what you need, skip the app-store clutter',
      'Full personalization: your stack, your marketplaces, your rules',
    ],
  },
];

export const ROADMAP_INTRO =
  'We ship in the open. Here is what is live today, what is queued next, and where we are headed.';

export const VALUES_INTRO = 'Principles we ship against - not slogans on a slide.';

export const VALUES = [
  {
    title: 'Truth over hype.',
    body: 'We do not claim we are better than X if we cannot show it.',
    inPractice:
      'Every "vs ___" comparison on our site is grounded in shipped behavior, not marketing copy.',
  },
  {
    title: 'Audited by default.',
    body: 'Every agent action is loggable; every decision has a trail.',
    inPractice:
      'Audit log on every run, visible from day one of your workspace - not a paid add-on.',
  },
  {
    title: 'Creator-friendly economics.',
    body: 'Builders deserve to earn more than the platform that distributes them.',
    inPractice:
      '85% to creators, non-negotiable. Stripe Connect payouts. Transparent fees, no hidden cuts.',
  },
  {
    title: 'Your keys, your data.',
    body: 'Privacy is the default, not a setting.',
    inPractice:
      'BYOK for provider tokens, BYOS for storage, Row-Level Security at the database. We could not read your data if we tried.',
  },
];

export const TRACTION_TITLE = 'Traction at a glance';

export const TRACTION = [
  { value: '10', label: 'industries served', sub: 'pre-tuned for these teams' },
  { value: '85 / 15', label: 'creator split', sub: 'builders keep 85%' },
  { value: '4', label: 'channels live', sub: 'voice, Telegram, web, email' },
  { value: 'BYOK', label: '+ BYOS', sub: 'your keys, your data' },
];
