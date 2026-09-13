import { describe, it, expect } from 'vitest';
import { enrichGoalReportData } from './enrichGoalReport';

describe('enrichGoalReportData', () => {
  it('fills agent spend from tasks when API returns zero', () => {
    const enriched = enrichGoalReportData(
      {
        spent_usd: 0,
        agentBudget: [{ name: 'Frontend Developer', tasks: 1, completed: 1, spent: 0, tokens: 0 }],
        phaseBudget: [{ phaseIndex: 0, phaseName: 'Build', cost: 0, tokens: 0 }],
        tokenSummary: { hasTokenData: false },
      },
      [
        {
          assigned_to: 'Frontend Developer',
          status: 'done',
          data: {
            phase_index: 0,
            llmCost: 0.012,
            llmTotalTokens: 4200,
            llmProvider: 'groq',
            llmModel: 'llama-3.3-70b',
          },
        },
      ]
    );

    expect(enriched.agentBudget[0].spent).toBe(0.012);
    expect(enriched.tokenSummary.hasTokenData).toBe(true);
    expect(enriched.tokenSummary.totalTokens).toBe(4200);
    expect(enriched.phaseBudget[0].cost).toBe(0.012);
    expect(enriched.phaseBudget[0].tokens).toBe(4200);
  });

  it('uses goal spent_usd when higher than task costs', () => {
    const enriched = enrichGoalReportData(
      {
        spent_usd: 0.05,
        agentBudget: [],
        phaseBudget: [{ phaseIndex: -1, phaseName: 'Planning', cost: 0, tokens: 0 }],
        tokenSummary: {},
      },
      [{ assigned_to: 'Agent', status: 'done', data: { phase_index: 0, llmCost: 0.01 } }]
    );
    expect(enriched.spent_usd).toBe(0.05);
    expect(enriched.phaseBudget[0].cost).toBe(0.04);
  });

  it('sets hasLlmInfo when tasks have llmModel but no token counts', () => {
    const enriched = enrichGoalReportData(
      { spent_usd: 0, agentBudget: [], phaseBudget: [], tokenSummary: {} },
      [{ assigned_to: 'Agent', status: 'done', data: { llmModel: 'claude-haiku', llmCost: 0.01 } }]
    );
    expect(enriched.tokenSummary.hasLlmInfo).toBe(true);
    expect(enriched.tokenSummary.hasTokenData).toBe(false);
  });

  it('legacy goal shows zero tokens with tokens_legacy meta on phases', () => {
    const enriched = enrichGoalReportData(
      {
        spent_usd: 0,
        agentBudget: [],
        phaseBudget: [{ phaseIndex: 0, phaseName: 'Build', cost: 0, tokens: 0 }],
        tokenSummary: {},
      },
      [{ assigned_to: 'Agent', status: 'done', data: { phase_index: 0, llmDurationMs: 472300 } }]
    );
    expect(enriched.phaseBudget[0].tokens).toBe(0);
    expect(enriched.phaseBudget[0].metricMeta.tokenReason).toBe('tokens_legacy');
  });

  it('zeros agent tokens when duration mislabeled as tokens from API', () => {
    const enriched = enrichGoalReportData(
      {
        spent_usd: 0,
        agentBudget: [{ name: 'Dev', tasks: 1, completed: 1, spent: 0, tokens: 472300 }],
        phaseBudget: [],
        tokenSummary: {},
      },
      [{ assigned_to: 'Dev', status: 'done', data: { llmDurationMs: 472300 } }]
    );
    expect(enriched.agentBudget[0].tokens).toBe(0);
    expect(enriched.agentBudget[0].metricMeta.tokenReason).toBe('tokens_legacy');
  });
});
