import { afterEach, describe, expect, it } from 'vitest';
import { resolveGoalStageLlm } from './goal-stage-llm.js';

afterEach(() => {
  delete process.env.LLM_DEFAULT_PROVIDER;
  delete process.env.LLM_DEFAULT_MODEL;
});

describe('resolveGoalStageLlm', () => {
  it('uses the release default pair when no operator override exists', () => {
    expect(resolveGoalStageLlm('anthropic', 'claude-sonnet-5')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
    expect(resolveGoalStageLlm('anthropic', 'claude-haiku-4-5')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      pinnedProvider: true,
    });
  });

  it('uses the exact operator-configured pair for every internal stage default', () => {
    process.env.LLM_DEFAULT_PROVIDER = 'openai';
    process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';

    expect(resolveGoalStageLlm('anthropic', 'claude-sonnet-5')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      pinnedProvider: true,
    });
    expect(resolveGoalStageLlm('glm', 'glm-5.1')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      pinnedProvider: true,
    });
  });
});
