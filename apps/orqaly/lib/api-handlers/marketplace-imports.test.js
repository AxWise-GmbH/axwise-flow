/**
 * Tests for the marketplace-imports handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => () => {}),
  }),
}));

const mockUser = { id: 'user-1', email: 't@example.com' };
let authReturns = mockUser;
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => authReturns),
}));

let rateAllowed = true;
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: rateAllowed })),
  getRateLimitIdentifier: vi.fn(() => 'id'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

let store = [];
let lastUpsert = null;
let lastDelete = null;

function buildMockUserClient() {
  function chain() {
    const q = { _eqs: {} };
    const self = {
      from: () => self,
      select: () => self,
      order: () => self,
      eq: (col, val) => {
        q._eqs[col] = val;
        return self;
      },
      upsert: (row) => {
        lastUpsert = row;
        const created = { id: 'row-new', created_at: 't', ...row };
        store.push(created);
        return {
          select: () => ({ maybeSingle: async () => ({ data: created, error: null }) }),
        };
      },
      delete: () => ({
        eq: () => ({
          eq: (col, val) => {
            lastDelete = val;
            return { error: null };
          },
        }),
      }),
      // GET resolves the query as a thenable on the chain.
      then: (resolve) => {
        const rows = store.filter(
          (r) => r.user_id === q._eqs.user_id && (!q._eqs.category || r.category === q._eqs.category),
        );
        resolve({ data: rows, error: null });
      },
    };
    return self;
  }
  return { from: () => chain() };
}

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: () => buildMockUserClient(),
}));

const handler = (await import('./marketplace-imports.js')).default;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
}

beforeEach(() => {
  store = [];
  lastUpsert = null;
  lastDelete = null;
  authReturns = mockUser;
  rateAllowed = true;
});

describe('marketplace-imports handler', () => {
  it('returns 401 without a user', async () => {
    authReturns = null;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    rateAllowed = false;
    const res = mockRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(429);
  });

  it('rejects an invalid category on GET', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { category: 'bogus' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('upserts on POST and lists only the user rows on GET', async () => {
    const postRes = mockRes();
    await handler(
      {
        method: 'POST',
        query: {},
        body: { category: 'agents', sourceId: 'lib-a', name: 'Lib A', items: [{ _id: 'x' }] },
      },
      postRes,
    );
    expect(postRes.statusCode).toBe(200);
    expect(lastUpsert).toMatchObject({ user_id: 'user-1', category: 'agents', source_id: 'lib-a' });
    expect(postRes.body.library).toMatchObject({ sourceId: 'lib-a', name: 'Lib A' });

    const getRes = mockRes();
    await handler({ method: 'GET', query: { category: 'agents' } }, getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.libraries).toHaveLength(1);
  });

  it('rejects an invalid POST body', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: {}, body: { category: 'agents' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('deletes on DELETE with an id', async () => {
    const res = mockRes();
    await handler({ method: 'DELETE', query: { id: 'abc' } }, res);
    expect(res.statusCode).toBe(200);
    expect(lastDelete).toBe('abc');
  });

  it('400 on DELETE without an id', async () => {
    const res = mockRes();
    await handler({ method: 'DELETE', query: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});
