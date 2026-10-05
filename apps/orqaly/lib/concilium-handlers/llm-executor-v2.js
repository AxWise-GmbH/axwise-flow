/**
 * LLM executor v2: Extended executor supporting 5 providers.
 * Does NOT modify the original llm-executor.js.
 *
 * Providers: Groq, OpenAI, Anthropic, DeepSeek, GLM, Qwen, Gemini, OpenRouter, Gateway, Claude Code
 * Each provider uses the OpenAI-compatible chat completions API where possible.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  maybeRerouteToClaudeCode,
  probeClaudeCodeSdk,
  shouldAttemptReroute,
  forbidsPaidFallback,
} from '../_shared/claude-code-reroute.js';
import {
  aggregateLlmUsage,
  buildJsonRepairPrompt,
  needsJsonRepair,
} from '../_shared/llm-json-repair.js';
import { defaultProvider, defaultModel, GEMINI_DEFAULT_MODEL } from '../_shared/llm-defaults.js';
import {
  geminiReasoningEffort,
  isGeminiThinkingModel,
  resolveLlmDeadlineMs,
  resolveLlmNetworkRetries,
} from '../_shared/gemini-reasoning.js';
import {
  assertCurrentJobLeaseLive,
  getCurrentJobLeaseSignal,
  isJobLeaseLostError,
} from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('llm-executor-v2');

// One-shot log so the developer sees the reroute once in the terminal rather
// than on every call. Mirrors llm-executor.js.
let localRerouteLogged = false;

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    isAnthropicApi: true,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  glm: {
    // open.bigmodel.cn is the China-mainland endpoint and is unreliable from
    // Vercel US; GLM_API_URL lets ops point at the international host
    // (https://api.z.ai/api/paas/v4/chat/completions) without a code change.
    url: process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    envKey: 'GLM_API_KEY',
    defaultModel: 'glm-4.6',
  },
  // Alibaba Qwen via DashScope OpenAI-compatible endpoint. Key format: sk-...
  // Default endpoint is International (matches sk- keys issued by the
  // international console). Override with QWEN_API_URL for other regions.
  qwen: {
    url:
      process.env.QWEN_API_URL ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-max',
  },
  // Google Gemini via its OpenAI-compatible endpoint. Same request/response
  // shape as Groq/OpenAI — falls through the standard non-Anthropic branch
  // unchanged. Keep the provider fallback pinned so an explicit Gemini call
  // without a model always runs the exact Orqaly default.
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    defaultModel: GEMINI_DEFAULT_MODEL,
  },
  // Localhost-only. Uses @anthropic-ai/claude-agent-sdk OAuth tokens from
  // ~/.claude (Max subscription). Blocked on Vercel via a VERCEL env check
  // at the call site. Lazy-imported so prod builds without the dev dep succeed.
  'claude-code': {
    url: null,
    envKey: null,
    defaultModel: 'claude-opus-5',
    isClaudeCode: true,
  },
  // OpenRouter — 350+ models through one OpenAI-compatible API. Zero markup
  // on provider prices. Claude Opus 5 at $5/$25 per M tokens (3× cheaper
  // than direct Anthropic at $15/$75). Supports streaming, BYOK, and auto
  // provider failover. Auth: Bearer token from openrouter.ai/settings/keys.
  // Model strings use 'provider/model' format same as AI Gateway.
  // Docs: https://openrouter.ai/docs
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-opus-4.6',
  },

  // Vercel AI Gateway — unified endpoint that routes to OpenAI, Anthropic,
  // Google, xAI, etc. through a single OpenAI-compatible API. Includes a
  // free tier ($5/mo refreshing credits) AND automatic failover when
  // individual providers are down or out of credit. Critical: production
  // Anthropic credits are currently exhausted; routing through gateway
  // gives us automatic OpenAI fallback at no extra cost.
  //
  // Model strings use the 'provider/model' format, e.g.
  //   openai/gpt-4o-mini, anthropic/claude-sonnet-5, google/gemini-2.5-flash
  //
  // Auth resolution order (handled in buildHeaders):
  //   1. AI_GATEWAY_API_KEY (manual key from Vercel dashboard)
  //   2. VERCEL_OIDC_TOKEN  (auto-provisioned by 'vercel env pull')
  //
  // For envKey (used by fallback chain detection) we use a synthetic name
  // 'AI_GATEWAY_API_KEY_OR_OIDC' that resolves true if EITHER key is set.
  // The actual lookup happens in buildHeaders() / getApiKey().
  // Docs: https://vercel.com/docs/ai-gateway
  gateway: {
    url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    envKey: 'AI_GATEWAY_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
    hasOidcFallback: true,
  },
  ollama: {
    url: null,
    envKey: 'OLLAMA_BASE_URL',
    defaultModel: 'llama3',
    isLocal: true,
  },
  'local-openai': {
    url: null,
    envKey: 'LOCAL_OPENAI_URL',
    defaultModel: 'local-model',
    isLocal: true,
  },
};

/**
 * Resolve the API key for a provider, including fallbacks.
 * Gateway specifically supports VERCEL_OIDC_TOKEN as a fallback when
 * AI_GATEWAY_API_KEY is not set — OIDC is auto-provisioned by 'vercel env pull'.
 *
 * BYOK: when userId is provided, prefers the user's encrypted key from
 * user_api_keys over the server env fallback.
 */
