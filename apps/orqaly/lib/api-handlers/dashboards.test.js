/**
 * Tests for /api/app?path=dashboards
 * Covers: auth, rate-limit, CRUD shape, RLS-style ownership check, config validation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => {
    res._status = status;
    res._body = { error: msg };
    return res;
  }),
  handleApiError: vi.fn((res) => {
    res._status = 500;
    res._body = { error: 'internal' };
    return res;
  }),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), startTimer: () => () => {} }),
}));

// Chainable Supabase mock with response queue
let responseQueue = [];
function enqueue(...responses) {
  responseQueue.push(...responses);
}
function nextResponse() {
  if (responseQueue.length === 0) return { data: null, error: null };
  return responseQueue.shift();
}

function makeChain() {
  const promise = new Promise((resolve) => {
    queueMicrotask(() => resolve(nextResponse()));
  });
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    order: () => chain,
    single: () => promise,
    maybeSingle: () => promise,
    then: (resolve, reject) => promise.then(resolve, reject),
  };
  return chain;
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({ from: () => makeChain() })),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './dashboards.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
}

function makeReq(method, query = {}, body = null) {
  return {
    method,
    headers: { host: 'localhost' },
    url: '/api/app?path=dashboards',
    query,
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  responseQueue = [];
});

describe('/api/app?path=dashboards', () => {
  describe('auth', () => {
    it('returns 401 when token is invalid', async () => {
      verifySupabaseToken.mockResolvedValueOnce(null);
      const res = makeRes();
      await handler(makeReq('GET', { op: 'list' }), res);
      expect(res._status).toBe(401);
    });
  });

  describe('rate limit', () => {
    it('returns 429 when rate limited', async () => {
      checkRateLimit.mockReturnValueOnce({
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: 0,
      });
      const res = makeRes();
      await handler(makeReq('GET', { op: 'list' }), res);
      expect(res._status).toBe(429);
    });
  });

  describe('op routing', () => {
    it('returns 400 for unknown op', async () => {
      const res = makeRes();
      await handler(makeReq('GET', { op: 'mystery' }), res);
      expect(res._status).toBe(400);
    });

    it('returns 405 when calling create with GET', async () => {
      const res = makeRes();
      await handler(makeReq('GET', { op: 'create' }), res);
      expect(res._status).toBe(405);
    });

    it('returns 400 when get is called without id', async () => {
      const res = makeRes();
      await handler(makeReq('GET', { op: 'get' }), res);
      expect(res._status).toBe(400);
    });
  });

  describe('create', () => {
    it('returns 400 without title', async () => {
      const res = makeRes();
      await handler(makeReq('POST', { op: 'create' }, {}), res);
      expect(res._status).toBe(400);
    });

    it('rejects invalid config', async () => {
      const res = makeRes();
      await handler(
        makeReq('POST', { op: 'create' }, {
          title: 'x',
          config: { blocks: [{ id: 'b', type: 'invalid_type', title: 't' }] },
        }),
        res
      );
      expect(res._status).toBe(400);
      expect(res._body.error).toMatch(/invalid config/i);
    });

    it('creates with a valid title (config defaults applied)', async () => {
      enqueue({
        data: {
          id: 'd-1',
          owner_user_id: 'user-1',
          title: 'Test',
          description: null,
          config: { version: 1, layout: [], blocks: [], global_filters: {} },
          visibility: 'private',
          is_template: false,
          created_at: '2026-05-16T10:00:00Z',
          updated_at: '2026-05-16T10:00:00Z',
        },
        error: null,
      });
      const res = makeRes();
      await handler(makeReq('POST', { op: 'create' }, { title: 'Test' }), res);
      expect(res._status).toBe(201);
      expect(res._body.title).toBe('Test');
    });
  });

  describe('update', () => {
    it('requires id', async () => {
      const res = makeRes();
      await handler(makeReq('POST', { op: 'update' }, { title: 'x' }), res);
      expect(res._status).toBe(400);
    });

    it('returns 404 when dashboard does not exist', async () => {
      enqueue({ data: null, error: null });
      const res = makeRes();
      await handler(
        makeReq('POST', { op: 'update', id: 'missing' }, { title: 'x' }),
        res
      );
      expect(res._status).toBe(404);
    });

    it('returns 403 when user is not owner and not an editor', async () => {
      enqueue({
        data: { id: 'd-1', owner_user_id: 'someone-else', is_template: false },
        error: null,
      });
      enqueue({ data: null, error: null }); // no share row
      const res = makeRes();
      await handler(
        makeReq('POST', { op: 'update', id: 'd-1' }, { title: 'x' }),
        res
      );
      expect(res._status).toBe(403);
    });
  });

  describe('delete', () => {
    it('requires id', async () => {
      const res = makeRes();
      await handler(makeReq('POST', { op: 'delete' }, {}), res);
      expect(res._status).toBe(400);
    });
  });

  describe('templates', () => {
    it('returns 200 with an array', async () => {
      enqueue({ data: [], error: null });
      const res = makeRes();
      await handler(makeReq('GET', { op: 'templates' }), res);
      expect(res._status).toBe(200);
      expect(Array.isArray(res._body)).toBe(true);
    });
  });
});
