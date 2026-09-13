/**
 * Tests for concilium consensus rules handler.
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
import handler from './consensus-rules.js';

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

describe('consensus rules handler', () => {
  it('returns 200 for OPTIONS', async () => {
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

  it('returns 400 without conciliumId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(400);
  });

  it('GET returns existing rules', async () => {
    const rules = { id: 'r1', consensus_type: 'majority', quorum: 3 };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: rules, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { conciliumId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.rules.consensus_type).toBe('majority');
    expect(res._body.exists).toBe(true);
  });

  it('GET returns defaults when no rules exist', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { conciliumId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.exists).toBe(false);
    expect(res._body.rules.consensus_type).toBe('majority');
    expect(res._body.rules.quorum).toBe(2);
  });

  it('PUT upserts consensus rules', async () => {
    const board = { id: 'b1' };
    const upserted = { id: 'r1', consensus_type: 'unanimous', quorum: 5 };
    const fromMock = vi.fn((table) => {
      if (table === 'concilium') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(function () { return this; }),
            maybeSingle: vi.fn(async () => ({ data: board, error: null })),
          })),
        };
      }
      return {
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: upserted, error: null })),
          })),
        })),
      };
    });
    buildSupabaseAdminClient.mockReturnValue({ from: fromMock });
    const res = makeRes();
    await handler(makeReq('PUT', { conciliumId: 'b1' }, {
      consensus_type: 'unanimous',
      quorum: 5,
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.rules.consensus_type).toBe('unanimous');
  });

  it('PUT returns 400 for invalid consensus_type', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { conciliumId: 'b1' }, { consensus_type: 'dictator' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT returns 400 for invalid split_decision_strategy', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { conciliumId: 'b1' }, { split_decision_strategy: 'coin_flip' }), res);
    expect(res._status).toBe(400);
  });

  it('PUT returns 400 for invalid quorum', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { conciliumId: 'b1' }, { quorum: 0 }), res);
    expect(res._status).toBe(400);
  });

  it('PUT returns 404 when board not found', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { conciliumId: 'missing' }, { quorum: 3 }), res);
    expect(res._status).toBe(404);
  });

  it('returns 405 for unsupported methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('DELETE', { conciliumId: 'b1' }), res);
    expect(res._status).toBe(405);
  });
});
