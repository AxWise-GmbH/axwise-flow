/**
 * Tests for concilium boards handler.
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
import handler from './boards.js';

// ── Helpers ───────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
  return res;
}

function makeReq(method = 'GET', query = {}, body = {}) {
  return { method, headers: {}, query, body };
}

function mockAdmin({ selectData = [], selectSingle = null, insertData = null, updateData = null, error = null } = {}) {
  buildSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        order: vi.fn(function () { return this; }),
        maybeSingle: vi.fn(async () => ({ data: selectSingle, error })),
        then: vi.fn(async (cb) => cb({ data: selectData, error })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: insertData, error })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: updateData, error })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(function () { return this; }),
      })),
    })),
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────

describe('boards handler', () => {
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

  it('returns 405 for unsupported methods', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PATCH'), res);
    expect(res._status).toBe(405);
  });

  it('returns 503 when database not configured', async () => {
    buildSupabaseAdminClient.mockReturnValue(null);
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(503);
  });

  it('GET returns boards list', async () => {
    const boards = [{ id: 'b1', name: 'Test Board' }];
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: boards, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body.boards).toEqual(boards);
  });

  it('GET with id returns single board', async () => {
    const board = { id: 'b1', name: 'Test Board' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: board, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.board).toEqual(board);
  });

  it('GET with unknown id returns 404', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function () { return this; }),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('GET', { id: 'missing' }), res);
    expect(res._status).toBe(404);
  });

  it('POST creates a board', async () => {
    const created = { id: 'b-new', name: 'New Board' };
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: created, error: null })),
          })),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('POST', {}, { name: 'New Board' }), res);
    expect(res._status).toBe(201);
    expect(res._body.board.name).toBe('New Board');
  });

  it('POST returns 400 when name is missing', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('POST', {}, {}), res);
    expect(res._status).toBe(400);
  });

  it('PUT updates a board', async () => {
    const updated = { id: 'b1', name: 'Updated' };
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
    await handler(makeReq('PUT', { id: 'b1' }, { name: 'Updated' }), res);
    expect(res._status).toBe(200);
    expect(res._body.board.name).toBe('Updated');
  });

  it('PUT returns 400 when id is missing', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('PUT', {}, { name: 'x' }), res);
    expect(res._status).toBe(400);
  });

  it('DELETE removes a board', async () => {
    buildSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function () { return { eq: vi.fn(async () => ({ error: null })) }; }),
        })),
      })),
    });
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'b1' }), res);
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(true);
  });

  it('DELETE returns 400 when id is missing', async () => {
    buildSupabaseAdminClient.mockReturnValue({});
    const res = makeRes();
    await handler(makeReq('DELETE'), res);
    expect(res._status).toBe(400);
  });
});
