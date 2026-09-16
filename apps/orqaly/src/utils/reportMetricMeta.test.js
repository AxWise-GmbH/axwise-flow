import { describe, it, expect } from 'vitest';
import {
  getMetricInfo,
  resolvePhaseMetricMeta,
  isLikelyDurationAsTokens,
} from './reportMetricMeta';

describe('reportMetricMeta', () => {
  it('returns popup copy for tokens_legacy', () => {
    const info = getMetricInfo('tokens_legacy');
    expect(info?.title).toBe('Tokens not tracked');
    expect(info?.body).toMatch(/not stored when this goal executed/i);
  });

  it('flags duration mislabeled as tokens', () => {
    expect(isLikelyDurationAsTokens([{ data: { llmDurationMs: 472300 } }])).toBe(true);
    expect(
      isLikelyDurationAsTokens([{ data: { llmTotalTokens: 100, llmDurationMs: 472300 } }])
    ).toBe(false);
  });

  it('assigns tokens_orphan when goal has orphan tokens', () => {
    const meta = resolvePhaseMetricMeta({
      phaseIndex: 0,
      cost: 0,
      tokens: 0,
      phaseTasks: [],
      goalHasOrphanTokens: true,
      isLegacyGoal: true,
    });
    expect(meta.tokenReason).toBe('tokens_orphan');
    expect(meta.costReason).toBe('cost_legacy');
  });
});
