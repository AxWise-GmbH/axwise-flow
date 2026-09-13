import { describe, it, expect } from 'vitest';
import { toUsage, groupBy, applySearch, buildAgents } from './usage-directory.js';

const u = (over) => ({
  provider: 'openai', model: 'gpt-4o', prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
  cached_tokens: 0, estimated_cost_usd: 0, duration_ms: 0, status: 'ok', created_at: '2026-06-01T00:00:00Z',
  ...over,
});

describe('toUsage', () => {
  it('maps aggregateUsage totals into the directory usage shape', () => {
    const usage = toUsage([
      u({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.01, duration_ms: 200 }),
      u({ prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, estimated_cost_usd: 0.02, status: 'error' }),
    ]);
    expect(usage.calls).toBe(2);
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(usage.totalTokens).toBe(450);
    expect(usage.cost).toBeCloseTo(0.03, 6);
    expect(usage.errorCalls).toBe(1);
  });

  it('returns zeros for no rows', () => {
    expect(toUsage([])).toMatchObject({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 });
  });
});

describe('groupBy', () => {
  it('groups by a key and skips null/empty keys', () => {
    const map = groupBy(
      [{ goal_id: 'g1' }, { goal_id: 'g1' }, { goal_id: 'g2' }, { goal_id: null }, { goal_id: '' }],
      'goal_id',
    );
    expect(map.get('g1')).toHaveLength(2);
    expect(map.get('g2')).toHaveLength(1);
    expect(map.has(null)).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe('applySearch', () => {
  const items = [{ id: 'a1', name: 'Scout' }, { id: 'b2', name: 'Builder' }];
  it('filters by name or id, case-insensitive', () => {
    expect(applySearch(items, 'scout').map((i) => i.id)).toEqual(['a1']);
    expect(applySearch(items, 'B2').map((i) => i.id)).toEqual(['b2']);
  });
  it('returns all items when search is empty', () => {
    expect(applySearch(items, '')).toHaveLength(2);
    expect(applySearch(items, undefined)).toHaveLength(2);
  });
});

describe('buildAgents', () => {
  const usageRows = [
    u({ agent_id: 'a1', agent_name: 'Scout', goal_id: 'g1', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, estimated_cost_usd: 0.01 }),
    u({ agent_id: 'a1', agent_name: 'Scout', goal_id: 'g2', prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, estimated_cost_usd: 0.02 }),
    u({ agent_id: 'a2', agent_name: 'Builder', goal_id: 'g1', prompt_tokens: 50, completion_tokens: 25, total_tokens: 75, estimated_cost_usd: 0.001, status: 'error' }),
    u({ agent_id: null, agent_name: null, goal_id: 'g1', total_tokens: 10 }),
  ];
  const allGoals = [{ id: 'g1', status: 'completed' }, { id: 'g2', status: 'active' }];

  it('rolls up usage per agent_id, names from agent_name, and skips null agents', () => {
    const items = buildAgents(usageRows, allGoals);
    expect(items).toHaveLength(2); // null agent skipped
    const a1 = items.find((i) => i.id === 'a1');
    expect(a1.name).toBe('Scout');
    expect(a1.usage).toMatchObject({ calls: 2, inputTokens: 300, outputTokens: 150, totalTokens: 450 });
    expect(a1.usage.cost).toBeCloseTo(0.03, 6);
    expect(a1.counts).toEqual({ goalsUsedIn: 2, goalsCompleted: 1 }); // g1 completed, g2 active
  });

  it('counts only completed goals for goalsCompleted', () => {
    const a2 = buildAgents(usageRows, allGoals).find((i) => i.id === 'a2');
    expect(a2.counts).toEqual({ goalsUsedIn: 1, goalsCompleted: 1 });
    expect(a2.usage.errorCalls).toBe(1);
  });
});
