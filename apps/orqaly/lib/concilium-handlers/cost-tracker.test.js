/**
 * Tests for concilium cost tracker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

import { recordUsage } from './cost-tracker.js';

// ── Helpers ───────────────────────────────────────────────────────

function makeLimitRecord(overrides = {}) {
  const now = new Date();
  return {
    id: 'limit-uuid',
    user_id: 'user-1',
    entity_type: 'board',
    entity_id: 'board-1',
    max_requests_per_hour: 100,
    max_requests_per_day: 1000,
    max_tokens_per_day: 500000,
    max_cost_per_day_usd: '10.0000',
    max_cost_per_month_usd: '100.0000',
    current_requests_hour: 5,
    current_requests_day: 50,
    current_tokens_day: 10000,
    current_cost_day_usd: '1.0000',
    current_cost_month_usd: '20.0000',
    hour_reset_at: new Date(now.getTime() + 3600_000).toISOString(),
    day_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
    month_reset_at: new Date(now.getTime() + 30 * 86400_000).toISOString(),
    quarantined: false,
    ...overrides,
  };
}

function mockAdmin({ selectData = null, selectError = null, updateError = null } = {}) {
  const updateMock = vi.fn(() => ({
    eq: vi.fn(function () { return { error: updateError }; }),
  }));

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        maybeSingle: vi.fn(async () => ({ data: selectData, error: selectError })),
      })),
      update: updateMock,
    })),
    _updateMock: updateMock,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('recordUsage', () => {
  it('increments counters after usage', async () => {
    const limit = makeLimitRecord();
    const admin = mockAdmin({ selectData: limit });

    const result = await recordUsage(admin, {
      entityType: 'board',
      entityId: 'board-1',
      tokensUsed: 500,
      costUsd: 0.005,
    });

    expect(result.updated).toBe(true);
    expect(result.overBudget).toBe(false);
  });

  it('returns not updated when no limit record exists', async () => {
    const admin = mockAdmin({ selectData: null });

    const result = await recordUsage(admin, {
      entityType: 'board',
      entityId: 'board-1',
      tokensUsed: 500,
      costUsd: 0.005,
    });

    expect(result.updated).toBe(false);
    expect(result.overBudget).toBe(false);
  });

  it('detects over-budget after recording usage', async () => {
    const limit = makeLimitRecord({
      current_requests_hour: 99, // Will become 100 = at limit
      max_requests_per_hour: 100,
    });
    const admin = mockAdmin({ selectData: limit });

    const result = await recordUsage(admin, {
      entityType: 'board',
      entityId: 'board-1',
      tokensUsed: 100,
      costUsd: 0.001,
    });

    expect(result.updated).toBe(true);
    expect(result.overBudget).toBe(true);
    expect(result.reason).toContain('Hourly requests');
  });

  it('detects monthly cost over-budget', async () => {
    const limit = makeLimitRecord({
      current_cost_month_usd: '99.9900',
      max_cost_per_month_usd: '100.0000',
    });
    const admin = mockAdmin({ selectData: limit });

    const result = await recordUsage(admin, {
      entityType: 'user',
      entityId: 'user-1',
      tokensUsed: 1000,
      costUsd: 0.02, // This pushes over $100
    });

    expect(result.updated).toBe(true);
    expect(result.overBudget).toBe(true);
    expect(result.reason).toContain('Monthly cost');
  });

  it('handles DB fetch error gracefully', async () => {
    const admin = mockAdmin({ selectError: { message: 'connection refused' } });

    const result = await recordUsage(admin, {
      entityType: 'board',
      entityId: 'board-1',
      tokensUsed: 500,
      costUsd: 0.005,
    });

    expect(result.updated).toBe(false);
    expect(result.overBudget).toBe(false);
  });

  it('resets expired hour period before incrementing', async () => {
    const limit = makeLimitRecord({
      current_requests_hour: 90,
      hour_reset_at: new Date(Date.now() - 1000).toISOString(), // expired
    });
    const admin = mockAdmin({ selectData: limit });

    const result = await recordUsage(admin, {
      entityType: 'board',
      entityId: 'board-1',
      tokensUsed: 100,
      costUsd: 0.001,
    });

    // Hour was reset to 0 before incrementing, so should be 1 now (not 91)
    expect(result.updated).toBe(true);
    expect(result.overBudget).toBe(false);
  });
});
