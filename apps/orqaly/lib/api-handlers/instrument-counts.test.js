/**
 * Tests for /api/app?path=instrument-counts
 * Covers: GET shape, auth, rate limit, RLS scoping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));

vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'tok'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  getRateLimitIdentifier: vi.fn(() => 'user:user-1'),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 30, remaining: 29, resetAt: 0 })),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, status, msg) => { res._status = status; res._body = { error: msg }; return res; }),
  handleApiError: vi.fn((res) => { res._status = 500; res._body = { error: 'internal' }; return res; }),
}));

// Per-table counts the mocked Supabase client returns.
const TABLE_COUNTS = {
  knowledge_documents: 42,
  workflows: 8,
  team_tasks: 156,
  projects: 12,
};

let userClientCalledWithToken = null;

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseUserClient: vi.fn((token) => {
    userClientCalledWithToken = token;
    return {
      from: (table) => ({
        select: (_cols, _opts) => Promise.resolve({ count: TABLE_COUNTS[table] ?? 0, error: null }),
      }),
    };
  }),
  buildSupabaseAdminClient: vi.fn(() => null),
}));

import { verifySupabaseToken } from '../../api/_lib/auth.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';
import handler from './instrument-counts.js';

function makeRes() {
  return {
    _status: 200, _body: null, _headers: {},
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
}

function makeReq(method = 'GET') {
  return {
    method,
    headers: { host: 'localhost' },
    url: '/api/app?path=instrument-counts',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userClientCalledWithToken = null;
});

describe('/api/app?path=instrument-counts', () => {
  it('returns 200 with the 4-key counts shape', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      ok: true,
      counts: { knowledge_base: 42, workflow: 8, tasks: 156, projects: 12 },
    });
  });

  it('returns 401 when JWT is missing/invalid', async () => {
    verifySupabaseToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, limit: 30, remaining: 0, resetAt: 0 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res._status).toBe(429);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = makeRes();
    await handler(makeReq('POST'), res);
    expect(res._status).toBe(405);
  });

  it('uses the caller JWT (RLS-scoped, no admin client)', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    // The handler must build a *user* client with the caller's token; this is
    // what enforces RLS. Bypassing this with the admin client would leak rows
    // across tenants.
    expect(buildSupabaseUserClient).toHaveBeenCalledWith('tok');
    expect(userClientCalledWithToken).toBe('tok');
  });
});
