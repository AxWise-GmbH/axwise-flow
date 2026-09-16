import { describe, it, expect } from 'vitest';
import {
  aggregateAgentTokenStats,
  enrichAgentReportMeta,
  getTaskLlmField,
} from './enrichAgentTokenStats';

describe('enrichAgentTokenStats', () => {
  it('reads llm fields from flattened or nested task shape', () => {
    expect(getTaskLlmField({ llmTotalTokens: 500 }, 'llmTotalTokens')).toBe(500);
    expect(getTaskLlmField({ data: { llmTotalTokens: 300 } }, 'llmTotalTokens')).toBe(300);
  });

  it('sums tokens by agent_id', () => {
    const teamTasks = [
      { agent_id: 'a1', llmTotalTokens: 1000, llmCost: 0.01 },
      { agent_id: 'a1', llmTotalTokens: 500, llmCost: 0.005 },
      { agent_id: 'a2', llmTotalTokens: 200, llmCost: 0.002 },
    ];
    const stats = aggregateAgentTokenStats('a1', teamTasks, { taskCount: 2 });
    expect(stats.totalTokens).toBe(1500);
    expect(stats.tokensPerTask).toBe(750);
    expect(stats.totalLlmCost).toBeCloseTo(0.015);
  });

  it('zeroes duration-ms mislabeled tokens with tokens_legacy', () => {
    const teamTasks = [{ agent_id: 'a1', llmDurationMs: 472300, assigned_to: 'Dev' }];
    const stats = aggregateAgentTokenStats('a1', teamTasks, { taskCount: 1 });
    expect(stats.totalTokens).toBe(0);
    expect(stats.metricMeta.tokenReason).toBe('tokens_legacy');
  });

  it('enriches legacy KB report from team_tasks', () => {
    const report = {
      metadata: {
        goal_id: 'g1',
        agent_id: 'a1',
        agent_name: 'QA Tester',
        cost: 0,
        tasks: 1,
        completed: 1,
      },
    };
    const teamTasks = [{ agent_id: 'a1', goal_id: 'g1', llmTotalTokens: 1200, llmCost: 0.003 }];
    const meta = enrichAgentReportMeta(report, teamTasks);
    expect(meta.tokens).toBe(1200);
    expect(meta.cost).toBeCloseTo(0.003);
  });
});
