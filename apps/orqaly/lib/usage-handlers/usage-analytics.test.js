import { describe, it, expect } from 'vitest';
import { aggregateUsage, resolveRange, computeFacets, matchesUsageFilters, computeDivergence } from './usage-analytics.js';

describe('computeDivergence', () => {
  const row = (operation, ax, local, status = 'ok', when = '2026-07-10T00:00:00Z') => ({
    created_at: when,
    operation,
    status,
    metadata: { ax_decision: ax, local_decision: local },
  });

  it('counts AxWise-stricter, local-stricter, and agreement per operation', () => {
    const out = computeDivergence([
      row('agent.generate', 'denied', 'allowed'), // AxWise stricter
      row('copilot.chat', 'allowed', 'block'), // local stricter
      row('agent.generate', 'allowed', 'allowed'), // agree
    ]);
    expect(out.totals.paired).toBe(3);
    expect(out.totals.axStricter).toBe(1);
    expect(out.totals.localStricter).toBe(1);
    expect(out.totals.agree).toBe(1);
    expect(out.diverged).toHaveLength(2);
    const genOp = out.byOperation.find((o) => o.operation === 'agent.generate');
    expect(genOp).toMatchObject({ calls: 2, axStricter: 1, agree: 1 });
  });

  it('ignores rows missing either verdict (not paired) but still counts the call', () => {
    const out = computeDivergence([
      row('copilot.chat', null, 'allow'),
      row('copilot.chat', 'allowed', null),
    ]);
    expect(out.totals.calls).toBe(2);
    expect(out.totals.paired).toBe(0);
    expect(out.diverged).toHaveLength(0);
  });

  it('tallies degraded rows for reliability', () => {
    const out = computeDivergence([
      row('consilium.create', null, null, 'degraded'),
      row('consilium.create', 'allowed', 'allowed', 'ok'),
    ]);
    expect(out.totals.degraded).toBe(1);
    expect(out.byOperation[0].degraded).toBe(1);
  });

  it('treats denied/block/blocked as equivalent block-shaped decisions', () => {
    const out = computeDivergence([row('agent.generate', 'blocked', 'allowed')]);
    expect(out.totals.axStricter).toBe(1);
  });
});

describe('computeFacets', () => {
  it('returns sorted distinct providers/models/sources, ignoring nulls', () => {
    const rows = [
      { provider: 'openai', model: 'gpt-4o', source: 'chat' },
      { provider: 'groq', model: 'llama', source: 'goal' },
      { provider: 'openai', model: 'gpt-4o', source: 'chat' },
      { provider: null, model: null, source: null },
    ];
    expect(computeFacets(rows)).toEqual({
      providers: ['groq', 'openai'],
      models: ['gpt-4o', 'llama'],
      sources: ['chat', 'goal'],
    });
  });
});

describe('matchesUsageFilters', () => {
  const r = { provider: 'openai', model: 'gpt-4o', source: 'chat' };
  it('matches when no filters are set', () => {
    expect(matchesUsageFilters(r, {})).toBe(true);
  });
  it('matches equal provider/model/source', () => {
    expect(matchesUsageFilters(r, { provider: 'openai' })).toBe(true);
    expect(matchesUsageFilters(r, { model: 'gpt-4o', source: 'chat' })).toBe(true);
  });
  it('rejects a non-matching filter', () => {
    expect(matchesUsageFilters(r, { provider: 'groq' })).toBe(false);
    expect(matchesUsageFilters(r, { source: 'goal' })).toBe(false);
  });
});

describe('resolveRange', () => {
  it('treats a missing from as the full window, not the last 30 days', () => {
    const { start, end } = resolveRange(undefined, '2026-06-24');
    const days = (end - start) / 86_400_000;
    expect(days).toBeGreaterThan(300); // ~366, definitely not 30
  });

  it('honors an explicit from', () => {
    const { start } = resolveRange('2026-03-01', '2026-06-24');
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-01');
  });

  it('clamps an over-wide range to the max window', () => {
    const { start, end } = resolveRange('2000-01-01', '2026-06-24');
    const days = (end - start) / 86_400_000;
    expect(days).toBeLessThanOrEqual(366);
  });
});

