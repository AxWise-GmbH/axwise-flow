const GEMINI_REASONING_LEVELS = new Set(['low', 'medium', 'high']);

// High-reasoning Gemini 3.6+ calls can spend well over a minute thinking
// before the non-streaming OpenAI-compatible endpoint returns its first byte.
// Keep the request bounded, but do not let the generic 30-60s deadlines kill
// a healthy specialist or synthesis call before it can answer.
export const GEMINI_HIGH_REASONING_DEADLINE_MS = 300_000;

// api/agent.js has a 180-second Vercel ceiling and the durable job worker stops
// at 170 seconds. Leave enough time to persist a retry instead of letting the
// platform kill an otherwise healthy high-reasoning request mid-flight.
export const VERCEL_GEMINI_HIGH_REASONING_DEADLINE_MS = 155_000;

/** Gemini 3.6+ uses thinking controls instead of legacy sampling controls. */
export function isGeminiThinkingModel(provider, model) {
  return provider === 'gemini' && /^gemini-3\.(?:6|7|8)(?:-|$)/.test(String(model || ''));
}

/** Resolve the OpenAI-compatible Gemini reasoning_effort value at call time. */
export function geminiReasoningEffort(value = process.env.GEMINI_REASONING_EFFORT) {
  const normalized = String(value || 'medium')
    .trim()
    .toLowerCase();
  return GEMINI_REASONING_LEVELS.has(normalized) ? normalized : 'medium';
}

/**
 * Resolve the wall-clock request deadline without changing ordinary calls.
 * An explicit longer deadline remains authoritative; only a too-short
 * deadline for a high-reasoning Gemini thinking model is raised to five
 * minutes. This controls time, not response length or output tokens.
 */
export function resolveLlmDeadlineMs({
  provider,
  model,
  reasoningEffort,
  requestedTimeoutMs,
  defaultTimeoutMs,
  env = process.env,
}) {
  const requested = Number(requestedTimeoutMs);
  const fallback = Number(defaultTimeoutMs);
  const baseTimeoutMs =
    Number.isFinite(requested) && requested > 0
      ? requested
      : Number.isFinite(fallback) && fallback > 0
        ? fallback
        : 30_000;

  if (isGeminiThinkingModel(provider, model) && geminiReasoningEffort(reasoningEffort) === 'high') {
    const highReasoningDeadlineMs = Math.max(baseTimeoutMs, GEMINI_HIGH_REASONING_DEADLINE_MS);
    return env?.VERCEL
      ? Math.min(highReasoningDeadlineMs, VERCEL_GEMINI_HIGH_REASONING_DEADLINE_MS)
      : highReasoningDeadlineMs;
  }

  return baseTimeoutMs;
}

/**
 * A Vercel invocation cannot fit two 155-second provider attempts. Let the
 * durable job retry own the next attempt after state has been persisted.
 */
export function resolveLlmNetworkRetries({
  provider,
  model,
  reasoningEffort,
  defaultRetries = 1,
  env = process.env,
}) {
  if (
    env?.VERCEL &&
    isGeminiThinkingModel(provider, model) &&
    geminiReasoningEffort(reasoningEffort) === 'high'
  ) {
    return 0;
  }

  return defaultRetries;
}

export const SUPPORTED_GEMINI_REASONING_EFFORTS = Object.freeze([...GEMINI_REASONING_LEVELS]);
