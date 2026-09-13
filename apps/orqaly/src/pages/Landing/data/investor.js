// Single source of truth for the investor section and /investors page.
// Update copy here; both surfaces re-render automatically.

export const INVESTOR_EMAIL = 'invest@orqaly.com';
export const MAILTO_HREF = `mailto:${INVESTOR_EMAIL}?subject=Orqaly%20-%20investor%20intro`;

export const HERO = {
  eyebrow: 'For investors',
  headline: 'The orchestration layer for the agent economy.',
  subhead:
    'Orqaly is becoming the operating system for AI agents - a council that plans, a marketplace that earns, and a voice / chat surface humans already use. We are building the layer between LLMs and the businesses that need them.',
};

export const STATS = [
  { value: '10', label: 'industries served', sub: 'voice, chat, ops, data' },
  { value: '85 / 15', label: 'creator split', sub: 'builders keep 85%' },
  { value: '4', label: 'channels live', sub: 'voice · Telegram · chat · email' },
  { value: 'BYOK', label: '+ BYOS', sub: 'your keys, your storage' },
];

export const WHY_NOW = {
  prose:
    'The first wave of AI tools made chatting with a model easier. The next wave is making the model do the job, and not just for engineers. The bottleneck has shifted from model quality to orchestration: who decides what each agent does, how they coordinate, how creators get paid when their work runs. That layer is open - and Orqaly is building it.',
  bullets: [
    {
      title: 'Models are commoditizing.',
      body: 'Frontier model performance is converging. Value is moving up the stack to orchestration, evaluation, and distribution.',
    },
    {
      title: 'Agents are leaving the demo phase.',
      body: 'Multi-step, multi-agent workflows are starting to ship into production. The teams running them need an operating system, not a notebook.',
    },
    {
      title: 'Marketplace economics work.',
      body: 'Stripe Connect, BYOK billing, and 85 / 15 creator splits make it possible for non-engineers to ship and earn from AI without writing a single line of code.',
    },
  ],
};

// Competitive grid: rows are capabilities, columns are competitors.
// `orqaly` is always true (the column is what we are).
export const COMPETITORS = [
  { id: 'orqaly', label: 'Orqaly' },
  { id: 'zapier', label: 'Zapier' },
  { id: 'langchain', label: 'LangChain' },
  { id: 'crewai', label: 'CrewAI' },
  { id: 'openai_agents', label: 'OpenAI Agents' },
];

export const COMPARISON_ROWS = [
  {
    capability: 'Goals to deliverables (not just workflows)',
    values: {
      orqaly: true,
      zapier: false,
      langchain: 'partial',
      crewai: 'partial',
      openai_agents: 'partial',
    },
  },
  {
    capability: 'Multi-agent council that votes',
    values: {
      orqaly: true,
      zapier: false,
      langchain: false,
      crewai: 'partial',
      openai_agents: false,
    },
  },
  {
    capability: 'Marketplace with revenue share',
    values: {
      orqaly: true,
      zapier: false,
      langchain: false,
      crewai: false,
      openai_agents: 'partial',
    },
  },
  {
    capability: 'No-code for non-engineers',
    values: { orqaly: true, zapier: true, langchain: false, crewai: false, openai_agents: false },
  },
  {
    capability: 'Voice + chat + Telegram channels',
    values: {
      orqaly: true,
      zapier: 'partial',
      langchain: false,
      crewai: false,
      openai_agents: 'partial',
    },
  },
  {
    capability: 'BYOK / BYOS (your keys, your data)',
    values: { orqaly: true, zapier: false, langchain: true, crewai: true, openai_agents: false },
  },
];

export const MARKET = {
  segments: [
    { label: 'TAM', value: 'AI infra & agents', pct: 100, sub: 'tens of $B by 2030' },
    {
      label: 'SAM',
      value: 'Agent orchestration + marketplace',
      pct: 38,
      sub: 'the layer between LLMs and businesses',
    },
    {
      label: 'SOM',
      value: 'No-code orchestration for SMB + creators',
      pct: 14,
      sub: 'where Orqaly plays first',
    },
  ],
  blurb:
    'The AI infrastructure market is projected in the tens of billions through 2030. Most of it accrues to model providers and hyperscalers. The exception is the orchestration and marketplace layer - the place teams pick to build with - which is structurally fragmented and undefended today.',
  citation:
    'Sizing framed against published research from Gartner, IDC, and a16z on AI infrastructure spend through 2030. Detailed sources available under NDA.',
};

export const PRODUCT_SPOTLIGHTS = [
  {
    eyebrow: 'Planning layer',
    title: 'Consilium for Strategic Decisions',
    body: 'A council of specialists debates, votes, and leaves an auditable trail - so branching decisions are defensible, not hidden in a chat log.',
  },
  {
    eyebrow: 'Distribution',
    title: 'Marketplace for all',
    body: 'Creators publish agents, skills, tools, and business kits. Buyers install in one click, join the community - now!',
  },
  {
    eyebrow: 'Reach',
    title: 'Control where ever you like',
    body: 'The same agent runs on voice, Telegram, web chat, and email - one memory, one job pool, no re-wiring per channel.',
  },
];

