/**
 * Tests for conciliumAnalyticsService — period bucketing + summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({
      select: (...args) => selectMock(...args),
    })),
  },
  hasSupabase: vi.fn().mockReturnValue(true),
}));

import { periodStart, bucketEvaluations, getSummary } from './conciliumAnalyticsService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('periodStart', () => {
  it('floors to start of day for daily', () => {
    expect(periodStart('2026-05-30T14:23:11Z', 'daily')).toBe(
      new Date('2026-05-30T00:00:00').toISOString()
    );
  });
  it('floors to top of hour for hourly', () => {
    const iso = periodStart('2026-05-30T14:23:11Z', 'hourly');
    expect(new Date(iso).getMinutes()).toBe(0);
    expect(new Date(iso).getSeconds()).toBe(0);
  });
  it('floors to first of month for monthly', () => {
    const iso = periodStart('2026-05-30T14:23:11Z', 'monthly');
    expect(new Date(iso).getDate()).toBe(1);
  });
  it('returns null for invalid dates', () => {
    expect(periodStart('not-a-date', 'daily')).toBeNull();
  });
});

describe('bucketEvaluations', () => {
  // Use midday UTC times so each pair lands on the same local day in any
  // reasonable timezone; period_start is stored as a UTC ISO string.
  const evals = [
    {
      created_at: '2026-05-30T12:00:00Z',
      approved: true,
      estimated_cost_usd: '0.01',
      total_tokens: 100,
      overall_score: '8',
    },
    {
      created_at: '2026-05-30T13:00:00Z',
      approved: false,
      estimated_cost_usd: '0.02',
      total_tokens: 200,
      overall_score: '4',
    },
    {
      created_at: '2026-05-20T12:00:00Z',
      approved: true,
      estimated_cost_usd: '0.03',
      total_tokens: 300,
      overall_score: '6',
    },
  ];

  it('groups same-day evaluations into one daily bucket', () => {
    const rows = bucketEvaluations(evals, 'daily');
    expect(rows).toHaveLength(2);
    const busy = rows.find((r) => r.total_evaluations === 2);
    expect(busy).toBeDefined();
    expect(busy.approved_count).toBe(1);
    expect(busy.rejected_count).toBe(1);
    expect(busy.total_tokens).toBe(300);
    expect(busy.total_cost_usd).toBeCloseTo(0.03);
    expect(busy.avg_overall_score).toBeCloseTo(6);
  });

  it('sorts buckets newest first', () => {
    const rows = bucketEvaluations(evals, 'daily');
    expect(new Date(rows[0].period_start) >= new Date(rows[1].period_start)).toBe(true);
  });

  it('filters by board id when provided', () => {
    const tagged = [
      { ...evals[0], board_id: 'b1' },
      { ...evals[1], board_id: 'b2' },
    ];
    const rows = bucketEvaluations(tagged, 'daily', 'b1');
    expect(rows).toHaveLength(1);
    expect(rows[0].total_evaluations).toBe(1);
  });

  it('handles empty input', () => {
    expect(bucketEvaluations([], 'daily')).toEqual([]);
    expect(bucketEvaluations(undefined, 'daily')).toEqual([]);
  });
});

describe('getSummary', () => {
  function mockEvalRows(rows) {
    selectMock.mockReturnValue({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    });
  }

  it('counts only explicit false as rejected (pending excluded)', async () => {
    mockEvalRows([
      { approved: true, overall_score: '8', estimated_cost_usd: '0.01', total_tokens: 100 },
      { approved: false, overall_score: '3', estimated_cost_usd: '0.02', total_tokens: 50 },
      { approved: null, overall_score: '5', estimated_cost_usd: '0.00', total_tokens: 0 },
    ]);
    const summary = await getSummary();
    expect(summary.totalEvaluations).toBe(3);
    expect(summary.approvedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.totalTokens).toBe(150);
  });
});
