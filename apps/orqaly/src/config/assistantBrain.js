/**
 * Single source of truth for the assistant "brain" options - LLM providers (with
 * their model lists) and the available tones. Shared by the setup wizard's
 * ByokByosCard and the Assistant Console's ProfileBrainCard so the two never
 * drift. Keep ids aligned with the backend provider keys (llm:<id>).
 */
export const DEFAULT_LLM_PROVIDER = 'gemini';
export const DEFAULT_LLM_MODEL = 'gemini-3.8-flash';

export const DEFAULT_ASSISTANT_PROVIDER = DEFAULT_LLM_PROVIDER;
export const DEFAULT_ASSISTANT_MODEL = DEFAULT_LLM_MODEL;

export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite-preview',
      'gemini-3-pro-preview',
      'gemini-3-flash-preview',
      'gemini-pro-latest',
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
  },
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  },
  {
    id: 'groq',
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    models: [
      'anthropic/claude-sonnet-4.6',
      'openai/gpt-4o',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
    ],
  },
];

export const TONES = ['friendly', 'professional', 'technical', 'creative', 'minimal'];

/** Models for a provider id (empty array if unknown). */
export function modelsForProvider(providerId) {
  return PROVIDERS.find((p) => p.id === providerId)?.models || [];
}

/** Human label for a provider id (falls back to the id). */
export function providerLabel(providerId) {
  return PROVIDERS.find((p) => p.id === providerId)?.label || providerId || '';
}

/** Short, friendly display names for the in-chat model chip. */
const SHORT_LABELS = {
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (preview)',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'gemini-3.5-flash-lite-preview': 'Gemini 3.5 Flash-Lite (preview)',
  'gemini-3-pro-preview': 'Gemini 3 Pro (preview)',
  'gemini-3-flash-preview': 'Gemini 3 Flash (preview)',
  'gemini-pro-latest': 'Gemini Pro',
  'gemini-flash-latest': 'Gemini Flash',
  'gemini-flash-lite-latest': 'Gemini Flash-Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.0-flash-lite': 'Gemini 2.0 Flash-Lite',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'claude-opus-5': 'Claude Opus 5',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'llama-3.3-70b-versatile': 'Llama 3.3',
  'llama-3.1-8b-instant': 'Llama 3.1',
  'gemma2-9b-it': 'Gemma 2 9B',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6 (via OpenRouter)',
  'openai/gpt-4o': 'GPT-4o (via OpenRouter)',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro (via OpenRouter)',
  'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 (via OpenRouter)',
};

/** Short chip label for a model id (falls back to the raw id). */
export function shortModelLabel(model) {
  return SHORT_LABELS[model] || model || '';
}
