/**
 * Conservative pre-flight cost estimate for a not-yet-executed LLM call, used
 * to enforce a hard spend cap BEFORE the call starts (actual token counts are
 * only known after a provider responds, so a true "never exceed $X" cap must
 * block on a worst-case estimate, not on the post-call actual cost).
 *
 * Formula mirrors lib/concilium-handlers/agent-factory.js's estimateCost():
 * chars/4 as a token-count heuristic (no real tokenizer in this repo), input
 * cost from the estimated prompt tokens, output cost from the full maxTokens
 * ceiling (the model could use all of it) — both at worst-case per-1K rates
 * when the exact model's cost isn't known yet. Deliberately over-estimates:
 * real completions are usually shorter than maxTokens, and over-estimating is
 * the safe direction for a hard cap.
 */

// Worst-case (highest) per-1K-token rates seen across both executors'
// TOKEN_COSTS tables today. Used only when the target model's own cost isn't
// in this table (e.g. an unrecognized or not-yet-selected model) — better to
// over-block than to under-count a cap.
const WORST_CASE_COSTS = { input: 0.005, output: 0.025 }; // claude-opus-5 — priciest entry below

// Small local cost table covering the models this feature needs to estimate
// for. Not imported from the executors' own TOKEN_COSTS (those are module-
// local/unexported) — kept intentionally self-contained so this module has no
// coupling to either executor's internals.
const TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gemini-3.8-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.7-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.6-flash': { input: 0.0015, output: 0.0075 },
  'gemini-flash-latest': { input: 0.0015, output: 0.0075 },
  'gemini-pro-latest': { input: 0.00125, output: 0.01 },
  'glm-4.6': { input: 0.0006, output: 0.0022 },
  'qwen-max': { input: 0.0012, output: 0.0048 },
};

const DEFAULT_MAX_TOKENS = 2000; // matches both executors' own default

/**
 * @param {object} opts
 * @param {string} [opts.promptText]
 * @param {string} [opts.systemPrompt]
 * @param {number} [opts.maxTokens] - defaults to 2000, matching both executors
 * @param {string} [opts.model] - looked up in the local cost table; falls back
 *   to worst-case rates when unknown so the estimate never under-counts
 * @returns {number} conservative upper-bound cost in USD for this one call
 */
export function estimatePreflightCostUsd({
  promptText = '',
  systemPrompt = '',
  maxTokens,
  model,
} = {}) {
  const promptTokens = Math.ceil((String(promptText).length + String(systemPrompt).length) / 4);
  const outputTokens = Number(maxTokens) > 0 ? Number(maxTokens) : DEFAULT_MAX_TOKENS;
  const costs = (model && TOKEN_COSTS[model]) || WORST_CASE_COSTS;

  const inputCost = (promptTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;
  return inputCost + outputCost;
}
