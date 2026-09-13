/**
 * contacts endpoint contract tests. Mocks at the boundary (auth, rate-limit,
 * supabase admin client) to exercise routing + the new organization_id field.
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

const { default: handler } = await import('./contacts.js');

function makeAdmin({ row = { id: 'c1' }, rows = [{ id: 'c1' }], error = null } = {}) {
  const builder = {};
  Object.assign(builder, {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: rows, error })),
    single: vi.fn(async () => ({ data: row, error })),
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
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 59, limit: 60, reset: 0 });
});

describe('contacts handler', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.verifySupabaseToken.mockResolvedValue(null);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('add persists organization_id and contact_type', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { id: 'c1', organization_id: 'org1' } });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { op: 'add' },
      body: { name: 'P. Jackson', email: 'p@acme.io', contact_type: 'mail', organization_id: 'org1' },
    }, res);
    expect(res.statusCode).toBe(200);
    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({ user_id: 'u1', name: 'P. Jackson', contact_type: 'mail', organization_id: 'org1' });
  });

  it('add defaults organization_id to null when omitted', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin();
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'add' }, body: { name: 'No Org' } }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.insert.mock.calls[0][0].organization_id).toBeNull();
  });

  it('update accepts organization_id in the patch', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const { client, builder } = makeAdmin({ row: { id: 'c1', organization_id: 'org2' } });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, query: { op: 'update' }, body: { id: 'c1', organization_id: 'org2' } }, res);
    expect(res.statusCode).toBe(200);
    expect(builder.update.mock.calls[0][0]).toMatchObject({ organization_id: 'org2' });
  });

  it('list returns the user-scoped rows', async () => {
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'u1' });
    const rows = [{ id: 'c1', name: 'A', contact_type: 'mail' }];
    const { client, builder } = makeAdmin({ rows });
    mocks.buildSupabaseAdminClient.mockReturnValue(client);
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, query: { op: 'list' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(rows);
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });
});