async function resolveProviderKey(providerName, userId = null) {
  const provider = PROVIDERS[providerName];
  if (!provider) return { key: null, source: 'none' };
  if (userId && provider.envKey) {
    try {
      const { resolveUserKey } = await import('../security/resolve-user-key.js');
      const resolved = await resolveUserKey({
        userId,
        provider: `llm:${providerName}`,
        envVar: provider.envKey,
      });
      if (resolved.key) return { key: resolved.key, source: resolved.source };
    } catch {
      // fall through to env
    }
  }
  return resolvePlatformKey(providerName);
}

/**
 * Synchronous platform-only lookup. Used by pickFallbackChain to determine
 * which providers have ANY key available (user keys can't be known without
 * userId context; the fallback chain is a best-effort platform view).
 */
function resolvePlatformKey(providerName) {
  const provider = PROVIDERS[providerName];
  if (!provider) return { key: null, source: 'none' };
  const directKey = process.env[provider.envKey];
  if (directKey) return { key: directKey, source: 'platform' };
  if (provider.hasOidcFallback && process.env.VERCEL_OIDC_TOKEN) {
    return { key: process.env.VERCEL_OIDC_TOKEN, source: 'platform-oidc' };
  }
  return { key: null, source: 'none' };
}

// Cost estimates per 1K tokens (USD)
const TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.0022 },
  'glm-4': { input: 0.001, output: 0.001 },
  'glm-4-flash': { input: 0.0001, output: 0.0001 },
  'glm-4.6': { input: 0.0006, output: 0.0022 },
  'glm-4-plus': { input: 0.001, output: 0.001 },
  'glm-5.1': { input: 0.002, output: 0.002 },
  'gemini-3.8-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.7-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.6-flash': { input: 0.0015, output: 0.0075 },
  'gemini-3.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-3.1-pro-preview': { input: 0.002, output: 0.012 },
  'gemini-3.5-flash-lite': { input: 0.0001, output: 0.0004 },
  'gemini-3.5-flash-lite-preview': { input: 0.0001, output: 0.0004 },
  'gemini-3-pro-preview': { input: 0.002, output: 0.012 },
  'gemini-3-flash-preview': { input: 0.0003, output: 0.0025 },
  'gemini-pro-latest': { input: 0.00125, output: 0.01 },
  'gemini-flash-latest': { input: 0.0015, output: 0.0075 },
  'gemini-flash-lite-latest': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
  'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
};

/**
 * Convert OpenAI-format tools to Anthropic-format tools.
 */
function toAnthropicTools(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || '',
    input_schema: t.function.parameters || { type: 'object', properties: {} },
  }));
}

/**
 * Build request body for Anthropic Messages API.
 */
function buildAnthropicRequest({
  model,
  systemPrompt,
  prompt,
  messages,
  temperature,
  maxTokens,
  tools,
}) {
  // Anthropic's Messages API rejects role:"system" inside the messages array —
  // system content MUST be a top-level `system` parameter. Callers like
  // runAgentWithTools in tool-runner.js build messages provider-agnostically
  // and prepend a role:"system" entry, which used to HTTP 400 every Phase 2
  // landing-page ReAct call ("Unexpected role 'system'"). Normalize here so
  // those callers stay simple.
  let extractedSystem = '';
  let normalizedMessages;
  if (messages) {
    const systemBits = [];
    normalizedMessages = [];
    for (const m of messages) {
      if (m?.role === 'system') {
        if (typeof m.content === 'string' && m.content) systemBits.push(m.content);
      } else {
        normalizedMessages.push(m);
      }
    }
    if (systemBits.length > 0) extractedSystem = systemBits.join('\n\n');
  } else {
    normalizedMessages = [{ role: 'user', content: prompt }];
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: normalizedMessages,
  };
  // Caller-provided systemPrompt takes precedence; any system-role messages
  // extracted above are appended so multi-system-message callers don't lose info.
  const mergedSystem = [systemPrompt, extractedSystem].filter(Boolean).join('\n\n');
  if (mergedSystem) body.system = mergedSystem;

  const anthropicTools = toAnthropicTools(tools);
  if (anthropicTools) body.tools = anthropicTools;
  return body;
}

