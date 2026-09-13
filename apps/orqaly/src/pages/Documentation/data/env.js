/**
 * Environment variables, from .env.example. `scope` is Client (VITE_, exposed to
 * the browser) or Server (never shipped to the client). Grouped for readability.
 */
export const ENV_VARS = [
  // Core
  {
    name: 'VITE_SUPABASE_URL',
    scope: 'Client',
    req: true,
    group: 'Core',
    description: 'Supabase project URL for the SPA.',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    scope: 'Client',
    req: true,
    group: 'Core',
    description: 'Supabase anon public key for client auth.',
  },
  {
    name: 'SUPABASE_URL',
    scope: 'Server',
    req: true,
    group: 'Core',
    description: 'Server-side Supabase URL for token verification.',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'Server',
    req: true,
    group: 'Core',
    description: 'Service-role key for backend workers (bypasses RLS).',
  },
  {
    name: 'GROQ_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description:
      'Required when Groq is the selected platform default; also used for transcription.',
  },
  {
    name: 'WORKER_SECRET',
    scope: 'Server',
    req: true,
    group: 'Core',
    description: 'Bearer secret for the /api/agent?path=process-next worker.',
  },
  {
    name: 'CRON_SECRET',
    scope: 'Server',
    req: true,
    group: 'Core',
    description:
      'Bearer secret injected into scheduled worker requests; unauthenticated cron requests are rejected.',
  },
  {
    name: 'ORQ_KEK_V1',
    scope: 'Server',
    req: true,
    group: 'Core',
    description: '32-byte base64 root key-encryption-key for BYOK envelopes.',
  },

  // LLM providers (optional - BYOK per user is preferred)
  {
    name: 'OPENAI_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'OpenAI executor + Consilium member.',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'Anthropic (Claude) executor + Consilium member.',
  },
  {
    name: 'GEMINI_API_KEY',
    scope: 'Server',
    req: true,
    group: 'LLM Providers',
    description:
      'Required by the release-default Google provider for server-side gemini-3.8-flash execution.',
  },
  {
    name: 'LLM_DEFAULT_PROVIDER',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description:
      'Platform default provider. Configure together with LLM_DEFAULT_MODEL; defaults to Google Gemini when unset.',
  },
  {
    name: 'LLM_DEFAULT_MODEL',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description:
      'Model for the selected platform default provider; defaults to the exact gemini-3.8-flash release model.',
  },
  {
    name: 'LLM_DEFAULT_CHEAP_MODEL',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description:
      'Cheap-tier model. This release pins it to gemini-3.8-flash with the Google default.',
  },
  {
    name: 'GEMINI_REASONING_EFFORT',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'Reasoning level for Gemini 3.6+ calls: low, medium, or high. Defaults to medium.',
  },
  {
    name: 'GLM_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'GLM (Zhipu) provider / default system model.',
  },
  {
    name: 'QWEN_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'Alibaba Qwen via DashScope (optional QWEN_API_URL).',
  },
  {
    name: 'DEEPSEEK_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'DeepSeek provider / Consilium member.',
  },
  {
    name: 'OPENROUTER_API_KEY',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'OpenRouter aggregator.',
  },
  {
    name: 'OLLAMA_BASE_URL',
    scope: 'Server',
    req: false,
    group: 'LLM Providers',
    description: 'Local Ollama base URL for self-hosted models.',
  },

  // Email / transcription / voice
  {
    name: 'RESEND_API_KEY',
    scope: 'Server',
    req: false,
    group: 'Email & Voice',
    description: 'Resend transactional email (sender must be verified).',
  },
  {
    name: 'RESEND_FROM_EMAIL',
    scope: 'Server',
    req: false,
    group: 'Email & Voice',
    description: 'Verified from-address for outbound email.',
  },
  {
    name: 'ASSEMBLYAI_API_KEY',
    scope: 'Server',
    req: false,
    group: 'Email & Voice',
    description: 'Fallback transcription provider.',
  },
  {
    name: 'ELEVENLABS_API_KEY',
    scope: 'Server',
    req: false,
    group: 'Email & Voice',
    description: 'Natural AI voice output.',
  },
  {
    name: 'HF_API_KEY',
    scope: 'Server',
    req: false,
    group: 'Email & Voice',
    description: 'Hugging Face embeddings for KB RAG (else hash fallback).',
  },

  // Payments
  {
    name: 'STRIPE_SECRET_KEY',
    scope: 'Server',
    req: false,
    group: 'Payments',
    description: 'Stripe Connect for marketplace monetization.',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    scope: 'Server',
    req: false,
    group: 'Payments',
    description: 'Verify Stripe webhook signatures.',
  },

  // OAuth / integrations
  {
    name: 'PUBLIC_BASE_URL',
    scope: 'Server',
    req: false,
    group: 'Integrations',
    description: 'Public origin used for OAuth redirects.',
  },
  {
    name: 'DROPBOX_CLIENT_ID',
    scope: 'Server',
    req: false,
    group: 'Integrations',
    description: 'Dropbox KB OAuth app (+ DROPBOX_CLIENT_SECRET).',
  },
  {
    name: 'ONEDRIVE_CLIENT_ID',
    scope: 'Server',
    req: false,
    group: 'Integrations',
    description: 'OneDrive (Azure) KB OAuth app (+ secret).',
  },
  {
    name: 'GITHUB_TOKEN',
    scope: 'Server',
    req: false,
    group: 'Integrations',
    description: 'GitHub Intelligence researcher agent.',
  },
  {
    name: 'VT_API_KEY',
    scope: 'Server',
    req: false,
    group: 'Integrations',
    description: 'VirusTotal scan of imported key files (fail-closed).',
  },

  // AxWise cognition and goal orchestration (server-to-server only)
  {
    name: 'AXWISE_ENABLE',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Global AxWise gate; only the exact value true enables outbound calls.',
  },
  {
    name: 'AXWISE_ENFORCE',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description:
      'shadow observes decisions; authoritative may apply revalidated assignments. Neither mode bypasses the two human approvals.',
  },
  {
    name: 'AXWISE_API_URL',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Server-side AxWise API base URL ending at the Orqaly integration v1 boundary.',
  },
  {
    name: 'AXWISE_API_KEY',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Server-to-server AxWise credential. Never expose it through a VITE_ variable.',
  },
  {
    name: 'AXWISE_RESEARCH_MAX_COST_USD',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Maximum allowed cost for AxWise-selected bounded research.',
  },
  {
    name: 'AXWISE_RESEARCH_ESTIMATED_COST_USD',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Estimated research cost supplied to the value-of-information router.',
  },
  {
    name: 'AXWISE_RESEARCH_MAX_LATENCY_MS',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Maximum allowed latency for AxWise-selected bounded research.',
  },
  {
    name: 'AXWISE_RESEARCH_ESTIMATED_LATENCY_MS',
    scope: 'Server',
    req: false,
    group: 'AxWise',
    description: 'Estimated research latency supplied to the value-of-information router.',
  },

  // Ops / misc
  {
    name: 'SECURITY_GUARD_ENFORCE',
    scope: 'Server',
    req: false,
    group: 'Ops',
    description: 'true blocks high-severity content-guard hits; false = observe-only.',
  },
  {
    name: 'VITE_SENTRY_DSN',
    scope: 'Client',
    req: false,
    group: 'Ops',
    description: 'Client-side error tracking.',
  },
];

export const ENV_GROUPS = [...new Set(ENV_VARS.map((v) => v.group))];
