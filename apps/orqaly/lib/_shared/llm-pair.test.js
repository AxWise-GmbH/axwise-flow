import { describe, expect, it } from 'vitest';
import { inferLlmProvider, resolveLlmPair } from './llm-pair.js';

describe('resolveLlmPair', () => {
  it('preserves a complete explicit pair', () => {
    expect(resolveLlmPair({ provider: 'anthropic', model: 'custom-claude-deployment' })).toEqual({
      provider: 'anthropic',
      model: 'custom-claude-deployment',
    });
  });

  it('derives a provider-compatible model for a provider-only input', () => {
    expect(resolveLlmPair({ provider: 'openai' })).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('infers the provider for a model-only input', () => {
    expect(resolveLlmPair({ model: 'glm-5.1' })).toEqual({
      provider: 'glm',
      model: 'glm-5.1',
    });
  });

  it('falls back atomically for an unknown partial choice', () => {
    expect(
      resolveLlmPair(
        { provider: 'unknown-provider' },
        { fallback: { provider: 'groq', model: 'llama-3.3-70b-versatile' } }
      )
    ).toEqual({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
  });

  it('repairs a mismatched fallback instead of returning a hybrid pair', () => {
    expect(
      resolveLlmPair({}, { fallback: { provider: 'openai', model: 'gemini-3.8-flash' } })
    ).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('respects an allowed-provider boundary', () => {
    expect(
      resolveLlmPair(
        { model: 'qwen-max' },
        { allowedProviders: ['groq', 'gemini'], fallback: { provider: 'gemini' } }
      )
    ).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
  });
});

describe('inferLlmProvider', () => {
  it.each([
    ['gemini-3.8-flash', 'gemini'],
    ['gemini-3.6-flash', 'gemini'],
    ['gpt-4o-mini', 'openai'],
    ['claude-sonnet-5', 'anthropic'],
    ['deepseek-chat', 'deepseek'],
    ['glm-5.1', 'glm'],
    ['qwen-max', 'qwen'],
    ['anthropic/claude-opus-4.6', 'openrouter'],
  ])('maps %s to %s', (model, provider) => {
    expect(inferLlmProvider(model)).toBe(provider);
  });
});
