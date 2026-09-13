/**
 * Tests for concilium criteria handler.
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
import handler from './criteria.js';

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

describe('criteria handler', () => {
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

  it('GET lists criteria for a board', async () => {
    const criteria = [{ id: 'c1', name: 'Quality', weight: 0.3 }];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          order: vi.fn(async () => ({ data: criteria, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { conciliumId: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.criteria).toEqual(criteria);
  });

  it('GET returns 400 without conciliumId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(400);
  });

  it('GET single criterion by id', async () => {
    const criterion = { id: 'c1', name: 'Quality' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: criterion, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'c1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.criterion).toEqual(criterion);
  });

  it('POST creates a criterion', async () => {
    const board = { id: 'b1' };
    const created = { id: 'c-new', name: 'Accuracy', weight: 0.25, concilium_id: 'b1' };
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
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: created, error: null })),
          })),
        })),
      };
    });
    buildSupabaseAdminClient.mockReturnValue({ from: fromMock });
    const res = makeRes();
    await handler(makeReq('POST', {}, {
      conciliumId: 'b1',
      name: 'Accuracy',
      weight: 0.25,
      rubric: 'Check factual correctness.',
    }), res);
    expect(res._status).toBe(201);
    expect(res._body.criterion.name).toBe('Accuracy');
  });

  it('POST returns 400 without conciliumId', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { name: 'Test' }), res);
    expect(res._status).toBe(400);
  });

  it('POST returns 400 for invalid weight', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, { conciliumId: 'b1', name: 'Test', weight: 5 }), res);
    expect(res._status).toBe(400);
  });

  it('PUT updates a criterion', async () => {
    const updated = { id: 'c1', name: 'Updated', version: 1 };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: updated, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('PUT', { id: 'c1' }, { name: 'Updated' }), res);
    expect(res._status).toBe(200);
    expect(res._body.criterion.name).toBe('Updated');
  });

  it('PUT increments version when rubric changes', async () => {
    const current = { id: 'c1', version: 2 };
    const updated = { id: 'c1', version: 3, rubric: 'New rubric' };
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        maybeSingle: vi.fn(async () => ({ data: current, error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: updated, error: null })),
        })),
      })),
    }));
    buildSupabaseAdminClient.mockReturnValue({ from: fromMock });
    const res = makeRes();
    await handler(makeReq('PUT', { id: 'c1' }, { rubric: 'New rubric' }), res);
    expect(res._status).toBe(200);
    expect(res._body.criterion.version).toBe(3);
  });

  it('DELETE removes a criterion', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return { eq: vi.fn(async () => ({ error: null })) }; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'c1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(true);
  });

  it('returns 405 for unsupported methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PATCH'), res);
    expect(res._status).toBe(405);
  });
});