const rows = [
  { provider: 'openai', model: 'gpt-4o-mini', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cached_tokens: 10, estimated_cost_usd: 0.002, duration_ms: 400, status: 'ok', agent_id: 'a1', agent_name: 'Alice', created_at: '2026-06-01T10:00:00Z' },
  { provider: 'openai', model: 'gpt-4o', prompt_tokens: 200, completion_tokens: 100, total_tokens: 300, cached_tokens: 0, estimated_cost_usd: 0.01, duration_ms: 800, status: 'ok', agent_id: 'a2', agent_name: 'Bob', created_at: '2026-06-01T12:00:00Z' },
  // total_tokens missing -> falls back to prompt+completion (75); status error; no agent
  { provider: 'groq', model: 'llama-3.3-70b-versatile', prompt_tokens: 50, completion_tokens: 25, estimated_cost_usd: 0.0001, duration_ms: 0, status: 'error', created_at: '2026-06-02T09:00:00Z' },
];

describe('aggregateUsage', () => {
  it('returns a zeroed shape for no rows', () => {
    const agg = aggregateUsage([]);
    expect(agg.totals).toMatchObject({
      tokens: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0,
      calls: 0, errorCalls: 0, errorRate: 0, avgDurationMs: 0, p95DurationMs: 0,
    });
    expect(agg.byModel).toEqual([]);
    expect(agg.byProvider).toEqual([]);
    expect(agg.byAgent).toEqual([]);
    expect(agg.timeseries).toEqual([]);
  });

  it('sums totals across rows including cached tokens and token fallback', () => {
    const { totals } = aggregateUsage(rows);
    expect(totals.tokens).toBe(525); // 150 + 300 + (50+25)
    expect(totals.promptTokens).toBe(350);
    expect(totals.completionTokens).toBe(175);
    expect(totals.cachedTokens).toBe(10);
    expect(totals.cost).toBeCloseTo(0.0121, 6);
    expect(totals.calls).toBe(3);
  });

  it('counts non-ok rows toward errorCalls / errorRate', () => {
    const { totals } = aggregateUsage(rows);
    expect(totals.errorCalls).toBe(1);
    expect(totals.errorRate).toBeCloseTo(0.3333, 4);
  });

  it('computes avg and p95 latency from positive durations', () => {
    const { totals } = aggregateUsage(rows);
    expect(totals.avgDurationMs).toBe(400); // (400 + 800 + 0) / 3
    expect(totals.p95DurationMs).toBe(800);
  });

  it('groups by model/provider/agent sorted by cost desc', () => {
    const agg = aggregateUsage(rows);
    expect(agg.byModel.map((m) => m.model)).toEqual(['gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile']);

    const openai = agg.byProvider.find((p) => p.provider === 'openai');
    expect(openai).toMatchObject({ tokens: 450, calls: 2 });
    expect(openai.cost).toBeCloseTo(0.012, 6);

    expect(agg.byAgent[0]).toMatchObject({ agentId: 'a2', agentName: 'Bob', calls: 1 });
    // the row with no agent is bucketed under "Unattributed"
    expect(agg.byAgent.some((a) => a.agentName === 'Unattributed')).toBe(true);
  });

  it('builds an ascending daily timeseries', () => {
    const { timeseries } = aggregateUsage(rows);
    expect(timeseries.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(timeseries[0]).toMatchObject({ calls: 2, tokens: 450 });
  });

  it('includes per-day average latency for the sparkline', () => {
    const { timeseries } = aggregateUsage(rows);
    // Day 1 has two calls at 400ms and 800ms -> avg 600ms.
    expect(timeseries[0].avgDurationMs).toBe(600);
  });
});
