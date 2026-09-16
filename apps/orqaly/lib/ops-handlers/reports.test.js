/**
 * Tests for the reports handler: data isolation (user-scoped cache + user_id
 * stamping) and template validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'ip'),
  applyRateLimitHeaders: vi.fn(),
}));

const inserted = [];
function makeUserClient() {
  return {
    from(table) {
      return {
        select: () => ({
          // strategy snapshots chain .order().limit()
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
          // default thenable resolving to empty data
          then: (resolve) => resolve({ data: [], error: null }),
        }),
        insert: async (row) => {
          inserted.push({ table, row });
          return { error: null };
        },
      };
    },
  };
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn(() => makeUserClient()),
  buildSupabaseAdminClient: vi.fn(() => null), // no historical trends in test
}));

import handler from './reports.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
});
afterEach(() => vi.restoreAllMocks());

describe('reports handler', () => {
  it('rejects unauthenticated requests', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'tpl-finance-growth' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown report type with 400 (no executive masquerade)', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'tpl-bogus' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('stamps user_id on the stored snapshot', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'tpl-finance-growth', refresh: '1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('server');
    const snap = inserted.find((i) => i.table === 'report_snapshots');
    expect(snap).toBeTruthy();
    expect(snap.row.user_id).toBe('user-1');
  });

  it('does not serve one user\'s cached snapshot to another user', async () => {
    // User A populates the cache.
    verifySupabaseToken.mockResolvedValue({ id: 'user-A' });
    const resA = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'tpl-finance-growth' } }, resA);
    expect(resA.body.reportType).toBe('tpl-finance-growth');

    // User B hits the same template+filters within the TTL.
    verifySupabaseToken.mockResolvedValue({ id: 'user-B' });
    const resB = makeRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'tpl-finance-growth' } }, resB);
    expect(resB.statusCode).toBe(200);

    // The user clients must have been built separately (cache key is per-user),
    // i.e. B was not served A's cached payload silently.
    const { buildSupabaseUserClient } = await import('../../api/_lib/supabase-server.js');
    expect(buildSupabaseUserClient).toHaveBeenCalledTimes(2);
  });
});
