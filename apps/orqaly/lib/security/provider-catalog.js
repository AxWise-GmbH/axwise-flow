/**
 * Server-side allow-list of providers supported by the /settings/keys page.
 *
 * Shape per entry:
 *  - id:      canonical provider id (matches user_api_keys.provider)
 *  - envVar:  process.env fallback when user has no key set
 *  - probe:   how to validate a candidate key ({ method, url, authHeader })
 *  - keyRegex: (optional) reject obvious garbage early
 *
 * Note on Gemini: AI Studio issues classic `AIza…` keys, but Google also hands
 * out `AQ.…` credentials that authenticate against the same Generative
 * Language endpoints (verified against v1beta models + openai/chat/completions).
 * Both forms are accepted so a working key is not rejected at save time.
 *  - anthropicStyle: true for providers that authenticate with x-api-key + POST
 */

export const PROVIDER_CATALOG = {
  // ── LLM Providers ────────────────────────────────────────────────
  'llm:openai':     { envVar: 'OPENAI_API_KEY',     probe: { method: 'GET',  url: 'https://api.openai.com/v1/models',             authHeader: 'Authorization: Bearer' }, keyRegex: /^sk-[A-Za-z0-9_-]{16,}$/ },
  'llm:groq':       { envVar: 'GROQ_API_KEY',       probe: { method: 'GET',  url: 'https://api.groq.com/openai/v1/models',         authHeader: 'Authorization: Bearer' }, keyRegex: /^gsk_[A-Za-z0-9]{16,}$/ },
  'llm:anthropic':  { envVar: 'ANTHROPIC_API_KEY',  probe: { method: 'POST', url: 'https://api.anthropic.com/v1/messages',         anthropicStyle: true },                 keyRegex: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  'llm:deepseek':   { envVar: 'DEEPSEEK_API_KEY',   probe: { method: 'GET',  url: 'https://api.deepseek.com/v1/models',            authHeader: 'Authorization: Bearer' } },
  'llm:glm':        { envVar: 'GLM_API_KEY',        probe: null /* no public models endpoint */ },
  'llm:qwen':       { envVar: 'QWEN_API_KEY',       probe: { method: 'GET',  url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', authHeader: 'Authorization: Bearer' } },
  'llm:gemini':     { envVar: 'GEMINI_API_KEY',     probe: { method: 'GET',  url: 'https://generativelanguage.googleapis.com/v1beta/models',  authHeader: 'x-goog-api-key' }, keyRegex: /^(AIza[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9._-]{20,})$/ },
  'llm:openrouter': { envVar: 'OPENROUTER_API_KEY', probe: { method: 'GET',  url: 'https://openrouter.ai/api/v1/models',           authHeader: 'Authorization: Bearer' } },
  'llm:vercel-ai-gateway': { envVar: 'AI_GATEWAY_API_KEY', probe: null },
  'llm:ollama':            { envVar: 'OLLAMA_BASE_URL',    probe: null },
  'llm:local-openai':      { envVar: 'LOCAL_OPENAI_URL',   probe: null },

  // ── Transcription & Voice ────────────────────────────────────────
  'voice:assemblyai': { envVar: 'ASSEMBLYAI_API_KEY', probe: { method: 'GET', url: 'https://api.assemblyai.com/v2/transcript?limit=1', authHeader: 'Authorization' /* no Bearer */ } },
  'voice:elevenlabs': { envVar: 'ELEVENLABS_API_KEY', probe: { method: 'GET', url: 'https://api.elevenlabs.io/v1/user',                authHeader: 'xi-api-key' } },
  'voice:deepgram':   { envVar: 'DEEPGRAM_API_KEY',   probe: { method: 'GET', url: 'https://api.deepgram.com/v1/projects',              authHeader: 'Authorization: Token' } },

  // ── Search & Research ────────────────────────────────────────────
  'search:tavily':     { envVar: 'TAVILY_API_KEY',     probe: null },
  'search:brave':      { envVar: 'BRAVE_API_KEY',      probe: { method: 'GET', url: 'https://api.search.brave.com/res/v1/web/search?q=test', authHeader: 'X-Subscription-Token' } },
  'search:serpapi':    { envVar: 'SERPAPI_API_KEY',    probe: null },
  'search:firecrawl':  { envVar: 'FIRECRAWL_API_KEY',  probe: null },
  'search:brandfetch': { envVar: 'BRANDFETCH_API_KEY', probe: null },

  // ── Development ──────────────────────────────────────────────────
  'dev:github':        { envVar: 'GITHUB_TOKEN',       probe: { method: 'GET', url: 'https://api.github.com/user',               authHeader: 'Authorization: Bearer' } },
  'dev:vercel':        { envVar: 'VERCEL_TOKEN',       probe: { method: 'GET', url: 'https://api.vercel.com/v2/user',            authHeader: 'Authorization: Bearer' } },
  'dev:cloudflare':    { envVar: 'CLOUDFLARE_API_TOKEN', probe: { method: 'GET', url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', authHeader: 'Authorization: Bearer' } },

  // ── Communication ────────────────────────────────────────────────
  'comm:resend':       { envVar: 'RESEND_API_KEY',     probe: { method: 'GET', url: 'https://api.resend.com/domains',            authHeader: 'Authorization: Bearer' } },
  'comm:slack':        { envVar: 'SLACK_BOT_TOKEN',    probe: { method: 'GET', url: 'https://slack.com/api/auth.test',           authHeader: 'Authorization: Bearer' } },
  'comm:twitter':      { envVar: 'TWITTER_BEARER_TOKEN', probe: null },

  // ── Media & Creative ─────────────────────────────────────────────
  'media:stability':   { envVar: 'STABILITY_API_KEY',  probe: { method: 'GET', url: 'https://api.stability.ai/v1/user/account',   authHeader: 'Authorization: Bearer' } },
  'media:replicate':   { envVar: 'REPLICATE_API_TOKEN', probe: { method: 'GET', url: 'https://api.replicate.com/v1/account',      authHeader: 'Authorization: Token' } },
  'media:pexels':      { envVar: 'PEXELS_API_KEY',     probe: { method: 'GET', url: 'https://api.pexels.com/v1/curated?per_page=1', authHeader: 'Authorization' } },
  'media:unsplash':    { envVar: 'UNSPLASH_ACCESS_KEY', probe: null },
  'media:figma':       { envVar: 'FIGMA_ACCESS_TOKEN', probe: { method: 'GET', url: 'https://api.figma.com/v1/me', authHeader: 'X-Figma-Token' } },
  'media:canva':       { envVar: 'CANVA_API_KEY',      probe: null },

  // ── Data & Analytics ─────────────────────────────────────────────
  'data:alphavantage': { envVar: 'ALPHA_VANTAGE_KEY',  probe: null },
  'data:pinecone':     { envVar: 'PINECONE_API_KEY',   probe: null },
  'data:huggingface':  { envVar: 'HUGGINGFACE_API_KEY', probe: { method: 'GET', url: 'https://huggingface.co/api/whoami-v2', authHeader: 'Authorization: Bearer' } },
  'data:notion':       { envVar: 'NOTION_API_KEY',     probe: null /* requires Notion-Version header */ },
  'data:obsidian':     { envVar: 'OBSIDIAN_API_KEY',   probe: null },
  'data:linear':       { envVar: 'LINEAR_API_KEY',     probe: null /* GraphQL POST required */ },

  // ── Cloud storage (Knowledge Base sources) ───────────────────────
  // BYOK access tokens; the same providers also support OAuth (Dropbox/OneDrive)
  // and file-import. Mega has no token API — its value is a JSON {email,password}
  // blob resolved by mega-ingest, so it is probe-less.
  'data:dropbox':      { envVar: 'DROPBOX_API_KEY',    probe: null /* RPC endpoint rejects a JSON content-type with empty body; validated at sync time */ },
  'data:onedrive':     { envVar: 'ONEDRIVE_API_KEY',   probe: { method: 'GET',  url: 'https://graph.microsoft.com/v1.0/me/drive',                authHeader: 'Authorization: Bearer' } },
  'data:google-drive': { envVar: 'GOOGLE_DRIVE_API_KEY', probe: { method: 'GET', url: 'https://www.googleapis.com/drive/v3/about?fields=user',  authHeader: 'Authorization: Bearer' } },
  'data:mega':         { envVar: 'MEGA_API_KEY',       probe: null /* value is a JSON {email,password} blob */ },

  // ── Execution & Automation ───────────────────────────────────────
  'exec:e2b':          { envVar: 'E2B_API_KEY',        probe: null },
  'exec:browserless':  { envVar: 'BROWSERLESS_API_KEY', probe: null },
  'exec:twocaptcha':   { envVar: 'TWOCAPTCHA_API_KEY', probe: null },

  // ── Composio (integration hub) ───────────────────────────────────
  'composio:master':   { envVar: 'COMPOSIO_API_KEY',   probe: { method: 'GET', url: 'https://backend.composio.dev/api/v1/apps',   authHeader: 'X-API-Key' } },
};

export function isKnownProvider(id) {
  if (!id || typeof id !== 'string') return false;
  // Allow dynamic tool:<id> entries from the legacy `tools` table — these
  // ride the same BYOK storage; probing resolves through TOOL_PROVIDER_ALIAS
  // where a target exists, and falls back to tool-setup.js's own check.
  if (id.startsWith('tool:') && id.length > 5 && id.length <= 128) return true;
  return Object.hasOwn(PROVIDER_CATALOG, id);
}

/**
 * Catalog tool id -> the PROVIDER_CATALOG entry holding the SAME service's SAME
 * credential. Two jobs:
 *
 *  1. Read: an agent needing `tool-web-search` can use the key the user already
 *     pasted at Settings -> Search -> Tavily. Without this, `tools.id` being the
 *     primary key alone means only the first account in the whole database can
 *     ever own a catalog tool row — everyone else is locked out of every tool.
 *  2. Probe: gives `tool:<id>` a working validation endpoint for free.
 *
 * Read-only. We never WRITE to an alias, and `tool:<id>` always wins over it.
 *
 * ACCEPTED RISK, decided explicitly: dev:github and data:notion are read-scoped
 * consents today (github-agents-import.js:536 lists repos; notion-sync.js:42
 * syncs the KB) while tool-github and tool-notion WRITE (create_repo, put_file,
 * create_pull_request, create_page). Sharing one key per service was the product
 * decision; the injection chain it would otherwise open is closed at the
 * assignment layer instead — agent-tool-scout.js withholds write-capable tools
 * from agents whose prompt came from outside. Every alias resolution audits with
 * reason `agent.tool:<id>.alias`, so an agent's write stays distinguishable from
 * a feature's read.
 *
 * Omissions are deliberate; each would be a real bug:
 *   tool-capsolver-solver  api.capsolver.com is NOT 2Captcha — different vendor
 *   tool-sms-verify        5sim.net, no catalog entry
 *   tool-analytics         needs TWO credentials (GA_PROPERTY_ID + GA_API_KEY)
 *   tool-rentahuman        no catalog entry
 * provider-catalog.test.js asserts every alias target's envVar equals the tool's
 * own declared credential, so a mismatch of that class cannot be added silently.
 */
export const TOOL_PROVIDER_ALIAS = {
  'tool-web-search': 'search:tavily',
  'tool-email': 'comm:resend',
  'tool-financial-data': 'data:alphavantage',
  'tool-github': 'dev:github',
  'tool-vercel': 'dev:vercel',
  'tool-pexels': 'media:pexels',
  'tool-unsplash': 'media:unsplash',
  'tool-figma': 'media:figma',
  'tool-code-sandbox': 'exec:e2b',
  'tool-twitter': 'comm:twitter',
  'tool-canva': 'media:canva',
  'tool-slack': 'comm:slack',
  'tool-notion': 'data:notion',
  'tool-linear': 'data:linear',
  'tool-browser': 'exec:browserless',
  'tool-captcha-solver': 'exec:twocaptcha',
};

/** 'tool:tool-github' -> 'dev:github'. Null for anything else. */
export function aliasFor(providerId) {
  if (typeof providerId !== 'string' || !providerId.startsWith('tool:')) return null;
  return TOOL_PROVIDER_ALIAS[providerId.slice(5)] || null;
}

/**
 * Probe a candidate key by hitting the provider's check endpoint. Sanitized
 * response — never echoes key material.
 */
export async function probeProviderKey(providerId, candidateKey) {
  // A `tool:<id>` has no catalog entry of its own; probe through its alias where
  // one exists, so tool:tool-github validates against dev:github's GET /user.
  // Without this the Settings dialog is permanently unsaveable for tool:* —
  // KeyDialog.jsx gates Save on probe.ok.
  const entry = PROVIDER_CATALOG[providerId] ?? PROVIDER_CATALOG[aliasFor(providerId)];
  if (!entry) return { ok: false, code: 'UNKNOWN_PROVIDER', message: 'Unknown provider' };
  if (entry.keyRegex && !entry.keyRegex.test(candidateKey)) {
    return { ok: false, code: 'BAD_FORMAT', message: 'Key does not match expected format' };
  }
  if (!entry.probe) {
    return { ok: true, code: 'NO_PROBE', message: 'No probe endpoint — format validated only', latencyMs: 0 };
  }
  const { method, url, authHeader, anthropicStyle } = entry.probe;
  const headers = { 'Content-Type': 'application/json' };
  let body;
  if (anthropicStyle) {
    headers['x-api-key'] = candidateKey;
    headers['anthropic-version'] = '2023-06-01';
    body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
  } else if (authHeader) {
    const [headerName, prefix] = authHeader.split(': ');
    headers[headerName] = prefix ? `${prefix} ${candidateKey}` : candidateKey;
  }

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
    });
    const latencyMs = Date.now() - started;
    if (res.ok || res.status === 201) {
      return { ok: true, code: 'OK', status: res.status, latencyMs };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'UNAUTHORIZED', status: res.status, message: 'Provider rejected the key', latencyMs };
    }
    // Anthropic returns 400 "credit balance too low" with a valid key — treat as pass-through success for validation
    if (anthropicStyle && res.status === 400) {
      return { ok: true, code: 'OK_WITH_WARN', status: 400, message: 'Auth OK (request content rejected)', latencyMs };
    }
    return { ok: false, code: 'PROVIDER_ERROR', status: res.status, message: `Provider returned ${res.status}`, latencyMs };
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err.message || 'Network error', latencyMs: Date.now() - started };
  }
}