export const TRACTION = [
  {
    title: 'Beta program live',
    body: 'Closed beta with early users across founder, agency, and creator personas. New cohorts added monthly.',
  },
  {
    title: 'Marketplace seeded',
    body: 'First wave of agents, tools, skills, and business templates published. Creator onboarding via Stripe Connect.',
  },
  {
    title: 'Detailed metrics under NDA',
    body: 'Cohort retention, weekly active, marketplace GMV and conversion shared in the data room on signed mutual NDA.',
  },
];

export const MOAT = [
  {
    title: 'Consilium multi-agent IP',
    body: 'A council layer that runs proposals through specialized agents that argue, vote, and leave an auditable trail.',
    iconName: 'GroupsOutlined',
  },
  {
    title: 'Marketplace network effects',
    body: 'Every new creator and every new buyer makes the next install more valuable. 85 / 15 economics keep builders on-platform.',
    iconName: 'StorefrontRounded',
  },
  {
    title: '85 / 15 creator economics',
    body: 'Creator-friendly split priced for retention. Stripe Connect handles payouts, taxes, and disputes.',
    iconName: 'PaidOutlined',
  },
  {
    title: 'Voice-first UX',
    body: 'Voice + Telegram + chat + email out of the box. Same agent, every channel - built for humans, not just developers.',
    iconName: 'MicNoneOutlined',
  },
];

export const BUSINESS_MODEL = {
  streams: [
    {
      title: 'Subscriptions',
      body: 'Free workspace, $5 / mo Paid unlocks imports, marketplace publish, and priority support.',
    },
    {
      title: '15% marketplace take',
      body: 'Net revenue from every paid install of an agent, tool, skill, or template.',
    },
    {
      title: 'Enterprise (on roadmap)',
      body: 'SSO, audit-log retention, dedicated success, custom limits. Pipeline forming now.',
    },
  ],
  notes: [
    'Stripe Connect handles payouts and tax statements. We hold no card data.',
    'BYOK passes LLM and voice usage costs through the provider, so platform margin is not gated on token prices.',
    'BYOS lets enterprises keep data in their own Supabase or S3, removing a common compliance blocker.',
  ],
};

export const ASK = {
  pill: 'Currently raising',
  body: 'We are in active conversations with operator-friendly funds and angels for the next round. Round terms, allocation, and use-of-funds are shared after a 15-minute intro on email.',
};

export const ROADMAP = [
  {
    period: 'Now',
    window: 'Q2 - Q3 2026',
    items: [
      'Public beta open across the 10 industry templates',
      'Marketplace v1 with paid installs via Stripe Connect',
      'Voice + Telegram + chat + email channels stable',
      'Consilium council in default planner mode',
    ],
  },
  {
    period: 'Next',
    window: 'Q4 2026 - Q1 2027',
    items: [
      'Enterprise tier: SSO, audit retention, dedicated success',
      'Builder SDK for tools and skills + creator analytics',
      'Multi-language voice channels (EU + LATAM priority)',
      'Public API for agent runs and marketplace installs',
    ],
  },
  {
    period: 'Later',
    window: '2027 +',
    items: [
      'Self-hosted Orqaly for regulated industries',
      'Agent-to-agent micropayments on top of Stripe Connect',
      'Industry-specific marketplaces (healthcare, legal first)',
      'Investor portal + creator analytics suite',
    ],
  },
];

export const INVESTOR_FAQ = [
  {
    q: 'Why does this win against a Big Lab agent product?',
    a: 'Big Lab agent products are vertically integrated - their model, their tools, their store. That creates the same dynamic as iOS: a closed economy with a single landlord. Orqaly is the open layer: any model (BYOK), any channel, any creator can publish and earn. The teams who do not want to bet their business on one vendor pick us.',
  },
  {
    q: 'How defensible is the marketplace really?',
    a: 'The defensibility is two-sided. Creators stick around for the 85 / 15 split, payouts, and reach. Buyers stick around for selection and one-click installs that compose with their existing agents. The bigger the marketplace grows, the more painful it is for a new entrant to recreate both sides of liquidity.',
  },
  {
    q: 'What about LangChain, CrewAI, AutoGen?',
    a: 'Libraries for engineers. Orqaly is a platform for the humans running a business. Different buyer, different product surface, different distribution. We can run on top of those libraries when needed - we do not compete for the same shelf.',
  },
  {
    q: 'How do you handle abuse and trust on the marketplace?',
    a: 'Static and runtime checks on every publish, capability scoping per tool, sandboxed execution, audit logs by default, and creator KYC via Stripe Connect. We have a written acceptable-use policy and a fast-path review queue for sensitive categories.',
  },
  {
    q: 'What are the gross margins?',
    a: 'Subscription gross margin is in the 80 - 90% band typical of vertical SaaS. Marketplace take rate is a clean software margin minus Stripe processing. BYOK means LLM and voice costs do not sit on our P&L. Detailed unit economics under NDA.',
  },
  {
    q: 'Who is on the cap table?',
    a: 'We share the round structure, current cap table, and lead status after a 15-minute intro. Email invest@orqaly.com to get on calendar.',
  },
];