/**
 * Build request body for OpenAI-compatible APIs.
 */
function buildOpenAIRequest({
  providerName,
  model,
  systemPrompt,
  prompt,
  messages,
  temperature,
  maxTokens,
  jsonMode,
  jsonSchema,
  jsonSchemaName,
  tools,
  toolChoice,
  reasoningEffort,
}) {
  const msgs = messages || [];
  if (!messages) {
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
    msgs.push({ role: 'user', content: prompt });
  }
  const isThinkingGemini = isGeminiThinkingModel(providerName, model);
  const effectiveMaxTokens = isThinkingGemini && jsonMode ? Math.max(maxTokens, 4096) : maxTokens;
  const body = { model, messages: msgs, max_tokens: effectiveMaxTokens };
  if (!isThinkingGemini) body.temperature = temperature;
  // Gemini 3.6+ supports reasoning_effort but not legacy sampling controls.
  // Production defaults to medium; evaluations can explicitly request high.
  if (isThinkingGemini) body.reasoning_effort = geminiReasoningEffort(reasoningEffort);
  if (jsonMode) {
    if (jsonSchema) {
      const name = String(jsonSchemaName || 'structured_output').trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
        throw new Error(
          'jsonSchemaName must contain 1-64 letters, numbers, underscores, or hyphens.'
        );
      }
      if (typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) {
        throw new Error('jsonSchema must be a JSON Schema object.');
      }
      body.response_format = {
        type: 'json_schema',
        json_schema: { name, strict: true, schema: jsonSchema },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
  }
  if (tools?.length) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }
  return body;
}

/**
 * Build headers for each provider.
 */
function buildHeaders(providerName, apiKey) {
  if (providerName === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
  }
  if (providerName === 'ollama' || providerName === 'local-openai') {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer local' };
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Parse response from different provider formats.
 * Returns { content, usage, toolCalls } — toolCalls is null when no tool calls.
 */
function parseResponse(providerName, data) {
  if (providerName === 'anthropic') {
    const blocks = data.content || [];
    const textParts = blocks.filter((b) => b.type === 'text').map((b) => b.text);
    const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
    const content = textParts.join('') || '';
    const usage = {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      // Prompt-cache hit/write counts so usage analytics can surface cache savings.
      cache_read_input_tokens: data.usage?.cache_read_input_tokens || 0,
      cache_creation_input_tokens: data.usage?.cache_creation_input_tokens || 0,
    };
    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((b) => ({ id: b.id, name: b.name, arguments: b.input }))
        : null;
    return { content, usage, toolCalls, stopReason: data.stop_reason };
  }
  // OpenAI-compatible format
  const message = data.choices?.[0]?.message || {};
  const content = message.content || '';
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const rawCalls = message.tool_calls || [];
  const toolCalls =
    rawCalls.length > 0
      ? rawCalls.map((tc) => {
          let args = tc.function.arguments;
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args);
            } catch {
              // LLM returned malformed JSON in tool call arguments — attempt repair
              try {
                args = JSON.parse(args + '}');
              } catch {
                /* ignore */
              }
              try {
                args = JSON.parse(args + '"}');
              } catch {
                /* ignore */
              }
              if (typeof args === 'string') args = {}; // Give up — use empty args
            }
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args || {},
            // Gemini attaches { google: { thought_signature } } to every tool call and
            // REQUIRES it echoed back on the follow-up turn — drop it and the next
            // request dies with "Function call is missing a thought_signature in
            // functionCall parts", which killed every Gemini tool loop. No other
            // provider sends extra_content, so this stays undefined for them and
            // buildAssistantToolCallMessage emits exactly what it emitted before.
            ...(tc.extra_content ? { extraContent: tc.extra_content } : {}),
          };
        })
      : null;
  return { content, usage, toolCalls, stopReason: data.choices?.[0]?.finish_reason };
}

