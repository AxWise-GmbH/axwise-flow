import { describe, it, expect } from 'vitest';
import {
  extractTokenUsage,
  phaseKeyFromIndex,
  rollupPhaseTokens,
  getGoalTokenSummary,
} from './_helpers.js';

describe('extractTokenUsage', () => {
  it('reads usage object from executeLlm result', () => {
    expect(extractTokenUsage({
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 0 });
  });

  it('falls back to promptTokens fields', () => {
    expect(extractTokenUsage({ promptTokens: 10, completionTokens: 5 })).toEqual({
      promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedTokens: 0,
    });
  });

  it('reads cached prompt tokens from the OpenAI usage shape', () => {
    expect(extractTokenUsage({
      usage: {
        prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    })).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 40 });
  });

  it('reads cached prompt tokens from the Anthropic usage shape', () => {
    expect(extractTokenUsage({
      usage: {
        prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
        cache_read_input_tokens: 25,
      },
    })).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 25 });
  });
});

describe('rollupPhaseTokens', () => {
  it('accumulates tokens and model breakdown', () => {
    let rolled = {};
    rolled = rollupPhaseTokens(rolled, '0', { provider: 'groq', model: 'llama', tokens: 1000, costUsd: 0.001 });
    rolled = rollupPhaseTokens(rolled, '0', { provider: 'groq', model: 'llama', tokens: 500, costUsd: 0.0005 });
    expect(rolled['0'].total_tokens).toBe(1500);
    expect(rolled['0'].cost_usd).toBeCloseTo(0.0015);
    expect(rolled['0'].by_model).toHaveLength(1);
    expect(rolled['0'].by_model[0].tokens).toBe(1500);
  });
});

describe('phaseKeyFromIndex', () => {
  it('maps planning phases', () => {
    expect(phaseKeyFromIndex(null)).toBe('planning');
    expect(phaseKeyFromIndex(-1)).toBe('planning');
    expect(phaseKeyFromIndex(0)).toBe('0');
  });
});

describe('getGoalTokenSummary', () => {
  it('returns hasTokenData false when no rows or persisted totals', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [] }),
          in: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const summary = await getGoalTokenSummary(admin, 'goal-1', { goalData: {}, jobIds: [] });
    expect(summary.hasTokenData).toBe(false);
    expect(summary.totalTokens).toBeNull();
  });

  it('aggregates llm_usage rows by phase', async () => {
    const rows = [
      {
        provider: 'groq', model: 'llama', prompt_tokens: 100, completion_tokens: 50,
        total_tokens: 150, estimated_cost_usd: 0.001,
        metadata: { phase_index: 0 },
      },
      {
        provider: 'anthropic', model: 'haiku', prompt_tokens: 200, completion_tokens: 100,
        total_tokens: 300, estimated_cost_usd: 0.002,
        metadata: { phase_index: -1 },
      },
    ];
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: rows }),
          in: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const summary = await getGoalTokenSummary(admin, 'goal-1', { goalData: {}, jobIds: ['j1'] });
    expect(summary.hasTokenData).toBe(true);
    expect(summary.totalTokens).toBe(450);
    expect(summary.byPhase['0'].tokens).toBe(150);
    expect(summary.byPhase.planning.tokens).toBe(300);
  });
});
