/**
 * Supported LLM providers, from lib/agent-handlers/llm-executor.js and
 * lib/security/provider-catalog.js. Pure data - no service imports.
 */
export const LLM_PROVIDERS = [
  {
    name: 'Groq',
    id: 'groq',
    model: 'llama-3.3-70b-versatile',
    env: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    note: 'Primary + transcription; very fast.',
  },
  {
    name: 'OpenAI',
    id: 'openai',
    model: 'gpt-4o-mini',
    env: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    note: 'GPT-4o family.',
  },
  {
    name: 'Anthropic',
    id: 'anthropic',
    model: 'claude-sonnet-5',
    env: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    note: 'Claude; native messages shape.',
  },
  {
    name: 'Google Gemini',
    id: 'gemini',
    model: 'gemini-3.8-flash',
    env: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    note: "GA Flash model through Google's OpenAI-compatible endpoint.",
  },
  {
    name: 'GLM (Zhipu)',
    id: 'glm',
    model: 'glm-5.1',
    env: 'GLM_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    note: 'Default system provider.',
  },
  {
    name: 'Qwen (Alibaba)',
    id: 'qwen',
    model: 'qwen-max',
    env: 'QWEN_API_KEY',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    note: 'DashScope; OpenAI-compatible.',
  },
  {
    name: 'DeepSeek',
    id: 'deepseek',
    model: 'deepseek-chat',
    env: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    note: 'Optional Consilium member.',
  },
  {
    name: 'OpenRouter',
    id: 'openrouter',
    model: 'per-request',
    env: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    note: 'Aggregator across many models.',
  },
  {
    name: 'Ollama (local)',
    id: 'ollama',
    model: 'llama3',
    env: 'OLLAMA_BASE_URL',
    baseUrl: '<your host>/v1',
    note: 'Self-hosted; local-first.',
  },
  {
    name: 'Local OpenAI',
    id: 'local-openai',
    model: 'local-model',
    env: 'LOCAL_OPENAI_URL',
    baseUrl: '<your host>',
    note: 'Any OpenAI-compatible server.',
  },
  {
    name: 'Claude Code',
    id: 'claude-code',
    model: 'claude-opus-5',
    env: '~/.claude OAuth',
    baseUrl: 'agent SDK (localhost)',
    note: 'Localhost only; blocked on Vercel.',
  },
];

/** Default fallback order used when a provider is slow, rate-limited, or errors. */
export const FALLBACK_CHAIN = ['glm', 'gemini', 'openai', 'groq', 'anthropic'];

export const PROVIDER_NOTES = [
  {
    title: 'Automatic fallback',
    body: 'If a provider times out, returns 429/403/5xx, or hits a billing error, the executor advances to the next provider in the chain. A 403 marks a provider dead for ~15 minutes. Compare-mode goals can pin a provider and fail fast instead.',
  },
  {
    title: 'Local-first hybrid',
    body: 'Routine work runs on cheap or local models; stronger cloud models are reserved for hard planning. On localhost, Anthropic requests can reroute to Claude Code automatically.',
  },
  {
    title: 'Usage & cost tracking',
    body: 'Every call estimates cost from per-1K token pricing and writes provider, model, prompt/completion tokens, duration, status, and entity links (goal, agent, team, org) to the llm_usage table. Surfaced by /api/ops?path=usage-analytics.',
  },
  {
    title: 'BYOK envelope encryption',
    body: 'User-provided keys use AES-256-GCM envelope encryption: a per-row data key is wrapped by the root KEK (ORQ_KEK_V1), with AAD binding the ciphertext to user:provider:slot. User-context LLM calls require a user key (BYOK_REQUIRED); only system/cron jobs may fall back to platform env keys.',
  },
];
