/**
 * business-modules endpoint contract tests. Mocks at the boundary (auth,
 * rate-limit, supabase admin client) to exercise routing + activation upserts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  getBearerToken: vi.fn(() => 'token'),
  buildSupabaseAdminClient: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 59, limit: 60, reset: 0 })),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => 'rl'),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => () => undefined }),
}));

vi.mock('../../api/_lib/auth.js', () => ({
  verifySupabaseToken: mocks.verifySupabaseToken,
  getBearerToken: mocks.getBearerToken,
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: mocks.checkRateLimit,
  applyRateLimitHeaders: mocks.applyRateLimitHeaders,
  getRateLimitIdentifier: mocks.getRateLimitIdentifier,
}));
vi.mock('../../api/_lib/logger.js', () => ({ createLogger: mocks.createLogger }));

const { default: handler } = await import('./business-modules.js');

function makeAdmin({ row = { module_id: 'partners', active: true }, rows = [], existing = null } = {}) {
  // Builder is itself awaitable (resolves to the list result) AND chainable,
  // because `list` awaits the builder after `.eq()` while other ops terminate
  // in `.single()` / `.maybeSingle()`.
  const builder = {
    select: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    single: vi.fn(async () => ({ data: row, error: null })),
    then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return { client: { from: vi.fn(() => builder) }, builder };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
}

beforeEach(() => {
  mocks.verifySupabaseToken.mockReset();
  mocks.getBearerToken.mockReturnValue('token');
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 59, limit: 60, reset: 0 });
});

describe('business-modules handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('activate upserts the module active for the user', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { module_id: 'partners', active: true } });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'activate' }, body: { module_id: 'partners' } }, res);
    expect(res.statusCode).toBe(200);
    const upserted = builder.upsert.mock.calls[0][0];
    expect(upserted).toMatchObject({ user_id: 'u1', module_id: 'partners', active: true });
  });

  it('deactivate upserts active=false', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { module_id: 'partners', active: false } });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'deactivate' }, body: { module_id: 'partners' } }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.upsert.mock.calls[0][0].active).toBe(false);
  });

  it('rejects an invalid module_id', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(makeAdmin().client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'activate' }, body: { module_id: 'bad id!' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid op', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.buildSupabaseAdminClient.mockReturnValue(makeAdmin().client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'nope' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
