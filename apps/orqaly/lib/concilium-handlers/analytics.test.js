/**
 * Tests for concilium analytics handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res, _err, _ctx) => {
    res._status = 500;
    res._body = { error: 'internal' };
    return res;
  }),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { verifySupabaseToken } from '../../api/_lib/auth.js';
import handler from './analytics.js';

// ── Helpers ───────────────────────────────────────────────────────

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

function makeReq(method = 'GET', query = {}, body = {}) {
  return { method, headers: {}, query, body };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('analytics handler', () => {
  it('returns 200 for OPTIONS preflight', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('OPTIONS'), res);
    expect(res._status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for non-GET methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST'), res);
    expect(res._status).toBe(405);
  });

  it('returns 405 for PUT method', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PUT'), res);
    expect(res._status).toBe(405);
  });

  it('returns 405 for DELETE method', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('DELETE'), res);
    expect(res._status).toBe(405);
  });

  it('returns 503 when database not configured', async () => {
    buildSupabaseAdminClient.mockReturnValue(null);
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(503);
  });

  it('GET with summary=true returns cross-board summary', async () => {
    const evaluations = [
      { overall_score: '8.5', approved: true, estimated_cost_usd: '0.05', total_tokens: 1000, created_at: '2026-01-01' },
      { overall_score: '6.0', approved: false, estimated_cost_usd: '0.03', total_tokens: 500, created_at: '2026-01-02' },
    ];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: evaluations, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { summary: 'true' }), res);
    expect(res._status).toBe(200);
    expect(res._body.summary).toBeDefined();
    expect(res._body.summary.totalEvaluations).toBe(2);
    expect(res._body.summary.approvedCount).toBe(1);
    expect(res._body.summary.rejectedCount).toBe(1);
    expect(res._body.summary.avgScore).toBe(7.25);
    expect(res._body.summary.totalTokens).toBe(1500);
  });

  it('GET with summary=true returns zeros when no evaluations exist', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { summary: 'true' }), res);
    expect(res._status).toBe(200);
    expect(res._body.summary.totalEvaluations).toBe(0);
    expect(res._body.summary.avgScore).toBe(0);
  });

  it('GET with boardId returns board analytics', async () => {
    const analytics = [
      { id: 'an1', board_id: 'b1', period_type: 'daily', total_evaluations: 10 },
    ];
    const result = { data: analytics, error: null };
    // After .order().limit(), handler conditionally calls .eq('board_id', boardId).
    // Use a Promise subclass so .eq() chains and await still resolves.
    const chainable = Object.assign(Promise.resolve(result), {
      eq: vi.fn(() => Promise.resolve(result)),
    });
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(() => chainable),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { boardId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.analytics).toEqual(analytics);
    expect(res._body.period).toBe('daily');
  });

  it('GET defaults period to daily', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', {}), res);
    expect(res._status).toBe(200);
    expect(res._body.period).toBe('daily');
  });

  it('GET with valid period=weekly returns analytics', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { period: 'weekly' }), res);
    expect(res._status).toBe(200);
    expect(res._body.period).toBe('weekly');
  });

  it('GET returns 400 for invalid period', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET', { period: 'yearly' }), res);
    expect(res._status).toBe(400);
  });
});
