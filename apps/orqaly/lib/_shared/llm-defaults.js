/**
 * Single source of truth for the default LLM provider/model.
 *
 * Historically `'groq'` + `'llama-3.3-70b-versatile'` was hardcoded at ~70 call
 * sites across goal stages, agents and the Assistant, so pointing the whole
 * platform at a different provider for testing meant a find-and-replace. These
 * constants centralise that choice behind two env vars:
 *
 *   LLM_DEFAULT_PROVIDER=gemini
 *   LLM_DEFAULT_MODEL=gemini-3.8-flash
 *
 * Unset (the production case) they resolve to the exact Google Gemini pair
 * used by Orqaly. Set them together to select another provider explicitly.
 *
 * These are the *default* — an explicit per-request provider (the Assistant's
 * model picker) and a per-goal comparison pin (`goal.data.test_model`) still
 * win. Goal-planning and execution paths use the force option so an operator
 * can run the complete normal workflow on one configured provider/model.
 */

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
export const FALLBACK_PROVIDER = 'gemini';
export const FALLBACK_MODEL = GEMINI_DEFAULT_MODEL;

/** Cheap/fast tier default. Used for summarisation, grading and eval calls. */
export const FALLBACK_CHEAP_MODEL = GEMINI_DEFAULT_MODEL;

// Static role maps still contain the historical Groq baseline. Keep these
// internal markers separate from the public platform fallback so baseline
// entries move to Gemini even when no environment override is present, while
// deliberate Anthropic/OpenAI/etc. pins remain explicit.
const LEGACY_BASELINE_PROVIDER = 'groq';
const LEGACY_BASELINE_CHEAP_MODEL = 'llama-3.1-8b-instant';

function productionDefaultIsLocalOnly() {
  return Boolean(process.env.VERCEL) && process.env.LLM_DEFAULT_PROVIDER === 'claude-code';
}

/**
 * Read at call time (not module load) so tests can mutate process.env and
 * `dev:local` picks up .env.local without a rebuild.
 */
export function defaultProvider() {
  // Claude Code depends on a developer-machine OAuth session and can never be
  // Orqaly's serverless production executor. Treat a stale/mistyped Vercel
  // override as configuration drift and keep the production harness on the
  // platform Gemini pair instead of surfacing a misleading Claude route.
  if (productionDefaultIsLocalOnly()) return FALLBACK_PROVIDER;
  return process.env.LLM_DEFAULT_PROVIDER || FALLBACK_PROVIDER;
}

export function defaultModel() {
  if (productionDefaultIsLocalOnly()) return FALLBACK_MODEL;
  return process.env.LLM_DEFAULT_MODEL || FALLBACK_MODEL;
}

/**
 * Cheap-tier model. Falls back to LLM_DEFAULT_MODEL when an override provider
 * is active so provider/model pairs remain compatible. Orqaly's unset cheap
 * tier is deliberately the same exact Gemini model as the primary tier.
 */
export function defaultCheapModel() {
  if (productionDefaultIsLocalOnly()) return FALLBACK_CHEAP_MODEL;
  if (process.env.LLM_DEFAULT_CHEAP_MODEL) return process.env.LLM_DEFAULT_CHEAP_MODEL;
  if (process.env.LLM_DEFAULT_PROVIDER || process.env.LLM_DEFAULT_MODEL) return defaultModel();
  return FALLBACK_CHEAP_MODEL;
}

/** `{ provider, model }` pair for the default tier. */
export function defaultLlm() {
  return { provider: defaultProvider(), model: defaultModel() };
}

/** `{ provider, model }` pair for the cheap tier. */
export function defaultCheapLlm() {
  return { provider: defaultProvider(), model: defaultCheapModel() };
}

/** True when an operator has explicitly overridden the platform default. */
export function hasDefaultOverride() {
  return Boolean(process.env.LLM_DEFAULT_PROVIDER || process.env.LLM_DEFAULT_MODEL);
}

/**
 * Redirect a `{ provider, model }` entry from a static role/tier map onto the
 * configured default.
 *
 * Entries that deliberately pin a *different* provider (e.g. Frontend Developer
 * on anthropic/claude-sonnet-4-6 for landing-page HTML) are preserved by
 * default: only entries matching the historical groq baseline are moved. Pass
 * `{ force: true }` to redirect every entry regardless — useful when testing a
 * single provider end-to-end and you want no cross-provider calls at all.
 */
export function applyDefaultProvider(entry, { force = false } = {}) {
  if (!entry?.provider) return entry;
  const isBaseline = entry.provider === LEGACY_BASELINE_PROVIDER;
  if (!force && !isBaseline) return entry;
  const model =
    entry.model === LEGACY_BASELINE_CHEAP_MODEL && !force ? defaultCheapModel() : defaultModel();
  return { ...entry, provider: defaultProvider(), model };
}

/** Map-wide variant of applyDefaultProvider() for ROLE_MODEL_MAP / MODEL_TIERS. */
export function applyDefaultProviderMap(map, opts = {}) {
  const out = {};
  for (const [key, entry] of Object.entries(map)) {
    out[key] = applyDefaultProvider(entry, opts);
  }
  return out;
}
