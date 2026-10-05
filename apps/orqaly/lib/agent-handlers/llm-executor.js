/**
 * LLM executor — calls Groq (primary) or OpenAI APIs.
 * Follows the same patterns as supabase/functions/transcribe/index.ts.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { resolveUserLlmPreset } from './_shared/resolve-user-llm-preset.js';
import {
  maybeRerouteToClaudeCode,
  probeClaudeCodeSdk,
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
} from './job-lease-runtime.js';

// Re-exported so existing importers (and llm-executor-override.test.js) keep
// their import path after the helper moved to lib/_shared/ for v2 to share.
export { maybeRerouteToClaudeCode };

const log = createLogger('llm-executor');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// open.bigmodel.cn is the China-mainland endpoint (unreliable from Vercel US).
// Override with GLM_API_URL to use the international host, e.g.
// https://api.z.ai/api/paas/v4/chat/completions
const GLM_API_URL =
  process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// DashScope International endpoint by default (matches sk- keys issued by
// the international console used by most non-China users). Override with
// QWEN_API_URL in .env.local for other regions — e.g. the China region:
// https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
const QWEN_API_URL =
  process.env.QWEN_API_URL ||
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
// Google Gemini via its OpenAI-compatible endpoint. Auth uses Bearer
// Authorization (same as Groq/OpenAI), so the standard non-Anthropic branch
// handles request/response shape unchanged.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// OpenRouter — a routing gateway, not a single model vendor. One key unlocks
// many providers' models (Claude, GPT, Gemini, Llama, ...) via its own
// OpenAI-compatible endpoint, so it falls through the standard non-Anthropic
// branch just like Groq/OpenAI/Qwen/Gemini above — no special-casing needed.
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const PROVIDERS = {
  glm: {
    url: GLM_API_URL,
    envKey: 'GLM_API_KEY',
    defaultModel: 'glm-4.6',
  },
  groq: {
    url: GROQ_API_URL,
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openai: {
    url: OPENAI_API_URL,
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    url: ANTHROPIC_API_URL,
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    isAnthropic: true,
  },
  // Alibaba Qwen via DashScope OpenAI-compatible endpoint. Uses the same
  // request/response shape as OpenAI/Groq so it falls through the standard
  // non-Anthropic branch without new handling.
  qwen: {
    url: QWEN_API_URL,
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-max',
  },
  // Google Gemini via its OpenAI-compatible endpoint. Same request/response
  // shape as Groq/OpenAI/Qwen — passes through the standard non-Anthropic
  // branch. The default is deliberately pinned rather than using a moving
  // alias, so an explicit Gemini call without a model is reproducible.
  gemini: {
    url: GEMINI_API_URL,
    envKey: 'GEMINI_API_KEY',
    defaultModel: GEMINI_DEFAULT_MODEL,
  },
  // Gateway to many providers' models via one key. Model ids are vendor-
  // prefixed (e.g. 'anthropic/claude-sonnet-4.6') — callers must pass an
  // explicit `model`; the default below is a reasonable baseline only.
  openrouter: {
    url: OPENROUTER_API_URL,
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4.6',
  },
  // Localhost-only. Uses the user's Claude Code Max subscription via
  // @anthropic-ai/claude-agent-sdk OAuth tokens — no API billing. Guarded
  // against prod via a !process.env.VERCEL check in the call site below.
  // Lazy-imported so prod builds don't choke on the missing dev dep.
  'claude-code': {
    url: null, // not used — handled by the SDK adapter
    envKey: null, // no env var required; uses ~/.claude/ OAuth tokens
    defaultModel: 'claude-opus-5',
    isClaudeCode: true,
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
 * Determine fallback provider order when the current provider fails.
 * Returns an ordered list of providers to try, excluding any already tried
 * and any whose API key is not configured.
 *
 * Priority logic:
 * - openai is preferred (paid, reliable, generally available)
 * - groq is preferred for fast/cheap fallback if it has a working key
 * - anthropic is preferred for quality if it has credit
 * - The order rotates so we try the most-likely-working provider first
 */
