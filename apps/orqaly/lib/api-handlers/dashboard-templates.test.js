/**
 * dashboard-templates endpoint contract tests. Mocks at the boundary (auth,
 * rate-limit, supabase admin client) to exercise routing, per-user scoping,
 * Zod validation and the per-user cap.
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

const { default: handler } = await import('./dashboard-templates.js');

// A thenable builder: awaiting the chain at any point resolves to a combined
// result, while order()/single() act as explicit terminals.
function makeAdmin({ row = { id: 't1' }, rows = [{ id: 't1' }], count = 0, error = null } = {}) {
  const builder = {};
  Object.assign(builder, {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(async () => ({ data: rows, error })),
    single: vi.fn(async () => ({ data: row, error })),
    then: (resolve) => resolve({ data: rows, count, error }),
  });
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
  mocks.buildSupabaseAdminClient.mockReset();
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 59, limit: 60, reset: 0 });
});

describe('dashboard-templates handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, limit: 60, reset: 0 });
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list' } }, res);
    expect(res.statusCode).toBe(429);
  });

  it('list returns the user+surface-scoped rows', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const rows = [{ id: 't1', name: 'Mine', block_order: [], hidden: [] }];
    const { client, builder } = makeAdmin({ rows });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list', surface: 'home' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(rows);
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(builder.eq).toHaveBeenCalledWith('surface', 'home');
  });

  it('create inserts a row scoped to the user with mapped fields', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { id: 't9', name: 'Focus' }, count: 3 });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { op: 'create' },
      body: { name: 'Focus', hidden: ['consilium'], block_order: ['goals', 'activity', 'consilium'], widths: ['goals', 'activity'] },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.insert.mock.calls[0][0]).toMatchObject({
      user_id: 'u1',
      surface: 'home',
      name: 'Focus',
      hidden: ['consilium'],
      block_order: ['goals', 'activity', 'consilium'],
      widths: ['goals', 'activity'],
    });
  });

  it('create rejects an empty name (Zod)', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client } = makeAdmin();
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'create' }, body: { name: '   ' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('create enforces the per-user cap', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ count: 50 });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'create' }, body: { name: 'One more' } }, res);
    expect(res.statusCode).toBe(400);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('update patches by id scoped to the user', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { id: 't1', name: 'Renamed' } });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'update', id: 't1' }, body: { name: 'Renamed' } }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.update.mock.calls[0][0]).toMatchObject({ name: 'Renamed' });
    expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('delete removes by id scoped to the user', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin();
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'delete', id: 't1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: 't1' });
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('rejects an unknown op', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client } = makeAdmin();
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'nope' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});
