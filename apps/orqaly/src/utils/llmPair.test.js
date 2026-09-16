import { describe, expect, it } from 'vitest';
import { inferLlmProvider, resolveLlmPair } from './llmPair';

describe('resolveLlmPair', () => {
  it('preserves a complete explicit pair', () => {
    expect(resolveLlmPair({ provider: 'openai', model: 'custom-deployment' })).toEqual({
      provider: 'openai',
      model: 'custom-deployment',
    });
  });

  it('derives a compatible model for provider-only data', () => {
    expect(resolveLlmPair({ provider: 'anthropic' })).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    });
  });

  it('infers a provider for model-only data', () => {
    expect(resolveLlmPair({ model: 'deepseek-reasoner' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    });
  });

  it('falls back atomically for unknown partial data', () => {
    expect(resolveLlmPair({ model: 'private-model' })).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('does not return a mismatched fallback pair', () => {
    expect(
      resolveLlmPair({}, { fallback: { provider: 'glm', model: 'gemini-3.8-flash' } })
    ).toEqual({ provider: 'glm', model: 'glm-5.1' });
  });

  it('uses the atomic fallback when an inferred provider is not allowed', () => {
    expect(
      resolveLlmPair(
        { model: 'qwen-max' },
        { allowedProviders: ['gemini', 'openai'], fallback: { provider: 'gemini' } }
      )
    ).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
  });
});

describe('inferLlmProvider', () => {
  it.each([
    ['gemini-3.8-flash', 'gemini'],
    ['gpt-4o-mini', 'openai'],
    ['claude-haiku-4-5', 'anthropic'],
    ['glm-5.1', 'glm'],
    ['anthropic/claude-opus-4.6', 'openrouter'],
  ])('maps %s to %s', (model, provider) => {
    expect(inferLlmProvider(model)).toBe(provider);
  });
});
