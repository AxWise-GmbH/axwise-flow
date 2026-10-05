import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_ASSISTANT_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  PROVIDERS,
  shortModelLabel,
  modelsForProvider,
  providerLabel,
} from './assistantBrain';

describe('assistantBrain', () => {
  it('pins assistant UI fallbacks to the exact Orqaly Gemini default', () => {
    expect(DEFAULT_ASSISTANT_PROVIDER).toBe('gemini');
    expect(DEFAULT_ASSISTANT_MODEL).toBe('gemini-3.8-flash');
    expect(DEFAULT_LLM_PROVIDER).toBe(DEFAULT_ASSISTANT_PROVIDER);
    expect(DEFAULT_LLM_MODEL).toBe(DEFAULT_ASSISTANT_MODEL);
    expect(modelsForProvider(DEFAULT_ASSISTANT_PROVIDER)[0]).toBe(DEFAULT_ASSISTANT_MODEL);
  });

  it('shortModelLabel maps known model ids to friendly names', () => {
    expect(shortModelLabel('llama-3.3-70b-versatile')).toBe('Llama 3.3');
    expect(shortModelLabel('claude-sonnet-5')).toBe('Claude Sonnet 5');
    expect(shortModelLabel('gpt-4o-mini')).toBe('GPT-4o Mini');
  });

  it('shortModelLabel falls back to the raw id for unknown models', () => {
    expect(shortModelLabel('some-future-model')).toBe('some-future-model');
    expect(shortModelLabel('')).toBe('');
    expect(shortModelLabel(undefined)).toBe('');
  });

  it('modelsForProvider / providerLabel still resolve', () => {
    expect(modelsForProvider('groq')).toContain('llama-3.3-70b-versatile');
    expect(providerLabel('groq')).toBe('Groq');
  });

  it('exposes the refreshed model list', () => {
    expect(modelsForProvider('gemini')).toContain('gemini-2.5-pro');
    expect(modelsForProvider('gemini')).toContain('gemini-2.5-flash-lite');
    expect(modelsForProvider('anthropic')).toContain('claude-opus-5');
    expect(shortModelLabel('claude-opus-5')).toBe('Claude Opus 5');
    expect(shortModelLabel('gemini-2.5-flash-lite')).toBe('Gemini 2.5 Flash-Lite');
  });

  it('lists the Gemini 3 / 3.5 models with (preview) labels', () => {
    expect(modelsForProvider('gemini')).toContain('gemini-3.6-flash');
    expect(modelsForProvider('gemini')).toContain('gemini-3.7-flash');
    expect(modelsForProvider('gemini')).toContain('gemini-3.8-flash');
    expect(modelsForProvider('gemini')).toContain('gemini-3.5-flash');
    expect(modelsForProvider('gemini')).toContain('gemini-3-pro-preview');
    expect(shortModelLabel('gemini-3.6-flash')).toBe('Gemini 3.6 Flash');
    expect(shortModelLabel('gemini-3.7-flash')).toBe('Gemini 3.7 Flash');
    expect(shortModelLabel('gemini-3.8-flash')).toBe('Gemini 3.8 Flash');
    expect(shortModelLabel('gemini-3.5-flash')).toBe('Gemini 3.5 Flash');
    expect(shortModelLabel('gemini-3-pro-preview')).toBe('Gemini 3 Pro (preview)');
    expect(shortModelLabel('gemini-3.5-flash-lite-preview')).toBe(
      'Gemini 3.5 Flash-Lite (preview)'
    );
  });

  it('every listed model has a friendly SHORT_LABELS entry', () => {
    for (const provider of PROVIDERS) {
      for (const model of provider.models) {
        // A mapped label differs from the raw id; the fallback returns the id.
        expect(shortModelLabel(model)).not.toBe(model);
      }
    }
  });
});
