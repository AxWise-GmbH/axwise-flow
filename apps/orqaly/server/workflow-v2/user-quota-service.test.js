import { describe, it, expect, vi } from 'vitest';
import {
  createUserQuotaService,
  calculateCostCents,
  MODEL_PRICING_TABLE,
} from './user-quota-service.js';

describe('user-quota-service', () => {
  it('keeps metering unlimited users after they exceed the ordinary monthly cap', async () => {
    const quotaService = createUserQuotaService({
      defaultMonthlyLimitCents: 10, isUnlimitedUser: async (userId) => userId === 'user-admin',
    });
    for (const userId of ['user-admin', 'user-ordinary']) {
      await quotaService.recordUsage({ userId, model: 'gemini-3.8-flash', completionTokens: 1_000_000 });
    }
    expect(await quotaService.getUsageSummary('user-admin')).toMatchObject({
      allowed: true, isUnlimited: true, planTier: 'internal', limitCents: null, remainingCents: null,
      spendUsd: 3.75, limitUsd: null, remainingUsd: null, tokens: { total: 1_000_000 }, callCount: 1,
    });
    expect(await quotaService.checkQuota('user-ordinary')).toMatchObject({ allowed: false, isUnlimited: false });
    expect((await quotaService.updateUserQuota('user-admin', { isBlocked: true })).allowed).toBe(false);
  });

  it('applies unlimited access to persisted spend without changing the ledger or assigning a large numeric cap', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free', monthly_limit_cents: 500, is_blocked: false, current_spend_cents: '250000.1234' }] })
      .mockResolvedValueOnce({ rows: [{ call_count: 9, total_tokens: '1000000', prompt_tokens: '750000', completion_tokens: '250000' }] }),
    };
    const quotaService = createUserQuotaService({ pool, isUnlimitedUser: async () => true });
    expect(await quotaService.getUsageSummary('user-admin')).toMatchObject({
      allowed: true, isUnlimited: true, limitUsd: null, remainingUsd: null,
      spendUsd: 2500.0012, callCount: 9, tokens: { total: 1_000_000 },
    });
  });

  it('calculates cost correctly using standard model rates', () => {
    // 1,000,000 prompt tokens @ $0.75/1M = $0.75 = 75 cents
    // 1,000,000 completion tokens @ $3.75/1M = $3.75 = 375 cents
    const cost = calculateCostCents('gemini-3.8-flash', 1_000_000, 1_000_000);
    expect(cost).toBe(450.0); // 75 + 375 = 450 cents ($4.50)
  });

  it('credits 75% context caching discount on prompt tokens', () => {
    // 1,000,000 prompt tokens with 800,000 cached tokens (80% cache hit):
    // 800,000 cached @ $0.1875/1M = 15 cents
    // 200,000 uncached @ $0.75/1M = 15 cents
    // input cost = 30 cents (compared to 75 cents uncached)
    const cost = calculateCostCents('gemini-3.8-flash', 1_000_000, 0, 800_000);
    expect(cost).toBe(30.0);
  });

  it('returns cached token statistics and cache hit rate in usage summary', async () => {
    const quotaService = createUserQuotaService({ defaultMonthlyLimitCents: 500 });
    const userId = 'user_test_cache_summary';

    await quotaService.recordUsage({
      userId,
      model: 'gemini-3.8-flash',
      promptTokens: 100_000,
      completionTokens: 1_000,
      cachedTokens: 80_000,
    });

    const summary = await quotaService.getUsageSummary(userId);
    expect(summary.tokens.prompt).toBe(100_000);
    expect(summary.tokens.cached).toBe(80_000);
    expect(summary.tokens.cacheHitRate).toBe(80.0);
    expect(summary.savingsUsd).toBeGreaterThan(0);
  });

  it('enforces monthly quota limits in memory', async () => {
    const quotaService = createUserQuotaService({ defaultMonthlyLimitCents: 10 }); // 10 cents limit
    const userId = 'user_test_quota_1';

    // 1. Initial check - allowed with zero spend
    const initial = await quotaService.checkQuota(userId);
    expect(initial.allowed).toBe(true);
    expect(initial.spendCents).toBe(0);
    expect(initial.limitCents).toBe(10);
    expect(initial.remainingCents).toBe(10);

    // 2. Record small usage (10,000 prompt tokens @ $0.75/1M = 0.75 cents)
    await quotaService.recordUsage({
      userId,
      model: 'gemini-3.8-flash',
      promptTokens: 10_000,
      completionTokens: 0,
    });

    const mid = await quotaService.checkQuota(userId);
    expect(mid.allowed).toBe(true);
    expect(mid.spendCents).toBeCloseTo(0.75, 2);
    expect(mid.remainingCents).toBeCloseTo(9.25, 2);

    // 3. Record large usage exceeding 10 cents limit (50,000 completion tokens @ $3.75/1M = 18.75 cents)
    await quotaService.recordUsage({
      userId,
      model: 'gemini-3.8-flash',
      promptTokens: 0,
      completionTokens: 50_000,
    });

    const exceeded = await quotaService.checkQuota(userId);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.remainingCents).toBe(0);
  });

  it('generates usage summary with token totals and pricing catalog', async () => {
    const quotaService = createUserQuotaService({ defaultMonthlyLimitCents: 500 });
    const userId = 'user_test_summary';

    await quotaService.recordUsage({
      userId,
      model: 'gemini-3.8-flash',
      promptTokens: 20_000,
      completionTokens: 5_000,
    });

    const summary = await quotaService.getUsageSummary(userId);
    expect(summary.userId).toBe(userId);
    expect(summary.planTier).toBe('free');
    expect(summary.tokens.prompt).toBe(20_000);
    expect(summary.tokens.completion).toBe(5_000);
    expect(summary.tokens.total).toBe(25_000);
    expect(summary.callCount).toBe(1);
    expect(summary.spendUsd).toBeGreaterThan(0);
    expect(summary.pricing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: 'gemini-3.8-flash', inputPerMillionUsd: 0.75 }),
      ])
    );
  });

  it('queries postgres pool when provided', async () => {
    const mockPool = {
      query: vi.fn(),
    };
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // insert quota
      .mockResolvedValueOnce({
        rows: [{
          plan_tier: 'pro',
          monthly_limit_cents: 2500,
          is_blocked: false,
          current_spend_cents: '124.5000',
        }],
      });

    const quotaService = createUserQuotaService({ pool: mockPool });
    const res = await quotaService.checkQuota('user_pg_test');

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(res.allowed).toBe(true);
    expect(res.planTier).toBe('pro');
    expect(res.limitCents).toBe(2500);
    expect(res.spendCents).toBe(124.5);
    expect(res.remainingCents).toBe(2375.5);
  });

  it('updates user quota limits and tier', async () => {
    const quotaService = createUserQuotaService({ defaultMonthlyLimitCents: 500 });
    const userId = 'user_update_quota_test';

    const updated = await quotaService.updateUserQuota(userId, {
      monthlyLimitCents: 2000,
      planTier: 'pro',
      isBlocked: false,
    });

    expect(updated.limitCents).toBe(2000);
    expect(updated.planTier).toBe('pro');
    expect(updated.allowed).toBe(true);

    // test blocking
    const blocked = await quotaService.updateUserQuota(userId, {
      isBlocked: true,
    });
    expect(blocked.allowed).toBe(false);
  });
});
