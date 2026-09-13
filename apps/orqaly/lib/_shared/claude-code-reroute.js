/**
 * Localhost-only reroute onto the `claude-code` provider.
 *
 * Shared by both LLM executors (lib/agent-handlers/llm-executor.js and
 * lib/concilium-handlers/llm-executor-v2.js) so a single env var switches the
 * whole platform onto the developer's Claude Max/Pro subscription for local
 * testing. Lives in lib/_shared/ because v2 sits in a different handler domain
 * and must not import from lib/agent-handlers/.
 *
 * The subscription path (lib/agent-handlers/claude-code-provider.js) runs
 * through @anthropic-ai/claude-agent-sdk with `apiKeySource: 'none'`, i.e. the
 * OAuth session from `claude login` — no API key, no billing.
 */

// M9 / M11: Pure override that reroutes LLM calls to the claude-code
// provider (the user's Claude Max subscription via @anthropic-ai/claude-
// agent-sdk) when running on localhost.
//
// Modes (CLAUDE_CODE_LOCAL env var):
//   unset / anything else → M9 default: reroute ANTHROPIC calls only, model
//                           unchanged (sonnet-5, etc. passes through).
//   'all'                 → M11: reroute EVERY provider and force the model
//                           from CLAUDE_CODE_MODEL (default claude-opus-5)
//                           so every agent on localhost runs on the
//                           subscription. Burns quota; switch on only for
//                           high-quality testing.
//   'off'                 → disables the reroute entirely. Paid Anthropic
//                           API (or whatever original provider) is used.
//
// CLAUDE_CODE_MODEL picks which model `all` mode forces. Latency differs by
// an order of magnitude, measured through the Agent SDK on one substantive
// copilot-style prompt:
//   claude-opus-5    ~50-66s   highest quality; the default
//   claude-sonnet-5  ~70s      no faster — the 5-family thinks by default and
//                              maxThinkingTokens:0 no longer suppresses it
//   claude-haiku-4-5  ~5s      ~13x faster; use for interactive/chat testing
// Multiply by the 3-4 sequential calls a copilot turn makes: Opus 5 is ~3
// minutes per Assistant message, Haiku is a few seconds. Pick per session.
//
// Returns `{ provider, model? }`. `model` is only set when we're overriding
// it — caller keeps the original model string otherwise. Inputs are injected
// so unit tests don't touch process.env or load the SDK.
//
// `pinnedProvider`: when true, the caller (compare-mode via pickTestModel)
// explicitly chose this provider from goal.data.test_model and the env-driven
// reroute must NOT override it. Otherwise CLAUDE_CODE_LOCAL=all would silently
// collapse "GLM vs Qwen vs Opus" into "Opus vs Opus vs Opus". The compare UI
// exposes the subscription as `provider:'claude-code'` directly, so the
// subscription path is still reachable — by user choice, not by env override.
export function maybeRerouteToClaudeCode(provider, { env = process.env, sdkAvailable, pinnedProvider = false } = {}) {
  const stay = { provider };
  if (pinnedProvider) return stay;
  if (env?.VERCEL) return stay;
  if (env?.VITEST || env?.NODE_ENV === 'test') return stay;
  if (env?.CLAUDE_CODE_LOCAL === 'off') return stay;
  const mode = env?.CLAUDE_CODE_LOCAL === 'all' ? 'all' : 'anthropic';
  if (mode === 'anthropic' && provider !== 'anthropic') return stay;
  const ok = typeof sdkAvailable === 'function' ? sdkAvailable() : sdkAvailable;
  if (!ok) return stay;
  return mode === 'all'
    ? { provider: 'claude-code', model: forcedClaudeCodeModel(env) }
    : { provider: 'claude-code' };
}

/** Default model `all` mode forces when CLAUDE_CODE_MODEL is unset. */
export const DEFAULT_CLAUDE_CODE_MODEL = 'claude-opus-5';

/**
 * Which model the `all`-mode reroute forces. Read from env so a developer can
 * trade quality for latency (see the table above) without touching code.
 */
export function forcedClaudeCodeModel(env = process.env) {
  const m = env?.CLAUDE_CODE_MODEL;
  return typeof m === 'string' && m.trim() ? m.trim() : DEFAULT_CLAUDE_CODE_MODEL;
}

// Memoized dynamic-import probe. Only runs when a call would otherwise route
// to a paid API on localhost, so production (which exits
// maybeRerouteToClaudeCode on the VERCEL check) never imports the optional
// dev dependency. Shared by both executors so the import happens at most once
// per process.
let claudeCodeSdkProbePromise = null;
export async function probeClaudeCodeSdk() {
  if (claudeCodeSdkProbePromise) return claudeCodeSdkProbePromise;
  claudeCodeSdkProbePromise = (async () => {
    try {
      await import('@anthropic-ai/claude-agent-sdk');
      return true;
    } catch {
      return false;
    }
  })();
  return claudeCodeSdkProbePromise;
}

/** Test-only: drop the memoized probe so cases can vary SDK availability. */
export function resetClaudeCodeSdkProbe() {
  claudeCodeSdkProbePromise = null;
}

/**
 * Shared guard for whether the reroute should even be attempted this call.
 * Kept here so both executors apply identical skip conditions.
 *
 * `hasTools`: the caller supplied function/tool definitions and needs
 * structured tool_calls back. The subscription path CANNOT serve those — the
 * Agent SDK runs with `allowedTools: []` and executeClaudeCode returns no
 * toolCalls — so rerouting a tool-carrying call silently strips the tools and
 * the model *narrates* the tool use instead of performing it ("I'll create the
 * GitHub repo…" with nothing created). That failure mode is already documented
 * at execute-task.js's ReAct call site. Leaving these calls on their original
 * provider (groq/glm/openai/anthropic — all tool-capable) is what the platform
 * did before v2 gained this reroute, and is what keeps GitHub/Drive/Notion
 * uploads actually happening. The tool executions themselves are plain HTTP
 * and cost nothing; only this one deciding turn leaves the subscription.
 */
export function shouldAttemptReroute({ env = process.env, pinnedProvider = false, bypass = false, hasTools = false } = {}) {
  if (bypass) return false;
  if (pinnedProvider) return false;
  if (hasTools) return false;
  if (env?.VERCEL) return false;
  if (env?.VITEST || env?.NODE_ENV === 'test') return false;
  return true;
}

/**
 * True when the operator explicitly demanded the subscription for everything.
 * In that mode a claude-code failure must NOT fall through to a paid provider:
 * silently switching would violate the intent and mask the real error.
 */
export function forbidsPaidFallback(env = process.env) {
  return env?.CLAUDE_CODE_LOCAL === 'all';
}