/**
 * Execute an LLM call to any supported provider.
 *
 * @param {object} opts
 * @param {string} opts.prompt - User prompt (ignored when messages is provided)
 * @param {string} [opts.systemPrompt] - System prompt (ignored when messages is provided)
 * @param {Array} [opts.messages] - Full message array (overrides prompt/systemPrompt)
 * @param {string} [opts.provider] - Provider name
 * @param {string} [opts.model] - Override model
 * @param {number} [opts.temperature] - 0-2 (default: 0.3)
 * @param {number} [opts.maxTokens] - Max response tokens (default: 2000)
 * @param {boolean} [opts.jsonMode] - Force JSON output (not supported by Anthropic)
 * @param {object} [opts.jsonSchema] - Exact JSON Schema for OpenAI-compatible structured output
 * @param {string} [opts.jsonSchemaName] - Structured-output schema name (1-64 safe characters)
 * @param {Array} [opts.tools] - OpenAI-format tool definitions
 * @param {string|object} [opts.toolChoice] - Tool choice strategy
 * @param {number} [opts.timeoutMs] - Per-call timeout (default: 30000)
 * @returns {Promise<{ content: string, toolCalls: Array|null, usage: object, model: string, provider: string, durationMs: number, estimatedCostUsd: number }>}
 */
/**
 * Fallback chain: when the current provider fails with 429/403/5xx/billing,
 * walk through the other providers that have keys configured and try each
 * one until one succeeds. Tracked via opts._triedProviders to prevent loops.
 *
 * Mirrors the logic in llm-executor.js (main pipeline executor).
 * Critical for tool-calling tasks (execute-task) because the default
 * llama-3.1-8b-instant on Groq is too weak for ReAct and has a tiny
 * 6000 TPM limit — tasks need to fall back to gpt-4o-mini or claude-haiku.
 */
// Session-level blacklist: mirrors the pattern in llm-executor.js so v2
// callers also stop wasting 25-30s per invocation hitting a geo-blocked
// provider (observed with Groq 403 from the user's network).
const deadProviders = new Map(); // provider -> { expiry, reason }
const DEAD_PROVIDER_COOLDOWN_MS = 15 * 60 * 1000;
function markProviderDead(name, reason) {
  deadProviders.set(name, { expiry: Date.now() + DEAD_PROVIDER_COOLDOWN_MS, reason });
  log.info('llm-v2.provider-dead', {
    provider: name,
    reason,
    cooldownMs: DEAD_PROVIDER_COOLDOWN_MS,
  });
}
function isProviderDead(name) {
  const entry = deadProviders.get(name);
  if (!entry) return false;
  if (Date.now() > entry.expiry) {
    deadProviders.delete(name);
    return false;
  }
  return true;
}

function pickFallbackChain(failedProvider, alreadyTried = new Set()) {
  // Ordered by reliability/cost for tool-calling tasks.
  // 'gateway' (Vercel AI Gateway) sits at the front because it has its own
  // cross-provider failover AND a free tier, so it's the most reliable single
  // fallback when a direct provider (e.g. Anthropic) hits a billing wall.
  const allProviders = [
    'openrouter',
    'gateway',
    'openai',
    'anthropic',
    'groq',
    'deepseek',
    'glm',
    'gemini',
  ];
  return allProviders.filter((p) => {
    if (p === failedProvider) return false;
    if (alreadyTried.has(p)) return false;
    if (isProviderDead(p)) return false;
    return !!resolvePlatformKey(p).key;
  });
}

async function authorizeInternalProviderAction(opts, action) {
  if (typeof opts.beforeInternalExternalAction !== 'function') return;
  const authorizationResult = await opts.beforeInternalExternalAction(action);
  if (!authorizationResult) return;
  const error = new Error('Execution authorization was revoked before an internal provider call');
  error.code = 'EXECUTION_AUTHORIZATION_REVOKED';
  error.authorizationResult = authorizationResult;
  throw error;
}

