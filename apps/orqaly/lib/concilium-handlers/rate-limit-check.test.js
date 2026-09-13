/**
 * Tests for concilium rate limit checker.
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

import { checkConciliumRateLimit } from './rate-limit-check.js';

// ── Helpers ───────────────────────────────────────────────────────

function mockAdmin({ selectData = null, selectError = null, updateError = null, insertError = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        maybeSingle: vi.fn(async () => ({ data: selectData, error: selectError })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
      })),
      insert: vi.fn(async () => ({ error: insertError })),
    })),
  };
}

function makeLimitRecord(overrides = {}) {
  const now = new Date();
  return {
    id: 'test-uuid',
    user_id: 'user-1',
    entity_type: 'board',
    entity_id: 'board-1',
    max_requests_per_hour: 100,
    max_requests_per_day: 1000,
    max_tokens_per_day: 500000,
    max_cost_per_day_usd: '10.0000',
    max_cost_per_month_usd: '100.0000',
    current_requests_hour: 0,
    current_requests_day: 0,
    current_tokens_day: 0,
    current_cost_day_usd: '0.0000',
    current_cost_month_usd: '0.0000',
    hour_reset_at: new Date(now.getTime() + 3600_000).toISOString(),
    day_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
    month_reset_at: new Date(now.getTime() + 30 * 86400_000).toISOString(),
    quarantined: false,
    quarantine_reason: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('checkConciliumRateLimit', () => {
  it('allows when no limit record exists and creates default', async () => {
    const admin = mockAdmin({ selectData: null });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
      userId: 'user-1',
    });

    expect(result.allowed).toBe(true);
    expect(admin.from).toHaveBeenCalled();
  });

  it('allows when under all limits', async () => {
    const admin = mockAdmin({ selectData: makeLimitRecord({ current_requests_hour: 5 }) });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks when hourly request limit exceeded', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ current_requests_hour: 100 }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly request limit');
  });

  it('blocks when daily request limit exceeded', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ current_requests_day: 1000 }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily request limit');
  });

  it('blocks when daily token limit exceeded', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ current_tokens_day: 500000 }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily token limit');
  });

  it('blocks when daily cost limit exceeded', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ current_cost_day_usd: '10.0000' }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily cost limit');
  });

  it('blocks when monthly cost limit exceeded', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ current_cost_month_usd: '100.0000' }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Monthly cost limit');
  });

  it('blocks when entity is quarantined', async () => {
    const admin = mockAdmin({
      selectData: makeLimitRecord({ quarantined: true, quarantine_reason: 'spam detected' }),
    });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('quarantined');
  });

  it('fails open on DB error', async () => {
    const admin = mockAdmin({ selectError: { message: 'connection refused' } });
    const result = await checkConciliumRateLimit(admin, {
      entityType: 'board',
      entityId: 'board-1',
    });

    expect(result.allowed).toBe(true);
  });
});
