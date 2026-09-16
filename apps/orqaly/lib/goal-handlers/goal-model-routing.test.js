import { afterEach, describe, expect, it } from 'vitest';
import { pickTestModel } from './_helpers.js';

afterEach(() => {
  delete process.env.LLM_DEFAULT_PROVIDER;
  delete process.env.LLM_DEFAULT_MODEL;
});

describe('goal pipeline model routing', () => {
  it('pins normal planner and evaluation calls to Gemini with no cross-provider fallback', () => {
    expect(pickTestModel({}, 'anthropic', 'claude-sonnet-5')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
    expect(pickTestModel({}, 'groq', 'llama-3.1-8b-instant')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
  });

  it('keeps an explicit operator pair deterministic too', () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';

    expect(pickTestModel({}, 'anthropic', 'claude-sonnet-5')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
  });

  it('preserves an explicit development comparison pin', () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';

    expect(
      pickTestModel(
        { data: { test_model: { provider: 'anthropic', model: 'claude-opus-5' } } },
        'groq',
        'llama-3.3-70b-versatile'
      )
    ).toEqual({ provider: 'anthropic', model: 'claude-opus-5', pinnedProvider: true });
  });
});