export async function executeLlmV2(opts) {
  await assertCurrentJobLeaseLive('LLM v2 provider selection');
  if (opts._internalAuthorizationAction) {
    await authorizeInternalProviderAction(opts, opts._internalAuthorizationAction);
  }
  // Callers that deliberately name a provider retain that provider's own
  // default model. Calls that omit both inherit the configured platform pair.
  const inheritsPlatformDefault = !opts.provider;
  const {
    prompt,
    systemPrompt,
    messages,
    provider: requestedProviderName = defaultProvider(),
    model: modelOverride = inheritsPlatformDefault ? defaultModel() : undefined,
    temperature = 0.3,
    maxTokens = 2000,
    jsonMode = false,
    jsonSchema,
    jsonSchemaName,
    tools,
    toolChoice,
    reasoningEffort,
    timeoutMs = 30000,
    // Goal execution and compare-mode callers pin their selected provider.
    // Same-provider retries remain available, but cross-provider fallback is
    // disabled so the reported executor is always the executor that ran.
    pinnedProvider = false,
  } = opts;

  // M9 / M11: On localhost, reroute onto the claude-code provider (the user's
  // Claude Max/Pro subscription via ~/.claude/ OAuth — zero billing). Default
  // mode reroutes only anthropic calls; CLAUDE_CODE_LOCAL=all routes EVERY
  // provider and forces Opus 5. Production (Vercel) and test runs never fire
  // this branch. Opt-out: CLAUDE_CODE_LOCAL=off.
  //
  // v1 (llm-executor.js) has had this since M9; v2 did not, so most of the
  // platform — Consilium evaluations, tool scouting, the Assistant — silently
  // ignored the switch and kept calling paid providers. Same helper, same
  // semantics, so one env var now covers both executors.
  //
  // DB-sourced providers (consilium_members.provider, assistants.config,
  // agents.model, workflow node config) arrive here as an explicit
  // `opts.provider`. Rerouting inside the executor neutralises them all
  // without touching a single DB row.
  let activeProviderName = requestedProviderName;
  let activeModelOverride = null;
  // hasTools keeps tool-carrying calls (the ReAct loop in tool-runner.js) on a
  // tool-capable provider — the subscription path would silently drop them.
  if (
    shouldAttemptReroute({
      pinnedProvider,
      bypass: opts._claudeCodeBypassReroute,
      hasTools: Array.isArray(tools) && tools.length > 0,
    })
  ) {
    const sdkAvailable = await probeClaudeCodeSdk();
    const rr = maybeRerouteToClaudeCode(requestedProviderName, {
      env: process.env,
      sdkAvailable,
      pinnedProvider,
    });
    if (rr.provider !== requestedProviderName) {
      activeProviderName = rr.provider;
      if (rr.model) activeModelOverride = rr.model;
      if (!localRerouteLogged) {
        localRerouteLogged = true;
        log.info('llm-v2.local-reroute', {
          from: requestedProviderName,
          to: rr.provider,
          model: rr.model || '(original)',
        });
      }
    }
  }

  // Every reference below this line uses the provider that will actually run.
  const providerName = activeProviderName;

  const provider = PROVIDERS[activeProviderName];
  if (!provider) throw new Error(`Unknown LLM provider: ${activeProviderName}`);

  // Skip providers we've already established are dead this session. Pinned
  // calls see the error directly; non-pinned calls drop to the fallback.
  if (isProviderDead(activeProviderName) && !provider.isClaudeCode) {
    const entry = deadProviders.get(activeProviderName);
    const msg = `LLM_PROVIDER_DEAD: ${activeProviderName} is in session cooldown (${entry?.reason || 'unknown'}).`;
    if (pinnedProvider) throw new Error(msg);
    const tried = new Set(opts._triedProviders || []);
    tried.add(activeProviderName);
    const fallbackOrder = pickFallbackChain(activeProviderName, tried);
    if (fallbackOrder.length > 0) {
      log.info('llm-v2.skip-dead-provider', { provider: activeProviderName, to: fallbackOrder[0] });
      return executeLlmV2({
        ...opts,
        provider: fallbackOrder[0],
        model: undefined,
        _triedProviders: [...tried],
        _internalAuthorizationAction: {
          kind: 'llm',
          phase: 'provider_fallback',
          fromProvider: activeProviderName,
          toProvider: fallbackOrder[0],
        },
      });
    }
    throw new Error(msg);
  }

  // Localhost-only Claude Code (Max subscription via Agent SDK). Blocked
  // on Vercel to prevent silent fallback chains from ever calling this
  // path in prod. Lazy-imported so the dev-only SDK isn't required at
  // build time.
  if (provider.isClaudeCode) {
    if (process.env.VERCEL) {
      throw new Error(
        'claude-code provider is localhost-only (blocked on Vercel). Use anthropic/groq/glm/qwen in production.'
      );
    }
    const start = Date.now();
    const { executeClaudeCode } = await import('../agent-handlers/claude-code-provider.js');
    // The reroute's model override (all-mode forces Opus 5) wins over the
    // caller's model — a groq/gemini model name is meaningless to the SDK.
    const model = activeModelOverride || modelOverride || provider.defaultModel;
    log.info('llm-v2.call.start', {
      provider: activeProviderName,
      model,
      promptLength: messages ? JSON.stringify(messages).length : prompt?.length || 0,
    });
    try {
      // taskContext lets the provider auto-deploy when the task is a landing-page
      // deployment (Agent SDK is text-only, so Opus would otherwise hallucinate
      // a URL). Passed through from execute-task.js.
      const result = await executeClaudeCode({
        systemPrompt,
        prompt,
        messages,
        model,
        maxTokens,
        temperature,
        jsonMode,
        taskContext: opts.taskContext,
        beforeExternalAction: opts.beforeInternalExternalAction,
        signal: getCurrentJobLeaseSignal(),
      });
      const durationMs = Date.now() - start;
      log.info('llm-v2.call.complete', {
        provider: activeProviderName,
        model,
        durationMs,
        tokens: result.usage?.total_tokens || 0,
        estimatedCostUsd: '0.000000',
      });
      return { ...result, provider: activeProviderName, durationMs, estimatedCostUsd: 0 };
    } catch (err) {
      if (isJobLeaseLostError(err)) throw err;
      log.warn('llm-v2.claude-code.failed', { error: err?.message || String(err), model });
      if (err?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw err;
      // Provider-pinned calls fail fast so we never silently swap providers.
      if (pinnedProvider) throw err;
      // CLAUDE_CODE_LOCAL=all is an explicit "do not hit a paid API" choice.
      // Falling through would (a) violate that intent and (b) mask the real
      // claude-code error (expired OAuth, quota) behind a misleading
      // missing-key error from whatever provider the chain lands on.
      if (forbidsPaidFallback(process.env)) {
        throw new Error(
          `claude-code failed and CLAUDE_CODE_LOCAL=all forbids paid-API fallback: ${err?.message || err}. ` +
            `Run \`claude login\`, or set CLAUDE_CODE_LOCAL=off in .env.local to allow fallback.`
        );
      }
      // Default mode: only anthropic calls were rerouted, so fall back to the
      // chain. Drop the Claude model name — other providers reject it.
      const tried = new Set(opts._triedProviders || []);
      tried.add('claude-code');
      const fallbackOrder = pickFallbackChain('claude-code', tried);
      if (fallbackOrder.length === 0) throw err;
      log.info('llm-v2.claude-code.falling-through', { to: fallbackOrder[0] });
      return executeLlmV2({
        ...opts,
        provider: fallbackOrder[0],
        model: undefined,
        _triedProviders: [...tried],
        _claudeCodeBypassReroute: true,
        _internalAuthorizationAction: {
          kind: 'llm',
          phase: 'provider_fallback',
          fromProvider: 'claude-code',
          toProvider: fallbackOrder[0],
        },
      });
    }
  }

  const { key: apiKey, source: apiKeySource } = await resolveProviderKey(
    providerName,
    opts.userId || null
  );
  if (!apiKey) {
    // If the requested provider's key is missing, walk the fallback chain
    // for any other provider that has a key configured.
    const tried = new Set(opts._triedProviders || []);
    tried.add(providerName);
    const fallbackOrder = pinnedProvider ? [] : pickFallbackChain(providerName, tried);
    if (fallbackOrder.length > 0) {
      log.warn('llm-v2.fallback-no-key', { from: providerName, to: fallbackOrder[0] });
      return executeLlmV2({
        ...opts,
        provider: fallbackOrder[0],
        model: undefined,
        _triedProviders: [...tried],
        _internalAuthorizationAction: {
          kind: 'llm',
          phase: 'provider_fallback',
          fromProvider: providerName,
          toProvider: fallbackOrder[0],
        },
      });
    }
    throw new Error(
      `API key not configured: ${provider.envKey}. Add it in your Vercel project settings → Environment Variables.`
    );
  }

  const model = modelOverride || provider.defaultModel;
  const effectiveTimeoutMs = resolveLlmDeadlineMs({
    provider: providerName,
    model,
    reasoningEffort,
    requestedTimeoutMs: timeoutMs,
    defaultTimeoutMs: 30_000,
  });
  const networkRetries = resolveLlmNetworkRetries({
    provider: providerName,
    model,
    reasoningEffort,
  });

  const requestBody = provider.isAnthropicApi
    ? buildAnthropicRequest({
        model,
        systemPrompt,
        prompt,
        messages,
        temperature,
        maxTokens,
        tools,
      })
    : buildOpenAIRequest({
        providerName,
        model,
        systemPrompt,
        prompt,
        messages,
        temperature,
        maxTokens,
        jsonMode,
        jsonSchema,
        jsonSchemaName,
        tools,
        toolChoice,
        reasoningEffort,
      });

  const headers = buildHeaders(providerName, apiKey);

  const promptLen = messages ? JSON.stringify(messages).length : prompt?.length || 0;
  log.info('llm-v2.call.start', {
    provider: providerName,
    model,
    promptLength: promptLen,
    apiKeySource,
    timeoutMs: effectiveTimeoutMs,
  });

  const start = Date.now();

  let fetchUrl = provider.url;
  if (provider.isLocal) {
    let baseUrl = apiKey.replace(/\/$/, '');
    if (providerName === 'ollama' && !baseUrl.endsWith('/v1')) baseUrl += '/v1';
    if (!baseUrl.endsWith('/chat/completions')) baseUrl += '/chat/completions';
    fetchUrl = baseUrl;
  }

  let res;
  try {
    res = await fetchWithRetry(
      fetchUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: getCurrentJobLeaseSignal(),
      },
      {
        timeoutMs: effectiveTimeoutMs,
        retries: networkRetries,
        beforeAttempt: ({ attempt }) =>
          authorizeInternalProviderAction(opts, {
            kind: 'llm',
            phase: 'network_retry',
            provider: providerName,
            model,
            attempt,
          }),
      }
    );
  } catch (fetchErr) {
    if (isJobLeaseLostError(fetchErr)) throw fetchErr;
    // A THROWN error (timeout/abort, DNS, connection reset — e.g. the GLM China
    // endpoint being unreachable from Vercel) never reaches the !res.ok fallback
    // block below, so historically it hard-failed the whole call. Treat it like a
    // 5xx: walk the fallback chain to any other keyed provider before giving up.
    const isTimeout = fetchErr?.name === 'AbortError' || fetchErr?.code === 'ETIMEDOUT';
    log.error('llm-v2.call.threw', {
      provider: providerName,
      model,
      error: fetchErr?.message,
      timeout: isTimeout,
    });
    if (isTimeout || fetchErr?.code === 'ECONNRESET') {
      markProviderDead(
        providerName,
        `network: ${(fetchErr?.message || 'unreachable').slice(0, 80)}`
      );
    }
    if (!pinnedProvider) {
      const tried = new Set(opts._triedProviders || []);
      tried.add(providerName);
      const fallbackOrder = pickFallbackChain(providerName, tried);
      for (const next of fallbackOrder) {
        log.warn('llm-v2.fallback-retry', {
          from: providerName,
          to: next,
          reason: 'threw',
          tried: [...tried],
        });
        try {
          return await executeLlmV2({
            ...opts,
            provider: next,
            model: undefined,
            _triedProviders: [...tried],
            _internalAuthorizationAction: {
              kind: 'llm',
              phase: 'provider_fallback',
              fromProvider: providerName,
              toProvider: next,
            },
          });
        } catch (innerError) {
          if (isJobLeaseLostError(innerError)) throw innerError;
          if (innerError?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw innerError;
          tried.add(next);
        }
      }
    }
    throw fetchErr;
  }

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error('llm-v2.call.failed', {
      provider: providerName,
      model,
      status: res.status,
      error: errText.slice(0, 300),
    });

    // Cross-provider fallback chain on hard errors (429/403/413/billing/5xx).
    // 413 = "Request too large" (token limit exceeded on the small model).
    // 429 = "Rate limit reached" (TPM exhausted).
    // 403 = "Access denied" (key revoked or IP blocked).
    const isBillingError =
      res.status === 402 ||
      (res.status === 400 &&
        (errText.includes('credit balance') ||
          errText.includes('billing') ||
          errText.includes('insufficient')));
    const isRateLimit = res.status === 429;
    const isAccessDenied = res.status === 403;
    const isRequestTooLarge =
      res.status === 413 || (res.status === 400 && errText.toLowerCase().includes('too large'));
    const isServerError = res.status >= 500;
    // 401 = invalid/expired key on THIS provider; 404 = unknown model id on this
    // provider (e.g. a bad GLM default). Both are provider-specific, so falling
    // back to another keyed provider is the right move rather than hard-failing.
    const isAuthError = res.status === 401;
    const isNotFound = res.status === 404;
    const shouldFallback =
      isBillingError ||
      isRateLimit ||
      isAccessDenied ||
      isRequestTooLarge ||
      isServerError ||
      isAuthError ||
      isNotFound;

    // 403 is typically geo-blocking or a revoked key — either way we don't
    // want to try this provider again for the rest of the session.
    if (isAccessDenied) markProviderDead(providerName, `http_403: ${errText.slice(0, 80)}`);

    // Provider-pinned calls fail fast instead of silently switching providers.
    if (shouldFallback && pinnedProvider) {
      let reason;
      if (isBillingError) reason = 'billing';
      else if (isRateLimit) reason = 'rate_limit';
      else if (isAccessDenied) reason = 'access_denied';
      else if (isRequestTooLarge) reason = 'request_too_large';
      else reason = `status_${res.status}`;
      throw new Error(
        `LLM_PROVIDER_PINNED_FAILED: ${providerName} returned ${res.status} (${reason}). Cross-provider fallback is disabled for this call.`
      );
    }

    if (shouldFallback) {
      const tried = new Set(opts._triedProviders || []);
      tried.add(providerName);
      const fallbackOrder = pickFallbackChain(providerName, tried);
      for (const next of fallbackOrder) {
        let reason;
        if (isBillingError) reason = 'billing';
        else if (isRateLimit) reason = 'rate_limit';
        else if (isAccessDenied) reason = 'access_denied';
        else if (isRequestTooLarge) reason = 'request_too_large';
        else reason = `status_${res.status}`;
        log.warn('llm-v2.fallback-retry', {
          from: providerName,
          to: next,
          reason,
          tried: [...tried],
        });
        try {
          return await executeLlmV2({
            ...opts,
            provider: next,
            model: undefined,
            _triedProviders: [...tried],
            _internalAuthorizationAction: {
              kind: 'llm',
              phase: 'provider_fallback',
              fromProvider: providerName,
              toProvider: next,
            },
          });
        } catch (innerErr) {
          if (isJobLeaseLostError(innerErr)) throw innerErr;
          if (innerErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw innerErr;
          tried.add(next);
          // try the next provider
        }
      }
    }

    throw new Error(`LLM ${providerName} ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const { content, usage, toolCalls, stopReason } = parseResponse(providerName, data);

  const costs = TOKEN_COSTS[model] || { input: 0, output: 0 };
  const estimatedCostUsd =
    (usage.prompt_tokens / 1000) * costs.input + (usage.completion_tokens / 1000) * costs.output;

  log.info('llm-v2.call.complete', {
    provider: providerName,
    model,
    durationMs,
    tokens: usage.total_tokens,
    estimatedCostUsd: estimatedCostUsd.toFixed(6),
    toolCalls: toolCalls?.length || 0,
  });

  if (jsonMode && needsJsonRepair(content)) {
    if (opts._jsonRepairAttempted) {
      throw new Error(
        `LLM_INVALID_JSON_AFTER_REPAIR: ${providerName}/${model} returned unparseable JSON twice.`
      );
    }

    log.warn('llm-v2.json-repair.retry', { provider: providerName, model });
    const repair = await executeLlmV2({
      ...opts,
      provider: providerName,
      model,
      prompt: buildJsonRepairPrompt(content),
      systemPrompt:
        'You are a strict JSON repairer. Preserve the supplied data and return valid JSON only.',
      messages: undefined,
      tools: undefined,
      toolChoice: undefined,
      maxTokens: Math.max(maxTokens, 4096),
      jsonMode: true,
      pinnedProvider: true,
      _jsonRepairAttempted: true,
      _triedProviders: [],
      _claudeCodeBypassReroute: true,
      _internalAuthorizationAction: {
        kind: 'llm',
        phase: 'json_repair',
        provider: providerName,
        model,
      },
    });
    if (repair.provider !== providerName) {
      throw new Error(
        `LLM_JSON_REPAIR_PROVIDER_MISMATCH: expected ${providerName}, received ${repair.provider}.`
      );
    }
    return {
      ...repair,
      usage: aggregateLlmUsage(usage, repair.usage),
      durationMs: durationMs + repair.durationMs,
      estimatedCostUsd: estimatedCostUsd + repair.estimatedCostUsd,
      jsonRepairAttempted: true,
    };
  }

  return {
    content,
    toolCalls,
    usage,
    model,
    provider: providerName,
    durationMs,
    estimatedCostUsd,
    finishReason: stopReason || null,
  };
}

/**
 * Try to parse JSON from LLM output (handles markdown code fences and
 * token-cap truncation). Re-exported from the shared helper so both executors
 * share one implementation.
 */
export { parseLlmJson } from '../_shared/llm-json.js';

/** Get all supported providers. */
export function getSupportedProviders() {
  return Object.keys(PROVIDERS);
}

/** Get token cost table. */
export function getTokenCosts() {
  return { ...TOKEN_COSTS };
}
