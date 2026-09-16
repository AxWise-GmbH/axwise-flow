// Single source of truth for /security.

export const HERO = {
  eyebrow: 'Trust & Security',
  title: 'Security is a product feature.',
  subtitle:
    'Orqaly handles your goals, customer conversations, provider keys, and audit trails. Here is the full stack we run on - and how we keep your workspace isolated.',
};

export const TRUST_STATS = [
  { value: 'RLS', label: 'on every table', sub: 'tenant isolation in Postgres' },
  { value: 'JWT', label: 'every API route', sub: 'validated before handlers run' },
  { value: 'BYOK', label: '+ BYOS', sub: 'your keys, your storage' },
  { value: 'VT', label: 'file scanning', sub: 'VirusTotal on imports' },
];

export const PILLARS_INTRO =
  'Controls built into the product - not a PDF you receive after signup.';

export const PILLARS = [
  {
    iconName: 'LockOutlined',
    title: 'Encryption in transit & at rest',
    body: 'TLS 1.2+ on every edge route. Supabase Postgres encrypted at rest with AES-256.',
  },
  {
    iconName: 'ShieldOutlined',
    title: 'Row-Level Security on every table',
    body: "Authorization enforced in the database - a bug in the API cannot return another workspace's rows.",
  },
  {
    iconName: 'VpnKeyOutlined',
    title: 'BYOK - your provider keys',
    body: 'OpenAI, Anthropic, Groq, Gemini, and more. Keys stay in your workspace, encrypted, used only when your agents run.',
  },
  {
    iconName: 'StorageOutlined',
    title: 'BYOS - bring your own storage',
    body: 'Connect your Supabase bucket or S3-compatible store for files and recordings. We do not read your object contents.',
  },
  {
    iconName: 'VisibilityOutlined',
    title: 'Audit logs by default',
    body: 'Who did what, when, with which model and tool - queryable from day one. Retention configurable on paid plans.',
  },
  {
    iconName: 'VerifiedUserOutlined',
    title: 'Rate limits & least privilege',
    body: 'Per-route rate limits by IP and account. Service tokens scoped to the minimum surface each job needs.',
  },
];

/** Vendors Orqaly operates on (infrastructure & first-party integrations). */
export const OPERATED_STACK = [
  {
    category: 'Hosting & runtime',
    items: [
      { name: 'Vercel', detail: 'Serverless Node.js app + API, edge routing' },
      { name: 'React + Vite', detail: 'SPA frontend (no secrets in bundle)' },
    ],
  },
  {
    category: 'Data & identity',
    items: [
      { name: 'Supabase', detail: 'PostgreSQL, Auth, Storage, Realtime' },
      { name: 'Row-Level Security', detail: 'Per-workspace isolation on all tables' },
    ],
  },
  {
    category: 'AI & voice (platform defaults)',
    items: [
      { name: 'OpenAI', detail: 'Models when you bring keys or platform routing' },
      { name: 'Anthropic', detail: 'Claude family via BYOK' },
      { name: 'Groq', detail: 'Fast inference + Whisper transcription' },
      { name: 'AssemblyAI', detail: 'Speech-to-text for voice channels' },
      { name: 'ElevenLabs / Deepgram', detail: 'Optional voice providers via BYOK' },
    ],
  },
  {
    category: 'Payments & email',
    items: [
      { name: 'Cryptocurrency/Fiat', detail: 'Billing and checkout' },
      { name: 'Stripe Connect', detail: 'Marketplace creator payouts (85 / 15)' },
      { name: 'Resend', detail: 'Transactional email delivery' },
    ],
  },
  {
    category: 'Observability & safety',
    items: [
      { name: 'Sentry', detail: 'Error monitoring with PII scrubbing' },
      { name: 'VirusTotal', detail: 'Hash-and-scan on marketplace imports' },
      { name: 'Sandboxed execution', detail: 'Isolated first run before production access' },
    ],
  },
];

export const INTEGRATIONS_INTRO =
  'Beyond the core stack, members connect 40+ providers through BYOK - keys never leave your workspace boundary.';

export const ACCESS_CONTROLS = [
  'Supabase Auth: email/password, magic link, and OAuth providers.',
  'Per-workspace RBAC with audit-logged role changes.',
  'Optional PIN-gated areas for sensitive control surfaces.',
  'Sessions expire; refresh tokens rotate automatically.',
  'API handlers reject unauthenticated requests before business logic.',
];

export const COMPLIANCE = [
  { label: 'GDPR', status: 'Operational', note: 'See /privacy and /cookies.' },
  { label: 'SOC 2 Type I', status: 'In progress', note: 'Expected H2 2026.' },
  { label: 'ISO 27001', status: 'Planned', note: 'Target 2027.' },
  { label: 'DPA', status: 'On request', note: 'Available via /contact for paid customers.' },
];

export const DISCLOSURE = {
  email: 'security@orqaly.com',
  body: 'Found a vulnerability? Email us with steps to reproduce. We acknowledge within 48 hours and aim to resolve critical issues within 7 days. We do not pursue researchers acting in good faith.',
};