// Session-level blacklist of providers that returned a hard "you cannot reach
// me from this network" signal (currently: HTTP 403 from Groq when the
// developer's region is geo-blocked). Entries expire after a 15-minute sulk
// so transient issues self-heal. Cleared on process restart.
const deadProviders = new Map(); // provider -> expiry_ms
const DEAD_PROVIDER_COOLDOWN_MS = 15 * 60 * 1000;
function markProviderDead(name, reason) {
  deadProviders.set(name, { expiry: Date.now() + DEAD_PROVIDER_COOLDOWN_MS, reason });
  log.info(null, 'llm.provider-dead', {
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

// maybeRerouteToClaudeCode + probeClaudeCodeSdk now live in
// lib/_shared/claude-code-reroute.js so llm-executor-v2.js can share them.

// One-shot log so the developer sees the reroute in the terminal without
// flooding it on every call.
let localRerouteLogged = false;

function pickFallbackChain(failedProvider, alreadyTried = new Set()) {
  // Default ordering by reliability/cost — glm, gemini, openai, groq, anthropic
  const allProviders = ['glm', 'gemini', 'openai', 'groq', 'anthropic'];
  return allProviders.filter((p) => {
    if (p === failedProvider) return false;
    if (alreadyTried.has(p)) return false;
    if (isProviderDead(p)) return false;
    const envKey = PROVIDERS[p]?.envKey;
    return envKey && process.env[envKey];
  });
}

// Per-provider soft timeout — how long we wait for the first response byte
// before declaring the provider too slow and either falling back (default
// mode) or failing the goal with LLM_PROVIDER_PINNED_TIMEOUT (compare mode).
// Anthropic / OpenAI / Groq respond in <10s typically; GLM 5.1 and Qwen Max
// routinely take 30-60s on complex prompts and were being killed at 25s.
// claude-code has its own inner stream timeout in claude-code-provider.js;
// the 10-minute outer cap here just makes the soft race effectively no-op
// for that provider so the inner one wins.
const PROVIDER_SOFT_TIMEOUT_MS = {
  anthropic: 25_000,
  openai: 25_000,
  groq: 15_000,
  glm: 90_000,
  qwen: 90_000,
  gemini: 60_000,
  'claude-code': 600_000,
};

// Cost estimates per 1K tokens (USD)
const TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'glm-5.1': { input: 0.002, output: 0.002 },
  'glm-4.6': { input: 0.0006, output: 0.0022 },
  'glm-4-plus': { input: 0.001, output: 0.001 },
  'qwen-max': { input: 0.0012, output: 0.0048 },
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
 * Execute an LLM call.
 *
 * @param {object} opts
 * @param {string} opts.prompt - User prompt
 * @param {string} [opts.systemPrompt] - System prompt
 * @param {string} [opts.provider] - 'glm' | 'groq' | 'openai' | 'anthropic' | 'qwen' | 'gemini' (default: configured platform provider)
 * @param {string} [opts.model] - Override model
 * @param {number} [opts.temperature] - 0-1 (default: 0.3)
 * @param {number} [opts.maxTokens] - Max response tokens (default: 2000)
 * @param {boolean} [opts.jsonMode] - Force JSON output
 * @param {import('http').IncomingMessage} [opts.req] - For logging
 * @returns {Promise<{ content: string, usage: object, model: string, provider: string, durationMs: number, estimatedCostUsd: number }>}
 */
export async function executeLlm(opts) {
  await assertCurrentJobLeaseLive('LLM provider selection');
  // /setup default-LLM preset: when the caller didn't explicitly choose a
  // provider AND the goal is associated with a user, honour the user's
  // Cheapest/Smartest/Fastest preset. Fails open (returns null) so a missing
  // preset or DB hiccup falls through to the legacy 'glm' default.
  if (!opts.provider && opts.userId && !opts._presetResolved) {
    const preset = await resolveUserLlmPreset(opts.userId);
    if (preset) {
      opts = {
        ...opts,
        provider: preset.provider,
        model: opts.model || preset.model,
        _presetResolved: true,
      };
    }
  }

  // Request-level choices and a user's saved preset still win. When neither
  // supplied a provider, inherit the operator-configured pair atomically so a
  // Gemini provider can never be combined with a legacy Groq/GLM model name.
  const inheritsPlatformDefault = !opts.provider;

  const {
    prompt,
    systemPrompt,
    provider: providerName = defaultProvider(),
    model: modelOverride = inheritsPlatformDefault ? defaultModel() : undefined,
    temperature = 0.3,
    maxTokens = 2000,
    jsonMode = false,
    req = null,
    // Goal execution and compare-mode callers pin their selected provider.
    // Same-provider retries remain available, but cross-provider fallback is
    // disabled so the reported executor is always the executor that ran.
    pinnedProvider = false,
  } = opts;

  // M9 / M11: On localhost, silently reroute LLM calls to the claude-code
  // provider (uses the user's Claude Max subscription via ~/.claude/ OAuth —
  // zero billing). Default mode only reroutes anthropic calls. Opt-in mode
  // CLAUDE_CODE_LOCAL=all routes EVERY provider and forces Opus 5.
  // Production (Vercel) and test runs never fire this branch.
  // Opt-out: CLAUDE_CODE_LOCAL=off in .env.local.
  let activeProviderName = providerName;
  let activeModelOverride = null;
  const inVercel = !!process.env.VERCEL;
  const inTest = !!(process.env.VITEST || process.env.NODE_ENV === 'test');
  // _claudeCodeBypassReroute: set by the claude-code fall-through branch so
  // the second pass doesn't bounce right back into claude-code and loop.
  // pinnedProvider is honoured INSIDE maybeRerouteToClaudeCode so strict calls
  // keep their explicit provider pick regardless of CLAUDE_CODE_LOCAL.
  if (!inVercel && !inTest && !opts._claudeCodeBypassReroute) {
    const sdkAvailable = await probeClaudeCodeSdk();
    const rr = maybeRerouteToClaudeCode(providerName, {
      env: process.env,
      sdkAvailable,
      pinnedProvider,
    });
    if (rr.provider !== providerName) {
      activeProviderName = rr.provider;
      if (rr.model) activeModelOverride = rr.model;
      if (!localRerouteLogged) {
        localRerouteLogged = true;
        log.info(req, 'llm-executor.local-reroute', {
          from: providerName,
          to: rr.provider,
          model: rr.model || '(original)',
        });
      }
    }
  }
  let provider = PROVIDERS[activeProviderName];
  if (!provider) throw new Error(`Unknown LLM provider: ${activeProviderName}`);

  // Refuse to call a provider we've already established is dead this session.
  // For pinned calls this is terminal; for non-pinned calls we let the
  // fallback chain pick up below.
  if (isProviderDead(activeProviderName) && !provider.isClaudeCode) {
    const entry = deadProviders.get(activeProviderName);
    const msg = `LLM_PROVIDER_DEAD: ${activeProviderName} is in session cooldown (${entry?.reason || 'unknown'}).`;
    if (pinnedProvider) throw new Error(msg);
    log.info(req, 'llm.skip-dead-provider', {
      provider: activeProviderName,
      reason: entry?.reason,
    });
    const tried = new Set(opts._triedProviders || []);
    tried.add(activeProviderName);
    const fallbackOrder = pickFallbackChain(activeProviderName, tried);
    if (fallbackOrder.length > 0) {
      return executeLlm({
        ...opts,
        provider: fallbackOrder[0],
        model: undefined,
        _triedProviders: [...tried],
      });
    }
    throw new Error(msg);
  }

  // Claude Code (localhost-only, Max subscription via Agent SDK). Lazy-loaded
  // so Vercel builds don't need the dev dep. Prod is blocked explicitly so
  // a misrouted call can't fall through to API-key fallbacks silently.
  if (provider.isClaudeCode) {
    if (process.env.VERCEL) {
      throw new Error(
        'claude-code provider is localhost-only (blocked on Vercel). Configure a different provider for production.'
      );
    }
    const start = Date.now();
    // M11: if the reroute set a model override (all-mode forces Opus 5),
    // prefer it over the caller's requested model. Otherwise fall back to
    // opts.model → provider default.
    const model = activeModelOverride || opts.model || provider.defaultModel;
    // Report the provider that actually ran, not the one the caller asked for.
    // Reporting `providerName` here made a rerouted call look like a groq call
    // in the logs and in llm_usage, so there was no way to confirm from the
    // data that the subscription had served it.
    log.info(req, 'llm.call.start', {
      provider: activeProviderName,
      requested: providerName,
      model,
      promptLength: (opts.prompt || '').length,
    });
    try {
      const { executeClaudeCode } = await import('./claude-code-provider.js');
      const result = await executeClaudeCode({
        systemPrompt: opts.systemPrompt,
        prompt: opts.prompt,
        model,
        maxTokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.3,
        jsonMode: opts.jsonMode,
        signal: getCurrentJobLeaseSignal(),
      });
      log.info(req, 'llm.call.complete', {
        provider: activeProviderName,
        requested: providerName,
        model,
        durationMs: Date.now() - start,
        tokens: result.usage?.total_tokens || 0,
        estimatedCostUsd: '0.000000',
      });
      return {
        ...result,
        provider: activeProviderName,
        durationMs: Date.now() - start,
        estimatedCostUsd: 0,
      };
    } catch (err) {
      if (isJobLeaseLostError(err)) throw err;
      // M10 R2: claude-code failed (bad OAuth token, SDK hiccup, auto-routing
      // without `claude login`). Don't kill the process — log once, then fall
      // through to the paid Anthropic API. Provider-pinned calls still fail
      // fast so we don't silently switch providers on them.
      log.warn(req, 'llm.claude-code.failed-falling-through', {
        error: err?.message || String(err),
        model,
      });
      if (pinnedProvider) throw err;
      // CLAUDE_CODE_LOCAL=all is an explicit "do not hit the paid API" choice.
      // Silently falling through would (a) violate the developer's intent and
      // (b) mask the real claude-code error with a misleading credit-balance /
      // SYSTEM_API_KEY_MISSING response. Surface the actual claude-code failure
      // so the goal's failure_reason names the real cause.
      if (forbidsPaidFallback(process.env)) {
        throw new Error(
          `claude-code failed and CLAUDE_CODE_LOCAL=all forbids paid-API fallback: ${err?.message || err}. ` +
            `Run \`claude login\`, or set CLAUDE_CODE_LOCAL=off in .env.local to allow fallback.`
        );
      }
      // Drop the Claude model name — when fallback walks past 'anthropic'
      // (no key in this env) into glm/qwen/openai/groq, the inherited model
      // (e.g. claude-opus-5, claude-haiku-4-5) is rejected with provider-
      // specific "model unknown" errors (GLM 1211, etc.). Letting model fall
      // through as undefined makes each provider use its own defaultModel.
      return executeLlm({
        ...opts,
        provider: 'anthropic',
        model: undefined,
        _triedProviders: [...(opts._triedProviders || []), 'claude-code'],
        _claudeCodeBypassReroute: true,
      });
    }
  }

  // BYOK enforcement: when a user context is present, refuse silent fallback
  // to platform keys. Without this, a single user could exhaust your platform
  // LLM budget by simply not adding their own key. Platform-key fallback is
  // only allowed for system jobs (no opts.userId) — e.g. cron-driven prompt
  // optimization or internal health checks.
  //
  // The `requireUser` flag on resolveUserKey causes it to throw if the user
  // has no current key for the requested provider. We then walk the same
  // BYOK fallback chain (user's GLM key, then user's Groq key) before failing.
  const isSystemContext = !opts.userId;
  let apiKey = null;
  let apiKeySource = 'none';

  if (opts.userId) {
    // User context: resolve from user_api_keys ONLY. No process.env fallback.
    try {
      const resolved = await resolveUserKey({
        userId: opts.userId,
        provider: `llm:${activeProviderName}`,
        envVar: provider.envKey,
        requireUser: true,
        reason: `llm.call:${opts.model || provider.defaultModel}`,
      });
      apiKey = resolved.key;
      apiKeySource = resolved.source;
    } catch {
      // User has no key for this provider — try the next provider in the
      // BYOK fallback chain, but ONLY against the user's stored keys.
      for (const fallbackName of pinnedProvider
        ? []
        : ['glm', 'gemini', 'groq', 'openai', 'anthropic']) {
        if (fallbackName === activeProviderName) continue;
        try {
          const resolved = await resolveUserKey({
            userId: opts.userId,
            provider: `llm:${fallbackName}`,
            envVar: PROVIDERS[fallbackName]?.envKey,
            requireUser: true,
            reason: `llm.call.byok-fallback:${opts.model || provider.defaultModel}`,
          });
          if (resolved.key) {
            log.warn(req, 'llm.byok-fallback', {
              from: activeProviderName,
              to: fallbackName,
              reason: 'no_user_key_for_requested_provider',
            });
            activeProviderName = fallbackName;
            provider = PROVIDERS[fallbackName];
            apiKey = resolved.key;
            apiKeySource = resolved.source;
            break;
          }
        } catch {
          // Try next provider
        }
      }
    }

    if (!apiKey) {
      throw new Error(
        `BYOK_REQUIRED: this user has no LLM API key configured. Add a key for ${activeProviderName} (or any provider) in Settings → API Keys before creating goals.`
      );
    }
  } else if (isSystemContext) {
    // System context (cron, internal jobs): platform env keys are allowed.
    apiKey = process.env[provider.envKey];

    // Same fallback chain as before, but explicitly only for system context.
    if (!apiKey && !pinnedProvider && activeProviderName !== 'glm') {
      log.warn(req, 'llm.system-fallback', {
        from: activeProviderName,
        to: 'glm',
        reason: 'no platform API key',
      });
      activeProviderName = 'glm';
      provider = PROVIDERS.glm;
      apiKey = process.env[provider.envKey];
    }
    if (!apiKey && !pinnedProvider && activeProviderName !== 'groq') {
      log.warn(req, 'llm.system-fallback', {
        from: activeProviderName,
        to: 'groq',
        reason: 'no platform API key',
      });
      activeProviderName = 'groq';
      provider = PROVIDERS.groq;
      apiKey = process.env[provider.envKey];
    }

    if (!apiKey) {
      throw new Error(
        `SYSTEM_API_KEY_MISSING: ${provider.envKey} not configured for system jobs. Add it in environment variables.`
      );
    }
    apiKeySource = 'platform';
  }

  // Honor the call site's model override; fall back to the provider's default
  // only when the override is unset or when we've been forced onto a different
  // provider via the no-key / 429 fallback branches below.
  const model = modelOverride || provider.defaultModel;
  const isThinkingGemini = isGeminiThinkingModel(activeProviderName, model);
  // Gemini 3.6+ spends output tokens on reasoning as well as the visible JSON.
  // An 800-token cap was enough to truncate the PO quick response before a
  // valid object appeared, so structured calls get a practical minimum.
  const effectiveMaxTokens = isThinkingGemini && jsonMode ? Math.max(maxTokens, 4096) : maxTokens;

  const isAnthropic = provider.isAnthropic;

  log.info(req, 'llm.call.start', {
    provider: providerName,
    model,
    promptLength: prompt.length,
    apiKeySource,
  });

  const start = Date.now();
  let fetchUrl, fetchHeaders, fetchBody;

  if (isAnthropic) {
    // Anthropic Messages API format
    const userPrompt = jsonMode
      ? `${prompt}\n\nYou MUST respond with valid JSON only. No markdown, no explanation, just the JSON object.`
      : prompt;

    fetchUrl = provider.url;
    fetchHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
    fetchBody = JSON.stringify({
      model,
      max_tokens: effectiveMaxTokens,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    });
  } else {
    // OpenAI-compatible format (Groq, OpenAI)
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    fetchUrl = provider.url;
    if (provider.isLocal) {
      let baseUrl = apiKey.replace(/\/$/, '');
      if (providerName === 'ollama' && !baseUrl.endsWith('/v1')) baseUrl += '/v1';
      if (!baseUrl.endsWith('/chat/completions')) baseUrl += '/chat/completions';
      fetchUrl = baseUrl;
      fetchHeaders = {
        Authorization: 'Bearer local',
        'Content-Type': 'application/json',
      };
    } else {
      fetchHeaders = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
    }
    const body = { model, messages, max_tokens: effectiveMaxTokens };
    // Gemini 3.6+ removed the legacy sampling controls from its migration
    // contract. The OpenAI-compatible endpoint accepts reasoning_effort.
    // Production defaults to medium; evaluations can explicitly request high.
    if (!isThinkingGemini) body.temperature = temperature;
    if (isThinkingGemini) body.reasoning_effort = geminiReasoningEffort(opts.reasoningEffort);
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    fetchBody = JSON.stringify(body);
  }

  // Soft timeout — race the fetch against a deadline so a slow provider
  // doesn't burn the entire job-processor budget. If the provider doesn't
  // respond, we throw a marker error that the catch below converts into a
  // fast cross-provider fallback. Distinct from the existing 429/5xx
  // fallback which only fires on explicit error responses.
  //
  // Per-provider because a global 25s killed GLM 5.1 and Qwen Max on
  // provider-pinned goals — those models routinely take 30-60s on complex
  // prompts. The pinnedProvider path used to throw LLM_PROVIDER_PINNED_TIMEOUT
  // at 25s, leaving the goal stuck before the model had a chance.
  const providerSoftTimeoutMs = PROVIDER_SOFT_TIMEOUT_MS[activeProviderName] ?? 25_000;
  const softTimeoutMs = resolveLlmDeadlineMs({
    provider: activeProviderName,
    model,
    reasoningEffort: opts.reasoningEffort,
    requestedTimeoutMs: providerSoftTimeoutMs,
    defaultTimeoutMs: providerSoftTimeoutMs,
  });
  const networkRetries = resolveLlmNetworkRetries({
    provider: activeProviderName,
    model,
    reasoningEffort: opts.reasoningEffort,
  });
  let res;
  let slowTimeoutId;
  const softTimeoutController = new AbortController();
  try {
    res = await Promise.race([
      fetchWithRetry(
        fetchUrl,
        {
          method: 'POST',
          headers: fetchHeaders,
          body: fetchBody,
          signal: softTimeoutController.signal,
        },
        { timeoutMs: Math.max(60_000, softTimeoutMs + 5_000), retries: networkRetries }
      ),
      new Promise((_, reject) => {
        slowTimeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `LLM_SLOW_TIMEOUT: ${activeProviderName} did not respond in ${softTimeoutMs}ms`
          );
          reject(timeoutError);
          softTimeoutController.abort(timeoutError);
        }, softTimeoutMs);
      }),
    ]);
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    const isSlowTimeout = err.message?.includes('LLM_SLOW_TIMEOUT');
    if (isSlowTimeout && pinnedProvider) {
      // Provider-pinned call — do not silently try other LLMs. Rethrow with
      // a clear message the job processor can surface via failure_reason.
      throw new Error(
        `LLM_PROVIDER_PINNED_TIMEOUT: ${activeProviderName} did not respond in ${softTimeoutMs}ms. Cross-provider fallback is disabled for this call.`
      );
    }
    if (isSlowTimeout) {
      // Cross-provider fallback chain on slow response.
      // Try every other provider that has a key configured AND hasn't been
      // tried yet (tracked via opts._triedProviders).
      const tried = new Set(opts._triedProviders || []);
      tried.add(activeProviderName);
      const fallbackOrder = pickFallbackChain(activeProviderName, tried);
      for (const next of fallbackOrder) {
        log.warn(req, 'llm.fallback-slow', {
          from: activeProviderName,
          to: next,
          timeoutMs: softTimeoutMs,
          tried: [...tried],
        });
        try {
          return await executeLlm({
            ...opts,
            provider: next,
            model: undefined,
            _triedProviders: [...tried],
          });
        } catch (innerErr) {
          if (isJobLeaseLostError(innerErr)) throw innerErr;
          tried.add(next);
          // Try the next provider in chain
        }
      }
    }
    // Not a slow timeout OR no fallback available — rethrow
    throw err;
  } finally {
    if (slowTimeoutId) clearTimeout(slowTimeoutId);
  }

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error(req, 'llm.call.failed', {
      provider: activeProviderName,
      model,
      status: res.status,
      error: errText.slice(0, 300),
    });

    // Cross-provider fallback chain on hard errors (429 / 403 / 4xx-billing / 5xx).
    // Walks through every provider with a configured key, trying each one
    // until one succeeds. Replaces the older bilateral fallback that could
    // ping-pong between two dead providers (e.g. anthropic→groq→anthropic).
    const isBillingError =
      res.status === 402 ||
      (res.status === 400 &&
        (errText.includes('credit balance') ||
          errText.includes('billing') ||
          errText.includes('insufficient')));
    const isRateLimit = res.status === 429;
    const isAccessDenied = res.status === 403;
    const isServerError = res.status >= 500;
    const shouldFallback = isBillingError || isRateLimit || isAccessDenied || isServerError;

    // 403 "Access denied" from providers like Groq typically means the
    // current egress IP is geo-blocked. Mark the provider dead for the
    // session so we don't keep wasting the 25s SOFT_TIMEOUT wall on it.
    if (isAccessDenied) markProviderDead(activeProviderName, `http_403: ${errText.slice(0, 80)}`);

    // Provider-pinned call: don't silently switch providers. Fail fast with a
    // clear reason instead of returning a result from a different executor.
    if (shouldFallback && pinnedProvider) {
      const reason = isBillingError
        ? 'billing'
        : isRateLimit
          ? 'rate_limit'
          : isAccessDenied
            ? 'access_denied'
            : `status_${res.status}`;
      throw new Error(
        `LLM_PROVIDER_PINNED_FAILED: ${activeProviderName} returned ${res.status} (${reason}). Cross-provider fallback is disabled for this call.`
      );
    }

    if (shouldFallback) {
      const tried = new Set(opts._triedProviders || []);
      tried.add(activeProviderName);
      const fallbackOrder = pickFallbackChain(activeProviderName, tried);
      for (const next of fallbackOrder) {
        const reason = isBillingError
          ? 'billing'
          : isRateLimit
            ? 'rate_limit'
            : isAccessDenied
              ? 'access_denied'
              : `status_${res.status}`;
        log.warn(req, 'llm.fallback-retry', {
          from: activeProviderName,
          to: next,
          reason,
          tried: [...tried],
        });
        try {
          return await executeLlm({
            ...opts,
            provider: next,
            model: undefined,
            _triedProviders: [...tried],
          });
        } catch (innerErr) {
          if (isJobLeaseLostError(innerErr)) throw innerErr;
          tried.add(next);
          // try the next provider — comment intentional, suppresses S2486
        }
      }
    }

    // DashScope-specific error mapping — its error bodies are structured
    // JSON with { code, message }, so surface a human-readable reason in
    // the goal's failure_reason instead of raw JSON.
    if (activeProviderName === 'qwen') {
      let dsCode = '';
      let dsMsg = '';
      try {
        const parsed = JSON.parse(errText);
        dsCode = parsed.code || '';
        dsMsg = parsed.message || '';
      } catch {
        /* non-JSON, ignore */
      }
      if (dsCode) {
        const human =
          dsCode === 'InvalidApiKey'
            ? 'Qwen API key is invalid — check QWEN_API_KEY in env.'
            : dsCode === 'Throttling' || dsCode === 'Throttling.RateQuota'
              ? 'Qwen rate-limited — try again in a few seconds.'
              : dsCode === 'InvalidParameter'
                ? `Qwen rejected the request (bad parameter): ${dsMsg.slice(0, 120)}`
                : dsCode === 'ModelNotFoundError'
                  ? `Qwen model ${model} not found — use qwen-max/qwen-plus/qwen-turbo.`
                  : `Qwen ${dsCode}: ${dsMsg.slice(0, 120)}`;
        throw new Error(`LLM qwen ${res.status}: ${human}`);
      }
    }
    throw new Error(`LLM ${activeProviderName} ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();

  // Normalize response across providers
  let content, usage, finishReason;
  if (isAnthropic) {
    content = data.content?.[0]?.text || '';
    usage = {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      // Prompt-cache hit/write counts so usage analytics can surface cache savings.
      cache_read_input_tokens: data.usage?.cache_read_input_tokens || 0,
      cache_creation_input_tokens: data.usage?.cache_creation_input_tokens || 0,
    };
    finishReason = data.stop_reason || null;
  } else {
    content = data.choices?.[0]?.message?.content || '';
    usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    finishReason = data.choices?.[0]?.finish_reason || null;
  }

  const costs = TOKEN_COSTS[model] || { input: 0, output: 0 };
  const estimatedCostUsd =
    (usage.prompt_tokens / 1000) * costs.input + (usage.completion_tokens / 1000) * costs.output;

  log.info(req, 'llm.call.complete', {
    provider: providerName,
    model,
    durationMs,
    tokens: usage.total_tokens,
    estimatedCostUsd: estimatedCostUsd.toFixed(6),
  });

  if (jsonMode && needsJsonRepair(content)) {
    if (opts._jsonRepairAttempted) {
      throw new Error(
        `LLM_INVALID_JSON_AFTER_REPAIR: ${activeProviderName}/${model} returned unparseable JSON twice.`
      );
    }

    log.warn(req, 'llm.json-repair.retry', { provider: activeProviderName, model });
    const repair = await executeLlm({
      ...opts,
      provider: activeProviderName,
      model,
      prompt: buildJsonRepairPrompt(content),
      systemPrompt:
        'You are a strict JSON repairer. Preserve the supplied data and return valid JSON only.',
      maxTokens: Math.max(effectiveMaxTokens, 4096),
      jsonMode: true,
      pinnedProvider: true,
      _jsonRepairAttempted: true,
      _presetResolved: true,
      _triedProviders: [],
      _claudeCodeBypassReroute: true,
    });
    if (repair.provider !== activeProviderName) {
      throw new Error(
        `LLM_JSON_REPAIR_PROVIDER_MISMATCH: expected ${activeProviderName}, received ${repair.provider}.`
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
    usage,
    model,
    provider: providerName,
    durationMs,
    estimatedCostUsd,
    finishReason,
  };
}

/**
 * Try to parse JSON from LLM output (handles markdown code fences and
 * token-cap truncation). Re-exported from the shared helper so both executors
 * share one implementation.
 */
export { parseLlmJson } from '../_shared/llm-json.js';
