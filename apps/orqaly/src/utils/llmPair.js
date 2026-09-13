import { DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER } from '../config/assistantBrain';

/** Known provider-level defaults used only when a caller supplies no model. */
export const KNOWN_LLM_DEFAULT_MODELS = Object.freeze({
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
  deepseek: 'deepseek-chat',
  glm: 'glm-5.1',
  qwen: 'qwen-max',
  gemini: DEFAULT_LLM_MODEL,
  openrouter: 'anthropic/claude-opus-4.6',
  gateway: 'openai/gpt-4o-mini',
  ollama: 'llama3',
  'local-openai': 'local-model',
});

const HARD_FALLBACK = Object.freeze({
  provider: DEFAULT_LLM_PROVIDER,
  model: DEFAULT_LLM_MODEL,
});

function valueOf(value) {
  const raw = typeof value === 'object' ? value?.value : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function inferLlmProvider(model) {
  const value = valueOf(model).toLowerCase();
  if (!value) return '';
  if (value === 'local-model') return 'local-openai';
  if (value === 'llama3') return 'ollama';
  if (value.startsWith('gemini-')) return 'gemini';
  if (value.startsWith('gpt-') || /^(o1|o3|o4)(-|$)/.test(value)) return 'openai';
  if (value.startsWith('claude-')) return 'anthropic';
  if (value.startsWith('deepseek-')) return 'deepseek';
  if (value.startsWith('glm-')) return 'glm';
  if (value.startsWith('qwen-')) return 'qwen';
  if (value.startsWith('llama-') || value.startsWith('gemma')) return 'groq';
  if (/^(anthropic|openai|google|meta-llama)\//.test(value)) return 'openrouter';
  return '';
}

function isAllowed(provider, allowedProviders) {
  return !allowedProviders || allowedProviders.includes(provider);
}

function fallbackPair(fallback, allowedProviders) {
  const provider = valueOf(fallback?.provider);
  const model = valueOf(fallback?.model);
  const inferred = inferLlmProvider(model);

  if (provider && isAllowed(provider, allowedProviders)) {
    if (model && (!inferred || inferred === provider)) return { provider, model };
    const knownModel = KNOWN_LLM_DEFAULT_MODELS[provider];
    if (knownModel) return { provider, model: knownModel };
  }
  if (model && inferred && isAllowed(inferred, allowedProviders)) {
    return { provider: inferred, model };
  }
  const allowedFallback = allowedProviders?.find(
    (candidate) => KNOWN_LLM_DEFAULT_MODELS[candidate]
  );
  if (allowedFallback) {
    return { provider: allowedFallback, model: KNOWN_LLM_DEFAULT_MODELS[allowedFallback] };
  }
  return { ...HARD_FALLBACK };
}

/**
 * Keep provider/model together. Complete explicit pairs are preserved; partial
 * choices are completed from known compatibility rules; unknown partials use
 * one complete fallback pair.
 */
export function resolveLlmPair(input = {}, options = {}) {
  const allowedProviders = options.allowedProviders;
  const fallback = fallbackPair(options.fallback || HARD_FALLBACK, allowedProviders);
  const provider = valueOf(input.provider);
  const model = valueOf(input.model);

  if (provider && model && isAllowed(provider, allowedProviders)) return { provider, model };

  if (provider && isAllowed(provider, allowedProviders)) {
    const knownModel = KNOWN_LLM_DEFAULT_MODELS[provider];
    return knownModel ? { provider, model: knownModel } : fallback;
  }

  if (model) {
    const inferred = inferLlmProvider(model);
    if (inferred && isAllowed(inferred, allowedProviders)) return { provider: inferred, model };
  }

  return fallback;
}
