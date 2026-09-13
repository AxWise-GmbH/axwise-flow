/**
 * UI-side provider catalog: human labels, doc URLs, category grouping.
 * Must be kept in sync with `lib/security/provider-catalog.js`.
 */

export const CATEGORIES = [
  {
    id: 'llm',
    label: 'LLM Providers',
    description: 'Models used by agents, assistant, and Concilium.',
  },
  {
    id: 'voice',
    label: 'Transcription & Voice',
    description: 'Speech-to-text and text-to-speech.',
  },
  { id: 'search', label: 'Search & Research', description: 'Web search and scraping.' },
  { id: 'dev', label: 'Development', description: 'Code hosting and deployment.' },
  { id: 'comm', label: 'Communication', description: 'Email, chat, and social APIs.' },
  {
    id: 'media',
    label: 'Media & Creative',
    description: 'Image, video, design, and stock assets.',
  },
  {
    id: 'data',
    label: 'Data & Analytics',
    description: 'Analytics, vector DBs, and reference data.',
  },
  {
    id: 'exec',
    label: 'Execution & Automation',
    description: 'Code sandboxes, browser automation.',
  },
  {
    id: 'composio',
    label: 'Composio Hub',
    description: '40+ OAuth integrations via a single Composio account.',
  },
];

/** id must match lib/security/provider-catalog.js keys exactly. */
export const PROVIDERS = [
  // LLM
  {
    id: 'llm:openai',
    category: 'llm',
    label: 'OpenAI',
    docUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-proj-…',
  },
  {
    id: 'llm:anthropic',
    category: 'llm',
    label: 'Anthropic',
    docUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-…',
  },
  {
    id: 'llm:groq',
    category: 'llm',
    label: 'Groq',
    docUrl: 'https://console.groq.com/keys',
    placeholder: 'gsk_…',
  },
  {
    id: 'llm:deepseek',
    category: 'llm',
    label: 'DeepSeek',
    docUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'llm:glm',
    category: 'llm',
    label: 'Zhipu GLM',
    docUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'llm:qwen',
    category: 'llm',
    label: 'Alibaba Qwen',
    docUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'llm:gemini',
    category: 'llm',
    label: 'Google Gemini',
    docUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIza…',
  },
  {
    id: 'llm:openrouter',
    category: 'llm',
    label: 'OpenRouter',
    docUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'llm:vercel-ai-gateway',
    category: 'llm',
    label: 'Vercel AI Gateway',
    docUrl: 'https://vercel.com/dashboard/ai-gateway',
  },
  {
    id: 'llm:ollama',
    category: 'llm',
    label: 'Ollama (Local)',
    docUrl: 'https://ollama.com',
    placeholder: 'http://localhost:11434',
    helpText: 'Base URL for Ollama',
  },
  {
    id: 'llm:local-openai',
    category: 'llm',
    label: 'Local OpenAI Server',
    docUrl: 'https://lmstudio.ai',
    placeholder: 'http://localhost:1234/v1',
    helpText: 'Base URL for LM Studio, LocalAI, etc.',
  },

  // Voice
  {
    id: 'voice:assemblyai',
    category: 'voice',
    label: 'AssemblyAI',
    docUrl: 'https://www.assemblyai.com/app/api-keys',
  },
  {
    id: 'voice:elevenlabs',
    category: 'voice',
    label: 'ElevenLabs',
    docUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  {
    id: 'voice:deepgram',
    category: 'voice',
    label: 'Deepgram',
    docUrl: 'https://console.deepgram.com/',
  },

  // Search
  { id: 'search:tavily', category: 'search', label: 'Tavily', docUrl: 'https://app.tavily.com' },
  {
    id: 'search:brave',
    category: 'search',
    label: 'Brave Search',
    docUrl: 'https://api.search.brave.com/app/keys',
  },
  {
    id: 'search:serpapi',
    category: 'search',
    label: 'SerpAPI',
    docUrl: 'https://serpapi.com/manage-api-key',
  },
  {
    id: 'search:firecrawl',
    category: 'search',
    label: 'Firecrawl',
    docUrl: 'https://www.firecrawl.dev/app/api-keys',
  },
  {
    id: 'search:brandfetch',
    category: 'search',
    label: 'Brandfetch',
    docUrl: 'https://developers.brandfetch.com/dashboard',
    placeholder: 'bf_…',
  },

  // Dev
  {
    id: 'dev:github',
    category: 'dev',
    label: 'GitHub',
    docUrl: 'https://github.com/settings/tokens',
    placeholder: 'ghp_…',
  },
  {
    id: 'dev:vercel',
    category: 'dev',
    label: 'Vercel',
    docUrl: 'https://vercel.com/account/tokens',
  },
  {
    id: 'dev:cloudflare',
    category: 'dev',
    label: 'Cloudflare',
    docUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },

  // Comm
  { id: 'comm:resend', category: 'comm', label: 'Resend', docUrl: 'https://resend.com/api-keys' },
  {
    id: 'comm:slack',
    category: 'comm',
    label: 'Slack',
    docUrl: 'https://api.slack.com/apps',
    placeholder: 'xoxb-…',
  },
  {
    id: 'comm:twitter',
    category: 'comm',
    label: 'Twitter / X',
    docUrl: 'https://developer.twitter.com/en/portal/dashboard',
  },

  // Media
  {
    id: 'media:stability',
    category: 'media',
    label: 'Stability AI',
    docUrl: 'https://platform.stability.ai/account/keys',
  },
  {
    id: 'media:replicate',
    category: 'media',
    label: 'Replicate',
    docUrl: 'https://replicate.com/account/api-tokens',
  },
  { id: 'media:pexels', category: 'media', label: 'Pexels', docUrl: 'https://www.pexels.com/api' },
  {
    id: 'media:unsplash',
    category: 'media',
    label: 'Unsplash',
    docUrl: 'https://unsplash.com/developers',
  },
  {
    id: 'media:figma',
    category: 'media',
    label: 'Figma',
    docUrl: 'https://www.figma.com/developers/api#access-tokens',
  },
  { id: 'media:canva', category: 'media', label: 'Canva', docUrl: 'https://www.canva.dev/' },

  // Data
  {
    id: 'data:alphavantage',
    category: 'data',
    label: 'Alpha Vantage',
    docUrl: 'https://www.alphavantage.co/support/#api-key',
  },
  { id: 'data:pinecone', category: 'data', label: 'Pinecone', docUrl: 'https://app.pinecone.io' },
  {
    id: 'data:huggingface',
    category: 'data',
    label: 'Hugging Face',
    docUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'data:notion',
    category: 'data',
    label: 'Notion',
    docUrl: 'https://www.notion.so/my-integrations',
  },
  { id: 'data:obsidian', category: 'data', label: 'Obsidian', docUrl: 'https://obsidian.md' },
  {
    id: 'data:linear',
    category: 'data',
    label: 'Linear',
    docUrl: 'https://linear.app/settings/api',
  },

  // Exec
  { id: 'exec:e2b', category: 'exec', label: 'E2B Sandbox', docUrl: 'https://e2b.dev/dashboard' },
  {
    id: 'exec:browserless',
    category: 'exec',
    label: 'Browserless',
    docUrl: 'https://www.browserless.io/account/',
  },
  {
    id: 'exec:twocaptcha',
    category: 'exec',
    label: '2Captcha',
    docUrl: 'https://2captcha.com/enterpage',
  },

  // Composio
  {
    id: 'composio:master',
    category: 'composio',
    label: 'Composio API Key',
    docUrl: 'https://app.composio.dev/settings/api-keys',
    helpText: 'Unlocks 40+ OAuth integrations below.',
  },
];

export const PROVIDERS_BY_CATEGORY = CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = PROVIDERS.filter((p) => p.category === cat.id);
  return acc;
}, {});
