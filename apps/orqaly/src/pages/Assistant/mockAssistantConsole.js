/**
 * Fallback / fixture data for the Assistant Console (/assistant).
 *
 * The page loads real data via useAssistantConsole; this object is the shape
 * contract + the fallback shown when a source is empty (e.g. fresh account, or
 * tests). Shapes mirror the eventual service responses. Each "source:" comment
 * names where the live data comes from.
 *
 * No em dashes anywhere (project rule): plain hyphens only.
 * Conversation dates use fixed ISO strings so date formatting is deterministic.
 */

export const MOCK_ASSISTANT_CONSOLE = {
  // source: assistant_setup (assistantSetupService.loadAssistantSetup)
  assistant: {
    name: 'Aurum', // TODO(phase2): assistant_setup.config.name - field not in schema yet
    activated: true, // assistant_setup.activated
  },

  // source: assistant_setup.config (provider/model are ids; tone lowercase; creativity 0-100)
  brain: {
    provider: 'openai',
    model: 'gpt-4o',
    tone: 'professional',
    creativity: 65,
  },

  // source: communication_channels (communicatorService.getChannels / getPersonas)
  channels: [
    { id: 'tg', platform: 'telegram', handle: '@aurum_assistant', status: 'connected' },
    { id: 'slk', platform: 'slack', handle: '#ai-assistant', status: 'connected' },
  ],

  // source: knowledge_documents counts + integration connectors (not wired this pass)
  data: {
    counts: { notes: 64, files: 42, links: 36 },
    connectors: [
      { id: 'obsidian', name: 'Obsidian', status: 'connected' },
      { id: 'notion', name: 'Notion', status: 'connected' },
    ],
    tags: ['product', 'onboarding', 'policies', 'pricing'],
    tagsMore: 4,
  },

  // source: organizations (organizationService.listOrganizations) - for org picker + grouping
  organizations: [
    { id: 'org1', name: 'Acme Inc' },
    { id: 'org2', name: 'Globex' },
  ],

  // source: contacts (contactsService.listContacts). total/mail/phone derived from list.
  contacts: {
    total: 58,
    mail: 24,
    phone: 34,
    list: [
      {
        id: 'ct1',
        name: 'P. Jackson',
        contact_type: 'mail',
        email: 'p@acme.io',
        attitude: 'vip',
        organization_id: 'org1',
      },
      {
        id: 'ct2',
        name: 'M. Lee',
        contact_type: 'phone',
        phone: '+1 555 0102',
        attitude: 'friendly',
        organization_id: 'org1',
      },
      {
        id: 'ct3',
        name: 'S. Powell',
        contact_type: 'mail',
        email: 's@globex.co',
        attitude: 'neutral',
        organization_id: 'org2',
      },
      {
        id: 'ct4',
        name: 'R. Kim',
        contact_type: 'phone',
        phone: '+1 555 0143',
        attitude: 'cold_lead',
        organization_id: null,
      },
    ],
  },

  // source: communication_logs grouped into threads (groupThreads)
  conversations: [
    {
      id: 'c1',
      platform: 'telegram',
      between: 'Aurum & P. Jackson',
      lastMessage: 'How does the new pricing work?',
      date: '2026-06-28T14:23:11Z',
    },
    {
      id: 'c2',
      platform: 'slack',
      between: 'Aurum & M. Lee',
      lastMessage: '@assistant summarize the Q2 roadmap',
      date: '2026-06-28T13:48:02Z',
    },
    {
      id: 'c3',
      platform: 'web',
      between: 'Aurum & S. Powell',
      lastMessage: 'Help with integration steps',
      date: '2026-06-28T11:12:30Z',
    },
    {
      id: 'c4',
      platform: 'telegram',
      between: 'Aurum & R. Kim',
      lastMessage: 'Can you send the onboarding guide?',
      date: '2026-06-28T09:40:05Z',
    },
    {
      id: 'c5',
      platform: 'slack',
      between: 'Aurum & D. Ortiz',
      lastMessage: 'What is our refund policy?',
      date: '2026-06-27T18:55:21Z',
    },
    {
      id: 'c6',
      platform: 'web',
      between: 'Aurum & L. Chen',
      lastMessage: 'Demo request for next week',
      date: '2026-06-27T16:02:09Z',
    },
    {
      id: 'c7',
      platform: 'telegram',
      between: 'Aurum & T. Novak',
      lastMessage: 'Is there an annual discount?',
      date: '2026-06-27T12:31:44Z',
    },
    {
      id: 'c8',
      platform: 'slack',
      between: 'Aurum & B. Adams',
      lastMessage: 'Sync the latest contacts please',
      date: '2026-06-26T20:18:53Z',
    },
    {
      id: 'c9',
      platform: 'web',
      between: 'Aurum & G. Rossi',
      lastMessage: 'Where can I find the API docs?',
      date: '2026-06-26T15:47:02Z',
    },
    {
      id: 'c10',
      platform: 'telegram',
      between: 'Aurum & N. Patel',
      lastMessage: 'Reset my workspace token',
      date: '2026-06-26T10:09:38Z',
    },
    {
      id: 'c11',
      platform: 'slack',
      between: 'Aurum & E. Schmidt',
      lastMessage: 'Add me to the Q3 planning thread',
      date: '2026-06-25T19:24:11Z',
    },
    {
      id: 'c12',
      platform: 'web',
      between: 'Aurum & F. Mwangi',
      lastMessage: 'Trouble connecting Notion',
      date: '2026-06-25T14:55:27Z',
    },
    {
      id: 'c13',
      platform: 'telegram',
      between: 'Aurum & K. Larsen',
      lastMessage: 'Thanks, that worked!',
      date: '2026-06-24T08:41:50Z',
    },
  ],

  // source: communication_logs (team room feed) - not wired this pass
  teamChat: [
    {
      id: 't1',
      author: 'Maria',
      time: '10:24 AM',
      message: 'Added new onboarding guide to knowledge base.',
    },
    {
      id: 't2',
      author: 'Alex',
      time: '09:47 AM',
      message: 'Updated the pricing doc. Please review.',
    },
    { id: 't3', author: 'Sofia', time: 'Yesterday', message: 'Connected Notion workspace.' },
  ],

  // source: knowledge_documents + versions (actor_type = 'agent') - not wired this pass
  contributions: [
    {
      id: 'k1',
      title: 'Onboarding Guide',
      author: 'Maria',
      source: 'Obsidian',
      words: 1240,
      time: '2h ago',
    },
    {
      id: 'k2',
      title: 'Pricing Overview',
      author: 'Alex',
      source: 'Notion',
      words: 890,
      time: '4h ago',
    },
    {
      id: 'k3',
      title: 'Integration Docs',
      author: 'Ops bot',
      source: 'Web',
      words: 1532,
      time: '6h ago',
    },
  ],

  // source: company_brief (+ company_brief_answers)
  brief: {
    status: 'complete', // 'complete' | 'in_progress' | 'empty'
    summary:
      'Aurum helps teams unlock productivity with AI-powered assistance across their favorite tools.',
    questionCount: 18,
  },
  arena: {
    compared: 11,
    wins: { people: 4, agents: 6, tie: 1 },
    savedMoney: 412,
    savedMinutes: 560,
    departments: [
      { id: 'marketing', label: 'Marketing', people: 1, agents: 4, n: 5 },
      { id: 'developing', label: 'Developing', people: 3, agents: 2, n: 6 },
      { id: 'legal', label: 'Legal', people: 2, agents: 0, n: 2 },
      { id: 'management', label: 'Management', people: 0, agents: 0, n: 0 },
      { id: 'operations', label: 'Operations', people: 1, agents: 3, n: 4 },
      { id: 'accountants', label: 'Accountants', people: 2, agents: 1, n: 3 },
    ],
    headline: 'Marketing looks ready to hand over',
    warning: 'Legal still needs people',
  },

  // source: assistant_setup.config.voice + voiceboxService status/profiles
  voice: {
    name: 'Aria',
    provider: 'voicebox', // 'voicebox' | 'builtin'
    status: 'reachable', // 'reachable' | 'unreachable' | 'unknown'
    language: 'English',
    profileId: 'aria',
    profiles: [
      { id: 'aria', name: 'Aria' },
      { id: 'nova', name: 'Nova' },
      { id: 'leo', name: 'Leo' },
    ],
    sampleText: 'Hello! How can I help you today?',
    audioUrl: null,
    positionLabel: '0:00',
    durationLabel: '0:06',
  },

  // source: llm_usage aggregation scoped to assistant sources (usageService.fetchUsage)
  usage: {
    totalTokens: 412000,
    totalCost: 2.86,
    models: [
      { model: 'gpt-4o', tokens: 256000, pct: 62, cost: 2.05 },
      { model: 'gpt-4o-mini', tokens: 98000, pct: 24, cost: 0.49 },
      { model: 'text-embedding-3-small', tokens: 58000, pct: 14, cost: 0.32 },
    ],
    timeseries: [
      { date: '2026-06-22', tokens: 41000, cost: 0.28 },
      { date: '2026-06-23', tokens: 52000, cost: 0.36 },
      { date: '2026-06-24', tokens: 47000, cost: 0.33 },
      { date: '2026-06-25', tokens: 68000, cost: 0.47 },
      { date: '2026-06-26', tokens: 59000, cost: 0.41 },
      { date: '2026-06-27', tokens: 73000, cost: 0.5 },
      { date: '2026-06-28', tokens: 72000, cost: 0.51 },
    ],
  },

  // source: communication_logs aggregated into daily inbound counts
  // (format.buildActivitySeries). 90 deterministic points (no Math.random) so
  // the Activity chart looks full in Demo mode and stays stable in tests.
  activity: Array.from({ length: 90 }, (_, i) => {
    const d = new Date('2026-06-28');
    d.setDate(d.getDate() - (89 - i));
    const wave = Math.sin(i * 0.4) + Math.sin(i * 0.13 + 1);
    const count = Math.round(14 + ((wave + 2) / 4) * 38);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date, count };
  }),

  // source: assistant insights generator (assistant-first-steps)
  insights: {
    description:
      "Generate AI-powered insights about your assistant's performance, knowledge usage, and conversation trends.",
    generated: false,
    privateNote: 'Insights are private to your team',
  },
};

export default MOCK_ASSISTANT_CONSOLE;
